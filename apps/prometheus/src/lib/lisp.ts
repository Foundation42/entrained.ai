/**
 * Prometheus LISP - Browser-based LISP with WASM Integration
 *
 * Ported from Python implementation to TypeScript for browser execution.
 */

// ============================================
// Types
// ============================================

export class Symbol {
  constructor(public name: string) {}
  toString() {
    return this.name;
  }
}

export type Expr = Symbol | number | string | Expr[];

export interface WasmFunction {
  name: string;
  intent: string;
  hash: string;
  signature: string;
  instance: WebAssembly.Instance;
  func: CallableFunction;
  size: number;
  metadata?: Record<string, unknown>;
}

// ============================================
// Parser
// ============================================

export function tokenize(source: string): string[] {
  const pattern = /(\()|(\))|("(?:[^"\\]|\\.)*")|(;[^\n]*)|([^\s()"';]+)/g;
  const tokens: string[] = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const token = match[0];
    if (!token.startsWith(';')) {
      // Skip comments
      tokens.push(token);
    }
  }
  return tokens;
}

function parseTokens(tokens: string[], pos: number): [Expr, number] {
  if (pos >= tokens.length) {
    throw new SyntaxError('Unexpected end of input');
  }

  const token = tokens[pos];

  if (token === '(') {
    const lst: Expr[] = [];
    pos += 1;
    while (pos < tokens.length && tokens[pos] !== ')') {
      const [expr, newPos] = parseTokens(tokens, pos);
      lst.push(expr);
      pos = newPos;
    }
    if (pos >= tokens.length) {
      throw new SyntaxError('Missing closing paren');
    }
    return [lst, pos + 1];
  }

  if (token === ')') {
    throw new SyntaxError('Unexpected closing paren');
  }

  if (token.startsWith('"')) {
    // String literal
    const str = token
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n');
    return [str, pos + 1];
  }

  // Atom: try number, then symbol
  if (token.includes('.')) {
    const num = parseFloat(token);
    if (!isNaN(num)) return [num, pos + 1];
  } else {
    const num = parseInt(token, 10);
    if (!isNaN(num)) return [num, pos + 1];
  }

  return [new Symbol(token), pos + 1];
}

export function parse(source: string): Expr[] {
  const tokens = tokenize(source);
  const expressions: Expr[] = [];
  let pos = 0;
  while (pos < tokens.length) {
    const [expr, newPos] = parseTokens(tokens, pos);
    expressions.push(expr);
    pos = newPos;
  }
  return expressions;
}

export function toString(expr: Expr): string {
  if (Array.isArray(expr)) {
    return '(' + expr.map(toString).join(' ') + ')';
  }
  if (typeof expr === 'string') {
    return `"${expr}"`;
  }
  if (expr instanceof Symbol) {
    return expr.name;
  }
  return String(expr);
}

// ============================================
// Environment
// ============================================

export class Environment {
  private bindings: Map<string, unknown> = new Map();

  constructor(private parent?: Environment) {}

  get(name: string): unknown {
    if (this.bindings.has(name)) {
      return this.bindings.get(name);
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    throw new Error(`Undefined symbol: ${name}`);
  }

  set(name: string, value: unknown): void {
    // Find the environment where name is defined and update it
    if (this.bindings.has(name)) {
      this.bindings.set(name, value);
    } else if (this.parent) {
      this.parent.set(name, value);
    } else {
      throw new Error(`Cannot set undefined symbol: ${name}`);
    }
  }

  define(name: string, value: unknown): void {
    this.bindings.set(name, value);
  }
}

// ============================================
// Lambda
// ============================================

export class Lambda {
  constructor(
    public params: Symbol[],
    public body: Expr,
    public env: Environment
  ) {}

  toString() {
    return `<lambda (${this.params.map((p) => p.name).join(' ')})>`;
  }
}

// ============================================
// Evaluator
// ============================================

export interface EvalOptions {
  onOutput?: (text: string) => void;
  onCompileStart?: (intent: string) => void;
  onCompileEnd?: (fn: WasmFunction) => void;
}

export class LispEvaluator {
  private wasmCache: Map<string, WasmFunction> = new Map();
  private globalEnv: Environment;
  private options: EvalOptions;

  public stats = {
    intentsCompiled: 0,
    cacheHits: 0,
    totalCompileTimeMs: 0,
  };

  constructor(options: EvalOptions = {}) {
    this.options = options;
    this.globalEnv = this.createGlobalEnv();
  }

  private output(text: string): void {
    if (this.options.onOutput) {
      this.options.onOutput(text);
    } else {
      console.log(text);
    }
  }

