// test-phonepe.js - PhonePe Integration Debugger (ENHANCED)
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

console.log(
  "\n🔍 ===== PHONEPE INTEGRATION DEBUG TOOL (DEEP ANALYSIS) =====\n",
);

// Display Environment Variables with validation
console.log("📋 ENVIRONMENT CONFIGURATION:");
console.log("-----------------------------------");
console.log(
  "PHONEPE_ENV:",
  process.env.PHONEPE_ENV || "❌ NOT SET (defaulting to PROD)",
);
console.log(
  "PHONEPE_MERCHANT_ID:",
  process.env.PHONEPE_MERCHANT_ID || "❌ NOT SET",
);
console.log(
  "PHONEPE_CLIENT_ID:",
  process.env.PHONEPE_CLIENT_ID || "❌ NOT SET",
);
console.log(
  "PHONEPE_CLIENT_SECRET:",
  process.env.PHONEPE_CLIENT_SECRET
    ? `✅ Set (${process.env.PHONEPE_CLIENT_SECRET.length} chars)`
    : "❌ Missing",
);
console.log(
  "PHONEPE_CLIENT_VERSION:",
  process.env.PHONEPE_CLIENT_VERSION || "❌ NOT SET (defaulting to 1)",
);
console.log("\n");

// Configuration with validation
const PHONEPE_CONFIG = {
  env: process.env.PHONEPE_ENV || "PROD",
  merchantId: process.env.PHONEPE_MERCHANT_ID,
  clientId: process.env.PHONEPE_CLIENT_ID,
  clientSecret: process.env.PHONEPE_CLIENT_SECRET,
  clientVersion: process.env.PHONEPE_CLIENT_VERSION || "1",
};

// Validate configuration
console.log("🔍 CONFIGURATION VALIDATION:");
console.log("-----------------------------------");
const missingFields = [];
if (!PHONEPE_CONFIG.merchantId) missingFields.push("PHONEPE_MERCHANT_ID");
if (!PHONEPE_CONFIG.clientId) missingFields.push("PHONEPE_CLIENT_ID");
if (!PHONEPE_CONFIG.clientSecret) missingFields.push("PHONEPE_CLIENT_SECRET");

if (missingFields.length > 0) {
  console.log(
    "❌ CRITICAL: Missing required fields:",
    missingFields.join(", "),
  );
  process.exit(1);
} else {
  console.log("✅ All required configuration fields are present");
}

// Check for whitespace or special characters
console.log("\n🔬 DETAILED FIELD ANALYSIS:");
console.log("-----------------------------------");
console.log("Merchant ID:");
console.log("  - Value:", PHONEPE_CONFIG.merchantId);
console.log("  - Length:", PHONEPE_CONFIG.merchantId?.length);
console.log(
  "  - Has whitespace:",
  /\s/.test(PHONEPE_CONFIG.merchantId || "") ? "⚠️ YES" : "✅ No",
);
console.log("  - Starts with:", PHONEPE_CONFIG.merchantId?.substring(0, 3));
console.log(
  "  - Ends with:",
  PHONEPE_CONFIG.merchantId?.substring(PHONEPE_CONFIG.merchantId.length - 3),
);

console.log("\nClient ID:");
console.log("  - Value:", PHONEPE_CONFIG.clientId);
console.log("  - Length:", PHONEPE_CONFIG.clientId?.length);
console.log(
  "  - Has whitespace:",
  /\s/.test(PHONEPE_CONFIG.clientId || "") ? "⚠️ YES" : "✅ No",
);
console.log("  - Type check:", typeof PHONEPE_CONFIG.clientId);

console.log("\nClient Secret:");
console.log("  - Length:", PHONEPE_CONFIG.clientSecret?.length);
console.log(
  "  - Has whitespace:",
  /\s/.test(PHONEPE_CONFIG.clientSecret || "") ? "⚠️ YES" : "✅ No",
);
console.log(
  "  - Format:",
  PHONEPE_CONFIG.clientSecret?.includes("-") ? "UUID format" : "Other format",
);
console.log(
  "  - First 10 chars:",
  PHONEPE_CONFIG.clientSecret?.substring(0, 10) + "...",
);
console.log(
  "  - Last 4 chars:",
  "..." +
    PHONEPE_CONFIG.clientSecret?.substring(
      PHONEPE_CONFIG.clientSecret.length - 4,
    ),
);

console.log("\n");

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

