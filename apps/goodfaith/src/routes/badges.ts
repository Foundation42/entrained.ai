// Badge routes
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env } from '../types';
import { getAuthProfile } from '../lib/auth';

const badges = new Hono<{ Bindings: Env }>();

// Admin check - for now, check if user is the site owner
// TODO: Add proper admin role system
async function isAdmin(profileId: string, env: Env): Promise<boolean> {
  // Check if this profile is linked to admin email
  const profile = await env.DB.prepare(
    'SELECT auth_user_id FROM profiles WHERE id = ?'
  ).bind(profileId).first<{ auth_user_id: string }>();

  if (!profile) return false;

  // For now, hardcode admin check - first user or specific auth_user_id
  // You can update this to check against a list or role
  const adminIds = await env.DB.prepare(
    'SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1'
  ).first<{ id: string }>();

  return adminIds?.id === profileId;
}

// GET /api/badges - List all badges
badges.get('/', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT * FROM badges ORDER BY created_at DESC'
  ).all<{
    id: string;
    name: string;
    description: string | null;
    image_url: string;
    category: string;
    created_at: number;
  }>();

  return c.json({
    data: result.results.map(b => ({
      id: b.id,
      name: b.name,
      description: b.description,
      image_url: b.image_url,
      category: b.category,
      created_at: b.created_at,
    }))
  });
});

// POST /api/badges - Create a new badge (admin only)
badges.post('/', async (c) => {
  const profile = await getAuthProfile(c.req.raw, c.env);
  if (!profile) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (!await isAdmin(profile.id, c.env)) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const body = await c.req.json<{
    name: string;
    description?: string;
    image_url: string;
    category?: string;
  }>();

  if (!body.name || !body.image_url) {
    return c.json({ error: 'name and image_url are required' }, 400);
  }

  const badgeId = nanoid();
  const now = Date.now();

  await c.env.DB.prepare(`
    INSERT INTO badges (id, name, description, image_url, category, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    badgeId,
    body.name,
    body.description || null,
    body.image_url,
    body.category || 'achievement',
    now,
    profile.id
  ).run();

  console.log(`[Badge] Created: ${body.name} by ${profile.username}`);

  return c.json({
    data: {
      id: badgeId,
      name: body.name,
      description: body.description,
      image_url: body.image_url,
      category: body.category || 'achievement',
      created_at: now,
    }
  }, 201);
});

// POST /api/badges/:badgeId/award - Award badge to a user (admin only)
badges.post('/:badgeId/award', async (c) => {
  const profile = await getAuthProfile(c.req.raw, c.env);
  if (!profile) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (!await isAdmin(profile.id, c.env)) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const badgeId = c.req.param('badgeId');
  const body = await c.req.json<{
    username: string;
    reason?: string;
  }>();

  if (!body.username) {
    return c.json({ error: 'username is required' }, 400);
  }

  // Find badge
  const badge = await c.env.DB.prepare(
    'SELECT * FROM badges WHERE id = ?'
  ).bind(badgeId).first<{ id: string; name: string }>();

  if (!badge) {
    return c.json({ error: 'Badge not found' }, 404);
  }

  // Find user by username
  const targetUser = await c.env.DB.prepare(
    'SELECT id, username FROM profiles WHERE username = ?'
  ).bind(body.username.toLowerCase()).first<{ id: string; username: string }>();

  if (!targetUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Check if already awarded
  const existing = await c.env.DB.prepare(
    'SELECT id FROM user_badges WHERE profile_id = ? AND badge_id = ?'
  ).bind(targetUser.id, badgeId).first();

  if (existing) {
    return c.json({ error: 'User already has this badge' }, 409);
  }

  // Award the badge
  const awardId = nanoid();
  const now = Date.now();

  await c.env.DB.prepare(`
    INSERT INTO user_badges (id, profile_id, badge_id, awarded_at, awarded_by, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    awardId,
    targetUser.id,
    badgeId,
    now,
    profile.id,
    body.reason || null
  ).run();

  console.log(`[Badge] Awarded "${badge.name}" to ${targetUser.username} by ${profile.username}`);

  return c.json({
    data: {
      id: awardId,
      badge_id: badgeId,
      badge_name: badge.name,
      awarded_to: targetUser.username,
      awarded_at: now,
      reason: body.reason,
    }
  }, 201);
});

// GET /api/badges/user/:username - Get badges for a user
badges.get('/user/:username', async (c) => {
  const username = c.req.param('username');

  const user = await c.env.DB.prepare(
    'SELECT id FROM profiles WHERE username = ?'
  ).bind(username.toLowerCase()).first<{ id: string }>();

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  const result = await c.env.DB.prepare(`
    SELECT b.*, ub.awarded_at, ub.reason
    FROM user_badges ub
    JOIN badges b ON ub.badge_id = b.id
    WHERE ub.profile_id = ?
    ORDER BY ub.awarded_at DESC
  `).bind(user.id).all<{
    id: string;
    name: string;
    description: string | null;
    image_url: string;
    category: string;
    awarded_at: number;
    reason: string | null;
  }>();

  return c.json({
    data: result.results.map(b => ({
      id: b.id,
      name: b.name,
      description: b.description,
      image_url: b.image_url,
      category: b.category,
      awarded_at: b.awarded_at,
      reason: b.reason,
    }))
  });
});

// GET /api/me/badges - Get current user's badges
badges.get('/me', async (c) => {
  const profile = await getAuthProfile(c.req.raw, c.env);
  if (!profile) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const result = await c.env.DB.prepare(`
    SELECT b.*, ub.awarded_at, ub.reason
    FROM user_badges ub
    JOIN badges b ON ub.badge_id = b.id
    WHERE ub.profile_id = ?
    ORDER BY ub.awarded_at DESC
  `).bind(profile.id).all<{
    id: string;
    name: string;
    description: string | null;
    image_url: string;
    category: string;
    awarded_at: number;
    reason: string | null;
  }>();

  return c.json({
    data: result.results.map(b => ({
      id: b.id,
      name: b.name,
      description: b.description,
      image_url: b.image_url,
      category: b.category,
      awarded_at: b.awarded_at,
      reason: b.reason,
    }))
  });
});

export default badges;
