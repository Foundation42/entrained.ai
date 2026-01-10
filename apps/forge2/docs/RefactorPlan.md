Component Model Refactor Plan

     Overview

     Refactor Forge2 from "Assets with embedded versioning" to "Components with Versions" with a draft/publish workflow - separating the conceptual entity (Component) from its
     immutable snapshots (Versions), and allowing iteration before publishing.

     Key Changes
     ┌────────────────┬───────────────────────────────────┬────────────────────────────────────────────────────┐
     │     Aspect     │              Current              │                        New                         │
     ├────────────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
     │ ID format      │ battlezone-audio-v1-ebc7          │ Component: ebc7-4f2a, Version: ebc7-4f2a-v1        │
     ├────────────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
     │ canonical_name │ Must be unique                    │ NOT unique (many "stopwatch" components allowed)   │
     ├────────────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
     │ Search         │ Returns all versions (duplicates) │ Returns one result per published Component         │
     ├────────────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
     │ Vectorize      │ One vector per version            │ One vector per component (indexed on publish only) │
     ├────────────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
     │ Update         │ Creates new Asset with new ID     │ Overwrites draft until published                   │
     ├────────────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
     │ Workflow       │ Every change = new version        │ Draft → iterate → publish                          │
     └────────────────┴───────────────────────────────────┴────────────────────────────────────────────────────┘
     New Data Model

     Component (searchable entity)
     ├── id: "ebc7-4f2a"              (short UUID)
     ├── canonical_name: "stopwatch"   (AI-generated, NOT unique)
     ├── status: "draft" | "published" ← NEW
     ├── type: "file"
     ├── file_type: "tsx"
     ├── description: "..."
     ├── latest_version: 3             (published versions only)
     ├── creator: null                 (optional, for future auth)
     ├── created_at: "..."
     ├── updated_at: "..."             ← NEW (for draft expiry)
     │
     ├── Draft (mutable, overwritten on each update)
     │   └── {component_id}/draft/content   (R2 key)
     │   └── {component_id}/draft/manifest  (R2 key)
     │
     └── Published Versions (immutable)
         ├── ebc7-4f2a-v1: { content, provenance, metadata, ... }
         ├── ebc7-4f2a-v2: { content, provenance, metadata, ... }
         └── ebc7-4f2a-v3: { content, provenance, metadata, ... }

     Draft/Publish Workflow

     ┌─────────────────────────────────────────────────────────────────┐
     │                        DRAFT MODE                                │
     │  - Component exists but status="draft"                          │
     │  - NOT indexed in Vectorize (not searchable)                    │
     │  - Updates OVERWRITE the draft (no versions yet)                │
     │  - Has preview_url for live testing                             │
     │  - Auto-expires after 48hrs of inactivity (optional cleanup)    │
     └─────────────────────────────────────────────────────────────────┘
                                   │
                                   │ forge_publish(component_id)
                                   ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                      PUBLISHED                                   │
     │  - status="published", latest_version=1                         │
     │  - Indexed in Vectorize (searchable)                            │
     │  - Draft content moved to v1                                    │
     │  - Immutable - can't change v1                                  │
     └─────────────────────────────────────────────────────────────────┘
                                   │
                                   │ forge_update(component_id, changes)
                                   ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                    DRAFT (v2 WIP)                               │
     │  - Creates new draft from latest published (v1)                 │
     │  - Iterate freely, overwrites draft                             │
     │  - Published v1 still searchable                                │
     └─────────────────────────────────────────────────────────────────┘
                                   │
                                   │ forge_publish(component_id)
                                   ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                    PUBLISHED (v2)                               │
     │  - latest_version=2                                             │
     │  - Vector updated to reflect v2 content                         │
     │  - v1 still exists in history                                   │
     └─────────────────────────────────────────────────────────────────┘

     MCP Tool Flow

     // 1. Create new component (starts as draft)
     forge_create("A neon stopwatch with lap times")
       → { component_id: "ebc7-4f2a", status: "draft", preview_url: "..." }

     // 2. Iterate on draft (overwrites, no new versions)
     forge_update("ebc7-4f2a", "make the numbers bigger")
       → { component_id: "ebc7-4f2a", status: "draft", preview_url: "..." }

     forge_update("ebc7-4f2a", "add a reset button")
       → { component_id: "ebc7-4f2a", status: "draft", preview_url: "..." }

     // 3. Publish when ready
     forge_publish("ebc7-4f2a")
       → { component_id: "ebc7-4f2a", status: "published", version: 1 }
       → NOW searchable via forge_search

     // 4. Later: update published component (creates new draft)
     forge_update("ebc7-4f2a", "fix the lap time bug")
       → { component_id: "ebc7-4f2a", status: "published", draft: true, preview_url: "..." }
       → v1 still searchable, draft is WIP for v2

     // 5. Publish v2
     forge_publish("ebc7-4f2a")
       → { component_id: "ebc7-4f2a", status: "published", version: 2 }
       → Search now returns v2 content

     Implementation Steps

     Phase 1: Types (src/types/index.ts)

     Add new types:
     type ComponentStatus = 'draft' | 'published';

     interface Component {
       id: string;                    // "ebc7-4f2a"
       canonical_name: string;        // AI-generated, NOT unique
       status: ComponentStatus;       // NEW
       type: ComponentType;
       file_type?: string;
       media_type?: MediaType;
       description: string;
       latest_version: number;        // 0 if never published
       has_draft: boolean;            // NEW - true if WIP draft exists
       creator?: string;
       created_at: string;
       updated_at: string;            // NEW - for draft expiry
     }

     interface Version {
       id: string;                    // "ebc7-4f2a-v1"
       component_id: string;
       version: number;
       parent_version_id?: string;
       description?: string;          // Changelog for this version
       content_url: string;
       manifest_url: string;
       size?: number;
       mime_type?: string;
       created_at: string;
       provenance: VersionProvenance;
       metadata: Record<string, unknown>;
       dependencies: string[];
     }

     interface Draft {
       component_id: string;
       content_url: string;
       manifest_url: string;
       preview_url?: string;
       updated_at: string;
     }

     Phase 2: Database Schema (migrations/0002_components_and_versions.sql)

     CREATE TABLE components (
       id TEXT PRIMARY KEY,
       canonical_name TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published'
       type TEXT NOT NULL,
       file_type TEXT,
       media_type TEXT,
       description TEXT NOT NULL,
       latest_version INTEGER NOT NULL DEFAULT 0,  -- 0 = never published
       has_draft INTEGER NOT NULL DEFAULT 1,       -- boolean
       creator TEXT,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     );

     CREATE TABLE versions (
       id TEXT PRIMARY KEY,
       component_id TEXT NOT NULL,
       version INTEGER NOT NULL,
       parent_version_id TEXT,
       description TEXT,
       content_url TEXT NOT NULL,
       manifest_url TEXT NOT NULL,
       size INTEGER,
       mime_type TEXT,
       created_at INTEGER NOT NULL,
       FOREIGN KEY (component_id) REFERENCES components(id),
       UNIQUE (component_id, version)
     );

     -- Indexes
     CREATE INDEX idx_components_status ON components(status);
     CREATE INDEX idx_components_canonical ON components(canonical_name);
     CREATE INDEX idx_components_type ON components(type, file_type);
     CREATE INDEX idx_components_updated ON components(updated_at);
     CREATE INDEX idx_versions_component ON versions(component_id, version DESC);

     -- Drop old tables
     DROP TABLE IF EXISTS version_children;
     DROP TABLE IF EXISTS version_refs;
     DROP TABLE IF EXISTS assets;

     Phase 3: R2 Storage Structure

     {component_id}/
     ├── draft/
     │   ├── content          (mutable - overwritten on updates)
     │   └── manifest.json    (mutable - current draft state)
     │
     └── versions/
         ├── v1/
         │   ├── content      (immutable)
         │   └── manifest.json
         ├── v2/
         │   ├── content
         │   └── manifest.json
         └── ...

     Phase 4: ID Generation (src/versioning/chain.ts)

     generateComponentId()           → "ebc7-4f2a"
     generateVersionId(cid, ver)     → "ebc7-4f2a-v1"
     getDraftKey(componentId)        → "{componentId}/draft/content"
     getVersionKey(componentId, ver) → "{componentId}/versions/v{ver}/content"

     Phase 5: D1 Storage (src/storage/d1.ts)

     Add methods:
     - createComponent(component) - creates with status='draft'
     - getComponent(id)
     - updateComponentDraft(id) - updates updated_at, sets has_draft=true
     - publishComponent(id, version) - sets status='published', latest_version=N, has_draft=false
     - listComponents(options) - can filter by status
     - listPublishedComponents() - status='published' only
     - createVersion(version)
     - getVersion(id)
     - getLatestVersion(componentId)
     - getVersionHistory(componentId)

     Phase 6: Vectorize Storage (src/storage/vectorize.ts)

     Key change: Only index on publish, not on create/update

     // Called ONLY when publishing
     indexComponent(componentId, embedding, metadata)

     // Called when publishing new version (upserts existing)
     updateComponentVector(componentId, embedding, metadata)

     // Search only returns published components
     searchComponents(query, options)

     Phase 7: Component Service (src/services/components.ts)

     class ComponentService {
       // Create new draft component
       async create(input): Promise<ComponentWithDraft> {
         // 1. Generate component ID
         // 2. Create component record (status='draft')
         // 3. Store draft content in R2
         // 4. Generate preview bundle
         // 5. DO NOT index in Vectorize yet
         return { component, draft, preview_url };
       }

       // Update draft (overwrites, no versioning)
       async updateDraft(componentId, input): Promise<ComponentWithDraft> {
         // 1. Get component
         // 2. If published with no draft, copy latest version to draft
         // 3. Overwrite draft content in R2
         // 4. Update component.updated_at, has_draft=true
         // 5. Generate new preview
         // 6. DO NOT index in Vectorize
         return { component, draft, preview_url };
       }

       // Publish draft → creates new version
       async publish(componentId): Promise<ComponentWithVersion> {
         // 1. Get component and draft
         // 2. Calculate next version number
         // 3. Move draft content to version slot in R2
         // 4. Create version record in D1
         // 5. Update component: status='published', latest_version++, has_draft=false
         // 6. Generate embedding
         // 7. Index/upsert in Vectorize (NOW searchable)
         // 8. Delete draft from R2
         return { component, version };
       }

       // Search only returns published components
       async search(query): Promise<SearchResult[]> {
         return this.vectorize.searchComponents(query);
       }

       // Get component (returns draft if exists, else latest published)
       async get(id): Promise<ComponentWithContent> { ... }

       // Get version history
       async getVersionHistory(componentId): Promise<Version[]> { ... }

       // Delete component (all versions + draft + vector)
       async delete(componentId): Promise<void> { ... }

       // Cleanup expired drafts (called by cron)
       async cleanupExpiredDrafts(maxAgeHours = 48): Promise<{ deleted: number }> { ... }
     }

     Phase 8: API Routes (src/api/components.ts)

     GET  /api/components              // List (can filter by status)
     POST /api/components              // Create new draft
     GET  /api/components/:id          // Get component + draft or latest version
     PUT  /api/components/:id          // Update draft
     POST /api/components/:id/publish  // Publish draft → new version
     GET  /api/components/:id/versions // Get version history
     GET  /api/components/:id/versions/:v  // Get specific version
     DELETE /api/components/:id        // Delete component

     Phase 9: Update Forge API (src/api/forge.ts)

     forge_create(description)     // → Creates draft, returns preview_url
     forge_update(id, changes)     // → Updates draft, returns preview_url
     forge_update_source(id, src)  // → Updates draft source directly
     forge_publish(id)             // → Publishes draft, NOW searchable
     forge_search(query)           // → Only returns published components
     forge_get_manifest(id)        // → Returns published version (or draft if specified)

     Phase 10: Canonical Name Generation

     Use Workers AI to generate short names:
     async generateCanonicalName(description: string): Promise<string> {
       const prompt = `Generate a short 2-3 word kebab-case name for this component.
     Description: ${description}
     Examples: neon-stopwatch, audio-player, bus-schedule, pixel-fireworks
     Name:`;

       const result = await ai.run('@cf/meta/llama-3-8b-instruct', { prompt });
       return slugify(result).slice(0, 30);
     }

     Phase 11: Draft Cleanup (Optional Cron)

     // In wrangler.jsonc - scheduled trigger
     [triggers]
     crons = ["0 */6 * * *"]  // Every 6 hours

     // Handler
     async scheduled(event, env) {
       const service = new ComponentService(env, '');
       const { deleted } = await service.cleanupExpiredDrafts(48);
       console.log(`Cleaned up ${deleted} expired drafts`);
     }

     Files to Modify
     ┌────────────────────────────┬────────┬────────────────────────────────────────────────┐
     │            File            │ Action │                  Description                   │
     ├────────────────────────────┼────────┼────────────────────────────────────────────────┤
     │ src/types/index.ts         │ MODIFY │ Add Component, Version, Draft, ComponentStatus │
     ├────────────────────────────┼────────┼────────────────────────────────────────────────┤
     │ migrations/0002_*.sql      │ CREATE │ New schema with status, has_draft              │
     ├────────────────────────────┼────────┼────────────────────────────────────────────────┤
     │ src/versioning/chain.ts    │ MODIFY │ New ID generation, draft keys                  │
     ├────────────────────────────┼────────┼────────────────────────────────────────────────┤
     │ src/storage/d1.ts          │ MODIFY │ Component/version CRUD with status             │
     ├────────────────────────────┼────────┼────────────────────────────────────────────────┤
     │ src/storage/r2.ts          │ MODIFY │ Draft and version key structure                │
     ├────────────────────────────┼────────┼────────────────────────────────────────────────┤
     │ src/storage/vectorize.ts   │ MODIFY │ Index by component_id, published only          │
     ├────────────────────────────┼────────┼────────────────────────────────────────────────┤
     │ src/services/components.ts │ CREATE │ ComponentService with draft/publish            │
     ├────────────────────────────┼────────┼────────────────────────────────────────────────┤
     │ src/api/components.ts      │ CREATE │ REST API routes                                │
     ├────────────────────────────┼────────┼────────────────────────────────────────────────┤
     │ src/api/forge.ts           │ MODIFY │ MCP endpoints use ComponentService             │
     ├────────────────────────────┼────────┼────────────────────────────────────────────────┤
     │ src/index.ts               │ MODIFY │ Mount routes, add cron handler                 │
     └────────────────────────────┴────────┴────────────────────────────────────────────────┘
     Verification

     1. Type check: npx tsc --noEmit
     2. Deploy: npx wrangler deploy
     3. Test draft workflow:
     # Create draft
     curl -X POST .../api/forge/create -d '{"description": "stopwatch"}'
     # → status: "draft", preview_url exists

     # Update draft (same component, no new version)
     curl -X POST .../api/forge/{id}/update -d '{"changes": "make it blue"}'
     # → still draft, same component_id

     # Search should NOT find it yet
     curl .../api/forge/search?q=stopwatch
     # → empty results

     # Publish
     curl -X POST .../api/components/{id}/publish
     # → status: "published", version: 1

     # NOW search finds it
     curl .../api/forge/search?q=stopwatch
     # → returns the component
     4. Test version workflow:
     # Update published component (creates draft for v2)
     curl -X POST .../api/forge/{id}/update -d '{"changes": "add feature"}'
     # → has_draft: true

     # Publish v2
     curl -X POST .../api/components/{id}/publish
     # → version: 2

     # Check history
     curl .../api/components/{id}/versions
     # → [v2, v1]

     Notes

     - Databases are empty - clean implementation
     - Search only indexes published components - no noise from WIP
     - Drafts auto-expire (configurable) to prevent orphaned content
     - creator field ready for future auth
     - Preview URLs work for drafts (live testing before publish)

