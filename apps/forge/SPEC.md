# Forge Specification

Forge is a platform for creating, discovering, and deploying WebComponents through natural language conversation. It follows the same architectural pattern as Prometheus but targets UI component creation instead of WASM compilation.

## Core Philosophy

- **Zero friction**: No permissions, configs, or boilerplate needed to create
- **Immutable versioning**: Updates create new versions, never mutate
- **Composability**: Flat component universe following Metcalfe's law (value = n²)
- **Simple to complex**: Start with a single component, decompose as needed
- **TSX source**: Familiar syntax that transpiles to WebComponents

## Target Use Cases

Social Magnetics interfaces (bus stops, community spaces, etc.) where spinning up interactive UIs needs to be instant. User on phone says "make a bus stop interface" and has it running seconds later, shareable across any device.

---

## Architecture

### Pipeline

```
1. Intent (natural language via MCP or HTTP)
   |
2. Planner AI --> Manifest (rich metadata + embeddings)
   |
3. Generator AI --> TSX source
   |
4. Transpiler (esbuild) --> WebComponent JS
   |
5. Deploy --> Cloudflare Workers/Pages
   |
6. Store --> R2 (artifacts) + D1 (metadata) + Vectorize (embeddings)
```

### Storage Structure

```
R2 Buckets:
/forge/{component-id}/
  manifest.json          # Full manifest
  source.tsx             # Original TSX
  component.js           # Transpiled WebComponent
  component.d.ts         # TypeScript definitions (optional)
  versions/
    v1/
    v2/
    ...

D1 Database:
- components (id, version, type, created_at, description, etc.)
- imports (component_id, imports_id)
- stats (uses, instances, last_used)

Vectorize:
- Embeddings for semantic search by intent
```

### URL Structure

```
forge.entrained.ai/{component-id}                      # Run/view component
forge.entrained.ai/{component-id}/source               # View TSX source
forge.entrained.ai/{component-id}/manifest             # View manifest
forge.entrained.ai/{component-id}/component/{name}     # Individual exported component

# Storage endpoints (automatic sandboxing)
forge.entrained.ai/{component-id}/instance/{id}/data   # Instance storage
forge.entrained.ai/{component-id}/class/data           # Class storage
forge.entrained.ai/{component-id}/global/data          # Global storage
```

---

## Component Format

Components are written in TSX and transpiled to WebComponents. A simplified decorator-based syntax hides boilerplate:

```tsx
@Component({
  tag: 'bus-stop',
  props: {
    location: { type: String, default: 'current' },
    radius: { type: Number, default: 500 }
  },
  cssVariables: ['--bg-color', '--text-color', '--accent'],
  parts: ['container', 'list', 'item']
})
class BusStop extends ForgeComponent {
  buses: Bus[] = [];

  async onMount() {
    const cached = await this.instance.get('buses');
    if (cached) {
      this.buses = cached;
    } else {
      this.buses = await this.fetchBuses();
      await this.instance.set('buses', this.buses);
    }
    this.update();
  }

  render() {
    return (
      <div part="container">
        <h2>Buses near {this.props.location}</h2>
        <ul part="list">
          {this.buses.map(bus => (
            <li key={bus.id} part="item" onClick={() => this.selectBus(bus)}>
              {bus.name} - {bus.eta}min
            </li>
          ))}
        </ul>
      </div>
    );
  }

  selectBus(bus: Bus) {
    this.emit('bus-selected', { busId: bus.id });
  }
}

export { BusStop };
```

### Built-in APIs

Every component has automatic access to:

```typescript
// Storage (sandboxed per instance/class/global)
await this.instance.get(key: string): Promise<any>
await this.instance.set(key: string, value: any): Promise<void>
await this.instance.delete(key: string): Promise<void>
await this.instance.list(): Promise<string[]>

await this.class.get/set/delete/list(...)   // Shared across instances of this component
await this.global.get/set/delete/list(...)  // Shared across all components

// Component utilities
this.emit(eventName: string, detail: any)   // Emit custom events
this.query(selector: string)                 // Query shadow DOM
this.queryAll(selector: string)              // Query all in shadow DOM
this.update()                                // Trigger re-render
```

