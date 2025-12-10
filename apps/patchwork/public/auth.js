// Auth state management for Patchwork
const AUTH_API = 'https://auth.entrained.ai/api';

// Check auth state on page load
document.addEventListener('DOMContentLoaded', () => {
  checkAuthState();
});

async function checkAuthState() {
  const token = localStorage.getItem('auth_token');
  if (!token) {
    showLoggedOutState();
    return;
  }

  try {
    const res = await fetch(`${AUTH_API}/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      const user = await res.json();
      showLoggedInState(user);
    } else {
      // Token invalid/expired
      localStorage.removeItem('auth_token');
      showLoggedOutState();
    }
  } catch (err) {
    console.error('Auth check failed:', err);
    showLoggedOutState();
  }
}

function showLoggedOutState() {
  const navAuth = document.getElementById('nav-auth');
  navAuth.innerHTML = `
    <button class="btn btn-ghost" onclick="showAuthModal('login')">Log in</button>
    <button class="btn btn-primary" onclick="showAuthModal('register')">Sign up</button>
  `;
}

function showLoggedInState(user) {
  const navAuth = document.getElementById('nav-auth');
  const displayName = user.display_name || user.email.split('@')[0];
  navAuth.innerHTML = `
    <span class="user-name">${escapeHtml(displayName)}</span>
    <button class="btn btn-ghost" onclick="handleLogout()">Log out</button>
  `;
}

// Modal functions
function showAuthModal(tab = 'login') {
  const modal = document.getElementById('auth-modal');
  modal.classList.add('active');
  switchTab(tab);
  document.body.style.overflow = 'hidden';
}

function hideAuthModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('auth-modal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
  // Clear forms
  document.getElementById('login-form').reset();
  document.getElementById('register-form').reset();
  document.getElementById('login-error').textContent = '';
  document.getElementById('register-error').textContent = '';
}

function switchTab(tab) {
  const loginTab = document.getElementById('tab-login');
  const registerTab = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (tab === 'login') {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  } else {
    loginTab.classList.remove('active');
    registerTab.classList.add('active');
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
  }
}

// Auth handlers
async function handleLogin(event) {
  event.preventDefault();
  const form = event.target;
  const errorEl = document.getElementById('login-error');
  const submitBtn = form.querySelector('button[type="submit"]');

  const email = form.email.value;
  const password = form.password.value;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in...';
  errorEl.textContent = '';

  try {
    const res = await fetch(`${AUTH_API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('auth_token', data.token);
      showLoggedInState(data.user);
      hideAuthModal();
    } else {
      errorEl.textContent = data.error || 'Login failed';
    }
  } catch (err) {
    errorEl.textContent = 'Network error. Please try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log in';
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const form = event.target;
  const errorEl = document.getElementById('register-error');
  const submitBtn = form.querySelector('button[type="submit"]');

  const email = form.email.value;
  const password = form.password.value;
  const display_name = form.display_name.value || undefined;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account...';
  errorEl.textContent = '';

  try {
    const res = await fetch(`${AUTH_API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name })
    });

    const data = await res.json();

    if (res.ok) {
      // Auto-login after registration
      const loginRes = await fetch(`${AUTH_API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (loginRes.ok) {
        const loginData = await loginRes.json();
        localStorage.setItem('auth_token', loginData.token);
        showLoggedInState(loginData.user);
        hideAuthModal();
      } else {
        // Registration succeeded but auto-login failed
        switchTab('login');
        document.getElementById('login-email').value = email;
      }
    } else {
      errorEl.textContent = data.error || 'Registration failed';
    }
  } catch (err) {
    errorEl.textContent = 'Network error. Please try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';
  }
}

async function handleLogout() {
  const token = localStorage.getItem('auth_token');

  try {
    await fetch(`${AUTH_API}/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch (err) {
    // Ignore errors, still clear local state
  }

  localStorage.removeItem('auth_token');
  showLoggedOutState();
}

// Utility
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Export for global access
window.showAuthModal = showAuthModal;
window.hideAuthModal = hideAuthModal;
window.switchTab = switchTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
