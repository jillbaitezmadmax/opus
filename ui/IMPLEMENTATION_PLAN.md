# Composer Mode Refactor - Complete Implementation Plan

## Executive Summary

This plan consolidates the vision from `composerplan.md`, `composermoderoadmap.md`, and `composer reference.md` into a complete, actionable implementation roadmap. The refactor transforms Composer Mode from a response viewer into a **Synthesis Canvas** - a provenance-first composition workspace.

## Core Vision

**Replace horizontal rail → vertical Reference Zone with persistent pinned bar → keep CanvasEditorV2 as Composition Zone → add Navigator bar → introduce Bottom Canvas Tray for parallel thinking.**

### Key Principle: **ONE GLOBAL PINNED BAR**

**CRITICAL CLARIFICATION**: The pinned bar is **document-scoped and persistent**, NOT turn-dependent. Pins remain visible across all turn navigation. The pinned bar does not reload based on the current document - there is ONE pinned bar per document that accumulates pins as the user works.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ NAVIGATOR BAR (Phase 2)                                         │
│ [Turn 1] [Turn 2●] [Turn 3] [Pin All] [Collapse Toggle]        │
├──────────────────┬──────────────────────────────────────────────┤
│ REFERENCE ZONE   │ COMPOSITION ZONE                             │
│ (Collapsible)    │ (CanvasEditorV2 - TipTap)                    │
│                  │                                               │
│ ┌──────────────┐ │ # My Synthesis                               │
│ │ PINNED BAR   │ │                                               │
│ │ [Pin1][Pin2] │ │ Composed content with provenance...          │
│ └──────────────┘ │ ^ Turn 2, Provider X                         │
│                  │                                               │
│ Response Viewer  │                                               │
│ • Response A     │                                               │
│ • Response B     │                                               │
└──────────────────┴──────────────────────────────────────────────┘
│ BOTTOM CANVAS TRAY (Phase 3)                                    │
│ [Canvas 1●] [Canvas 2] [+]                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Core Loop (MVP) - PRIORITY

### Goals
Deliver the essential composition workflow: navigate responses, drag fragments, pin critical snippets with persistence, compose with provenance, save/load documents.

### 1.1 Type Unification & Persistence Setup

**Status**: Foundation work

**Tasks**:
- ✓ Confirm `ProvenanceData` from `ComposedContentNode.ts` as canonical
- ✓ Use `GhostData` from `ui/types/dragDrop.ts` for pins (has `ProvenanceData`)
- ✓ Keep `Ghost` type in `ui/types.ts` for backward compatibility
- Extend `EnhancedDocumentStore` with missing ghost methods:
  - `deleteGhost(ghostId: string): Promise<void>`
  - `updateGhost(ghostId: string, updates: Partial<GhostData>): Promise<void>`
- Wire persistence through `extensionBridge` to IndexedDB adapter
- Honor `PERSISTENCE_FEATURE_FLAGS.ENABLE_GHOST_RAIL` flag
- Graceful fallback to in-memory pins when persistence unavailable

**Files to modify**:
- `ui/services/enhancedDocumentStore.ts` - Add `deleteGhost`, `updateGhost`
- `ui/types/dragDrop.ts` - Ensure `GhostData` has `order` field

### 1.2 PinnedBar Component

**Purpose**: Top rail in Reference Zone showing persistent pinned ghosts as draggable chips.

**Component**: `ui/components/composer/PinnedBar.tsx`

**Props**:
```typescript
interface PinnedBarProps {
  ghosts: GhostData[];
  onRemoveGhost: (ghostId: string) => void;
  onReorderGhosts?: (ghostIds: string[]) => void;
}
```

**Behavior**:
- Render chips with provider color from `providerRegistry.getProviderById()`
- Use `@dnd-kit/core` `useDraggable` with `data={{ type: 'composer-block', text: ghost.text, provenance: ghost.provenance }}`
- Display pin indicator (📌), truncated preview, provider dot
- Remove button calls `onRemoveGhost(ghostId)`
- Sort by `ghost.order` then `ghost.createdAt`
- Horizontal scroll for overflow
- Fixed height ~60px

