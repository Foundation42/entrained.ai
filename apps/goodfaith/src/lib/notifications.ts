// Notification system for GoodFaith using Cloudflare Queues
import { nanoid } from 'nanoid';
import type { Env, Profile, NotificationMessage, NotificationType } from '../types';

// Queue a notification to be processed asynchronously
export async function queueNotification(
  queue: Queue<NotificationMessage>,
  message: NotificationMessage
): Promise<void> {
  console.log(`[Notifications] Queuing ${message.type} notification for ${message.recipientProfileId}`);
  await queue.send(message);
}

// Queue notification when someone comments on a post
export async function queuePostCommentNotification(
  queue: Queue<NotificationMessage>,
  postAuthorId: string,
  commenter: Profile,
  postTitle: string,
  postId: string,
  commentId: string,
  commentPreview: string,
  communityName: string
): Promise<void> {
  // Don't notify if commenting on own post
  if (postAuthorId === commenter.id) return;

  await queueNotification(queue, {
    type: 'comment_on_post',
    recipientProfileId: postAuthorId,
    actorUsername: commenter.username,
    actorId: commenter.id,
    postId,
    postTitle,
    contentId: commentId,
    communityName,
    contentPreview: commentPreview.slice(0, 200),
    contentType: 'comment',
  });
}

// Queue notification when someone replies to a comment
export async function queueReplyNotification(
  queue: Queue<NotificationMessage>,
  parentAuthorId: string,
  replier: Profile,
  postTitle: string,
  postId: string,
  replyId: string,
  replyPreview: string,
  communityName: string
): Promise<void> {
  // Don't notify if replying to own comment
  if (parentAuthorId === replier.id) return;

  await queueNotification(queue, {
    type: 'reply_to_comment',
    recipientProfileId: parentAuthorId,
    actorUsername: replier.username,
    actorId: replier.id,
    postId,
    postTitle,
    contentId: replyId,
    communityName,
    contentPreview: replyPreview.slice(0, 200),
    contentType: 'comment',
  });
}

// Queue notifications for @mentions
export async function queueMentionNotifications(
  queue: Queue<NotificationMessage>,
  db: D1Database,
  content: string,
  mentioner: Profile,
  postTitle: string,
  postId: string,
  contentId: string,
  communityName: string,
  contentType: 'post' | 'comment'
): Promise<void> {
  const mentions = extractMentions(content);
  console.log(`[Notifications] Found ${mentions.length} mentions: ${JSON.stringify(mentions)}`);
  if (mentions.length === 0) return;

  // Look up mentioned users (limit to 10 to prevent spam)
  for (const username of mentions.slice(0, 10)) {
    // Don't notify self-mentions
    if (username.toLowerCase() === mentioner.username.toLowerCase()) continue;

    const mentionedUser = await db.prepare(
      'SELECT id FROM profiles WHERE LOWER(username) = LOWER(?)'
    ).bind(username).first<{ id: string }>();

    console.log(`[Notifications] Looked up @${username}: ${mentionedUser ? mentionedUser.id : 'NOT FOUND'}`);
    if (!mentionedUser) continue;

    await queueNotification(queue, {
      type: 'mention',
      recipientProfileId: mentionedUser.id,
      actorUsername: mentioner.username,
      actorId: mentioner.id,
      postId,
      postTitle,
      contentId,
      communityName,
      contentPreview: content.slice(0, 200),
      contentType,
    });
  }
}

// Extract @mentions from content
export function extractMentions(content: string): string[] {
  // Match @username patterns (alphanumeric and underscores, 3-20 chars)
  const mentionRegex = /@([a-zA-Z][a-zA-Z0-9_]{2,19})\b/g;
  const matches = content.matchAll(mentionRegex);
  const usernames = new Set<string>();

  for (const match of matches) {
    usernames.add(match[1].toLowerCase());
  }

  return Array.from(usernames);
}

// ============================================
// Queue Consumer - processes notification messages
// ============================================

