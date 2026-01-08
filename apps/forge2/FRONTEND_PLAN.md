# Forge 2.0 Frontend - Design Document

**Created**: 2026-01-08
**Approach**: Dogfooding - Built with Forge itself!

## Vision

A web-based UI for browsing, previewing, and interacting with Forge components. By building it with Forge, we'll:
- Validate our own tools work well for real projects
- Discover pain points firsthand
- Showcase what's possible with the platform

---

## Core Features

### 1. Component Gallery
Browse all components with live previews.

```
┌─────────────────────────────────────────────────────────────────┐
│  🔥 FORGE 2.0                         [Search...]        [+New] │
├─────────────┬───────────────────────────────────────────────────┤
│             │                                                   │
│ COMPONENTS  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│ ○ All       │  │ ▣ Card  │ │ ◉ Toggle│ │ ≡ Table │ │ ◐ Chart │ │
│ ○ UI        │  │ Preview │ │ Preview │ │ Preview │ │ Preview │ │
│ ○ Charts    │  │   v2    │ │   v1    │ │   v3    │ │   v1    │ │
│ ○ 3D/WebGL  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
│ ○ Canvas    │                                                   │
│             │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│ ASSETS      │  │ 🎆 Fire │ │ 🎮 Tank │ │ 📊 Dash │ │ 🌈 Kale │ │
│ ○ Images    │  │  works  │ │ Vector  │ │  board  │ │  idosc  │ │
│ ○ Speech    │  │   v2    │ │   v1    │ │   v1    │ │   v2    │ │
│             │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
│ RECENT      │                                                   │
│ • vector-ta │  Showing 8 of 142 components          [Load More] │
│ • vector-sc │                                                   │
└─────────────┴───────────────────────────────────────────────────┘
```

