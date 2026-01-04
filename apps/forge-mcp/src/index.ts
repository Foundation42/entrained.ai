#!/usr/bin/env node
/**
 * Forge MCP Server
 *
 * Enables AI agents to act as Component Architects - discovering, creating,
 * and composing WebComponents to build complete solutions.
 *
 * Design Philosophy:
 * - Conversational responses that help AI reason naturally
 * - Rich context in responses (not just raw data)
 * - Suggestions for next steps
 * - Clear explanations of what was found/created
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration
const FORGE_API_BASE = process.env.FORGE_API_BASE || "https://forge.entrained.ai";

// Types from SPEC.md
interface ForgeManifest {
  id: string;
  version: number;
  previous_version?: string;
  created_at: string;
  created_by?: string;
  model_used?: string;
  description: string;
  embedding?: number[];
  tags?: string[];
  type: "app" | "library";
  components: ComponentDef[];
  imports?: ImportDef[];
  css_variables?: CSSVarDef[];
  parts?: PartDef[];
  storage?: {
    instance: boolean;
    class: boolean;
    global: boolean;
  };
  compute: "light" | "medium" | "heavy";
  artifacts: {
    source_tsx: string;
    component_js: string;
    type_definitions?: string;
  };
  stats?: {
    uses: number;
    instances: number;
    last_used: string;
  };
}

interface ComponentDef {
  name: string;
  tag: string;
  exported: boolean;
  props: PropDef[];
  events?: EventDef[];
  methods?: MethodDef[];
}

interface PropDef {
  name: string;
  type: "String" | "Number" | "Boolean" | "Object" | "Array";
  default?: unknown;
  required: boolean;
  description?: string;
}

interface EventDef {
  name: string;
  detail_type?: string;
  description?: string;
}

interface MethodDef {
  name: string;
  params: Array<{ name: string; type: string }>;
  description?: string;
}

interface ImportDef {
  component_id: string;
  components: string[];
  url: string;
}

interface CSSVarDef {
  name: string;
  default: string;
  description?: string;
}

interface PartDef {
  name: string;
  description?: string;
}

interface SearchResult {
  id: string;
  tag: string;
  description: string;
  type: "app" | "library";
  version: number;
  similarity: number;
}

// Helper to make API calls
async function forgeApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${FORGE_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Forge API error (${response.status}): ${error}`);
  }

  return response.json();
}

// Format helpers for conversational responses
function formatProps(props: PropDef[]): string {
  if (!props.length) return "  (no props)";
  return props
    .map((p) => {
      const req = p.required ? " (required)" : "";
      const def = p.default !== undefined ? ` = ${JSON.stringify(p.default)}` : "";
      return `  - ${p.name}: ${p.type}${def}${req}${p.description ? ` - ${p.description}` : ""}`;
    })
    .join("\n");
}

function formatEvents(events?: EventDef[]): string {
  if (!events?.length) return "  (no events)";
  return events
    .map((e) => `  - ${e.name}${e.detail_type ? `: ${e.detail_type}` : ""}${e.description ? ` - ${e.description}` : ""}`)
    .join("\n");
}

function formatMethods(methods?: MethodDef[]): string {
  if (!methods?.length) return "  (no public methods)";
  return methods
    .map((m) => {
      const params = m.params.map((p) => `${p.name}: ${p.type}`).join(", ");
      return `  - ${m.name}(${params})${m.description ? ` - ${m.description}` : ""}`;
    })
    .join("\n");
}

function formatCSSVars(vars?: CSSVarDef[]): string {
  if (!vars?.length) return "  (no CSS variables)";
  return vars
    .map((v) => `  - ${v.name}: ${v.default}${v.description ? ` - ${v.description}` : ""}`)
    .join("\n");
}

function formatParts(parts?: PartDef[]): string {
  if (!parts?.length) return "  (no styleable parts)";
  return parts
    .map((p) => `  - ${p.name}${p.description ? ` - ${p.description}` : ""}`)
    .join("\n");
}

// Tool implementations
async function forgeSearch(query: string, limit: number = 10): Promise<string> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await forgeApi<{ query: string; results: SearchResult[]; total: number }>(
    `/api/forge/search?${params}`
  );
  const results = response.results;

  if (!results.length) {
    return `No components found matching "${query}".

This could mean:
1. No existing components match this intent
2. Try different keywords or a broader description

You might want to create a new component using forge_create if nothing suitable exists.`;
  }

  const formatted = results
    .map((r, i) => {
      const score = Math.round(r.similarity * 100);
      return `${i + 1}. ${r.tag} (${r.id})
   Type: ${r.type} | Version: ${r.version} | Match: ${score}%
   "${r.description}"`;
    })
    .join("\n\n");

  return `Found ${results.length} component${results.length > 1 ? "s" : ""} matching "${query}":

${formatted}

Next steps:
- Use forge_get_manifest to see full details (props, events, methods) for any component
- Use forge_get_source to view the TSX implementation
- High similarity scores (>80%) indicate strong matches to your intent`;
}

async function forgeGetManifest(id: string): Promise<string> {
  const entry = await forgeApi<{
    id: string;
    manifest: ForgeManifest;
    artifacts: { manifest_key: string; source_key: string; component_key: string };
  }>(`/api/forge/${id}`);

  const manifest = entry.manifest;
  const url = `${FORGE_API_BASE}/${id}`;
  const comp = manifest.components[0]; // Primary component
  const hasStorage = manifest.storage
    ? manifest.storage.instance || manifest.storage.class || manifest.storage.global
    : false;

  let response = `Component: ${comp.tag} (${manifest.id})
Type: ${manifest.type} | Version: ${manifest.version}
Description: ${manifest.description}
View: ${url}

Props:
${formatProps(comp.props)}

Events emitted:
${formatEvents(comp.events)}

Public methods:
${formatMethods(comp.methods)}

CSS Variables (for styling):
${formatCSSVars(manifest.css_variables)}

Styleable Parts:
${formatParts(manifest.parts)}`;

  if (hasStorage && manifest.storage) {
    const scopes = [];
    if (manifest.storage.instance) scopes.push("instance");
    if (manifest.storage.class) scopes.push("class");
    if (manifest.storage.global) scopes.push("global");
    response += `\n\nStorage: Uses ${scopes.join(", ")} storage`;
  }

  if (manifest.imports?.length) {
    response += `\n\nDependencies:`;
    manifest.imports.forEach((imp) => {
      response += `\n  - ${imp.component_id}: ${imp.components.join(", ")}`;
    });
  }

  response += `\n
Composition tips:
- Listen for events: ${comp.events?.map((e) => e.name).join(", ") || "none"}
- Call methods: ${comp.methods?.map((m) => m.name).join(", ") || "none"}
- Style with CSS vars or ::part() selectors`;

  return response;
}

async function forgeGetSource(id: string): Promise<string> {
  // Get source (returns raw text)
  const sourceUrl = `${FORGE_API_BASE}/api/forge/${id}/source`;
  const sourceResponse = await fetch(sourceUrl);
  if (!sourceResponse.ok) {
    throw new Error(`Failed to fetch source: ${sourceResponse.status}`);
  }
  const source = await sourceResponse.text();

  // Also get manifest for context
  const entry = await forgeApi<{ id: string; manifest: ForgeManifest }>(
    `/api/forge/${id}`
  );
  const manifest = entry.manifest;

  return `Source for ${manifest.components[0].tag} (${id}):

\`\`\`tsx
${source}
\`\`\`

This component:
- Tag: <${manifest.components[0].tag}>
- Type: ${manifest.type}
- Version: ${manifest.version}

You can modify this source using forge_update (natural language) or forge_update_source (direct edit).`;
}

async function forgeGetTypes(id: string): Promise<string> {
  // Types endpoint returns raw text
  const typesUrl = `${FORGE_API_BASE}/api/forge/${id}/component.d.ts`;
  const typesResponse = await fetch(typesUrl);
  if (!typesResponse.ok) {
    if (typesResponse.status === 404) {
      return `No TypeScript definitions available for ${id}.

This component may not have type definitions generated yet.
Use forge_retranspile to regenerate the component, which may create types.`;
    }
    throw new Error(`Failed to fetch types: ${typesResponse.status}`);
  }
  const types = await typesResponse.text();

  return `TypeScript definitions for ${id}:

\`\`\`typescript
${types}
\`\`\`

These types define the component's interface for TypeScript users.`;
}

async function forgeCreate(
  description: string,
  hints?: {
    props?: string[];
    events?: string[];
    style?: string;
    similar_to?: string;
  }
): Promise<string> {
  const { id, url, version, manifest } = await forgeApi<{
    id: string;
    url: string;
    version: number;
    manifest: ForgeManifest;
  }>("/api/forge/create", {
    method: "POST",
    body: JSON.stringify({ description, hints }),
  });

  const comp = manifest.components[0];

  return `Created new component: ${comp.tag}

ID: ${id}
Version: ${version}
View: ${url}

The component has:
- Props: ${comp.props.map((p) => p.name).join(", ") || "none"}
- Events: ${comp.events?.map((e) => e.name).join(", ") || "none"}
- CSS vars: ${manifest.css_variables?.map((v) => v.name).join(", ") || "none"}

Next steps:
- View it at ${url} to test
- Use forge_get_source to see the generated code
- Use forge_update to make changes with natural language
- Use forge_compose to wire it with other components`;
}

async function forgeUpdate(id: string, changes: string): Promise<string> {
  const { id: newId, url, version, previous_version } = await forgeApi<{
    id: string;
    url: string;
    version: number;
    previous_version: string;
  }>(`/api/forge/${id}/update`, {
    method: "POST",
    body: JSON.stringify({ changes }),
  });

  return `Updated component successfully!

New version: ${newId} (v${version})
Previous: ${previous_version}
View: ${url}

The changes "${changes}" have been applied.

Note: This created a new version - the original is unchanged (immutable versioning).
Use forge_get_source to see the updated code.`;
}

async function forgeUpdateSource(id: string, source: string): Promise<string> {
  const { id: newId, url, version } = await forgeApi<{
    id: string;
    url: string;
    version: number;
  }>(`/api/forge/${id}/source`, {
    method: "PUT",
    body: JSON.stringify({ source }),
  });

  return `Source updated successfully!

New version: ${newId} (v${version})
View: ${url}

The TSX source has been replaced and transpiled.
Note: This created a new version - the original is unchanged.`;
}

async function forgeRetranspile(id: string): Promise<string> {
  const { id: resultId, success, js_size } = await forgeApi<{
    id: string;
    success: boolean;
    js_size: number;
  }>(`/api/forge/${id}/retranspile`, {
    method: "POST",
  });

  if (success) {
    return `Retranspiled ${resultId} successfully!

Output size: ${js_size} bytes

The component has been rebuilt from its TSX source.
This can fix issues if the transpiled JS was corrupted or outdated.`;
  } else {
    return `Retranspile failed for ${resultId}.

The TSX source may have syntax errors. Use forge_get_source to inspect
and forge_update_source to fix any issues.`;
  }
}

async function forgeCompose(params: {
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
}): Promise<string> {
  const { id, url, bundle_url, manifest } = await forgeApi<{
    id: string;
    url: string;
    bundle_url: string;
    manifest: ForgeManifest;
  }>("/api/forge/compose", {
    method: "POST",
    body: JSON.stringify(params),
  });

  const componentList = params.components
    .map((c) => `  - ${c.id}${c.as ? ` as "${c.as}"` : ""}`)
    .join("\n");

  const wiringList = params.wiring
    .map(
      (w) =>
        `  - ${w.source.component}.${w.source.event} -> ${w.target.component}.${w.target.action}`
    )
    .join("\n");

  return `Composed new solution: ${params.name}

ID: ${id}
View: ${url}
Bundle: ${bundle_url}

Components used:
${componentList}

Event wiring:
${wiringList || "  (no wiring)"}

The composition is now live! Visit ${url} to see all components working together.

The bundle URL loads all component dependencies in a single request.`;
}

// Create and configure the MCP server
const server = new Server(
  {
    name: "forge-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // Discovery tools
    {
      name: "forge_search",
      description:
        "Search for existing components by natural language description. Returns components sorted by semantic similarity. Use this first to discover what already exists before creating new components.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language description of what you're looking for",
          },
          limit: {
            type: "number",
            description: "Maximum results to return (default: 10)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "forge_get_manifest",
      description:
        "Get complete details about a component including props, events, methods, and styling options. Use this to understand a component's interface before using it in a composition.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Component ID (e.g., 'fireworks-display-v2-bcfc')",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "forge_get_source",
      description:
        "Get the TSX source code for a component. Use this to understand implementation details or as a reference when creating similar components.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Component ID",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "forge_get_types",
      description:
        "Get TypeScript type definitions for a component. Useful for understanding exact prop types and event payloads.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Component ID",
          },
        },
        required: ["id"],
      },
    },

    // Creation tools
    {
      name: "forge_create",
      description:
        "Create a new WebComponent from a natural language description. The AI will generate TSX code, transpile it, and deploy it. Returns the new component's ID and URL.",
      inputSchema: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Natural language description of the component to create",
          },
          hints: {
            type: "object",
            description: "Optional hints to guide generation",
            properties: {
              props: {
                type: "array",
                items: { type: "string" },
                description: "Suggested prop names",
              },
              events: {
                type: "array",
                items: { type: "string" },
                description: "Suggested event names to emit",
              },
              style: {
                type: "string",
                description: "Visual style hints (e.g., 'minimal', 'colorful', 'dark mode')",
              },
              similar_to: {
                type: "string",
                description: "Component ID to use as reference",
              },
            },
          },
        },
        required: ["description"],
      },
    },
    {
      name: "forge_update",
      description:
        "Update an existing component using natural language. Describe the changes you want and the AI will modify the code. Creates a new version (immutable).",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Component ID to update",
          },
          changes: {
            type: "string",
            description: "Natural language description of changes to make",
          },
        },
        required: ["id", "changes"],
      },
    },
    {
      name: "forge_update_source",
      description:
        "Replace a component's TSX source code directly. Use this when you need precise control over the code. Creates a new version (immutable).",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Component ID to update",
          },
          source: {
            type: "string",
            description: "Complete new TSX source code",
          },
        },
        required: ["id", "source"],
      },
    },
    {
      name: "forge_retranspile",
      description:
        "Re-run the transpiler on a component's source. Use this to fix build issues or regenerate the JS output.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Component ID to retranspile",
          },
        },
        required: ["id"],
      },
    },

    // Composition tool
    {
      name: "forge_compose",
      description:
        "Compose multiple components into a working solution. Define the layout, wire events between components, and add custom styles. This is the key tool for building multi-component applications.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name for the composed solution",
          },
          description: {
            type: "string",
            description: "What this composition does",
          },
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
          layout: {
            type: "string",
            description: "HTML/JSX layout template arranging the components",
          },
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
                transform: {
                  type: "string",
                  description: "Optional JS expression to transform event.detail",
                },
              },
              required: ["source", "target"],
            },
          },
          styles: {
            type: "string",
            description: "Additional CSS for the composition layout",
          },
        },
        required: ["name", "description", "components", "layout", "wiring"],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;

    switch (name) {
      case "forge_search":
        result = await forgeSearch(
          args?.query as string,
          args?.limit as number | undefined
        );
        break;

      case "forge_get_manifest":
        result = await forgeGetManifest(args?.id as string);
        break;

      case "forge_get_source":
        result = await forgeGetSource(args?.id as string);
        break;

      case "forge_get_types":
        result = await forgeGetTypes(args?.id as string);
        break;

      case "forge_create":
        result = await forgeCreate(
          args?.description as string,
          args?.hints as {
            props?: string[];
            events?: string[];
            style?: string;
            similar_to?: string;
          }
        );
        break;

      case "forge_update":
        result = await forgeUpdate(args?.id as string, args?.changes as string);
        break;

      case "forge_update_source":
        result = await forgeUpdateSource(args?.id as string, args?.source as string);
        break;

      case "forge_retranspile":
        result = await forgeRetranspile(args?.id as string);
        break;

      case "forge_compose":
        result = await forgeCompose(args as {
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
        });
        break;

      default:
        result = `Unknown tool: ${name}`;
    }

    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${message}\n\nThis might mean:\n- The component ID doesn't exist\n- The Forge API is temporarily unavailable\n- There's a network issue\n\nTry forge_search to find valid component IDs.`,
        },
      ],
      isError: true,
    };
  }
});

// Register resources
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "forge://components",
      name: "Component List",
      description: "Browse all available Forge components",
      mimeType: "application/json",
    },
    {
      uri: "forge://stats",
      name: "Platform Stats",
      description: "Forge platform statistics and metrics",
      mimeType: "application/json",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "forge://components") {
    const components = await forgeApi<unknown[]>("/api/forge/components");
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(components, null, 2),
        },
      ],
    };
  }

  if (uri === "forge://stats") {
    const stats = await forgeApi<unknown>("/api/forge/stats");
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }

  // Handle component-specific URIs
  const componentMatch = uri.match(/^forge:\/\/component\/([^/]+)(\/(.+))?$/);
  if (componentMatch) {
    const [, id, , subpath] = componentMatch;
    let endpoint = `/api/forge/${id}`;
    if (subpath) endpoint += `/${subpath}`;

    const data = await forgeApi<unknown>(endpoint);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Forge MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
