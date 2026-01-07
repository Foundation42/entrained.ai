# Forge 2.0 - Briefing Document

## Overview

Forge 2.0 is a conversational asset workspace and build system that enables AI-driven creation, discovery, composition, and deployment of software assets. It's a clean-slate redesign of Forge 1.0, moving from a custom WebComponent runtime to a universal, domain-agnostic architecture.

**Core Concept:** A searchable universe of versioned assets (files, images, audio, bundles) that grows in value through Metcalfe's law - each new asset makes all future creations easier through semantic search and reuse.

## The Four Operations

1. **Search** - Semantically navigate asset space to discover existing files, bundles, and assets
2. **Create** - Generate new assets (files, images, speech) via natural language descriptions
3. **Compose** - Bundle assets together using appropriate build tools (Bun, Docker, Make, etc.)
4. **Instantiate** - Deploy/serve/download the composed artifacts

## Architecture

### Technology Stack

- **Runtime:** Bun (for execution and bundling)
- **Hosting:** Cloudflare Workers (API) + Pages (static serving)
- **Storage:** 
  - R2 for file content and manifests (source of truth)
  - D1 for queryable metadata index
  - Vectorize for semantic search embeddings
- **Containers:** Docker for heavy bundling/compilation tasks
- **Framework:** Hono for API routing

### Storage Architecture

**R2 Buckets:**
```
{asset-id}/
  ├── content           # The actual file content
  └── manifest.json     # Rich metadata (source of truth)
```

**D1 Database:**
Queryable index rebuilt from R2 manifests. Used for:
- Fast version lookups
- Ref resolution (latest, stable, etc.)
- Relationship queries (parent/child chains)

**Vectorize:**
Semantic embeddings for:
- File descriptions
- Content samples (first N chars)
- Bundle descriptions

### Data Model

#### Asset Types
- **file** - Source code, configs, any text/binary file
- **asset** - Generated media (images, speech, future: video, 3D models)
- **bundle** - Composed collection of files/assets, built into artifacts

#### Version Chain
Assets form Git-like version chains:
```
card-component-abc123 (v0.1.0)
  ↓
card-component-def456 (v0.1.1)
  ↓
card-component-ghi789 (v0.2.0) ← @latest
```

Support for:
- Linear chains (updates)
- Branches (fork from non-HEAD parent)
- Named refs (latest, stable, dev)
- Semver resolution (^0.1, ~1.2.3)

## API Design

### Search Operations

```typescript
forge_search({
  query: string,                    // Semantic search query
  type?: "file" | "bundle" | "asset",  // Filter by type
  file_type?: "tsx" | "css" | "rs" | "cpp" | ...,  // Filter files
  limit?: number                    // Default: 10, Max: 50
})

// Returns:
{
  results: [{
    id: string,              // Immutable content hash
    canonical_name: string,  // e.g., "card-component"
    type: string,
    file_type?: string,
    version: string,         // Semver: "0.1.0"
    description: string,
    url: string,            // Access URL
    score: number,          // Similarity score
    metadata: object
  }]
}
```

### Create Operations

#### Generic File Creation
```typescript
forge_create_file({
  description: string,              // Natural language description
  file_type: string,                // "tsx" | "css" | "rs" | "cpp" | ...
  parent_id?: string,               // For updates/versions
  version_tag?: string,             // Optional explicit version
  bump?: "patch" | "minor" | "major",  // Auto-increment (default: patch)
  hints?: {
    dependencies?: string[],        // IDs of files to reference
    style?: string,                 // Style hints for generation
    references?: string[]           // Related file IDs
  }
})

// Returns:
{
  id: string,
  canonical_name: string,
  version: string,
  url: string,
  content: string,
  metadata: object
}
```

#### Asset Creation (Images/Speech)
```typescript
forge_create_image({
  prompt: string,
  options?: {
    width?: number,
    height?: number,
    style?: "illustration" | "photo" | "3d" | "pixel-art",
    transparent?: boolean,
    preset?: "icon" | "hero" | "sprite"
  }
})

forge_create_speech({
  text: string,
  options?: {
    voice?: string,
    speed?: number,
    format?: "mp3" | "opus" | "wav",
    instructions?: string  // Voice style instructions
  }
})
```

### Compose Operations

