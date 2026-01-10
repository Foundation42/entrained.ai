# Instance Service Specification

## Overview

The Instance Service enables Forge components to become **living, orchestratable entities** deployed at the edge. Instead of regenerating components to change their props, instances allow external systems (AI, APIs, users) to update component state in real-time.

**Vision:** Social Magnetics - UI components placed in physical space (bus stops, cafes, kiosks) that receive state and are orchestrated by AI.

```
┌─────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATION LAYER                          │
│          (AI, schedules, events, user interactions)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                     Props / State Updates
                              ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Bus Stop   │    │  Cafe Menu  │    │   Event     │
│  Instance   │    │  Instance   │    │   Board     │
│  @downtown  │    │  @mainst    │    │   @park     │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
   [Screen]          [Tablet]           [Kiosk]
```

## Core Concepts

### Three-Layer Separation

```
Component (immutable template/code)
  + Props (mutable state)
  + Bindings (data sources)
  = Instance (living entity)
```

- **Component**: The published, immutable code/template
- **Props**: Current state values, can be updated without regeneration
- **Bindings**: Declarative connections to live data sources
- **Instance**: The deployed, addressable entity with identity and placement

## Data Model

### Instance

```typescript
interface Instance {
  /** Unique identifier: "inst-a1b2c3d4" */
  id: string;

  /** Component template this instance uses */
  component_id: string;

  /** Pinned component version (semver or version number) */
  component_version?: string;

  /** Human-readable name */
  name?: string;

  /** Owner/creator identifier */
  owner_id: string;

  /** Visibility: private, public, unlisted */
  visibility: 'private' | 'public' | 'unlisted';

  /** Current props (mutable, stored in KV for edge speed) */
  props: Record<string, unknown>;

  /** Connect props to live data sources */
  bindings?: Record<string, Binding>;

  /** Physical/logical placement */
  placement?: Placement;

  /** Runtime configuration */
  runtime?: RuntimeConfig;

  /** Upgrade policy for component versions */
  upgrade_policy?: UpgradePolicy;

  /** Event webhooks */
  events?: EventConfig;

  created_at: string;
  updated_at: string;
}

interface Binding {
  /** Data source type */
  source: 'kv' | 'api' | 'do' | 'static';

  /** Path or URL to the data */
  path: string;

  /** Refresh strategy */
  strategy?:
    | { type: 'static' }                      // No refresh
    | { type: 'poll'; interval: number }      // Poll every N seconds
    | { type: 'sse'; url: string }            // Server-sent events
    | { type: 'webhook'; secret: string };    // Push updates
}

interface Placement {
  /** Logical location identifier */
  location?: string;

  /** Device identifier */
  device?: string;

  /** Geographic coordinates */
  geo?: { lat: number; lng: number };

  /** Searchable tags */
  tags?: string[];
}

interface RuntimeConfig {
  /** 'edge' = KV-backed (default), 'durable' = Durable Object */
  type: 'edge' | 'durable';
}

interface UpgradePolicy {
  /** 'pin' = stay on version, 'minor' = auto-upgrade minor, 'latest' = always latest */
  strategy: 'pin' | 'minor' | 'latest';

  /** Maximum version to upgrade to */
  max_version?: string;
}

interface EventConfig {
  /** Webhook for prop changes */
  on_props_change?: string;

  /** Webhook for errors */
  on_error?: string;

  /** Webhook for user interactions */
  on_interaction?: string;
}
```

## Storage Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         D1 Database                          │
│  instances table: metadata, relationships, queryable fields  │
│  - id, component_id, owner_id, placement, tags              │
│  - Supports: geo queries, tag filtering, ownership          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         KV Store                             │
│  instance:{id}:props          → Current prop values          │
│  instance:{id}:bindings       → Binding configuration        │
│  instance:{id}:resolved       → Cached resolved props        │
│  (fast edge access, mutable, low-latency reads)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Durable Objects (opt-in)                  │
│  InstanceDO:{id}              → WebSocket, real-time state  │
│  (for instances needing real-time updates)                  │
└─────────────────────────────────────────────────────────────┘
```

### D1 Schema

```sql
CREATE TABLE instances (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL,
  component_version TEXT,
  owner_id TEXT NOT NULL,
  name TEXT,
  visibility TEXT DEFAULT 'private',

  -- Placement (queryable fields)
  location TEXT,
  device TEXT,
  geo_lat REAL,
  geo_lng REAL,
  tags TEXT,  -- JSON array

  -- Runtime
  runtime_type TEXT DEFAULT 'edge',

  -- Versioning
  upgrade_strategy TEXT DEFAULT 'pin',

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (component_id) REFERENCES components(id)
);