  private createGlobalEnv(): Environment {
    const env = new Environment();

    // Arithmetic
    env.define('+', (...args: number[]) => args.reduce((a, b) => a + b, 0));
    env.define('-', (a: number, b?: number) => (b === undefined ? -a : a - b));
    env.define('*', (...args: number[]) => args.reduce((a, b) => a * b, 1));
    env.define('/', (a: number, b: number) => a / b);
    env.define('mod', (a: number, b: number) => a % b);

    // Comparison
    env.define('=', (a: unknown, b: unknown) => a === b);
    env.define('<', (a: number, b: number) => a < b);
    env.define('>', (a: number, b: number) => a > b);
    env.define('<=', (a: number, b: number) => a <= b);
    env.define('>=', (a: number, b: number) => a >= b);

    // List operations
    env.define('list', (...args: unknown[]) => [...args]);
    env.define('car', (lst: unknown[]) => lst[0]);
    env.define('cdr', (lst: unknown[]) => lst.slice(1));
    env.define('cons', (a: unknown, lst: unknown[]) => [a, ...lst]);
    env.define('null?', (lst: unknown[]) => lst.length === 0);
    env.define('length', (lst: unknown[]) => lst.length);
    env.define('append', (...lsts: unknown[][]) => lsts.flat());
    env.define('reverse', (lst: unknown[]) => [...lst].reverse());
    env.define('nth', (lst: unknown[], n: number) => lst[n]);

    // Higher-order functions
    env.define('map', (f: CallableFunction, lst: unknown[]) =>
      lst.map((x) => this.applyFunc(f, [x]))
    );
    env.define('filter', (f: CallableFunction, lst: unknown[]) =>
      lst.filter((x) => this.applyFunc(f, [x]))
    );
    env.define('reduce', (f: CallableFunction, lst: unknown[], init?: unknown) => {
      if (init !== undefined) {
        return lst.reduce((acc, x) => this.applyFunc(f, [acc, x]), init);
      }
      return lst.reduce((acc, x) => this.applyFunc(f, [acc, x]));
    });

    // Utilities
    env.define('range', (...args: number[]) => {
      let start = 0,
        end = 0,
        step = 1;
      if (args.length === 1) {
        end = args[0];
      } else if (args.length === 2) {
        [start, end] = args;
      } else {
        [start, end, step] = args;
      }
      const result: number[] = [];
      for (let i = start; i < end; i += step) {
        result.push(i);
      }
      return result;
    });

    env.define('print', (...args: unknown[]) => {
      this.output(args.map(String).join(' '));
      return args[args.length - 1];
    });

    // Logic
    env.define('not', (x: unknown) => !x);

    // Type checks
    env.define('number?', (x: unknown) => typeof x === 'number');
    env.define('string?', (x: unknown) => typeof x === 'string');
    env.define('list?', (x: unknown) => Array.isArray(x));
    env.define('function?', (x: unknown) => typeof x === 'function' || x instanceof Lambda);

    // Math
    env.define('abs', Math.abs);
    env.define('min', Math.min);
    env.define('max', Math.max);
    env.define('sqrt', Math.sqrt);
    env.define('floor', Math.floor);
    env.define('ceil', Math.ceil);
    env.define('round', Math.round);

    // Introspection
    env.define('wasm-stats', () => ({ ...this.stats }));
    env.define('wasm-cache-size', () => this.wasmCache.size);

    return env;
  }

  private applyFunc(func: unknown, args: unknown[]): unknown {
    if (func instanceof Lambda) {
      const localEnv = new Environment(func.env);
      func.params.forEach((param, i) => {
        localEnv.define(param.name, args[i]);
      });
      return this.eval(func.body, localEnv);
    }

    if (typeof func === 'object' && func !== null && 'func' in func) {
      // WasmFunction
      const wasmFn = func as WasmFunction;
      return wasmFn.func(...args);
    }

    if (typeof func === 'function') {
      return func(...args);
    }

    throw new Error(`Cannot apply: ${func}`);
  }

