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
      min-height: 80px;
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
        return [token.slice(1, -1).replace(/\\\\"/g, '"').replace(/\\\\n/g, '\\n'), pos + 1];
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

          // No arrays - direct call
          return func.wasmFunc(...args);
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
          cached: result.cached
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
                   'fib', 'factorial', 'gcd', 'is_prime', 'fibonacci'],

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
            [/(map|filter|reduce|range|list|cons|car|cdr|first|rest|nth|length|append|reverse|sort|apply|eval|print|display|search|abs|mod|max|min|fib|factorial|gcd|fibonacci|is_prime)(?![a-zA-Z0-9_\\-])/, 'support.function'],

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

      init();
    });

    // Initialize with welcome cells
    function init() {
      addCell('code', '(define fib (intent "fibonacci"))');
      addCell('code', '(fib 10)');
      loadStats();
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
          </div>
          \${outputHtml}
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
        content += \`
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
