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
    description: "Search for existing components by natural language description. Returns components sorted by semantic similarity. ALWAYS search first before creating - reuse existing components when possible!",
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
    description: `Create a new React component from a natural language description. Returns EVERYTHING you need:

- id: Component identifier
- preview_url: LIVE PREVIEW with rendered component + CSS + demo props (open this to see it!)
- css.id: Auto-generated stylesheet matching the component's classes
- props: Component's prop definitions
- css_classes: CSS class names used

EXTERNAL LIBRARIES SUPPORTED: You can use Three.js, D3, Chart.js, GSAP, Plotly, Tone.js, P5.js, Anime.js, Fabric.js, Konva, Leaflet, Mapbox, Lodash, Axios, and more! Just import them normally - they're automatically loaded from CDN (e.g., import * as THREE from 'three', import { gsap } from 'gsap').

The preview_url is immediately viewable - no need to forge_compose for single components!`,
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
        references: {
          type: "array",
          description: "Reference material for AI context (design systems, example components, guidelines)",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["component", "css", "guidelines", "image"], description: "Reference type" },
              id: { type: "string", description: "Component ID (for component/css types)" },
              content: { type: "string", description: "Inline content (for css/guidelines types)" },
              url: { type: "string", description: "Image URL (for image type)" },
              use: { type: "string", enum: ["style", "behavior", "both"], description: "What to take from a component reference" },
              description: { type: "string", description: "Description of what to take from an image reference" },
            },
            required: ["type"],
          },
        },
      },
      required: ["description"],
    },
  },
  {
    name: "forge_update",
    description: `Update an existing component using natural language. Describe the changes you want and the AI will modify the code. Creates a new version (immutable).

Returns preview_url, css, and updated metadata - no need to forge_compose after updating!`,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Component ID to update" },
        changes: { type: "string", description: "Natural language description of changes to make" },
        style: { type: "string", description: "Optional style hints for CSS generation" },
        references: {
          type: "array",
          description: "Reference material for AI context (design systems, example components, guidelines)",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["component", "css", "guidelines", "image"], description: "Reference type" },
              id: { type: "string", description: "Component ID (for component/css types)" },
              content: { type: "string", description: "Inline content (for css/guidelines types)" },
              url: { type: "string", description: "Image URL (for image type)" },
              use: { type: "string", enum: ["style", "behavior", "both"], description: "What to take from a component reference" },
              description: { type: "string", description: "Description of what to take from an image reference" },
            },
            required: ["type"],
          },
        },
      },
      required: ["id", "changes"],
    },
  },
  {
    name: "forge_update_source",
    description: `Replace or patch a component's source code directly. Two modes:

1. **Full replacement**: Provide \`source\` with complete new code
2. **Patch mode**: Provide \`edits\` array with search/replace operations (more efficient!)

Patch format: \`edits: [{ old: "text to find", new: "replacement" }, ...]\`
Each "old" string must be unique in the source.

Returns preview_url, css, and extracted metadata - no need to forge_compose after updating!`,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Component ID to update" },
        source: { type: "string", description: "Complete new source code (full replacement mode)" },
        edits: {
          type: "array",
          description: "Array of search/replace edits (patch mode - more efficient!)",
          items: {
            type: "object",
            properties: {
              old: { type: "string", description: "Text to find (must be unique)" },
              new: { type: "string", description: "Replacement text" },
            },
            required: ["old", "new"],
          },
        },
        style: { type: "string", description: "Optional style hints for CSS generation" },
      },
      required: ["id"],
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
    name: "forge_upload",
    description: `Upload raw source code directly WITHOUT using AI generation. Perfect for when YOU (Claude) write the code yourself!

The metadata (props, css_classes, exports, demo_props) is automatically extracted from your source code.

Returns:
- id: Component identifier
- preview_url: LIVE PREVIEW with rendered component
- css: Auto-generated CSS matching your class names (uses AI for CSS only)
- Extracted metadata from your code

Options:
- generate_css: true (default) - Generate CSS for your css classes
- generate_preview: true (default) - Create preview bundle
- style: Style hints for CSS generation (e.g., "dark mode", "minimalist")

Use this when you want to write the TSX yourself instead of having forge_create's AI do it.`,
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Your TSX/JSX/CSS source code" },
        file_type: { type: "string", description: "File type: tsx, jsx, ts, js, css" },
        name: { type: "string", description: "Optional component name (extracted from source if not provided)" },
        description: { type: "string", description: "Optional description" },
        generate_css: { type: "boolean", description: "Generate CSS for TSX components (default: true)" },
        generate_preview: { type: "boolean", description: "Generate preview bundle (default: true)" },
        style: { type: "string", description: "Style hints for CSS generation" },
      },
      required: ["source", "file_type"],
    },
  },
  {
    name: "forge_upload_update",
    description: `Update an existing component with new raw source code. Creates a new version with metadata extracted from the source.

Like forge_upload but for updates. Use this when you want to directly replace the source of an existing component with your own code.`,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Component ID to update" },
        source: { type: "string", description: "New TSX/JSX/CSS source code" },
        description: { type: "string", description: "Optional new description" },
        generate_css: { type: "boolean", description: "Generate CSS for TSX components (default: true)" },
        generate_preview: { type: "boolean", description: "Generate preview bundle (default: true)" },
        style: { type: "string", description: "Style hints for CSS generation" },
      },
      required: ["id", "source"],
    },
  },
  {
    name: "forge_publish",
    description: `Publish a component's draft to create a new immutable version. After publishing, the component becomes searchable via forge_search.

Use this after iterating on a draft with forge_create/forge_update to make it discoverable.

Returns the new version number, semver, and confirms the component is now searchable.`,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Component ID to publish" },
        changelog: { type: "string", description: "Optional description of changes in this version" },
        bump: { type: "string", enum: ["major", "minor", "patch"], description: "Semantic version bump type (default: patch)" },
      },
      required: ["id"],
    },
  },
  {
    name: "forge_compose",
    description: `Bundle MULTIPLE components into a single HTML application. Use this when you need to combine 2+ components together.

NOTE: For SINGLE components, just use forge_create - it already returns a preview_url!

Use forge_compose when:
- Combining multiple components (e.g., header + gallery + footer)
- Adding custom layout/arrangement
- Including generated images or speech assets

Returns a content_url with the bundled app.`,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name for the composed solution" },
        description: { type: "string", description: "What this composition does" },
        components: {
          type: "array",
          description: "Components to include (by ID)",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Component/file ID to include" },
            },
            required: ["id"],
          },
        },
        layout: { type: "string", description: "Optional HTML body template arranging the components" },
        styles: { type: "string", description: "Additional CSS for the composition layout" },
      },
      required: ["name", "description", "components"],
    },
  },

  // === Forge Asset Tools ===
  {
    name: "forge_create_image",
    description: `Generate an AI image (Google Gemini). Returns a permanent URL you can use in components.

Presets (recommended):
- preset: "icon" → 512x512 transparent PNG (perfect for logos/icons)
- preset: "hero" → 1920x1080 (landing pages, headers)
- preset: "sprite" → 64x64 pixel-art (games)

Or customize: width, height, style (illustration/photo/3d/pixel-art), transparent.

Images are cached - same prompt returns same URL instantly.`,
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
    description: `Generate AI speech audio (OpenAI TTS). Returns a permanent URL you can use in components.

Popular voices: nova (warm female), onyx (deep male), alloy (neutral), shimmer (expressive)

Use 'instructions' for style: "speak slowly and calmly", "excited and energetic", "whisper mysteriously"

Audio is cached - same text+options returns same URL instantly.`,
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
    description: `Get comprehensive Forge documentation. Call this FIRST if you're unsure how Forge works!

Returns:
- Quick start workflow (search → create → preview)
- All tool descriptions with examples
- Asset generation (images, speech)
- Best practices and tips
- Common patterns

The documentation is thorough - read it to understand the full platform capabilities.`,
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
  {
    name: "forge_review",
    description: `Get an AI code review for a component. Ask questions about the implementation, request feedback on specific code sections, or get suggestions for improvements.

Examples:
- "Review the back-face culling implementation"
- "Is this animation loop efficient?"
- "Check for memory leaks in the useEffect cleanup"
- "Suggest improvements for accessibility"

Returns detailed AI analysis and suggestions.`,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Component ID to review" },
        question: { type: "string", description: "What to review or ask about the code" },
      },
      required: ["id", "question"],
    },
  },

  // === Forge Instance Tools (Social Magnetics) ===
  {
    name: "forge_instance_create",
    description: `Create a new instance of a component. Instances are living, mutable deployments of components.

This enables "Social Magnetics" - UI components placed in physical space that receive state and are orchestrated by AI.

Returns the instance with a live URL where the component is rendered with its current props.`,
    inputSchema: {
      type: "object",
      properties: {
        component_id: { type: "string", description: "ID of the component to instantiate" },
        name: { type: "string", description: "Human-readable name for this instance" },
        props: {
          type: "object",
          description: "Initial props to pass to the component",
          additionalProperties: true,
        },
        placement: {
          type: "object",
          description: "Physical/logical placement information",
          properties: {
            location: { type: "string", description: "Logical location identifier (e.g., 'downtown-arcade')" },
            device: { type: "string", description: "Device identifier (e.g., 'kiosk-42')" },
            geo: {
              type: "object",
              description: "Geographic coordinates",
              properties: {
                lat: { type: "number", description: "Latitude" },
                lng: { type: "number", description: "Longitude" },
              },
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Searchable tags (e.g., ['transit', 'outdoor'])"
            },
          },
        },
        visibility: { type: "string", enum: ["private", "public", "unlisted"], description: "Visibility level (default: private)" },
      },
      required: ["component_id"],
    },
  },
  {
    name: "forge_instance_get",
    description: "Get an instance by ID, including its current props and live URL.",
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "Instance ID (e.g., 'inst-abc123')" },
      },
      required: ["instance_id"],
    },
  },
  {
    name: "forge_instance_list",
    description: "List instances with optional filtering by component, location, or tags.",
    inputSchema: {
      type: "object",
      properties: {
        component_id: { type: "string", description: "Filter by component ID" },
        location: { type: "string", description: "Filter by location" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags (instances with ANY of these tags)"
        },
        visibility: { type: "string", enum: ["private", "public", "unlisted"], description: "Filter by visibility" },
        limit: { type: "number", description: "Maximum results (default: 50)" },
      },
    },
  },
  {
    name: "forge_instance_update_props",
    description: `Update instance props WITHOUT regenerating the component. This is the key capability!

Props are merged with existing props (partial update). To replace all props, use forge_instance_replace_props.

The live URL will immediately reflect the new props.`,
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "Instance ID" },
        props: {
          type: "object",
          description: "Props to merge with existing props",
          additionalProperties: true,
        },
      },
      required: ["instance_id", "props"],
    },
  },
  {
    name: "forge_instance_replace_props",
    description: "Replace ALL instance props. Use this to completely reset the props.",
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "Instance ID" },
        props: {
          type: "object",
          description: "New props (replaces all existing props)",
          additionalProperties: true,
        },
      },
      required: ["instance_id", "props"],
    },
  },
  {
    name: "forge_instance_delete",
    description: "Delete an instance.",
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "Instance ID to delete" },
      },
      required: ["instance_id"],
    },
  },
  {
    name: "forge_instance_bulk_update",
    description: `Update props for multiple instances at once. Useful for orchestrating many displays.

Requires at least one filter (component_id, location, tags, or visibility) to prevent accidental mass updates.`,
    inputSchema: {
      type: "object",
      properties: {
        component_id: { type: "string", description: "Filter by component ID" },
        location: { type: "string", description: "Filter by location" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags"
        },
        visibility: { type: "string", enum: ["private", "public", "unlisted"], description: "Filter by visibility" },
        props: {
          type: "object",
          description: "Props to apply to all matching instances",
          additionalProperties: true,
        },
      },
      required: ["props"],
    },
  },
  {
    name: "forge_instance_get_bindings",
    description: "Get the current bindings configuration for an instance. Bindings connect props to live data sources.",
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "Instance ID" },
      },
      required: ["instance_id"],
    },
  },
  {
    name: "forge_instance_set_bindings",
    description: `Set bindings for an instance. Bindings connect props to live data sources (KV, APIs, etc.).

Binding sources:
- static: A fixed value (path contains the value itself)
- kv: CloudFlare KV namespace key (path = "namespace:key")
- api: External HTTP API (path = URL that returns JSON)

Binding strategies:
- poll: Refresh on interval (set interval in seconds)
- (future: sse, webhook for real-time updates)

Example bindings:
{
  "notices": {
    "source": "kv",
    "path": "notices:surbiton-board",
    "strategy": { "type": "poll", "interval": 60 }
  },
  "weather": {
    "source": "api",
    "path": "https://api.weather.com/current",
    "strategy": { "type": "poll", "interval": 300 }
  }
}`,
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "Instance ID" },
        bindings: {
          type: "object",
          description: "Bindings configuration (propName -> binding)",
          additionalProperties: {
            type: "object",
            properties: {
              source: { type: "string", enum: ["static", "kv", "api", "do"], description: "Data source type" },
              path: { type: "string", description: "Source path (KV key, API URL, etc.)" },
              strategy: {
                type: "object",
                description: "Refresh strategy",
                properties: {
                  type: { type: "string", enum: ["poll", "sse", "webhook"], description: "Strategy type" },
                  interval: { type: "number", description: "Poll interval in seconds (for poll strategy)" },
                },
              },
            },
            required: ["source", "path"],
          },
        },
      },
      required: ["instance_id", "bindings"],
    },
  },
  {
    name: "forge_instance_get_resolved",
    description: `Get the resolved props for an instance. This returns static props MERGED with data fetched from bindings.

Use this to see what the component will actually receive - the combination of static props and live binding data.

Returns:
- props: The fully resolved props
- bindings: The bindings configuration
- resolved_at: Timestamp of resolution`,
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "Instance ID" },
      },
      required: ["instance_id"],
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
        body: { description, hints: args.hints, references: args.references },
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
        body: { changes, style: args.style, references: args.references },
      });
    }

    case "forge_update_source": {
      const id = args.id as string;
      const source = args.source as string | undefined;
      const edits = args.edits as Array<{ old: string; new: string }> | undefined;

      if (!id) {
        throw new Error(`Missing required parameter: id`);
      }
      if (!source && !edits) {
        throw new Error(`Either source or edits is required`);
      }
      if (source && edits) {
        throw new Error(`Provide either source or edits, not both`);
      }

      return forgeApi(`/api/forge/${id}/source`, env, {
        method: "PUT",
        body: { source, edits, style: args.style },
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

    case "forge_upload": {
      const source = args.source as string;
      const file_type = args.file_type as string;
      if (!source || !file_type) {
        throw new Error(`Missing required parameters: source, file_type`);
      }
      return forgeApi(`/api/forge/upload`, env, {
        method: "POST",
        body: {
          source,
          file_type,
          name: args.name,
          description: args.description,
          generate_css: args.generate_css,
          generate_preview: args.generate_preview,
          style: args.style,
        },
      });
    }

    case "forge_upload_update": {
      const id = args.id as string;
      const source = args.source as string;
      if (!id || !source) {
        throw new Error(`Missing required parameters: id, source`);
      }
      return forgeApi(`/api/forge/upload/${id}`, env, {
        method: "PUT",
        body: {
          source,
          description: args.description,
          generate_css: args.generate_css,
          generate_preview: args.generate_preview,
          style: args.style,
        },
      });
    }

    case "forge_publish": {
      const id = args.id as string;
      if (!id) {
        throw new Error(`Missing required parameter: id`);
      }
      return forgeApi(`/api/forge/${id}/publish`, env, {
        method: "POST",
        body: {
          changelog: args.changelog,
          bump: args.bump,
        },
      });
    }

    case "forge_compose": {
      const { name, description, components, layout, styles } = args as {
        name: string;
        description: string;
        components: Array<{ id: string }>;
        layout?: string;
        styles?: string;
      };
      if (!name || !description || !components) {
        throw new Error(`Missing required parameters: name, description, components`);
      }
      return forgeApi(`/api/forge/compose`, env, {
        method: "POST",
        body: { name, description, components, layout, styles },
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
      // Fetch documentation from forge2 API
      return forgeApi(`/api/forge/about`, env);
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

    case "forge_review": {
      const id = args.id as string;
      const question = args.question as string;
      if (!id || !question) {
        throw new Error(`Missing required parameters: id, question`);
      }
      return forgeApi(`/api/forge/${id}/review`, env, {
        method: "POST",
        body: { question },
      });
    }

    // === Forge Instance Tool Handlers ===
    case "forge_instance_create": {
      const component_id = args.component_id as string;
      if (!component_id) {
        throw new Error(`Missing required parameter: component_id`);
      }
      return forgeApi(`/api/instances`, env, {
        method: "POST",
        body: {
          component_id,
          name: args.name,
          props: args.props,
          placement: args.placement,
          visibility: args.visibility,
        },
      });
    }

    case "forge_instance_get": {
      const instance_id = args.instance_id as string;
      if (!instance_id) {
        throw new Error(`Missing required parameter: instance_id`);
      }
      return forgeApi(`/api/instances/${instance_id}`, env);
    }

    case "forge_instance_list": {
      const params = new URLSearchParams();
      if (args.component_id) params.set("component_id", args.component_id as string);
      if (args.location) params.set("location", args.location as string);
      if (args.tags) params.set("tags", (args.tags as string[]).join(","));
      if (args.visibility) params.set("visibility", args.visibility as string);
      if (args.limit) params.set("limit", String(args.limit));
      const query = params.toString();
      return forgeApi(`/api/instances${query ? `?${query}` : ""}`, env);
    }

    case "forge_instance_update_props": {
      const instance_id = args.instance_id as string;
      const props = args.props as Record<string, unknown>;
      if (!instance_id || !props) {
        throw new Error(`Missing required parameters: instance_id, props`);
      }
      return forgeApi(`/api/instances/${instance_id}/props`, env, {
        method: "PATCH",
        body: props,
      });
    }

    case "forge_instance_replace_props": {
      const instance_id = args.instance_id as string;
      const props = args.props as Record<string, unknown>;
      if (!instance_id || !props) {
        throw new Error(`Missing required parameters: instance_id, props`);
      }
      return forgeApi(`/api/instances/${instance_id}/props`, env, {
        method: "PUT",
        body: props,
      });
    }

    case "forge_instance_delete": {
      const instance_id = args.instance_id as string;
      if (!instance_id) {
        throw new Error(`Missing required parameter: instance_id`);
      }
      return forgeApi(`/api/instances/${instance_id}`, env, {
        method: "DELETE",
      });
    }

    case "forge_instance_bulk_update": {
      const props = args.props as Record<string, unknown>;
      if (!props) {
        throw new Error(`Missing required parameter: props`);
      }
      const params = new URLSearchParams();
      if (args.component_id) params.set("component_id", args.component_id as string);
      if (args.location) params.set("location", args.location as string);
      if (args.tags) params.set("tags", (args.tags as string[]).join(","));
      if (args.visibility) params.set("visibility", args.visibility as string);
      const query = params.toString();
      if (!query) {
        throw new Error(`At least one filter required: component_id, location, tags, or visibility`);
      }
      return forgeApi(`/api/instances/bulk?${query}`, env, {
        method: "PATCH",
        body: { props },
      });
    }

    case "forge_instance_get_bindings": {
      const instance_id = args.instance_id as string;
      if (!instance_id) {
        throw new Error(`Missing required parameter: instance_id`);
      }
      return forgeApi(`/api/instances/${instance_id}/bindings`, env);
    }

    case "forge_instance_set_bindings": {
      const instance_id = args.instance_id as string;
      const bindings = args.bindings as Record<string, unknown>;
      if (!instance_id || !bindings) {
        throw new Error(`Missing required parameters: instance_id, bindings`);
      }
      return forgeApi(`/api/instances/${instance_id}/bindings`, env, {
        method: "PUT",
        body: bindings,
      });
    }

    case "forge_instance_get_resolved": {
      const instance_id = args.instance_id as string;
      if (!instance_id) {
        throw new Error(`Missing required parameter: instance_id`);
      }
      return forgeApi(`/api/instances/${instance_id}/resolved`, env);
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

- forge_search - Search for PUBLISHED components
- forge_get_manifest - Get component details
- forge_get_source - Get TSX source
- forge_get_types - Get TypeScript types
- forge_create - Create new component DRAFT (AI-generated)
- forge_upload - Upload raw source (no AI, metadata auto-extracted)
- forge_update - Update draft via AI
- forge_update_source - Direct source update
- forge_upload_update - Update with raw source (no AI)
- forge_publish - Publish draft to make it searchable (with changelog + semver)
- forge_retranspile - Rebuild component
- forge_debug - Diagnose component issues
- forge_review - Get AI code review for a component
- forge_compose - Compose multiple components

## Forge Asset Tools (Image & Speech Generation)

- forge_create_image - Generate images with Gemini (supports transparency, presets)
- forge_create_speech - Generate speech with OpenAI TTS (13 voices, custom instructions)
- forge_search_assets - Search existing assets semantically

## Forge Instance Tools (Social Magnetics)

- forge_instance_create - Create a living instance of a component
- forge_instance_get - Get instance with current props and live URL
- forge_instance_list - List instances with filtering
- forge_instance_update_props - Update props WITHOUT regeneration (key capability!)
- forge_instance_replace_props - Replace all props
- forge_instance_delete - Delete an instance
- forge_instance_bulk_update - Update props across many instances at once
- forge_instance_get_bindings - Get current bindings configuration
- forge_instance_set_bindings - Connect props to live data sources (KV, APIs)
- forge_instance_get_resolved - Get props with bindings resolved

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