### Importing Other Components

```tsx
import { MapWidget } from 'forge.entrained.ai/map-widget-v3-c9h4';

// Use in render:
<map-widget location={this.props.location}></map-widget>
```

### CSS Customization

Components expose styling via three mechanisms:

1. **CSS Variables** - Easy customization:
   ```css
   bus-stop {
     --bg-color: #f0f0f0;
     --accent: #ff0066;
   }
   ```

2. **Parts** - Deep styling access:
   ```css
   bus-stop::part(container) {
     border-radius: 8px;
   }
   ```

3. **Slots** - Content replacement:
   ```html
   <bus-stop>
     <template slot="row">...</template>
   </bus-stop>
   ```

---

## Manifest Schema

```typescript
interface ForgeManifest {
  // Identity
  id: string;                    // "bus-stop-v1-a7f2"
  version: number;               // 1, 2, 3...
  previous_version?: string;     // "bus-stop-v0-z9e1"
  created_at: string;            // ISO timestamp

  // Provenance
  created_by?: string;           // User/agent identifier
  model_used?: string;           // AI model that generated this

  // Intent & Discovery
  description: string;           // Original natural language intent
  embedding: number[];           // Vector for semantic search
  tags?: string[];               // ["transport", "ui", "real-time"]

  // Component Definition
  type: "app" | "library";       // exports.length === 0 -> app
  components: ComponentDef[];    // Components defined in this manifest

  // Dependencies
  imports?: ImportDef[];         // Other forge components used

  // Customization Surface
  css_variables?: CSSVarDef[];
  parts?: PartDef[];

  // Runtime Requirements
  storage: {
    instance: boolean;
    class: boolean;
    global: boolean;
  };
  compute: "light" | "medium" | "heavy";

  // Build Artifacts
  artifacts: {
    source_tsx: string;          // R2 URL to TSX
    component_js: string;        // R2 URL to transpiled JS
    type_definitions?: string;   // R2 URL to .d.ts
  };

  // Usage Stats
  stats?: {
    uses: number;                // How many other components import this
    instances: number;           // Active instance count
    last_used: string;           // ISO timestamp
  };
}

interface ComponentDef {
  name: string;                  // "BusStop"
  tag: string;                   // "bus-stop"
  exported: boolean;             // Can others import this?
  props: PropDef[];
  events?: EventDef[];           // What events does it emit?
}

interface PropDef {
  name: string;
  type: "String" | "Number" | "Boolean" | "Object" | "Array";
  default?: any;
  required: boolean;
  description?: string;
}

interface EventDef {
  name: string;                  // "bus-selected"
  detail_type?: string;          // TypeScript type of event.detail
  description?: string;
}

interface ImportDef {
  component_id: string;          // "social-nearby-v2-b8g3"
  components: string[];          // ["SocialNearby", "SocialProfile"]
  url: string;                   // "forge.entrained.ai/social-nearby-v2-b8g3"
}

interface CSSVarDef {
  name: string;                  // "--bg-color"
  default: string;               // "#1a1a1a"
  description?: string;          // "Background color for container"
}

interface PartDef {
  name: string;                  // "container"
  description?: string;          // "Main wrapper element"
}
```

---

## HTTP API

### Component Operations

```
POST /api/forge/create
Body: {
  description: string,
  initial_code?: string,
  imports?: string[],
  exports?: string[],
  model?: string          // AI model to use (default: claude-sonnet-4.5)
}
Response: { id, url, version, embedding, manifest }

GET /api/forge/{component-id}
Response: Full manifest

GET /api/forge/{component-id}/source
Response: TSX source code

PUT /api/forge/{component-id}/source
Body: { source: string }
Response: { id, url, version }  // New version created

POST /api/forge/{component-id}/update
Body: { changes: string, model?: string }
Response: { id, url, version }  // New version created with AI modifications

POST /api/forge/search
Body: { query: string, limit?: number }
Response: Array of matching components (semantic search)
```

