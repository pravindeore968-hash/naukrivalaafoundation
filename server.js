const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const validator = require("validator");
const axios = require("axios");
const path = require("path");
const { Resend } = require("resend");
require("dotenv").config();

const app = express();

app.set("trust proxy", 1);

// ✅ PERFECT CORS - This will fix everything!
app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

// Express middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
});

const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: "Too many payment requests, please try again later.",
});

app.use(generalLimiter);

// PhonePe V2 Configuration
const PHONEPE_CONFIG = {
  clientId: process.env.PHONEPE_CLIENT_ID,
  clientVersion: process.env.PHONEPE_CLIENT_VERSION,
  clientSecret: process.env.PHONEPE_CLIENT_SECRET,
  merchantId: process.env.PHONEPE_MERCHANT_ID,
  saltKey: process.env.PHONEPE_SALT_KEY,
  saltIndex: process.env.PHONEPE_SALT_INDEX || "1",
  env: process.env.PHONEPE_ENV || "PROD",
};

// PhonePe V2 URLs
const PHONEPE_URLS = {
  UAT: {
    token: "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token",
    payment: "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay",
    status: "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order",
  },
  PROD: {
    token: "https://api.phonepe.com/apis/identity-manager/v1/oauth/token",
    payment: "https://api.phonepe.com/apis/pg/checkout/v2/pay",
    status: "https://api.phonepe.com/apis/pg/checkout/v2/order",
  },
};

// MongoDB connection (SIMPLIFIED - FIXED)
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", (error) => {
  console.error("❌ MongoDB connection error:", error.message);
  console.error("💡 Check if Render IPs are whitelisted in MongoDB Atlas");
});
db.once("open", () => {
  console.log("✅ Connected to MongoDB");
  fixDatabaseIndexes();
});
db.on("disconnected", () => {
  console.log("📡 MongoDB disconnected. Attempting to reconnect...");
});

