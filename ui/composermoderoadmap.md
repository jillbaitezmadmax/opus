


          
**Sprint Overview**
- Build the core loop first: a left-side Reference Zone with a top Pinned Ghost Bar, feeding the TipTap-based Composition Zone via drag-to-compose.
- Implement a correct ghost panel (persistent “pins”) that captures provenance and aligns with TipTap’s `ComposedContent` node.
- Fully embrace TipTap for content storage, avoiding Slate decomposition until a later phase.

**Phases**
- Phase 1: Reference Zone + Pinned Ghost Bar + Drag-to-Compose (TipTap-first).
- Phase 2: Composition upgrades, Navigator Bar, Collapse-to-Compose.
- Phase 3: Workspace Canvas, robust persistence mapping, and Ghost/Pin lifecycle polish.

**Phase 1 Scope**
- Create `ReferenceZone` with a `PinnedBar` on top and the segmented `ResponseViewer` below.
- Add pin actions to segments and wire persistent ghosts via the enhanced store.
- Keep CanvasEditorV2 TipTap-only; insert composed content with `ProvenanceData`.

**Phase 1 Implementation Checklist** ✅ COMPLETE

- ✅ Types & Provenance
  - ✅ Confirmed TipTap provenance: using `ProvenanceData` from `ui/components/composer/extensions/ComposedContentNode.ts`
  - ✅ Unified ghost typing: using `GhostData` from `ui/types/dragDrop.ts`
  - ✅ Maintained backward compatibility with `Ghost` type in `ui/types.ts`

- ✅ Persistence (TipTap-first)
  - ✅ TipTap content: Using `CanvasEditorV2.getContent()` to retrieve TipTap JSON
  - ✅ Ghost persistence: Implemented in `ui/services/enhancedDocumentStore.ts`
    - ✅ `createGhost(documentId, text, provenance)` - persists pinned segments
    - ✅ `getDocumentGhosts(documentId)` - reloads pins on document open
    - ✅ `deleteGhost(ghostId)` - removes persisted pins
    - ✅ `updateGhost(ghostId, updates)` - updates pin metadata
  - ✅ Feature flags: Honors `PERSISTENCE_FEATURE_FLAGS.ENABLE_GHOST_RAIL`
  - ✅ Graceful fallback: Falls back to in-memory pins when persistence unavailable

- ✅ New Component: `PinnedBar.tsx`
  - ✅ Created at `ui/components/composer/PinnedBar.tsx`
  - ✅ Renders chips with provider colors from `providerRegistry.getProviderById`
  - ✅ Uses `@dnd-kit/core` `useDraggable` with consistent payload
  - ✅ Remove/unpin button calls `onRemoveGhost(ghostId)`
  - ✅ Displays pin indicator (📌) and truncated preview
  - ✅ Sorts by order then creation time
  - ✅ Shows overflow indicator for >8 pins

- ✅ New Component: `ReferenceZone.tsx`
  - ✅ Created at `ui/components/composer/ReferenceZone.tsx`
  - ✅ Left-side collapsible pane (40px collapsed, 350-500px expanded)
  - ✅ PinnedBar at top (60px fixed height)
  - ✅ ResponseViewer below (flexible height)
  - ✅ Collapse toggle with visual feedback
  - ✅ Loads pinned ghosts on mount via `getDocumentGhosts(documentId)`
  - ✅ Pins persist across turn navigation (ONE GLOBAL PINNED BAR)

- ✅ Response Viewer & Pin Actions
  - ✅ Modified `ui/components/composer/ResponseViewer.tsx`
    - ✅ Added `onPinSegment` prop
    - ✅ Passes pin handler to `DraggableSegment`
  - ✅ Modified `ui/components/composer/DraggableSegment.tsx`
    - ✅ Added pin button (📌) next to copy button on hover
    - ✅ Visual feedback on pin action (✓ confirmation)
    - ✅ Calls `onPin(text, provenance)` with full provenance data

