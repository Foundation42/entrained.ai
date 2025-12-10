import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './types';
import { authRoutes } from './routes/auth';

const app = new Hono<{ Bindings: Bindings }>();

// CORS for cross-origin requests from entrained.ai subdomains
app.use('*', cors({
  origin: (origin, c) => {
    const allowed = c.env.CORS_ORIGINS.split(',');
    if (allowed.includes(origin) || origin.endsWith('.entrained.ai')) {
      return origin;
    }
    return null;
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Auth routes
app.route('/api', authRoutes);

export default app;
