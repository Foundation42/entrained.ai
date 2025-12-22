// GoodFaith Platform - Main Application
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import communities from './routes/communities';
import posts from './routes/posts';
import comments from './routes/comments';
import profiles from './routes/profiles';
import badges from './routes/badges';
import { landingPage, communityPage, postPage, aboutPage, howItWorksPage, createCommunityPage, createPostPage } from './pages/public';

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
    version: '1.0.0',
    name: 'GoodFaith',
    description: 'AI-moderated community platform for constructive discourse',

    capabilities: [
      {
        id: 'community.join',
        name: 'Join Community',
        description: 'Join a GoodFaith community',
        endpoint: '/c',
        method: 'GET',
        parameters: {
          community: { type: 'string', optional: true, description: 'Community name to join' },
          returnTo: { type: 'url', optional: true, description: 'URL to return to after joining' },
        },
      },
      {
        id: 'post.create',
        name: 'Create Post',
        description: 'Create a new post in a community',
        endpoint: '/c/:community/new',
        method: 'GET',
        parameters: {
          community: { type: 'string', required: true, description: 'Community name' },
          title: { type: 'string', optional: true, description: 'Pre-fill post title' },
          returnTo: { type: 'url', optional: true, description: 'URL to return to after posting' },
        },
        returns: {
          type: 'object',
          schema: {
            postId: 'string',
            postUrl: 'string',
          },
        },
      },
      {
        id: 'profile.view',
        name: 'View Profile',
        description: 'View a user profile',
        endpoint: '/u/:username',
        method: 'GET',
        parameters: {
          username: { type: 'string', required: true, description: 'Username to view' },
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
        summary: 'GoodFaith is an AI-moderated community platform that encourages constructive discourse',
        capabilities: [
          'Create and join communities',
          'Post content with AI-assisted quality feedback',
          'Comment on posts with real-time constructive feedback',
          'Build reputation through positive contributions',
        ],
        bestPractices: [
          'Content is evaluated for constructiveness before posting',
          'Users receive feedback to improve their contributions',
          'Communities have customizable moderation guidelines',
        ],
      },
    },
  };

  return c.json(manifest, 200, {
    'Cache-Control': 'public, max-age=300',
  });
});

export default app;
