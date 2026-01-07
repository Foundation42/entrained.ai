/**
 * Forge 2.0 Bundler Container
 *
 * HTTP server that bundles TSX/TS/CSS files using Bun's native bundler.
 * Runs in a Cloudflare Durable Object container.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PORT = 8080;
// Use /app/bundles so Bun can find node_modules in /app/node_modules
const TEMP_DIR = '/app/bundles';

// =============================================================================
// Types
// =============================================================================

interface BundleRequest {
  /** Map of file path to content */
  files: Record<string, string>;

  /** Entry point path (e.g., "/index.tsx") */
  entry: string;

  /** Output format */
  format?: 'iife' | 'esm';

  /** Whether to minify */
  minify?: boolean;

  /** External packages (loaded from CDN) */
  external?: string[];

  /** Mapping of external package names to their window global names */
  externalGlobals?: Record<string, string>;
}

interface BundleResponse {
  /** Bundled JavaScript */
  js: string;

  /** Extracted CSS (if any) */
  css: string;

  /** Build warnings */
  warnings: string[];

  /** Build time in ms */
  buildTimeMs: number;
}

interface TranspileRequest {
  /** Source code to transpile */
  source: string;

  /** File type (tsx, ts, jsx, js) */
  loader: 'tsx' | 'ts' | 'jsx' | 'js';
}

interface TranspileResponse {
  /** Transpiled JavaScript */
  js: string;

  /** Any warnings */
  warnings: string[];
}

interface ErrorResponse {
  error: string;
  details?: string;
}

// =============================================================================
// Bundler
// =============================================================================

let bundleCounter = 0;

