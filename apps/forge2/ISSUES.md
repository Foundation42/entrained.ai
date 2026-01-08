# Forge 2.0 - Known Issues & Roadmap

Collected from Claude Chat testing sessions (2026-01-07, 2026-01-08)

## P0 - Critical (Must Fix)

### ~~1. No Preview Without Compose~~ ✅ FIXED
- **Issue**: `forge_create` only returns source code, not a viewable preview
- **Status**: FIXED - ALL create/update tools now return `preview_url` automatically!
- **Tools affected**: `forge_create`, `forge_upload`, `forge_update`, `forge_update_source`, `forge_upload_update`
- **Response includes**: `preview_url: "https://.../component-demo-v1-.../content"`
- **Commit**: 8adfc9d, 8cb4fd8

### ~~2. CSS Not Bundled Automatically~~ ✅ FIXED
- **Issue**: Components generate without any styling
- **Status**: FIXED - ALL create/update tools now auto-generate matching CSS
- **Response includes**: `css: { id, content_url }` with the generated stylesheet
- **Commit**: f66d03a, 8cb4fd8

### ~~3. Missing React Imports~~ ✅ FIXED
- **Issue**: Components frequently missing `useState`, `useEffect`, `useRef` imports
- **Status**: FIXED - `fixReactImports()` now auto-detects and adds missing hook imports
- **Commit**: 023345e

### ~~4. External CDN Library Dependencies Not Supported~~ ✅ FIXED (v2)
- **Issue**: Components using Three.js, D3.js, Chart.js, GSAP, etc. fail to render (white screen)
- **Impact**: Blocks 3D visualizations, data viz, audio viz, canvas graphics, animations
- **Status**: FIXED v2 - Migrated from esbuild to **Bun bundler** with native npm resolution!
  - Bun resolves npm packages directly (no CDN workarounds for npm-only packages)
  - @react-three/fiber and @react-three/drei now work!
  - CDN libraries (D3, GSAP, Leaflet, Tone.js) still auto-detected and loaded
  - jsx-runtime shim for React UMD compatibility
- **Supported Libraries**:
  - **npm bundled**: @react-three/fiber, @react-three/drei, three
  - **CDN loaded**: D3, Chart.js, Plotly, Tone.js, P5.js, GSAP, Anime.js, Fabric.js, Konva, Leaflet, Mapbox, Lodash, Axios, Day.js, Moment, and more
- **Commits**: af3b730 (esbuild CDN), 638a3c3 (Bun migration)

---

## P1 - Major (Should Fix Soon)

### 5. No Way to Pass Props in Composition Layout
- **Issue**: When composing, can't dynamically pass props to components in layout HTML
- **Example**: Had to hardcode `audioUrl="..."` in the layout string
- **Impact**: Makes compositions less flexible and reusable
- **Fix**: Support prop binding syntax in layout, e.g. `<Component :prop="value" />`

### ~~6. Tool Descriptions Don't Explain Workflow~~ ✅ FIXED
- **Issue**: Not clear that compose is required for viewable output
- **Status**: FIXED - Tool descriptions now explain workflow clearly:
  - forge_create explains it returns preview_url (no compose needed for single components)
  - forge_compose clarifies it's for MULTIPLE components only
  - forge_about emphasizes calling it first
- **Commit**: 9eb6d5f

### 7. Transparent PNG Generation Errors
- **Issue**: `forge_create_image` with `preset: "icon"` and `transparent: true` can return 500 error
- **Status**: Partially fixed (preset handling), but mask generation can still fail
- **Fix**: Better error handling and fallback for transparency failures

---

## P2 - Medium (Nice to Have)

### 7. Component Metadata Not Utilized
- **Issue**: Components have `demo_props` in metadata but they're not used for auto-preview
- **Opportunity**: Could auto-generate preview using demo props
- **Current**: Demo props only visible via `forge_get_manifest`

### 8. Search Results Mix Types
- **Issue**: `forge_search` returns components, images, and speech mixed together
- **Impact**: Hard to filter results by type
- **Fix**: Add `type` filter parameter (file/asset/bundle)

### 9. No Component-Level CSS
- **Issue**: Can't create or associate CSS files with individual components
- **Impact**: All styling must be global in compose step
- **Fix**: Allow components to optionally bundle their own styles

### 10. Component Communication Unclear
- **Issue**: No clear pattern for how components talk to each other
- **Example**: How does gallery component notify hero of state changes?
- **Fix**: Document event passing / wiring patterns, improve `wiring` in compose

