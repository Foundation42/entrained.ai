import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Bindings, User, JWTPayload } from '../types';
import { hashPassword, verifyPassword } from '../lib/password';
import { jwt } from '../lib/jwt';

export const authRoutes = new Hono<{ Bindings: Bindings }>();

// Session duration: 7 days
const SESSION_DURATION = 7 * 24 * 60 * 60;

// Register new user
authRoutes.post('/register', async (c) => {
  const { email, password, display_name } = await c.req.json<{
    email: string;
    password: string;
    display_name?: string;
  }>();

  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400);
  }

  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400);
  }

  // Check if user exists
  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email.toLowerCase()).first();

  if (existing) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const userId = nanoid();
  const passwordHash = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(userId, email.toLowerCase(), passwordHash, display_name || null, now, now).run();

  // Create verification token
  const verifyToken = nanoid(32);
  const tokenHash = await hashToken(verifyToken);
  const expiresAt = now + 24 * 60 * 60; // 24 hours

  await c.env.DB.prepare(
    `INSERT INTO email_verifications (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(nanoid(), userId, tokenHash, expiresAt, now).run();

  // TODO: Send verification email via Mailgun

  return c.json({
    message: 'Registration successful. Please check your email to verify your account.',
    user_id: userId,
  }, 201);
});

// Login
authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json<{
    email: string;
    password: string;
  }>();

  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400);
  }

  const user = await c.env.DB.prepare(
    'SELECT id, email, password_hash, email_verified_at, display_name FROM users WHERE email = ?'
  ).bind(email.toLowerCase()).first<User>();

  if (!user) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_DURATION;

  // Create session
  const sessionId = nanoid();
  const sessionToken = nanoid(32);
  const tokenHash = await hashToken(sessionToken);

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    sessionId,
    user.id,
    tokenHash,
    expiresAt,
    now,
    c.req.header('CF-Connecting-IP') || null,
    c.req.header('User-Agent') || null
  ).run();

  // Create JWT
  const jwtPayload: JWTPayload = {
    sub: user.id,
    email: user.email,
    exp: expiresAt,
    iat: now,
  };
  const token = await jwt.sign(jwtPayload, c.env.JWT_SECRET);

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      email_verified: !!user.email_verified_at,
    },
    expires_at: expiresAt,
  });
});

// Verify JWT (for other services to validate tokens)
authRoutes.post('/verify', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ valid: false, error: 'No token provided' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await jwt.verify(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({ valid: false, error: 'Invalid or expired token' }, 401);
  }

  return c.json({
    valid: true,
    user: {
      id: payload.sub,
      email: payload.email,
    },
  });
});

// Get current user
authRoutes.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await jwt.verify(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const user = await c.env.DB.prepare(
    'SELECT id, email, email_verified_at, display_name, created_at FROM users WHERE id = ?'
  ).bind(payload.sub).first<User>();

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    email_verified: !!user.email_verified_at,
    created_at: user.created_at,
  });
});

// Logout (invalidate session)
authRoutes.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ message: 'Logged out' });
  }

  const token = authHeader.slice(7);
  const payload = await jwt.verify(token, c.env.JWT_SECRET);

  if (payload) {
    // Delete all sessions for this user (or just the current one if you track session IDs in JWT)
    await c.env.DB.prepare(
      'DELETE FROM sessions WHERE user_id = ?'
    ).bind(payload.sub).run();
  }

  return c.json({ message: 'Logged out' });
});

// Request password reset
authRoutes.post('/forgot-password', async (c) => {
  const { email } = await c.req.json<{ email: string }>();

  if (!email) {
    return c.json({ error: 'Email required' }, 400);
  }

  const user = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email.toLowerCase()).first<{ id: string }>();

  // Always return success to prevent email enumeration
  if (!user) {
    return c.json({ message: 'If that email exists, a reset link has been sent.' });
  }

  const now = Math.floor(Date.now() / 1000);
  const resetToken = nanoid(32);
  const tokenHash = await hashToken(resetToken);
  const expiresAt = now + 60 * 60; // 1 hour

  await c.env.DB.prepare(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(nanoid(), user.id, tokenHash, expiresAt, now).run();

  // TODO: Send reset email via Mailgun

  return c.json({ message: 'If that email exists, a reset link has been sent.' });
});

// Helper to hash tokens for storage
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}
