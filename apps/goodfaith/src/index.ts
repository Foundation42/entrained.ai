// GoodFaith Platform - Main Application
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, NotificationMessage } from './types';
import communities from './routes/communities';
import posts from './routes/posts';
import comments from './routes/comments';
import profiles from './routes/profiles';
import badges from './routes/badges';
import { landingPage, communityPage, postPage, aboutPage, howItWorksPage, createCommunityPage, createPostPage } from './pages/public';
import { processNotificationMessage } from './lib/notifications';

const app = new Hono<{ Bindings: Env }>();

// CORS for cross-origin requests from entrained.ai subdomains
app.use('/api/*', cors({
  origin: (origin) => {
    if (!origin) return 'https://goodfaith.entrained.ai';
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
app.get('/health', (c) => c.json({ status: 'ok', service: 'goodfaith' }));

// API Routes
app.route('/api/communities', communities);
app.route('/api/c/:community/posts', posts);
app.route('/api/c/:community/posts/:postId/comments', comments);
app.route('/api', profiles);
app.route('/api/badges', badges);

// Evaluate endpoint (pre-submit check)
app.post('/api/evaluate', async (c) => {
  const { getAuthProfile } = await import('./lib/auth');
  const { evaluateContent, calculateStatImpact } = await import('./lib/ai');

  const profile = await getAuthProfile(c.req.raw, c.env);
  if (!profile) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{
    content: string;
    type: 'post' | 'comment';
    context?: {
      parent_content?: string;
      thread_summary?: string;
    };
  }>();

  if (!body.content || !body.type) {
    return c.json({ error: 'Content and type required' }, 400);
  }

  const evaluation = await evaluateContent(
    body.content,
    body.type,
    {
      parentContent: body.context?.parent_content,
      threadSummary: body.context?.thread_summary,
    },
    c.env
  );

  const impact = calculateStatImpact(evaluation, profile.stats);

  return c.json({
    data: {
      evaluation: {
        scores: evaluation.scores,
        flags: evaluation.flags,
        suggestions: evaluation.suggestions,
        reasoning: evaluation.reasoning,
      },
      predicted_impact: impact,
    }
  });
});

// ================================
// Public HTML Pages (SSR)
// ================================

// Landing page
app.get('/', async (c) => {
  const { DB } = c.env;

  // Get featured communities
  const communities = await DB.prepare(`
    SELECT name, display_name, description, member_count, post_count
    FROM communities
    ORDER BY member_count DESC
    LIMIT 5
  `).all();

  // Get recent posts
  const recentPosts = await DB.prepare(`
    SELECT p.id, p.title, p.created_at, p.comment_count,
           c.name as community_name, c.display_name as community_display_name
    FROM posts p
    JOIN communities c ON p.community_id = c.id
    ORDER BY p.created_at DESC
    LIMIT 10
  `).all();

  return c.html(landingPage(communities.results, recentPosts.results));
});

// Create post page (must be before /c/:name to match first)
app.get('/c/:name/new', async (c) => {
  const name = c.req.param('name');
  const { DB } = c.env;

  const community = await DB.prepare(
    'SELECT * FROM communities WHERE name = ?'
  ).bind(name.toLowerCase()).first();

  if (!community) {
    return c.html('<h1>Community not found</h1>', 404);
  }

  return c.html(createPostPage(community));
});

// Community page
app.get('/c/:name', async (c) => {
  const name = c.req.param('name');
  const { DB } = c.env;

  const community = await DB.prepare(
    'SELECT * FROM communities WHERE name = ?'
  ).bind(name.toLowerCase()).first();

  if (!community) {
    return c.html('<h1>Community not found</h1>', 404);
  }

  const posts = await DB.prepare(`
    SELECT p.*, pr.username as author_username, pr.avatar_url as author_avatar
    FROM posts p
    LEFT JOIN profiles pr ON p.author_id = pr.id
    WHERE p.community_id = ?
    ORDER BY p.created_at DESC
    LIMIT 50
  `).bind(community.id).all();

  return c.html(communityPage(community, posts.results));
});

// Post page
app.get('/c/:community/p/:postId', async (c) => {
  const postId = c.req.param('postId');
  const { DB } = c.env;

  const post = await DB.prepare(`
    SELECT p.*, pr.username as author_username, pr.avatar_url as author_avatar, c.name as community_name, c.display_name as community_display_name
    FROM posts p
    LEFT JOIN profiles pr ON p.author_id = pr.id
    JOIN communities c ON p.community_id = c.id
    WHERE p.id = ?
  `).bind(postId).first();

  if (!post) {
    return c.html('<h1>Post not found</h1>', 404);
  }

  const comments = await DB.prepare(`
    SELECT cm.*, pr.username as author_username, pr.avatar_url as author_avatar
    FROM comments cm
    LEFT JOIN profiles pr ON cm.author_id = pr.id
    WHERE cm.post_id = ?
    ORDER BY cm.path ASC
  `).bind(postId).all();

  return c.html(postPage(post, comments.results));
});

// About page
app.get('/about', (c) => c.html(aboutPage()));

// How it works page
app.get('/how-it-works', (c) => c.html(howItWorksPage()));

// Create community page
app.get('/communities/new', (c) => c.html(createCommunityPage()));

// ================================
// EAP Manifest
// ================================

app.get('/manifest.json', (c) => {
  const manifest = {
    app: 'goodfaith.entrained.ai',
    version: '1.1.0',
    name: 'GoodFaith',
    description: 'AI-moderated community platform for constructive discourse',

    capabilities: [
      // ================================
      // UI Capabilities (browser intents)
      // ================================
      {
        id: 'community.join',
        name: 'Join Community',
        description: 'Join a GoodFaith community (browser UI)',
        endpoint: '/c',
        method: 'GET',
        type: 'ui',
        parameters: {
          community: { type: 'string', optional: true, description: 'Community name to join' },
          returnTo: { type: 'url', optional: true, description: 'URL to return to after joining' },
        },
      },
      {
        id: 'post.create.ui',
        name: 'Create Post (UI)',
        description: 'Create a new post in a community (browser UI)',
        endpoint: '/c/:community/new',
        method: 'GET',
        type: 'ui',
        parameters: {
          community: { type: 'string', required: true, description: 'Community name' },
          title: { type: 'string', optional: true, description: 'Pre-fill post title' },
          returnTo: { type: 'url', optional: true, description: 'URL to return to after posting' },
        },
        returns: {
          type: 'object',
          schema: { postId: 'string', postUrl: 'string' },
        },
      },
      {
        id: 'profile.view',
        name: 'View Profile',
        description: 'View a user profile (browser UI)',
        endpoint: '/u/:username',
        method: 'GET',
        type: 'ui',
        parameters: {
          username: { type: 'string', required: true, description: 'Username to view' },
        },
      },

      // ================================
      // API Capabilities (programmatic/AI/MCP)
      // ================================
      {
        id: 'api.communities.list',
        name: 'List Communities',
        description: 'Get a list of public communities',
        endpoint: '/api/communities',
        method: 'GET',
        type: 'api',
        parameters: {
          type: { type: 'string', optional: true, description: 'Filter by type: public, personal_timeline, inbox, all (default: public)' },
        },
        returns: {
          type: 'object',
          schema: {
            data: 'Community[]',
          },
        },
        aiInstructions: {
          summary: 'Lists all public communities. Use type=personal_timeline to find user timelines.',
          examples: [
            { input: {}, output: { data: [{ name: 'tech', display_name: 'Technology', member_count: 42 }] } },
          ],
        },
      },
      {
        id: 'api.community.get',
        name: 'Get Community',
        description: 'Get details about a specific community',
        endpoint: '/api/communities/:name',
        method: 'GET',
        type: 'api',
        parameters: {
          name: { type: 'string', required: true, description: 'Community name/slug' },
        },
        returns: {
          type: 'object',
          schema: {
            data: 'Community',
          },
        },
        aiInstructions: {
          summary: 'Get community details including permissions, member count, and evaluation config.',
          examples: [
            { input: { name: 'tech' }, output: { data: { name: 'tech', display_name: 'Technology', permissions: { who_can_post: 'members' } } } },
          ],
        },
      },
      {
        id: 'api.posts.list',
        name: 'List Posts',
        description: 'Get posts in a community',
        endpoint: '/api/c/:community/posts',
        method: 'GET',
        type: 'api',
        parameters: {
          community: { type: 'string', required: true, description: 'Community name' },
        },
        returns: {
          type: 'object',
          schema: {
            data: 'Post[]',
          },
        },
        aiInstructions: {
          summary: 'Lists posts in a community, newest first. Returns post metadata and author info.',
        },
      },
      {
        id: 'api.post.get',
        name: 'Get Post',
        description: 'Get a post with its comments',
        endpoint: '/api/c/:community/posts/:postId',
        method: 'GET',
        type: 'api',
        parameters: {
          community: { type: 'string', required: true, description: 'Community name' },
          postId: { type: 'string', required: true, description: 'Post ID' },
        },
        returns: {
          type: 'object',
          schema: {
            data: { post: 'Post', comments: 'Comment[]' },
          },
        },
        aiInstructions: {
          summary: 'Get full post content and threaded comments. Comments are sorted by path for proper threading.',
        },
      },
      {
        id: 'api.post.create',
        name: 'Create Post',
        description: 'Create a new post in a community (requires auth)',
        endpoint: '/api/c/:community/posts',
        method: 'POST',
        type: 'api',
        auth: 'required',
        parameters: {
          community: { type: 'string', required: true, description: 'Community name (in URL)' },
          title: { type: 'string', required: true, description: 'Post title (max 300 chars)' },
          content: { type: 'string', required: true, description: 'Post content (max 40000 chars, markdown supported)' },
          cloaked: { type: 'boolean', optional: true, description: 'Post anonymously (uses cloak quota)' },
        },
        returns: {
          type: 'object',
          schema: {
            data: { post: 'Post', evaluation: 'Evaluation', xp_awarded: 'number' },
          },
        },
        aiInstructions: {
          summary: 'Create a post. Content is AI-evaluated for good faith, substance, charitability, and source quality.',
          tips: [
            'Posts are evaluated by AI - aim for constructive, well-reasoned content',
            'Use markdown for formatting',
            'Scores affect your profile stats',
          ],
        },
      },
      {
        id: 'api.comment.create',
        name: 'Create Comment',
        description: 'Add a comment to a post (requires auth)',
        endpoint: '/api/c/:community/posts/:postId/comments',
        method: 'POST',
        type: 'api',
        auth: 'required',
        parameters: {
          community: { type: 'string', required: true, description: 'Community name (in URL)' },
          postId: { type: 'string', required: true, description: 'Post ID (in URL)' },
          content: { type: 'string', required: true, description: 'Comment content (max 10000 chars)' },
          parent_id: { type: 'string', optional: true, description: 'Parent comment ID for threading' },
          sentiment: { type: 'string', optional: true, description: 'agree, disagree, or neutral' },
          sentiment_reasoning: { type: 'string', optional: true, description: 'Required if sentiment is agree/disagree' },
          cloaked: { type: 'boolean', optional: true, description: 'Comment anonymously' },
        },
        returns: {
          type: 'object',
          schema: {
            data: { comment: 'Comment', evaluation: 'Evaluation', xp_awarded: 'number' },
          },
        },
        aiInstructions: {
          summary: 'Add a comment. If disagreeing, provide charitable reasoning. Comments are AI-evaluated.',
          tips: [
            'sentiment_reasoning is required when sentiment is agree or disagree',
            'Use parent_id for threaded replies',
            'Aim for constructive engagement',
          ],
        },
      },
      {
        id: 'api.profile.get',
        name: 'Get Profile',
        description: 'Get a user\'s public profile',
        endpoint: '/api/u/:username',
        method: 'GET',
        type: 'api',
        parameters: {
          username: { type: 'string', required: true, description: 'Username' },
        },
        returns: {
          type: 'object',
          schema: {
            data: { profile: 'Profile', recent_posts: 'PostSummary[]', recent_comments: 'CommentSummary[]' },
          },
        },
      },
      {
        id: 'api.timeline.get',
        name: 'Get User Timeline',
        description: 'Get a user\'s personal timeline community',
        endpoint: '/api/u/:username/timeline',
        method: 'GET',
        type: 'api',
        parameters: {
          username: { type: 'string', required: true, description: 'Username' },
        },
        returns: {
          type: 'object',
          schema: {
            data: 'Community',
          },
        },
        aiInstructions: {
          summary: 'Get user\'s personal timeline. Post to it like any community (if permitted).',
        },
      },
      {
        id: 'api.me',
        name: 'Get Current User',
        description: 'Get the authenticated user\'s profile (requires auth)',
        endpoint: '/api/me',
        method: 'GET',
        type: 'api',
        auth: 'required',
        returns: {
          type: 'object',
          schema: {
            data: { profile: 'Profile' },
          },
        },
      },
      {
        id: 'api.me.timeline',
        name: 'Get My Timeline',
        description: 'Get the authenticated user\'s personal timeline (requires auth)',
        endpoint: '/api/me/timeline',
        method: 'GET',
        type: 'api',
        auth: 'required',
        returns: {
          type: 'object',
          schema: {
            data: 'Community',
          },
        },
      },
      {
        id: 'api.me.inbox',
        name: 'Get My Inbox',
        description: 'Get the authenticated user\'s inbox (requires auth)',
        endpoint: '/api/me/inbox',
        method: 'GET',
        type: 'api',
        auth: 'required',
        returns: {
          type: 'object',
          schema: {
            data: 'Community',
          },
        },
      },
      {
        id: 'api.me.notifications',
        name: 'Get My Notifications',
        description: 'Get notification posts from inbox (new comments, replies, mentions)',
        endpoint: '/api/me/notifications',
        method: 'GET',
        type: 'api',
        auth: 'required',
        params: {
          limit: { type: 'number', optional: true, description: 'Max notifications to return (default 20, max 50)' },
          offset: { type: 'number', optional: true, description: 'Pagination offset' },
        },
        returns: {
          type: 'object',
          schema: {
            data: {
              notifications: 'Post[]',
              total: 'number',
              limit: 'number',
              offset: 'number',
            },
          },
        },
      },
      {
        id: 'api.community.join',
        name: 'Join Community',
        description: 'Join a community to gain posting privileges (requires auth)',
        endpoint: '/api/communities/:name/join',
        method: 'POST',
        type: 'api',
        auth: 'required',
        parameters: {
          name: { type: 'string', required: true, description: 'Community name/slug to join' },
        },
        returns: {
          type: 'object',
          schema: {
            data: { joined: 'boolean' },
          },
        },
        aiInstructions: {
          summary: 'Join a community to unlock posting privileges. Most communities are open to join.',
          tips: [
            'You must join a community before you can create posts in it',
            'Anyone can comment, but only members can post',
            'Check community permissions with api.community.get first',
          ],
        },
      },
      {
        id: 'api.community.leave',
        name: 'Leave Community',
        description: 'Leave a community (requires auth)',
        endpoint: '/api/communities/:name/leave',
        method: 'POST',
        type: 'api',
        auth: 'required',
        parameters: {
          name: { type: 'string', required: true, description: 'Community name/slug to leave' },
        },
        returns: {
          type: 'object',
          schema: {
            data: { left: 'boolean' },
          },
        },
      },
    ],

    permissions: ['auth.read', 'engram.read', 'engram.write'],

    introspection: {
      health: '/health',
    },

    ai: {
      apiEndpoint: '/api',
      instructions: {
        summary: 'GoodFaith is an AI-moderated community platform for constructive discourse. All content is evaluated by AI on four dimensions: good faith, substantive value, charitability, and source quality.',
        capabilities: [
          'Browse and join communities',
          'Read posts and threaded comments',
          'Create posts with AI quality feedback',
          'Comment on posts with real-time constructive feedback',
          'Build reputation through quality contributions',
          'Personal timelines (u_{username}) for user-specific content',
          'Notifications for comments, replies, and @mentions (GET /api/me/notifications)',
          'Inbox (u_{username}_inbox) for notifications',
        ],
        bestPractices: [
          'Content is evaluated before posting - aim for constructive discourse',
          'Scores affect your profile stats and reputation',
          'When disagreeing, provide charitable reasoning',
          'Use markdown for formatting in posts and comments',
          'Personal timelines are communities - post to them using standard post API',
        ],
        authentication: {
          method: 'Bearer token',
          header: 'Authorization: Bearer <token>',
          obtainFrom: 'https://auth.entrained.ai',
        },
      },
    },
  };

  return c.json(manifest, 200, {
    'Cache-Control': 'public, max-age=300',
  });
});

// Export with queue handler for notifications
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<NotificationMessage>, env: Env): Promise<void> {
    console.log(`[Queue] Processing ${batch.messages.length} notification(s)`);

    for (const message of batch.messages) {
      try {
        await processNotificationMessage(message.body, env.DB);
        message.ack();
      } catch (err) {
        console.error('[Queue] Error processing notification:', err);
        message.retry();
      }
    }
  },
};