**Implementation Strategy**:
- Adapt existing `GhostLayer.tsx` component (rename/wrap)
- Reuse `GhostChip` styling and drag logic
- Update drag payload to match `ComposerMode.handleDragEnd` expectations

**Files**:
- Create: `ui/components/composer/PinnedBar.tsx`

### 1.3 ReferenceZone Component

**Purpose**: Left-side collapsible pane = PinnedBar (top) + ResponseViewer (below).

**Component**: `ui/components/composer/ReferenceZone.tsx`

**Props**:
```typescript
interface ReferenceZoneProps {
  turn: ChatTurn | null;
  response?: ResponseBlock;
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
  pinnedGhosts: GhostData[];
  onPinSegment: (text: string, provenance: ProvenanceData) => Promise<void>;
  onUnpinGhost: (ghostId: string) => Promise<void>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}
```

**Layout**:
```
┌─────────────────────────┐
│ Header                  │
│ [Collapse] [Granularity]│
├─────────────────────────┤
│ PinnedBar (60px fixed)  │
│ [Pin1] [Pin2] [Pin3]    │
├─────────────────────────┤
│ ResponseViewer (flex)   │
│ • Response content      │
│ • Draggable segments    │
└─────────────────────────┘
```

**Behavior**:
- Collapsed state: 40px width, show collapse toggle only
- Expanded state: 30% width (or 400px min)
- Load pinned ghosts on mount: `enhancedDocumentStore.getDocumentGhosts(documentId)`
- Pin action: `createGhost(documentId, text, provenance)` → append to local state
- Unpin action: `deleteGhost(ghostId)` → filter from local state
- Pass `onPinSegment` down to ResponseViewer

**Files**:
- Create: `ui/components/composer/ReferenceZone.tsx`

### 1.4 Pin Actions in ResponseViewer & DraggableSegment

**Modifications to `ResponseViewer.tsx`**:
- Add `onPinSegment?: (text: string, provenance: ProvenanceData) => void` prop
- Pass down to each `DraggableSegment`

**Modifications to `DraggableSegment.tsx`**:
- Add `onPin?: (text: string, provenance: ProvenanceData) => void` prop
- Add pin button (📌) next to copy button on hover
- On click: `e.stopPropagation(); onPin?.(segment.text, provenance);`
- Visual feedback: show pinned state if segment is already pinned (optional)

**Alternative**: Alt+Click to pin (simpler, no UI clutter)

**Files to modify**:
- `ui/components/composer/ResponseViewer.tsx`
- `ui/components/composer/DraggableSegment.tsx`

### 1.5 ComposerMode Integration

**State additions**:
```typescript
const [pinnedGhosts, setPinnedGhosts] = useState<GhostData[]>([]);
const [isReferenceCollapsed, setIsReferenceCollapsed] = useState(false);
const [ghostIdCounter, setGhostIdCounter] = useState(0);
```

**Document lifecycle**:
- On mount / document load:
  ```typescript
  const documentId = currentDocument?.id || 'scratch';
  const ghosts = await enhancedDocumentStore.getDocumentGhosts(documentId);
  setPinnedGhosts(ghosts);
  ```
- On pin segment:
  ```typescript
  const handlePinSegment = async (text: string, provenance: ProvenanceData) => {
    const documentId = currentDocument?.id || 'scratch';
    const ghost = await enhancedDocumentStore.createGhost(documentId, text, provenance);
    setPinnedGhosts(prev => [...prev, ghost]);
  };
  ```
- On unpin:
  ```typescript
  const handleUnpinGhost = async (ghostId: string) => {
    await enhancedDocumentStore.deleteGhost(ghostId);
    setPinnedGhosts(prev => prev.filter(g => g.id !== ghostId));
  };
  ```

**Layout changes**:
- Replace `HorizontalChatRail` visual with `ReferenceZone` (keep rail at bottom for Phase 1 compatibility)
- Grid layout: `gridTemplateColumns: isReferenceCollapsed ? '40px 1fr' : '400px 1fr'`
- Pass `ReferenceZone` all required props

