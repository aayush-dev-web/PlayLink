# PlayLink Authentication — Frontend Only

This package contains a responsive, frontend-only authentication UI for PlayLink.

## Pages
- `index.html` — registration with full name, unique-username field, email, password, confirm password, and Google sign-up area.
- `login.html` — login form with one identity field accepting email OR username, password, remember-me checkbox, forgot-password link, and Google login area.
- `forgot-password.html` — email input for password recovery.
- `reset-password.html` — new-password and confirmation form.
- `styles.css` — shared PlayLink navy/green responsive design.
- `app.js` — client-side validation and demo feedback only.

## Run
Open the folder in VS Code and use Live Server, or serve the folder with any static web server.

## Important
This is frontend only. No real account is created, usernames are not checked for uniqueness, login does not authenticate, Google OAuth is not connected, and password reset does not send email. Those functions require a backend/auth provider. The username field's uniqueness is currently a UI requirement only and must be enforced server-side when authentication is added.
