// Auth page templates

function layout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Entrained AI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0a0a;
      --bg-secondary: #141414;
      --bg-tertiary: #1a1a1a;
      --text: #e5e5e5;
      --text-secondary: #a3a3a3;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --success: #22c55e;
      --warning: #f59e0b;
      --error: #ef4444;
      --border: #262626;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .container {
      max-width: 400px;
      margin: 0 auto;
      padding: 2rem 1rem;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .logo {
      text-align: center;
      margin-bottom: 2rem;
    }

    .logo a {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text);
    }

    .logo span { color: var(--accent); }

    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
    }

    .card h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      text-align: center;
    }

    .card p {
      color: var(--text-secondary);
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
    }

    input {
      width: 100%;
      padding: 0.75rem 1rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 1rem;
      font-family: inherit;
    }

    input:focus {
      outline: none;
      border-color: var(--accent);
    }

    input::placeholder {
      color: var(--text-secondary);
    }

    .btn {
      width: 100%;
      padding: 0.75rem 1rem;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      margin-top: 0.5rem;
    }

    .btn:hover {
      background: var(--accent-hover);
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .divider {
      text-align: center;
      margin: 1.5rem 0;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid var(--error);
      color: var(--error);
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }

    .success {
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid var(--success);
      color: var(--success);
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }

    .footer {
      text-align: center;
      padding: 1rem;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .return-link {
      display: block;
      text-align: center;
      margin-top: 1.5rem;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <a href="https://entrained.ai">Entrained<span>AI</span></a>
    </div>
    ${content}
  </div>
  <div class="footer">
    <a href="https://entrained.ai">Entrained AI Research Institute</a>
  </div>
</body>
</html>`;
}

export function loginPage(error?: string, returnTo?: string): string {
  const returnParam = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : '';

  return layout('Sign In', `
    <div class="card">
      <h1>Welcome back</h1>
      <p>Sign in to your Entrained AI account</p>

      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}

      <form id="loginForm" action="/login${returnParam}" method="POST">
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="you@example.com" required>
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" placeholder="Your password" required>
        </div>

        <button type="submit" class="btn">Sign In</button>
      </form>

      <div class="divider">Don't have an account?</div>
      <a href="/signup${returnParam}" style="display: block; text-align: center;">Create an account</a>

      <a href="/forgot-password" class="return-link">Forgot your password?</a>
    </div>

    ${returnTo ? `<a href="${escapeHtml(returnTo)}" class="return-link">&larr; Return to ${getDomain(returnTo)}</a>` : ''}

    <script>
      // Handle form submission with fetch for better UX
      document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = form.querySelector('button');
        btn.disabled = true;
        btn.textContent = 'Signing in...';

        try {
          const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: form.email.value,
              password: form.password.value
            })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || 'Login failed');
          }

          // Store token locally (for auth.entrained.ai)
          localStorage.setItem('auth_token', data.token);
          localStorage.setItem('auth_user', JSON.stringify(data.user));

          // Redirect with token in fragment for cross-domain auth
          const returnTo = new URLSearchParams(window.location.search).get('return_to');
          if (returnTo && returnTo.endsWith('.entrained.ai')) {
            // Pass token in URL fragment (secure - not sent to server)
            const authData = encodeURIComponent(JSON.stringify({
              token: data.token,
              user: data.user
            }));
            window.location.href = returnTo + '#auth=' + authData;
          } else {
            window.location.href = returnTo || 'https://entrained.ai';
          }
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Sign In';

          // Show error
          const existingError = document.querySelector('.error');
          if (existingError) existingError.remove();

          const errorDiv = document.createElement('div');
          errorDiv.className = 'error';
          errorDiv.textContent = err.message;
          form.insertBefore(errorDiv, form.firstChild);
        }
      });
    </script>
  `);
}

export function signupPage(error?: string, returnTo?: string): string {
  const returnParam = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : '';

  return layout('Create Account', `
    <div class="card">
      <h1>Create your account</h1>
      <p>Join the Entrained AI research community</p>

      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}

      <form id="signupForm" action="/signup${returnParam}" method="POST">
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="you@example.com" required>
        </div>

        <div class="form-group">
          <label for="display_name">Display Name (optional)</label>
          <input type="text" id="display_name" name="display_name" placeholder="How should we call you?">
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" placeholder="At least 8 characters" required minlength="8">
        </div>

        <div class="form-group">
          <label for="password_confirm">Confirm Password</label>
          <input type="password" id="password_confirm" name="password_confirm" placeholder="Confirm your password" required>
        </div>

        <button type="submit" class="btn">Create Account</button>
      </form>

      <div class="divider">Already have an account?</div>
      <a href="/login${returnParam}" style="display: block; text-align: center;">Sign in</a>
    </div>

    ${returnTo ? `<a href="${escapeHtml(returnTo)}" class="return-link">&larr; Return to ${getDomain(returnTo)}</a>` : ''}

    <script>
      document.getElementById('signupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = form.querySelector('button');

        // Validate passwords match
        if (form.password.value !== form.password_confirm.value) {
          const existingError = document.querySelector('.error');
          if (existingError) existingError.remove();

          const errorDiv = document.createElement('div');
          errorDiv.className = 'error';
          errorDiv.textContent = 'Passwords do not match';
          form.insertBefore(errorDiv, form.firstChild);
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Creating account...';

        try {
          const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: form.email.value,
              password: form.password.value,
              display_name: form.display_name.value || undefined
            })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || 'Registration failed');
          }

          // Show success and redirect to login
          const returnTo = new URLSearchParams(window.location.search).get('return_to');
          const returnParam = returnTo ? '?return_to=' + encodeURIComponent(returnTo) : '';
          window.location.href = '/login' + returnParam + '&registered=1';
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Create Account';

          const existingError = document.querySelector('.error');
          if (existingError) existingError.remove();

          const errorDiv = document.createElement('div');
          errorDiv.className = 'error';
          errorDiv.textContent = err.message;
          form.insertBefore(errorDiv, form.firstChild);
        }
      });
    </script>
  `);
}

export function forgotPasswordPage(error?: string, success?: boolean): string {
  return layout('Reset Password', `
    <div class="card">
      <h1>Reset your password</h1>
      <p>Enter your email and we'll send you a reset link</p>

      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
      ${success ? `<div class="success">If that email exists, a reset link has been sent. Check your inbox.</div>` : ''}

      <form id="forgotForm" action="/forgot-password" method="POST">
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="you@example.com" required>
        </div>

        <button type="submit" class="btn">Send Reset Link</button>
      </form>

      <a href="/login" class="return-link">&larr; Back to sign in</a>
    </div>

    <script>
      document.getElementById('forgotForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = form.querySelector('button');
        btn.disabled = true;
        btn.textContent = 'Sending...';

        try {
          const res = await fetch('/api/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: form.email.value })
          });

          // Always show success (to prevent email enumeration)
          window.location.href = '/forgot-password?success=1';
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Send Reset Link';
        }
      });
    </script>
  `);
}

export function logoutPage(): string {
  return layout('Signed Out', `
    <div class="card" style="text-align: center;">
      <h1>Signed out</h1>
      <p>You have been successfully signed out.</p>
      <a href="/login" class="btn" style="display: inline-block; width: auto; margin-top: 1rem;">Sign in again</a>
    </div>

    <script>
      // Clear stored auth
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    </script>
  `);
}

// Helper functions
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'previous page';
  }
}