// Schemas
const applicationSchema = new mongoose.Schema({
  applicationId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  dob: { type: Date, required: true },
  gender: {
    type: String,
    required: true,
    enum: ["Male", "Female", "Other"], // ✅ Simplified without Hindi characters
  },
  category: { type: String, required: true },
  school: { type: String, required: true },
  state: { type: String, required: true },
  district: { type: String, required: true },
  pincode: { type: String, required: true },
  address: { type: String, required: true },
  income_amount: { type: Number, required: true },
  income_band: { type: String, required: true },
  achievements: { type: String, required: true },
  recommendation: { type: String, required: true },
  sop: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "paid", "approved", "rejected"],
    default: "pending",
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
  paymentOrderId: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const paymentSchema = new mongoose.Schema({
  applicationId: { type: String, required: true },
  merchantOrderId: { type: String, required: true, unique: true },
  phonePeOrderId: { type: String },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["initiated", "pending", "completed", "failed"],
    default: "initiated",
  },
  phonePeResponse: { type: Object },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

async function fixDatabaseIndexes() {
  try {
    // Check if payments collection exists first
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    const collectionNames = collections.map((col) => col.name);

    // Create payments collection if it doesn't exist
    if (!collectionNames.includes("payments")) {
      await mongoose.connection.db.createCollection("payments");
    }

    // Get the payments collection
    const paymentsCollection = mongoose.connection.db.collection("payments");

    // Get existing indexes
    const indexes = await paymentsCollection.indexes();

    // Drop old problematic index if it exists
    try {
      await paymentsCollection.dropIndex("merchantTransactionId_1");
    } catch (error) {
      if (error.code === 27) {
        console.log("✅ Old index doesn't exist - no need to drop");
      } else {
        console.log("⚠️ Error dropping index:", error.message);
      }
    }

    // Create new indexes
    await paymentsCollection.createIndex(
      { merchantOrderId: 1 },
      { unique: true },
    );

    await paymentsCollection.createIndex({ applicationId: 1, status: 1 });

    await paymentsCollection.createIndex({ status: 1, createdAt: -1 });
  } catch (error) {
    console.error("❌ Error fixing database indexes:", error.message);
    // Don't crash the server if index creation fails
    console.log("⚠️ Continuing without custom indexes...");
  }
}

// Indexes
applicationSchema.index({ email: 1, phone: 1 });
applicationSchema.index({ status: 1, createdAt: -1 });
applicationSchema.index({ paymentStatus: 1, createdAt: -1 });
applicationSchema.index({ applicationId: 1 }, { unique: true });

paymentSchema.index({ merchantOrderId: 1 }, { unique: true });
paymentSchema.index({ applicationId: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });

const Application = mongoose.model("Application", applicationSchema);
const Payment = mongoose.model("Payment", paymentSchema);

// ✅ Resend Configuration
let resend = null;

if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log("✅ Resend API configured successfully!");
} else {
  console.warn("⚠️ Resend API key not configured");
}

// Token cache
let tokenCache = {
  token: null,
  expiresAt: 0,
};

// OAuth V2 Token Generation
async function generateAuthToken() {
  try {
    // Check cache first
    if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) {
      console.log("🔄 Using cached token");
      return tokenCache.token;
    }

    const tokenEndpoint = PHONEPE_URLS[PHONEPE_CONFIG.env].token;

    // ✅ Create Basic Authentication Header
    const credentials = `${PHONEPE_CONFIG.clientId}:${PHONEPE_CONFIG.clientSecret}`;
    const basicAuth = Buffer.from(credentials).toString("base64");

    // Prepare request body
    const requestBodyJson = {
      client_version: PHONEPE_CONFIG.clientVersion,
      grant_type: "client_credentials",
      client_id: PHONEPE_CONFIG.clientId,
      client_secret: PHONEPE_CONFIG.clientSecret,
    };

    const requestBody = new URLSearchParams(requestBodyJson).toString();

    console.log("🔑 Requesting token from:", tokenEndpoint);

    // Make token request with Basic Auth
    const response = await axios.post(tokenEndpoint, requestBody, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`, // ← THIS IS THE FIX!
      },
      timeout: 30000,
    });

    // Validate and cache token
    if (response.data && response.data.access_token) {
      tokenCache.token = response.data.access_token;
      tokenCache.expiresAt = response.data.expires_at * 1000;

      console.log("✅ Token generated successfully");
      console.log(
        "⏰ Expires:",
        new Date(tokenCache.expiresAt).toLocaleString(),
      );

      return response.data.access_token;
    } else {
      throw new Error(
        "Invalid token response: " + JSON.stringify(response.data),
      );
    }
  } catch (error) {
    console.error("❌ Token generation failed:");
    console.error("  URL:", PHONEPE_URLS[PHONEPE_CONFIG.env]?.token);
    console.error("  Status:", error.response?.status);
    console.error("  Data:", JSON.stringify(error.response?.data));
    console.error("  Message:", error.message);

    // Clear cache on error
    tokenCache.token = null;
    tokenCache.expiresAt = 0;

    throw new Error(
      `OAuth token generation failed: ${error.response?.data?.message || error.message}`,
    );
  }
}

// Utility functions
function sanitizeInput(req, res, next) {
  if (req.body) {
    for (let key in req.body) {
      if (typeof req.body[key] === "string") {
        req.body[key] = req.body[key].trim();
        // Handle empty strings
        if (req.body[key] === "") {
          req.body[key] = undefined;
        }
      }
    }
  }
  next();
}

function validateEmail(email) {
  return validator.isEmail(email);
}

function validatePhoneNumber(phone) {
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(phone);
}

function validateApplicationData(data) {
  const errors = [];

  // ✅ Add null/undefined checks before validation
  if (!data.name?.trim()) errors.push("Name is required");
  if (!data.email?.trim()) errors.push("Email is required");
  if (data.email && !validateEmail(data.email.trim()))
    errors.push("Invalid email format");
  if (!data.phone?.trim()) errors.push("Phone number is required");
  if (data.phone && !validatePhoneNumber(data.phone.trim()))
    errors.push("Invalid Indian phone number");
  if (!data.dob) errors.push("Date of birth is required");
  if (!data.gender?.trim()) errors.push("Gender is required");
  if (!data.category?.trim()) errors.push("Class/Course is required");
  if (!data.school?.trim()) errors.push("School/College name is required");
  if (!data.state?.trim()) errors.push("State is required");
  if (!data.district?.trim()) errors.push("District is required");
  if (!data.pincode?.trim()) errors.push("Pincode is required");
  if (!data.address?.trim()) errors.push("Address is required");
  if (!data.income_amount) errors.push("Family income is required");
  if (!data.income_band?.trim()) errors.push("Income band is required");
  if (!data.achievements?.trim()) errors.push("Achievements are required");
  if (!data.recommendation?.trim()) errors.push("Recommendation is required");
  if (!data.sop?.trim()) errors.push("Statement of purpose is required");
  if (data.sop && data.sop.length < 50)
    errors.push("Statement of purpose must be at least 50 characters");

  return errors;
}

async function checkDuplicatePayment(applicationId, timeWindowMinutes = 30) {
  const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

  const existingPayment = await Payment.findOne({
    applicationId,
    status: { $in: ["completed"] },
    createdAt: { $gte: cutoffTime },
  });

  return existingPayment;
}

async function sendConfirmationEmail(application, orderId) {
  if (!resend) {
    console.log("❌ Resend not configured, skipping confirmation email");
    return false;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `${process.env.EMAIL_FROM_NAME || "Naukrivalaa Foundation"} <${process.env.EMAIL_FROM || "onboarding@resend.dev"}>`,
      to: [application.email],
      reply_to: process.env.REPLY_TO_EMAIL || "naukrivalaafoundation@gmail.com",
      subject:
        "🎉 Scholarship Application Successfully Submitted - Naukrivalaa Foundation",
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Scholarship Application Confirmed</title>
            <style>
                body {
                    font-family: 'Georgia', 'Times New Roman', serif;
                    line-height: 1.8;
                    color: #333;
                    background: #f8f9fa;
                    margin: 0;
                    padding: 0;
                }
                .email-container {
                    max-width: 650px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 15px;
                    overflow: hidden;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                }
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 40px 30px;
                    text-align: center;
                    position: relative;
                }
                .header::after {
                    content: '';
                    position: absolute;
                    bottom: -10px;
                    left: 0;
                    right: 0;
                    height: 20px;
                    background: white;
                    border-radius: 50% 50% 0 0 / 20px 20px 0 0;
                }
                .logo {
                    font-size: 32px;
                    font-weight: bold;
                    margin-bottom: 10px;
                }
                .header-subtitle {
                    font-size: 16px;
                    opacity: 0.9;
                    margin: 0;
                }
                .content {
                    padding: 40px 30px;
                }
                .success-banner {
                    background: linear-gradient(45deg, #28a745, #20c997);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    text-align: center;
                    margin-bottom: 30px;
                    font-size: 18px;
                    font-weight: bold;
                }
                .greeting {
                    font-size: 18px;
                    color: #2c3e50;
                    margin-bottom: 20px;
                }
                .details-section {
                    background: #f8f9fa;
                    border: 2px solid #e9ecef;
                    border-radius: 12px;
                    padding: 25px;
                    margin: 25px 0;
                }
                .details-title {
                    color: #495057;
                    font-size: 20px;
                    font-weight: bold;
                    margin-bottom: 15px;
                    border-bottom: 2px solid #667eea;
                    padding-bottom: 8px;
                }
                .details-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 15px;
                    margin-top: 15px;
                }
                .detail-item {
                    background: white;
                    padding: 12px;
                    border-radius: 8px;
                    border-left: 4px solid #667eea;
                }
                .detail-label {
                    font-weight: bold;
                    color: #6c757d;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .detail-value {
                    color: #2c3e50;
                    font-size: 14px;
                    margin-top: 2px;
                }
                .next-steps {
                    background: linear-gradient(135deg, #ffeaa7, #fdcb6e);
                    border-radius: 12px;
                    padding: 25px;
                    margin: 25px 0;
                }
                .next-steps h3 {
                    color: #d63031;
                    margin-top: 0;
                    font-size: 18px;
                }
                .timeline {
                    list-style: none;
                    padding: 0;
                }
                .timeline li {
                    padding: 10px 0;
                    border-left: 3px solid #667eea;
                    padding-left: 20px;
                    margin: 10px 0;
                    position: relative;
                }
                .timeline li::before {
                    content: '✓';
                    position: absolute;
                    left: -8px;
                    background: #28a745;
                    color: white;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    font-weight: bold;
                }
                .contact-section {
                    background: #e9ecef;
                    border-radius: 12px;
                    padding: 25px;
                    text-align: center;
                    margin: 25px 0;
                }
                .contact-title {
                    color: #495057;
                    font-size: 18px;
                    margin-bottom: 15px;
                }
                .contact-details {
                    display: flex;
                    justify-content: space-around;
                    flex-wrap: wrap;
                    gap: 15px;
                }
                .contact-item {
                    background: white;
                    padding: 15px;
                    border-radius: 8px;
                    flex: 1;
                    min-width: 200px;
                }
                .footer {
                    background: #2c3e50;
                    color: white;
                    padding: 30px;
                    text-align: center;
                }
                .footer-logo {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 10px;
                }
                .footer-text {
                    opacity: 0.8;
                    line-height: 1.6;
                }
                .social-links {
                    margin: 20px 0;
                }
                .social-links a {
                    color: white;
                    text-decoration: none;
                    margin: 0 10px;
                    font-size: 16px;
                }
                @media (max-width: 600px) {
                    .details-grid { grid-template-columns: 1fr; }
                    .contact-details { flex-direction: column; }
                    .header, .content { padding: 20px; }
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <!-- Header -->
                <div class="header">
                    <div class="logo">🎓 NAUKRIVALAA FOUNDATION</div>
                    <p class="header-subtitle">Empowering Education • Building Futures • Creating Opportunities</p>
                </div>

                <!-- Content -->
                <div class="content">
                    <div class="success-banner">
                        🎉 CONGRATULATIONS! Your Scholarship Application Has Been Successfully Submitted!
                    </div>

                    <div class="greeting">
                        Dear <strong>${application.name}</strong>,
                    </div>

                    <p>We are thrilled to inform you that your scholarship application has been <strong>successfully received and processed</strong>. Your payment of <strong>₹99</strong> has been confirmed, and your application is now officially under review by our scholarship committee.</p>

                    <!-- Application Details -->
                    <div class="details-section">
                        <div class="details-title">📋 Your Application Summary</div>
                        <div class="details-grid">
                            <div class="detail-item">
                                <div class="detail-label">Application ID</div>
                                <div class="detail-value"><strong>${application.applicationId}</strong></div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Payment Order ID</div>
                                <div class="detail-value">${orderId}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Category Applied</div>
                                <div class="detail-value">${application.category}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Institution</div>
                                <div class="detail-value">${application.school}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">State</div>
                                <div class="detail-value">${application.state}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Application Fee</div>
                                <div class="detail-value">₹99 (Paid ✓)</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Submission Date</div>
                                <div class="detail-value">${new Date(
                                  application.createdAt,
                                ).toLocaleDateString("en-IN", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Status</div>
                                <div class="detail-value"><strong style="color: #28a745;">Under Review</strong></div>
                            </div>
                        </div>
                    </div>

                    <!-- Next Steps -->
                    <div class="next-steps">
                        <h3>📅 What Happens Next? - Complete Timeline</h3>
                        <ul class="timeline">
                            <li><strong>Week 1:</strong> Application verification and document review</li>
                            <li><strong>Week 2-3:</strong> Academic performance evaluation and eligibility assessment</li>
                            <li><strong>Week 4:</strong> Financial need analysis and background verification</li>
                            <li><strong>Week 5-6:</strong> Scholarship committee review and candidate shortlisting</li>
                            <li><strong>Week 7:</strong> Final selection and award notifications</li>
                            <li><strong>Week 8:</strong> Scholarship disbursement process begins for selected candidates</li>
                        </ul>
                        <p><strong>📞 Important:</strong> Selected candidates will be contacted via phone call first, followed by official email notification.</p>
                    </div>

                    <!-- Important Information -->
                    <div class="details-section">
                        <div class="details-title">⚠️ Important Information</div>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li>Keep this email for your records - you may need your Application ID for future reference</li>
                            <li>Check your email regularly (including spam/junk folders) for updates</li>
                            <li>Ensure your phone number <strong>${application.phone}</strong> is active and reachable</li>
                            <li>Do not apply multiple times - duplicate applications will be rejected</li>
                            <li>Scholarship results will be announced within 6-8 weeks from submission</li>
                            <li>For any queries, contact us using the details provided below</li>
                        </ul>
                    </div>

                    <!-- Scholarship Information -->
                    <div class="details-section">
                        <div class="details-title">🏆 About Naukrivalaa Foundation Scholarship</div>
                        <p>The Naukrivalaa Foundation Scholarship Program aims to support deserving students from various educational backgrounds. Our mission is to remove financial barriers and empower students to achieve their academic dreams.</p>
                        <p><strong>Scholarship Benefits May Include:</strong></p>
                        <ul>
                            <li>💰 Financial assistance for tuition fees</li>
                            <li>📚 Educational material allowance</li>
                            <li>💻 Technology support for online learning</li>
                            <li>👨‍🏫 Mentorship and career guidance</li>
                            <li>🌟 Recognition and certification</li>
                        </ul>
                    </div>
                </div>

                <!-- Contact Section -->
                <div class="contact-section">
                    <div class="contact-title">📞 Need Help? We're Here for You!</div>
                    <div class="contact-details">
                        <div class="contact-item">
                            <strong>📧 Email Support</strong><br>
                            contact@naukrivalaafoundation.com<br>
                            <em>Response within 24 hours</em>
                        </div>
                        <div class="contact-item">
                            <strong>🌐 Website</strong><br>
                            www.naukrivalaafoundation.com<br>
                            <em>Visit for updates & FAQs</em>
                        </div>
                        <div class="contact-item">
                            <strong>📱 Phone Support</strong><br>
                            +91-9356625834<br>
                            <em>WhatsApp only</em>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="footer">
                    <div class="footer-logo">🎓 NAUKRIVALAA FOUNDATION</div>
                    <div class="footer-text">
                        <p><strong>Empowering Dreams • Building Futures • Creating Impact</strong></p>
                        <p>Thank you for trusting us with your educational journey. We believe in your potential and are committed to supporting your academic success.</p>
                        
                        <div class="social-links">
                            <a href="#">📘 Facebook</a> |
                            <a href="#">📷 Instagram</a> |
                            <a href="#">🐦 Twitter</a> |
                            <a href="#">💼 LinkedIn</a>
                        </div>
                        
                        <p style="font-size: 12px; opacity: 0.7; margin-top: 20px;">
                            This is an automated confirmation email. Please do not reply to this email.<br>
                            For inquiries, please contact: contact@naukrivalaafoundation.com<br>
                            © ${new Date().getFullYear()} Naukrivalaa Foundation. All rights reserved.
                        </p>
                    </div>
                </div>
            </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error("❌ Failed to send confirmation email:", error);
      return false;
    }

    console.log("✅ Confirmation email sent successfully via Resend!", data);
    return true;
  } catch (error) {
    console.error("❌ Failed to send confirmation email:", error.message);
    return false;
  }
}

// Routes

// Health Check
app.get("/health", async (req, res) => {
  const health = {
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    email: process.env.RESEND_API_KEY ? "Resend configured" : "not configured",
    phonepe: PHONEPE_CONFIG.clientId ? "configured" : "not configured",
    phonePeEnv: PHONEPE_CONFIG.env,
    method: "OAuth V2 (Working)",
    client_id: PHONEPE_CONFIG.clientId,
  };
  res.json(health);
});

// Application Submission
app.post(
  "/api/application/submit",
  generalLimiter,
  sanitizeInput,
  async (req, res) => {
    try {
      const errors = validateApplicationData(req.body);
      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors,
        });
      }

      const existingApplication = await Application.findOne({
        $or: [{ email: req.body.email }, { phone: req.body.phone }],
      });

      if (existingApplication) {
        return res.status(409).json({
          success: false,
          message: "Application already exists with this email or phone number",
        });
      }

      const applicationId = `NF2025${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const application = new Application({
        ...req.body,
        applicationId,
        dob: new Date(req.body.dob),
      });

      await application.save();

      res.status(201).json({
        success: true,
        message: "Application submitted successfully",
        data: {
          applicationId: application.applicationId,
          timestamp: application.createdAt,
        },
      });
    } catch (error) {
      console.error("Application submission error:", error);
      res.status(500).json({
        success: false,
        message: "Application submission failed",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
);

// Payment Initiation (FIXED VERSION)
app.post(
  "/api/payment/initiate",
  paymentLimiter,
  sanitizeInput,
  async (req, res) => {
    try {
      const { applicationId, amount, name, email, phone, merchantOrderId } =
        req.body;

      // Validation
      if (
        !applicationId ||
        !amount ||
        !name ||
        !email ||
        !phone ||
        !merchantOrderId
      ) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      if (amount !== 99) {
        return res.status(400).json({
          success: false,
          message: "Invalid amount",
        });
      }

      // CHECK FOR EXISTING PAYMENT FIRST
      const existingPayment = await Payment.findOne({ merchantOrderId });
      if (existingPayment) {
        return res.status(409).json({
          success: false,
          message: "Payment already exists for this order ID",
          existingPayment: {
            merchantOrderId: existingPayment.merchantOrderId,
            status: existingPayment.status,
            createdAt: existingPayment.createdAt,
          },
        });
      }

      // Check for duplicate payments by application
      const duplicatePayment = await checkDuplicatePayment(applicationId);
      if (duplicatePayment) {
        return res.status(409).json({
          success: false,
          message: `Payment already exists for this application. Status: ${duplicatePayment.status}`,
          existingPayment: {
            merchantOrderId: duplicatePayment.merchantOrderId,
            status: duplicatePayment.status,
            createdAt: duplicatePayment.createdAt,
          },
        });
      }

      // Generate OAuth token
      const authToken = await generateAuthToken();

      // V2 Payment payload
      const requestBody = {
        merchantId: PHONEPE_CONFIG.merchantId, // ← ADD THIS LINE!
        merchantOrderId: merchantOrderId,
        amount: amount * 100,
        expireAfter: 1800,
        metaInfo: {
          udf1: applicationId,
          udf2: name,
          udf3: email,
          udf4: phone,
          udf5: "Scholarship Application",
        },
        paymentFlow: {
          type: "PG_CHECKOUT",
          message: "Naukrivalaa Foundation Scholarship Application Fee",
          merchantUrls: {
            redirectUrl: `${process.env.FRONTEND_URL}/payment-status.html?transactionId=${merchantOrderId}`,
          },
        },
      };

      const requestHeaders = {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${authToken}`,
      };

      console.log("🔍 PHONEPE REQUEST DEBUG:");
      console.log("📍 URL:", PHONEPE_URLS[PHONEPE_CONFIG.env].payment);
      console.log("📦 Body:", JSON.stringify(requestBody, null, 2));
      console.log("🔑 Headers:", {
        "Content-Type": requestHeaders["Content-Type"],
        Authorization: requestHeaders.Authorization.substring(0, 30) + "...",
      });

      const response = await axios.post(
        PHONEPE_URLS[PHONEPE_CONFIG.env].payment,
        requestBody,
        {
          headers: requestHeaders,
          timeout: 30000,
        },
      );

      if (response.data && response.data.redirectUrl && response.data.orderId) {
        // SAVE THE PAYMENT AFTER SUCCESSFUL PHONEPE RESPONSE
        const payment = new Payment({
          applicationId,
          merchantOrderId,
          phonePeOrderId: response.data.orderId,
          amount: amount * 100,
          status: "initiated",
          phonePeResponse: response.data,
        });
        await payment.save();

        res.json({
          success: true,
          message: "Payment initiated successfully",
          data: {
            orderId: response.data.orderId,
            redirectUrl: response.data.redirectUrl,
            state: response.data.state,
            expireAt: response.data.expireAt,
          },
        });
      } else {
        throw new Error(
          "Invalid PhonePe response: " + JSON.stringify(response.data),
        );
      }
    } catch (error) {
      console.error("❌ PHONEPE ERROR DETAILS:");
      console.error("Status:", error.response?.status);
      console.error("Data:", JSON.stringify(error.response?.data, null, 2));
      console.error("Message:", error.message);

      let errorMessage = "Payment initiation failed";
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.code) {
        errorMessage = `PhonePe Error: ${error.response.data.code}`;
      }

      res.status(500).json({
        success: false,
        message: errorMessage,
        error:
          process.env.NODE_ENV === "development"
            ? error.response?.data || error.message
            : undefined,
      });
    }
  },
);

// Payment Status Check
app.get("/api/payment/status/:merchantOrderId", async (req, res) => {
  try {
    const { merchantOrderId } = req.params;

    if (!merchantOrderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const localPayment = await Payment.findOne({ merchantOrderId });
    if (!localPayment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    const authToken = await generateAuthToken();

    const requestHeaders = {
      "Content-Type": "application/json",
      Authorization: `O-Bearer ${authToken}`,
    };

    const statusUrl = `${PHONEPE_URLS[PHONEPE_CONFIG.env].status}/${merchantOrderId}/status?details=true&errorContext=true`;

    const response = await axios.get(statusUrl, {
      headers: requestHeaders,
      timeout: 30000,
    });

    const orderState = response.data.state;
    let localStatus = "initiated";
    let applicationStatus = "pending";
    let shouldSendEmail = false;

    switch (orderState) {
      case "COMPLETED":
        localStatus = "completed";
        applicationStatus = "paid";
        shouldSendEmail = localPayment.status !== "completed";
        break;

      case "FAILED":
        localStatus = "failed";
        applicationStatus = "pending";
        break;

      case "PENDING":
        localStatus = "pending";
        applicationStatus = "pending";
        break;

      default:
        console.warn(`Unknown order state: ${orderState}`);
        localStatus = "pending";
        applicationStatus = "pending";
    }

    const updatedPayment = await Payment.findOneAndUpdate(
      { merchantOrderId },
      {
        status: localStatus,
        phonePeOrderId: response.data.orderId,
        phonePeResponse: response.data,
        updatedAt: new Date(),
      },
      { new: true },
    );

    const application = await Application.findOneAndUpdate(
      { applicationId: localPayment.applicationId },
      {
        paymentStatus: localStatus === "completed" ? "completed" : "pending",
        paymentOrderId:
          orderState === "COMPLETED" ? response.data.orderId : null,
        status: applicationStatus,
        updatedAt: new Date(),
      },
      { new: true },
    );

    if (shouldSendEmail && orderState === "COMPLETED" && application) {
      try {
        await sendConfirmationEmail(application, response.data.orderId);
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError.message);
      }
    }

    res.json({
      success: true,
      data: response.data,
      localData: {
        applicationId: updatedPayment.applicationId,
        status: updatedPayment.status,
        createdAt: updatedPayment.createdAt,
        updatedAt: updatedPayment.updatedAt,
      },
    });
  } catch (error) {
    let errorMessage = "Payment status check failed";
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.response?.data?.code) {
      errorMessage = `PhonePe Error: ${error.response.data.code}`;
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error:
        process.env.NODE_ENV === "development"
          ? error.response?.data || error.message
          : undefined,
    });
  }
});

// Payment Status Page (HOSTINGER COMPATIBLE)
app.get("/payment-status", (req, res) => {
  const { transactionId } = req.query;

  // Redirect to the static HTML page with transaction ID
  res.redirect(`/payment-status.html?transactionId=${transactionId}`);
});

// Application Details
app.get("/api/application/:applicationId", async (req, res) => {
  try {
    const { applicationId } = req.params;
    const application = await Application.findOne({ applicationId });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    res.json({
      success: true,
      data: application,
    });
  } catch (error) {
    console.error("Application fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch application",
    });
  }
});

app.use(express.static(".")); // Serve from root directory

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html")); // Root level
});

app.get("/payment-status", (req, res) => {
  const { transactionId } = req.query;
  res.redirect(`/payment-status.html?transactionId=${transactionId}`);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(
    `📧 Email: ${process.env.RESEND_API_KEY ? "✅ Resend Ready" : "❌ Not configured"}`,
  );
  console.log(
    `💾 Database: ${mongoose.connection.readyState === 1 ? "✅ Connected" : "⚠️ Checking..."}`,
  );
});
