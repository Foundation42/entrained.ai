// Comments routes
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, CommentRow, PostRow, CommunityRow } from '../types';
import { getAuthProfile, verifyToken, getOrCreateProfile } from '../lib/auth';
import { rowToComment, saveEvaluation, updateProfileStats, generateCommentPath, awardXP } from '../lib/db';
import { evaluateContent, calculateStatImpact, processMacros } from '../lib/ai';
import { queuePostCommentNotification, queueReplyNotification, queueMentionNotifications } from '../lib/notifications';

const comments = new Hono<{ Bindings: Env }>();

// POST /api/c/:community/posts/:postId/comments - Create comment
comments.post('/', async (c) => {
  try {
  const postId = c.req.param('postId') ?? '';

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

  if (postRow.locked) {
    return c.json({ error: 'Post is locked' }, 403);
  }

  // Get community to check comment permissions
  const communityRow = await c.env.DB.prepare(
    'SELECT * FROM communities WHERE id = ?'
  ).bind(postRow.community_id).first<CommunityRow>();

  if (!communityRow) {
    return c.json({ error: 'Community not found' }, 404);
  }

  // Check commenting permissions
  const whoCanComment = communityRow.who_can_comment || 'anyone';
  if (whoCanComment === 'owner') {
    // Only the owner can comment
    if (communityRow.owner_profile_id !== profile.id && communityRow.created_by !== profile.id) {
      return c.json({ error: 'Only the owner can comment in this community' }, 403);
    }
  } else if (whoCanComment === 'members') {
    // Check if user is a member
    const isMember = await c.env.DB.prepare(
      'SELECT id FROM community_members WHERE community_id = ? AND profile_id = ?'
    ).bind(communityRow.id, profile.id).first();
    if (!isMember) {
      return c.json({ error: 'You must be a member to comment in this community' }, 403);
    }
  }
  // 'anyone' allows all authenticated users to comment

  // Parse body
  const body = await c.req.json<{
    content: string;
    parent_id?: string;
    sentiment?: 'agree' | 'disagree' | 'neutral';
    sentiment_reasoning?: string;
    cloaked?: boolean;
  }>();

  if (!body.content) {
    return c.json({ error: 'Content required' }, 400);
  }

  if (body.content.length > 10000) {
    return c.json({ error: 'Content too long (max 10000 chars)' }, 400);
  }

  // Validate sentiment
  if (body.sentiment && body.sentiment !== 'neutral' && !body.sentiment_reasoning) {
    return c.json({
      error: 'Sentiment reasoning required for agree/disagree'
    }, 400);
  }

  // Get parent comment context if replying
  let parentContent: string | undefined;
  if (body.parent_id) {
    const parent = await c.env.DB.prepare(
      'SELECT content FROM comments WHERE id = ? AND post_id = ?'
    ).bind(body.parent_id, postId).first<{ content: string }>();

    if (!parent) {
      return c.json({ error: 'Parent comment not found' }, 404);
    }
    parentContent = parent.content;
  }

  // Generate path for threading
  const { path, depth } = await generateCommentPath(c.env.DB, postId, body.parent_id);

  // Process macros (e.g., {haiku: topic})
  const { processed: processedContent } = await processMacros(body.content, c.env);

  // Evaluate content
  const evaluation = await evaluateContent(processedContent, 'comment', {
    parentContent,
    threadSummary: postRow.title,
  }, c.env);

  // Check cloak quota - random forced uncloak if quota is low
  let forceUncloaked = false;
  if (body.cloaked && profile.cloak_quota < 50) {
    forceUncloaked = Math.random() > (profile.cloak_quota / 100);
  }

  // Calculate impact
  const impact = calculateStatImpact(evaluation, profile.stats);

  // Create comment
  const commentId = nanoid();
  evaluation.content_id = commentId;
  const now = Date.now();

  await c.env.DB.prepare(`
    INSERT INTO comments (
      id, post_id, parent_id, author_id, author_cloaked,
      content, created_at, evaluation_id,
      sentiment, sentiment_reasoning,
      depth, path, force_uncloaked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    commentId,
    postId,
    body.parent_id ?? null,
    profile.id,
    body.cloaked ? 1 : 0,
    processedContent,
    now,
    evaluation.id,
    body.sentiment ?? null,
    body.sentiment_reasoning ?? null,
    depth,
    path,
    forceUncloaked ? 1 : 0
  ).run();

  // Save evaluation
  await saveEvaluation(c.env.DB, evaluation);

  // Update parent's child count
  if (body.parent_id) {
    await c.env.DB.prepare(
      'UPDATE comments SET child_count = child_count + 1 WHERE id = ?'
    ).bind(body.parent_id).run();
  }

  // Update post's comment count
  await c.env.DB.prepare(
    'UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?'
  ).bind(postId).run();

  // Update profile stats
  await updateProfileStats(
    c.env.DB,
    profile.id,
    impact.statChanges,
    impact.cloakQuotaDelta
  );

  // Award XP for creating a comment (8 base, quality multiplier 0.5-1.5)
  const avgScore = (
    evaluation.scores.good_faith +
    evaluation.scores.substantive +
    evaluation.scores.charitable +
    evaluation.scores.source_quality
  ) / 4;
  const qualityMultiplier = 0.5 + (avgScore / 100);
  const xpAwarded = await awardXP(c.env.DB, profile.id, 8, qualityMultiplier);

  // Record action
  await c.env.DB.prepare(`
    INSERT INTO user_actions (id, profile_id, action_type, target_id, community_id, timestamp, impact)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    nanoid(),
    profile.id,
    'comment_created',
    commentId,
    postRow.community_id,
    now,
    JSON.stringify(impact)
  ).run();

  // Queue notifications asynchronously via Cloudflare Queue
  try {
    // Notify post author of new comment
    await queuePostCommentNotification(
      c.env.NOTIFICATIONS_QUEUE,
      postRow.author_id,
      profile,
      postRow.title,
      postId,
      commentId,
      processedContent,
      communityRow.name
    );

    // Notify parent comment author if this is a reply
    if (body.parent_id) {
      const parentComment = await c.env.DB.prepare(
        'SELECT author_id FROM comments WHERE id = ?'
      ).bind(body.parent_id).first<{ author_id: string }>();

      if (parentComment && parentComment.author_id !== profile.id) {
        await queueReplyNotification(
          c.env.NOTIFICATIONS_QUEUE,
          parentComment.author_id,
          profile,
          postRow.title,
          postId,
          commentId,
          processedContent,
          communityRow.name
        );
      }
    }

    // Queue notifications for @mentioned users
    await queueMentionNotifications(
      c.env.NOTIFICATIONS_QUEUE,
      c.env.DB,
      processedContent,
      profile,
      postRow.title,
      postId,
      commentId,
      communityRow.name,
      'comment'
    );
  } catch (err) {
    console.error('[Notifications] Error queuing notifications:', err);
    // Don't fail the request if notification queuing fails
  }

  // Fetch and return
  const row = await c.env.DB.prepare(
    'SELECT * FROM comments WHERE id = ?'
  ).bind(commentId).first<CommentRow>();

  return c.json({
    data: {
      comment: rowToComment(row!),
      evaluation: {
        scores: evaluation.scores,
        flags: evaluation.flags,
        suggestions: evaluation.suggestions,
        reasoning: evaluation.reasoning,
      },
      impact,
      force_uncloaked: forceUncloaked,
      xp_awarded: xpAwarded,
    }
  }, 201);
  } catch (err) {
    console.error('[Comment Create] Error:', err);
    return c.json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

// PUT /api/comments/:commentId - Edit comment
comments.put('/:commentId', async (c) => {
  const commentId = c.req.param('commentId');

  const profile = await getAuthProfile(c.req.raw, c.env);
  if (!profile) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Get comment
  const commentRow = await c.env.DB.prepare(
    'SELECT * FROM comments WHERE id = ?'
  ).bind(commentId).first<CommentRow>();

  if (!commentRow) {
    return c.json({ error: 'Comment not found' }, 404);
  }

  // Check ownership
  if (commentRow.author_id !== profile.id) {
    return c.json({ error: 'Not your comment' }, 403);
  }

  // Parse body
  const body = await c.req.json<{ content: string }>();
  if (!body.content) {
    return c.json({ error: 'Content required' }, 400);
  }

  // Get parent for context
  let parentContent: string | undefined;
  if (commentRow.parent_id) {
    const parent = await c.env.DB.prepare(
      'SELECT content FROM comments WHERE id = ?'
    ).bind(commentRow.parent_id).first<{ content: string }>();
    parentContent = parent?.content;
  }

  // Get post title
  const post = await c.env.DB.prepare(
    'SELECT title FROM posts WHERE id = ?'
  ).bind(commentRow.post_id).first<{ title: string }>();

  // Re-evaluate
  const evaluation = await evaluateContent(body.content, 'comment', {
    parentContent,
    threadSummary: post?.title,
  }, c.env);

  evaluation.content_id = commentId;

  const impact = calculateStatImpact(evaluation, profile.stats);

  // Update comment
  await c.env.DB.prepare(`
    UPDATE comments SET
      content = ?,
      edited_at = ?,
      evaluation_id = ?
    WHERE id = ?
  `).bind(body.content, Date.now(), evaluation.id, commentId).run();

  // Save new evaluation
  await saveEvaluation(c.env.DB, evaluation);

  // Update stats (might be positive if user improved their comment)
  await updateProfileStats(c.env.DB, profile.id, impact.statChanges, impact.cloakQuotaDelta);

  // Fetch updated
  const row = await c.env.DB.prepare(
    'SELECT * FROM comments WHERE id = ?'
  ).bind(commentId).first<CommentRow>();

  return c.json({
    data: {
      comment: rowToComment(row!),
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

// POST /api/comments/:commentId/uncloak - Voluntarily reveal identity
comments.post('/:commentId/uncloak', async (c) => {
  const commentId = c.req.param('commentId');

  const profile = await getAuthProfile(c.req.raw, c.env);
  if (!profile) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const row = await c.env.DB.prepare(
    'SELECT * FROM comments WHERE id = ?'
  ).bind(commentId).first<CommentRow>();

  if (!row) {
    return c.json({ error: 'Comment not found' }, 404);
  }

  if (row.author_id !== profile.id) {
    return c.json({ error: 'Not your comment' }, 403);
  }

  if (!row.author_cloaked) {
    return c.json({ error: 'Comment is not cloaked' }, 400);
  }

  // Uncloak and give quota bonus
  await c.env.DB.prepare(
    'UPDATE comments SET author_cloaked = 0 WHERE id = ?'
  ).bind(commentId).run();

  // Bonus for voluntary uncloaking
  const quotaBonus = 5;
  await updateProfileStats(c.env.DB, profile.id, {}, quotaBonus);

  return c.json({
    data: {
      uncloaked: true,
      quota_bonus: quotaBonus,
    }
  });
});

export default comments;