### Storage Operations

```
GET  /api/forge/{component-id}/instance/{instance-id}/data/{key?}
POST /api/forge/{component-id}/instance/{instance-id}/data
     Body: { key: string, value: any }
DELETE /api/forge/{component-id}/instance/{instance-id}/data/{key}

GET  /api/forge/{component-id}/class/data/{key?}
POST /api/forge/{component-id}/class/data
DELETE /api/forge/{component-id}/class/data/{key}

GET  /api/forge/{component-id}/global/data/{key?}
POST /api/forge/{component-id}/global/data
DELETE /api/forge/{component-id}/global/data/{key}
```

---

## MCP Interface (Forge Architect)

The Forge MCP server enables an AI agent to act as a **Component Architect** - discovering, creating, and composing WebComponents to build complete solutions.

### Design Philosophy

The architect should be able to:
1. **Discover** - Find existing components via semantic search
2. **Investigate** - Understand component interfaces (props, events, methods)
3. **Plan** - Determine what exists, what's missing, what needs wiring
4. **Create** - Generate new components to fill gaps
5. **Compose** - Wire components together into working solutions

### Tools

#### Discovery & Investigation

```typescript
forge_search({
  query: string,           // Natural language search
  limit?: number           // Max results (default: 10)
}): Array<{
  id: string,
  tag: string,
  description: string,
  type: "app" | "library",
  version: number,
  similarity: number       // 0-1 relevance score
}>

forge_get_manifest({
  id: string
}): {
  manifest: ForgeManifest,  // Full manifest with props, events, parts, etc.
  url: string               // Viewer URL
}

forge_get_source({
  id: string
}): {
  source: string,           // Full TSX source code
  manifest: ForgeManifest
}

forge_get_types({
  id: string
}): {
  types: string             // TypeScript .d.ts definitions
}
```

#### Creation & Modification

```typescript
forge_create({
  description: string,      // Natural language description
  hints?: {                 // Optional guidance for the AI
    props?: string[],       // Suggested prop names
    events?: string[],      // Suggested event names
    style?: string,         // Visual style hints
    similar_to?: string     // Component ID to use as reference
  }
}): {
  id: string,
  url: string,
  version: number,
  manifest: ForgeManifest
}

forge_update({
  id: string,
  changes: string           // Natural language changes to make
}): {
  id: string,               // NEW version ID
  url: string,
  version: number,
  previous_version: string
}

forge_update_source({
  id: string,
  source: string            // Complete new TSX source
}): {
  id: string,               // NEW version ID
  url: string,
  version: number
}

forge_retranspile({
  id: string                // Re-run transpiler (fixes build issues)
}): {
  id: string,
  success: boolean,
  js_size: number
}
```

#### Composition

The key tool for building multi-component solutions:

```typescript
forge_compose({
  name: string,                    // Name for the composed solution
  description: string,             // What this composition does
  components: Array<{
    id: string,                    // Component to include
    as?: string                    // Optional alias for this instance
  }>,
  layout: string,                  // HTML/JSX layout template
  wiring: Array<{
    source: {
      component: string,           // Component alias or tag
      event: string                // Event name to listen for
    },
    target: {
      component: string,           // Component alias or tag
      action: string               // Method to call or prop to set
    },
    transform?: string             // Optional JS expression to transform event.detail
  }>,
  styles?: string                  // Additional CSS for layout
}): {
  id: string,                      // ID of the new composed component
  url: string,
  bundle_url: string,              // URL that loads all dependencies
  manifest: ForgeManifest
}
```

**Example composition:**

```typescript
forge_compose({
  name: "celebration-app",
  description: "Fireworks display with control panel",
  components: [
    { id: "fireworks-display-v2-bcfc", as: "fireworks" },
    { id: "celebration-panel-v1-5b7d", as: "panel" }
  ],
  layout: `
    <div style="position: relative; width: 100vw; height: 100vh;">
      <fireworks-display id="fireworks" style="position: absolute; inset: 0;"></fireworks-display>
      <celebration-panel id="panel"></celebration-panel>
    </div>
  `,
  wiring: [
    {
      source: { component: "panel", event: "celebrate-burst" },
      target: { component: "fireworks", action: "launchAt" },
      transform: "({ x, y, count }) => ({ x, y, color: randomColor() })"
    }
  ],
  styles: `
    :host { display: block; }
    fireworks-display { z-index: 1; }
    celebration-panel { z-index: 2; }
  `
})
```

