// Posts routes
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, PostRow, CommunityRow, CommentRow } from '../types';
import { getAuthProfile, verifyToken, getOrCreateProfile, isAdmin } from '../lib/auth';
import { rowToPost, rowToComment, saveEvaluation, updateProfileStats, awardXP } from '../lib/db';
import { evaluateContent, calculateStatImpact, processMacros } from '../lib/ai';
import { queueMentionNotifications } from '../lib/notifications';

const posts = new Hono<{ Bindings: Env }>();

// GET /api/c/:community/posts - List posts in community
posts.get('/', async (c) => {
  const communityName = c.req.param('community') ?? '';

  // Get community
  const community = await c.env.DB.prepare(
    'SELECT id FROM communities WHERE name = ?'
  ).bind(communityName.toLowerCase()).first<{ id: string }>();

  if (!community) {
    return c.json({ error: 'Community not found' }, 404);
  }

  // Get posts
  const rows = await c.env.DB.prepare(`
    SELECT p.*, pr.username as author_username
    FROM posts p
    LEFT JOIN profiles pr ON p.author_id = pr.id
    WHERE p.community_id = ?
    ORDER BY p.created_at DESC
    LIMIT 50
  `).bind(community.id).all<PostRow & { author_username: string | null }>();

  const result = rows.results.map(row => ({
    ...rowToPost(row),
    author_username: row.author_cloaked ? null : row.author_username,
  }));

  return c.json({ data: result });
});

// GET /api/c/:community/posts/:postId - Get single post with comments
posts.get('/:postId', async (c) => {
  const postId = c.req.param('postId');

  // Get post
  const postRow = await c.env.DB.prepare(`
    SELECT p.*, pr.username as author_username
    FROM posts p
    LEFT JOIN profiles pr ON p.author_id = pr.id
    WHERE p.id = ?
  `).bind(postId).first<PostRow & { author_username: string | null }>();

  if (!postRow) {
    return c.json({ error: 'Post not found' }, 404);
  }

  // Get comments (threaded by path)
  const commentRows = await c.env.DB.prepare(`
    SELECT c.*, pr.username as author_username
    FROM comments c
    LEFT JOIN profiles pr ON c.author_id = pr.id
    WHERE c.post_id = ?
    ORDER BY c.path ASC
  `).bind(postId).all<CommentRow & { author_username: string | null }>();

  const post = {
    ...rowToPost(postRow),
    author_username: postRow.author_cloaked ? null : postRow.author_username,
  };

  const comments = commentRows.results.map(row => ({
    ...rowToComment(row),
    author_username: (row.author_cloaked || row.force_uncloaked) ? null : row.author_username,
  }));

  return c.json({ data: { post, comments } });
});

