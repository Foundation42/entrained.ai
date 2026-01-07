# Forge 2.0 - Known Issues & Roadmap

Collected from Claude Chat testing session (2026-01-07)

## P0 - Critical (Must Fix)

### 1. No Preview Without Compose
- **Issue**: `forge_create` only returns source code, not a viewable preview
- **Impact**: Can't see what you created without an extra compose step
- **Expected**: Components should have immediate demo/preview URL upon creation
- **Fix**: Auto-generate single-component bundle with demo_props after creation

### 2. CSS Not Bundled Automatically
- **Issue**: Components generate without any styling
- **Impact**: Everything looks broken until you manually add CSS
- **Expected**: Components should include default/demo styles or make it clear styling is separate
- **Fix**: Option A) Generate CSS alongside TSX, Option B) Inline critical styles in component

### 3. Missing React Imports
- **Issue**: Components frequently missing `useState`, `useEffect`, `useRef` imports
- **Impact**: Components fail at runtime even though they compile
- **Detection**: `forge_debug` catches these, but shouldn't generate broken code
- **Fix**: Add post-generation validation that checks for React hook usage without imports

---

## P1 - Major (Should Fix Soon)

### 4. No Way to Pass Props in Composition Layout
- **Issue**: When composing, can't dynamically pass props to components in layout HTML
- **Example**: Had to hardcode `audioUrl="..."` in the layout string
- **Impact**: Makes compositions less flexible and reusable
- **Fix**: Support prop binding syntax in layout, e.g. `<Component :prop="value" />`

### 5. Tool Descriptions Don't Explain Workflow
- **Issue**: Not clear that compose is required for viewable output
- **Impact**: Confusion about when to use each tool
- **Fix**: Update MCP tool descriptions to clarify workflow

### 6. Transparent PNG Generation Errors
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

---

## Feature Requests

### 17. forge_create_styled Convenience Tool
- Single tool that creates component + CSS + preview in one call

### 18. Component CSS Generation
- AI-generate matching CSS for a component: `forge_create_css(component_id, style_description)`

### 19. Batch Asset Operations
- Generate multiple related assets at once with consistent style

### 20. Component Templates/Presets
- Common component patterns (form, card, modal, etc.) as starting points

### 21. Version Diff Tool
- Show what changed between component versions: `forge_diff(v1_id, v2_id)`

### 22. Composition Validation
- Check if all required props are provided before deploying

---

## What Works Well

- Generation quality (components look professional)
- Semantic search accuracy
- Immutable versioning system
- Update workflow (natural language changes)
- Asset generation speed
- Multi-component composition
- Debug tool for static issues
- Caching system (same input = same output)
- Demo props now passed to composed components (fixed 2026-01-07)

---

## Recently Fixed

- **Multi-component demo_props** - Compositions now pass props to each component correctly (a8a9edc)
- **updateFile metadata** - Updates now preserve props/demo_props metadata (6bf445a)
- **forge_create_image presets** - Preset options now apply correctly (25dcc97)
- **esbuild minification bug** - Upgraded to 0.27.0 to fix syntax errors (7d3a2ab)