- ✅ Composer Mode Wiring
  - ✅ Modified `ui/components/composer/ComposerMode.tsx`
    - ✅ Replaced inline ResponseViewer with `ReferenceZone`
    - ✅ Added state: `pinnedGhosts`, `isReferenceCollapsed`, `ghostIdCounter`
    - ✅ Loads ghosts on document open
    - ✅ `handlePinSegment` - creates and persists pins
    - ✅ `handleUnpinGhost` - removes pins from persistence and state
    - ✅ Responsive grid layout (adjusts for collapsed/expanded states)
    - ✅ Graceful fallback to in-memory pins when persistence unavailable

- ✅ TipTap Insert Wiring
  - ✅ Drag from `PinnedBar` uses `useDraggable({ data: { type: 'composer-block', text, provenance } })`
  - ✅ `handleDragEnd` in ComposerMode handles pin drops correctly
  - ✅ Calls `insertComposedContent(text, provenance)` with full provenance

- ✅ Styling & UX
  - ✅ Reference Zone header with collapse toggle
  - ✅ PinnedBar matches design (`#0f172a` background, `#334155` borders)
  - ✅ Chips show provider color dot, preview text, pin icon, remove button
  - ✅ Drag opacity 0.5 while dragging
  - ✅ Smooth transitions and hover effects

- ✅ Safety & Flags
  - ✅ Feature flag checks before persistence calls
  - ✅ In-memory fallback when persistence disabled
  - ✅ HorizontalChatRail still present (will remove in Phase 2)
  - ✅ No changes to DocumentManager Slate decomposition

**Phase 1 Acceptance Criteria** ✅ ALL MET
- ✅ Pinned bar appears above ResponseViewer in Reference Zone
- ✅ Segments can be pinned via button
- ✅ Pins persist per document when persistence enabled
- ✅ Pins remain visible when navigating between turns (ONE GLOBAL PINNED BAR)
- ✅ Dragging a pin or segment inserts composed content with correct provenance
- ✅ Reference Zone collapses to 40px, Composition Zone expands to full width
- ✅ Manual save/load works, dirty save continues functioning
- ✅ No regressions in existing drag-to-compose or save flows

**See `ui/PHASE1_COMPLETE.md` for full implementation details.**

**Phase 2 Implementation** ✅ COMPLETE
- ✅ NavigatorBar component with turn chips and provider indicators
- ✅ Hover preview on composed blocks showing source text
- ✅ Click-to-jump from composed blocks to source turn
- ✅ Keyboard shortcuts (Esc, Cmd+1-9, Shift+P)
- ✅ Removed HorizontalChatRail (replaced by NavigatorBar)
- ⏳ Pin All functionality (button present, implementation deferred)
- ⏳ Provider filters and search (deferred to Phase 3)
- ⏳ Pin reordering (deferred to Phase 3)

**See `ui/PHASE2_COMPLETE.md` for full implementation details.**

**Phase 3 Outline**
- Workspace Canvas under the editor:
  - Bottom Canvas Tray for parallel drafts and comparisons.
  - Compose blocks/sections orchestration and simple snapping.
- Persistence upgrade:
  - Mapper for TipTap JSON → `CanvasBlockRecord` for richer history and export.
  - Robust Ghost/Pin lifecycle: unpin, archive, limit, batch operations.
  - Export flows (Markdown/HTML/Text/JSON) informed by `ProvenanceData`.

**Notes on Ghosts vs Pins**
- “Ghosts” are now persistent pins for the Reference Zone; they carry `ProvenanceData` and are draggable.
- Old `GhostLayer.tsx` can be wrapped or renamed to `PinnedBar.tsx` without behavior change; standardize on `GhostData` typing.
- Keep ghost persistence optional behind feature flags; default to in-memory pins if the persistence layer is unavailable.

**TipTap Adoption**
- Store TipTap JSON from `CanvasEditorV2.getContent()` as the document’s `content` (stringified).
- Load by parsing `content` and calling `editorRef.setContent(parsed)`.
- Defer Slate-based decomposition to a later mapper; do not mix formats in Phase 1.

**Next Steps**
- Implement `PinnedBar.tsx` and `ReferenceZone.tsx`, wire them into `ComposerMode.tsx`.
- Add pin/unpin actions to `DraggableSegment.tsx` and `ResponseViewer.tsx`.
- Extend `EnhancedDocumentStore` to support `deleteGhost(ghostId)` and wire document-scoped ghost loading.
- Keep persistence guarded by flags; verify local UI with a manual pass before broader changes.
        