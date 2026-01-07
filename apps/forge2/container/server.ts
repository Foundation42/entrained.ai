/**
 * Forge 2.0 Bundler Container
 *
 * HTTP server that bundles TSX/TS/CSS files using esbuild.
 * Runs in a Cloudflare Durable Object container.
 */

import * as esbuild from 'esbuild';

const PORT = 8080;

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

async function bundle(request: BundleRequest): Promise<BundleResponse> {
  const startTime = Date.now();
  const {
    files,
    entry,
    format = 'iife',
    minify = true,
    external = ['react', 'react-dom'],
    externalGlobals = {},
  } = request;

  // Build default globals for React
  const allGlobals: Record<string, string> = {
    'react': 'React',
    'react-dom': 'ReactDOM',
    'react-dom/client': 'ReactDOM',
    ...externalGlobals,
  };

  // Build require shim entries
  // For libraries that use named exports (import { x } from 'lib'), we need to return
  // an object that has the default export AND all named exports from the library.
  // We spread the library object to include all its properties (useState, useRef, etc.)
  const requireEntries = Object.entries(allGlobals)
    .map(([pkg, global]) => {
      // Return object with default export + spread all library properties for named imports
      return `if (name === "${pkg}") { var m = window.${global}; if (!m) return {}; if (m.__esModule) return m; var r = { default: m, __esModule: true }; for (var k in m) r[k] = m[k]; return r; }`;
    })
    .join(' ');

  // Also handle subpath imports (e.g., 'three/examples/...')
  const subpathEntries = Object.entries(externalGlobals)
    .map(([pkg, global]) => `if (name.startsWith("${pkg}/")) return window.${global};`)
    .join(' ');

  const requireShim = `var require = (function() { var cache = {}; return function(name) { if (cache[name]) return cache[name]; ${requireEntries} ${subpathEntries} console.warn("Unknown module:", name); return {}; }; })();`;

  // Log input for debugging
  console.log(`[Bundle] Files object keys: ${Object.keys(files).join(', ')}`);
  console.log(`[Bundle] Entry point: ${entry}`);

  // Create virtual filesystem plugin
  const virtualFSPlugin: esbuild.Plugin = {
    name: 'virtual-fs',
    setup(build) {
      // Resolve paths
      build.onResolve({ filter: /.*/ }, (args) => {
        console.log(`[VFS] onResolve: ${args.path} (kind: ${args.kind})`);

        // Entry point
        if (args.kind === 'entry-point') {
          const exists = files[args.path] !== undefined;
          console.log(`[VFS] Entry point ${args.path} exists: ${exists}`);
          return { path: args.path, namespace: 'virtual' };
        }

        // Relative imports
        if (args.path.startsWith('.')) {
          const dir = args.importer.replace(/\/[^/]+$/, '') || '';
          let resolved = `${dir}/${args.path}`.replace(/\/+/g, '/');

          // Normalize path - handle . and .. segments
          const parts = resolved.split('/').filter(Boolean);
          const normalized: string[] = [];
          for (const part of parts) {
            if (part === '..') {
              normalized.pop();
            } else if (part !== '.') {
              normalized.push(part);
            }
          }
          resolved = '/' + normalized.join('/');

          // Try with different extensions
          const extensions = ['', '.tsx', '.ts', '.jsx', '.js', '.css', '.json'];
          for (const ext of extensions) {
            const tryPath = resolved + ext;
            if (files[tryPath] !== undefined) {
              return { path: tryPath, namespace: 'virtual' };
            }
          }

          // Try index files
          for (const ext of ['/index.tsx', '/index.ts', '/index.jsx', '/index.js']) {
            const tryPath = resolved + ext;
            if (files[tryPath] !== undefined) {
              return { path: tryPath, namespace: 'virtual' };
            }
          }
        }

        // Absolute paths from virtual FS
        if (args.path.startsWith('/')) {
          const extensions = ['', '.tsx', '.ts', '.jsx', '.js', '.css', '.json'];
          for (const ext of extensions) {
            const tryPath = args.path + ext;
            if (files[tryPath] !== undefined) {
              return { path: tryPath, namespace: 'virtual' };
            }
          }
        }

        // External packages
        return { path: args.path, external: true };
      });

      // Load from virtual FS
      build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
        console.log(`[VFS] onLoad: ${args.path}`);
        const content = files[args.path];
        if (content === undefined) {
          console.log(`[VFS] File not found: ${args.path}`);
          return { errors: [{ text: `File not found in virtual FS: ${args.path}` }] };
        }
        console.log(`[VFS] Loaded ${args.path}: ${content.length} chars`);

        // Determine loader from extension
        const ext = args.path.split('.').pop() || 'ts';
        const loaderMap: Record<string, esbuild.Loader> = {
          tsx: 'tsx',
          ts: 'ts',
          jsx: 'jsx',
          js: 'js',
          css: 'css',
          json: 'json',
        };

        return {
          contents: content,
          loader: loaderMap[ext] || 'ts',
        };
      });
    },
  };

  try {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      outdir: '/out',
      format,
      platform: 'browser',
      globalName: format === 'iife' ? 'ForgeBundle' : undefined,
      target: 'es2020',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      minify,
      sourcemap: false,
      plugins: [virtualFSPlugin],
      external,
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      // Inject require shim for external packages loaded from CDN
      banner: {
        js: requireShim,
      },
      logLevel: 'silent',
    });

    let js = '';
    let css = '';

    // Log output files for debugging
    console.log(`[Bundle] Build complete. Errors: ${result.errors.length}, Warnings: ${result.warnings.length}`);
    console.log(`[Bundle] Output files (${result.outputFiles?.length || 0}): ${result.outputFiles?.map(f => `${f.path} (${f.text.length} bytes)`).join(', ') || 'none'}`);

    for (const file of result.outputFiles || []) {
      // Match by extension anywhere in path
      if (file.path.includes('.js')) {
        js = file.text;
      } else if (file.path.includes('.css')) {
        css = file.text;
      }
    }

    const warnings = result.warnings.map((w) => `${w.location?.file || ''}:${w.location?.line || ''} ${w.text}`);
    const buildTimeMs = Date.now() - startTime;

    return { js, css, warnings, buildTimeMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Bundle failed: ${message}`);
  }
}

// =============================================================================
// Transpiler (single file)
// =============================================================================

async function transpile(request: TranspileRequest): Promise<TranspileResponse> {
  const { source, loader } = request;

  try {
    const result = await esbuild.transform(source, {
      loader,
      format: 'esm',
      target: 'es2020',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      minify: false,
      sourcemap: false,
    });

    return {
      js: result.code,
      warnings: result.warnings.map((w) => w.text),
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
            esbuild: esbuild.version,
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
console.log(`[Bundler] esbuild version: ${esbuild.version}`);