-- Indexes for common queries
CREATE INDEX idx_instances_component ON instances(component_id);
CREATE INDEX idx_instances_owner ON instances(owner_id);
CREATE INDEX idx_instances_location ON instances(location);
CREATE INDEX idx_instances_visibility ON instances(visibility);
CREATE INDEX idx_instances_geo ON instances(geo_lat, geo_lng);
```

### KV Key Structure

```
instance:{id}:props           → JSON: current prop values
instance:{id}:bindings        → JSON: binding configurations
instance:{id}:resolved        → JSON: cached resolved props (bindings fetched)
instance:{id}:resolved:ttl    → Expiry tracking for resolved cache
```

## API Endpoints

### Create Instance

```http
POST /api/instances
Content-Type: application/json

{
  "component_id": "sprite-viewer-v1-abc",
  "name": "Hero Walk Cycle Preview",
  "props": {
    "frames": ["url1", "url2", "url3"],
    "fps": 8,
    "scale": 4
  },
  "placement": {
    "location": "demo-area",
    "tags": ["sprite", "animation"]
  }
}
```

**Response:**
```json
{
  "id": "inst-xyz123",
  "component_id": "sprite-viewer-v1-abc",
  "name": "Hero Walk Cycle Preview",
  "props": { "frames": [...], "fps": 8, "scale": 4 },
  "url": "/live/inst-xyz123",
  "created_at": "2026-01-10T..."
}
```

### Get Instance

```http
GET /api/instances/:id
```

### Update Props (Partial)

```http
PATCH /api/instances/:id/props
Content-Type: application/json

{
  "fps": 16
}
```

**Response:**
```json
{
  "props": {
    "frames": [...],
    "fps": 16,
    "scale": 4
  }
}
```

### Replace All Props

```http
PUT /api/instances/:id/props
Content-Type: application/json

{
  "frames": ["new1", "new2"],
  "fps": 12,
  "scale": 6
}
```

### Set Bindings

```http
PUT /api/instances/:id/bindings
Content-Type: application/json

{
  "arrivals": {
    "source": "api",
    "path": "https://transit.api/route/42/arrivals",
    "strategy": { "type": "poll", "interval": 30 }
  },
  "alerts": {
    "source": "kv",
    "path": "alerts/route-42"
  }
}
```

### List Instances

```http
GET /api/instances
GET /api/instances?component_id=xyz
GET /api/instances?location=downtown
GET /api/instances?tags=outdoor,transit
GET /api/instances?owner_id=user123
```

### Bulk Update

```http
PATCH /api/instances/bulk?tags=outdoor
Content-Type: application/json

{
  "props": {
    "brightness": 80
  }
}
```

### Delete Instance

```http
DELETE /api/instances/:id
```

## Live Endpoint

```
GET /live/:instance_id
```

**Flow:**
1. Fetch instance metadata from D1
2. Fetch props from KV
3. Resolve bindings (fetch from APIs, KV, etc.)
4. Get component bundle
5. Inject props into ForgeHost runtime
6. Serve hydrated component

## Host Runtime (Component Side)

Components mount to a `ForgeHost` object that provides props and communication:

```typescript
interface ForgeHost {
  /** Current resolved props (bindings already fetched) */
  props: Record<string, unknown>;

  /** Instance metadata */
  instance: {
    id: string;
    name?: string;
    placement?: Placement;
  };

  /** Subscribe to prop changes (for live updates) */
  onPropsChange(callback: (newProps: Record<string, unknown>) => void): () => void;

  /** Component emits events back to orchestration */
  emit(event: string, data?: unknown): void;
}

// React hook for components
function useForgeHost(): ForgeHost;
```

**Usage in Component:**
```tsx
const SpriteViewer: React.FC = () => {
  const host = useForgeHost();
  const { frames, fps, scale } = host.props;

  // Listen for external prop updates
  useEffect(() => {
    return host.onPropsChange((newProps) => {
      // Props were updated externally, component will re-render
      console.log('Props updated:', newProps);
    });
  }, [host]);

  // Emit events back
  const handleClick = () => {
    host.emit('user-interaction', { action: 'frame-clicked', frame: currentFrame });
  };

  return (
    <div onClick={handleClick}>
      {/* render sprite viewer */}
    </div>
  );
};
```

## Component Lifecycle Hooks

Components can optionally define lifecycle hooks:

```typescript
interface ComponentHooks {
  /** Called when instance mounts */
  onMount?: (host: ForgeHost) => void | (() => void);

  /** Called when props change */
  onPropsChange?: (oldProps: Record<string, unknown>, newProps: Record<string, unknown>) => void;