// POST /api/c/:community/posts - Create new post
posts.post('/', async (c) => {
  const communityName = c.req.param('community') ?? '';

  // Auth
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

  // Get community
  const communityRow = await c.env.DB.prepare(
    'SELECT * FROM communities WHERE name = ?'
  ).bind(communityName.toLowerCase()).first<CommunityRow>();

  if (!communityRow) {
    return c.json({ error: 'Community not found' }, 404);
  }

  // Check posting permissions
  const whoCanPost = communityRow.who_can_post || 'members';
  if (whoCanPost === 'owner') {
    // Only the owner can post
    if (communityRow.owner_profile_id !== profile.id && communityRow.created_by !== profile.id) {
      return c.json({ error: 'Only the owner can post in this community' }, 403);
    }
  } else if (whoCanPost === 'system') {
    // Only system can post (e.g., notifications)
    return c.json({ error: 'This community only accepts system notifications' }, 403);
  } else if (whoCanPost === 'members') {
    // Check if user is a member
    const isMember = await c.env.DB.prepare(
      'SELECT id FROM community_members WHERE community_id = ? AND profile_id = ?'
    ).bind(communityRow.id, profile.id).first();
    if (!isMember) {
      return c.json({ error: 'You must be a member to post in this community' }, 403);
    }
  }
  // 'anyone' allows all authenticated users to post

  // Check requirements
  if (communityRow.min_level_to_post && profile.level < communityRow.min_level_to_post) {
    return c.json({
      error: `Level ${communityRow.min_level_to_post} required to post in this community`
    }, 403);
  }

  if (communityRow.min_good_faith_score && profile.stats.good_faith < communityRow.min_good_faith_score) {
    return c.json({
      error: `Good faith score of ${communityRow.min_good_faith_score} required`
    }, 403);
  }

  // Parse body
  const body = await c.req.json<{
    title: string;
    content: string;
    cloaked?: boolean;
  }>();

  if (!body.title || !body.content) {
    return c.json({ error: 'Title and content required' }, 400);
  }

  if (body.title.length > 300) {
    return c.json({ error: 'Title too long (max 300 chars)' }, 400);
  }

  if (body.content.length > 40000) {
    return c.json({ error: 'Content too long (max 40000 chars)' }, 400);
  }

  // Process macros (e.g., {haiku: topic})
  const { processed: processedContent } = await processMacros(body.content, c.env);

  // Evaluate content
  const evaluation = await evaluateContent(processedContent, 'post', {}, c.env);
  evaluation.content_id = nanoid(); // Will be post ID

  // Calculate impact
  const impact = calculateStatImpact(evaluation, profile.stats);

  // Create post
  const postId = evaluation.content_id;
  const now = Date.now();

  await c.env.DB.prepare(`
    INSERT INTO posts (
      id, community_id, author_id, author_cloaked,
      title, content, created_at, evaluation_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    postId,
    communityRow.id,
    profile.id,
    body.cloaked ? 1 : 0,
    body.title,
    processedContent,
    now,
    evaluation.id
  ).run();

  // Save evaluation
  await saveEvaluation(c.env.DB, evaluation);

  // Update profile stats
  await updateProfileStats(
    c.env.DB,
    profile.id,
    impact.statChanges,
    impact.cloakQuotaDelta
  );

  // Award XP for creating a post (15 base, quality multiplier 0.5-1.5)
  const avgScore = (
    evaluation.scores.good_faith +
    evaluation.scores.substantive +
    evaluation.scores.charitable +
    evaluation.scores.source_quality
  ) / 4;
  const qualityMultiplier = 0.5 + (avgScore / 100);
  const xpAwarded = await awardXP(c.env.DB, profile.id, 15, qualityMultiplier);

  // Update community post count
  await c.env.DB.prepare(
    'UPDATE communities SET post_count = post_count + 1 WHERE id = ?'
  ).bind(communityRow.id).run();

  // Record action
  await c.env.DB.prepare(`
    INSERT INTO user_actions (id, profile_id, action_type, target_id, community_id, timestamp, impact)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    nanoid(),
    profile.id,
    'post_created',
    postId,
    communityRow.id,
    now,
    JSON.stringify(impact)
  ).run();

  // Queue notifications for @mentioned users in the post
  try {
    await queueMentionNotifications(
      c.env.NOTIFICATIONS_QUEUE,
      c.env.DB,
      processedContent,
      profile,
      body.title,
      postId,
      postId,
      communityRow.name,
      'post'
    );
  } catch (err) {
    console.error('[Notifications] Post mention queue failed:', err);
  }

  // Fetch and return
  const postRow = await c.env.DB.prepare(
    'SELECT * FROM posts WHERE id = ?'
  ).bind(postId).first<PostRow>();

  return c.json({
    data: {
      post: rowToPost(postRow!),
      evaluation: {
        scores: evaluation.scores,
        flags: evaluation.flags,
        suggestions: evaluation.suggestions,
        reasoning: evaluation.reasoning,
      },
      impact,
      xp_awarded: xpAwarded,
    }
  }, 201);
});

