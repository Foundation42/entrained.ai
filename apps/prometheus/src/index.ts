// Prometheus REPL - Intent-Driven Notebook
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { replPage } from './pages/repl';

const app = new Hono<{ Bindings: Env }>();

// CORS for cross-origin requests
app.use('/api/*', cors({
  origin: (origin) => {
    if (!origin) return 'https://prometheus.entrained.ai';
    if (origin.endsWith('.entrained.ai') || origin === 'https://entrained.ai') {
      return origin;
    }
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin;
    }
    return null;
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'prometheus-repl' }));

// ================================
// API Proxy to Prometheus Edge
// ================================

// Compile intent to WASM
app.post('/api/compile', async (c) => {
  const body = await c.req.json();
  const response = await fetch(`${c.env.PROMETHEUS_EDGE}/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return c.json(await response.json(), response.status as 200);
});

// Expand intent (AI only, no compilation)
app.post('/api/expand', async (c) => {
  const body = await c.req.json();
  const response = await fetch(`${c.env.PROMETHEUS_EDGE}/expand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return c.json(await response.json(), response.status as 200);
});

// Semantic search
app.get('/api/search', async (c) => {
  const query = c.req.query('q');
  const limit = c.req.query('limit') || '10';
  const response = await fetch(
    `${c.env.PROMETHEUS_EDGE}/search?q=${encodeURIComponent(query || '')}&limit=${limit}`
  );
  return c.json(await response.json(), response.status as 200);
});

// Get registry stats
app.get('/api/stats', async (c) => {
  const response = await fetch(`${c.env.PROMETHEUS_EDGE}/stats`);
  return c.json(await response.json(), response.status as 200);
});

// Explore (nebula data)
app.get('/api/explore', async (c) => {
  const response = await fetch(`${c.env.PROMETHEUS_EDGE}/explore`);
  return c.json(await response.json(), response.status as 200);
});

// Get function metadata
app.get('/api/registry/:hash', async (c) => {
  const hash = c.req.param('hash');
  const response = await fetch(`${c.env.PROMETHEUS_EDGE}/registry/${hash}`);
  return c.json(await response.json(), response.status as 200);
});

// Get WASM binary
app.get('/api/binary/:hash', async (c) => {
  const hash = c.req.param('hash');
  const response = await fetch(`${c.env.PROMETHEUS_EDGE}/binary/${hash}`);
  if (!response.ok) {
    return c.json({ error: 'Not found' }, 404);
  }
  return new Response(response.body, {
    headers: { 'Content-Type': 'application/wasm' },
  });
});

// Get function icon
app.get('/api/icon/:hash', async (c) => {
  const hash = c.req.param('hash');
  const response = await fetch(`${c.env.PROMETHEUS_EDGE}/icon/${hash}`);
  if (!response.ok) {
    return c.json({ error: 'Not found' }, 404);
  }
  return new Response(response.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
});

// List packages
app.get('/api/packages', async (c) => {
  const response = await fetch(`${c.env.PROMETHEUS_EDGE}/packages`);
  return c.json(await response.json(), response.status as 200);
});

// Get package
app.get('/api/package/:namespace/:name', async (c) => {
  const namespace = c.req.param('namespace');
  const name = c.req.param('name');
  const response = await fetch(`${c.env.PROMETHEUS_EDGE}/package/${namespace}/${name}`);
  return c.json(await response.json(), response.status as 200);
});

// ================================
// Pages
// ================================

// Main REPL interface
app.get('/', (c) => c.html(replPage()));

// EAP Manifest
app.get('/manifest.json', (c) => {
  const manifest = {
    app: 'prometheus.entrained.ai',
    version: '1.0.0',
    name: 'Prometheus REPL',
    description: 'Intent-driven WASM computation notebook',

    capabilities: [
      {
        id: 'compute.eval',
        name: 'Evaluate Expression',
        description: 'Compile and execute an intent expression',
        endpoint: '/api/compile',
        method: 'POST',
        parameters: {
          intent: { type: 'string', required: true, description: 'Natural language intent' },
        },
        returns: {
          type: 'object',
          schema: {
            hash: 'string',
            signature: 'string',
            size: 'number',
          },
        },
      },
      {
        id: 'compute.search',
        name: 'Search Functions',
        description: 'Semantic search for compiled functions',
        endpoint: '/api/search',
        method: 'GET',
        parameters: {
          q: { type: 'string', required: true, description: 'Search query' },
          limit: { type: 'number', optional: true, description: 'Max results' },
        },
      },
    ],

    introspection: {
      health: '/health',
    },

    ai: {
      apiEndpoint: '/api',
      instructions: {
        summary: 'Prometheus REPL compiles natural language intents to WASM and executes them',
        capabilities: [
          'Compile intents like "fibonacci" to WASM',
          'Semantic search for existing functions',
          'Import packages of pre-compiled functions',
        ],
      },
    },
  };

  return c.json(manifest, 200, {
    'Cache-Control': 'public, max-age=300',
  });
});

export default app;