async function bundle(request: BundleRequest): Promise<BundleResponse> {
  const startTime = Date.now();
  const {
    files,
    entry,
    minify = true,
    external = ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom'],
    externalGlobals = {},
  } = request;

  // Build default globals for React
  const allGlobals: Record<string, string> = {
    'react': 'React',
    'react/jsx-runtime': 'React',
    'react/jsx-dev-runtime': 'React',
    'react-dom': 'ReactDOM',
    'react-dom/client': 'ReactDOM',
    ...externalGlobals,
  };

  // Build require shim that spreads all library properties for named imports
  const requireEntries = Object.entries(allGlobals)
    .map(([pkg, global]) => {
      return `if (name === "${pkg}") { var m = window.${global}; if (!m) return {}; if (m.__esModule) return m; var r = { default: m, __esModule: true }; for (var k in m) r[k] = m[k]; return r; }`;
    })
    .join(' ');

  const subpathEntries = Object.entries(externalGlobals)
    .map(([pkg, global]) => `if (name.startsWith("${pkg}/")) return window.${global};`)
    .join(' ');

  const requireShim = `var require = (function() { var cache = {}; return function(name) { if (cache[name]) return cache[name]; ${requireEntries} ${subpathEntries} console.warn("Unknown module:", name); return {}; }; })();`;

  // Create unique temp directory for this bundle
  const bundleId = `bundle-${Date.now()}-${++bundleCounter}`;
  const workDir = join(TEMP_DIR, bundleId);

  console.log(`[Bundle] Starting bundle in ${workDir}`);
  console.log(`[Bundle] Files: ${Object.keys(files).join(', ')}`);
  console.log(`[Bundle] Entry: ${entry}`);
  console.log(`[Bundle] External: ${external.join(', ')}`);

  try {
    // Create work directory
    await mkdir(workDir, { recursive: true });

    // Write all virtual files to temp directory
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(workDir, filePath);
      const dir = fullPath.replace(/\/[^/]+$/, '');
      await mkdir(dir, { recursive: true });
      await writeFile(fullPath, content);
      console.log(`[Bundle] Wrote ${filePath} (${content.length} bytes)`);
    }

    // Determine entry file path
    const entryPath = join(workDir, entry);
    console.log(`[Bundle] Entry path: ${entryPath}`);

    // Bundle with Bun
    // Debug: show where we're bundling from and where node_modules is
    const { readdirSync, existsSync } = await import('node:fs');
    console.log(`[Bundle] CWD: ${process.cwd()}`);
    console.log(`[Bundle] workDir: ${workDir}`);
    console.log(`[Bundle] /app/node_modules exists: ${existsSync('/app/node_modules')}`);
    console.log(`[Bundle] workDir contents: ${readdirSync(workDir).join(', ')}`);
    if (existsSync('/app/node_modules')) {
      const pkgs = readdirSync('/app/node_modules').filter(p => p.startsWith('@react') || p === 'three');
      console.log(`[Bundle] R3F packages in node_modules: ${pkgs.join(', ')}`);
    }

    let result;
    try {
      result = await Bun.build({
        entrypoints: [entryPath],
        outdir: join(workDir, 'out'),
        root: '/app',
        target: 'browser',
        format: 'cjs',
        naming: '[name].[ext]',
        minify,
        external,
        define: {
          'process.env.NODE_ENV': '"production"',
        },
        // Use classic JSX transform (React.createElement) instead of automatic (jsx-runtime)
        // This works with React UMD builds from CDN
        jsx: {
          runtime: 'classic',
          factory: 'React.createElement',
          fragment: 'React.Fragment',
        },
      });
    } catch (buildError) {
      console.error('[Bundle] Bun.build threw exception:', buildError);
      throw new Error(`Bun.build exception: ${buildError instanceof Error ? buildError.message : String(buildError)}`);
    }

    if (!result.success) {
      console.error('[Bundle] Build failed, logs:', JSON.stringify(result.logs, null, 2));
      const errors = result.logs
        .map(log => `[${log.level}] ${log.message}`)
        .join('\n');
      throw new Error(`Build failed:\n${errors || 'No error details available'}`);
    }

    // Read output files
    let js = '';
    let css = '';

    for (const output of result.outputs) {
      const text = await output.text();
      if (output.path.endsWith('.js')) {
        // Don't add require shim here - bundler service adds it to HTML
        // CJS format uses module.exports, wrap to capture it
        js = `var module = { exports: {} }; var exports = module.exports;\n${text}\nwindow.ForgeBundle = module.exports;`;
      } else if (output.path.endsWith('.css')) {
        css = text;
      }
    }

    const warnings = result.logs
      .filter(log => log.level === 'warning')
      .map(log => log.message);

    const buildTimeMs = Date.now() - startTime;
    console.log(`[Bundle] Complete: ${js.length} bytes JS, ${css.length} bytes CSS, ${buildTimeMs}ms`);

    return { js, css, warnings, buildTimeMs };
  } finally {
    // Clean up temp directory
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// =============================================================================
// Transpiler (single file)
// =============================================================================

async function transpile(request: TranspileRequest): Promise<TranspileResponse> {
  const { source, loader } = request;

  try {
    const transpiler = new Bun.Transpiler({
      loader,
      target: 'browser',
    });

    const js = transpiler.transformSync(source);

    return {
      js,
      warnings: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Transpile failed: ${message}`);
  }
}

// =============================================================================
// HTTP Server
// =============================================================================

console.log(`[Bundler] Starting server on port ${PORT}...`);

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Health check
      if (path === '/health' && req.method === 'GET') {
        return Response.json(
          {
            status: 'ok',
            service: 'forge2-bundler',
            runtime: 'bun',
            bunVersion: Bun.version,
            timestamp: new Date().toISOString(),
          },
          { headers: corsHeaders }
        );
      }

      // Bundle endpoint
      if (path === '/bundle' && req.method === 'POST') {
        const body = await req.json() as BundleRequest;

        if (!body.files || typeof body.files !== 'object') {
          return Response.json(
            { error: 'files is required and must be an object' } as ErrorResponse,
            { status: 400, headers: corsHeaders }
          );
        }

        if (!body.entry) {
          return Response.json(
            { error: 'entry is required' } as ErrorResponse,
            { status: 400, headers: corsHeaders }
          );
        }

        console.log(`[Bundle] Entry: ${body.entry}, Files: ${Object.keys(body.files).length}`);
        const result = await bundle(body);
        console.log(`[Bundle] Complete: ${result.js.length} bytes JS, ${result.css.length} bytes CSS, ${result.buildTimeMs}ms`);

        return Response.json(result, { headers: corsHeaders });
      }

      // Transpile endpoint (single file)
      if (path === '/transpile' && req.method === 'POST') {
        const body = await req.json() as TranspileRequest;

        if (!body.source) {
          return Response.json(
            { error: 'source is required' } as ErrorResponse,
            { status: 400, headers: corsHeaders }
          );
        }

        const loader = body.loader || 'tsx';
        console.log(`[Transpile] Loader: ${loader}, Source: ${body.source.length} chars`);

        const result = await transpile({ source: body.source, loader });
        console.log(`[Transpile] Complete: ${result.js.length} chars`);

        return Response.json(result, { headers: corsHeaders });
      }

      // 404
      return Response.json(
        { error: 'Not found', path } as ErrorResponse,
        { status: 404, headers: corsHeaders }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Error] ${path}:`, message);

      return Response.json(
        { error: message } as ErrorResponse,
        { status: 500, headers: corsHeaders }
      );
    }
  },
});

console.log(`[Bundler] Server running on http://localhost:${PORT}`);
console.log(`[Bundler] Bun version: ${Bun.version}`);