```typescript
forge_compose({
  name: string,                     // Human-readable name
  description: string,              // What this bundle does
  files: string[],                  // File IDs or refs ("card@latest")
  assets?: string[],                // Asset IDs
  entry?: string,                   // Entry point file ID
  bundler: {
    type: "bun" | "docker" | "rust" | "make" | ...,
    config?: object,                // Bundler-specific config
    dockerfile?: string,            // For docker type
    command?: string                // Custom build command
  }
})

// Returns:
{
  id: string,
  url: string,                      // Deployed/accessible URL
  version: string,
  artifacts: [{
    type: string,                   // "js" | "wasm" | "binary" | "pdf"
    url: string,
    size: number
  }],
  metadata: object
}
```

### Version Operations

```typescript
forge_resolve({
  ref: string  // "card-component@latest" | "utils@^1.2" | "abc123"
})

forge_get_history({
  canonical_name: string
})

forge_get_versions({
  canonical_name: string,
  include_branches?: boolean
})
```

## Database Schema

### D1 Tables

```sql
-- Core asset metadata
CREATE TABLE assets (
  id TEXT PRIMARY KEY,              -- Content hash (immutable)
  canonical_name TEXT NOT NULL,     -- Stable name
  type TEXT NOT NULL,               -- "file" | "bundle" | "asset"
  file_type TEXT,                   -- "tsx" | "css" | "image" | etc
  version TEXT NOT NULL,            -- Semver "0.1.0"
  parent_id TEXT,                   -- Parent in version chain
  description TEXT NOT NULL,
  created_at INTEGER NOT NULL,      -- Unix timestamp
  manifest_url TEXT NOT NULL,       -- R2 URL for full manifest
  content_url TEXT NOT NULL,        -- R2 URL for content
  size INTEGER,                     -- File size in bytes
  mime_type TEXT,
  
  FOREIGN KEY (parent_id) REFERENCES assets(id)
);

-- Named version refs (latest, stable, dev, etc.)
CREATE TABLE version_refs (
  canonical_name TEXT NOT NULL,
  ref_name TEXT NOT NULL,           -- "latest" | "stable" | "dev"
  asset_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  
  PRIMARY KEY (canonical_name, ref_name),
  FOREIGN KEY (asset_id) REFERENCES assets(id)
);

-- Version chain children (for branching)
CREATE TABLE version_children (
  parent_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  
  PRIMARY KEY (parent_id, child_id),
  FOREIGN KEY (parent_id) REFERENCES assets(id),
  FOREIGN KEY (child_id) REFERENCES assets(id)
);

-- Indexes for common queries
CREATE INDEX idx_canonical_version ON assets(canonical_name, version);
CREATE INDEX idx_type_filetype ON assets(type, file_type);
CREATE INDEX idx_created_at ON assets(created_at DESC);
CREATE INDEX idx_parent ON assets(parent_id);
CREATE INDEX idx_refs_lookup ON version_refs(asset_id);
```

## Manifest Schema (R2)

Each asset has a `manifest.json` in R2 with complete metadata:

```json
{
  "id": "card-component-abc123",
  "canonical_name": "card-component",
  "type": "file",
  "file_type": "tsx",
  "version": "0.1.0",
  "parent_id": null,
  "children_ids": ["card-component-def456"],
  "description": "Reusable card component with hover effects",
  "created_at": "2026-01-07T10:00:00Z",
  "content_url": "https://r2.../card-component-abc123/content",
  "size": 2048,
  "mime_type": "text/typescript",
  "provenance": {
    "ai_model": "claude-sonnet-4-5",
    "source_type": "ai_generated",
    "generation_params": {
      "description": "...",
      "hints": {}
    }
  },
  "tags": ["latest"],
  "metadata": {
    "dependencies": [],
    "exports": ["CardComponent"],
    "imports": ["react"]
  }
}
```

## Implementation Plan

### Phase 1: Foundation (Option A - Bottom-up)

**Goal:** Set up data model and storage layer

1. **Database Setup**
   - Create D1 schema
   - Write migration scripts
   - Create seed data for testing

2. **R2 Storage Layer**
   - Implement manifest write/read
   - Implement content write/read
   - URL generation logic

3. **Version Management**
   - Semver parsing and resolution
   - Parent/child chain tracking
   - Named ref management
   - Branch detection

4. **Basic CRUD**
   - Create asset (file/bundle/asset)
   - Read asset by ID
   - Update asset (creates new version)
   - List assets with filters

### Phase 2: Search

**Goal:** Semantic search across all asset types

