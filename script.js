// ====== CONFIG ======
const BACKEND_BASE_URL = "https://naukrivalaafoundation.onrender.com"; // ✅ Fixed URL

// Form Elements
const form = document.querySelector("#scholarshipForm");
const submitBtn = document.querySelector("#submitBtn");
const loadingOverlay = document.querySelector("#loadingOverlay");

const showLoading = () => {
  if (loadingOverlay) loadingOverlay.style.display = "flex";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = "Processing Payment...";
  }
};

const hideLoading = () => {
  if (loadingOverlay) loadingOverlay.style.display = "none";
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerText = "Submit & Pay ₹99";
  }
};

const showMessage = (message, isError = false) => {
  const messageDiv = document.createElement("div");
  messageDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 25px;
    border-radius: 8px;
    color: white;
    font-weight: bold;
    z-index: 10000;
    max-width: 400px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    ${isError ? "background: #dc3545;" : "background: #28a745;"}
  `;
  messageDiv.textContent = message;
  document.body.appendChild(messageDiv);

  setTimeout(() => {
    if (document.body.contains(messageDiv)) {
      document.body.removeChild(messageDiv);
    }
  }, 5000);
};

// Enhanced validation function
const validateFormData = (formData) => {
  const requiredFields = [
    { name: "name", label: "Full Name" },
    { name: "email", label: "Email" },
    { name: "phone", label: "Mobile Number" },
    { name: "dob", label: "Date of Birth" },
    { name: "gender", label: "Gender" },
    { name: "category", label: "Class/Course" },
    { name: "school", label: "School/College" },
    { name: "state", label: "State" },
    { name: "district", label: "District" },
    { name: "pincode", label: "Pincode" },
    { name: "address", label: "Address" },
    { name: "income_amount", label: "Family Income" },
    { name: "income_band", label: "Income Band" },
    { name: "sop", label: "Statement of Purpose" },
  ];

  for (const field of requiredFields) {
    const value = formData.get(field.name);
    if (!value || value.trim() === "") {
      return `${field.label} is required.`;
    }
  }

  // Validate phone number
  const phone = formData.get("phone");
  if (!/^[6-9]\d{9}$/.test(phone)) {
    return "Please enter a valid 10-digit mobile number starting with 6-9.";
  }

  // Validate email
  const email = formData.get("email");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Please enter a valid email address.";
  }

  // Validate pincode
  const pincode = formData.get("pincode");
  if (!/^\d{6}$/.test(pincode)) {
    return "Please enter a valid 6-digit pincode.";
  }

  // Validate SOP
  const sop = formData.get("sop");
  if (sop.length < 50) {
    return "Statement of Purpose must be at least 50 characters long.";
  }

  // Check consent
  const consent = document.getElementById("consent");
  if (!consent || !consent.checked) {
    return "Please accept the terms and conditions.";
  }

  return null;
};

// Generate Application ID (Client-side compatible)
const generateApplicationId = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const timestamp = now.getTime().toString().slice(-6);
  const randomStr = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `NF${year}${month}${day}${timestamp}${randomStr}`;
};

// Generate unique merchant order ID (Browser-compatible) - ✅ Fixed
const generateMerchantOrderId = () => {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 15);
  const randomNumber = Math.floor(Math.random() * 999999);
  return `MO_${timestamp}_${randomPart}_${randomNumber}`;
};

// Main form submission handler - ✅ Fixed
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showLoading();

    const formData = new FormData(form);
    console.log("📊 Form data collected:");

    const validationError = validateFormData(formData);
    if (validationError) {
      console.log("❌ Validation error:", validationError);
      showMessage(validationError, true);
      hideLoading();
      return;
    }

    const applicationId = generateApplicationId();
    const merchantOrderId = generateMerchantOrderId(); // ✅ Fixed: Use function

    // Prepare application data
    const applicationData = {
      applicationId: applicationId,
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      dob: formData.get("dob"),
      gender: formData.get("gender"),
      category: formData.get("category"),
      school: formData.get("school"),
      state: formData.get("state"),
      district: formData.get("district"),
      pincode: formData.get("pincode"),
      address: formData.get("address"),
      income_amount: parseFloat(formData.get("income_amount")),
      income_band: formData.get("income_band"),
      achievements: formData.get("achievements") || "",
      recommendation: formData.get("recommendation") || "",
      sop: formData.get("sop"),
    };

    try {
      console.log("📨 Submitting application to server...");
      console.log(
        "🎯 Target URL:",
        `${BACKEND_BASE_URL}/api/application/submit`,
      );

      // Step 1: Submit application
      const applicationRes = await fetch(
        `${BACKEND_BASE_URL}/api/application/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(applicationData),
        },
      );

      console.log("📥 Application response status:", applicationRes.status);

      // ✅ IMPROVED VERSION - Replace the application response handling with this:
      if (!applicationRes.ok) {
        let errorText;
        try {
          const errorJson = await applicationRes.json();
          errorText = errorJson.message || `HTTP ${applicationRes.status}`;
        } catch {
          errorText = await applicationRes.text();
        }
        console.error("❌ Server error:", errorText);
        throw new Error(`Server error ${applicationRes.status}: ${errorText}`);
      }

      const applicationResult = await applicationRes.json();
      console.log("📋 Application result:", applicationResult);

      // Handle application-specific responses
      if (!applicationResult.success) {
        if (applicationRes.status === 409) {
          // Duplicate application
          console.log("⚠️ Duplicate application detected");
          const continuePayment = confirm(
            "You have already submitted an application with this email or phone number. " +
              "Do you want to continue with payment for your existing application?",
          );

          if (!continuePayment) {
            hideLoading();
            showMessage(
              "Application cancelled. Please contact support if you need help.",
              false,
            );
            return;
          }
        } else {
          throw new Error(
            applicationResult.message || "Failed to submit application",
          );
        }
      } else {
        console.log("✅ New application submitted successfully");
      }

      // Step 2: Initiate payment
      const paymentData = {
        applicationId: applicationId,
        merchantOrderId: merchantOrderId,
        amount: 99,
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
      };

      console.log("💳 Initiating payment with data:", paymentData);

      const paymentRes = await fetch(
        `${BACKEND_BASE_URL}/api/payment/initiate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(paymentData),
        },
      );

      if (!paymentRes.ok) {
        const errorText = await paymentRes.text();
        console.error("❌ Payment error:", errorText);
        throw new Error(`Payment error ${paymentRes.status}: ${errorText}`);
      }

      const paymentResult = await paymentRes.json();
      console.log("💳 Payment result:", paymentResult);

      if (!paymentResult.success) {
        throw new Error(paymentResult.message || "Failed to initiate payment");
      }

      // Store for tracking
      localStorage.setItem("applicationId", applicationId);
      localStorage.setItem("merchantOrderId", merchantOrderId);

      // Redirect to PhonePe payment page
      if (
        paymentResult.success &&
        paymentResult.data &&
        paymentResult.data.redirectUrl
      ) {
        const paymentUrl = paymentResult.data.redirectUrl;
        showMessage("Redirecting to PhonePe payment gateway...");

        setTimeout(() => {
          window.location.href = paymentUrl;
        }, 1500);
      } else {
        console.error("❌ Payment URL structure unexpected:", paymentResult);
        throw new Error("Payment URL not received from gateway");
      }
    } catch (error) {
      console.error("❌ Complete error details:", error);
      showMessage(
        error.message || "Error occurred while processing your request",
        true,
      );
      hideLoading();
    }
  });
} else {
  console.error("❌ Form not found! Check if the form ID matches.");
}

// Handle payment redirect and status check
window.addEventListener("load", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const merchantOrderId = urlParams.get("transactionId");

  if (merchantOrderId) {
    showLoading();

    try {
      // Check payment status
      const res = await fetch(
        `${BACKEND_BASE_URL}/api/payment/status/${merchantOrderId}`,
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to get payment status");
      }

      hideLoading();

      if (data.success && data.data.state === "COMPLETED") {
        const applicationId =
          data.localData?.applicationId ||
          localStorage.getItem("applicationId") ||
          "APP_ID_NOT_FOUND";

        if (applicationId === "APP_ID_NOT_FOUND") {
          console.warn("Application ID not found, using placeholder");
        }

        showMessage(
          `Payment Successful! Your application has been submitted successfully. ${applicationId !== "APP_ID_NOT_FOUND" ? `Application ID: ${applicationId}.` : ""} You will receive a confirmation email shortly.`,
        );

        // Clear stored data
        localStorage.removeItem("applicationId");
        localStorage.removeItem("merchantOrderId");

        // Show success section
        if (form) {
          form.style.display = "none";
          const successHTML = `
            <div style="max-width: 600px; margin: 50px auto; padding: 30px; text-align: center; background: rgba(56, 193, 114, 0.1); border: 1px solid #38c172; border-radius: 10px; color: #eef2ff;">
              <h2 style="color: #38c172; margin-bottom: 20px;">🎉 Payment Successful!</h2>
              ${applicationId !== "APP_ID_NOT_FOUND" ? `<p><strong>Application ID:</strong> ${applicationId}</p>` : `<p><strong>Note:</strong> Check your email for Application ID</p>`}
              <p><strong>Payment Method:</strong> PhonePe</p>
              <p><strong>Status:</strong> Completed ✅</p>
              <p><strong>Amount Paid:</strong> ₹99</p>
              <p style="margin-top: 20px;">You will receive a confirmation email with your application details shortly.</p>
              <p>Our team will review your application and announce results on our Instagram <a href="https://instagram.com/naukrivalaa" target="_blank" style="color: #60a5fa;">@naukrivalaa</a></p>
              <a href="/" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #4ade80; color: #0a0f1f; text-decoration: none; border-radius: 8px; font-weight: 600;">Apply Again</a>
            </div>
          `;
          form.parentElement.innerHTML = successHTML;
        }
      } else if (data.data && data.data.state === "PENDING") {
        showMessage(
          "Payment is pending. Please complete the payment to submit your application.",
          true,
        );
      } else {
        const state = data.data ? data.data.state : "FAILED";
        showMessage(
          `Payment ${state}. Please try submitting your application again.`,
          true,
        );
      }
    } catch (error) {
      hideLoading();
      console.error("❌ Payment status check error:", error);
      showMessage(error.message || "Error checking payment status", true);
    }
  }
});

// Auto-format phone number input
const phoneInput = document.getElementById("phone");
if (phoneInput) {
  phoneInput.addEventListener("input", function (e) {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 10) {
      value = value.slice(0, 10);
    }
    e.target.value = value;
  });
}

// Auto-format pincode input
const pincodeInput = document.getElementById("pincode");
if (pincodeInput) {
  pincodeInput.addEventListener("input", function (e) {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 6) {
      value = value.slice(0, 6);
    }
    e.target.value = value;
  });
}
