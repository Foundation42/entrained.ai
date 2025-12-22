import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './types';
import { authRoutes } from './routes/auth';
import { loginPage, signupPage, forgotPasswordPage, logoutPage } from './pages/auth';

const app = new Hono<{ Bindings: Bindings }>();

// CORS for cross-origin requests from entrained.ai subdomains
app.use('/api/*', cors({
  origin: (origin) => {
    if (!origin) return null;
    if (origin.endsWith('.entrained.ai') || origin === 'https://entrained.ai') {
      return origin;
    }
    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
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

// Auth API routes
app.route('/api', authRoutes);

// ================================
// Auth Pages (HTML)
// ================================

// Landing / Login page
app.get('/', (c) => {
  const returnTo = c.req.query('return_to');
  const registered = c.req.query('registered');
  const error = registered ? undefined : undefined;
  return c.html(loginPage(error, returnTo));
});

app.get('/login', (c) => {
  const returnTo = c.req.query('return_to');
  return c.html(loginPage(undefined, returnTo));
});

app.get('/signup', (c) => {
  const returnTo = c.req.query('return_to');
  return c.html(signupPage(undefined, returnTo));
});

app.get('/forgot-password', (c) => {
  const success = c.req.query('success') === '1';
  return c.html(forgotPasswordPage(undefined, success));
});

app.get('/logout', (c) => {
  return c.html(logoutPage());
});

export default app;
