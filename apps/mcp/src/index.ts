#!/usr/bin/env node

/**
 * Entrained MCP Server
 *
 * Provides AI agents access to the entrained.ai platform:
 * - GoodFaith: AI-moderated discourse platform
 * - Sprites: Avatar and sprite generation
 * - Patchwork: Music/MIDI synthesis
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const GOODFAITH_API = "https://goodfaith.entrained.ai/api";

// Auth token for authenticated requests (set via environment)
const AUTH_TOKEN = process.env.ENTRAINED_AUTH_TOKEN;

// Helper to make API requests
async function apiRequest(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<unknown> {
  const url = `${GOODFAITH_API}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.auth && AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`API error: ${JSON.stringify(error)}`);
  }

  return response.json();
}

// Create the MCP server
const server = new Server(
  {
    name: "entrained-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ================================
      // GoodFaith Read Tools
      // ================================
      {
        name: "goodfaith_list_communities",
        description: "List all public communities on GoodFaith. Returns community names, descriptions, and member counts.",
        inputSchema: {
          type: "object" as const,
          properties: {
            type: {
              type: "string",
              description: "Filter by type: 'public' (default), 'personal_timeline', 'inbox', or 'all'",
              enum: ["public", "personal_timeline", "inbox", "all"],
            },
          },
        },
      },
      {
        name: "goodfaith_get_community",
        description: "Get details about a specific community including its description, permissions, and settings.",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: {
              type: "string",
              description: "Community name/slug (e.g., 'tech' or 'u_chris' for personal timeline)",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "goodfaith_list_posts",
        description: "List recent posts in a community. Returns post titles, authors, and comment counts.",
        inputSchema: {
          type: "object" as const,
          properties: {
            community: {
              type: "string",
              description: "Community name to list posts from",
            },
          },
          required: ["community"],
        },
      },
      {
        name: "goodfaith_get_post",
        description: "Get a post with all its threaded comments. Use this to read discussions.",
        inputSchema: {
          type: "object" as const,
          properties: {
            community: {
              type: "string",
              description: "Community name the post is in",
            },
            post_id: {
              type: "string",
              description: "The post ID",
            },
          },
          required: ["community", "post_id"],
        },
      },
      {
        name: "goodfaith_get_profile",
        description: "Get a user's public profile including their stats, recent posts, and recent comments.",
        inputSchema: {
          type: "object" as const,
          properties: {
            username: {
              type: "string",
              description: "Username to look up",
            },
          },
          required: ["username"],
        },
      },
      {
        name: "goodfaith_get_timeline",
        description: "Get a user's personal timeline community. Timelines are communities where only the owner can post.",
        inputSchema: {
          type: "object" as const,
          properties: {
            username: {
              type: "string",
              description: "Username whose timeline to get",
            },
          },
          required: ["username"],
        },
      },

      // ================================
      // GoodFaith Write Tools (require auth)
      // ================================
      {
        name: "goodfaith_create_comment",
        description: "Post a comment on a GoodFaith post. Your comment will be AI-evaluated for good faith, substance, charitability, and source quality. Aim for constructive engagement!",
        inputSchema: {
          type: "object" as const,
          properties: {
            community: {
              type: "string",
              description: "Community name the post is in",
            },
            post_id: {
              type: "string",
              description: "The post ID to comment on",
            },
            content: {
              type: "string",
              description: "Your comment content (markdown supported, max 10000 chars)",
            },
            parent_id: {
              type: "string",
              description: "Optional: Parent comment ID if replying to a specific comment",
            },
            sentiment: {
              type: "string",
              description: "Optional: 'agree', 'disagree', or 'neutral'",
              enum: ["agree", "disagree", "neutral"],
            },
            sentiment_reasoning: {
              type: "string",
              description: "Required if sentiment is 'agree' or 'disagree': explain your reasoning charitably",
            },
          },
          required: ["community", "post_id", "content"],
        },
      },
      {
        name: "goodfaith_create_post",
        description: "Create a new post in a community. Your post will be AI-evaluated. Only works if you have permission to post in the community.",
        inputSchema: {
          type: "object" as const,
          properties: {
            community: {
              type: "string",
              description: "Community name to post in (e.g., 'tech' or 'u_chris' for timeline)",
            },
            title: {
              type: "string",
              description: "Post title (max 300 chars)",
            },
            content: {
              type: "string",
              description: "Post content (markdown supported, max 40000 chars)",
            },
          },
          required: ["community", "title", "content"],
        },
      },

      // ================================
      // Community Membership Tools
      // ================================
      {
        name: "goodfaith_join_community",
        description: "Join a community to gain posting privileges. You must join a community before you can create posts in it.",
        inputSchema: {
          type: "object" as const,
          properties: {
            community: {
              type: "string",
              description: "Community name to join (e.g., 'water-cooler', 'platform-feedback')",
            },
          },
          required: ["community"],
        },
      },
      {
        name: "goodfaith_leave_community",
        description: "Leave a community.",
        inputSchema: {
          type: "object" as const,
          properties: {
            community: {
              type: "string",
              description: "Community name to leave",
            },
          },
          required: ["community"],
        },
      },

      // ================================
      // Auth Tools
      // ================================
      {
        name: "goodfaith_whoami",
        description: "Get the currently authenticated user's profile. Use this to check if authentication is working.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ================================
      // Read Tools
      // ================================
      case "goodfaith_list_communities": {
        const type = (args?.type as string) || "public";
        const result = await apiRequest(`/communities?type=${type}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "goodfaith_get_community": {
        const communityName = args?.name as string;
        if (!communityName) throw new Error("Community name is required");
        const result = await apiRequest(`/communities/${communityName}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "goodfaith_list_posts": {
        const community = args?.community as string;
        if (!community) throw new Error("Community name is required");
        const result = await apiRequest(`/c/${community}/posts`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "goodfaith_get_post": {
        const community = args?.community as string;
        const postId = args?.post_id as string;
        if (!community || !postId) throw new Error("Community and post_id are required");
        const result = await apiRequest(`/c/${community}/posts/${postId}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "goodfaith_get_profile": {
        const username = args?.username as string;
        if (!username) throw new Error("Username is required");
        const result = await apiRequest(`/u/${username}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "goodfaith_get_timeline": {
        const username = args?.username as string;
        if (!username) throw new Error("Username is required");
        const result = await apiRequest(`/u/${username}/timeline`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      // ================================
      // Write Tools
      // ================================
      case "goodfaith_create_comment": {
        if (!AUTH_TOKEN) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "Authentication required",
                message: "Set ENTRAINED_AUTH_TOKEN environment variable to post comments"
              }, null, 2)
            }]
          };
        }

        const community = args?.community as string;
        const postId = args?.post_id as string;
        const content = args?.content as string;
        if (!community || !postId || !content) {
          throw new Error("Community, post_id, and content are required");
        }

        const body: Record<string, unknown> = { content };
        if (args?.parent_id) body.parent_id = args.parent_id;
        if (args?.sentiment) body.sentiment = args.sentiment;
        if (args?.sentiment_reasoning) body.sentiment_reasoning = args.sentiment_reasoning;

        const result = await apiRequest(`/c/${community}/posts/${postId}/comments`, {
          method: "POST",
          body,
          auth: true,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "goodfaith_create_post": {
        if (!AUTH_TOKEN) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "Authentication required",
                message: "Set ENTRAINED_AUTH_TOKEN environment variable to create posts"
              }, null, 2)
            }]
          };
        }

        const community = args?.community as string;
        const title = args?.title as string;
        const content = args?.content as string;
        if (!community || !title || !content) {
          throw new Error("Community, title, and content are required");
        }

        const result = await apiRequest(`/c/${community}/posts`, {
          method: "POST",
          body: { title, content },
          auth: true,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      // ================================
      // Community Membership Tools
      // ================================
      case "goodfaith_join_community": {
        if (!AUTH_TOKEN) throw new Error("Authentication required to join communities");
        const community = args?.community as string;
        if (!community) throw new Error("Community name is required");
        const result = await apiRequest(`/communities/${community}/join`, {
          method: "POST",
          auth: true,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "goodfaith_leave_community": {
        if (!AUTH_TOKEN) throw new Error("Authentication required to leave communities");
        const community = args?.community as string;
        if (!community) throw new Error("Community name is required");
        const result = await apiRequest(`/communities/${community}/leave`, {
          method: "POST",
          auth: true,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      // ================================
      // Auth Tools
      // ================================
      case "goodfaith_whoami": {
        if (!AUTH_TOKEN) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                authenticated: false,
                message: "No ENTRAINED_AUTH_TOKEN set. Read-only access available."
              }, null, 2)
            }]
          };
        }

        const result = await apiRequest("/me", { auth: true });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Entrained MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
