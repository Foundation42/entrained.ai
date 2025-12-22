// Public HTML page templates for SSR

// Shared layout
function layout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - GoodFaith</title>
  <meta name="description" content="AI-mediated discourse platform - where quality matters more than popularity">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <!-- Syntax highlighting -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <!-- KaTeX for LaTeX -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
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
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1rem;
    }

    header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      padding: 1rem 0;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    header .container {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .logo {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text);
    }

    .logo span { color: var(--accent); }

    nav { display: flex; gap: 1.5rem; align-items: center; }
    nav a { color: var(--text-secondary); }
    nav a:hover { color: var(--text); text-decoration: none; }

    /* MMO-style stats HUD */
    .stats-hud {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem 1rem;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .player-info {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.125rem;
    }
    .player-name {
      font-weight: 600;
      font-size: 0.875rem;
    }
    .player-level {
      font-size: 0.75rem;
      color: var(--accent);
    }
    .stat-bars {
      display: flex;
      gap: 0.5rem;
    }
    .stat-bar {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.125rem;
    }
    .stat-bar-label {
      font-size: 0.625rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stat-bar-track {
      width: 48px;
      height: 6px;
      background: var(--bg);
      border-radius: 3px;
      overflow: hidden;
    }
    .stat-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    .stat-bar-fill.gf { background: linear-gradient(90deg, #22c55e, #4ade80); }
    .stat-bar-fill.sub { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
    .stat-bar-fill.char { background: linear-gradient(90deg, #a855f7, #c084fc); }
    .stat-bar-fill.src { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
    .cloak-meter {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
    .cloak-icon { opacity: 0.7; }
    .cloak-value { font-weight: 500; }
    .hud-divider {
      width: 1px;
      height: 24px;
      background: var(--border);
    }
    @media (max-width: 768px) {
      .stat-bars { display: none; }
      .stats-hud { padding: 0.375rem 0.75rem; }
    }

    /* Player Card Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s, visibility 0.2s;
    }
    .modal-overlay.active {
      opacity: 1;
      visibility: visible;
    }
    .player-card {
      background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
      border: 2px solid var(--accent);
      border-radius: 16px;
      padding: 2rem;
      max-width: 500px;
      width: 90%;
      max-height: 85vh;
      overflow-y: auto;
      position: relative;
      box-shadow: 0 0 40px rgba(59, 130, 246, 0.3);
    }
    .player-card-header {
      text-align: center;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }
    .player-card-avatar {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, var(--accent), #8b5cf6);
      border-radius: 50%;
      margin: 0 auto 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
    }
    .player-card-name {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }
    .player-card-title {
      color: var(--accent);
      font-size: 0.875rem;
    }
    .player-card-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .player-card-stat {
      background: var(--bg);
      padding: 0.75rem;
      border-radius: 8px;
      text-align: center;
    }
    .player-card-stat-value {
      font-size: 1.5rem;
      font-weight: 700;
    }
    .player-card-stat-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-transform: uppercase;
    }
    .player-card-stat.gf .player-card-stat-value { color: #4ade80; }
    .player-card-stat.sub .player-card-stat-value { color: #60a5fa; }
    .player-card-stat.char .player-card-stat-value { color: #c084fc; }
    .player-card-stat.src .player-card-stat-value { color: #fbbf24; }
    .player-card-analysis {
      background: var(--bg);
      padding: 1rem;
      border-radius: 8px;
      line-height: 1.7;
    }
    .player-card-analysis h4 {
      margin-bottom: 0.5rem;
      color: var(--accent);
    }
    .player-card-analysis p {
      margin-bottom: 0.75rem;
      color: var(--text-secondary);
    }
    .player-card-analysis p:last-child {
      margin-bottom: 0;
    }
    .player-card-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0.25rem;
      line-height: 1;
    }
    .player-card-close:hover { color: var(--text); }
    .player-card-loading {
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary);
    }
    .player-card-loading .spinner {
      display: inline-block;
      width: 24px;
      height: 24px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 0.5rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .btn {
      display: inline-flex;
      align-items: center;
      padding: 0.5rem 1rem;
      background: var(--accent);
      color: white;
      border-radius: 6px;
      font-weight: 500;
      border: none;
      cursor: pointer;
    }
    .btn:hover { background: var(--accent-hover); text-decoration: none; }
    .btn-secondary {
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { background: var(--border); }

    main { padding: 2rem 0; }

    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }

    .card h3 { margin-bottom: 0.5rem; }

    .meta {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      background: var(--bg-tertiary);
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .badge.alpha { background: var(--warning); color: black; }

    .stats-bar {
      display: flex;
      gap: 1rem;
      margin: 1rem 0;
    }
    .stat {
      display: flex;
      flex-direction: column;
    }
    .stat-value {
      font-size: 1.25rem;
      font-weight: 600;
    }
    .stat-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }
    @media (min-width: 768px) {
      .grid { grid-template-columns: 2fr 1fr; }
    }

    .post-list { list-style: none; }
    .post-item {
      padding: 1rem 0;
      border-bottom: 1px solid var(--border);
    }
    .post-item:last-child { border-bottom: none; }
    .post-title { font-weight: 600; margin-bottom: 0.25rem; }

    .comment {
      padding: 1rem;
      margin-left: calc(var(--depth, 0) * 1.5rem);
      border-left: 2px solid var(--border);
      margin-bottom: 0.5rem;
    }
    .comment-content { margin: 0.5rem 0; }

    .score-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      font-size: 0.75rem;
    }
    .score-good { background: rgba(34, 197, 94, 0.2); color: var(--success); }
    .score-mid { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
    .score-low { background: rgba(239, 68, 68, 0.2); color: var(--error); }

    /* Markdown content styles */
    .markdown-content h1, .markdown-content h2, .markdown-content h3 { margin: 1rem 0 0.5rem; }
    .markdown-content p { margin: 0.5rem 0; }
    .markdown-content ul, .markdown-content ol { margin: 0.5rem 0; padding-left: 1.5rem; }
    .markdown-content blockquote {
      border-left: 3px solid var(--accent);
      padding-left: 1rem;
      margin: 0.5rem 0;
      color: var(--text-secondary);
    }
    .markdown-content code {
      background: var(--bg-tertiary);
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 0.875em;
    }
    .markdown-content pre {
      background: var(--bg-tertiary);
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      margin: 0.75rem 0;
    }
    .markdown-content pre code {
      background: none;
      padding: 0;
      font-size: 0.875rem;
    }
    .markdown-content a { color: var(--accent); }
    .markdown-content img { max-width: 100%; border-radius: 8px; }
    .markdown-content table {
      border-collapse: collapse;
      margin: 0.75rem 0;
      width: 100%;
    }
    .markdown-content th, .markdown-content td {
      border: 1px solid var(--border);
      padding: 0.5rem;
      text-align: left;
    }
    .markdown-content th { background: var(--bg-tertiary); }

    footer {
      background: var(--bg-secondary);
      border-top: 1px solid var(--border);
      padding: 3rem 0;
      margin-top: 4rem;
    }

    .footer-content {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 2rem;
    }

    .footer-section h4 {
      margin-bottom: 1rem;
      color: var(--text);
    }

    .footer-section a {
      display: block;
      color: var(--text-secondary);
      margin-bottom: 0.5rem;
    }

    .footer-bottom {
      margin-top: 2rem;
      padding-top: 2rem;
      border-top: 1px solid var(--border);
      text-align: center;
      color: var(--text-secondary);
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <a href="/" class="logo">Good<span>Faith</span></a>
      <nav>
        <a href="/about">About</a>
        <a href="/how-it-works">How It Works</a>
        <div id="auth-nav">
          <a href="https://auth.entrained.ai?return_to=https://goodfaith.entrained.ai" class="btn">Sign In</a>
        </div>
      </nav>
    </div>
  </header>

  <!-- Player Card Modal -->
  <div id="playerCardModal" class="modal-overlay" onclick="if(event.target === this) closePlayerCard()">
    <div class="player-card">
      <button class="player-card-close" onclick="closePlayerCard()">&times;</button>
      <div id="playerCardContent">
        <div class="player-card-loading">
          <div class="spinner"></div>
          <p>Analyzing your discourse patterns...</p>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Handle auth from URL fragment (cross-domain login)
    (function() {
      const hash = window.location.hash;
      if (hash.startsWith('#auth=')) {
        try {
          const authData = JSON.parse(decodeURIComponent(hash.slice(6)));
          if (authData.token && authData.user) {
            localStorage.setItem('auth_token', authData.token);
            localStorage.setItem('auth_user', JSON.stringify(authData.user));
            // Clean up URL
            history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        } catch (e) {
          console.error('Failed to parse auth data:', e);
        }
      }

      // Check if user is logged in
      const token = localStorage.getItem('auth_token');
      const user = localStorage.getItem('auth_user');
      const authNav = document.getElementById('auth-nav');

      if (token && user) {
        try {
          const userData = JSON.parse(user);

          // Show loading state
          authNav.innerHTML = \`<div class="stats-hud"><span style="color: var(--text-secondary);">Loading...</span></div>\`;

          // Fetch profile with stats
          fetch('/api/me', {
            headers: { 'Authorization': 'Bearer ' + token }
          })
          .then(res => res.json())
          .then(data => {
            if (data.data?.profile) {
              const profile = data.data.profile;
              const stats = profile.stats || { good_faith: 50, substantive: 50, charitable: 50, source_quality: 50 };
              const level = profile.level || 1;
              const xp = profile.xp || 0;
              const xpForNext = level * 100; // Simple XP curve
              const xpPercent = Math.min(100, (xp % xpForNext) / xpForNext * 100);
              const cloakQuota = profile.cloak_quota ?? 100;

              // Store profile globally for player card
              window.currentProfile = profile;
              window.currentStats = stats;

              authNav.innerHTML = \`
                <div class="stats-hud">
                  <div class="hud-clickable" onclick="openPlayerCard()" style="display: flex; align-items: center; gap: 1rem; cursor: pointer;" title="Click to view your Player Card">
                    <div class="stat-bars">
                      <div class="stat-bar" title="Good Faith: \${Math.round(stats.good_faith)}%">
                        <div class="stat-bar-track"><div class="stat-bar-fill gf" style="width: \${stats.good_faith}%"></div></div>
                        <span class="stat-bar-label">GF</span>
                      </div>
                      <div class="stat-bar" title="Substantive: \${Math.round(stats.substantive)}%">
                        <div class="stat-bar-track"><div class="stat-bar-fill sub" style="width: \${stats.substantive}%"></div></div>
                        <span class="stat-bar-label">SUB</span>
                      </div>
                      <div class="stat-bar" title="Charitable: \${Math.round(stats.charitable)}%">
                        <div class="stat-bar-track"><div class="stat-bar-fill char" style="width: \${stats.charitable}%"></div></div>
                        <span class="stat-bar-label">CHR</span>
                      </div>
                      <div class="stat-bar" title="Source Quality: \${Math.round(stats.source_quality)}%">
                        <div class="stat-bar-track"><div class="stat-bar-fill src" style="width: \${stats.source_quality}%"></div></div>
                        <span class="stat-bar-label">SRC</span>
                      </div>
                    </div>
                    <div class="hud-divider"></div>
                    <div class="cloak-meter" title="Cloak Quota: \${cloakQuota}%">
                      <span class="cloak-icon">👻</span>
                      <span class="cloak-value">\${cloakQuota}%</span>
                    </div>
                    <div class="hud-divider"></div>
                    <div class="player-info">
                      <span class="player-name">\${profile.username || userData.display_name || 'Adventurer'}</span>
                      <span class="player-level">Lv.\${level} · \${Math.round(xpPercent)}% XP</span>
                    </div>
                  </div>
                  <a href="#" onclick="event.stopPropagation(); logout()" class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin-left: 0.5rem;">⏻</a>
                </div>
              \`;
            } else {
              // Fallback if profile fetch fails
              authNav.innerHTML = \`
                <span style="color: var(--text-secondary); margin-right: 1rem;">\${userData.display_name || userData.email}</span>
                <a href="#" onclick="logout()" class="btn btn-secondary">Sign Out</a>
              \`;
            }
          })
          .catch(() => {
            authNav.innerHTML = \`
              <span style="color: var(--text-secondary); margin-right: 1rem;">\${userData.display_name || userData.email}</span>
              <a href="#" onclick="logout()" class="btn btn-secondary">Sign Out</a>
            \`;
          });
        } catch (e) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
        }
      }
    })();

    function logout() {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.location.reload();
    }

    function openPlayerCard() {
      const modal = document.getElementById('playerCardModal');
      const content = document.getElementById('playerCardContent');
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';

      // Show loading state
      content.innerHTML = \`
        <div class="player-card-loading">
          <div class="spinner"></div>
          <p>Analyzing your discourse patterns...</p>
        </div>
      \`;

      // Fetch AI-generated player card
      const token = localStorage.getItem('auth_token');
      fetch('/api/me/player-card', {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      .then(res => res.json())
      .then(data => {
        if (data.data) {
          const { profile } = data.data;
          // Get raw analysis - we'll handle escaping when rendering
          const rawAnalysis = data.data.analysis || '';
          const stats = profile.stats || {};
          const level = profile.level || 1;
          const cloakQuota = profile.cloak_quota ?? 100;

          // Get class emoji
          const classEmojis = {
            'Scholar': '📚',
            'Diplomat': '🤝',
            'Investigator': '🔍',
            'Advocate': '⚖️',
            'Seeker': '🌟'
          };
          const emoji = classEmojis[profile.class] || '🎭';

          // Build HTML safely - analysis goes in a separate element to avoid escaping issues
          const analysisHtml = rawAnalysis.split('\\n').filter(p => p.trim()).map(p => {
            const escaped = p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return '<p>' + escaped + '</p>';
          }).join('');

          // Show custom avatar if available, otherwise emoji
          const avatarHtml = profile.avatar_url
            ? '<img src="' + profile.avatar_url + '" alt="Avatar" style="width: 100%; height: 100%; object-fit: contain; border-radius: 50%;">'
            : emoji;

          content.innerHTML = \`
            <div class="player-card-header">
              <div class="player-card-avatar">\${avatarHtml}</div>
              <div class="player-card-name">\${profile.username || 'Adventurer'}</div>
              <div class="player-card-title">Level \${level} \${profile.class || 'Seeker'}</div>
            </div>

            <div class="player-card-stats">
              <div class="player-card-stat gf">
                <div class="player-card-stat-value">\${Math.round(stats.good_faith || 50)}%</div>
                <div class="player-card-stat-label">Good Faith</div>
              </div>
              <div class="player-card-stat sub">
                <div class="player-card-stat-value">\${Math.round(stats.substantive || 50)}%</div>
                <div class="player-card-stat-label">Substance</div>
              </div>
              <div class="player-card-stat char">
                <div class="player-card-stat-value">\${Math.round(stats.charitable || 50)}%</div>
                <div class="player-card-stat-label">Charity</div>
              </div>
              <div class="player-card-stat src">
                <div class="player-card-stat-value">\${Math.round(stats.source_quality || 50)}%</div>
                <div class="player-card-stat-label">Sources</div>
              </div>
            </div>

            <div class="player-card-analysis">
              <h4>🎴 Your Discourse Profile</h4>
              <div id="analysis-text"></div>
            </div>

            \${data.data.badges && data.data.badges.length > 0 ? \`
            <div style="margin-top: 1rem;">
              <h4 style="margin-bottom: 0.5rem; color: var(--accent);">🏆 Badges</h4>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                \${data.data.badges.map(b => \`
                  <div title="\${b.name}: \${b.description || ''}" style="width: 48px; height: 48px; border-radius: 8px; overflow: hidden; background: var(--bg); border: 2px solid var(--border);">
                    <img src="\${b.image_url}" alt="\${b.name}" style="width: 100%; height: 100%; object-fit: cover;">
                  </div>
                \`).join('')}
              </div>
            </div>
            \` : ''}

            <div style="margin-top: 1rem; text-align: center;">
              <button class="btn btn-secondary" onclick="openAvatarCreator()" style="font-size: 0.875rem;">
                🎨 Create Custom Avatar
              </button>
            </div>

            <div style="margin-top: 1rem; text-align: center; font-size: 0.75rem; color: var(--text-secondary);">
              👻 Cloak Quota: \${cloakQuota}% · Member since \${new Date(profile.created_at).toLocaleDateString()}
            </div>
          \`;
          // Set analysis separately to avoid template literal issues
          document.getElementById('analysis-text').innerHTML = analysisHtml;
        } else {
          content.innerHTML = '<div class="player-card-loading"><p>Failed to load player card</p></div>';
        }
      })
      .catch(err => {
        content.innerHTML = '<div class="player-card-loading"><p>Error: ' + err.message + '</p></div>';
      });
    }

    function closePlayerCard() {
      document.getElementById('playerCardModal').classList.remove('active');
      document.body.style.overflow = '';
    }

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePlayerCard();
    });

    // EAP: Avatar Creator integration
    let avatarWindow = null;

    function openAvatarCreator() {
      // Build the intent URL for sprites.entrained.ai
      const returnTo = encodeURIComponent(window.location.origin + window.location.pathname);
      const intentUrl = 'https://sprites.entrained.ai/create?intent=' + encodeURIComponent(JSON.stringify({
        capability: 'avatar.create',
        params: {
          theme: 'avatar',
          style: 'flat_vector',
          returnTo: window.location.origin + window.location.pathname
        },
        caller: {
          app: 'goodfaith.entrained.ai',
          name: 'GoodFaith'
        }
      }));

      // Open in a new window/tab
      avatarWindow = window.open(intentUrl, 'sprites-avatar-creator', 'width=1200,height=900');

      // Close the player card modal
      closePlayerCard();
    }

    // Listen for postMessage from sprites app
    window.addEventListener('message', (event) => {
      // Verify origin
      if (event.origin !== 'https://sprites.entrained.ai') return;

      const data = event.data;
      if (data.type === 'eap:result' && data.capability === 'avatar.create') {
        console.log('[EAP] Received avatar result:', data.result);

        // Save avatar URL to profile
        const token = localStorage.getItem('auth_token');
        if (token && data.result?.avatarUrl) {
          fetch('/api/me/avatar', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ avatar_url: data.result.avatarUrl })
          }).then(() => {
            // Reload to show new avatar
            window.location.reload();
          }).catch(err => {
            console.error('Failed to save avatar:', err);
          });
        }

        // Close the popup if still open
        if (avatarWindow && !avatarWindow.closed) {
          avatarWindow.close();
        }
      } else if (data.type === 'eap:cancel') {
        console.log('[EAP] Avatar creation cancelled');
        if (avatarWindow && !avatarWindow.closed) {
          avatarWindow.close();
        }
      }
    });
  </script>

  <main>
    <div class="container">
      ${content}
    </div>
  </main>

  <footer>
    <div class="container">
      <div class="footer-content">
        <div class="footer-section">
          <h4>GoodFaith</h4>
          <p style="color: var(--text-secondary)">AI-mediated discourse platform</p>
          <p style="margin-top: 0.5rem"><span class="badge alpha">Alpha</span></p>
        </div>
        <div class="footer-section">
          <h4>Platform</h4>
          <a href="/about">About</a>
          <a href="/how-it-works">How It Works</a>
          <a href="/c/meta">Platform Feedback</a>
        </div>
        <div class="footer-section">
          <h4>Entrained AI</h4>
          <a href="https://entrained.ai">Research Institute</a>
          <a href="https://entrained.ai/research">Publications</a>
          <a href="https://entrained.ai/about">About Christian</a>
        </div>
      </div>
      <div class="footer-bottom">
        <p>A research experiment by <a href="https://entrained.ai">Entrained AI Research Institute</a></p>
      </div>
    </div>
  </footer>

  <!-- Markdown, Syntax Highlighting, and LaTeX -->
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script>
    // Configure marked with highlight.js
    marked.setOptions({
      highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      },
      breaks: true,
      gfm: true
    });

    // Render markdown content
    document.querySelectorAll('.markdown-content').forEach(el => {
      const raw = el.getAttribute('data-raw');
      if (raw) {
        let html = marked.parse(raw);

        // Render LaTeX: $...$ for inline, $$...$$ for block
        html = html.replace(/\\$\\$([^$]+)\\$\\$/g, (match, tex) => {
          try {
            return katex.renderToString(tex.trim(), { displayMode: true });
          } catch (e) {
            return match;
          }
        });
        html = html.replace(/\\$([^$]+)\\$/g, (match, tex) => {
          try {
            return katex.renderToString(tex.trim(), { displayMode: false });
          } catch (e) {
            return match;
          }
        });

        el.innerHTML = html;
      }
    });

    // Also highlight any pre-existing code blocks
    document.querySelectorAll('pre code').forEach(el => {
      hljs.highlightElement(el);
    });
  </script>
</body>
</html>`;
}

// Landing page
export function landingPage(communities: any[], recentPosts: any[]): string {
  const communityList = communities.length > 0
    ? communities.map(c => `
      <a href="/c/${c.name}" class="card" style="text-decoration: none; color: inherit;">
        <h3>${c.display_name}</h3>
        <p class="meta">${c.description || 'No description'}</p>
        <div class="stats-bar">
          <div class="stat">
            <span class="stat-value">${c.member_count}</span>
            <span class="stat-label">members</span>
          </div>
          <div class="stat">
            <span class="stat-value">${c.post_count}</span>
            <span class="stat-label">posts</span>
          </div>
        </div>
      </a>
    `).join('')
    : '<p class="meta">No communities yet. Be the first to create one!</p>';

  const postList = recentPosts.length > 0
    ? `<ul class="post-list">
        ${recentPosts.map(p => `
          <li class="post-item">
            <a href="/c/${p.community_name}/p/${p.id}" class="post-title">${escapeHtml(p.title)}</a>
            <p class="meta">
              in <a href="/c/${p.community_name}">${p.community_display_name}</a>
              &bull; ${p.comment_count} comments
              &bull; ${formatTime(p.created_at)}
            </p>
          </li>
        `).join('')}
      </ul>`
    : '<p class="meta">No posts yet.</p>';

  return layout('Home', `
    <div style="text-align: center; padding: 3rem 0;">
      <h1 style="font-size: 2.5rem; margin-bottom: 1rem;">Where Quality Matters More Than Popularity</h1>
      <p style="font-size: 1.25rem; color: var(--text-secondary); max-width: 600px; margin: 0 auto;">
        GoodFaith is a discussion platform where AI evaluates discourse quality instead of counting votes.
        Engage in good faith, and unlock new abilities.
      </p>
      <div style="margin-top: 2rem;">
        <a href="https://auth.entrained.ai" class="btn" style="font-size: 1.125rem; padding: 0.75rem 1.5rem;">Get Started</a>
        <a href="/how-it-works" class="btn btn-secondary" style="font-size: 1.125rem; padding: 0.75rem 1.5rem; margin-left: 1rem;">Learn More</a>
      </div>
    </div>

    <div class="grid" style="margin-top: 3rem;">
      <div>
        <h2 style="margin-bottom: 1rem;">Recent Discussions</h2>
        ${postList}
      </div>
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h2>Communities</h2>
          <a href="/communities/new" class="btn btn-secondary" style="font-size: 0.875rem;">Create Community</a>
        </div>
        ${communityList}
      </div>
    </div>
  `);
}

// Community page
export function communityPage(community: any, posts: any[]): string {
  const config = JSON.parse(community.evaluation_config || '{}');

  const postList = posts.length > 0
    ? `<ul class="post-list">
        ${posts.map(p => `
          <li class="post-item" style="display: flex; gap: 0.75rem; align-items: flex-start;">
            ${renderAvatar(p.author_cloaked ? null : p.author_avatar, 32)}
            <div>
              <a href="/c/${community.name}/p/${p.id}" class="post-title">${escapeHtml(p.title)}</a>
              <p class="meta">
                by ${p.author_cloaked ? '<em>anonymous</em>' : (p.author_username || 'unknown')}
                &bull; ${p.comment_count} comments
                &bull; ${formatTime(p.created_at)}
              </p>
            </div>
          </li>
        `).join('')}
      </ul>`
    : '<p class="meta">No posts yet. Start a discussion!</p>';

  return layout(community.display_name, `
    <div class="card">
      <h1>${community.display_name}</h1>
      <p style="margin: 1rem 0;">${escapeHtml(community.description || '')}</p>
      <div class="stats-bar">
        <div class="stat">
          <span class="stat-value">${community.member_count}</span>
          <span class="stat-label">members</span>
        </div>
        <div class="stat">
          <span class="stat-value">${community.post_count}</span>
          <span class="stat-label">posts</span>
        </div>
      </div>
      ${community.min_level_to_post ? `<p class="meta">Level ${community.min_level_to_post}+ required to post</p>` : ''}
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; margin: 2rem 0 1rem;">
      <h2>Posts</h2>
      <a href="/c/${community.name}/new" class="btn">New Post</a>
    </div>

    ${postList}
  `);
}

// Post page
export function postPage(post: any, comments: any[]): string {
  const commentTree = comments.map(c => `
    <div class="comment" style="--depth: ${c.depth}" data-id="${c.id}">
      <div style="display: flex; gap: 0.75rem;">
        ${renderAvatar(c.author_cloaked && !c.force_uncloaked ? null : c.author_avatar, 28)}
        <div style="flex: 1;">
          <div class="meta">
            ${c.author_cloaked && !c.force_uncloaked ? '<em>anonymous</em>' : (c.author_username || 'unknown')}
            &bull; ${formatTime(c.created_at)}
            ${c.sentiment ? `&bull; <span class="badge">${c.sentiment}</span>` : ''}
          </div>
          <div class="comment-content markdown-content" data-raw="${escapeHtml(c.content).replace(/"/g, '&quot;')}">${escapeHtml(c.content)}</div>
          <div class="comment-actions">
            <button class="reply-btn" onclick="showReplyForm('${c.id}')">Reply</button>
          </div>
        </div>
      </div>
      <div id="reply-form-${c.id}" class="reply-form-container" style="display: none;"></div>
    </div>
  `).join('');

  return layout(post.title, `
    <div style="margin-bottom: 1rem;">
      <a href="/c/${post.community_name}">&larr; ${post.community_display_name}</a>
    </div>

    <article class="card">
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <h1 style="margin-bottom: 1rem;">${escapeHtml(post.title)}</h1>
        <button id="editPostBtn" class="btn btn-secondary" style="display: none; font-size: 0.875rem;" onclick="showEditPost()">Edit</button>
      </div>
      <div style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1rem;">
        ${renderAvatar(post.author_cloaked ? null : post.author_avatar, 40)}
        <p class="meta" style="margin: 0;">
          by ${post.author_cloaked ? '<em>anonymous</em>' : (post.author_username || 'unknown')}
          &bull; ${formatTime(post.created_at)}
          ${post.edited_at ? `&bull; <em>edited ${formatTime(post.edited_at)}</em>` : ''}
          &bull; ${post.comment_count} comments
        </p>
      </div>
      <div id="postContent" class="markdown-content" data-raw="${escapeHtml(post.content).replace(/"/g, '&quot;')}">${escapeHtml(post.content)}</div>
      <div id="editPostForm" style="display: none;">
        <textarea id="editPostContent" rows="6" style="width: 100%; margin-bottom: 1rem;">${escapeHtml(post.content)}</textarea>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn" onclick="savePostEdit()">Save Changes</button>
          <button class="btn btn-secondary" onclick="cancelPostEdit()">Cancel</button>
        </div>
      </div>
    </article>

    <div style="margin: 2rem 0 1rem;">
      <h2>Comments (${comments.length})</h2>
    </div>

    <!-- Comment form -->
    <div id="comment-section">
      <div id="auth-required-comment" style="display: none;" class="card">
        <p>Sign in to join the discussion.</p>
        <a href="https://auth.entrained.ai?return_to=https://goodfaith.entrained.ai/c/${post.community_name}/p/${post.id}" class="btn" style="margin-top: 0.5rem;">Sign In</a>
      </div>

      <form id="commentForm" class="card" style="display: none;">
        <div id="comment-error" class="error" style="display: none;"></div>
        <div id="replying-to" style="display: none; margin-bottom: 0.75rem; padding: 0.5rem; background: var(--bg-tertiary); border-radius: 4px;">
          Replying to <span id="replying-to-text"></span>
          <button type="button" onclick="cancelReply()" style="margin-left: 0.5rem; color: var(--error); background: none; border: none; cursor: pointer;">✕</button>
        </div>
        <input type="hidden" id="parent_id" name="parent_id" value="">

        <div class="form-group">
          <textarea id="comment-content" name="content" rows="4" placeholder="Share your thoughts..." required></textarea>
        </div>

        <div class="form-group" style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
          <label style="margin: 0;">
            <input type="checkbox" id="comment-cloaked" name="cloaked">
            Post anonymously
          </label>
          <select id="comment-sentiment" name="sentiment" style="padding: 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">
            <option value="">No stance</option>
            <option value="agree">I agree</option>
            <option value="disagree">I disagree</option>
            <option value="neutral">Neutral/Mixed</option>
          </select>
        </div>

        <div id="sentiment-reasoning-group" class="form-group" style="display: none;">
          <label for="sentiment-reasoning">Why do you agree/disagree? (required)</label>
          <input type="text" id="sentiment-reasoning" name="sentiment_reasoning" placeholder="Brief explanation of your position">
        </div>

        <div id="eval-warning" style="display: none; margin-bottom: 1rem; padding: 1rem; background: rgba(245, 158, 11, 0.1); border: 1px solid var(--warning); border-radius: 8px;">
          <strong style="color: var(--warning);">Hold up!</strong>
          <p id="eval-warning-text" style="margin: 0.5rem 0; color: var(--text-secondary);"></p>
          <div id="eval-scores-display" style="margin: 0.5rem 0;"></div>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
            <button type="button" class="btn btn-secondary" onclick="dismissWarning()">Edit my comment</button>
            <button type="button" class="btn" style="background: var(--warning);" onclick="submitAnyway()">Post anyway</button>
          </div>
        </div>

        <button type="submit" class="btn">Post Comment</button>
      </form>
    </div>

    ${comments.length > 0 ? commentTree : '<p class="meta">No comments yet. Be the first to respond!</p>'}

    <style>
      .form-group { margin-bottom: 1rem; }
      .form-group textarea, .form-group input[type="text"] {
        width: 100%;
        padding: 0.75rem;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--text);
        font-family: inherit;
        font-size: 1rem;
      }
      .form-group textarea:focus, .form-group input:focus {
        outline: none;
        border-color: var(--accent);
      }
      .error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid var(--error);
        color: var(--error);
        padding: 0.75rem;
        border-radius: 8px;
        margin-bottom: 1rem;
      }
      .comment-actions {
        margin-top: 0.5rem;
      }
      .reply-btn {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 0.875rem;
        padding: 0;
      }
      .reply-btn:hover { color: var(--accent); }
      .reply-form-container {
        margin-top: 0.75rem;
        padding-left: 1rem;
        border-left: 2px solid var(--accent);
      }
      #editPostContent {
        padding: 0.75rem;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--text);
        font-family: inherit;
        font-size: 1rem;
      }
    </style>

    <script>
      const POST_ID = '${post.id}';
      const COMMUNITY = '${post.community_name}';
      const POST_AUTHOR_ID = '${post.author_id}';
      let token = localStorage.getItem('auth_token');
      let currentUser = null;

      (function() {
        const commentForm = document.getElementById('commentForm');
        const authRequired = document.getElementById('auth-required-comment');

        // Check auth
        if (!token) {
          authRequired.style.display = 'block';
        } else {
          commentForm.style.display = 'block';

          // Check if current user is post author for edit button
          const userData = localStorage.getItem('auth_user');
          if (userData) {
            try {
              currentUser = JSON.parse(userData);
              // We need to check against the profile, but for now show edit for logged in users
              // The API will reject if not owner
              document.getElementById('editPostBtn').style.display = 'block';
            } catch(e) {}
          }
        }

        // Sentiment reasoning toggle
        document.getElementById('comment-sentiment').addEventListener('change', (e) => {
          const group = document.getElementById('sentiment-reasoning-group');
          const input = document.getElementById('sentiment-reasoning');
          if (e.target.value === 'agree' || e.target.value === 'disagree') {
            group.style.display = 'block';
            input.required = true;
          } else {
            group.style.display = 'none';
            input.required = false;
          }
        });

        // Submit comment - with pre-evaluation
        let bypassWarning = false;

        commentForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = commentForm.querySelector('button[type="submit"]');
          const errorDiv = document.getElementById('comment-error');
          const content = document.getElementById('comment-content').value;

          if (!content.trim()) {
            errorDiv.textContent = 'Please enter a comment';
            errorDiv.style.display = 'block';
            return;
          }

          btn.disabled = true;
          errorDiv.style.display = 'none';

          // First, evaluate the content (unless bypassing)
          if (!bypassWarning) {
            btn.textContent = 'Checking...';

            try {
              const evalRes = await fetch('/api/evaluate', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                  content: content,
                  type: 'comment',
                  context: {
                    thread_summary: document.querySelector('h1')?.textContent || ''
                  }
                })
              });

              const evalData = await evalRes.json();

              if (evalRes.ok && evalData.data?.evaluation) {
                const scores = evalData.data.evaluation.scores;
                const flags = evalData.data.evaluation.flags || [];

                // Check if we need to warn the user (scores are 0-100)
                const needsWarning = scores.good_faith < 50 ||
                                     scores.substantive < 30 ||
                                     flags.some(f => f.type === 'ad_hominem') ||
                                     flags.some(f => f.type === 'strawman') ||
                                     flags.some(f => f.type === 'inflammatory');

                if (needsWarning) {
                  // Show warning
                  const warningDiv = document.getElementById('eval-warning');
                  const warningText = document.getElementById('eval-warning-text');
                  const scoresDiv = document.getElementById('eval-scores-display');

                  let message = 'This comment may not contribute positively to the discussion.';
                  if (flags.length > 0) {
                    const flagTypes = flags.map(f => f.type).join(', ').replace(/_/g, ' ');
                    message = 'Detected: ' + flagTypes + '.';
                  }
                  if (evalData.data.evaluation.suggestions?.length > 0) {
                    message += ' ' + evalData.data.evaluation.suggestions[0];
                  }

                  warningText.textContent = message;
                  scoresDiv.innerHTML = \`
                    <span class="score-badge \${getScoreClass100(scores.good_faith)}">Good Faith: \${Math.round(scores.good_faith)}%</span>
                    <span class="score-badge \${getScoreClass100(scores.substantive)}">Substance: \${Math.round(scores.substantive)}%</span>
                  \`;

                  warningDiv.style.display = 'block';
                  btn.disabled = false;
                  btn.textContent = 'Post Comment';
                  return;
                }
              }
            } catch (err) {
              // If evaluation fails, proceed anyway
              console.warn('Evaluation failed:', err);
            }
          }

          // Actually submit the comment
          btn.textContent = 'Posting...';
          bypassWarning = false; // Reset for next time

          try {
            const body = {
              content: content,
              cloaked: document.getElementById('comment-cloaked').checked
            };

            const parentId = document.getElementById('parent_id').value;
            if (parentId) body.parent_id = parentId;

            const sentiment = document.getElementById('comment-sentiment').value;
            if (sentiment) {
              body.sentiment = sentiment;
              if (sentiment === 'agree' || sentiment === 'disagree') {
                body.sentiment_reasoning = document.getElementById('sentiment-reasoning').value;
              }
            }

            const res = await fetch('/api/c/' + COMMUNITY + '/posts/' + POST_ID + '/comments', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
              },
              body: JSON.stringify(body)
            });

            const data = await res.json();

            if (!res.ok) {
              throw new Error(data.error || 'Failed to post comment');
            }

            // Reload page to show new comment
            window.location.reload();
          } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Post Comment';
            errorDiv.textContent = err.message;
            errorDiv.style.display = 'block';
          }
        });

        // Make bypassWarning accessible to onclick handlers
        window.bypassWarning = false;
        window.submitAnyway = function() {
          bypassWarning = true;
          document.getElementById('eval-warning').style.display = 'none';
          document.getElementById('commentForm').dispatchEvent(new Event('submit'));
        };
        window.dismissWarning = function() {
          document.getElementById('eval-warning').style.display = 'none';
          document.getElementById('comment-content').focus();
        };
      })();

      function getScoreClass100(score) {
        if (score >= 70) return 'score-good';
        if (score >= 40) return 'score-mid';
        return 'score-low';
      }

      function showReplyForm(commentId) {
        if (!token) {
          alert('Please sign in to reply');
          return;
        }

        // Set parent ID
        document.getElementById('parent_id').value = commentId;
        document.getElementById('replying-to').style.display = 'block';
        document.getElementById('replying-to-text').textContent = 'comment...';

        // Scroll to and focus the form
        document.getElementById('commentForm').scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => document.getElementById('comment-content').focus(), 300);
      }

      function cancelReply() {
        document.getElementById('parent_id').value = '';
        document.getElementById('replying-to').style.display = 'none';
      }

      function showEditPost() {
        document.getElementById('postContent').style.display = 'none';
        document.getElementById('editPostForm').style.display = 'block';
        document.getElementById('editPostBtn').style.display = 'none';
      }

      function cancelPostEdit() {
        document.getElementById('postContent').style.display = 'block';
        document.getElementById('editPostForm').style.display = 'none';
        document.getElementById('editPostBtn').style.display = 'block';
      }

      async function savePostEdit() {
        const content = document.getElementById('editPostContent').value;

        try {
          const res = await fetch('/api/c/' + COMMUNITY + '/posts/' + POST_ID, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ content })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || 'Failed to update post');
          }

          // Reload to show updated content
          window.location.reload();
        } catch (err) {
          alert('Error: ' + err.message);
        }
      }
    </script>
  `);
}

// About page
export function aboutPage(): string {
  return layout('About', `
    <div style="max-width: 700px; margin: 0 auto;">
      <h1 style="margin-bottom: 1.5rem;">About GoodFaith</h1>

      <p style="font-size: 1.125rem; margin-bottom: 2rem;">
        GoodFaith is a research experiment by <a href="https://entrained.ai">Entrained AI Research Institute</a>
        exploring how AI can improve the quality of human discourse.
      </p>

      <h2 style="margin: 2rem 0 1rem;">The Hypothesis</h2>
      <p>
        Most social platforms optimize for engagement and consensus. We're testing whether
        AI-mediated evaluation of discourse quality (not popularity) can create better conversations.
      </p>

      <h2 style="margin: 2rem 0 1rem;">How It Works</h2>
      <p>Instead of upvotes/downvotes, our AI evaluates comments for:</p>
      <ul style="margin: 1rem 0; padding-left: 1.5rem;">
        <li><strong>Good faith engagement</strong> - genuine vs. trolling</li>
        <li><strong>Substantive contribution</strong> - adds new perspective</li>
        <li><strong>Charitable interpretation</strong> - engages with strongest arguments</li>
        <li><strong>Source quality</strong> - credible evidence</li>
      </ul>
      <p>Your "reputation" reflects how you engage, not what you believe.</p>

      <h2 style="margin: 2rem 0 1rem;">Why Participate?</h2>
      <ul style="margin: 1rem 0; padding-left: 1.5rem;">
        <li>Help us research AI-mediated collaboration</li>
        <li>Engage in serious technical discussions</li>
        <li>Experiment with novel discourse mechanics</li>
        <li>Influence the future of online discussion</li>
      </ul>

      <h2 style="margin: 2rem 0 1rem;">Current Status</h2>
      <p>
        <span class="badge alpha">Alpha Research Version</span> - Expect bugs, changes, and evolution.
        Your feedback shapes this experiment.
      </p>

      <p style="margin-top: 2rem; color: var(--text-secondary);">
        Built by <a href="https://entrained.ai/about">Christian Bernier</a>
      </p>
    </div>
  `);
}

// How it works page
export function howItWorksPage(): string {
  return layout('How It Works', `
    <div style="max-width: 700px; margin: 0 auto;">
      <h1 style="margin-bottom: 1.5rem;">How GoodFaith Works</h1>

      <div class="card">
        <h3>1. Write Your Thoughts</h3>
        <p>Post or comment just like any other platform. Express your ideas freely.</p>
      </div>

      <div class="card">
        <h3>2. AI Evaluation</h3>
        <p>
          Before you submit, AI evaluates your content on four dimensions:
          good faith, substance, charity, and source quality.
          You see the predicted impact on your stats.
        </p>
      </div>

      <div class="card">
        <h3>3. Temperature Check</h3>
        <p>
          If the AI detects potential issues (strawman arguments, ad hominem attacks, unsourced claims),
          you'll see a warning with suggestions for improvement. You can revise or submit anyway.
        </p>
      </div>

      <div class="card">
        <h3>4. Build Reputation</h3>
        <p>
          Good faith engagement improves your stats and level. Unlock abilities like
          "Citation Needed" flags, "Steelman" requests, and more.
        </p>
      </div>

      <div class="card">
        <h3>5. Cloaking System</h3>
        <p>
          You can post anonymously ("cloaked"), but bad faith behavior reduces your cloak quota.
          If it drops too low, the system may randomly reveal your identity.
          This creates accountability without full transparency.
        </p>
      </div>

      <h2 style="margin: 2rem 0 1rem;">The Difference</h2>

      <div class="grid" style="gap: 1rem;">
        <div class="card">
          <h4 style="color: var(--error);">Traditional Platforms</h4>
          <ul style="margin-top: 0.5rem; padding-left: 1.5rem; color: var(--text-secondary);">
            <li>Popular opinions rise</li>
            <li>Early votes determine visibility</li>
            <li>In-group signaling</li>
            <li>Anonymous voting without accountability</li>
          </ul>
        </div>
        <div class="card">
          <h4 style="color: var(--success);">GoodFaith</h4>
          <ul style="margin-top: 0.5rem; padding-left: 1.5rem; color: var(--text-secondary);">
            <li>Quality arguments rise</li>
            <li>Evaluation is consistent</li>
            <li>Unpopular but well-reasoned views valued</li>
            <li>Accountability with optional privacy</li>
          </ul>
        </div>
      </div>

      <div style="margin-top: 2rem; text-align: center;">
        <a href="https://auth.entrained.ai" class="btn" style="font-size: 1.125rem; padding: 0.75rem 1.5rem;">
          Join the Experiment
        </a>
      </div>
    </div>
  `);
}

// Create community page
export function createCommunityPage(): string {
  return layout('Create Community', `
    <div style="max-width: 600px; margin: 0 auto;">
      <h1 style="margin-bottom: 1.5rem;">Create a Community</h1>

      <div id="auth-required" style="display: none;">
        <div class="card">
          <p>You need to be signed in to create a community.</p>
          <a href="https://auth.entrained.ai?return_to=https://goodfaith.entrained.ai/communities/new" class="btn" style="margin-top: 1rem;">Sign In</a>
        </div>
      </div>

      <form id="createForm" class="card" style="display: none;">
        <div id="error" class="error" style="display: none;"></div>

        <div class="form-group">
          <label for="name">URL Name</label>
          <input type="text" id="name" name="name" placeholder="e.g., ai-research" required pattern="[a-z0-9-]{3,50}">
          <p class="hint">3-50 lowercase letters, numbers, or hyphens. This will be in the URL.</p>
        </div>

        <div class="form-group">
          <label for="display_name">Display Name</label>
          <input type="text" id="display_name" name="display_name" placeholder="e.g., AI Research Discussion" required>
        </div>

        <div class="form-group">
          <label for="description">Description</label>
          <textarea id="description" name="description" rows="3" placeholder="What is this community about?"></textarea>
        </div>

        <details style="margin-bottom: 1rem;">
          <summary style="cursor: pointer; color: var(--text-secondary);">Advanced Options</summary>
          <div style="margin-top: 1rem;">
            <div class="form-group">
              <label for="min_level">Minimum Level to Post</label>
              <input type="number" id="min_level" name="min_level" min="1" max="10" placeholder="Leave empty for no restriction">
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" id="require_sources" name="require_sources">
                Require sources for factual claims
              </label>
            </div>
          </div>
        </details>

        <button type="submit" class="btn">Create Community</button>
      </form>

      <a href="/" class="return-link">&larr; Back to home</a>
    </div>

    <style>
      .form-group { margin-bottom: 1.25rem; }
      .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
      .form-group input, .form-group textarea {
        width: 100%;
        padding: 0.75rem;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--text);
        font-family: inherit;
        font-size: 1rem;
      }
      .form-group input:focus, .form-group textarea:focus {
        outline: none;
        border-color: var(--accent);
      }
      .form-group .hint {
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin-top: 0.25rem;
      }
      .error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid var(--error);
        color: var(--error);
        padding: 0.75rem;
        border-radius: 8px;
        margin-bottom: 1rem;
      }
      .return-link {
        display: block;
        text-align: center;
        margin-top: 1.5rem;
        color: var(--text-secondary);
      }
      details summary { font-weight: 500; }
      input[type="checkbox"] { margin-right: 0.5rem; }
    </style>

    <script>
      (function() {
        const token = localStorage.getItem('auth_token');
        const form = document.getElementById('createForm');
        const authRequired = document.getElementById('auth-required');

        if (!token) {
          authRequired.style.display = 'block';
          return;
        }

        form.style.display = 'block';

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = form.querySelector('button');
          const errorDiv = document.getElementById('error');

          btn.disabled = true;
          btn.textContent = 'Creating...';
          errorDiv.style.display = 'none';

          try {
            const res = await fetch('/api/communities', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
              },
              body: JSON.stringify({
                name: form.name.value.toLowerCase(),
                display_name: form.display_name.value,
                description: form.description.value || undefined,
                min_level_to_post: form.min_level.value ? parseInt(form.min_level.value) : undefined,
                require_sources_for_claims: form.require_sources.checked
              })
            });

            const data = await res.json();

            if (!res.ok) {
              throw new Error(data.error || 'Failed to create community');
            }

            // Redirect to new community
            window.location.href = '/c/' + data.data.name;
          } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Create Community';
            errorDiv.textContent = err.message;
            errorDiv.style.display = 'block';
          }
        });
      })();
    </script>
  `);
}

// Create post page
export function createPostPage(community: any): string {
  return layout(`New Post in ${community.display_name}`, `
    <div style="max-width: 700px; margin: 0 auto;">
      <div style="margin-bottom: 1.5rem;">
        <a href="/c/${community.name}">&larr; ${community.display_name}</a>
      </div>

      <h1 style="margin-bottom: 1.5rem;">New Post</h1>

      <div id="auth-required" style="display: none;">
        <div class="card">
          <p>You need to be signed in to create a post.</p>
          <a href="https://auth.entrained.ai?return_to=https://goodfaith.entrained.ai/c/${community.name}/new" class="btn" style="margin-top: 1rem;">Sign In</a>
        </div>
      </div>

      <form id="postForm" class="card" style="display: none;">
        <div id="error" class="error" style="display: none;"></div>

        <div class="form-group">
          <label for="title">Title</label>
          <input type="text" id="title" name="title" placeholder="What do you want to discuss?" required maxlength="300">
        </div>

        <div class="form-group">
          <label for="content">Content</label>
          <textarea id="content" name="content" rows="8" placeholder="Share your thoughts, questions, or ideas..."></textarea>
          <p class="hint">Markdown supported. Be substantive and engage in good faith.</p>
        </div>

        <div class="form-group">
          <label>
            <input type="checkbox" id="cloaked" name="cloaked">
            Post anonymously (cloaked)
          </label>
          <p class="hint" style="margin-left: 1.5rem;">Your identity will be hidden, but bad faith behavior may reveal it.</p>
        </div>

        <div id="evaluation-preview" style="display: none; margin-bottom: 1rem;">
          <div class="card" style="background: var(--bg-tertiary);">
            <h4 style="margin-bottom: 0.5rem;">AI Evaluation Preview</h4>
            <div id="eval-scores"></div>
            <div id="eval-suggestions" style="margin-top: 0.5rem; color: var(--text-secondary);"></div>
          </div>
        </div>

        <div style="display: flex; gap: 1rem;">
          <button type="button" id="previewBtn" class="btn btn-secondary">Preview Evaluation</button>
          <button type="submit" class="btn">Create Post</button>
        </div>
      </form>
    </div>

    <style>
      .form-group { margin-bottom: 1.25rem; }
      .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
      .form-group input[type="text"], .form-group textarea {
        width: 100%;
        padding: 0.75rem;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--text);
        font-family: inherit;
        font-size: 1rem;
      }
      .form-group input:focus, .form-group textarea:focus {
        outline: none;
        border-color: var(--accent);
      }
      .form-group .hint {
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin-top: 0.25rem;
      }
      .error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid var(--error);
        color: var(--error);
        padding: 0.75rem;
        border-radius: 8px;
        margin-bottom: 1rem;
      }
      input[type="checkbox"] { margin-right: 0.5rem; }
    </style>

    <script>
      (function() {
        const token = localStorage.getItem('auth_token');
        const form = document.getElementById('postForm');
        const authRequired = document.getElementById('auth-required');

        if (!token) {
          authRequired.style.display = 'block';
          return;
        }

        form.style.display = 'block';

        // Preview evaluation
        document.getElementById('previewBtn').addEventListener('click', async () => {
          const btn = document.getElementById('previewBtn');
          const content = document.getElementById('content').value;
          const title = document.getElementById('title').value;

          if (!title || !content) {
            alert('Please enter a title and content first');
            return;
          }

          btn.disabled = true;
          btn.textContent = 'Evaluating...';

          try {
            const res = await fetch('/api/evaluate', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
              },
              body: JSON.stringify({
                content: title + '\\n\\n' + content,
                type: 'post'
              })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Evaluation failed');

            const evalPreview = document.getElementById('evaluation-preview');
            const scores = data.data.evaluation.scores;

            document.getElementById('eval-scores').innerHTML = \`
              <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <span class="score-badge \${getScoreClass(scores.good_faith)}">Good Faith: \${Math.round(scores.good_faith)}%</span>
                <span class="score-badge \${getScoreClass(scores.substantive)}">Substance: \${Math.round(scores.substantive)}%</span>
                <span class="score-badge \${getScoreClass(scores.charitable)}">Charity: \${Math.round(scores.charitable)}%</span>
                <span class="score-badge \${getScoreClass(scores.source_quality)}">Sources: \${Math.round(scores.source_quality)}%</span>
              </div>
            \`;

            if (data.data.evaluation.suggestions && data.data.evaluation.suggestions.length > 0) {
              document.getElementById('eval-suggestions').innerHTML =
                '<strong>Suggestions:</strong> ' + data.data.evaluation.suggestions.join(', ');
            }

            evalPreview.style.display = 'block';
          } catch (err) {
            alert('Evaluation failed: ' + err.message);
          } finally {
            btn.disabled = false;
            btn.textContent = 'Preview Evaluation';
          }
        });

        function getScoreClass(score) {
          if (score >= 70) return 'score-good';
          if (score >= 40) return 'score-mid';
          return 'score-low';
        }

        // Submit form
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = form.querySelector('button[type="submit"]');
          const errorDiv = document.getElementById('error');

          btn.disabled = true;
          btn.textContent = 'Creating...';
          errorDiv.style.display = 'none';

          try {
            const res = await fetch('/api/c/${community.name}/posts', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
              },
              body: JSON.stringify({
                title: form.title.value,
                content: form.content.value,
                cloaked: form.cloaked.checked
              })
            });

            const data = await res.json();

            if (!res.ok) {
              throw new Error(data.error || 'Failed to create post');
            }

            // Redirect to new post
            window.location.href = '/c/${community.name}/p/' + data.data.id;
          } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Create Post';
            errorDiv.textContent = err.message;
            errorDiv.style.display = 'block';
          }
        });
      })();
    </script>
  `);
}

// Helpers
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderAvatar(avatarUrl: string | null | undefined, size: number): string {
  const style = `width: ${size}px; height: ${size}px; border-radius: 50%; flex-shrink: 0;`;
  if (avatarUrl) {
    return `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="${style} object-fit: cover; background: var(--bg-tertiary);">`;
  }
  // Default avatar - gray circle with user icon
  return `<div style="${style} background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: ${Math.round(size * 0.5)}px;">👤</div>`;
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}
