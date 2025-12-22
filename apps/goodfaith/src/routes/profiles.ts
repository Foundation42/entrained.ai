// Profile routes
import { Hono } from 'hono';
import type { Env, ProfileRow, PostRow, CommentRow } from '../types';
import { getAuthProfile, verifyToken, getOrCreateProfile, rowToProfile } from '../lib/auth';
import { rowToPost, rowToComment } from '../lib/db';

const profiles = new Hono<{ Bindings: Env }>();

// GET /api/me - Get current user's profile
profiles.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const authResult = await verifyToken(token, c.env);
  if (!authResult) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Get or create profile
  const profile = await getOrCreateProfile(
    authResult.authUserId,
    authResult.email,
    c.env
  );

  return c.json({ data: { profile } });
});

// PUT /api/me/username - Update username
profiles.put('/me/username', async (c) => {
  const profile = await getAuthProfile(c.req.raw, c.env);
  if (!profile) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ username: string }>();
  const newUsername = body.username?.toLowerCase();

  // Validate
  if (!newUsername || !/^[a-z][a-z0-9_]{2,19}$/.test(newUsername)) {
    return c.json({
      error: 'Username must be 3-20 chars, start with letter, alphanumeric and underscores only'
    }, 400);
  }

  // Check if taken
  const existing = await c.env.DB.prepare(
    'SELECT id FROM profiles WHERE username = ? AND id != ?'
  ).bind(newUsername, profile.id).first();

  if (existing) {
    return c.json({ error: 'Username already taken' }, 409);
  }

  await c.env.DB.prepare(
    'UPDATE profiles SET username = ? WHERE id = ?'
  ).bind(newUsername, profile.id).run();

  return c.json({ data: { username: newUsername } });
});

// PUT /api/me/avatar - Update avatar URL (from sprites.entrained.ai)
profiles.put('/me/avatar', async (c) => {
  const profile = await getAuthProfile(c.req.raw, c.env);
  if (!profile) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ avatar_url: string }>();
  const avatarUrl = body.avatar_url;

  // Validate - must be from our sprites service
  if (!avatarUrl || !avatarUrl.startsWith('https://sprites.entrained.ai/')) {
    return c.json({
      error: 'Avatar URL must be from sprites.entrained.ai'
    }, 400);
  }

  await c.env.DB.prepare(
    'UPDATE profiles SET avatar_url = ? WHERE id = ?'
  ).bind(avatarUrl, profile.id).run();

  console.log(`[Avatar] Updated for ${profile.username}: ${avatarUrl}`);

  return c.json({ data: { avatar_url: avatarUrl } });
});

// GET /api/u/:username - Get public profile
profiles.get('/u/:username', async (c) => {
  const username = c.req.param('username');

  const row = await c.env.DB.prepare(
    'SELECT * FROM profiles WHERE username = ?'
  ).bind(username.toLowerCase()).first<ProfileRow>();

  if (!row) {
    return c.json({ error: 'User not found' }, 404);
  }

  const profile = rowToProfile(row);

  // Get recent activity (non-cloaked)
  const recentPosts = await c.env.DB.prepare(`
    SELECT p.*, c.name as community_name
    FROM posts p
    JOIN communities c ON p.community_id = c.id
    WHERE p.author_id = ? AND p.author_cloaked = 0
    ORDER BY p.created_at DESC
    LIMIT 10
  `).bind(profile.id).all<PostRow & { community_name: string }>();

  const recentComments = await c.env.DB.prepare(`
    SELECT cm.*, p.title as post_title, c.name as community_name
    FROM comments cm
    JOIN posts p ON cm.post_id = p.id
    JOIN communities c ON p.community_id = c.id
    WHERE cm.author_id = ? AND cm.author_cloaked = 0 AND cm.force_uncloaked = 0
    ORDER BY cm.created_at DESC
    LIMIT 10
  `).bind(profile.id).all<CommentRow & { post_title: string; community_name: string }>();

  return c.json({
    data: {
      profile: {
        username: profile.username,
        created_at: profile.created_at,
        stats: profile.stats,
        level: profile.level,
        class: profile.class,
      },
      recent_posts: recentPosts.results.map(p => ({
        id: p.id,
        title: p.title,
        community_name: p.community_name,
        created_at: p.created_at,
        comment_count: p.comment_count,
      })),
      recent_comments: recentComments.results.map(cm => ({
        id: cm.id,
        post_title: cm.post_title,
        community_name: cm.community_name,
        created_at: cm.created_at,
        content_preview: cm.content.slice(0, 200),
      })),
    }
  });
});

