document.querySelectorAll("[data-toggle]").forEach(button => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.toggle);
    if (!input) return;
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    button.textContent = visible ? "Hide" : "Show";
  });
});

function message(text, type = "success") {
  const el = document.getElementById("formMessage");
  if (!el) return;
  el.textContent = text;
  el.className = `form-message ${type}`;
}

document.querySelectorAll("[data-demo]").forEach(button => {
  button.addEventListener("click", () => {
    message(`${button.dataset.demo} is a frontend placeholder. Connect an authentication provider to enable it.`, "success");
  });
});

const register = document.getElementById("registerForm");
if (register) register.addEventListener("submit", event => {
  event.preventDefault();
  const fullName = document.getElementById("fullName").value.trim();
  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirmPassword").value;
  if (!fullName || !username || !email || !password || !confirm) return message("Please complete every required field.", "error");
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return message("Username must be 3–24 characters and contain only letters, numbers, or underscores.", "error");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return message("Enter a valid email address.", "error");
  if (password.length < 8) return message("Your password must contain at least 8 characters.", "error");
  if (password !== confirm) return message("Your passwords do not match.", "error");
  message("Frontend validation passed. Account creation is not connected to a backend yet.", "success");
});

const login = document.getElementById("loginForm");
if (login) login.addEventListener("submit", event => {
  event.preventDefault();
  const identity = document.getElementById("identity").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!identity || !password) return message("Enter your email/username and password.", "error");
  message("Form looks valid, but login is frontend-only and does not authenticate an account.", "success");
});

const forgot = document.getElementById("forgotForm");
if (forgot) forgot.addEventListener("submit", event => {
  event.preventDefault();
  const email = document.getElementById("resetEmail").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return message("Enter a valid email address.", "error");
  message("This frontend demo cannot send an email. Connect a password-reset service to enable recovery.", "success");
});

const reset = document.getElementById("resetForm");
if (reset) reset.addEventListener("submit", event => {
  event.preventDefault();
  const password = document.getElementById("newPassword").value;
  const confirm = document.getElementById("newPasswordConfirm").value;
  if (password.length < 8) return message("Use at least 8 characters for your new password.", "error");
  if (password !== confirm) return message("Your passwords do not match.", "error");
  message("Validation passed. Saving a password requires a connected authentication backend.", "success");
});
