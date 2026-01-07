/**
 * Search API Routes
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { AssetService } from '../services/assets';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/search
 * Semantic search across all assets
 */
app.get('/', async (c) => {
  const query = c.req.query('q') ?? c.req.query('query');
  const type = c.req.query('type') as 'file' | 'bundle' | 'asset' | undefined;
  const file_type = c.req.query('file_type');
  const media_type = c.req.query('media_type');
  const limit = parseInt(c.req.query('limit') ?? '10', 10);

  if (!query) {
    return c.json({ error: 'Query parameter "q" is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  const results = await service.search({
    query,
    type,
    file_type,
    media_type,
    limit: Math.min(limit, 50),
  });

  return c.json({ results });
});

export default app;