// PUT /api/c/:community/posts/:postId - Edit post
posts.put('/:postId', async (c) => {
  const postId = c.req.param('postId');

  // Auth
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

  // Get post
  const postRow = await c.env.DB.prepare(
    'SELECT * FROM posts WHERE id = ?'
  ).bind(postId).first<PostRow>();

  if (!postRow) {
    return c.json({ error: 'Post not found' }, 404);
  }

  // Check ownership
  if (postRow.author_id !== profile.id) {
    return c.json({ error: 'Not your post' }, 403);
  }

  // Parse body
  const body = await c.req.json<{
    title?: string;
    content?: string;
  }>();

  if (!body.content && !body.title) {
    return c.json({ error: 'Nothing to update' }, 400);
  }

  const newContent = body.content || postRow.content;
  const newTitle = body.title || postRow.title;

  if (newTitle.length > 300) {
    return c.json({ error: 'Title too long (max 300 chars)' }, 400);
  }

  if (newContent.length > 40000) {
    return c.json({ error: 'Content too long (max 40000 chars)' }, 400);
  }

  // Re-evaluate content
  const evaluation = await evaluateContent(newContent, 'post', {}, c.env);
  evaluation.content_id = postId;

  const impact = calculateStatImpact(evaluation, profile.stats);

  // Update post
  await c.env.DB.prepare(`
    UPDATE posts SET
      title = ?,
      content = ?,
      edited_at = ?,
      evaluation_id = ?
    WHERE id = ?
  `).bind(newTitle, newContent, Date.now(), evaluation.id, postId).run();

  // Save new evaluation
  await saveEvaluation(c.env.DB, evaluation);

  // Update stats (could be positive if user improved their post)
  await updateProfileStats(c.env.DB, profile.id, impact.statChanges, impact.cloakQuotaDelta);

  // Fetch updated
  const updatedRow = await c.env.DB.prepare(
    'SELECT * FROM posts WHERE id = ?'
  ).bind(postId).first<PostRow>();

  return c.json({
    data: {
      post: rowToPost(updatedRow!),
      evaluation: {
        scores: evaluation.scores,
        flags: evaluation.flags,
        suggestions: evaluation.suggestions,
        reasoning: evaluation.reasoning,
      },
      impact,
    }
  });
});

// POST /api/c/:community/posts/:postId/evaluate - Pre-flight evaluation
posts.post('/:postId/evaluate', async (c) => {
  const profile = await getAuthProfile(c.req.raw, c.env);
  if (!profile) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ content: string }>();
  if (!body.content) {
    return c.json({ error: 'Content required' }, 400);
  }

  // Get post for context
  const postId = c.req.param('postId');
  const post = await c.env.DB.prepare(
    'SELECT title, content FROM posts WHERE id = ?'
  ).bind(postId).first<{ title: string; content: string }>();

  // Evaluate
  const evaluation = await evaluateContent(body.content, 'comment', {
    parentContent: post?.content,
    threadSummary: post?.title,
  }, c.env);

  const impact = calculateStatImpact(evaluation, profile.stats);

  return c.json({
    data: {
      evaluation: {
        scores: evaluation.scores,
        flags: evaluation.flags,
        suggestions: evaluation.suggestions,
        reasoning: evaluation.reasoning,
      },
      predictedImpact: impact,
    }
  });
});

// DELETE /api/c/:community/posts/:postId - Delete post (admin or author)
posts.delete('/:postId', async (c) => {
  const postId = c.req.param('postId');

  // Auth
  const profile = await getAuthProfile(c.req.raw, c.env);
  if (!profile) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Get post
  const postRow = await c.env.DB.prepare(
    'SELECT * FROM posts WHERE id = ?'
  ).bind(postId).first<PostRow>();

  if (!postRow) {
    return c.json({ error: 'Post not found' }, 404);
  }

  // Check permission: must be author or admin
  const isAuthor = postRow.author_id === profile.id;
  const isAdminUser = await isAdmin(profile.id, c.env);

  if (!isAuthor && !isAdminUser) {
    return c.json({ error: 'Not authorized to delete this post' }, 403);
  }

  // Delete comments first (foreign key constraint)
  await c.env.DB.prepare(
    'DELETE FROM comments WHERE post_id = ?'
  ).bind(postId).run();

  // Delete the post
  await c.env.DB.prepare(
    'DELETE FROM posts WHERE id = ?'
  ).bind(postId).run();

  // Update community post count
  await c.env.DB.prepare(
    'UPDATE communities SET post_count = post_count - 1 WHERE id = ?'
  ).bind(postRow.community_id).run();

  return c.json({ data: { deleted: true, postId } });
});

export default posts;