export async function processNotificationMessage(
  message: NotificationMessage,
  db: D1Database
): Promise<void> {
  console.log(`[Notifications] Processing ${message.type} for ${message.recipientProfileId}`);

  // Find recipient's inbox community
  const inboxCommunity = await db.prepare(`
    SELECT id FROM communities
    WHERE owner_profile_id = ? AND community_type = 'inbox'
  `).bind(message.recipientProfileId).first<{ id: string }>();

  if (!inboxCommunity) {
    console.log(`[Notifications] No inbox found for profile ${message.recipientProfileId}`);
    return;
  }

  // Build notification title and content based on type
  const { title, content } = buildNotificationContent(message);

  // Create the notification post
  const postId = nanoid();
  const now = Date.now();

  await db.prepare(`
    INSERT INTO posts (
      id, community_id, author_id, author_cloaked, title, content,
      created_at, evaluation_id, comment_count, locked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    postId,
    inboxCommunity.id,
    message.recipientProfileId,  // Owner is the author of their own notifications
    0,                           // Not cloaked
    title,
    content,
    now,
    '',                          // No evaluation for notifications
    0,
    1                            // Lock notifications
  ).run();

  // Update community post count
  await db.prepare(
    'UPDATE communities SET post_count = post_count + 1 WHERE id = ?'
  ).bind(inboxCommunity.id).run();

  // Record in user_actions for analytics
  await db.prepare(`
    INSERT INTO user_actions (
      id, profile_id, action_type, target_id, community_id, timestamp, impact
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    nanoid(),
    message.recipientProfileId,
    `notification_${message.type}`,
    message.contentId,
    inboxCommunity.id,
    now,
    JSON.stringify({
      actor_id: message.actorId,
      actor_username: message.actorUsername,
      post_id: message.postId,
    })
  ).run();

  console.log(`[Notifications] Created ${message.type} notification post ${postId} for ${message.recipientProfileId}`);
}

// Build notification title and content
function buildNotificationContent(message: NotificationMessage): { title: string; content: string } {
  const truncate = (text: string, maxLength: number) =>
    text.length <= maxLength ? text : text.slice(0, maxLength - 3) + '...';

  switch (message.type) {
    case 'comment_on_post':
      return {
        title: `New comment on "${truncate(message.postTitle, 50)}"`,
        content: `**@${message.actorUsername}** commented:\n\n> ${truncate(message.contentPreview, 200)}\n\n[View in ${message.communityName}](/c/${message.communityName}/p/${message.postId}#${message.contentId})`,
      };

    case 'reply_to_comment':
      return {
        title: `@${message.actorUsername} replied to your comment`,
        content: `**@${message.actorUsername}** replied to your comment in "${truncate(message.postTitle, 50)}":\n\n> ${truncate(message.contentPreview, 200)}\n\n[View thread](/c/${message.communityName}/p/${message.postId}#${message.contentId})`,
      };

    case 'mention':
      const typeLabel = message.contentType === 'post' ? 'post' : 'comment';
      return {
        title: `@${message.actorUsername} mentioned you`,
        content: `**@${message.actorUsername}** mentioned you in a ${typeLabel}:\n\n> ${truncate(message.contentPreview, 200)}\n\n[View ${typeLabel}](/c/${message.communityName}/p/${message.postId}${message.contentType === 'comment' ? `#${message.contentId}` : ''})`,
      };

    case 'welcome':
      return {
        title: `Welcome to GoodFaith!`,
        content: `Welcome to the GoodFaith community! Here are some tips to get started:\n\n**Your Stats:**\n- Your contributions are evaluated for good faith, substance, charitability, and source quality\n- High-quality comments earn more XP and improve your stats\n\n**Communities:**\n- Browse communities to find discussions that interest you\n- Join communities to get updates\n\nHappy discussing!`,
      };

    default:
      return {
        title: 'Notification',
        content: message.contentPreview,
      };
  }
}

// Send a welcome notification (for new users) - queues the message
export async function queueWelcomeNotification(
  queue: Queue<NotificationMessage>,
  profile: Profile
): Promise<void> {
  await queueNotification(queue, {
    type: 'welcome',
    recipientProfileId: profile.id,
    actorUsername: 'GoodFaith',
    actorId: profile.id,
    postId: '',
    postTitle: '',
    contentId: '',
    communityName: '',
    contentPreview: '',
    contentType: 'post',
  });
}