**Drag handling**:
- Update `handleDragEnd` to handle ghost drops:
  ```typescript
  if (payload?.ghost) {
    editorRef.current?.insertComposedContent(payload.ghost.text, payload.ghost.provenance);
  }
  ```

**Files to modify**:
- `ui/components/composer/ComposerMode.tsx`

### 1.6 TipTap Persistence (Already Working)

**Current state**: ✓ Working
- `editorRef.current?.getContent()` returns TipTap JSON
- `DocumentRecord.content` stores stringified JSON
- Load: `JSON.parse(document.content)` → `editorRef.current.setContent()`

**No changes needed** - Phase 1 uses existing save/load flow.

### Phase 1 Acceptance Criteria

- [ ] Pinned bar appears above ResponseViewer in Reference Zone
- [ ] Segments can be pinned via button (or Alt+Click)
- [ ] Pins persist per document when persistence enabled
- [ ] Pins remain visible when navigating between turns
- [ ] Dragging a pin or segment inserts composed content with correct provenance
- [ ] Reference Zone collapses to 40px, Composition Zone expands to full width
- [ ] Manual save/load works, dirty save continues functioning
- [ ] No regressions in existing drag-to-compose or save flows

---

## Phase 2: Interaction Enhancements

### Goals
Add navigation polish, hover previews, jump-to-source, and refined pin persistence.

### 2.1 NavigatorBar Component

**Component**: `ui/components/composer/NavigatorBar.tsx`

**Props**:
```typescript
interface NavigatorBarProps {
  turns: ChatTurn[];
  currentTurnIndex: number;
  pinnedTurnIds: Set<string>;
  onSelectTurn: (index: number) => void;
  onPinAll: () => void;
  onToggleReferenceCollapse: () => void;
  isReferenceCollapsed: boolean;
}
```

**Layout**:
```
[Turn 1] [Turn 2●] [Turn 3] ... [Pin All] [<< Collapse]
```

**Behavior**:
- Turn chips show index, active state (●), pinned state (📌)
- Click chip → select turn, expand Reference Zone if collapsed
- Pin All → pin all responses in current turn
- Collapse toggle → collapse/expand Reference Zone

**Files**:
- Create: `ui/components/composer/NavigatorBar.tsx`

### 2.2 Hover Preview & Click-to-Jump

**Hover Preview**:
- On `mouseenter` of composed block (`.composed-block`), show tooltip with `provenance.sourceText`
- Use floating card positioned near cursor
- Show provider, granularity, timestamp

**Click-to-Jump**:
- On click of composed block:
  1. Expand Reference Zone if collapsed
  2. Set `currentTurnIndex` to provenance turn
  3. Scroll to source response in ResponseViewer
  4. Highlight source segment (flash animation)

**Implementation**:
- Add click handler to `ComposedContentNode` via TipTap node view
- Emit event to `ComposerMode`: `onJumpToSource(provenance)`
- Add `highlightSegmentId` state in `ResponseViewer`

**Files to modify**:
- `ui/components/composer/extensions/ComposedContentNode.ts`
- `ui/components/composer/ComposerMode.tsx`
- `ui/components/composer/ResponseViewer.tsx`

### 2.3 Refined Pin Persistence

**Enhancements**:
- Pin ordering via drag-to-reorder in PinnedBar
- Soft cap (8 pins) with overflow indicator
- Pin metadata: timestamp, usage count, last accessed

**Files to modify**:
- `ui/components/composer/PinnedBar.tsx`
- `ui/services/enhancedDocumentStore.ts`

### Phase 2 Acceptance Criteria

- [ ] Navigator bar provides quick turn navigation
- [ ] Hover on composed block shows source preview
- [ ] Click on composed block jumps to source and highlights
- [ ] Pin ordering persists across sessions
- [ ] Keyboard shortcuts work (Esc to collapse, Shift+P to pin)

---

## Phase 3: Advanced Surfaces

### Goals
Add Bottom Canvas Tray for parallel thinking, smart ingestion, and export flows.