  /** Called when instance unmounts */
  onUnmount?: () => void;
}
```

## Binding Refresh Strategies

| Strategy | Use Case | Implementation |
|----------|----------|----------------|
| `static` | Fixed data (sprite frames, titles) | No refresh |
| `poll` | Slow-changing (bus schedules, weather) | setInterval fetch |
| `sse` | Medium-frequency (stock prices, scores) | EventSource |
| `webhook` | External push (payment status, alerts) | Endpoint receives POST |
| `durable` | Real-time (chat, collaboration) | WebSocket via DO |

**Recommendation:** Start with `static` and `poll`. Add `sse` and `durable` later.

## Component Versioning

### Problem
Instance created with `sprite-viewer-v1` → `v2` published with breaking changes → What happens?

### Solution: Pin + Upgrade Policy

```typescript
interface Instance {
  component_version: string;  // "v1" or "1.0.0"

  upgrade_policy: {
    strategy: 'pin' | 'minor' | 'latest';
    max_version?: string;
  };
}
```

| Strategy | Behavior |
|----------|----------|
| `pin` | Stay on version forever (default, safest) |
| `minor` | Auto-upgrade v1.0 → v1.1, but not v2.0 |
| `latest` | Always use latest (risky, for dev/testing) |

### Manual Upgrade

```http
POST /api/instances/:id/upgrade
Content-Type: application/json

{
  "target_version": "v2"
}
```

## MCP Tools

```typescript
// Create instance
forge_instance_create({
  component_id: "bus-schedule-viewer",
  name: "Downtown Main St",
  props: { route: "42" },
  placement: { location: "downtown-main-st", tags: ["transit", "outdoor"] }
})
→ { instance_id: "inst-xyz", url: "/live/inst-xyz" }

// Update props
forge_instance_update_props({
  instance_id: "inst-xyz",
  props: { route: "43" }  // Partial update
})

// Set bindings
forge_instance_bind({
  instance_id: "inst-xyz",
  bindings: {
    arrivals: { source: "api", path: "https://transit.api/...", strategy: { type: "poll", interval: 30 } }
  }
})

// Get instance
forge_instance_get({ instance_id: "inst-xyz" })

// List instances
forge_instance_list({ tags: ["transit"], location: "downtown" })

// Delete instance
forge_instance_delete({ instance_id: "inst-xyz" })
```

## Implementation Phases

### Phase 1: Core Foundation
- [ ] D1 schema + migrations
- [ ] KV storage for props
- [ ] CRUD API for instances
- [ ] `/live/:id` endpoint with prop injection
- [ ] `useForgeHost()` runtime hook
- [ ] Basic static props (no bindings yet)

### Phase 2: Bindings & Queries
- [ ] Binding configuration storage
- [ ] Poll strategy implementation
- [ ] Binding resolution in `/live` endpoint
- [ ] Instance queries (by location, tags, component)
- [ ] Bulk operations

### Phase 3: Live Updates
- [ ] SSE for prop change notifications
- [ ] `onPropsChange` hook in runtime
- [ ] Component event emission (`host.emit()`)
- [ ] Webhook integration for events

### Phase 4: Advanced
- [ ] Durable Object runtime for real-time instances
- [ ] WebSocket support
- [ ] Component versioning + upgrade policies
- [ ] Permissions model
- [ ] Geo queries

## Example: Bus Stop Display

```typescript
// 1. Create the component once
forge_create({
  description: "Bus arrival display with route info and real-time arrivals"
})
→ { id: "bus-display-v1-abc" }

// 2. Publish it
forge_publish({ id: "bus-display-v1-abc" })

// 3. Create instances for each bus stop
forge_instance_create({
  component_id: "bus-display-v1-abc",
  name: "Downtown Main St - Route 42",
  props: {
    route: "42",
    stopName: "Main St & 1st Ave"
  },
  bindings: {
    arrivals: {
      source: "api",
      path: "https://transit.api/stops/main-1st/arrivals",
      strategy: { type: "poll", interval: 30 }
    },
    alerts: {
      source: "kv",
      path: "transit/alerts/route-42"
    }
  },
  placement: {
    location: "downtown-main-st",
    device: "kiosk-42",
    geo: { lat: 37.7749, lng: -122.4194 },
    tags: ["transit", "outdoor", "downtown"]
  }
})

// 4. AI orchestration: "It's raining, show nearby indoor locations"
forge_instance_update_props({
  instance_id: "inst-bus-main-st",
  props: {
    showIndoorAlternatives: true,
    alertMessage: "Rain expected - see nearby covered stops"
  }
})
```

## Summary

The Instance Service transforms Forge components from static bundles into **living, orchestratable micro-UIs** at the edge. Key features:

- **Separation of code and state**: Update props without regeneration
- **Edge-native**: KV for fast props, D1 for queries, optional DO for real-time
- **Declarative bindings**: Connect props to live data sources
- **Spatial awareness**: Placement, geo, tags for physical computing
- **AI-friendly**: Simple API for external orchestration
- **Version-safe**: Pin components, control upgrades

This enables the Social Magnetics vision: AI-orchestrated UIs deployed in physical space.