### 11. Debug Tool Limited to Static Analysis
- **Issue**: Only catches import issues, not runtime problems
- **Status**: Acceptable, but could check for common runtime issues

### 23. Debug Tool Shows Stale Analysis (Session 2)
- **Issue**: forge_debug sometimes reports issues that have already been fixed
- **Impact**: Confusing error messages that don't reflect actual code
- **Expected**: Debug should always analyze current source code state

### 24. Component Preview Props Not Configurable (Session 2)
- **Issue**: Auto-generated preview uses demo_props, but can't customize for testing
- **Use Case**: Want to test component with different prop values without composing
- **Suggestion**: Add optional `preview_props` parameter to forge_create

### 25. No Component Gallery/Showcase (Session 2)
- **Issue**: Hard to browse and discover existing components
- **Suggestion**: Web UI or tool to browse all components with live previews
- **Use Cases**: "Show me all button components", "Browse data viz components"

### 26. Canvas Components Don't Show Usage Hints (Session 2)
- **Issue**: Interactive components work but users don't know what to do
- **Suggestion**: Tooltips, keyboard shortcuts, "click to start" messages
- **Priority**: P3 (UX polish)

### 27. No Component Versioning UI (Session 2)
- **Issue**: Can see version numbers but hard to browse version history
- **Suggestion**: Tool to show all versions, what changed, rollback/fork options

### 12. No "Test Before Deploy" for Compositions
- **Issue**: Can't easily verify a composition works with real data before finalizing
- **Impact**: Trial and error workflow
- **Fix**: Preview mode for compositions with sample data

---

## Documentation Needs

### 13. forge_about Should Be More Prominent
- Show key workflow info in tool descriptions or initial guidance

### 14. Asset Integration Patterns
- Best practices for using generated images/speech in components

### 15. External API Integration
- Guidance on connecting components to external services (GoodFaith API, databases)

### 16. CSS Options Not Clear
- Document all styling methods: inline, compose styles, CDN imports, AI-generated CSS

### 17. External Library Integration Patterns (Session 2)
- **Need**: Clear documentation on which libraries are supported
- **Should Cover**:
  - List of pre-configured CDN libraries vs npm-bundled packages
  - How to request new library support
  - ESM vs UMD format handling

### 18. Complex Interactive Component Best Practices (Session 2)
- **Need**: Guidance for building Canvas-based, WebGL/3D, audio/video, real-time components
- **Should Cover**:
  - Performance optimization
  - Cleanup patterns (useEffect cleanup)
  - Event handling and state management

---

## Feature Requests

### ~~17. forge_create_styled Convenience Tool~~ ✅ IMPLEMENTED
- **Status**: No longer needed! ALL create/update tools now return preview_url + CSS automatically

### ~~18. Component CSS Generation~~ ✅ IMPLEMENTED
- **Status**: FIXED - CSS auto-generated for all components from their css_classes

### 19. Batch Asset Operations
- Generate multiple related assets at once with consistent style

### 20. Component Templates/Presets
- Common component patterns (form, card, modal, etc.) as starting points

### 21. Version Diff Tool
- Show what changed between component versions: `forge_diff(v1_id, v2_id)`

### 22. Composition Validation
- Check if all required props are provided before deploying

### 28. Multi-Component Templates (Session 2)
- **Request**: Pre-built templates combining common component sets
- **Examples**: "Blog layout", "Dashboard", "Portfolio site"
- **Benefit**: Faster starting points for common use cases

### 29. Component Playground/Sandbox (Session 2)
- **Request**: Interactive way to modify props and see results live
- **Similar To**: Storybook but built into Forge
- **Features**: Adjust props with sliders/inputs, see changes in real-time

### 30. Component Remix/Fork (Session 2)
- **Request**: Easy way to create variant of existing component
- **Example**: "Take toggle-switch-v1-abc and make it with neon colors"
- **Current Workaround**: Use forge_update but creates new version

---

## New Tools (2026-01-08)

### forge_upload ✨ NEW
- **Purpose**: Upload raw source code WITHOUT using AI generation
- **Use case**: Claude Chat writes the code itself, Forge handles bundling
- **Features**:
  - Metadata (props, css_classes, exports, demo_props) auto-extracted from source
  - CSS auto-generated from extracted class names
  - Preview bundle auto-created
- **Commit**: 8cb4fd8