  async eval(expr: Expr, env?: Environment): Promise<unknown> {
    if (!env) env = this.globalEnv;

    // Symbol lookup
    if (expr instanceof Symbol) {
      return env.get(expr.name);
    }

    // Self-evaluating: numbers, strings
    if (typeof expr === 'number' || typeof expr === 'string') {
      return expr;
    }

    // Empty list
    if (Array.isArray(expr) && expr.length === 0) {
      return [];
    }

    // List: special form or function call
    if (Array.isArray(expr)) {
      const head = expr[0];

      // Special forms
      if (head instanceof Symbol) {
        const name = head.name;

        // (intent "description")
        if (name === 'intent') {
          const intentStr = await this.eval(expr[1], env);
          if (typeof intentStr !== 'string') {
            throw new Error(`Intent must be a string, got: ${typeof intentStr}`);
          }
          return this.handleIntent(intentStr);
        }

        // (define name value) or (define (name args...) body)
        if (name === 'define') {
          const sym = expr[1];
          if (Array.isArray(sym)) {
            // (define (name args...) body)
            const funcName = sym[0] as Symbol;
            const params = sym.slice(1) as Symbol[];
            const body = expr[2];
            const lambda = new Lambda(params, body, env);
            env.define(funcName.name, lambda);
            return lambda;
          } else {
            // (define name value)
            const value = await this.eval(expr[2], env);
            env.define((sym as Symbol).name, value);
            return value;
          }
        }

        // (lambda (args...) body)
        if (name === 'lambda') {
          const params = expr[1] as Symbol[];
          const body = expr[2];
          return new Lambda(params, body, env);
        }

        // (if cond then else)
        if (name === 'if') {
          const cond = await this.eval(expr[1], env);
          if (cond) {
            return this.eval(expr[2], env);
          } else if (expr.length > 3) {
            return this.eval(expr[3], env);
          }
          return null;
        }

        // (quote expr)
        if (name === 'quote') {
          return expr[1];
        }

        // (let ((name val)...) body)
        if (name === 'let') {
          const bindings = expr[1] as Expr[];
          const body = expr[2];
          const localEnv = new Environment(env);
          for (const binding of bindings) {
            const bindingArr = binding as Expr[];
            const bindName = (bindingArr[0] as Symbol).name;
            const bindVal = await this.eval(bindingArr[1], env);
            localEnv.define(bindName, bindVal);
          }
          return this.eval(body, localEnv);
        }

        // (begin expr...)
        if (name === 'begin') {
          let result: unknown = null;
          for (let i = 1; i < expr.length; i++) {
            result = await this.eval(expr[i], env);
          }
          return result;
        }

        // (set! name value)
        if (name === 'set!') {
          const sym = (expr[1] as Symbol).name;
          const value = await this.eval(expr[2], env);
          env.set(sym, value);
          return value;
        }

        // (and a b ...)
        if (name === 'and') {
          for (let i = 1; i < expr.length; i++) {
            const val = await this.eval(expr[i], env);
            if (!val) return false;
          }
          return true;
        }

        // (or a b ...)
        if (name === 'or') {
          for (let i = 1; i < expr.length; i++) {
            const val = await this.eval(expr[i], env);
            if (val) return val;
          }
          return false;
        }

        // (cond (test expr)... (else expr))
        if (name === 'cond') {
          for (let i = 1; i < expr.length; i++) {
            const clause = expr[i] as Expr[];
            const test = clause[0];
            if (test instanceof Symbol && test.name === 'else') {
              return this.eval(clause[1], env);
            }
            const testVal = await this.eval(test, env);
            if (testVal) {
              return this.eval(clause[1], env);
            }
          }
          return null;
        }
      }

      // Function call
      const func = await this.eval(head, env);
      const args: unknown[] = [];
      for (let i = 1; i < expr.length; i++) {
        args.push(await this.eval(expr[i], env));
      }

      return this.applyFunc(func, args);
    }

    throw new Error(`Cannot evaluate: ${toString(expr)}`);
  }

  private async handleIntent(intent: string): Promise<WasmFunction> {
    // Check cache first
    const cached = this.wasmCache.get(intent);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    this.options.onCompileStart?.(intent);
    const start = Date.now();

    // Call the compile API
    const response = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Compilation failed');
    }

    const result = await response.json();
    const { hash, expanded_intent, signature, size } = result;

    // Fetch the WASM binary
    const wasmResponse = await fetch(`/api/binary/${hash}`);
    if (!wasmResponse.ok) {
      throw new Error('Failed to fetch WASM binary');
    }
    const wasmBinary = await wasmResponse.arrayBuffer();

    // Instantiate WASM
    const wasmModule = await WebAssembly.instantiate(wasmBinary);
    const exports = wasmModule.instance.exports;

    // Find the exported function (usually the first export that's a function)
    let funcName = '';
    let func: CallableFunction | null = null;
    for (const [name, exp] of Object.entries(exports)) {
      if (typeof exp === 'function') {
        funcName = name;
        func = exp as CallableFunction;
        break;
      }
    }

    if (!func) {
      throw new Error('No function found in WASM module');
    }

    const compileTime = Date.now() - start;
    this.stats.intentsCompiled++;
    this.stats.totalCompileTimeMs += compileTime;

    const wasmFn: WasmFunction = {
      name: funcName,
      intent: expanded_intent || intent,
      hash,
      signature,
      instance: wasmModule.instance,
      func,
      size,
    };

    // Cache it
    this.wasmCache.set(intent, wasmFn);

    this.options.onCompileEnd?.(wasmFn);

    return wasmFn;
  }

  // Convenience method to evaluate a string
  async evalString(source: string): Promise<unknown> {
    const exprs = parse(source);
    let result: unknown = null;
    for (const expr of exprs) {
      result = await this.eval(expr);
    }
    return result;
  }

  // Get a value from the global environment
  getGlobal(name: string): unknown {
    return this.globalEnv.get(name);
  }

  // Define a value in the global environment
  defineGlobal(name: string, value: unknown): void {
    this.globalEnv.define(name, value);
  }
}
