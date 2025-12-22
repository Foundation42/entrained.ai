// Community routes
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, CommunityRow, EvaluationConfig } from '../types';
import { getAuthProfile, verifyToken, getOrCreateProfile } from '../lib/auth';
import { rowToCommunity } from '../lib/db';
import { evaluateCommunityCreation, generateCommunitySlug } from '../lib/ai';

const communities = new Hono<{ Bindings: Env }>();

// GET /api/communities - List all communities
communities.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT * FROM communities
    ORDER BY member_count DESC, created_at DESC
    LIMIT 50
  `).all<CommunityRow>();

  const result = rows.results.map(rowToCommunity);
  return c.json({ data: result });
});

// GET /api/communities/:name - Get community by name
communities.get('/:name', async (c) => {
  const name = c.req.param('name');

  const row = await c.env.DB.prepare(
    'SELECT * FROM communities WHERE name = ?'
  ).bind(name.toLowerCase()).first<CommunityRow>();

  if (!row) {
    return c.json({ error: 'Community not found' }, 404);
  }

  return c.json({ data: rowToCommunity(row) });
});

// POST /api/communities - Create new community (auth required)
communities.post('/', async (c) => {
  // Verify auth
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const authResult = await verifyToken(token, c.env);
  if (!authResult) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Get or create GoodFaith profile
  const profile = await getOrCreateProfile(
    authResult.authUserId,
    authResult.email,
    c.env
  );

  // Parse body
  const body = await c.req.json<{
    name?: string;  // Now optional - will be AI-generated if not provided
    display_name: string;
    description?: string;
    evaluation_config?: Partial<EvaluationConfig>;
    min_level_to_post?: number;
    min_good_faith_score?: number;
    require_sources_for_claims?: boolean;
  }>();

  const { display_name, description } = body;

  // Validate display_name
  if (!display_name) {
    return c.json({ error: 'Display name is required' }, 400);
  }
  if (display_name.length < 3 || display_name.length > 100) {
    return c.json({ error: 'Display name must be 3-100 characters' }, 400);
  }

  // Validate description length
  if (description && description.length > 500) {
    return c.json({ error: 'Description must be 500 characters or less' }, 400);
  }

  // Generate or validate URL slug
  let name: string;
  if (body.name) {
    // User provided a custom slug
    name = body.name.toLowerCase();
    if (!/^[a-z0-9-]{3,50}$/.test(name)) {
      return c.json({
        error: 'URL name must be 3-50 lowercase letters, numbers, or hyphens'
      }, 400);
    }
  } else {
    // AI generates the slug
    name = await generateCommunitySlug(display_name, description, c.env);
    console.log(`[Community] AI generated slug: ${name}`);
  }

  // Check if name is taken, append number if needed
  let finalName = name;
  let suffix = 1;
  while (true) {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM communities WHERE name = ?'
    ).bind(finalName).first();

    if (!existing) break;

    // If user provided the name and it's taken, error out
    if (body.name) {
      return c.json({ error: 'Community name already taken' }, 409);
    }

    // For AI-generated names, append a number
    suffix++;
    finalName = `${name}-${suffix}`;
    if (finalName.length > 50) {
      finalName = `${name.slice(0, 47)}-${suffix}`;
    }
  }
  name = finalName;

  // AI moderation check - keep the platform family-friendly
  const moderation = await evaluateCommunityCreation(
    name,
    display_name,
    description,
    c.env
  );

  if (!moderation.approved) {
    console.log(`[Community] Rejected: ${name} - ${moderation.reason}`);
    return c.json({
      error: 'Community creation not approved',
      reason: moderation.reason,
      suggestions: moderation.suggestions
    }, 400);
  }

  console.log(`[Community] Approved: ${name}`);

  // Build evaluation config
  const evalConfig: EvaluationConfig = {
    good_faith_weight: body.evaluation_config?.good_faith_weight ?? 1,
    substantive_weight: body.evaluation_config?.substantive_weight ?? 1,
    charitable_weight: body.evaluation_config?.charitable_weight ?? 1,
    source_quality_weight: body.evaluation_config?.source_quality_weight ?? 1,
    custom_criteria: body.evaluation_config?.custom_criteria,
  };

  const communityId = nanoid();
  const now = Date.now();

  await c.env.DB.prepare(`
    INSERT INTO communities (
      id, name, display_name, description, created_at, created_by,
      evaluation_config, min_level_to_post, min_good_faith_score,
      require_sources_for_claims
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    communityId,
    name.toLowerCase(),
    display_name,
    description ?? null,
    now,
    profile.id,
    JSON.stringify(evalConfig),
    body.min_level_to_post ?? null,
    body.min_good_faith_score ?? null,
    body.require_sources_for_claims ? 1 : 0
  ).run();

  // Auto-join creator to community
  await c.env.DB.prepare(`
    INSERT INTO community_members (id, community_id, profile_id, joined_at)
    VALUES (?, ?, ?, ?)
  `).bind(nanoid(), communityId, profile.id, now).run();

  // Update member count
  await c.env.DB.prepare(
    'UPDATE communities SET member_count = 1 WHERE id = ?'
  ).bind(communityId).run();

  // Fetch and return
  const row = await c.env.DB.prepare(
    'SELECT * FROM communities WHERE id = ?'
  ).bind(communityId).first<CommunityRow>();

  return c.json({ data: rowToCommunity(row!) }, 201);
});

// POST /api/communities/:name/join - Join a community
communities.post('/:name/join', async (c) => {
  const profile = await getAuthProfile(c.req.raw, c.env);
  if (!profile) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const name = c.req.param('name');
  const community = await c.env.DB.prepare(
    'SELECT id FROM communities WHERE name = ?'
  ).bind(name.toLowerCase()).first<{ id: string }>();

  if (!community) {
    return c.json({ error: 'Community not found' }, 404);
  }

  // Check if already member
  const existing = await c.env.DB.prepare(
    'SELECT id FROM community_members WHERE community_id = ? AND profile_id = ?'
  ).bind(community.id, profile.id).first();

  if (existing) {
    return c.json({ error: 'Already a member' }, 409);
  }

  // Join
  await c.env.DB.prepare(`
    INSERT INTO community_members (id, community_id, profile_id, joined_at)
    VALUES (?, ?, ?, ?)
  `).bind(nanoid(), community.id, profile.id, Date.now()).run();

  // Update count
  await c.env.DB.prepare(
    'UPDATE communities SET member_count = member_count + 1 WHERE id = ?'
  ).bind(community.id).run();

  return c.json({ data: { joined: true } });
});

// POST /api/communities/:name/leave - Leave a community
communities.post('/:name/leave', async (c) => {
  const profile = await getAuthProfile(c.req.raw, c.env);
  if (!profile) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const name = c.req.param('name');
  const community = await c.env.DB.prepare(
    'SELECT id FROM communities WHERE name = ?'
  ).bind(name.toLowerCase()).first<{ id: string }>();

  if (!community) {
    return c.json({ error: 'Community not found' }, 404);
  }

  // Remove membership
  const result = await c.env.DB.prepare(
    'DELETE FROM community_members WHERE community_id = ? AND profile_id = ?'
  ).bind(community.id, profile.id).run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Not a member' }, 404);
  }

  // Update count
  await c.env.DB.prepare(
    'UPDATE communities SET member_count = member_count - 1 WHERE id = ?'
  ).bind(community.id).run();

  return c.json({ data: { left: true } });
});

export default communities;