// Step 1: Test Token Generation
async function testTokenGeneration() {
  console.log("🔐 STEP 1: Testing Token Generation");
  console.log("-----------------------------------");

  const env = PHONEPE_CONFIG.env;
  const tokenUrl = PHONEPE_URLS[env].token;

  console.log("🌍 Environment:", env);
  console.log("📍 Token URL:", tokenUrl);
  console.log(
    "🔗 Using endpoints set:",
    env === "PROD" ? "Production" : "UAT/Sandbox",
  );

  const requestParams = {
    client_id: PHONEPE_CONFIG.clientId,
    client_version: PHONEPE_CONFIG.clientVersion,
    client_secret: PHONEPE_CONFIG.clientSecret,
    grant_type: "client_credentials",
  };

  console.log("\n📋 Request Parameters (for token):");
  console.log("  - client_id:", requestParams.client_id);
  console.log("  - client_version:", requestParams.client_version);
  console.log(
    "  - client_secret:",
    requestParams.client_secret?.substring(0, 10) + "...",
  );
  console.log("  - grant_type:", requestParams.grant_type);

  const requestBody = new URLSearchParams(requestParams).toString();

  console.log("\n📤 URL-encoded body length:", requestBody.length, "bytes");

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  try {
    console.log("\n⏱️ Sending token request at:", new Date().toISOString());
    const startTime = Date.now();

    const response = await axios.post(tokenUrl, requestBody, {
      headers,
      timeout: 10000, // 10 second timeout
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log("\n✅ Token Generation: SUCCESS");
    console.log("⏱️ Response time:", duration, "ms");
    console.log("📊 Response Status:", response.status);
    console.log("📊 Response Status Text:", response.statusText);
    console.log("🔑 Token Type:", response.data.token_type);
    console.log(
      "⏰ Issued At:",
      new Date(response.data.issued_at * 1000).toLocaleString(),
    );
    console.log(
      "⏰ Expires At:",
      new Date(response.data.expires_at * 1000).toLocaleString(),
    );
    console.log(
      "⏰ Token Valid For:",
      Math.floor((response.data.expires_at - response.data.issued_at) / 60),
      "minutes",
    );
    console.log(
      "🎫 Access Token Length:",
      response.data.access_token?.length,
      "chars",
    );
    console.log(
      "🎫 Access Token (first 50 chars):",
      response.data.access_token?.substring(0, 50) + "...",
    );

    // Try to decode JWT to see merchant info
    try {
      const tokenParts = response.data.access_token.split(".");
      if (tokenParts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(tokenParts[1], "base64").toString(),
        );
        console.log("\n🔓 Decoded Token Payload:");
        console.log(JSON.stringify(payload, null, 2));
      }
    } catch (e) {
      console.log(
        "ℹ️ Could not decode token (this is normal for some token formats)",
      );
    }

    console.log("\n");

    return response.data.access_token;
  } catch (error) {
    console.log("\n❌ Token Generation: FAILED");
    console.log("⏱️ Failed at:", new Date().toISOString());
    console.log("❌ Status:", error.response?.status);
    console.log("❌ Status Text:", error.response?.statusText);
    console.log(
      "❌ Error Headers:",
      JSON.stringify(error.response?.headers, null, 2),
    );
    console.log(
      "❌ Error Data:",
      JSON.stringify(error.response?.data, null, 2),
    );
    console.log("❌ Error Message:", error.message);
    console.log("❌ Error Code:", error.code);

    if (error.code === "ECONNREFUSED") {
      console.log("⚠️ CONNECTION REFUSED: Cannot reach PhonePe servers");
    } else if (error.code === "ETIMEDOUT") {
      console.log("⚠️ TIMEOUT: PhonePe servers not responding");
    }

    console.log("\n");
    return null;
  }
}

// Step 2: Test Payment Initiation
async function testPaymentInitiation(authToken) {
  console.log("💳 STEP 2: Testing Payment Initiation");
  console.log("-----------------------------------");

  if (!authToken) {
    console.log("❌ Cannot test payment - no auth token available");
    return;
  }

  const env = PHONEPE_CONFIG.env;
  const paymentUrl = PHONEPE_URLS[env].payment;

  console.log("🌍 Environment:", env);
  console.log("📍 Payment URL:", paymentUrl);

  const testMerchantOrderId = `TEST_${Date.now()}`;
  console.log("🆔 Generated Test Order ID:", testMerchantOrderId);

  const requestBody = {
    merchantOrderId: testMerchantOrderId,
    amount: 9900,
    expireAfter: 1800,
    metaInfo: {
      udf1: "TEST_APP_ID",
      udf2: "Test User",
      udf3: "test@example.com",
      udf4: "9999999999",
    },
    paymentFlow: {
      type: "PG_CHECKOUT",
      message: "Test Payment",
      merchantUrls: {
        redirectUrl:
          "https://naukrivalaafoundation.com/payment-status.html?transactionId=" +
          testMerchantOrderId,
      },
    },
  };

  const headers = {
    "Content-Type": "application/json",
    Authorization: `O-Bearer ${authToken}`,
    "X-MERCHANT-ID": PHONEPE_CONFIG.merchantId,
  };

  console.log("\n📤 Request Headers (Full):");
  console.log(
    JSON.stringify(
      {
        "Content-Type": headers["Content-Type"],
        Authorization: `O-Bearer ${authToken.substring(0, 30)}...${authToken.substring(authToken.length - 10)}`,
        "X-MERCHANT-ID": headers["X-MERCHANT-ID"],
      },
      null,
      2,
    ),
  );

  console.log("\n📦 Request Body (Full):");
  console.log(JSON.stringify(requestBody, null, 2));

  console.log("\n🔬 Request Body Analysis:");
  console.log("  - Body size:", JSON.stringify(requestBody).length, "bytes");
  console.log(
    "  - Amount:",
    requestBody.amount,
    "(₹" + requestBody.amount / 100 + ")",
  );
  console.log(
    "  - Expire after:",
    requestBody.expireAfter,
    "seconds (" + requestBody.expireAfter / 60 + " minutes)",
  );
  console.log("  - Payment flow type:", requestBody.paymentFlow.type);
  console.log(
    "  - Redirect URL length:",
    requestBody.paymentFlow.merchantUrls.redirectUrl.length,
  );

  try {
    console.log("\n⏱️ Sending payment request at:", new Date().toISOString());
    const startTime = Date.now();

    const response = await axios.post(paymentUrl, requestBody, {
      headers,
      timeout: 15000, // 15 second timeout
      validateStatus: (status) => status < 600, // Don't throw on any HTTP status
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log("\n⏱️ Response time:", duration, "ms");
    console.log("📊 Response Status:", response.status);
    console.log("📊 Response Status Text:", response.statusText);
    console.log(
      "📊 Response Headers:",
      JSON.stringify(response.headers, null, 2),
    );

    if (response.status === 200 || response.status === 201) {
      console.log("\n✅ Payment Initiation: SUCCESS");
      console.log("📄 Response Data:", JSON.stringify(response.data, null, 2));

      if (response.data.data?.redirectUrl) {
        console.log(
          "\n🔗 Payment Redirect URL:",
          response.data.data.redirectUrl,
        );
      }
    } else {
      console.log("\n⚠️ Payment Initiation: NON-200 STATUS");
      console.log("📄 Response Data:", JSON.stringify(response.data, null, 2));
    }

    console.log("\n");
    return response.data;
  } catch (error) {
    console.log("\n❌ Payment Initiation: FAILED");
    console.log("⏱️ Failed at:", new Date().toISOString());
    console.log("❌ HTTP Status:", error.response?.status);
    console.log("❌ Status Text:", error.response?.statusText);
    console.log("❌ Error Code:", error.response?.data?.code);
    console.log("❌ Error Message:", error.response?.data?.message);
    console.log(
      "❌ Response Headers:",
      JSON.stringify(error.response?.headers, null, 2),
    );
    console.log(
      "❌ Full Error Data:",
      JSON.stringify(error.response?.data, null, 2),
    );
    console.log("❌ Axios Error Message:", error.message);
    console.log("❌ Axios Error Code:", error.code);

    // Additional diagnostics
    if (error.response?.status === 401) {
      console.log("\n🔍 401 UNAUTHORIZED - Possible Causes:");
      console.log("  1. Merchant account not activated/approved");
      console.log("  2. Invalid or expired auth token");
      console.log("  3. Merchant ID mismatch");
      console.log("  4. Account suspended/blocked");
      console.log("  5. Wrong environment (UAT vs PROD credentials)");
    } else if (error.response?.status === 400) {
      console.log("\n🔍 400 BAD REQUEST - Possible Causes:");
      console.log("  1. Invalid request body format");
      console.log("  2. Missing required fields");
      console.log("  3. Invalid field values");
    } else if (error.response?.status === 403) {
      console.log("\n🔍 403 FORBIDDEN - Possible Causes:");
      console.log("  1. IP not whitelisted");
      console.log("  2. Merchant not authorized for this operation");
    }

    console.log("\n");
    return null;
  }
}

// Step 3: Run All Tests
async function runAllTests() {
  console.log("🚀 Starting PhonePe Integration Tests...\n");
  console.log("⏰ Test started at:", new Date().toLocaleString());
  console.log("🖥️ Node version:", process.version);
  console.log("📦 Axios version:", require("axios/package.json").version);
  console.log("\n");

  const overallStartTime = Date.now();

  // Test 1: Token Generation
  const authToken = await testTokenGeneration();

  // Test 2: Payment Initiation
  if (authToken) {
    await testPaymentInitiation(authToken);
  } else {
    console.log(
      "⚠️ Skipping payment initiation test due to token generation failure\n",
    );
  }

  const overallEndTime = Date.now();
  const totalDuration = overallEndTime - overallStartTime;

  console.log("🏁 ===== DEBUG COMPLETE =====");
  console.log("⏰ Total execution time:", totalDuration, "ms");
  console.log("⏰ Completed at:", new Date().toLocaleString());
  console.log("\n");
}

// Run the tests
runAllTests().catch((error) => {
  console.error("\n💥 UNEXPECTED FATAL ERROR:");
  console.error("Error name:", error.name);
  console.error("Error message:", error.message);
  console.error("Error stack:", error.stack);
  process.exit(1);
});
