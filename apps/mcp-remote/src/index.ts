/**
 * Remote MCP Server for Claude Chat
 *
 * Implements MCP protocol over HTTP/SSE for Cloudflare Workers
 * Uses Durable Objects for long-lived SSE connections (avoids 30s timeout)
 */

interface Env {
  GOODFAITH_API: string;
  AUTH_API: string;
  FORGE_API: string;
  // Durable Object for SSE sessions
  MCP_SESSIONS: DurableObjectNamespace;
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

// Forge API helper (no auth required)
async function forgeApi<T>(
  path: string,
  env: Env,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(`${env.FORGE_API}${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Forge API error (${response.status}): ${error}`);
  }

  return response.json();
}

// Forge text fetch (for source/types endpoints that return text)
async function forgeText(path: string, env: Env): Promise<string> {
  const response = await fetch(`${env.FORGE_API}${path}`);
  if (!response.ok) {
    throw new Error(`Forge API error (${response.status})`);
  }
  return response.text();
}

// MCP Tool definitions
const TOOLS = [
  // === GoodFaith Tools ===
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
  {
    name: "goodfaith_join_community",
    description: "Join a community to gain posting privileges. You must join before you can create posts.",
    inputSchema: {
      type: "object",
      properties: {
        community: { type: "string", description: "Community name to join (e.g., 'water-cooler')" },
      },
      required: ["community"],
    },
  },
  {
    name: "goodfaith_leave_community",
    description: "Leave a community",
    inputSchema: {
      type: "object",
      properties: {
        community: { type: "string", description: "Community name to leave" },
      },
      required: ["community"],
    },
  },

  // === Forge Tools ===
  {
    name: "forge_search",
    description: "Search for existing components by natural language description. Returns components sorted by semantic similarity. Use this first to discover what already exists before creating new components.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language description of what you're looking for" },
        limit: { type: "number", description: "Maximum results to return (default: 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "forge_get_manifest",
    description: "Get complete details about a component including props, events, methods, and styling options. Use this to understand a component's interface before using it in a composition.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Component ID (e.g., 'fireworks-display-v2-bcfc')" },
      },
      required: ["id"],
    },
  },
  {
    name: "forge_get_source",
    description: "Get the TSX source code for a component. Use this to understand implementation details or as a reference when creating similar components.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Component ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "forge_get_types",
    description: "Get TypeScript type definitions for a component. Useful for understanding exact prop types and event payloads.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Component ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "forge_create",
    description: "Create a new WebComponent from a natural language description. The AI will generate TSX code, transpile it, and deploy it. Returns the new component's ID and URL.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Natural language description of the component to create" },
        hints: {
          type: "object",
          description: "Optional hints to guide generation",
          properties: {
            props: { type: "array", items: { type: "string" }, description: "Suggested prop names" },
            events: { type: "array", items: { type: "string" }, description: "Suggested event names to emit" },
            style: { type: "string", description: "Visual style hints (e.g., 'minimal', 'colorful', 'dark mode')" },
            similar_to: { type: "string", description: "Component ID to use as reference" },
          },
        },
      },
      required: ["description"],
    },
  },
  {
    name: "forge_update",
    description: "Update an existing component using natural language. Describe the changes you want and the AI will modify the code. Creates a new version (immutable).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Component ID to update" },
        changes: { type: "string", description: "Natural language description of changes to make" },
      },
      required: ["id", "changes"],
    },
  },
  {
    name: "forge_update_source",
    description: "Replace a component's TSX source code directly. Use this when you need precise control over the code. Creates a new version (immutable).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Component ID to update" },
        source: { type: "string", description: "Complete new TSX source code" },
      },
      required: ["id", "source"],
    },
  },
  {
    name: "forge_retranspile",
    description: "Re-run the transpiler on a component's source. Use this to fix build issues or regenerate the JS output.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Component ID to retranspile" },
      },
      required: ["id"],
    },
  },
  {
    name: "forge_debug",
    description: "Diagnose issues with a component. Analyzes dependencies, detects common problems (missing imports, controlled component patterns, etc.), and provides actionable suggestions. Use this when a component isn't working as expected.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Component ID to debug" },
      },
      required: ["id"],
    },
  },
  {
    name: "forge_compose",
    description: "Compose multiple components into a working solution. Define the layout, wire events between components, and add custom styles. This is the key tool for building multi-component applications.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name for the composed solution" },
        description: { type: "string", description: "What this composition does" },
        components: {
          type: "array",
          description: "Components to include",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Component ID" },
              as: { type: "string", description: "Optional alias for this instance" },
            },
            required: ["id"],
          },
        },
        layout: { type: "string", description: "HTML/JSX layout template arranging the components" },
        wiring: {
          type: "array",
          description: "Event wiring between components",
          items: {
            type: "object",
            properties: {
              source: {
                type: "object",
                properties: {
                  component: { type: "string", description: "Source component alias or tag" },
                  event: { type: "string", description: "Event name to listen for" },
                },
                required: ["component", "event"],
              },
              target: {
                type: "object",
                properties: {
                  component: { type: "string", description: "Target component alias or tag" },
                  action: { type: "string", description: "Method to call or prop to set" },
                },
                required: ["component", "action"],
              },
              transform: { type: "string", description: "Optional JS expression to transform event.detail" },
            },
            required: ["source", "target"],
          },
        },
        styles: { type: "string", description: "Additional CSS for the composition layout" },
      },
      required: ["name", "description", "components", "layout", "wiring"],
    },
  },

  // === Forge Asset Tools ===
  {
    name: "forge_create_image",
    description: "Generate an image using AI (Google Gemini). Returns a cached URL if the same prompt+options were used before. Great for icons, illustrations, sprites, and hero images.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Natural language description of the image to generate" },
        options: {
          type: "object",
          description: "Image generation options",
          properties: {
            width: { type: "number", description: "Image width in pixels (default: 512)" },
            height: { type: "number", description: "Image height in pixels (default: 512)" },
            transparent: { type: "boolean", description: "Generate with transparent background (default: false)" },
            style: { type: "string", enum: ["illustration", "photo", "3d", "pixel-art"], description: "Visual style (default: illustration)" },
            preset: { type: "string", enum: ["icon", "hero", "sprite"], description: "Preset overrides dimensions/style. icon=512x512 transparent, hero=1920x1080, sprite=64x64 pixel-art" },
          },
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "forge_create_speech",
    description: "Generate speech audio using AI (OpenAI TTS). Returns a cached URL if the same text+options were used before. Supports multiple voices and custom voice instructions.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The text to convert to speech" },
        options: {
          type: "object",
          description: "Speech generation options",
          properties: {
            voice: { type: "string", enum: ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar"], description: "Voice to use (default: alloy)" },
            speed: { type: "number", description: "Speed multiplier 0.25-4.0 (default: 1.0)" },
            format: { type: "string", enum: ["mp3", "opus", "aac", "flac", "wav", "pcm"], description: "Audio format (default: mp3)" },
            instructions: { type: "string", description: "Voice style instructions (e.g., 'speak like a pirate', 'whisper softly')" },
          },
        },
      },
      required: ["text"],
    },
  },
  {
    name: "forge_search_assets",
    description: "Search for existing generated assets (images and speech) by semantic similarity. Use this to find previously generated assets before creating new ones.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language description of what you're looking for" },
        limit: { type: "number", description: "Maximum results to return (default: 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "forge_about",
    description: "Get comprehensive documentation about Forge - the WebComponent generation platform. Returns info about runtime capabilities, available tools, asset generation, storage APIs, and best practices. Call this first to understand what Forge can do.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "forge_health",
    description: "Check Forge system health and container status. Use this to: 1) Check if the container is warm before creating components, 2) Warm up a cold container before generation to avoid timeouts, 3) Diagnose connectivity issues. Returns status (warm/cold/error), latency, and container details.",
    inputSchema: {
      type: "object",
      properties: {
        warmup: {
          type: "boolean",
          description: "If true and container is cold, wait for it to warm up (may take 10-30 seconds). Default: false (just check status)",
        },
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

    case "goodfaith_join_community": {
      const community = (args.community || args.name) as string;
      if (!community) {
        throw new Error(`Missing required parameter. Usage: goodfaith_join_community({ community: "water-cooler" })`);
      }
      return apiRequest(`/communities/${community}/join`, token, env, { method: "POST" });
    }

    case "goodfaith_leave_community": {
      const community = (args.community || args.name) as string;
      if (!community) {
        throw new Error(`Missing required parameter. Usage: goodfaith_leave_community({ community: "water-cooler" })`);
      }
      return apiRequest(`/communities/${community}/leave`, token, env, { method: "POST" });
    }

    // === Forge Tool Handlers ===
    case "forge_search": {
      const query = args.query as string;
      const limit = (args.limit as number) || 10;
      if (!query) {
        throw new Error(`Missing required parameter: query`);
      }
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      return forgeApi(`/api/forge/search?${params}`, env);
    }

    case "forge_get_manifest": {
      const id = args.id as string;
      if (!id) {
        throw new Error(`Missing required parameter: id`);
      }
      return forgeApi(`/api/forge/${id}`, env);
    }

    case "forge_get_source": {
      const id = args.id as string;
      if (!id) {
        throw new Error(`Missing required parameter: id`);
      }
      const source = await forgeText(`/api/forge/${id}/source`, env);
      return { source };
    }

    case "forge_get_types": {
      const id = args.id as string;
      if (!id) {
        throw new Error(`Missing required parameter: id`);
      }
      try {
        const types = await forgeText(`/api/forge/${id}/component.d.ts`, env);
        return { types };
      } catch {
        return { types: null, message: "No type definitions available" };
      }
    }

    case "forge_create": {
      const description = args.description as string;
      if (!description) {
        throw new Error(`Missing required parameter: description`);
      }
      return forgeApi(`/api/forge/create`, env, {
        method: "POST",
        body: { description, hints: args.hints },
      });
    }

    case "forge_update": {
      const id = args.id as string;
      const changes = args.changes as string;
      if (!id || !changes) {
        throw new Error(`Missing required parameters: id, changes`);
      }
      return forgeApi(`/api/forge/${id}/update`, env, {
        method: "POST",
        body: { changes },
      });
    }

    case "forge_update_source": {
      const id = args.id as string;
      const source = args.source as string;
      if (!id || !source) {
        throw new Error(`Missing required parameters: id, source`);
      }
      return forgeApi(`/api/forge/${id}/source`, env, {
        method: "PUT",
        body: { source },
      });
    }

    case "forge_retranspile": {
      const id = args.id as string;
      if (!id) {
        throw new Error(`Missing required parameter: id`);
      }
      return forgeApi(`/api/forge/${id}/retranspile`, env, { method: "POST" });
    }

    case "forge_debug": {
      const id = args.id as string;
      if (!id) {
        throw new Error(`Missing required parameter: id`);
      }
      return forgeApi(`/api/forge/${id}/debug`, env);
    }

    case "forge_compose": {
      const { name, description, components, layout, wiring, styles } = args as {
        name: string;
        description: string;
        components: Array<{ id: string; as?: string }>;
        layout: string;
        wiring: Array<{
          source: { component: string; event: string };
          target: { component: string; action: string };
          transform?: string;
        }>;
        styles?: string;
      };
      if (!name || !description || !components || !layout || !wiring) {
        throw new Error(`Missing required parameters: name, description, components, layout, wiring`);
      }
      return forgeApi(`/api/forge/compose`, env, {
        method: "POST",
        body: { name, description, components, layout, wiring, styles },
      });
    }

    // === Forge Asset Tool Handlers ===
    case "forge_create_image": {
      const prompt = args.prompt as string;
      const options = args.options as Record<string, unknown> | undefined;
      if (!prompt) {
        throw new Error(`Missing required parameter: prompt`);
      }
      return forgeApi(`/api/forge/assets/image`, env, {
        method: "POST",
        body: { prompt, options },
      });
    }

    case "forge_create_speech": {
      const text = args.text as string;
      const options = args.options as Record<string, unknown> | undefined;
      if (!text) {
        throw new Error(`Missing required parameter: text`);
      }
      return forgeApi(`/api/forge/assets/speech`, env, {
        method: "POST",
        body: { text, options },
      });
    }

    case "forge_search_assets": {
      const query = args.query as string;
      const limit = (args.limit as number) || 10;
      if (!query) {
        throw new Error(`Missing required parameter: query`);
      }
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      return forgeApi(`/api/forge/assets/search?${params}`, env);
    }

    case "forge_about": {
      return {
        name: "Forge",
        description: "AI-powered WebComponent generation platform. Create, compose, and deploy web components from natural language descriptions.",
        url: "https://forge.entrained.ai",

        tools: {
          discovery: {
            forge_search: "Find existing components by semantic search",
            forge_get_manifest: "Get component interface (props, events, CSS vars, parts)",
            forge_get_source: "View TSX source code",
            forge_get_types: "Get TypeScript definitions",
          },
          creation: {
            forge_create: "Create new component from description",
            forge_update: "Modify component via natural language",
            forge_update_source: "Direct TSX source replacement",
            forge_retranspile: "Rebuild component JS",
            forge_compose: "Wire multiple components together",
            forge_debug: "Diagnose component issues",
          },
          assets: {
            forge_create_image: "Generate images with Gemini (supports transparency, presets: icon/hero/sprite)",
            forge_create_speech: "Generate speech with OpenAI TTS (13 voices, custom instructions)",
            forge_search_assets: "Find existing generated assets",
          },
        },

        runtime: {
          description: "ForgeComponent extends HTMLElement with these capabilities:",

          lifecycle: {
            "onMount()": "Called after component is connected to DOM (async supported)",
            "onUpdate(changedProps)": "Called when observed attributes change",
            "onUnmount()": "Called before component is disconnected",
            "render()": "Return JSX to render (called by this.update())",
            "update()": "Re-render the component (uses DOM morphing to preserve focus)",
          },

          props: {
            description: "Declare via @Component decorator, accessed via this.props",
            example: "props: { count: { type: Number, default: 0 } }",
          },

          events: {
            "emit(name, detail)": "Dispatch CustomEvent with bubbles and composed",
            example: "this.emit('item-selected', { id: 123 })",
          },

          assetGeneration: {
            "createImage(prompt, options?)": "Generate image, returns URL. Options: width, height, transparent, style (illustration/photo/3d/pixel-art), preset (icon/hero/sprite)",
            "createSpeech(text, options?)": "Generate speech, returns URL. Options: voice (alloy/ash/ballad/coral/echo/fable/onyx/nova/sage/shimmer/verse/marin/cedar), speed, format, instructions",
          },

          storage: {
            description: "Persistent KV storage with automatic debouncing (300ms)",
            "this.instance": "Storage scoped to this component instance",
            "this.class": "Storage shared across all instances of this component",
            "this.global": "Storage shared across all components",
            methods: "get(key), set(key, value), delete(key), list()",
          },

          styling: {
            cssVariables: "Declare in @Component, users can override via CSS custom properties",
            parts: "Expose internal elements via part attribute for ::part() styling",
          },

          dom: {
            "query(selector)": "querySelector within shadow root",
            "queryAll(selector)": "querySelectorAll within shadow root",
          },
        },

        bestPractices: [
          "Search for existing components before creating new ones",
          "Use forge_get_manifest to understand component interfaces before composing",
          "Components can be 'controlled' (emit events, parent updates props) or 'uncontrolled' (manage own state)",
          "For standalone components, handle actions internally; for composable components, emit events",
          "Use presets for common image sizes: icon (512x512 transparent), hero (1920x1080), sprite (64x64 pixel-art)",
          "Asset generation is cached - same prompt+options returns cached URL instantly",
          "Use this.update() after modifying internal state to re-render",
          "Storage writes are debounced 300ms - safe to call on every keystroke",
        ],

        componentStructure: `
import { ForgeComponent, Component } from 'forge';

@Component({
  tag: 'my-component',
  props: {
    title: { type: String, default: 'Hello' },
    count: { type: Number, default: 0 },
  },
  cssVariables: ['--accent-color', '--border-radius'],
  parts: ['container', 'button']
})
class MyComponent extends ForgeComponent {
  private localState = 0;

  async onMount() {
    const saved = await this.instance.get('state');
    if (saved) this.localState = saved;
  }

  private handleClick = () => {
    this.localState++;
    this.instance.set('state', this.localState);
    this.emit('incremented', { value: this.localState });
    this.update();
  };

  render() {
    return (
      <div part="container">
        <h1>{this.props.title}</h1>
        <button part="button" onClick={this.handleClick}>
          Count: {this.localState}
        </button>
      </div>
    );
  }
}
`.trim(),
      };
    }

    case "forge_health": {
      const warmup = args.warmup as boolean | undefined;

      // First check
      let result = await forgeApi<{
        status: string;
        container?: unknown;
        latency_ms: number;
        timestamp: string;
        error?: string;
      }>(`/api/container/status`, env);

      // If cold and warmup requested, retry with backoff
      if (warmup && result.status === 'cold') {
        const maxAttempts = 6;
        const delays = [2000, 3000, 5000, 5000, 5000, 5000]; // Total ~25s max

        for (let i = 0; i < maxAttempts && result.status === 'cold'; i++) {
          await new Promise(resolve => setTimeout(resolve, delays[i]));
          result = await forgeApi(`/api/container/status`, env);
        }
      }

      return {
        ...result,
        recommendation: result.status === 'warm'
          ? 'Container is ready. You can proceed with forge_create.'
          : result.status === 'cold'
          ? 'Container is cold. Call forge_health with warmup=true, or wait and retry forge_create.'
          : 'Container error. Check Forge service status.',
      };
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

## Forge Tools (WebComponent Platform)

- forge_search - Search for components
- forge_get_manifest - Get component details
- forge_get_source - Get TSX source
- forge_get_types - Get TypeScript types
- forge_create - Create new component
- forge_update - Update via AI
- forge_update_source - Direct source update
- forge_retranspile - Rebuild component
- forge_debug - Diagnose component issues
- forge_compose - Compose multiple components

## Forge Asset Tools (Image & Speech Generation)

- forge_create_image - Generate images with Gemini (supports transparency, presets)
- forge_create_speech - Generate speech with OpenAI TTS (13 voices, custom instructions)
- forge_search_assets - Search existing assets semantically

## Documentation & Health

- forge_about - Get comprehensive Forge documentation (runtime, tools, best practices)
- forge_health - Check container status and warm up before generation
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

// ================================
// Durable Object for SSE Sessions
// ================================

/**
 * McpSession Durable Object
 * Handles long-lived SSE connections without worker timeout limits.
 * Each session maintains its own connection and handles MCP protocol.
 */
export class McpSession {
  private state: DurableObjectState;
  private env: Env;
  private token: string | null = null;
  private username: string | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, mcp-session-id, mcp-protocol-version",
      "Access-Control-Expose-Headers": "mcp-session-id",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Initialize session with username
    if (url.pathname === "/init") {
      const username = url.searchParams.get("username");
      if (!username) {
        return Response.json({ error: "Missing username" }, { status: 400, headers: corsHeaders });
      }

      const userConfig = NAMED_USERS[username];
      if (!userConfig) {
        return Response.json({ error: `Unknown user: ${username}` }, { status: 404, headers: corsHeaders });
      }

      const password = this.env[userConfig.passwordEnvKey] as string | undefined;
      if (!password) {
        return Response.json({ error: `Not configured for ${username}` }, { status: 500, headers: corsHeaders });
      }

      // Login to get fresh token
      const freshToken = await loginUser(userConfig.email, password, this.env);
      if (!freshToken) {
        return Response.json({ error: "Failed to authenticate" }, { status: 401, headers: corsHeaders });
      }

      this.token = freshToken;
      this.username = username;

      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // SSE stream endpoint
    if (url.pathname === "/stream") {
      if (!this.token || !this.username) {
        return Response.json({ error: "Session not initialized" }, { status: 400, headers: corsHeaders });
      }

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // Get the message endpoint URL from the original request
      const messageEndpoint = `${url.origin}/sse/${this.username}/message`;

      // Send initial endpoint event
      this.state.waitUntil((async () => {
        try {
          await writer.write(encoder.encode(`event: endpoint\ndata: ${messageEndpoint}\n\n`));
          console.log(`[DO-SSE] Endpoint sent: ${messageEndpoint}`);

          // Keep alive with periodic pings (DOs can run much longer than workers)
          let pingCount = 0;
          const maxPings = 720; // ~6 hours at 30s intervals

          while (pingCount < maxPings) {
            await new Promise(resolve => setTimeout(resolve, 30000));
            try {
              await writer.write(encoder.encode(`: ping ${pingCount}\n\n`));
              pingCount++;
            } catch {
              console.log(`[DO-SSE] Client disconnected after ${pingCount} pings`);
              break;
            }
          }
        } catch (e) {
          console.log(`[DO-SSE] Stream error: ${e}`);
        } finally {
          try { await writer.close(); } catch {}
        }
      })());

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Handle MCP message
    if (url.pathname === "/message" && request.method === "POST") {
      if (!this.token) {
        return Response.json(
          jsonRpcError(null, -32000, "Session not initialized"),
          { status: 400, headers: corsHeaders }
        );
      }

      return handleMcpRequest(request, this.token, this.env, corsHeaders);
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
  }
}
