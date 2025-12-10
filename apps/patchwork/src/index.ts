import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './types';
import { landingPage } from './pages/landing';
import { patchDesignerPage } from './pages/patch-designer';
import { sequencerPage } from './pages/sequencer';
import { schemaExtractorPage } from './pages/schema-extractor';
import { schemaRoutes } from './routes/schema';

const app = new Hono<{ Bindings: Bindings }>();

// CORS for API routes
app.use('/api/*', cors({
  origin: ['https://patchwork.entrained.ai', 'http://localhost:8787'],
  credentials: true,
}));

// API routes
app.route('/api/schema', schemaRoutes);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// Pages
app.get('/', (c) => c.html(landingPage()));
app.get('/patch-designer', (c) => c.html(patchDesignerPage()));
app.get('/sequencer', (c) => c.html(sequencerPage()));
app.get('/schema-extractor', (c) => c.html(schemaExtractorPage()));

export default app;
