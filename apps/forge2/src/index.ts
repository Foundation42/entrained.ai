/**
 * Forge 2.0 - Main Entry Point
 *
 * Conversational asset workspace and build system.
 * Handles all HTTP routes via Hono on Cloudflare Workers.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './types';

// Route modules
import searchRoutes from './api/search';
import assetRoutes from './api/assets';
import generateRoutes from './api/generate';

const app = new Hono<{ Bindings: Env }>();

// ===========================================================================
// Middleware
// ===========================================================================

// Logging
app.use('*', logger());

// CORS - allow requests from entrained.ai subdomains and localhost
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*';
    if (origin.endsWith('.entrained.ai')) return origin;
    if (origin.includes('localhost')) return origin;
    if (origin.includes('127.0.0.1')) return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ===========================================================================
// Health & Info Routes
// ===========================================================================

app.get('/', (c) => {
  return c.json({
    name: 'Forge 2.0',
    version: '0.1.0',
    description: 'Conversational asset workspace and build system',
    docs: '/api/docs',
    endpoints: {
      search: '/api/search',
      assets: '/api/assets',
      generate: '/api/generate',
      health: '/api/health',
    },
  });
});

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/docs', (c) => {
  return c.json({
    openapi: '3.0.0',
    info: {
      title: 'Forge 2.0 API',
      version: '0.1.0',
      description: 'Conversational asset workspace - Search, Create, Compose, Instantiate',
    },
    paths: {
      '/api/search': {
        get: {
          summary: 'Semantic search across all assets',
          parameters: [
            { name: 'q', in: 'query', required: true, description: 'Search query' },
            { name: 'type', in: 'query', description: 'Filter by type: file, bundle, asset' },
            { name: 'file_type', in: 'query', description: 'Filter files by type: tsx, css, rs, etc.' },
            { name: 'limit', in: 'query', description: 'Max results (default 10, max 50)' },
          ],
        },
      },
      '/api/assets': {
        get: {
          summary: 'List assets with filtering',
          parameters: [
            { name: 'type', in: 'query', description: 'Filter by type' },
            { name: 'file_type', in: 'query', description: 'Filter by file type' },
            { name: 'limit', in: 'query', description: 'Max results' },
            { name: 'offset', in: 'query', description: 'Pagination offset' },
          ],
        },
        post: {
          summary: 'Create a new asset',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'type', 'description', 'content'],
                  properties: {
                    name: { type: 'string' },
                    type: { type: 'string', enum: ['file', 'bundle', 'asset'] },
                    file_type: { type: 'string' },
                    media_type: { type: 'string' },
                    description: { type: 'string' },
                    content: { type: 'string' },
                    parent_id: { type: 'string' },
                    version: { type: 'string' },
                    bump: { type: 'string', enum: ['patch', 'minor', 'major'] },
                  },
                },
              },
            },
          },
        },
      },
      '/api/assets/{id}': {
        get: {
          summary: 'Get asset manifest by ID or reference',
          description: 'Supports exact IDs, semver ranges (@^0.1), and tags (@latest, @stable)',
        },
        put: {
          summary: 'Update an asset (creates new version)',
        },
      },
      '/api/assets/{id}/content': {
        get: {
          summary: 'Get asset content (file/binary data)',
        },
      },
      '/api/assets/{id}/source': {
        get: {
          summary: 'Get asset content as text',
        },
      },
      '/api/assets/{name}/versions': {
        get: {
          summary: 'Get all versions of an asset by canonical name',
        },
      },
      '/api/assets/{name}/chain': {
        get: {
          summary: 'Get version chain (Git-like history)',
        },
      },
    },
  });
});

// ===========================================================================
// API Routes
// ===========================================================================

app.route('/api/search', searchRoutes);
app.route('/api/assets', assetRoutes);
app.route('/api/generate', generateRoutes);

// ===========================================================================
// 404 Handler
// ===========================================================================

app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    path: c.req.path,
    hint: 'See / for available endpoints',
  }, 404);
});

// ===========================================================================
// Error Handler
// ===========================================================================

app.onError((err, c) => {
  console.error('Unhandled error:', err);

  return c.json({
    error: 'Internal Server Error',
    message: err.message,
  }, 500);
});

// ===========================================================================
// Export
// ===========================================================================

export default app;