### 2. Component Detail / Playground
Interactive preview with live prop editing.

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Gallery          toggle-switch-v2-abc4               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │                   [Live Preview]                          │  │
│  │                      ◉────                                │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ Props ──────────────────┐  ┌─ Info ────────────────────┐   │
│  │                          │  │                            │   │
│  │ checked:  [✓]            │  │ Version: 2 (v2-abc4)       │   │
│  │ disabled: [ ]            │  │ Created: 2026-01-08        │   │
│  │ size:     [sm ▼]         │  │ Type: file (tsx)           │   │
│  │ onColor:  [#10B981    ]  │  │                            │   │
│  │ offColor: [#6B7280    ]  │  │ CSS Classes:               │   │
│  │                          │  │ • toggle-container         │   │
│  │ [Reset to Defaults]      │  │ • toggle-track             │   │
│  │                          │  │ • toggle-thumb             │   │
│  └──────────────────────────┘  └────────────────────────────┘   │
│                                                                 │
│  [View Source]  [View CSS]  [Fork Component]  [Versions ▼]      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Version History
Browse and compare component versions.

```
┌─────────────────────────────────────────────────────────────────┐
│  toggle-switch - Version History                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ● v2-abc4 (latest)                              2026-01-08    │
│    └─ "Added size variants and custom colors"                   │
│                                                                 │
│  ○ v1-def7                                       2026-01-07    │
│    └─ "Initial toggle switch component"                         │
│                                                                 │
│  [Compare v1 ↔ v2]   [Revert to v1]   [Fork from v1]           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4. Create New Component
Simple interface for creating components.

```
┌─────────────────────────────────────────────────────────────────┐
│  Create New Component                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Description:                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ A card component with image, title, description, and      │  │
│  │ action buttons. Supports dark mode and hover effects.     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Style hints (optional):                                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Modern, minimal, subtle shadows                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ○ Generate with AI (forge_create)                              │
│  ○ Upload my own code (forge_upload)                            │
│                                                                 │
│                                        [Cancel]  [Create →]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

We'll build these Forge components to compose the UI:

### Layout Components
| Component | Description |
|-----------|-------------|
| `AppShell` | Main layout with sidebar and content area |
| `Sidebar` | Navigation sidebar with sections |
| `Header` | Top bar with search and actions |
| `ContentArea` | Scrollable main content region |

### Gallery Components
| Component | Description |
|-----------|-------------|
| `ComponentGrid` | Grid of component cards |
| `ComponentCard` | Thumbnail card with preview |
| `ComponentFilters` | Filter chips (type, category) |
| `SearchBar` | Search input with suggestions |

### Detail/Playground Components
| Component | Description |
|-----------|-------------|
| `PreviewPane` | iframe showing live component |
| `PropsEditor` | Dynamic form for editing props |
| `PropInput` | Smart input (text, number, boolean, color, select) |
| `ComponentInfo` | Metadata display (version, css_classes, etc.) |
| `SourceViewer` | Syntax-highlighted source code |
| `ActionBar` | Buttons (fork, versions, etc.) |

### Utility Components
| Component | Description |
|-----------|-------------|
| `VersionHistory` | List of versions with actions |
| `VersionDiff` | Side-by-side source comparison |
| `CreateDialog` | Modal for creating new components |
| `Toast` | Notification messages |

---

## Technical Approach

### Phase 1: Core Components (MVP)
Build individual UI components with Forge:
1. `AppShell` - Basic layout structure
2. `ComponentCard` - Preview thumbnail
3. `ComponentGrid` - Grid layout
4. `PreviewPane` - iframe wrapper
5. `PropsEditor` - Basic prop editing

### Phase 2: Integration
Compose components into working pages:
1. Gallery page (list all components)
2. Detail page (preview + props editor)
3. Wire up to Forge API

### Phase 3: Polish
1. Search functionality
2. Version history
3. Create new component flow
4. Responsive design
5. Dark/light mode

---

## API Integration

The frontend will use these Forge endpoints:

```typescript
// List/search components
GET /api/forge/search?q={query}&type={file|asset|bundle}&limit={n}

// Get component details
GET /api/forge/{id}

// Get component source
GET /api/forge/{id}/source

// Get component types
GET /api/forge/{id}/component.d.ts

// Create new component
POST /api/forge/create
POST /api/forge/upload

// Update component
POST /api/forge/{id}/update
PUT /api/forge/{id}/source

// Get versions
GET /api/forge/{name}/versions  // TODO: implement this endpoint
```

---

## Preview URL Strategy

The live preview will use an iframe pointing to the component's `preview_url`:

```tsx
<iframe
  src={`${component.preview_url}?${encodeProps(editedProps)}`}
  className="preview-frame"
/>
```

**Challenge**: How to pass edited props to the preview?

**Options**:
1. **Query params** - Simple but limited for complex props
2. **PostMessage** - iframe communication for real-time updates
3. **Re-compose on change** - Call API to generate new preview (slower)
4. **Client-side rendering** - Load component JS directly (complex)

**Recommendation**: Start with option 3 (re-compose), optimize later with postMessage.

---

## Deployment

Since it's built with Forge, we can:
1. Compose all components into a single HTML bundle
2. Deploy to Cloudflare Pages or serve from R2
3. Access at `forge.entrained.ai` or similar

---

## Open Questions

1. **Authentication**: Do we need user accounts? Or public read, auth for write?
2. **Categories**: How to categorize components? Tags? Manual? AI-inferred?
3. **Favorites**: Should users be able to star/favorite components?
4. **Usage stats**: Track which components are most used?

---

## Success Metrics

- [ ] Can browse all existing components
- [ ] Can see live preview of any component
- [ ] Can edit props and see changes
- [ ] Can view source code
- [ ] Can create new component from UI
- [ ] Can fork/update existing component
- [ ] Built entirely with Forge components!

---

## Next Steps

1. Create `AppShell` component
2. Create `ComponentCard` component
3. Create `ComponentGrid` component
4. Compose into basic gallery page
5. Test and iterate!

Let's dogfood! 🐕