// GET /api/me/player-card - AI-generated personality analysis
profiles.get('/me/player-card', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const authResult = await verifyToken(token, c.env);
  if (!authResult) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const profile = await getOrCreateProfile(authResult.authUserId, authResult.email, c.env);

  // Get activity stats
  const counts = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM posts WHERE author_id = ?) as post_count,
      (SELECT COUNT(*) FROM comments WHERE author_id = ?) as comment_count
  `).bind(profile.id, profile.id).first<{
    post_count: number;
    comment_count: number;
  }>();

  // Get user badges
  const badgesResult = await c.env.DB.prepare(`
    SELECT b.id, b.name, b.description, b.image_url, b.category, ub.awarded_at
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
  }>();
  const userBadges = badgesResult.results;

  // Generate AI analysis
  const prompt = `You are a witty game master describing a player's character sheet for a discourse platform (like Reddit but with AI-evaluated good faith).

Generate a SHORT, friendly, semi-humorous 2-3 paragraph character analysis based on these stats:

PLAYER: ${profile.username || 'Anonymous Adventurer'}
LEVEL: ${profile.level}
CLASS: ${profile.class || 'Seeker'}

STATS (0-100 scale):
- Good Faith: ${Math.round(profile.stats.good_faith)}% (genuine engagement vs trolling)
- Substantive: ${Math.round(profile.stats.substantive)}% (adds value vs empty takes)
- Charitable: ${Math.round(profile.stats.charitable)}% (steelmans vs strawmans)
- Source Quality: ${Math.round(profile.stats.source_quality)}% (backs claims with evidence)

ACTIVITY:
- Posts: ${counts?.post_count || 0}
- Comments: ${counts?.comment_count || 0}
- Cloak Quota: ${profile.cloak_quota}% (ability to post anonymously)

Write in second person ("You are..."). Be encouraging but honest.

IMPORTANT: Keep it to exactly 2 SHORT sentences. Be warm, witty, and playful - like a fortune cookie written by a game master. Under 40 words total.`;

  try {
    // Use non-streaming endpoint like test_gemini.py
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${c.env.AI_MODEL}:generateContent?key=${c.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 2048,
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };

    // Get ALL text parts and concatenate them
    const parts = data.candidates?.[0]?.content?.parts || [];
    const fullContent = parts.map(p => p.text || '').join('');
    const finishReason = data.candidates?.[0]?.finishReason;

    console.log(`[Player Card] Response length: ${fullContent.length}, finishReason: ${finishReason}`);

    const analysis = fullContent ||
      "You're a mysterious wanderer whose discourse patterns remain enigmatic. Keep engaging and your character will reveal itself!";

    return c.json({
      data: {
        profile: {
          username: profile.username,
          level: profile.level,
          class: profile.class,
          stats: profile.stats,
          cloak_quota: profile.cloak_quota,
          created_at: profile.created_at,
          avatar_url: profile.avatar_url,
        },
        analysis,
        activity: {
          posts: counts?.post_count || 0,
          comments: counts?.comment_count || 0,
        },
        badges: userBadges,
      }
    });
  } catch (err) {
    // Fallback if AI fails
    return c.json({
      data: {
        profile: {
          username: profile.username,
          level: profile.level,
          class: profile.class,
          stats: profile.stats,
          cloak_quota: profile.cloak_quota,
          created_at: profile.created_at,
          avatar_url: profile.avatar_url,
        },
        analysis: "You're forging your path in the realm of discourse. Every comment shapes your legend. Keep engaging in good faith and watch your character grow!",
        activity: {
          posts: counts?.post_count || 0,
          comments: counts?.comment_count || 0,
        },
        badges: userBadges,
      }
    });
  }
});

// GET /api/me/stats - Get detailed stats with history
profiles.get('/me/stats', async (c) => {
  const profile = await getAuthProfile(c.req.raw, c.env);
  if (!profile) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Get recent actions
  const actions = await c.env.DB.prepare(`
    SELECT * FROM user_actions
    WHERE profile_id = ?
    ORDER BY timestamp DESC
    LIMIT 50
  `).bind(profile.id).all<{
    id: string;
    action_type: string;
    timestamp: number;
    impact: string;
  }>();

  // Calculate totals
  const totals = {
    posts: 0,
    comments: 0,
    edits: 0,
  };

  const counts = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM posts WHERE author_id = ?) as post_count,
      (SELECT COUNT(*) FROM comments WHERE author_id = ?) as comment_count
  `).bind(profile.id, profile.id).first<{
    post_count: number;
    comment_count: number;
  }>();

  return c.json({
    data: {
      profile,
      totals: {
        posts: counts?.post_count ?? 0,
        comments: counts?.comment_count ?? 0,
      },
      recent_actions: actions.results.map(a => ({
        type: a.action_type,
        timestamp: a.timestamp,
        impact: JSON.parse(a.impact),
      })),
    }
  });
});

export default profiles;
