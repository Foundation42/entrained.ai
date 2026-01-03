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
  <script src="https://unpkg.com/monaco-editor@0.45.0/min/vs/loader.js"></script>
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
      min-height: 80px;
      background: var(--bg);
    }

    .editor-container {
      width: 100%;
      height: 80px;
      min-height: 60px;
    }

    /* Resize handle */
    .cell-resize {
      height: 6px;
      background: transparent;
      cursor: ns-resize;
      position: relative;
      transition: background 0.15s;
    }

    .cell-resize:hover,
    .cell-resize.dragging {
      background: var(--accent);
    }

    .cell-resize::after {
      content: '';
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 40px;
      height: 3px;
      background: var(--border);
      border-radius: 2px;
      transition: background 0.15s;
    }

    .cell-resize:hover::after {
      background: var(--accent);
    }

    .cell-output-wrapper {
      overflow: visible;
    }

    .cell-output-wrapper[style*="height"] {
      overflow: auto;
    }

    .cell-output-wrapper[style*="height"] .render-canvas,
    .cell-output-wrapper[style*="height"] .mandelbrot-canvas {
      max-height: none;
      height: auto;
    }

    .cell-output-wrapper[style*="height"] .cell-output {
      max-height: none;
      height: 100%;
    }

    .output-resize {
      border-radius: 0 0 8px 8px;
    }

    /* Monaco overrides */
    .monaco-editor,
    .monaco-editor .overflow-guard {
      border-radius: 0 0 8px 8px;
    }

    .monaco-editor .margin {
      background: var(--bg) !important;
    }

    /* Fallback textarea (shown while Monaco loads) */
    .code-textarea {
      width: 100%;
      min-height: 80px;
      padding: 0.75rem 1rem;
      background: var(--bg);
      border: none;
      color: var(--text);
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      line-height: 1.5;
      resize: none;
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

    /* Auto-render canvas */
    .render-canvas, .mandelbrot-canvas {
      width: 100%;
      max-width: 600px;
      aspect-ratio: 3/2;
      border-radius: 6px;
      background: #000;
      cursor: crosshair;
    }

    .render-info, .mandelbrot-info {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.5rem;
    }

    .fn-name {
      font-weight: 500;
      color: var(--accent);
    }

    .fn-sig {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .fn-category {
      font-size: 0.7rem;
      color: var(--success);
      background: rgba(63, 185, 80, 0.15);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      display: inline-block;
      margin-top: 0.25rem;
    }

    .renderer-type {
      font-size: 0.7rem;
      color: var(--warning);
      background: rgba(210, 153, 34, 0.15);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
    }

    .waveform-canvas {
      width: 100%;
      max-width: 600px;
      height: 120px;
      border-radius: 6px;
      margin-top: 0.5rem;
      background: var(--bg-secondary);
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

    /* Examples dropdown */
    .examples-dropdown {
      position: relative;
    }

    .examples-menu {
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 0.25rem;
      min-width: 320px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      z-index: 100;
      display: none;
    }

    .examples-menu.open {
      display: block;
    }

    .example-item {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.15s;
    }

    .example-item:last-child {
      border-bottom: none;
    }

    .example-item:hover {
      background: var(--bg-tertiary);
    }

    .example-title {
      font-weight: 500;
      color: var(--accent);
      margin-bottom: 0.25rem;
    }

    .example-desc {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .example-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
          <div class="examples-dropdown">
            <button class="toolbar-btn" onclick="toggleExamples()">Examples</button>
            <div class="examples-menu" id="examplesMenu"></div>
          </div>
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
    // ============================================
    // LISP Evaluator (embedded)
    // ============================================

    class LispSymbol {
      constructor(name) { this.name = name; }
      toString() { return this.name; }
    }

    function tokenize(source) {
      const pattern = /(\\(|\\)|"(?:[^"\\\\]|\\\\.)*"|;[^\\n]*|[^\\s()"';]+)/g;
      const tokens = [];
      let match;
      while ((match = pattern.exec(source)) !== null) {
        if (!match[0].startsWith(';')) tokens.push(match[0]);
      }
      return tokens;
    }

    function parseTokens(tokens, pos) {
      if (pos >= tokens.length) throw new SyntaxError('Unexpected end of input');
      const token = tokens[pos];
      if (token === '(') {
        const lst = [];
        pos++;
        while (pos < tokens.length && tokens[pos] !== ')') {
          const [expr, newPos] = parseTokens(tokens, pos);
          lst.push(expr);
          pos = newPos;
        }
        if (pos >= tokens.length) throw new SyntaxError('Missing )');
        return [lst, pos + 1];
      }
      if (token === ')') throw new SyntaxError('Unexpected )');
      if (token.startsWith('"')) {
        // Handle escape sequences: \\\\ -> \\, \\" -> ", \\n -> newline
        return [token.slice(1, -1).replace(/\\\\\\\\/g, '\\\\').replace(/\\\\"/g, '"').replace(/\\\\n/g, '\\n'), pos + 1];
      }
      if (token.includes('.')) {
        const n = parseFloat(token);
        if (!isNaN(n)) return [n, pos + 1];
      }
      const n = parseInt(token, 10);
      if (!isNaN(n)) return [n, pos + 1];
      return [new LispSymbol(token), pos + 1];
    }

    function parseLisp(source) {
      const tokens = tokenize(source);
      const exprs = [];
      let pos = 0;
      while (pos < tokens.length) {
        const [expr, newPos] = parseTokens(tokens, pos);
        exprs.push(expr);
        pos = newPos;
      }
      return exprs;
    }

    function exprToString(expr) {
      if (Array.isArray(expr)) return '(' + expr.map(exprToString).join(' ') + ')';
      if (typeof expr === 'string') return '"' + expr + '"';
      if (expr instanceof LispSymbol) return expr.name;
      return String(expr);
    }

    class Environment {
      constructor(parent) { this.bindings = new Map(); this.parent = parent; }
      get(name) {
        if (this.bindings.has(name)) return this.bindings.get(name);
        if (this.parent) return this.parent.get(name);
        throw new Error('Undefined: ' + name);
      }
      set(name, val) {
        if (this.bindings.has(name)) this.bindings.set(name, val);
        else if (this.parent) this.parent.set(name, val);
        else throw new Error('Cannot set undefined: ' + name);
      }
      define(name, val) { this.bindings.set(name, val); }
    }

    class Lambda {
      constructor(params, body, env) { this.params = params; this.body = body; this.env = env; }
      toString() { return '<lambda (' + this.params.map(p => p.name).join(' ') + ')>'; }
    }

    class LispEvaluator {
      constructor() {
        this.wasmCache = new Map();
        this.globalEnv = this.createGlobalEnv();
        this.stats = { intentsCompiled: 0, cacheHits: 0, totalCompileTimeMs: 0 };
        this.outputBuffer = [];

        // Shared WASM memory for modules that need imports
        this.sharedMemory = new WebAssembly.Memory({ initial: 256 }); // 16MB
        this.heapBase = 65536; // Start after first page to avoid WASM internals
        this.memoryOffset = this.heapBase;
      }

      // Reset memory allocator between top-level evaluations
      resetMemory() {
        this.memoryOffset = this.heapBase;
      }

      // Allocate space in WASM memory and copy array
      allocArray(memory, arr, elemType = 'i64') {
        const buffer = memory.buffer;
        const bytesPerElem = (elemType === 'i64' || elemType === 'f64') ? 8 : 4;
        const size = arr.length * bytesPerElem;

        // Align to 8 bytes
        this.memoryOffset = Math.ceil(this.memoryOffset / 8) * 8;
        const ptr = this.memoryOffset;
        this.memoryOffset += size;

        // Ensure we have enough memory
        const neededPages = Math.ceil((ptr + size) / 65536);
        if (neededPages > memory.buffer.byteLength / 65536) {
          memory.grow(neededPages - memory.buffer.byteLength / 65536 + 1);
        }

        // Copy data
        if (elemType === 'i64') {
          const view = new BigInt64Array(memory.buffer, ptr, arr.length);
          for (let i = 0; i < arr.length; i++) view[i] = BigInt(Math.floor(arr[i]));
        } else if (elemType === 'f64') {
          const view = new Float64Array(memory.buffer, ptr, arr.length);
          for (let i = 0; i < arr.length; i++) view[i] = arr[i];
        } else {
          const view = new Int32Array(memory.buffer, ptr, arr.length);
          for (let i = 0; i < arr.length; i++) view[i] = Math.floor(arr[i]);
        }

        return ptr;
      }

      // Read array from WASM memory
      readArray(memory, ptr, len, elemType = 'i64') {
        if (elemType === 'i64') {
          const view = new BigInt64Array(memory.buffer, ptr, len);
          return Array.from(view, v => Number(v));
        } else if (elemType === 'f64') {
          return Array.from(new Float64Array(memory.buffer, ptr, len));
        } else {
          return Array.from(new Int32Array(memory.buffer, ptr, len));
        }
      }

      // Parse signature to determine element type
      getArrayElemType(signature) {
        if (!signature) return 'i64';
        // Look for patterns like (i32, i32) for ptr+len with i32 elements
        // or (i64*, i32) etc. Default to i64 for safety
        if (signature.includes('f64')) return 'f64';
        if (signature.includes('i32') && !signature.includes('i64')) return 'i32';
        return 'i64';
      }

      createGlobalEnv() {
        const env = new Environment();
        const self = this;

        // Arithmetic
        env.define('+', (...a) => a.reduce((x, y) => x + y, 0));
        env.define('-', (a, b) => b === undefined ? -a : a - b);
        env.define('*', (...a) => a.reduce((x, y) => x * y, 1));
        env.define('/', (a, b) => a / b);
        env.define('mod', (a, b) => a % b);

        // Comparison
        env.define('=', (a, b) => a === b);
        env.define('<', (a, b) => a < b);
        env.define('>', (a, b) => a > b);
        env.define('<=', (a, b) => a <= b);
        env.define('>=', (a, b) => a >= b);

        // Lists
        env.define('list', (...a) => [...a]);
        env.define('car', l => l[0]);
        env.define('cdr', l => l.slice(1));
        env.define('cons', (a, l) => [a, ...l]);
        env.define('null?', l => l.length === 0);
        env.define('length', l => l.length);
        env.define('append', (...l) => l.flat());
        env.define('reverse', l => [...l].reverse());
        env.define('nth', (l, n) => l[n]);

        // Higher-order
        env.define('map', (f, l) => l.map(x => self.applyFunc(f, [x])));
        env.define('filter', (f, l) => l.filter(x => self.applyFunc(f, [x])));
        env.define('reduce', (f, l, init) => init !== undefined
          ? l.reduce((a, x) => self.applyFunc(f, [a, x]), init)
          : l.reduce((a, x) => self.applyFunc(f, [a, x])));

        // Utilities
        env.define('range', (...args) => {
          let [start, end, step] = [0, 0, 1];
          if (args.length === 1) end = args[0];
          else if (args.length === 2) [start, end] = args;
          else [start, end, step] = args;
          const r = [];
          for (let i = start; i < end; i += step) r.push(i);
          return r;
        });

        env.define('print', (...a) => { self.outputBuffer.push(a.join(' ')); return a[a.length - 1]; });
        env.define('not', x => !x);
        env.define('number?', x => typeof x === 'number');
        env.define('string?', x => typeof x === 'string');
        env.define('list?', x => Array.isArray(x));
        env.define('function?', x => typeof x === 'function' || x instanceof Lambda);

        // Math
        env.define('abs', Math.abs);
        env.define('min', Math.min);
        env.define('max', Math.max);
        env.define('sqrt', Math.sqrt);
        env.define('floor', Math.floor);
        env.define('ceil', Math.ceil);
        env.define('round', Math.round);

        // String operations
        env.define('string-length', s => s.length);
        env.define('string-concat', (...a) => a.map(String).join(''));
        env.define('substring', (s, start, end) => end === undefined ? s.slice(start) : s.slice(start, end));
        env.define('char-at', (s, i) => s[i]);
        env.define('string-upcase', s => s.toUpperCase());
        env.define('string-downcase', s => s.toLowerCase());
        env.define('string-split', (s, delim = ' ') => s.split(delim));
        env.define('string-join', (lst, delim = '') => lst.map(String).join(delim));
        env.define('string-trim', s => s.trim());

        // String conversions
        env.define('string->list', s => [...s]);
        env.define('list->string', lst => lst.map(String).join(''));
        env.define('string->number', s => s.includes('.') ? parseFloat(s) : parseInt(s, 10));
        env.define('number->string', n => String(n));

        // String search
        env.define('string-contains?', (s, sub) => s.includes(sub));
        env.define('string-index-of', (s, sub) => s.indexOf(sub));
        env.define('string-replace', (s, old, newStr) => s.replaceAll(old, newStr));

        // String comparisons
        env.define('string=?', (a, b) => a === b);
        env.define('string<?', (a, b) => a < b);
        env.define('string>?', (a, b) => a > b);

        // Regex operations
        env.define('regex-test', (pattern, s) => new RegExp(pattern).test(s));
        env.define('regex-match', (pattern, s) => { const m = s.match(new RegExp(pattern)); return m ? m[0] : false; });
        env.define('regex-match-all', (pattern, s) => [...s.matchAll(new RegExp(pattern, 'g'))].map(m => m[0]));
        env.define('regex-replace', (pattern, repl, s) => s.replace(new RegExp(pattern, 'g'), repl));
        env.define('regex-split', (pattern, s) => s.split(new RegExp(pattern)));

        // Stats
        env.define('wasm-stats', () => ({ ...self.stats }));
        env.define('wasm-cache-size', () => self.wasmCache.size);

        return env;
      }

      applyFunc(func, args) {
        if (func instanceof Lambda) {
          const localEnv = new Environment(func.env);
          func.params.forEach((p, i) => localEnv.define(p.name, args[i]));
          return this.evalSync(func.body, localEnv);
        }
        if (func && typeof func === 'object' && func.wasmFunc) {
          // Check if we have array arguments that need marshalling
          const hasArrayArg = args.some(a => Array.isArray(a));

          if (hasArrayArg) {
            const memory = func.memory || this.sharedMemory;
            const elemType = this.getArrayElemType(func.signature);
            // Use function's heap base if available
            if (func.heapBase) {
              this.memoryOffset = Math.max(this.memoryOffset, func.heapBase);
            }

            // Handle single array argument -> (ptr, len) calling convention
            if (args.length === 1 && Array.isArray(args[0])) {
              const arr = args[0];
              const ptr = this.allocArray(memory, arr, elemType);
              const len = arr.length;

              // Call WASM with (ptr, len)
              func.wasmFunc(ptr, len);

              // Read back result (assuming in-place modification for sorts)
              return this.readArray(memory, ptr, len, elemType);
            }

            // Handle (array, value) -> (ptr, len, value) e.g., binary search
            if (args.length === 2 && Array.isArray(args[0]) && !Array.isArray(args[1])) {
              const arr = args[0];
              const val = args[1];
              const ptr = this.allocArray(memory, arr, elemType);
              const len = arr.length;

              // Call WASM with (ptr, len, val)
              const result = func.wasmFunc(ptr, len, elemType === 'i64' ? BigInt(Math.floor(val)) : val);

              // Return the result (e.g., index for binary search)
              return typeof result === 'bigint' ? Number(result) : result;
            }

            // Fallback: marshal each array arg separately
            const marshalledArgs = args.map(arg => {
              if (Array.isArray(arg)) {
                const ptr = this.allocArray(memory, arg, elemType);
                return [ptr, arg.length];
              }
              return [arg];
            }).flat();

            return func.wasmFunc(...marshalledArgs);
          }

          // No arrays - direct call, but handle BigInt/Number conversion
          const convertedArgs = args.map(arg => {
            if (typeof arg === 'bigint') {
              // Convert BigInt to Number for i32 functions
              // Check if function signature expects i32
              const sig = func.signature || '';
              if (sig.includes('i32') && !sig.includes('i64')) {
                return Number(arg);
              }
            }
            return arg;
          });
          return func.wasmFunc(...convertedArgs);
        }
        if (typeof func === 'function') return func(...args);
        throw new Error('Cannot apply: ' + func);
      }

      evalSync(expr, env) {
        if (!env) env = this.globalEnv;
        if (expr instanceof LispSymbol) return env.get(expr.name);
        if (typeof expr === 'number' || typeof expr === 'string') return expr;
        if (Array.isArray(expr) && expr.length === 0) return [];

        if (Array.isArray(expr)) {
          const head = expr[0];
          if (head instanceof LispSymbol) {
            const name = head.name;
            if (name === 'quote') return expr[1];
            if (name === 'if') {
              return this.evalSync(expr[1], env)
                ? this.evalSync(expr[2], env)
                : expr.length > 3 ? this.evalSync(expr[3], env) : null;
            }
            if (name === 'and') {
              for (let i = 1; i < expr.length; i++) if (!this.evalSync(expr[i], env)) return false;
              return true;
            }
            if (name === 'or') {
              for (let i = 1; i < expr.length; i++) { const v = this.evalSync(expr[i], env); if (v) return v; }
              return false;
            }
            if (name === 'define') {
              const sym = expr[1];
              if (Array.isArray(sym)) {
                const fn = sym[0], params = sym.slice(1), body = expr[2];
                const lam = new Lambda(params, body, env);
                env.define(fn.name, lam);
                return lam;
              }
              const val = this.evalSync(expr[2], env);
              env.define(sym.name, val);
              return val;
            }
            if (name === 'lambda') return new Lambda(expr[1], expr[2], env);
            if (name === 'let') {
              const localEnv = new Environment(env);
              for (const b of expr[1]) localEnv.define(b[0].name, this.evalSync(b[1], env));
              return this.evalSync(expr[2], localEnv);
            }
            if (name === 'begin') {
              let res = null;
              for (let i = 1; i < expr.length; i++) res = this.evalSync(expr[i], env);
              return res;
            }
            if (name === 'set!') {
              const val = this.evalSync(expr[2], env);
              env.set(expr[1].name, val);
              return val;
            }
            if (name === 'cond') {
              for (let i = 1; i < expr.length; i++) {
                const clause = expr[i];
                if (clause[0] instanceof LispSymbol && clause[0].name === 'else') return this.evalSync(clause[1], env);
                if (this.evalSync(clause[0], env)) return this.evalSync(clause[1], env);
              }
              return null;
            }
          }
          const func = this.evalSync(head, env);
          const args = expr.slice(1).map(a => this.evalSync(a, env));
          return this.applyFunc(func, args);
        }
        throw new Error('Cannot eval: ' + exprToString(expr));
      }

      async evalAsync(expr, env) {
        if (!env) env = this.globalEnv;
        if (expr instanceof LispSymbol) return env.get(expr.name);
        if (typeof expr === 'number' || typeof expr === 'string') return expr;
        if (Array.isArray(expr) && expr.length === 0) return [];

        if (Array.isArray(expr)) {
          const head = expr[0];
          if (head instanceof LispSymbol && head.name === 'intent') {
            const intentStr = await this.evalAsync(expr[1], env);
            return this.handleIntent(intentStr);
          }
          if (head instanceof LispSymbol && head.name === 'define') {
            const sym = expr[1];
            if (Array.isArray(sym)) {
              const fn = sym[0], params = sym.slice(1), body = expr[2];
              const lam = new Lambda(params, body, env);
              env.define(fn.name, lam);
              return lam;
            }
            const val = await this.evalAsync(expr[2], env);
            env.define(sym.name, val);
            return val;
          }
          // For other forms, use sync eval
          return this.evalSync(expr, env);
        }
        return this.evalSync(expr, env);
      }

      async handleIntent(intent) {
        if (this.wasmCache.has(intent)) {
          this.stats.cacheHits++;
          return this.wasmCache.get(intent);
        }

        const start = Date.now();
        const resp = await fetch('/api/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intent }),
        });
        if (!resp.ok) throw new Error((await resp.json()).error || 'Compile failed');
        const result = await resp.json();

        // Fetch semantic metadata from registry
        let semantic = null;
        try {
          const registryResp = await fetch('/api/registry/' + result.hash);
          if (registryResp.ok) {
            const registryData = await registryResp.json();
            const meta = registryData.metadata || {};
            // Check for backfilled semantic key, or use direct metadata
            semantic = meta.semantic || (meta.renderer ? meta : null);
          }
        } catch (e) {
          console.warn('Failed to fetch semantic metadata:', e);
        }

        const wasmResp = await fetch('/api/binary/' + result.hash);
        if (!wasmResp.ok) throw new Error('Failed to fetch WASM');
        const wasmBinary = await wasmResp.arrayBuffer();

        // Try to instantiate with memory import, fall back to without
        let mod;
        const imports = { env: { memory: this.sharedMemory } };
        try {
          mod = await WebAssembly.instantiate(wasmBinary, imports);
        } catch (e) {
          // Module might not need memory import
          mod = await WebAssembly.instantiate(wasmBinary);
        }

        let wasmFunc = null, funcName = '';
        let memory = null;
        let heapBase = this.heapBase;

        for (const [n, exp] of Object.entries(mod.instance.exports)) {
          if (typeof exp === 'function' && !wasmFunc) {
            funcName = n;
            wasmFunc = exp;
          }
          if (exp instanceof WebAssembly.Memory) {
            memory = exp;
          }
          // Check for heap base marker (common in WASM modules)
          if (n === '__heap_base' && exp instanceof WebAssembly.Global) {
            heapBase = exp.value;
          }
          if (n === '__data_end' && exp instanceof WebAssembly.Global) {
            heapBase = Math.max(heapBase, exp.value);
          }
        }
        if (!wasmFunc) throw new Error('No function in WASM module');

        // Use exported memory if available, otherwise use shared memory
        memory = memory || this.sharedMemory;

        this.stats.intentsCompiled++;
        this.stats.totalCompileTimeMs += Date.now() - start;

        const fn = {
          name: funcName,
          intent: result.expanded_intent,
          hash: result.hash,
          signature: result.signature,
          size: result.size,
          wasmFunc,
          memory,
          heapBase,
          cached: result.cached,
          semantic  // Include semantic metadata for auto-rendering
        };
        this.wasmCache.set(intent, fn);
        return fn;
      }

      async evalString(source) {
        this.outputBuffer = [];
        this.resetMemory(); // Reset memory allocator for each evaluation
        const exprs = parseLisp(source);
        let result = null;
        for (const expr of exprs) result = await this.evalAsync(expr);
        return { result, output: this.outputBuffer };
      }
    }

    // Global evaluator instance
    const lisp = new LispEvaluator();

    // ============================================
    // REPL State
    // ============================================

    let cells = [];
    let activeCell = null;
    let searchTimeout = null;
    let monaco = null;
    let editors = {};  // Map of cell id -> Monaco editor instance
    let cellIdCounter = 0;  // Unique cell ID counter

    // Initialize Monaco and the app
    require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.45.0/min/vs' } });
    require(['vs/editor/editor.main'], function(_monaco) {
      monaco = _monaco;

      // Register Prometheus LISP language
      monaco.languages.register({ id: 'prometheus-lisp' });

      // Define syntax highlighting
      monaco.languages.setMonarchTokensProvider('prometheus-lisp', {
        keywords: ['define', 'lambda', 'let', 'letrec', 'if', 'cond', 'else',
                   'and', 'or', 'not', 'quote', 'begin', 'do', 'case',
                   'import', 'export', 'require', 'load', 'intent', 'set!'],
        builtins: ['map', 'filter', 'reduce', 'range', 'list', 'cons', 'car', 'cdr',
                   'first', 'rest', 'nth', 'length', 'append', 'reverse', 'sort',
                   'apply', 'eval', 'print', 'display', 'newline',
                   'eq?', 'equal?', 'null?', 'pair?', 'list?', 'number?', 'string?', 'symbol?',
                   'search', 'wasm-stats', 'wasm-cache-size', 'abs', 'mod', 'max', 'min',
                   'fib', 'factorial', 'gcd', 'is_prime', 'fibonacci',
                   'string-length', 'string-concat', 'substring', 'char-at',
                   'string-upcase', 'string-downcase', 'string-split', 'string-join', 'string-trim',
                   'string->list', 'list->string', 'string->number', 'number->string',
                   'string-contains?', 'string-index-of', 'string-replace',
                   'string=?', 'string<?', 'string>?',
                   'regex-test', 'regex-match', 'regex-match-all', 'regex-replace', 'regex-split'],

        tokenizer: {
          root: [
            // Whitespace
            [/\\s+/, 'white'],

            // Comments
            [/;.*$/, 'comment'],

            // Strings
            [/"/, 'string', '@string'],

            // Numbers
            [/-?\\d+\\.\\d+/, 'number.float'],
            [/-?\\d+/, 'number'],

            // Parentheses
            [/[()]/, 'delimiter.parenthesis'],

            // Keywords
            [/(define|lambda|let|letrec|if|cond|else|and|or|not|quote|begin|do|case|import|export|require|load|intent|set!)(?![a-zA-Z0-9_\\-])/, 'keyword'],

            // Builtins
            [/(map|filter|reduce|range|list|cons|car|cdr|first|rest|nth|length|append|reverse|sort|apply|eval|print|display|search|abs|mod|max|min|fib|factorial|gcd|fibonacci|is_prime|string-length|string-concat|substring|char-at|string-upcase|string-downcase|string-split|string-join|string-trim|string->list|list->string|string->number|number->string|string-contains\\?|string-index-of|string-replace|string=\\?|string<\\?|string>\\?|regex-test|regex-match|regex-match-all|regex-replace|regex-split)(?![a-zA-Z0-9_\\-])/, 'support.function'],

            // Boolean predicates
            [/(eq\\?|equal\\?|null\\?|pair\\?|list\\?|number\\?|string\\?|symbol\\?)/, 'support.function'],

            // Operators
            [/[+\\-*\\/<>=]+/, 'operator'],

            // Identifiers
            [/[a-zA-Z_][a-zA-Z0-9_\\-\\?\\!]*/, 'identifier'],
          ],

          string: [
            [/[^\\\\"]+/, 'string'],
            [/\\\\./, 'string.escape'],
            [/"/, 'string', '@pop'],
          ],
        },
      });

      // Define GitHub Dark theme
      monaco.editor.defineTheme('prometheus-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '6e7681', fontStyle: 'italic' },
          { token: 'string', foreground: 'a5d6ff' },
          { token: 'number', foreground: '79c0ff' },
          { token: 'number.float', foreground: '79c0ff' },
          { token: 'keyword', foreground: 'ff7b72', fontStyle: 'bold' },
          { token: 'support.function', foreground: 'd2a8ff' },
          { token: 'identifier', foreground: 'c9d1d9' },
          { token: 'delimiter.parenthesis', foreground: 'ffa657' },
          { token: 'operator', foreground: '79c0ff' },
        ],
        colors: {
          'editor.background': '#0d1117',
          'editor.foreground': '#c9d1d9',
          'editor.lineHighlightBackground': '#161b22',
          'editorCursor.foreground': '#58a6ff',
          'editor.selectionBackground': '#264f78',
          'editorLineNumber.foreground': '#6e7681',
          'editorLineNumber.activeForeground': '#c9d1d9',
        },
      });

      // Register completion provider for builtins
      monaco.languages.registerCompletionItemProvider('prometheus-lisp', {
        triggerCharacters: ['(', '-', '>'],
        provideCompletionItems: (model, position) => {
          // Find the word being typed
          const textUntilPosition = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
          });
          const match = textUntilPosition.match(/[a-zA-Z][a-zA-Z0-9\\-\\?>]*$/);
          const wordStart = match ? position.column - match[0].length : position.column;

          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: wordStart,
            endColumn: position.column
          };

          const builtins = [
            // Core
            { label: 'define', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'define ', detail: 'Define a variable or function' },
            { label: 'lambda', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'lambda (', detail: 'Anonymous function' },
            { label: 'intent', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'intent "', detail: 'Compile WASM from natural language' },
            { label: 'if', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'if ', detail: 'Conditional expression' },
            { label: 'let', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'let ((', detail: 'Local bindings' },

            // Lists
            { label: 'list', kind: monaco.languages.CompletionItemKind.Function, insertText: 'list ', detail: 'Create a list' },
            { label: 'map', kind: monaco.languages.CompletionItemKind.Function, insertText: 'map ', detail: '(map fn list) - Apply fn to each element' },
            { label: 'filter', kind: monaco.languages.CompletionItemKind.Function, insertText: 'filter ', detail: '(filter pred list) - Keep elements matching predicate' },
            { label: 'reduce', kind: monaco.languages.CompletionItemKind.Function, insertText: 'reduce ', detail: '(reduce fn list init) - Fold list with fn' },
            { label: 'range', kind: monaco.languages.CompletionItemKind.Function, insertText: 'range ', detail: '(range end) or (range start end)' },
            { label: 'car', kind: monaco.languages.CompletionItemKind.Function, insertText: 'car ', detail: 'First element of list' },
            { label: 'cdr', kind: monaco.languages.CompletionItemKind.Function, insertText: 'cdr ', detail: 'Rest of list (all but first)' },
            { label: 'cons', kind: monaco.languages.CompletionItemKind.Function, insertText: 'cons ', detail: '(cons x list) - Prepend x to list' },
            { label: 'append', kind: monaco.languages.CompletionItemKind.Function, insertText: 'append ', detail: 'Concatenate lists' },
            { label: 'length', kind: monaco.languages.CompletionItemKind.Function, insertText: 'length ', detail: 'Length of list' },
            { label: 'reverse', kind: monaco.languages.CompletionItemKind.Function, insertText: 'reverse ', detail: 'Reverse a list' },
            { label: 'nth', kind: monaco.languages.CompletionItemKind.Function, insertText: 'nth ', detail: '(nth list n) - Get nth element' },

            // String operations
            { label: 'string-length', kind: monaco.languages.CompletionItemKind.Function, insertText: 'string-length ', detail: '(string-length s) - Length of string' },
            { label: 'string-concat', kind: monaco.languages.CompletionItemKind.Function, insertText: 'string-concat ', detail: '(string-concat s1 s2 ...) - Concatenate strings' },
            { label: 'substring', kind: monaco.languages.CompletionItemKind.Function, insertText: 'substring ', detail: '(substring s start end) - Extract substring' },
            { label: 'char-at', kind: monaco.languages.CompletionItemKind.Function, insertText: 'char-at ', detail: '(char-at s index) - Get character at index' },
            { label: 'string-upcase', kind: monaco.languages.CompletionItemKind.Function, insertText: 'string-upcase ', detail: '(string-upcase s) - Convert to uppercase' },
            { label: 'string-downcase', kind: monaco.languages.CompletionItemKind.Function, insertText: 'string-downcase ', detail: '(string-downcase s) - Convert to lowercase' },
            { label: 'string-split', kind: monaco.languages.CompletionItemKind.Function, insertText: 'string-split ', detail: '(string-split s delim) - Split string by delimiter' },
            { label: 'string-join', kind: monaco.languages.CompletionItemKind.Function, insertText: 'string-join ', detail: '(string-join list delim) - Join list with delimiter' },
            { label: 'string-trim', kind: monaco.languages.CompletionItemKind.Function, insertText: 'string-trim ', detail: '(string-trim s) - Remove leading/trailing whitespace' },
            { label: 'string-replace', kind: monaco.languages.CompletionItemKind.Function, insertText: 'string-replace ', detail: '(string-replace s old new) - Replace occurrences' },
            { label: 'string-contains?', kind: monaco.languages.CompletionItemKind.Function, insertText: 'string-contains? ', detail: '(string-contains? s sub) - Check if contains substring' },
            { label: 'string-index-of', kind: monaco.languages.CompletionItemKind.Function, insertText: 'string-index-of ', detail: '(string-index-of s sub) - Find index of substring' },
            { label: 'string->list', kind: monaco.languages.CompletionItemKind.Function, insertText: 'string->list ', detail: '(string->list s) - Convert string to char list' },
            { label: 'list->string', kind: monaco.languages.CompletionItemKind.Function, insertText: 'list->string ', detail: '(list->string chars) - Convert char list to string' },
            { label: 'string->number', kind: monaco.languages.CompletionItemKind.Function, insertText: 'string->number ', detail: '(string->number s) - Parse string to number' },
            { label: 'number->string', kind: monaco.languages.CompletionItemKind.Function, insertText: 'number->string ', detail: '(number->string n) - Convert number to string' },

            // Regex
            { label: 'regex-test', kind: monaco.languages.CompletionItemKind.Function, insertText: 'regex-test ', detail: '(regex-test pattern s) - Test if pattern matches' },
            { label: 'regex-match', kind: monaco.languages.CompletionItemKind.Function, insertText: 'regex-match ', detail: '(regex-match pattern s) - Find first match' },
            { label: 'regex-match-all', kind: monaco.languages.CompletionItemKind.Function, insertText: 'regex-match-all ', detail: '(regex-match-all pattern s) - Find all matches' },
            { label: 'regex-replace', kind: monaco.languages.CompletionItemKind.Function, insertText: 'regex-replace ', detail: '(regex-replace pattern repl s) - Replace matches' },
            { label: 'regex-split', kind: monaco.languages.CompletionItemKind.Function, insertText: 'regex-split ', detail: '(regex-split pattern s) - Split by pattern' },

            // Math
            { label: 'abs', kind: monaco.languages.CompletionItemKind.Function, insertText: 'abs ', detail: 'Absolute value' },
            { label: 'min', kind: monaco.languages.CompletionItemKind.Function, insertText: 'min ', detail: 'Minimum of arguments' },
            { label: 'max', kind: monaco.languages.CompletionItemKind.Function, insertText: 'max ', detail: 'Maximum of arguments' },
            { label: 'sqrt', kind: monaco.languages.CompletionItemKind.Function, insertText: 'sqrt ', detail: 'Square root' },
            { label: 'floor', kind: monaco.languages.CompletionItemKind.Function, insertText: 'floor ', detail: 'Round down' },
            { label: 'ceil', kind: monaco.languages.CompletionItemKind.Function, insertText: 'ceil ', detail: 'Round up' },
            { label: 'round', kind: monaco.languages.CompletionItemKind.Function, insertText: 'round ', detail: 'Round to nearest' },
            { label: 'mod', kind: monaco.languages.CompletionItemKind.Function, insertText: 'mod ', detail: 'Modulo (remainder)' },

            // Type checks
            { label: 'number?', kind: monaco.languages.CompletionItemKind.Function, insertText: 'number? ', detail: 'Check if number' },
            { label: 'string?', kind: monaco.languages.CompletionItemKind.Function, insertText: 'string? ', detail: 'Check if string' },
            { label: 'list?', kind: monaco.languages.CompletionItemKind.Function, insertText: 'list? ', detail: 'Check if list' },
            { label: 'null?', kind: monaco.languages.CompletionItemKind.Function, insertText: 'null? ', detail: 'Check if empty list' },
            { label: 'function?', kind: monaco.languages.CompletionItemKind.Function, insertText: 'function? ', detail: 'Check if function' },

            // Introspection
            { label: 'wasm-stats', kind: monaco.languages.CompletionItemKind.Function, insertText: 'wasm-stats', detail: 'Show WASM compilation stats' },
            { label: 'wasm-cache-size', kind: monaco.languages.CompletionItemKind.Function, insertText: 'wasm-cache-size', detail: 'Number of cached functions' },
          ];

          return {
            suggestions: builtins.map(b => ({ ...b, range }))
          };
        }
      });

      // Register hover provider for function documentation
      monaco.languages.registerHoverProvider('prometheus-lisp', {
        provideHover: (model, position) => {
          // Get the word at hover position
          const wordInfo = model.getWordAtPosition(position);
          if (!wordInfo) return null;

          const word = wordInfo.word;

          // Try to look up in the evaluator's environment
          try {
            const val = lisp.globalEnv.get(word);

            // Check if it's a WASM function with semantic metadata
            if (val && typeof val === 'object' && val.wasmFunc && val.semantic) {
              const sem = val.semantic;
              const lines = [];

              // Function name and category
              const category = sem.category ? \`[\${sem.category}]\` : '';
              lines.push(\`**\${word}** \${category}\`);

              if (sem.description) {
                lines.push('');
                lines.push(sem.description);
              }

              // Inputs with rich semantic types
              if (sem.inputs && sem.inputs.length > 0) {
                lines.push('');
                lines.push('**Inputs:**');
                for (const inp of sem.inputs) {
                  const semType = inp.semantic_type || inp.wasm_type;
                  let line = \`- **\${inp.name}** : \\\`\${semType}\\\`\`;
                  if (inp.wasm_type && inp.wasm_type !== inp.semantic_type) {
                    line += \` (\${inp.wasm_type})\`;
                  }
                  lines.push(line);

                  // Details on next line, indented
                  const details = [];
                  if (inp.range) details.push(\`range: [\${inp.range[0]}, \${inp.range[1]}]\`);
                  if (inp.default !== undefined) details.push(\`default: \${inp.default}\`);
                  if (details.length > 0 || inp.description) {
                    let detailLine = '  ';
                    if (details.length > 0) detailLine += details.join(', ');
                    if (inp.description) detailLine += (details.length > 0 ? ' — ' : '') + inp.description;
                    lines.push(detailLine);
                  }
                }
              }

              // Output with semantic type
              if (sem.output) {
                lines.push('');
                const outType = sem.output.semantic_type || sem.output.wasm_type;
                let outLine = \`**Returns:** \\\`\${outType}\\\`\`;
                if (sem.output.wasm_type && sem.output.wasm_type !== sem.output.semantic_type) {
                  outLine += \` (\${sem.output.wasm_type})\`;
                }
                if (sem.output.range) outLine += \` [\${sem.output.range[0]}, \${sem.output.range[1]}]\`;
                lines.push(outLine);
                if (sem.output.description) lines.push('  ' + sem.output.description);
              }

              // Algorithm & complexity
              if (sem.algorithm) {
                lines.push('');
                lines.push(\`**Algorithm:** \${sem.algorithm}\`);
              }
              if (sem.time_complexity || sem.space_complexity) {
                const time = sem.time_complexity || '?';
                const space = sem.space_complexity || '?';
                lines.push(\`**Complexity:** \${time} time, \${space} space\`);
              }

              // Examples
              if (sem.examples && sem.examples.length > 0) {
                lines.push('');
                lines.push('**Examples:**');
                lines.push('```lisp');
                for (const ex of sem.examples.slice(0, 3)) {
                  const args = ex.inputs.join(' ');
                  lines.push(\`(\${word} \${args}) → \${ex.output}\`);
                }
                lines.push('```');
              }

              // Properties
              const props = [];
              if (sem.pure) props.push('✓ pure');
              if (sem.deterministic) props.push('✓ deterministic');
              if (props.length > 0) {
                lines.push('');
                lines.push(props.join('  '));
              }

              // Renderer info if available
              if (sem.renderer && sem.renderer.type !== 'value') {
                lines.push('');
                lines.push(\`**Renderer:** \${sem.renderer.type}\${sem.renderer.colormap ? ' (' + sem.renderer.colormap + ')' : ''}\`);
              }

              return {
                range: new monaco.Range(position.lineNumber, wordInfo.startColumn, position.lineNumber, wordInfo.endColumn),
                contents: [{ value: lines.join('\\n') }]
              };
            }

            // Check if it's a WASM function without rich metadata (just basic info)
            if (val && typeof val === 'object' && val.wasmFunc) {
              const lines = [];
              lines.push('```haskell');
              lines.push(\`\${word} :: \${val.signature || '?'}\`);
              lines.push('```');
              if (val.intent) lines.push(\`Intent: "\${val.intent}"\`);
              if (val.size) lines.push(\`Size: \${val.size} bytes\`);

              return {
                range: new monaco.Range(position.lineNumber, wordInfo.startColumn, position.lineNumber, wordInfo.endColumn),
                contents: [{ value: lines.join('\\n') }]
              };
            }

            // Check if it's a Lambda
            if (val instanceof Lambda) {
              const params = val.params.map(p => p.name).join(' ');
              return {
                range: new monaco.Range(position.lineNumber, wordInfo.startColumn, position.lineNumber, wordInfo.endColumn),
                contents: [{ value: \`\\\`\\\`lisp\\n(lambda (\${params}) ...)\\n\\\`\\\`\\\`\\nUser-defined function\` }]
              };
            }

          } catch (e) {
            // Symbol not defined, check if it's a builtin
          }

          // Builtin documentation
          const builtinDocs = {
            // Core
            'define': '```lisp\\n(define name value)\\n(define (fn args...) body)\\n```\\nDefine a variable or function',
            'lambda': '```lisp\\n(lambda (args...) body)\\n```\\nCreate an anonymous function',
            'intent': '```lisp\\n(intent "description")\\n```\\nCompile WASM function from natural language',
            'if': '```lisp\\n(if condition then-expr else-expr)\\n```\\nConditional expression',
            'let': '```lisp\\n(let ((x 1) (y 2)) body)\\n```\\nLocal variable bindings',

            // Lists
            'map': '```haskell\\nmap :: (a → b) → [a] → [b]\\n```\\nApply function to each element',
            'filter': '```haskell\\nfilter :: (a → Bool) → [a] → [a]\\n```\\nKeep elements matching predicate',
            'reduce': '```haskell\\nreduce :: (b → a → b) → [a] → b → b\\n```\\nFold list with function',
            'range': '```haskell\\nrange :: Int → Int? → Int? → [Int]\\n```\\nGenerate number sequence\\n\\n```lisp\\n(range 5)       → (0 1 2 3 4)\\n(range 2 5)     → (2 3 4)\\n(range 0 10 2)  → (0 2 4 6 8)\\n```',
            'list': '```lisp\\n(list 1 2 3) → (1 2 3)\\n```\\nCreate a list',
            'car': '```haskell\\ncar :: [a] → a\\n```\\nFirst element of list',
            'cdr': '```haskell\\ncdr :: [a] → [a]\\n```\\nRest of list (all but first)',
            'cons': '```haskell\\ncons :: a → [a] → [a]\\n```\\nPrepend element to list',
            'length': '```haskell\\nlength :: [a] → Int\\n```\\nNumber of elements',

            // Strings
            'string-length': '```haskell\\nstring-length :: String → Int\\n```\\nLength of string (UTF-8 aware)',
            'string-concat': '```haskell\\nstring-concat :: String... → String\\n```\\nConcatenate strings\\n```lisp\\n(string-concat "a" "b" "c") → "abc"\\n```',
            'string-split': '```haskell\\nstring-split :: String → String → [String]\\n```\\nSplit string by delimiter\\n```lisp\\n(string-split "a,b,c" ",") → ("a" "b" "c")\\n```',
            'string-join': '```haskell\\nstring-join :: [String] → String → String\\n```\\nJoin list with delimiter\\n```lisp\\n(string-join (list "a" "b") "-") → "a-b"\\n```',
            'string-upcase': '```haskell\\nstring-upcase :: String → String\\n```\\nConvert to uppercase',
            'string-downcase': '```haskell\\nstring-downcase :: String → String\\n```\\nConvert to lowercase',
            'substring': '```haskell\\nsubstring :: String → Int → Int? → String\\n```\\nExtract substring\\n```lisp\\n(substring "hello" 1 4) → "ell"\\n```',
            'string-replace': '```haskell\\nstring-replace :: String → String → String → String\\n```\\nReplace all occurrences',
            'string-contains?': '```haskell\\nstring-contains? :: String → String → Bool\\n```\\nCheck if contains substring',

            // Regex
            'regex-test': '```haskell\\nregex-test :: Pattern → String → Bool\\n```\\nTest if pattern matches\\n```lisp\\n(regex-test "\\\\\\\\d+" "abc123") → #t\\n```',
            'regex-match': '```haskell\\nregex-match :: Pattern → String → String | #f\\n```\\nFind first match',
            'regex-match-all': '```haskell\\nregex-match-all :: Pattern → String → [String]\\n```\\nFind all matches\\n```lisp\\n(regex-match-all "\\\\\\\\d+" "a1b2c3") → ("1" "2" "3")\\n```',
            'regex-replace': '```haskell\\nregex-replace :: Pattern → String → String → String\\n```\\nReplace matches\\n```lisp\\n(regex-replace "\\\\\\\\s+" "-" "a b  c") → "a-b-c"\\n```',
            'regex-split': '```haskell\\nregex-split :: Pattern → String → [String]\\n```\\nSplit by pattern',

            // Math
            'abs': '```haskell\\nabs :: Num → Num\\n```\\nAbsolute value',
            'sqrt': '```haskell\\nsqrt :: Num → Num\\n```\\nSquare root',
            'floor': '```haskell\\nfloor :: Num → Int\\n```\\nRound down',
            'ceil': '```haskell\\nceil :: Num → Int\\n```\\nRound up',
            'mod': '```haskell\\nmod :: Int → Int → Int\\n```\\nModulo (remainder)',

            // Introspection
            'wasm-stats': '```lisp\\n(wasm-stats)\\n```\\nShow compilation statistics',
            'wasm-cache-size': '```lisp\\n(wasm-cache-size)\\n```\\nNumber of cached WASM functions',
          };

          if (builtinDocs[word]) {
            return {
              range: new monaco.Range(position.lineNumber, wordInfo.startColumn, position.lineNumber, wordInfo.endColumn),
              contents: [{ value: builtinDocs[word] }]
            };
          }

          return null;
        }
      });

      init();
    });

    // Initialize with welcome cells
    function init() {
      addCell('code', '(define fib (intent "fibonacci"))');
      addCell('code', '(fib 10)');
      loadStats();
      initResizeHandles();
    }

    // Cell resize handling
    let resizing = null;

    function initResizeHandles() {
      document.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('cell-resize')) {
          e.preventDefault();
          const cellId = e.target.dataset.cell;
          const isOutput = e.target.dataset.target === 'output';

          let container;
          if (isOutput) {
            container = document.getElementById('output-' + cellId);
          } else {
            container = document.getElementById('editor-' + cellId);
          }

          if (container) {
            resizing = {
              cellId,
              container,
              startY: e.clientY,
              startHeight: container.offsetHeight,
              isOutput
            };
            e.target.classList.add('dragging');
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
          }
        }
      });

      document.addEventListener('mousemove', (e) => {
        if (resizing) {
          const delta = e.clientY - resizing.startY;
          const minHeight = resizing.isOutput ? 100 : 60;
          const newHeight = Math.max(minHeight, resizing.startHeight + delta);
          resizing.container.style.height = newHeight + 'px';
          resizing.container.style.minHeight = newHeight + 'px';
          resizing.container.style.maxHeight = newHeight + 'px';
          // Update Monaco editor layout if resizing editor
          if (!resizing.isOutput && editors[resizing.cellId]) {
            editors[resizing.cellId].layout();
          }
          // Force scroll recalculation for output areas
          if (resizing.isOutput) {
            resizing.container.scrollTop = resizing.container.scrollTop;
          }
        }
      });

      document.addEventListener('mouseup', () => {
        if (resizing) {
          document.querySelectorAll('.cell-resize.dragging').forEach(el => el.classList.remove('dragging'));
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          resizing = null;
        }
      });
    }

    // Add a new cell
    function addCell(type = 'code', content = '') {
      const id = 'cell-' + (++cellIdCounter);
      const cell = {
        id,
        type,
        content,
        output: null,
        status: 'idle',
      };
      cells.push(cell);
      renderCells();
      // Small delay to let DOM update, then create editor
      setTimeout(() => {
        createEditor(id, content);
        focusCell(id);
      }, 10);
      return id;
    }

    // Create Monaco editor for a cell
    function createEditor(cellId, content) {
      if (!monaco) return;

      const container = document.getElementById('editor-' + cellId);
      if (!container || editors[cellId]) return;

      const editor = monaco.editor.create(container, {
        value: content || '',
        language: 'prometheus-lisp',
        theme: 'prometheus-dark',
        minimap: { enabled: false },
        lineNumbers: 'off',
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: 8,
        lineNumbersMinChars: 0,
        renderLineHighlight: 'none',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', monospace",
        padding: { top: 12, bottom: 12 },
        scrollbar: {
          vertical: 'hidden',
          horizontal: 'auto',
          useShadows: false,
        },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
      });

      // Update cell content on change
      editor.onDidChangeModelContent(() => {
        const cell = cells.find(c => c.id === cellId);
        if (cell) cell.content = editor.getValue();
      });

      // Handle Shift+Enter to run the active cell
      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
        if (activeCell) runCell(activeCell);
      });

      // Focus handling
      editor.onDidFocusEditorText(() => {
        activeCell = cellId;
        document.querySelectorAll('.cell').forEach(el => {
          el.classList.toggle('active', el.dataset.id === cellId);
        });
      });

      // Auto-resize based on content
      const updateHeight = () => {
        const contentHeight = Math.max(80, Math.min(400, editor.getContentHeight()));
        container.style.height = contentHeight + 'px';
        editor.layout();
      };
      editor.onDidContentSizeChange(updateHeight);
      updateHeight();

      editors[cellId] = editor;
    }

    // Remove a cell
    function removeCell(id) {
      if (editors[id]) {
        editors[id].dispose();
        delete editors[id];
      }
      cells = cells.filter(c => c.id !== id);
      renderCells();
    }

    // Focus a cell
    function focusCell(id) {
      activeCell = id;
      document.querySelectorAll('.cell').forEach(el => {
        el.classList.toggle('active', el.dataset.id === id);
      });
      if (editors[id]) {
        editors[id].focus();
      }
    }

    // Render all cells
    function renderCells() {
      const container = document.getElementById('cells');

      // Dispose ALL editors (innerHTML will destroy their DOM)
      Object.keys(editors).forEach(id => {
        editors[id].dispose();
        delete editors[id];
      });

      container.innerHTML = cells.map(cell => renderCell(cell)).join('');

      // Recreate editors for all cells
      setTimeout(() => {
        cells.forEach(cell => {
          createEditor(cell.id, cell.content);
        });
      }, 10);
    }

    // Render a single cell
    function renderCell(cell) {
      const statusClass = cell.status !== 'idle' ? cell.status : '';
      const outputHtml = cell.output ? renderOutput(cell.output) : '';
      const hasOutput = !!cell.output;

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
            <div class="editor-container" id="editor-\${cell.id}" data-content="\${escapeHtml(cell.content)}"></div>
            <div class="cell-resize" data-cell="\${cell.id}"></div>
          </div>
          <div class="cell-output-wrapper" id="output-\${cell.id}">
            \${outputHtml}
          </div>
          \${hasOutput ? '<div class="cell-resize output-resize" data-cell="' + cell.id + '" data-target="output"></div>' : ''}
        </div>
      \`;
    }

    // Render cell output
    function renderOutput(output) {
      if (!output) return '';

      let content = '';

      // Show print output if any
      if (output.printOutput) {
        content += \`<div class="output-result" style="color: var(--text-secondary); margin-bottom: 0.5rem;">\${escapeHtml(output.printOutput)}</div>\`;
      }

      if (output.type === 'error') {
        content += \`<div class="output-error">\${escapeHtml(String(output.value))}</div>\`;
      } else if (output.type === 'compile') {
        // Compilation result with function card
        const data = output.value;
        const semantic = data.semantic;
        const rendererType = semantic?.renderer?.type || 'value';
        const canvasId = 'render-' + data.hash;

        // Determine what render buttons/controls to show
        // Check semantic metadata OR intent keywords OR buffer signature
        const intent = (data.expanded_intent || '').toLowerCase();
        const isFractalIntent = intent.includes('mandelbrot') || intent.includes('julia') || intent.includes('fractal');
        const isBufferSig = data.signature?.startsWith('(i32, i32, i32') && data.signature?.includes('-> void');
        const hasHeatmap = rendererType === 'heatmap' || isFractalIntent || isBufferSig;
        const hasViz = hasHeatmap; // Extend for other types later

        // Show semantic info if available
        const category = semantic?.category || 'unknown';
        const description = semantic?.description || '';

        content += \`
          <div class="output-result">Compiled: \${escapeHtml(data.expanded_intent || '')}</div>
          <div class="fn-card">
            <img class="fn-icon" src="/api/icon/\${data.hash}" onerror="this.style.display='none'">
            <div class="fn-info">
              <div class="fn-name">\${data.hash.slice(0, 12)}...</div>
              <div class="fn-sig">\${escapeHtml(data.signature || '?')}</div>
              \${semantic ? '<div class="fn-category">' + escapeHtml(category) + '</div>' : ''}
            </div>
          </div>
          <div class="output-meta">
            <span>\${data.size} bytes</span>
            <span>\${data.cached ? 'cached' : 'compiled'}</span>
            <span class="renderer-type">\${rendererType}</span>
            \${hasHeatmap ? '<button class="cell-btn" onclick="triggerAutoRender(\\'' + data.hash + '\\', \\'' + canvasId + '\\')">Render</button>' : ''}
          </div>
          \${hasViz ? '<canvas id="' + canvasId + '" class="render-canvas" style="display:none;margin-top:0.5rem;"></canvas><div id="' + canvasId + '-info" class="render-info"></div>' : ''}
        \`;
      } else {
        // Check if result is an array - show waveform visualization
        const isNumericArray = Array.isArray(output.value) &&
          output.value.length > 0 &&
          output.value.every(v => typeof v === 'number' || typeof v === 'bigint');

        if (isNumericArray && output.value.length >= 3) {
          const canvasId = 'wave-' + Date.now();
          content = \`
            <div class="output-result">\${escapeHtml(formatValue(output.value))}</div>
            <canvas id="\${canvasId}" class="waveform-canvas"></canvas>
          \`;
          // Schedule waveform render after DOM update
          setTimeout(() => renderWaveform(canvasId, output.value), 10);
        } else {
          content = \`<div class="output-result">\${escapeHtml(formatValue(output.value))}</div>\`;
        }
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
      if (typeof value === 'bigint') return String(value);
      if (Array.isArray(value)) {
        // Handle arrays with potential BigInts
        return '(' + value.map(v => typeof v === 'bigint' ? String(v) : formatValue(v)).join(' ') + ')';
      }
      if (typeof value === 'object') {
        // Use replacer to handle BigInts in objects
        return JSON.stringify(value, (k, v) => typeof v === 'bigint' ? String(v) : v, 2);
      }
      return String(value);
    }

    // Colormaps for heatmap rendering
    const COLORMAPS = {
      viridis: (t) => {
        // Viridis-like gradient
        const r = Math.floor(255 * Math.min(1, 1.5 - Math.abs(4 * t - 3)));
        const g = Math.floor(255 * Math.min(1, 1.5 - Math.abs(4 * t - 2)));
        const b = Math.floor(255 * Math.min(1, 1.5 - Math.abs(4 * t - 1)));
        return [
          Math.max(0, Math.min(255, r + Math.floor(70 * t))),
          Math.max(0, Math.min(255, g + Math.floor(30 * t))),
          Math.max(0, Math.min(255, 100 + b))
        ];
      },
      magma: (t) => {
        const r = Math.floor(255 * Math.min(1, t * 2));
        const g = Math.floor(255 * Math.max(0, t - 0.3) * 1.5);
        const b = Math.floor(255 * Math.min(1, 0.3 + t * 0.7));
        return [r, g, b];
      },
      plasma: (t) => {
        const r = Math.floor(255 * Math.min(1, 0.1 + t * 0.9));
        const g = Math.floor(255 * Math.sin(t * Math.PI));
        const b = Math.floor(255 * (1 - t));
        return [r, g, b];
      },
      grayscale: (t) => {
        const v = Math.floor(255 * t);
        return [v, v, v];
      },
      rainbow: (t) => {
        const r = Math.floor(255 * Math.sin(t * Math.PI));
        const g = Math.floor(255 * Math.sin(t * Math.PI + 2));
        const b = Math.floor(255 * Math.sin(t * Math.PI + 4));
        return [Math.abs(r), Math.abs(g), Math.abs(b)];
      }
    };

    // Generic heatmap renderer using semantic metadata
    function renderHeatmap(canvasId, func, semantic, extraArgs = []) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      const renderer = semantic?.renderer || {};
      const domain = renderer.domain || {};
      const resolution = renderer.resolution || [600, 400];
      const colormap = COLORMAPS[renderer.colormap] || COLORMAPS.viridis;

      // Detect Julia set by signature pattern: (f64, f64, f64, f64, i32) -> i32
      const sig = semantic?.signature || '';
      const isJulia = sig.includes('f64, f64, f64, f64, i32');

      // Get domain ranges from metadata or use defaults (Julia uses symmetric [-2,2])
      const defaultXRange = isJulia ? [-2.0, 2.0] : [-2.5, 1.0];
      const defaultYRange = isJulia ? [-2.0, 2.0] : [-1.5, 1.5];
      const xRange = domain.x?.range || defaultXRange;
      const yRange = domain.y?.range || defaultYRange;

      // Find max value for normalization (from iteration_limit input or output range)
      const iterInput = semantic?.inputs?.find(i => i.semantic_type === 'iteration_limit');
      const maxValue = iterInput?.default || semantic?.output?.range?.[1] || 256;

      // Build argument list from semantic inputs
      // Variable inputs (coordinate.x, coordinate.y) get pixel values
      // Constant inputs get their default values
      const inputs = semantic?.inputs || [];

      const buildArgs = (x, y) => {
        if (inputs.length === 0) {
          // Fallback for Julia: (zx, zy, cx, cy, max_iter)
          if (isJulia) {
            return [x, y, -0.7, 0.27015, 256]; // Classic Julia set constants
          }
          // Default fallback: just (x, y, ...extraArgs)
          return [x, y, ...extraArgs];
        }

        return inputs.map(input => {
          const semType = input.semantic_type;
          // Variable coordinates - use pixel position
          if (semType === 'coordinate.x') return x;
          if (semType === 'coordinate.y') return y;
          // Constant parameters - use default values (for Julia set cx, cy)
          if (semType === 'constant.x' || semType === 'constant.y' || semType === 'constant') {
            return input.default !== undefined ? input.default : 0;
          }
          // Use default value for other inputs with defaults
          if (input.default !== undefined) return input.default;
          // Special cases
          if (semType === 'iteration_limit') return 256;
          return 0;
        });
      };

      const width = canvas.width = resolution[0];
      const height = canvas.height = resolution[1];
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(width, height);

      const [xMin, xMax] = xRange;
      const [yMin, yMax] = yRange;

      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const x = xMin + (px / width) * (xMax - xMin);
          const y = yMin + (py / height) * (yMax - yMin);

          // Build args based on semantic metadata
          const args = buildArgs(x, y);
          const value = func(...args);

          // Normalize to 0-1, handle "in set" case
          const t = value >= maxValue ? 0 : value / maxValue;
          const [r, g, b] = t === 0 ? [0, 0, 0] : colormap(t);

          const idx = (py * width + px) * 4;
          imageData.data[idx] = r;
          imageData.data[idx + 1] = g;
          imageData.data[idx + 2] = b;
          imageData.data[idx + 3] = 255;
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }

    // Progressive heatmap renderer - renders in chunks for better UX
    async function renderHeatmapProgressive(canvasId, func, semantic, extraArgs = [], onProgress) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      const renderer = semantic?.renderer || {};
      const domain = renderer.domain || {};
      const resolution = renderer.resolution || [600, 400];
      const colormap = COLORMAPS[renderer.colormap] || COLORMAPS.viridis;

      const xRange = domain.x?.range || [-2.5, 1.0];
      const yRange = domain.y?.range || [-1.5, 1.5];

      const iterInput = semantic?.inputs?.find(i => i.semantic_type === 'iteration_limit');
      const maxValue = iterInput?.default || semantic?.output?.range?.[1] || 256;

      const inputs = semantic?.inputs || [];
      const buildArgs = (x, y) => {
        if (inputs.length === 0) return [x, y, ...extraArgs];
        return inputs.map(input => {
          const semType = input.semantic_type;
          if (semType === 'coordinate.x') return x;
          if (semType === 'coordinate.y') return y;
          if (semType === 'constant.x' || semType === 'constant.y' || semType === 'constant') {
            return input.default !== undefined ? input.default : 0;
          }
          if (input.default !== undefined) return input.default;
          if (semType === 'iteration_limit') return 256;
          return 0;
        });
      };

      const width = canvas.width = resolution[0];
      const height = canvas.height = resolution[1];
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(width, height);

      const [xMin, xMax] = xRange;
      const [yMin, yMax] = yRange;

      // Pre-compute x coordinates
      const xCoords = new Float64Array(width);
      for (let px = 0; px < width; px++) {
        xCoords[px] = xMin + (px / width) * (xMax - xMin);
      }

      const CHUNK_SIZE = 20; // rows per chunk
      let currentRow = 0;

      return new Promise((resolve) => {
        function renderChunk() {
          const endRow = Math.min(currentRow + CHUNK_SIZE, height);
          const startTime = performance.now();

          for (let py = currentRow; py < endRow; py++) {
            const y = yMin + (py / height) * (yMax - yMin);
            for (let px = 0; px < width; px++) {
              const args = buildArgs(xCoords[px], y);
              const value = func(...args);

              const t = value >= maxValue ? 0 : value / maxValue;
              const [r, g, b] = t === 0 ? [0, 0, 0] : colormap(t);

              const idx = (py * width + px) * 4;
              imageData.data[idx] = r;
              imageData.data[idx + 1] = g;
              imageData.data[idx + 2] = b;
              imageData.data[idx + 3] = 255;
            }
          }

          // Put partial result to canvas
          ctx.putImageData(imageData, 0, 0);
          currentRow = endRow;

          if (onProgress) {
            onProgress(currentRow / height, performance.now() - startTime);
          }

          if (currentRow < height) {
            requestAnimationFrame(renderChunk);
          } else {
            resolve();
          }
        }

        renderChunk();
      });
    }

    // Buffer-based renderer - allocates WASM memory for entire image
    // This is much faster when the WASM function supports buffer output
    function renderHeatmapBuffer(canvasId, func, semantic, memory) {
      const canvas = document.getElementById(canvasId);
      if (!canvas || !memory) return false;

      const renderer = semantic?.renderer || {};
      const resolution = renderer.resolution || [600, 400];
      const colormap = COLORMAPS[renderer.colormap] || COLORMAPS.viridis;

      const width = canvas.width = resolution[0];
      const height = canvas.height = resolution[1];
      const ctx = canvas.getContext('2d');

      // Check if function has buffer signature (takes ptr, width, height, ...)
      // This is detected by having a "buffer" semantic type on first input
      const inputs = semantic?.inputs || [];
      const hasBufferInput = inputs.some(i => i.semantic_type === 'pointer' || i.semantic_type === 'buffer');

      if (!hasBufferInput) return false;

      // Allocate buffer in WASM memory
      const pixelCount = width * height;
      const bufferSize = pixelCount * 4; // i32 per pixel

      // Ensure memory is large enough (grow if needed)
      const neededPages = Math.ceil((65536 + bufferSize) / 65536);
      const currentPages = memory.buffer.byteLength / 65536;
      if (neededPages > currentPages) {
        memory.grow(neededPages - currentPages);
      }

      const ptr = 65536; // Start after first page
      const domain = renderer.domain || {};
      const xRange = domain.x?.range || [-2.5, 1.0];
      const yRange = domain.y?.range || [-1.5, 1.5];

      const iterInput = semantic?.inputs?.find(i => i.semantic_type === 'iteration_limit');
      const maxIter = iterInput?.default || 256;

      // Call WASM with buffer signature: (ptr, width, height, xMin, xMax, yMin, yMax, maxIter)
      try {
        func(ptr, width, height, xRange[0], xRange[1], yRange[0], yRange[1], maxIter);
      } catch (e) {
        console.warn('Buffer render failed:', e);
        return false;
      }

      // Read results from WASM memory
      const results = new Int32Array(memory.buffer, ptr, pixelCount);
      const imageData = ctx.createImageData(width, height);

      for (let i = 0; i < pixelCount; i++) {
        const value = results[i];
        const t = value >= maxIter ? 0 : value / maxIter;
        const [r, g, b] = t === 0 ? [0, 0, 0] : colormap(t);

        const idx = i * 4;
        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);
      return true;
    }

    // Legacy: render mandelbrot (for backwards compat)
    function renderMandelbrot(canvasId, mandelFunc, maxIter = 256) {
      renderHeatmap(canvasId, mandelFunc, {
        renderer: {
          domain: {
            x: { range: [-2.5, 1.0] },
            y: { range: [-1.2, 1.2] }
          },
          colormap: 'viridis',
          resolution: [600, 400]
        },
        inputs: [{ semantic_type: 'iteration_limit', default: maxIter }]
      }, [maxIter]);
    }

    // Render waveform (bar chart) for arrays
    function renderWaveform(canvasId, data, semantic) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      // Use canvas element dimensions or defaults
      const width = canvas.width = canvas.offsetWidth || 600;
      const height = canvas.height = canvas.offsetHeight || 120;
      const ctx = canvas.getContext('2d');

      // Clear with dark background
      ctx.fillStyle = '#161b22';
      ctx.fillRect(0, 0, width, height);

      if (!Array.isArray(data) || data.length === 0) return;

      // Find min/max for scaling
      const values = data.map(Number);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;

      const padding = 10;
      const barWidth = Math.max(2, (width - padding * 2) / values.length - 1);
      const chartHeight = height - padding * 2;

      // Draw bars with gradient based on value
      for (let i = 0; i < values.length; i++) {
        const normalized = (values[i] - min) / range;
        const barHeight = Math.max(2, normalized * chartHeight);
        const x = padding + i * (barWidth + 1);
        const y = height - padding - barHeight;

        // Color gradient: blue (low) -> green (high)
        const r = Math.floor(88 * (1 - normalized));
        const g = Math.floor(166 + 80 * normalized);
        const b = Math.floor(255 * (1 - normalized * 0.5));
        ctx.fillStyle = \`rgb(\${r}, \${g}, \${b})\`;
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      // Draw baseline
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, height - padding);
      ctx.lineTo(width - padding, height - padding);
      ctx.stroke();

      // Draw value labels
      ctx.fillStyle = '#8b949e';
      ctx.font = '10px JetBrains Mono';
      ctx.fillText(Math.round(max).toString(), 5, 12);
      ctx.fillText(Math.round(min).toString(), 5, height - 3);
      ctx.fillText(\`n=\${values.length}\`, width - 40, 12);
    }

    // Render histogram (bar chart)
    function renderHistogram(canvasId, data, semantic) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      const width = canvas.width = 600;
      const height = canvas.height = 200;
      const ctx = canvas.getContext('2d');

      // Clear
      ctx.fillStyle = '#161b22';
      ctx.fillRect(0, 0, width, height);

      if (!Array.isArray(data) || data.length === 0) return;

      const values = data.map(Number);
      const max = Math.max(...values);
      const barWidth = (width - 20) / values.length;
      const padding = 2;

      // Draw bars
      ctx.fillStyle = '#3fb950';
      for (let i = 0; i < values.length; i++) {
        const barHeight = (values[i] / max) * (height - 30);
        const x = 10 + i * barWidth + padding;
        const y = height - barHeight - 10;
        ctx.fillRect(x, y, barWidth - padding * 2, barHeight);
      }

      // Draw baseline
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, height - 10);
      ctx.lineTo(width - 10, height - 10);
      ctx.stroke();
    }

    // Get renderer type from semantic metadata
    function getRendererType(semantic) {
      return semantic?.renderer?.type || 'value';
    }

    // Check if function should have auto-render based on semantic metadata
    function hasAutoRender(fn) {
      if (!fn?.semantic?.renderer) return false;
      const type = fn.semantic.renderer.type;
      return type === 'heatmap' || type === 'waveform' || type === 'histogram';
    }

    // Check if a function is mandelbrot-like (legacy fallback)
    function isMandelbrotFunc(fn) {
      if (!fn || !fn.intent) return false;
      // First check semantic metadata
      if (fn.semantic?.renderer?.type === 'heatmap') return true;
      // Fallback to intent matching
      const intent = fn.intent.toLowerCase();
      return intent.includes('mandelbrot') || intent.includes('mandel');
    }

    // Check if a function is any fractal type (mandelbrot, julia, etc.)
    function isFractalFunc(fn) {
      if (!fn) return false;
      // Check semantic metadata
      if (fn.semantic?.renderer?.type === 'heatmap') return true;
      // Check intent keywords
      const intent = (fn.intent || '').toLowerCase();
      if (intent.includes('mandelbrot') || intent.includes('julia') || intent.includes('fractal')) return true;
      // Check for buffer signature pattern
      if (isBufferFunction(fn)) return true;
      return false;
    }

    // Store functions for rendering
    let renderFuncs = {};

    // Check if function is a buffer-based fractal (signature starts with ptr, width, height)
    function isBufferFunction(fn) {
      if (!fn?.signature) return false;
      // Buffer functions: (i32, i32, i32, f64, f64, f64, f64, i32) -> void
      const sig = fn.signature.toLowerCase();
      return sig.startsWith('(i32, i32, i32') && sig.includes('-> void');
    }

    // Render a buffer-based fractal function
    async function renderBufferFractal(fn, canvasId, options = {}) {
      const canvas = document.getElementById(canvasId);
      if (!canvas || !fn?.wasmFunc || !fn?.memory) {
        console.error('Missing canvas, function, or memory');
        return false;
      }

      const width = options.width || 600;
      const height = options.height || 400;
      const maxIter = options.maxIter || 256;

      // Detect Julia for domain defaults
      const isJulia = (fn.intent || '').toLowerCase().includes('julia');
      const xMin = options.xMin ?? (isJulia ? -2.0 : -2.5);
      const xMax = options.xMax ?? (isJulia ? 2.0 : 1.0);
      const yMin = options.yMin ?? (isJulia ? -2.0 : -1.5);
      const yMax = options.yMax ?? (isJulia ? 2.0 : 1.5);

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      const pixelCount = width * height;
      const bufferSize = pixelCount * 4; // i32 per pixel

      // Ensure memory is large enough
      const neededPages = Math.ceil((65536 + bufferSize) / 65536);
      const currentPages = fn.memory.buffer.byteLength / 65536;
      if (neededPages > currentPages) {
        fn.memory.grow(neededPages - currentPages);
      }

      const ptr = 65536; // Start after first page
      const start = performance.now();

      // AI generates different param orders - detect and handle both:
      // Mandelbrot: (ptr, w, h, xMin, yMin, xMax, yMax, maxIter) - interleaved
      // Julia:      (ptr, w, h, xMin, xMax, yMin, yMax, maxIter) - grouped
      if (isJulia) {
        fn.wasmFunc(ptr, width, height, xMin, xMax, yMin, yMax, maxIter);
      } else {
        fn.wasmFunc(ptr, width, height, xMin, yMin, xMax, yMax, maxIter);
      }

      const callTime = performance.now() - start;

      // Read results and render - MUST access memory.buffer AFTER the call
      // because grow() detaches the old ArrayBuffer
      const results = new Int32Array(fn.memory.buffer, ptr, pixelCount);
      const imageData = ctx.createImageData(width, height);
      const colormap = COLORMAPS.viridis;

      for (let i = 0; i < pixelCount; i++) {
        const value = results[i];
        const t = value >= maxIter ? 0 : value / maxIter;
        const [r, g, b] = t === 0 ? [0, 0, 0] : colormap(t);

        const idx = i * 4;
        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);

      const totalTime = performance.now() - start;
      console.log(\`Buffer render: \${width}x\${height} in \${totalTime.toFixed(1)}ms (WASM: \${callTime.toFixed(1)}ms)\`);

      return { width, height, callTime, totalTime };
    }

    // Trigger auto-rendering based on semantic metadata or signature detection
    async function triggerAutoRender(hash, canvasId) {
      const canvas = document.getElementById(canvasId);
      const info = document.getElementById(canvasId + '-info');
      if (!canvas) return;

      // Show canvas
      canvas.style.display = 'block';
      if (info) info.textContent = 'Rendering...';

      // Get the function from cache
      const fn = Array.from(lisp.wasmCache.values()).find(f => f.hash === hash);
      if (!fn) {
        if (info) info.textContent = 'Error: Function not found in cache';
        return;
      }

      const semantic = fn.semantic;
      const rendererType = semantic?.renderer?.type || 'value';

      // Auto-detect buffer function by signature pattern
      if (isBufferFunction(fn)) {
        const start = Date.now();
        const result = await renderBufferFractal(fn, canvasId);
        if (result) {
          const elapsed = Date.now() - start;
          if (info) info.textContent = \`Buffer rendered \${result.width}x\${result.height} in \${elapsed.toFixed(0)}ms (1 WASM call!)\`;
          return;
        }
      }

      if (rendererType === 'heatmap' || isFractalFunc(fn)) {
        const resolution = semantic?.renderer?.resolution || [600, 400];
        const pixels = resolution[0] * resolution[1];
        const start = Date.now();

        // First try buffer-based rendering via semantic metadata
        if (fn.memory && renderHeatmapBuffer(canvasId, fn.wasmFunc, semantic, fn.memory)) {
          const elapsed = Date.now() - start;
          if (info) info.textContent = \`Buffer rendered \${resolution[0]}x\${resolution[1]} in \${elapsed}ms (single WASM call)\`;
          return;
        }

        // Use fast blocking render (no progressive updates needed for typical sizes)
        // Include signature in semantic for Julia detection
        const semanticWithSig = { ...semantic, signature: fn.signature };
        renderHeatmap(canvasId, fn.wasmFunc, semanticWithSig, []);

        const elapsed = Date.now() - start;
        if (info) info.textContent = \`Rendered \${resolution[0]}x\${resolution[1]} = \${pixels.toLocaleString()} WASM calls in \${elapsed}ms\`;
      } else {
        if (info) info.textContent = \`Renderer type '\${rendererType}' not yet supported\`;
      }
    }

    // Legacy: trigger mandelbrot rendering (for backwards compat)
    async function triggerMandelbrotRender(hash, canvasId) {
      triggerAutoRender(hash, canvasId);
    }

    // Update cell content
    function updateCellContent(id, content) {
      const cell = cells.find(c => c.id === id);
      if (cell) cell.content = content;
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
        const code = cell.content.trim();
        const { result, output } = await lisp.evalString(code);

        // Determine output type based on result
        let outputType = 'result';
        let outputValue = result;

        // Check if result is a WASM function (from intent)
        if (result && typeof result === 'object' && result.wasmFunc) {
          outputType = 'compile';
          outputValue = {
            hash: result.hash,
            expanded_intent: result.intent,
            signature: result.signature,
            size: result.size,
            cached: result.cached,
            semantic: result.semantic,  // Include semantic metadata for auto-rendering
          };
        }

        // Include any print output
        const printOutput = output.length > 0 ? output.join('\\n') + '\\n' : '';

        cell.output = {
          type: outputType,
          value: outputValue,
          printOutput,
          timing_ms: Date.now() - start,
        };

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

    // Examples data
    const examples = [
      {
        title: 'Fibonacci',
        desc: 'Compile fibonacci and compute values',
        cells: [
          '(define fib (intent "fibonacci"))',
          '(fib 10)',
          '(map fib (range 15))'
        ]
      },
      {
        title: 'Quicksort',
        desc: 'Sort arrays with AI-generated WASM',
        cells: [
          '(define qsort (intent "quicksort"))',
          '(qsort (list 64 25 12 22 11 90 42))'
        ]
      },
      {
        title: 'Prime Numbers',
        desc: 'Filter primes using compiled predicate',
        cells: [
          '(define prime? (intent "is prime"))',
          '(filter prime? (range 2 50))'
        ]
      },
      {
        title: 'Factorial',
        desc: 'Compute factorials with WASM speed',
        cells: [
          '(define fact (intent "factorial"))',
          '(map fact (range 1 13))'
        ]
      },
      {
        title: 'GCD',
        desc: 'Greatest common divisor',
        cells: [
          '(define gcd (intent "greatest common divisor"))',
          '(gcd 48 18)',
          '(gcd 1071 462)'
        ]
      },
      {
        title: 'Higher-Order Functions',
        desc: 'Pure LISP with map, filter, reduce',
        cells: [
          '; Square numbers',
          '(map (lambda (x) (* x x)) (range 10))',
          '; Sum of squares',
          '(reduce + (map (lambda (x) (* x x)) (range 1 11)) 0)'
        ]
      },
      {
        title: 'String Operations',
        desc: 'UTF-8 string manipulation',
        cells: [
          '(string-concat "Hello" " " "World!")',
          '(string-split "a,b,c,d" ",")',
          '(string-join (list "x" "y" "z") "-")',
          '(map string-upcase (string-split "the quick brown fox" " "))'
        ]
      },
      {
        title: 'Regex',
        desc: 'Regular expression matching',
        cells: [
          '; Find all numbers in a string\\n(regex-match-all "\\\\d+" "a1b22c333")',
          '; Replace whitespace with dashes\\n(regex-replace "\\\\s+" "-" "hello   world")',
          '; Filter words starting with "a"\\n(filter (lambda (s) (regex-test "^a" s)) (list "apple" "banana" "avocado"))',
          '; Extract email domains\\n(map (lambda (e) (regex-match "@.+" e)) (list "alice@gmail.com" "bob@company.org"))'
        ]
      },
      {
        title: 'Mandelbrot',
        desc: 'Fractal heatmap with auto-render',
        cells: [
          '; Click "Render" to visualize!\\n(define mandel (intent "mandelbrot escape iteration"))',
          '(mandel -0.75 0.1 256) ; near boundary'
        ]
      },
      {
        title: 'Julia Set',
        desc: 'Related fractal with different constant',
        cells: [
          '; Julia set: iterate z = z² + c for each point z\\n(define julia (intent "julia set escape iteration, takes zx zy cx cy max_iter"))',
          '; Try different c values for different shapes\\n(julia 0.0 0.0 -0.7 0.27015 256)',
          '(julia 0.5 0.5 -0.7 0.27015 256)'
        ]
      },
      {
        title: 'Mandelbrot Buffer',
        desc: 'Single WASM call renders entire fractal!',
        cells: [
          '; Buffer-based: WASM fills entire image in one call\\n(define mbuf (intent "mandelbrot buffer"))'
        ]
      },
      {
        title: 'Julia Buffer',
        desc: 'Buffer-based Julia set rendering',
        cells: [
          '; Julia buffer: single WASM call for whole image\\n(define jbuf (intent "julia set buffer, fills buffer with escape iterations for c=-0.7+0.27i"))'
        ]
      },
      {
        title: 'Merge Sort',
        desc: 'Divide and conquer sorting',
        cells: [
          '(define msort (intent "merge sort"))',
          '(msort (list 38 27 43 3 9 82 10))'
        ]
      },
      {
        title: 'Binary Search',
        desc: 'O(log n) search in sorted arrays',
        cells: [
          '(define bsearch (intent "binary search"))',
          '(define sorted (list 1 3 5 7 9 11 13 15))',
          '(bsearch sorted 7)  ; returns index 3',
          '(bsearch sorted 4)  ; returns -1 (not found)'
        ]
      },
      {
        title: 'Math Functions',
        desc: 'Combine multiple WASM functions',
        cells: [
          '(define abs (intent "absolute value"))',
          '(define gcd (intent "gcd"))',
          '(map abs (list -5 3 -2 7 -1))',
          '(reduce gcd (list 48 36 24) 0)'
        ]
      },
      {
        title: 'Bubble Sort',
        desc: 'Classic O(n²) sorting',
        cells: [
          '(define bsort (intent "bubble sort"))',
          '(bsort (list 5 1 4 2 8 3 7 6))'
        ]
      },
      {
        title: 'Array Operations',
        desc: 'Find min, max, and count',
        cells: [
          '(define find-max (intent "find maximum"))',
          '(define find-min (intent "find minimum"))',
          '(define data (list 42 17 93 8 56 71))',
          '(list (find-min data) (find-max data))'
        ]
      },
      {
        title: 'Composing Functions',
        desc: 'Build complex operations from intents',
        cells: [
          '(define fib (intent "fibonacci"))',
          '(define prime? (intent "is prime"))',
          '; Which fibonacci numbers are prime?\\n(filter prime? (map fib (range 2 20)))'
        ]
      }
    ];

    // Toggle examples menu
    function toggleExamples() {
      const menu = document.getElementById('examplesMenu');
      const isOpen = menu.classList.contains('open');

      // Close menu if clicking elsewhere
      if (!isOpen) {
        menu.innerHTML = examples.map((ex, i) => \`
          <div class="example-item" onclick="loadExample(\${i}); event.stopPropagation();">
            <div class="example-title">\${ex.title}</div>
            <div class="example-desc">\${ex.desc}</div>
            <div class="example-code">\${escapeHtml(ex.cells[0])}</div>
          </div>
        \`).join('');

        // Close when clicking outside
        setTimeout(() => {
          document.addEventListener('click', closeExamplesOnClickOutside);
        }, 0);
      } else {
        document.removeEventListener('click', closeExamplesOnClickOutside);
      }

      menu.classList.toggle('open');
    }

    function closeExamplesOnClickOutside(e) {
      const dropdown = document.querySelector('.examples-dropdown');
      if (!dropdown.contains(e.target)) {
        document.getElementById('examplesMenu').classList.remove('open');
        document.removeEventListener('click', closeExamplesOnClickOutside);
      }
    }

    // Load an example
    function loadExample(index) {
      const ex = examples[index];
      document.getElementById('examplesMenu').classList.remove('open');
      document.removeEventListener('click', closeExamplesOnClickOutside);

      // Clear existing cells
      cells = [];
      Object.keys(editors).forEach(id => {
        editors[id].dispose();
        delete editors[id];
      });

      // Add example cells
      ex.cells.forEach(code => {
        const id = 'cell-' + (++cellIdCounter);
        cells.push({
          id,
          type: 'code',
          content: code,
          output: null,
          status: 'idle'
        });
      });

      renderCells();
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

    // Note: init() is called inside the Monaco require() callback
  </script>
</body>
</html>`;
}