### 3.1 Bottom Canvas Tray

**Components**:
- `ui/components/composer/CanvasTray.tsx` - Parent container
- `ui/components/composer/CanvasTab.tsx` - Tab items
- `ui/components/composer/CanvasScratchpad.tsx` - Individual canvas editor

**Layout**:
```
┌─────────────────────────────────────────┐
│ [Canvas 1●] [Canvas 2] [Canvas 3] [+]   │
├─────────────────────────────────────────┤
│ Canvas 1 Content (TipTap editor)        │
│ - Extracted fragment 1                  │
│ - Extracted fragment 2                  │
└─────────────────────────────────────────┘
```

**Behavior**:
- Tabbed interface with add/remove/rename
- Each canvas is a lightweight TipTap editor
- "Extract to Canvas" action from ResponseViewer or Composition Zone
- Drag from canvas to main Composition Zone (same provenance flow)
- Optional persistence: `DocumentRecord.type='canvas'`

**Files**:
- Create: `ui/components/composer/CanvasTray.tsx`
- Create: `ui/components/composer/CanvasTab.tsx`
- Create: `ui/components/composer/CanvasScratchpad.tsx`

### 3.2 Smart Ingestion

**Features**:
- **Trim Fluff**: Remove boilerplate phrases on drop ("Sure, here's...", "I hope this helps")
- **Suggest Related**: Show up to 3 similar fragments from same response (inline hint)
- **Auto-group**: Wrap >3 drops in short succession under heading

**Implementation**:
- Client-side deterministic rules (regex-based)
- Non-blocking inline hints (no modals)
- Preferences toggle in ComposerToolbar

**Files to modify**:
- `ui/components/composer/ComposerMode.tsx` - Add ingestion logic
- `ui/components/composer/ComposerToolbar.tsx` - Add preferences toggle

### Phase 3 Acceptance Criteria

- [ ] Canvas Tray supports creating/switching tabs
- [ ] Extract to Canvas works from ResponseViewer and Composition
- [ ] Drag from canvas to main editor preserves provenance
- [ ] Smart ingestion trims fluff and suggests related fragments
- [ ] Export flows (Markdown/HTML/Text) preserve provenance metadata

---

## Implementation Sequence

### Sprint 1 (Phase 1 - Days 1-3)
1. ✓ Read and understand codebase
2. Extend `EnhancedDocumentStore` with ghost methods
3. Create `PinnedBar.tsx` (adapt from `GhostLayer.tsx`)
4. Create `ReferenceZone.tsx`
5. Add pin actions to `DraggableSegment.tsx` and `ResponseViewer.tsx`
6. Wire `ReferenceZone` into `ComposerMode.tsx`
7. Test: pin/unpin, drag from pins, collapse, persistence

### Sprint 2 (Phase 2 - Days 4-5)
1. Create `NavigatorBar.tsx`
2. Add hover preview to composed blocks
3. Implement click-to-jump
4. Add keyboard shortcuts
5. Test: navigation, previews, jump-to-source

### Sprint 3 (Phase 3 - Days 6-7)
1. Create Canvas Tray components
2. Implement extract-to-canvas
3. Add smart ingestion rules
4. Polish export flows
5. Test: canvas workflow, ingestion, exports

---

## Critical Design Decisions

### 1. Pin Persistence Scope
**Decision**: Pins are document-scoped, NOT turn-scoped.
**Rationale**: User wants ONE persistent pinned bar that accumulates across all work on a document. Pins don't reload when switching turns.

### 2. Ghost vs Pin Terminology
**Decision**: Use "pins" in UI, "ghosts" in persistence layer.
**Rationale**: "Pins" is more intuitive for users. "Ghosts" is legacy term from original design.

### 3. TipTap-First Storage
**Decision**: Store raw TipTap JSON, defer Slate decomposition.
**Rationale**: Simpler Phase 1, faster iteration. Block decomposition can be added later for analytics.

