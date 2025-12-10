export interface LayoutOptions {
  title: string;
  description?: string;
}

export function layout(options: LayoutOptions, content: string): string {
  const { title, description = 'Web-based MIDI and synthesis tools' } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${description}">
  <title>${title} | Patchwork</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <nav class="nav">
    <a href="/" class="nav-logo">
      <span class="logo-icon">◈</span>
      <span class="logo-text">Patchwork</span>
    </a>
    <div class="nav-links">
      <a href="/schema-extractor">Schema Extractor</a>
      <a href="/patch-designer">Patch Designer</a>
      <a href="/sequencer">Sequencer</a>
    </div>
    <div class="nav-auth" id="nav-auth">
      <button class="btn btn-ghost" onclick="showAuthModal('login')">Log in</button>
      <button class="btn btn-primary" onclick="showAuthModal('register')">Sign up</button>
    </div>
  </nav>
  <main>
    ${content}
  </main>
  <footer class="footer">
    <p>Built for synthesists by <a href="https://entrained.ai">entrained.ai</a></p>
  </footer>

  <!-- Auth Modal -->
  <div class="modal-overlay" id="auth-modal" onclick="hideAuthModal(event)">
    <div class="modal" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="hideAuthModal()">&times;</button>
      <div class="modal-header">
        <button class="tab active" id="tab-login" onclick="switchTab('login')">Log in</button>
        <button class="tab" id="tab-register" onclick="switchTab('register')">Sign up</button>
      </div>
      <div class="modal-body">
        <!-- Login Form -->
        <form id="login-form" class="auth-form" onsubmit="handleLogin(event)">
          <div class="form-group">
            <label for="login-email">Email</label>
            <input type="email" id="login-email" name="email" required autocomplete="email">
          </div>
          <div class="form-group">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" name="password" required autocomplete="current-password">
          </div>
          <div class="form-error" id="login-error"></div>
          <button type="submit" class="btn btn-primary btn-full">Log in</button>
          <a href="#" class="form-link" onclick="event.preventDefault(); alert('Coming soon')">Forgot password?</a>
        </form>
        <!-- Register Form -->
        <form id="register-form" class="auth-form hidden" onsubmit="handleRegister(event)">
          <div class="form-group">
            <label for="register-name">Display name</label>
            <input type="text" id="register-name" name="display_name" autocomplete="name">
          </div>
          <div class="form-group">
            <label for="register-email">Email</label>
            <input type="email" id="register-email" name="email" required autocomplete="email">
          </div>
          <div class="form-group">
            <label for="register-password">Password</label>
            <input type="password" id="register-password" name="password" required minlength="8" autocomplete="new-password">
            <span class="form-hint">At least 8 characters</span>
          </div>
          <div class="form-error" id="register-error"></div>
          <button type="submit" class="btn btn-primary btn-full">Create account</button>
        </form>
      </div>
    </div>
  </div>

  <script src="/auth.js"></script>
</body>
</html>`;
}