1. **Vectorize Integration**
   - Generate embeddings on asset creation
   - Index descriptions + content samples
   - Metadata filtering

2. **Search API**
   - Implement `forge_search` endpoint
   - Type/file_type filtering
   - Scoring and ranking
   - Result formatting

### Phase 3: Create (Files)

**Goal:** AI-generated file creation

1. **File Generation Service**
   - LLM integration (Claude/Gemini)
   - Template system for different file types
   - Content validation
   - Error handling

2. **Create API**
   - Implement `forge_create_file` endpoint
   - Hash generation (content-addressed)
   - Automatic versioning
   - Parent/child linking

### Phase 4: Compose

**Goal:** Bundle files into deployable artifacts

1. **Bun Bundler**
   - Bundle React/TS projects
   - Handle imports and dependencies
   - Asset inclusion
   - Minification and optimization

2. **Compose API**
   - Implement `forge_compose` endpoint
   - Ref resolution (latest, semver)
   - Build orchestration
   - Artifact storage and serving

### Phase 5: Assets (Images/Speech)

**Goal:** Port working asset generation from Forge 1.0

1. **Image Generation**
   - Port existing image generation
   - Cache integration
   - Manifest creation

2. **Speech Generation**
   - Port existing speech generation
   - Cache integration
   - Manifest creation

### Phase 6: Advanced Features

1. **Custom Bundlers**
   - Docker-based bundling
   - Pluggable build systems
   - Custom commands

2. **Bundle Search**
   - Search bundles separately
   - Bundle metadata indexing

3. **History and Lineage**
   - Version history API
   - Diff generation
   - Branch visualization

## Development Guidelines

### Code Organization

```
forge-2.0/
├── src/
│   ├── api/              # Hono routes
│   │   ├── search.ts
│   │   ├── create.ts
│   │   ├── compose.ts
│   │   └── version.ts
│   ├── storage/          # R2 and D1 abstractions
│   │   ├── r2.ts
│   │   ├── d1.ts
│   │   └── vectorize.ts
│   ├── versioning/       # Version chain logic
│   │   ├── semver.ts
│   │   ├── refs.ts
│   │   └── chain.ts
│   ├── generation/       # AI generation
│   │   ├── files.ts
│   │   ├── images.ts
│   │   └── speech.ts
│   ├── bundling/         # Build systems
│   │   ├── bun.ts
│   │   └── docker.ts
│   ├── types/            # TypeScript types
│   └── utils/
├── containers/           # Docker configs for bundling
├── migrations/           # D1 migrations
├── tests/
└── docs/
```

### Principles

1. **Immutability** - Assets never change, only new versions created
2. **Content-addressable** - IDs are content hashes
3. **Source of truth** - R2 manifests are authoritative
4. **Fail gracefully** - D1 can be rebuilt from R2
5. **Cache everything** - Identical inputs → identical outputs
6. **Type safety** - Full TypeScript throughout

### Testing Strategy

- Unit tests for version resolution, semver parsing
- Integration tests for R2/D1 operations
- E2E tests for full create → search → compose flows
- Bundling tests with fixtures

## Migration from Forge 1.0

**What to port:**
- Image generation service (working)
- Speech generation service (working)
- Vectorize integration patterns
- Caching strategies

**What to leave behind:**
- ForgeComponent custom runtime
- Single-file transpilation
- Component-specific APIs

**Approach:**
Build Forge 2.0 as greenfield, then port working services after core is stable.

## Success Criteria

Phase 1 is complete when:
1. Assets can be created and stored in R2 with manifests
2. D1 index is populated and queryable
3. Version chains work (parent/child, refs)
4. Basic CRUD operations work end-to-end

Later phases build on this foundation to add search, generation, and composition.

## Questions for Claude Code

As you implement, consider:
1. Error handling strategy - what happens when R2 is slow/down?
2. Migration/rollback - how do we update D1 schema safely?
3. Rate limiting - prevent abuse of AI generation
4. Cost controls - bundle size limits, generation limits
5. Security - input validation, sandboxing

## Current Status

Starting fresh with Phase 1 - building the data model and storage layer.

**Next Immediate Steps:**
1. Create project structure
2. Set up D1 database with schema
3. Implement R2 manifest read/write
4. Build version chain logic
5. Create basic asset CRUD operations

---

*This briefing represents a snapshot of the design. Expect iteration and refinement as implementation reveals insights.*