### 4. Collapse Default State
**Decision**: Reference Zone starts expanded in Phase 1, collapsed in Phase 2+.
**Rationale**: Phase 1 focuses on core workflow. Phase 2 optimizes for composition-first UX.

### 5. Persistence Fallback
**Decision**: Graceful degradation to in-memory pins when persistence unavailable.
**Rationale**: Don't block core workflow if IndexedDB fails. User can still work, just loses persistence.

---

## Risk Mitigation

### Risk 1: Persistence Layer Unavailable
**Mitigation**: Feature flag + in-memory fallback. Test both paths.

### Risk 2: Drag-and-Drop Conflicts
**Mitigation**: Maintain existing DnD Kit sensors and payload structure. Test all drag sources.

### Risk 3: Performance with Many Pins
**Mitigation**: Soft cap at 8 pins, virtualized rendering if needed, lazy load ghosts.

### Risk 4: TipTap JSON Migration
**Mitigation**: Keep backward compatibility with `canvasContent` field. Prefer `content` field when available.

---

## Testing Strategy

### Unit Tests
- Ghost CRUD operations in `EnhancedDocumentStore`
- Drag payload validation
- Provenance mapping logic

### Integration Tests
- Pin → Drag → Compose → Save → Load round-trip
- Reference Zone collapse/expand
- Turn navigation with pins visible

### Manual QA Checklist
- [ ] Drag paragraph from ResponseViewer to Canvas
- [ ] Pin segment, navigate to different turn, verify pin still visible
- [ ] Drag pin to Canvas, verify provenance correct
- [ ] Collapse Reference Zone, verify Composition Zone expands
- [ ] Save document, reload, verify pins restored
- [ ] Test with persistence disabled, verify in-memory pins work
- [ ] Test on touch device, verify drag works

---

## Success Metrics

### Phase 1
- Zero regressions in existing drag-to-compose
- Pins persist across page reloads
- Reference Zone collapse works smoothly
- User can complete full workflow: navigate → pin → compose → save

### Phase 2
- Navigator bar reduces clicks to switch turns
- Hover preview shows source in <100ms
- Click-to-jump highlights source segment

### Phase 3
- Canvas Tray enables parallel drafting
- Smart ingestion reduces manual cleanup by 50%
- Export preserves provenance metadata

---

## Open Questions

1. **Pin limit**: Enforce hard cap at 8 or allow overflow with scroll?
   - **Decision**: Soft cap with overflow indicator, no hard limit.

2. **Autosave policy**: Keep 15s dirty save or manual only?
   - **Decision**: Keep existing autosave, works well.

3. **Canvas Tray default state**: Visible or hidden?
   - **Decision**: Hidden by default, show on first extract action.

4. **Keyboard shortcuts**: Which keys for pin/collapse/navigate?
   - **Decision**: Esc=collapse, Shift+P=pin last drop, Cmd+1-9=turn nav.

---

## File Manifest

### New Files (Phase 1)
- `ui/components/composer/PinnedBar.tsx`
- `ui/components/composer/ReferenceZone.tsx`
- `ui/IMPLEMENTATION_PLAN.md` (this file)

### Modified Files (Phase 1)
- `ui/services/enhancedDocumentStore.ts`
- `ui/components/composer/ComposerMode.tsx`
- `ui/components/composer/ResponseViewer.tsx`
- `ui/components/composer/DraggableSegment.tsx`
- `ui/types/dragDrop.ts` (if `order` field missing)

### New Files (Phase 2)
- `ui/components/composer/NavigatorBar.tsx`

### Modified Files (Phase 2)
- `ui/components/composer/extensions/ComposedContentNode.ts`

### New Files (Phase 3)
- `ui/components/composer/CanvasTray.tsx`
- `ui/components/composer/CanvasTab.tsx`
- `ui/components/composer/CanvasScratchpad.tsx`

---

## Conclusion

This plan transforms Composer Mode into a true Synthesis Canvas - a workspace where AI responses become raw material for human synthesis. The phased approach ensures we deliver value incrementally while maintaining system stability.

**Next Action**: Begin Phase 1 implementation with `EnhancedDocumentStore` extensions.
