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

## MCP Interface

Thin wrappers over HTTP API for conversational use:

```typescript
forge_create({
  description: string,
  initial_code?: string,
  imports?: string[],
  exports?: string[]
}): { id, url, version, embedding }

forge_update({
  id: string,
  changes: string
}): { id, url, version }  // Returns NEW version

forge_get({
  id: string
}): { manifest, source }

forge_search({
  query: string,
  limit?: number
}): Array<{ id, url, description, tags }>

forge_source_update({
  id: string,
  source: string
}): { id, url, version }  // Manual source edit
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
