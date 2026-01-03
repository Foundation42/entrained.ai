// Prometheus REPL - Jupyter-inspired Intent Notebook
export function replPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prometheus REPL - Intent-Driven Computation</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --bg-cell: #0d1117;
      --text: #c9d1d9;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --accent: #58a6ff;
      --accent-hover: #79b8ff;
      --success: #3fb950;
      --warning: #d29922;
      --error: #f85149;
      --border: #30363d;
      --border-active: #58a6ff;
      --code-bg: #161b22;
      --output-bg: #0d1117;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }

    .mono {
      font-family: 'JetBrains Mono', 'Consolas', monospace;
    }

    /* Layout */
    .app {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1.5rem;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 600;
      font-size: 1.1rem;
    }

    .logo-icon {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, var(--accent), #a855f7);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.9rem;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .stats {
      font-size: 0.8rem;
      color: var(--text-secondary);
      display: flex;
      gap: 1rem;
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .stat-value {
      color: var(--accent);
      font-weight: 500;
    }

    /* Main content */
    main {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
    }

    .notebook {
      max-width: 1000px;
      margin: 0 auto;
    }

    /* Cell styles */
    .cell {
      margin-bottom: 1rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg-cell);
      transition: border-color 0.2s;
    }

    .cell:hover {
      border-color: var(--border-active);
    }

    .cell.active {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }

    .cell-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 0.75rem;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      border-radius: 8px 8px 0 0;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .cell-type {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .cell-type-badge {
      padding: 0.15rem 0.5rem;
      background: var(--bg-tertiary);
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 500;
      letter-spacing: 0.05em;
    }

    .cell-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-muted);
    }

    .status-dot.running {
      background: var(--warning);
      animation: pulse 1s infinite;
    }

    .status-dot.success {
      background: var(--success);
    }

    .status-dot.error {
      background: var(--error);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .cell-actions {
      display: flex;
      gap: 0.25rem;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .cell:hover .cell-actions {
      opacity: 1;
    }

    .cell-btn {
      padding: 0.25rem 0.5rem;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      border-radius: 4px;
      font-size: 0.75rem;
      transition: all 0.15s;
    }

    .cell-btn:hover {
      background: var(--bg-tertiary);
      color: var(--text);
    }

    .cell-btn.run {
      color: var(--success);
    }

    .cell-btn.run:hover {
      background: rgba(63, 185, 80, 0.15);
    }

    /* Code editor area */
    .cell-editor {
      position: relative;
      min-height: 60px;
    }

    .editor-container {
      width: 100%;
      min-height: 60px;
    }

    /* Monaco overrides */
    .monaco-editor {
      padding-top: 0.5rem !important;
    }

    /* Simple textarea fallback */
    .code-textarea {
      width: 100%;
      min-height: 60px;
      padding: 0.75rem 1rem;
      background: transparent;
      border: none;
      color: var(--text);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
      line-height: 1.5;
      resize: vertical;
      outline: none;
    }

    .code-textarea::placeholder {
      color: var(--text-muted);
    }

    /* Output area */
    .cell-output {
      border-top: 1px solid var(--border);
      padding: 0.75rem 1rem;
      background: var(--output-bg);
      border-radius: 0 0 8px 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      max-height: 400px;
      overflow-y: auto;
    }

    .output-label {
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 0.25rem;
    }

    .output-result {
      color: var(--success);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .output-error {
      color: var(--error);
      white-space: pre-wrap;
    }

    .output-timing {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.5rem;
    }

    .output-meta {
      display: flex;
      gap: 1rem;
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px dashed var(--border);
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .output-meta span {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    /* Function card in output */
    .fn-card {
      display: flex;
      gap: 0.75rem;
      padding: 0.5rem;
      background: var(--bg-secondary);
      border-radius: 6px;
      margin-top: 0.5rem;
    }

    .fn-icon {
      width: 40px;
      height: 40px;
      border-radius: 6px;
      background: var(--bg-tertiary);
    }

    .fn-info {
      flex: 1;
    }

    .fn-name {
      font-weight: 500;
      color: var(--accent);
    }

    .fn-sig {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    /* Add cell button */
    .add-cell {
      display: flex;
      justify-content: center;
      padding: 0.75rem;
      margin: 1rem 0;
    }

    .add-cell-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--bg-secondary);
      border: 1px dashed var(--border);
      border-radius: 6px;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.2s;
    }

    .add-cell-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: rgba(88, 166, 255, 0.05);
    }

    /* Toolbar */
    .toolbar {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .toolbar-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.15s;
    }

    .toolbar-btn:hover {
      background: var(--bg-tertiary);
      border-color: var(--accent);
    }

    .toolbar-btn.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }

    .toolbar-btn.primary:hover {
      background: var(--accent-hover);
    }

    /* Search panel */
    .search-panel {
      position: fixed;
      top: 60px;
      right: 1.5rem;
      width: 350px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      z-index: 100;
      display: none;
    }

    .search-panel.open {
      display: block;
    }

    .search-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
    }

    .search-input {
      flex: 1;
      padding: 0.5rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text);
      font-size: 0.9rem;
      outline: none;
    }

    .search-input:focus {
      border-color: var(--accent);
    }

    .search-results {
      max-height: 400px;
      overflow-y: auto;
    }

    .search-result {
      display: flex;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.15s;
      align-items: flex-start;
    }

    .search-result:hover {
      background: var(--bg-tertiary);
    }

    .search-result-icon {
      width: 40px;
      height: 40px;
      border-radius: 6px;
      background: var(--bg-tertiary);
      flex-shrink: 0;
    }

    .search-result-info {
      flex: 1;
      min-width: 0;
    }

    .search-result-name {
      font-weight: 500;
      color: var(--accent);
    }

    .search-result-sig {
      font-size: 0.8rem;
      color: var(--text-secondary);
      font-family: 'JetBrains Mono', monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .search-result-score {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    /* Keyboard shortcuts hint */
    .shortcuts-hint {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    kbd {
      padding: 0.15rem 0.4rem;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 3px;
      font-family: inherit;
    }

    /* Loading overlay */
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(13, 17, 23, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      display: none;
    }

    .loading-overlay.active {
      display: flex;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Responsive */
    @media (max-width: 768px) {
      header {
        padding: 0.5rem 1rem;
      }
      main {
        padding: 1rem;
      }
      .search-panel {
        left: 1rem;
        right: 1rem;
        width: auto;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <div class="logo">
        <div class="logo-icon">P</div>
        <span>Prometheus REPL</span>
      </div>
      <div class="header-actions">
        <div class="stats">
          <div class="stat">
            <span>Functions:</span>
            <span class="stat-value" id="statFunctions">-</span>
          </div>
          <div class="stat">
            <span>Cache:</span>
            <span class="stat-value" id="statCache">-</span>
          </div>
        </div>
        <button class="toolbar-btn" onclick="toggleSearch()">Search</button>
      </div>
    </header>

    <main>
      <div class="notebook" id="notebook">
        <div class="toolbar">
          <button class="toolbar-btn primary" onclick="runAllCells()">Run All</button>
          <button class="toolbar-btn" onclick="addCell('code')">+ Code</button>
          <button class="toolbar-btn" onclick="clearOutputs()">Clear Outputs</button>
        </div>

        <div id="cells"></div>

        <div class="add-cell">
          <button class="add-cell-btn" onclick="addCell('code')">
            + Add Cell
          </button>
        </div>
      </div>
    </main>

    <!-- Search panel -->
    <div class="search-panel" id="searchPanel">
      <div class="search-header">
        <input type="text" class="search-input" id="searchInput" placeholder="Search functions..." oninput="debounceSearch()">
        <button class="cell-btn" onclick="toggleSearch()">Close</button>
      </div>
      <div class="search-results" id="searchResults"></div>
    </div>

    <!-- Keyboard hints -->
    <div class="shortcuts-hint">
      <kbd>Shift</kbd>+<kbd>Enter</kbd> run cell
    </div>

    <!-- Loading overlay -->
    <div class="loading-overlay" id="loadingOverlay">
      <div class="spinner"></div>
    </div>
  </div>

  <script>
    // State
    let cells = [];
    let activeCell = null;
    let searchTimeout = null;

    // Initialize with a welcome cell
    function init() {
      addCell('code', '(define fib (intent "fibonacci"))');
      addCell('code', '(fib 10)');
      loadStats();
    }

    // Add a new cell
    function addCell(type = 'code', content = '') {
      const id = 'cell-' + Date.now();
      const cell = {
        id,
        type,
        content,
        output: null,
        status: 'idle',
      };
      cells.push(cell);
      renderCells();
      focusCell(id);
      return id;
    }

    // Remove a cell
    function removeCell(id) {
      cells = cells.filter(c => c.id !== id);
      renderCells();
    }

    // Focus a cell
    function focusCell(id) {
      activeCell = id;
      document.querySelectorAll('.cell').forEach(el => {
        el.classList.toggle('active', el.dataset.id === id);
      });
      const textarea = document.querySelector(\`.cell[data-id="\${id}"] .code-textarea\`);
      if (textarea) textarea.focus();
    }

    // Render all cells
    function renderCells() {
      const container = document.getElementById('cells');
      container.innerHTML = cells.map(cell => renderCell(cell)).join('');
    }

    // Render a single cell
    function renderCell(cell) {
      const statusClass = cell.status !== 'idle' ? cell.status : '';
      const outputHtml = cell.output ? renderOutput(cell.output) : '';

      return \`
        <div class="cell \${cell.id === activeCell ? 'active' : ''}" data-id="\${cell.id}" onclick="focusCell('\${cell.id}')">
          <div class="cell-header">
            <div class="cell-type">
              <span class="cell-type-badge">\${cell.type}</span>
              <div class="cell-status">
                <div class="status-dot \${statusClass}"></div>
                <span>\${cell.status}</span>
              </div>
            </div>
            <div class="cell-actions">
              <button class="cell-btn run" onclick="event.stopPropagation(); runCell('\${cell.id}')">Run</button>
              <button class="cell-btn" onclick="event.stopPropagation(); removeCell('\${cell.id}')">Delete</button>
            </div>
          </div>
          <div class="cell-editor">
            <textarea
              class="code-textarea mono"
              placeholder="Enter LISP code or intent..."
              onkeydown="handleKeydown(event, '\${cell.id}')"
              oninput="updateCellContent('\${cell.id}', this.value)"
            >\${escapeHtml(cell.content)}</textarea>
          </div>
          \${outputHtml}
        </div>
      \`;
    }

    // Render cell output
    function renderOutput(output) {
      if (!output) return '';

      let content = '';
      if (output.type === 'error') {
        content = \`<div class="output-error">\${escapeHtml(String(output.value))}</div>\`;
      } else if (output.type === 'compile') {
        // Compilation result with function card
        const data = output.value;
        content = \`
          <div class="output-result">Compiled: \${escapeHtml(data.expanded_intent || '')}</div>
          <div class="fn-card">
            <img class="fn-icon" src="/api/icon/\${data.hash}" onerror="this.style.display='none'">
            <div class="fn-info">
              <div class="fn-name">\${data.hash.slice(0, 12)}...</div>
              <div class="fn-sig">\${escapeHtml(data.signature || '?')}</div>
            </div>
          </div>
          <div class="output-meta">
            <span>\${data.size} bytes</span>
            <span>\${data.cached ? 'cached' : 'compiled'}</span>
          </div>
        \`;
      } else {
        content = \`<div class="output-result">\${escapeHtml(formatValue(output.value))}</div>\`;
      }

      const timing = output.timing_ms !== undefined
        ? \`<div class="output-timing">\${output.timing_ms.toFixed(1)}ms</div>\`
        : '';

      return \`
        <div class="cell-output">
          <div class="output-label">Output</div>
          \${content}
          \${timing}
        </div>
      \`;
    }

    // Format output value
    function formatValue(value) {
      if (value === null || value === undefined) return 'nil';
      if (typeof value === 'object') return JSON.stringify(value, null, 2);
      return String(value);
    }

    // Update cell content
    function updateCellContent(id, content) {
      const cell = cells.find(c => c.id === id);
      if (cell) cell.content = content;
    }

    // Handle keyboard shortcuts
    function handleKeydown(event, cellId) {
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        runCell(cellId);
      }
    }

    // Run a cell
    async function runCell(id) {
      const cell = cells.find(c => c.id === id);
      if (!cell || !cell.content.trim()) return;

      cell.status = 'running';
      cell.output = null;
      renderCells();

      const start = Date.now();

      try {
        // Parse and determine what kind of expression this is
        const code = cell.content.trim();

        // Check if this is a define with intent
        if (code.includes('(intent')) {
          // Extract the intent string
          const intentMatch = code.match(/\\(intent\\s+"([^"]+)"\\)/);
          if (intentMatch) {
            const intent = intentMatch[1];
            const result = await compileIntent(intent);
            cell.output = {
              type: 'compile',
              value: result,
              timing_ms: Date.now() - start,
            };
          }
        } else if (code.startsWith('(search')) {
          // Handle search
          const queryMatch = code.match(/\\(search\\s+"([^"]+)"\\)/);
          if (queryMatch) {
            const results = await searchFunctions(queryMatch[1]);
            cell.output = {
              type: 'result',
              value: results,
              timing_ms: Date.now() - start,
            };
          }
        } else {
          // For now, show the code as-is (LISP eval would go here)
          cell.output = {
            type: 'result',
            value: 'LISP evaluation coming soon! Try: (define fib (intent "fibonacci"))',
            timing_ms: Date.now() - start,
          };
        }

        cell.status = 'success';
      } catch (error) {
        cell.output = {
          type: 'error',
          value: error.message,
          timing_ms: Date.now() - start,
        };
        cell.status = 'error';
      }

      renderCells();
    }

    // Compile an intent
    async function compileIntent(intent) {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Compilation failed');
      }

      return response.json();
    }

    // Search functions
    async function searchFunctions(query) {
      const response = await fetch(\`/api/search?q=\${encodeURIComponent(query)}&limit=10\`);
      return response.json();
    }

    // Run all cells
    async function runAllCells() {
      for (const cell of cells) {
        await runCell(cell.id);
      }
    }

    // Clear all outputs
    function clearOutputs() {
      cells.forEach(cell => {
        cell.output = null;
        cell.status = 'idle';
      });
      renderCells();
    }

    // Load stats
    async function loadStats() {
      try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        document.getElementById('statFunctions').textContent = data.total_functionlets || 0;
        document.getElementById('statCache').textContent = formatBytes(data.total_bytes || 0);
      } catch (e) {
        console.warn('Failed to load stats:', e);
      }
    }

    // Format bytes
    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    // Toggle search panel
    function toggleSearch() {
      const panel = document.getElementById('searchPanel');
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        document.getElementById('searchInput').focus();
      }
    }

    // Debounced search
    function debounceSearch() {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
        const query = document.getElementById('searchInput').value.trim();
        if (!query) {
          document.getElementById('searchResults').innerHTML = '';
          return;
        }

        try {
          const data = await searchFunctions(query);
          renderSearchResults(data.results || []);
        } catch (e) {
          console.error('Search failed:', e);
        }
      }, 300);
    }

    // Render search results
    function renderSearchResults(results) {
      const container = document.getElementById('searchResults');
      if (results.length === 0) {
        container.innerHTML = '<div class="search-result" style="color: var(--text-muted);">No results found</div>';
        return;
      }

      container.innerHTML = results.map(r => \`
        <div class="search-result" onclick="insertFunction('\${escapeHtml(r.hash)}', '\${escapeHtml(r.name)}')">
          <img class="search-result-icon" src="/api/icon/\${r.hash}" onerror="this.style.background='var(--bg-tertiary)'">
          <div class="search-result-info">
            <div class="search-result-name">\${escapeHtml(r.name || r.hash.slice(0, 12))}</div>
            <div class="search-result-sig">\${escapeHtml(r.signature || '?')}</div>
            <div class="search-result-score">\${(r.similarity * 100).toFixed(0)}% match · \${r.size || 0} bytes</div>
          </div>
        </div>
      \`).join('');
    }

    // Insert function reference into active cell
    function insertFunction(hash, name) {
      if (!activeCell) {
        addCell('code', \`; Using \${name}\\n(load "\${hash}")\`);
      } else {
        const cell = cells.find(c => c.id === activeCell);
        if (cell) {
          cell.content += \`\\n(load "\${hash}")\`;
          renderCells();
        }
      }
      toggleSearch();
    }

    // Escape HTML
    function escapeHtml(text) {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // Initialize
    init();
  </script>
</body>
</html>`;
}
