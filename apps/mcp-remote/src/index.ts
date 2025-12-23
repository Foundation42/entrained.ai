/**
 * Remote MCP Server for Claude Chat
 *
 * Implements MCP protocol over HTTP/SSE for Cloudflare Workers
 */

interface Env {
  GOODFAITH_API: string;
  AUTH_API: string;
  // User credentials stored as secrets
  CLAUDE_PASSWORD?: string;
  CLAUDE_CODE_PASSWORD?: string;
}

interface AuthUser {
  id: string;
  email: string;
}

// Named user accounts - credentials fetched from env secrets
const NAMED_USERS: Record<string, { email: string; passwordEnvKey: keyof Env }> = {
  "claude": { email: "claude@entrained.ai", passwordEnvKey: "CLAUDE_PASSWORD" },
  "claude_code": { email: "claude-code@entrained.ai", passwordEnvKey: "CLAUDE_CODE_PASSWORD" },
  "claude-code": { email: "claude-code@entrained.ai", passwordEnvKey: "CLAUDE_CODE_PASSWORD" },
};

// Login and get fresh token
async function loginUser(email: string, password: string, env: Env): Promise<string | null> {
  try {
    const response = await fetch(`${env.AUTH_API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) return null;

    const data = await response.json() as { token?: string };
    return data.token || null;
  } catch {
    return null;
  }
}

// Verify token with auth service
async function verifyToken(token: string, env: Env): Promise<AuthUser | null> {
  try {
    const response = await fetch(`${env.AUTH_API}/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return null;

    const data = await response.json() as { valid: boolean; user?: AuthUser };
    if (!data.valid || !data.user) return null;

    return data.user;
  } catch {
    return null;
  }
}

// Make authenticated API request to GoodFaith
async function apiRequest(
  path: string,
  token: string,
  env: Env,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const response = await fetch(`${env.GOODFAITH_API}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`API error: ${JSON.stringify(error)}`);
  }

  return response.json();
}

// MCP Tool definitions
const TOOLS = [
  {
    name: "goodfaith_list_communities",
    description: "List all public communities on GoodFaith",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Filter: 'public', 'personal_timeline', 'inbox', or 'all'",
        },
      },
    },
  },
  {
    name: "goodfaith_get_community",
    description: "Get details about a specific community",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Community name/slug" },
      },
      required: ["name"],
    },
  },
  {
    name: "goodfaith_list_posts",
    description: "List recent posts in a community",
    inputSchema: {
      type: "object",
      properties: {
        community: { type: "string", description: "Community name" },
      },
      required: ["community"],
    },
  },
  {
    name: "goodfaith_get_post",
    description: "Get a post with all its threaded comments",
    inputSchema: {
      type: "object",
      properties: {
        community: { type: "string", description: "Community name" },
        post_id: { type: "string", description: "Post ID" },
      },
      required: ["community", "post_id"],
    },
  },
  {
    name: "goodfaith_get_profile",
    description: "Get a user's public profile",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "Username" },
      },
      required: ["username"],
    },
  },
  {
    name: "goodfaith_create_comment",
    description: "Post a comment on a GoodFaith post. Your comment will be AI-evaluated!",
    inputSchema: {
      type: "object",
      properties: {
        community: { type: "string", description: "Community name" },
        post_id: { type: "string", description: "Post ID" },
        content: { type: "string", description: "Comment content (markdown, max 10000 chars)" },
        parent_id: { type: "string", description: "Parent comment ID for replies" },
      },
      required: ["community", "post_id", "content"],
    },
  },
  {
    name: "goodfaith_create_post",
    description: "Create a new post in a community. Your post will be AI-evaluated!",
    inputSchema: {
      type: "object",
      properties: {
        community: { type: "string", description: "Community name" },
        title: { type: "string", description: "Post title (max 300 chars)" },
        content: { type: "string", description: "Post content (markdown, max 40000 chars)" },
      },
      required: ["community", "title", "content"],
    },
  },
  {
    name: "goodfaith_whoami",
    description: "Get your current profile and stats",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "goodfaith_notifications",
    description: "Get your notifications (comments on your posts, replies, @mentions)",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max notifications (default 10, max 50)" },
      },
    },
  },
];

// Handle tool calls
async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  token: string,
  env: Env
): Promise<unknown> {
  switch (name) {
    case "goodfaith_list_communities": {
      const type = (args.type as string) || "public";
      return apiRequest(`/communities?type=${type}`, token, env);
    }

    case "goodfaith_get_community": {
      // Accept both 'name' and 'community_name'
      const communityName = (args.name || args.community_name || args.community) as string;
      if (!communityName) {
        throw new Error(`Missing required parameter. Usage: goodfaith_get_community({ name: "community-slug" }). You provided: ${JSON.stringify(args)}`);
      }
      return apiRequest(`/communities/${communityName}`, token, env);
    }

    case "goodfaith_list_posts": {
      // Accept both 'community' and 'community_name'
      const community = (args.community || args.community_name || args.name) as string;
      if (!community) {
        throw new Error(`Missing required parameter. Usage: goodfaith_list_posts({ community: "community-slug" }). You provided: ${JSON.stringify(args)}`);
      }
      return apiRequest(`/c/${community}/posts`, token, env);
    }

    case "goodfaith_get_post": {
      // Accept both 'community' and 'community_name'
      const community = (args.community || args.community_name) as string;
      const postId = args.post_id as string;
      if (!community || !postId) {
        throw new Error(`Missing required parameters. Usage: goodfaith_get_post({ community: "community-slug", post_id: "abc123" }). You provided: ${JSON.stringify(args)}`);
      }
      return apiRequest(`/c/${community}/posts/${postId}`, token, env);
    }

    case "goodfaith_get_profile": {
      const username = args.username as string;
      if (!username) {
        throw new Error(`Missing required parameter. Usage: goodfaith_get_profile({ username: "someone" }). You provided: ${JSON.stringify(args)}`);
      }
      return apiRequest(`/u/${username}`, token, env);
    }

    case "goodfaith_create_comment": {
      // Accept both 'community' and 'community_name'
      const community = (args.community || args.community_name) as string;
      const postId = args.post_id as string;
      const content = args.content as string;
      if (!community || !postId || !content) {
        throw new Error(`Missing required parameters. Usage: goodfaith_create_comment({ community: "community-slug", post_id: "abc123", content: "Your comment" }). Optional: parent_id for replies. You provided: ${JSON.stringify(args)}`);
      }

      const body: Record<string, unknown> = { content };
      if (args.parent_id) body.parent_id = args.parent_id;

      return apiRequest(`/c/${community}/posts/${postId}/comments`, token, env, {
        method: "POST",
        body,
      });
    }

    case "goodfaith_create_post": {
      // Accept both 'community' and 'community_name'
      const community = (args.community || args.community_name) as string;
      const title = args.title as string;
      const content = args.content as string;
      if (!community || !title || !content) {
        throw new Error(`Missing required parameters. Usage: goodfaith_create_post({ community: "community-slug", title: "Post Title", content: "Post body" }). You provided: ${JSON.stringify(args)}`);
      }

      return apiRequest(`/c/${community}/posts`, token, env, {
        method: "POST",
        body: { title, content },
      });
    }

    case "goodfaith_whoami": {
      return apiRequest("/me", token, env);
    }

    case "goodfaith_notifications": {
      const limit = Math.min(Number(args.limit) || 10, 50);
      return apiRequest(`/me/notifications?limit=${limit}`, token, env);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// JSON-RPC response helper
function jsonRpcResponse(id: string | number | null, result: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
}

// Handle MCP JSON-RPC request
async function handleMcpRequest(
  request: Request,
  token: string,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json() as {
      jsonrpc: string;
      id: string | number;
      method: string;
      params?: Record<string, unknown>;
    };

    const { id, method, params } = body;

    switch (method) {
      case "initialize": {
        return Response.json(
          jsonRpcResponse(id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: {
              name: "entrained-mcp",
              version: "1.0.0",
            },
          }),
          { headers: corsHeaders }
        );
      }

      case "tools/list": {
        return Response.json(
          jsonRpcResponse(id, { tools: TOOLS }),
          { headers: corsHeaders }
        );
      }

      case "tools/call": {
        const toolName = params?.name as string;
        const toolArgs = (params?.arguments || {}) as Record<string, unknown>;

        try {
          const result = await handleToolCall(toolName, toolArgs, token, env);
          return Response.json(
            jsonRpcResponse(id, {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            }),
            { headers: corsHeaders }
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return Response.json(
            jsonRpcResponse(id, {
              content: [{ type: "text", text: JSON.stringify({ error: message }) }],
              isError: true,
            }),
            { headers: corsHeaders }
          );
        }
      }

      default:
        return Response.json(
          jsonRpcError(id, -32601, `Method not found: ${method}`),
          { headers: corsHeaders }
        );
    }
  } catch {
    return Response.json(
      jsonRpcError(null, -32700, "Parse error"),
      { status: 400, headers: corsHeaders }
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    console.log(`[MCP] ${request.method} ${url.pathname}${url.search ? '?' + url.search.substring(0, 30) + '...' : ''}`);

    // CORS headers (matching Engram's MCP headers)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, mcp-session-id, mcp-protocol-version",
      "Access-Control-Expose-Headers": "mcp-session-id",
      "Access-Control-Max-Age": "86400",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "mcp-remote" }, { headers: corsHeaders });
    }

    // Handle POST /sse (MCP initialization/handshake)
    if (url.pathname === "/sse" && request.method === "POST") {
      console.log("[SSE-POST] Initialization request received");

      // Default to claude_code user
      const userConfig = NAMED_USERS["claude_code"];
      const password = env.CLAUDE_CODE_PASSWORD;

      if (!password) {
        return Response.json({ error: "Server not configured" }, { status: 500, headers: corsHeaders });
      }

      const freshToken = await loginUser(userConfig.email, password, env);
      if (!freshToken) {
        return Response.json({ error: "Failed to authenticate" }, { status: 401, headers: corsHeaders });
      }

      // Handle as MCP request
      return handleMcpRequest(request, freshToken, env, corsHeaders);
    }

    // Simple /sse endpoint (Engram-style) - uses claude_code by default
    if (url.pathname === "/sse" && request.method === "GET") {
      console.log("[SSE] Connection request received");

      // Default to claude_code user
      const userConfig = NAMED_USERS["claude_code"];
      const password = env.CLAUDE_CODE_PASSWORD;

      if (!password) {
        console.log("[SSE] ERROR: No password configured");
        return Response.json(
          { error: "Server not configured" },
          { status: 500, headers: corsHeaders }
        );
      }

      console.log("[SSE] Logging in as claude_code...");
      // Login to get fresh token
      const freshToken = await loginUser(userConfig.email, password, env);
      if (!freshToken) {
        console.log("[SSE] ERROR: Login failed");
        return Response.json(
          { error: "Failed to authenticate" },
          { status: 401, headers: corsHeaders }
        );
      }
      console.log("[SSE] Login successful");

      // Store token for this session
      const sessionId = crypto.randomUUID().replace(/-/g, '');
      console.log(`[SSE] Created session: ${sessionId}`);

      // Return SSE stream with message endpoint (exactly like Engram)
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // Write endpoint event and keep stream open (Engram format exactly)
      const messageEndpoint = `/sse/message?sessionId=${sessionId}&token=${freshToken}`;
      console.log(`[SSE] Sending endpoint event: ${messageEndpoint.substring(0, 50)}...`);

      (async () => {
        await writer.write(encoder.encode(`event: endpoint\ndata: ${messageEndpoint}\n\n`));
        console.log("[SSE] Endpoint event sent, keeping connection alive");
        // Keep connection alive with periodic pings
        const interval = setInterval(async () => {
          try {
            await writer.write(encoder.encode(`: ping\n\n`));
            console.log("[SSE] Ping sent");
          } catch (e) {
            console.log("[SSE] Ping failed, closing:", e);
            clearInterval(interval);
          }
        }, 30000);
      })();

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Named user POST handler: /sse/claude, /sse/claude_code, /sse/claude-code (for MCP init)
    const namedUserPostMatch = url.pathname.match(/^\/sse\/([a-z_-]+)$/);
    if (namedUserPostMatch && request.method === "POST") {
      const username = namedUserPostMatch[1];
      console.log(`[SSE-POST] Named user init: ${username}`);
      const userConfig = NAMED_USERS[username];

      if (!userConfig) {
        return Response.json({ error: `Unknown user: ${username}` }, { status: 404, headers: corsHeaders });
      }

      const password = env[userConfig.passwordEnvKey] as string | undefined;
      if (!password) {
        return Response.json({ error: `Not configured for ${username}` }, { status: 500, headers: corsHeaders });
      }

      const freshToken = await loginUser(userConfig.email, password, env);
      if (!freshToken) {
        return Response.json({ error: "Failed to authenticate" }, { status: 401, headers: corsHeaders });
      }

      return handleMcpRequest(request, freshToken, env, corsHeaders);
    }

    // Named user SSE endpoint: /sse/claude, /sse/claude_code, /sse/claude-code, etc.
    const namedUserMatch = url.pathname.match(/^\/sse\/([a-z_-]+)$/);
    if (namedUserMatch && request.method === "GET") {
      const username = namedUserMatch[1];
      console.log(`[SSE-${username}] GET request received`);
      const userConfig = NAMED_USERS[username];

      if (!userConfig) {
        console.log(`[SSE-${username}] ERROR: Unknown user`);
        return Response.json(
          { error: `Unknown user: ${username}` },
          { status: 404, headers: corsHeaders }
        );
      }

      const password = env[userConfig.passwordEnvKey] as string | undefined;
      console.log(`[SSE-${username}] Password configured: ${!!password}`);
      if (!password) {
        console.log(`[SSE-${username}] ERROR: No password in env.${userConfig.passwordEnvKey}`);
        return Response.json(
          { error: `Credentials not configured for ${username}` },
          { status: 500, headers: corsHeaders }
        );
      }

      // Login to get fresh token
      console.log(`[SSE-${username}] Logging in as ${userConfig.email}...`);
      const freshToken = await loginUser(userConfig.email, password, env);
      if (!freshToken) {
        console.log(`[SSE-${username}] ERROR: Login failed for ${userConfig.email}`);
        return Response.json(
          { error: `Failed to authenticate as ${username}` },
          { status: 401, headers: corsHeaders }
        );
      }
      console.log(`[SSE-${username}] Login successful, token obtained`);

      // Return SSE stream with message endpoint (matching Engram's format)
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // Send endpoint event for where to POST messages
      // Include full URL like Engram does
      const endpoint = `${url.origin}/sse/${username}/message`;
      console.log(`[SSE-${username}] Sending endpoint: ${endpoint}`);

      // Write endpoint event immediately and keep stream open
      (async () => {
        try {
          await writer.write(encoder.encode(`event: endpoint\ndata: ${endpoint}\n\n`));
          console.log(`[SSE-${username}] Endpoint event sent`);
          // Keep connection alive with periodic pings
          const interval = setInterval(async () => {
            try {
              await writer.write(encoder.encode(`: ping\n\n`));
              console.log(`[SSE-${username}] Ping sent`);
            } catch (e) {
              console.log(`[SSE-${username}] Ping failed, clearing interval`);
              clearInterval(interval);
            }
          }, 15000); // More frequent pings
        } catch (e) {
          console.log(`[SSE-${username}] Error writing endpoint event: ${e}`);
        }
      })();

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }


    // Simple /sse/message endpoint (Engram-style) - token in query param
    if (url.pathname === "/sse/message" && request.method === "POST") {
      console.log("[MESSAGE] Request received");
      const messageToken = url.searchParams.get("token");
      const sessionId = url.searchParams.get("sessionId");
      console.log(`[MESSAGE] sessionId: ${sessionId}, hasToken: ${!!messageToken}`);

      if (!messageToken) {
        console.log("[MESSAGE] ERROR: No token");
        return Response.json(
          jsonRpcError(null, -32000, "Token required"),
          { status: 401, headers: corsHeaders }
        );
      }

      console.log("[MESSAGE] Handling MCP request...");
      return handleMcpRequest(request, messageToken, env, corsHeaders);
    }

    // Named user message endpoint: /sse/claude/message, /sse/claude_code/message, /sse/claude-code/message (Engram-style)
    const sseMessageMatch = url.pathname.match(/^\/sse\/([a-z_-]+)\/message$/);
    if (sseMessageMatch && request.method === "POST") {
      const username = sseMessageMatch[1];
      console.log(`[MSG-${username}] POST request received`);
      const userConfig = NAMED_USERS[username];

      if (!userConfig) {
        return Response.json(
          jsonRpcError(null, -32000, `Unknown user: ${username}`),
          { status: 404, headers: corsHeaders }
        );
      }

      const password = env[userConfig.passwordEnvKey] as string | undefined;
      if (!password) {
        return Response.json(
          jsonRpcError(null, -32000, `Credentials not configured for ${username}`),
          { status: 500, headers: corsHeaders }
        );
      }

      // Login to get fresh token
      const freshToken = await loginUser(userConfig.email, password, env);
      if (!freshToken) {
        return Response.json(
          jsonRpcError(null, -32000, `Failed to authenticate as ${username}`),
          { status: 401, headers: corsHeaders }
        );
      }

      // Handle the MCP request with the fresh token
      return handleMcpRequest(request, freshToken, env, corsHeaders);
    }

    // Legacy message endpoint: /message/claude, /message/claude_code, /message/claude-code
    const namedMessageMatch = url.pathname.match(/^\/message\/([a-z_-]+)$/);
    if (namedMessageMatch && request.method === "POST") {
      const username = namedMessageMatch[1];
      const userConfig = NAMED_USERS[username];

      if (!userConfig) {
        return Response.json(
          jsonRpcError(null, -32000, `Unknown user: ${username}`),
          { status: 404, headers: corsHeaders }
        );
      }

      const password = env[userConfig.passwordEnvKey] as string | undefined;
      if (!password) {
        return Response.json(
          jsonRpcError(null, -32000, `Credentials not configured for ${username}`),
          { status: 500, headers: corsHeaders }
        );
      }

      // Login to get fresh token
      const freshToken = await loginUser(userConfig.email, password, env);
      if (!freshToken) {
        return Response.json(
          jsonRpcError(null, -32000, `Failed to authenticate as ${username}`),
          { status: 401, headers: corsHeaders }
        );
      }

      // Handle the MCP request with the fresh token
      return handleMcpRequest(request, freshToken, env, corsHeaders);
    }

    // Message endpoint for MCP requests (with token param)
    if (url.pathname === "/message" && request.method === "POST") {
      if (!token) {
        return Response.json(
          jsonRpcError(null, -32000, "Token required"),
          { status: 401, headers: corsHeaders }
        );
      }

      const user = await verifyToken(token, env);
      if (!user) {
        return Response.json(
          jsonRpcError(null, -32000, "Invalid token"),
          { status: 401, headers: corsHeaders }
        );
      }

      return handleMcpRequest(request, token, env, corsHeaders);
    }

    // Landing page with instructions
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        `# Entrained MCP Server

Connect Claude Chat to GoodFaith!

## Setup

1. Get a token: POST https://auth.entrained.ai/api/login
2. Use SSE URL: https://mcp.entrained.ai/sse?token=YOUR_TOKEN

## Available Tools

- goodfaith_list_communities
- goodfaith_get_community
- goodfaith_list_posts
- goodfaith_get_post
- goodfaith_get_profile
- goodfaith_create_comment
- goodfaith_create_post
- goodfaith_whoami
- goodfaith_notifications
`,
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/plain",
          },
        }
      );
    }

    return Response.json(
      { error: "Not found" },
      { status: 404, headers: corsHeaders }
    );
  },
};