### forge_upload_update ✨ NEW
- **Purpose**: Update existing component with raw source (no AI)
- **Use case**: Same as forge_upload but for updates
- **Commit**: 8cb4fd8

### Patch/Edit Mode in forge_update_source ✨ NEW
- **Purpose**: Make surgical edits without resending entire source
- **Format**: `{ edits: [{ old: "find this", new: "replace with" }, ...] }`
- **Rules**: Each "old" string must be unique (found exactly once)
- **Benefit**: Efficient small changes, like Claude Code's Edit tool
- **Commit**: 8cb4fd8

---

## What Works Well

### Core Features
- Generation quality (components look professional)
- Semantic search accuracy
- Immutable versioning system
- Update workflow (natural language changes)
- Asset generation speed
- Multi-component composition
- Debug tool for static issues
- Caching system (same input = same output)

### Session 2 Highlights
- ✅ Auto-preview generation (no more compose required!)
- ✅ Auto-CSS generation (components look good immediately!)
- ✅ React imports fixed (useState/useEffect work!)
- ✅ Transparent PNG generation working
- ✅ Canvas API support (drawing worked flawlessly!)
- ✅ Interactive components (buttons, forms, sliders all great)
- ✅ Image generation (all styles work great)
- ✅ Speech generation (worked perfectly)
- ✅ CDN library support (Three.js, D3, GSAP, etc.)

### Session 3 Highlights (2026-01-08)
- ✅ Raw source upload (Claude Chat can write its own code!)
- ✅ Patch/edit mode (surgical changes without full source)
- ✅ @react-three/fiber support (Bun bundler migration)
- ✅ Universal preview_url on all create/update tools

---

## Recently Fixed

### 2026-01-08 (Dogfooding Session - Frontend Build)
- **Components not exposed as globals** - Custom layout scripts couldn't access bundled components
  - Fix: Synthetic entry now exports each component to window (e.g., `window.AppShell = AppShell`)
- **Script ordering wrong** - Custom layout script ran before bundle, globals undefined
  - Fix: Moved `customBody` to AFTER bundle script in HTML template
- **Auto-mount conflict** - Auto-mount rendered all components into #root, conflicting with custom layouts
  - Fix: Skip auto-mount when `customBody` is provided
- **Empty #root taking space** - Empty #root div had `min-height: 100vh`, pushing content down
  - Fix: Added `#root:empty { display: none; }` CSS rule
- **Forge Playground MVP** - Built component gallery UI using Forge itself!
  - Components: AppShell, Header, Sidebar, ComponentCard, ComponentGrid, ComponentDetail
  - Live preview: https://forge2.divine-cell-b9ef.workers.dev/api/assets/forge-playground-v13-eda1/content

### 2026-01-08 (Earlier)
- **Bun bundler migration** - Switched from esbuild to Bun for native npm resolution (638a3c3)
  - @react-three/fiber and @react-three/drei now work!
  - jsx-runtime shim for React UMD compatibility
- **forge_upload** - NEW: Upload raw source without AI generation (8cb4fd8)
- **forge_upload_update** - NEW: Update component with raw source (8cb4fd8)
- **Patch/edit mode** - forge_update_source now supports `edits` array for surgical changes (8cb4fd8)
- **Universal preview_url** - ALL create/update tools now return preview_url + CSS (8cb4fd8)
- **Source parser** - Auto-extracts props, css_classes, exports from uploaded source (8cb4fd8)

### 2026-01-07
- **CDN library support** - Auto-detect and inject CDN scripts for Three.js, D3, Chart.js, GSAP, and 20+ libraries (af3b730)
- **Tool descriptions** - MCP tool descriptions now explain workflow clearly (9eb6d5f)
- **Auto-preview URL** - `forge_create` now returns `preview_url` with rendered component + CSS + demo_props (8adfc9d)
- **Auto-generate CSS** - `forge_create` now generates matching CSS for component's css_classes (f66d03a)
- **Missing React imports** - Post-generation validation now fixes missing useState/useEffect/useRef imports (023345e)
- **Multi-component demo_props** - Compositions now pass props to each component correctly (a8a9edc)
- **updateFile metadata** - Updates now preserve props/demo_props metadata (6bf445a)
- **forge_create_image presets** - Preset options now apply correctly (25dcc97)
- **esbuild minification bug** - Upgraded to 0.27.0 to fix syntax errors (7d3a2ab)