### Bundle Endpoint

Compositions need to load multiple components. The bundle endpoint handles this:

```
GET /api/forge/bundle?ids=id1,id2,id3
Response: Single JS file with all components defined

GET /api/forge/bundle/{composition-id}
Response: Pre-built bundle for a composition
```

### Component Interface Enhancement

To support composition, components should expose their **public methods** in the manifest:

```typescript
interface ComponentDef {
  name: string;
  tag: string;
  exported: boolean;
  props: PropDef[];
  events?: EventDef[];
  methods?: MethodDef[];        // NEW: Public methods for composition
}

interface MethodDef {
  name: string;                 // "launchAt"
  params: Array<{
    name: string,
    type: string
  }>;
  description?: string;         // "Launch a firework at the specified position"
}
```

### Resources (Read-only)

```typescript
// List all components (paginated)
forge://components
forge://components?cursor={cursor}

// Individual component
forge://component/{id}
forge://component/{id}/source
forge://component/{id}/manifest
forge://component/{id}/types

// Search index metadata
forge://stats
```

### Architect Workflow

Typical flow for an AI architect building a solution:

```
1. User: "Build me a celebration page with fireworks and controls"

2. Architect: forge_search({ query: "fireworks display animation" })
   -> Finds fireworks-display-v2-bcfc

3. Architect: forge_search({ query: "control panel buttons" })
   -> Finds celebration-panel-v1-5b7d

4. Architect: forge_get_manifest({ id: "fireworks-display-v2-bcfc" })
   -> Gets props, events, methods

5. Architect: forge_get_manifest({ id: "celebration-panel-v1-5b7d" })
   -> Gets props, events - sees it emits "celebrate-burst"

6. Architect: Notices fireworks needs a "launchAt" method but doesn't have one
   -> forge_update({ id: "fireworks-display-v2-bcfc",
        changes: "Add a public launchAt(x, y, color) method" })

7. Architect: forge_compose({ ... wire them together ... })
   -> Returns working composed solution

8. User gets URL to fully working celebration page
```

### Error Handling

All tools return errors in a consistent format:

```typescript
{
  error: {
    code: "NOT_FOUND" | "TRANSPILE_FAILED" | "INVALID_COMPOSITION" | ...,
    message: string,
    details?: any
  }
}
```

---

## LLM System Prompt

The Forge service calls out to an LLM to generate components. The system prompt should instruct it:

1. Use the `@Component` decorator syntax
2. Use built-in storage APIs (`this.instance`, `this.class`, `this.global`)
3. Declare `cssVariables` and `parts` for customization
4. Keep components simple and focused (single responsibility)
5. Use semantic HTML and include accessibility attributes
6. Be responsive by default

See `SYSTEM_PROMPT.md` for the full LLM prompt.

---

## Implementation Notes

### Key Differences from Prometheus

| Aspect      | Prometheus              | Forge                        |
|-------------|-------------------------|------------------------------|
| Input       | Natural language intent | Natural language intent      |
| Output      | WASM binary             | WebComponent (JS)            |
| Source      | Multiple languages      | TSX                          |
| Discovery   | Semantic search         | Semantic search              |
| Composition | Function calls          | Component imports            |
| Runtime     | WASM runtime            | Browser/Web                  |

### Non-Goals (v1)

- Full IDE (just source viewing/basic editing)
- Server-side rendering
- User authentication (open platform initially)
- Complex permissions (contain via endpoints later)

### Success Criteria

1. Say "make a bus stop interface" on phone
2. Get working URL in seconds
3. View on any device
4. Say "add a map widget" -> compose new component
5. Share URL with others
6. All components discoverable and reusable
