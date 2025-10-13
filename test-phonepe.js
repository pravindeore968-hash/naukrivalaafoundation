// test-phonepe.js - PhonePe Integration Debugger
const axios = require("axios");
require("dotenv").config();

console.log("\n🔍 ===== PHONEPE INTEGRATION DEBUG TOOL =====\n");

// Display Environment Variables
console.log("📋 ENVIRONMENT CONFIGURATION:");
console.log("-----------------------------------");
console.log("PHONEPE_ENV:", process.env.PHONEPE_ENV);
console.log("PHONEPE_MERCHANT_ID:", process.env.PHONEPE_MERCHANT_ID);
console.log("PHONEPE_CLIENT_ID:", process.env.PHONEPE_CLIENT_ID);
console.log(
  "PHONEPE_CLIENT_SECRET:",
  process.env.PHONEPE_CLIENT_SECRET ? "✅ Set" : "❌ Missing",
);
console.log("PHONEPE_CLIENT_VERSION:", process.env.PHONEPE_CLIENT_VERSION);
console.log("\n");

// Configuration
const PHONEPE_CONFIG = {
  env: process.env.PHONEPE_ENV || "PROD",
  merchantId: process.env.PHONEPE_MERCHANT_ID,
  clientId: process.env.PHONEPE_CLIENT_ID,
  clientSecret: process.env.PHONEPE_CLIENT_SECRET,
  clientVersion: process.env.PHONEPE_CLIENT_VERSION || "1",
};

const PHONEPE_URLS = {
  PROD: {
    token: "https://api.phonepe.com/apis/pg/v1/oauth/token",
    payment: "https://api.phonepe.com/apis/pg/checkout/v2/pay",
  },
  UAT: {
    token: "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token",
    payment: "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay",
  },
};

// Step 1: Test Token Generation
async function testTokenGeneration() {
  console.log("🔐 STEP 1: Testing Token Generation");
  console.log("-----------------------------------");

  const env = PHONEPE_CONFIG.env;
  const tokenUrl = PHONEPE_URLS[env].token;

  console.log("📍 Token URL:", tokenUrl);

  const requestBody = new URLSearchParams({
    client_id: PHONEPE_CONFIG.clientId,
    client_version: PHONEPE_CONFIG.clientVersion,
    client_secret: PHONEPE_CONFIG.clientSecret,
    grant_type: "client_credentials",
  }).toString();

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  try {
    console.log("📤 Sending token request...");
    const response = await axios.post(tokenUrl, requestBody, { headers });

    console.log("✅ Token Generation: SUCCESS");
    console.log("📊 Response Status:", response.status);
    console.log("🔑 Token Type:", response.data.token_type);
    console.log(
      "⏰ Expires At:",
      new Date(response.data.expires_at * 1000).toLocaleString(),
    );
    console.log(
      "🎫 Access Token (first 50 chars):",
      response.data.access_token?.substring(0, 50) + "...",
    );
    console.log("\n");

    return response.data.access_token;
  } catch (error) {
    console.log("❌ Token Generation: FAILED");
    console.log("Status:", error.response?.status);
    console.log("Error Data:", JSON.stringify(error.response?.data, null, 2));
    console.log("Error Message:", error.message);
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

  console.log("📍 Payment URL:", paymentUrl);

  const testMerchantOrderId = `TEST_${Date.now()}`;

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

  console.log(
    "📤 Request Headers:",
    JSON.stringify(
      {
        "Content-Type": headers["Content-Type"],
        Authorization: `O-Bearer ${authToken.substring(0, 30)}...`,
        "X-MERCHANT-ID": headers["X-MERCHANT-ID"],
      },
      null,
      2,
    ),
  );

  console.log("📦 Request Body:", JSON.stringify(requestBody, null, 2));

  try {
    console.log("📤 Sending payment request...");
    const response = await axios.post(paymentUrl, requestBody, { headers });

    console.log("✅ Payment Initiation: SUCCESS");
    console.log("📊 Response Status:", response.status);
    console.log("📄 Response Data:", JSON.stringify(response.data, null, 2));
    console.log("\n");

    return response.data;
  } catch (error) {
    console.log("❌ Payment Initiation: FAILED");
    console.log("Status:", error.response?.status);
    console.log("Error Code:", error.response?.data?.code);
    console.log("Error Message:", error.response?.data?.message);
    console.log(
      "Full Error Data:",
      JSON.stringify(error.response?.data, null, 2),
    );
    console.log("Axios Error:", error.message);
    console.log("\n");
    return null;
  }
}

// Step 3: Run All Tests
async function runAllTests() {
  console.log("🚀 Starting PhonePe Integration Tests...\n");

  // Test 1: Token Generation
  const authToken = await testTokenGeneration();

  // Test 2: Payment Initiation
  if (authToken) {
    await testPaymentInitiation(authToken);
  }

  console.log("🏁 ===== DEBUG COMPLETE =====\n");
}

// Run the tests
runAllTests().catch((error) => {
  console.error("💥 Unexpected Error:", error);
  process.exit(1);
});
