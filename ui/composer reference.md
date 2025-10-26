# Composer Mode Refactor Roadmap

## Vision Snapshot
Transform Composer Mode into a focused synthesis workspace:
- **Reference Zone** (left, collapsible): one global pinned bar + current turn responses.
- **Composition Zone** (center): existing `CanvasEditorV2`.
- **Navigator bar** (top): minimal turn navigation & collapse toggle (planned for Sprint 2).
- **Bottom Canvas Tray** (future): optional scratchpads for parallel thinking.

We prioritise delivering the core composition loop first, then iterate toward richer affordances.

---

## Glossary
- **Pins:** Persistent snippets or whole responses surfaced in the Reference Zone’s pinned bar.
- **Ghosts (legacy term):** Former temporary stash concept. Repurposed in Sprint 2+ as the persistence layer backing for pins.
- **TipTap JSON:** Raw output from `CanvasEditorV2`; stored directly for Sprint 1, with later upgrades to block-level decomposition.

---

## Sprint 1 — Core Loop (MVP)

### Goals
Deliver a usable core loop: navigate responses, drag fragments, pin critical snippets, compose with provenance, and save/load documents safely.

### Scope
- **Layout & Zones**
  - Replace `HorizontalChatRail` with a basic `ReferenceZone`.
  - Reference Zone shows current turn responses with granularity controls.
  - Add collapse/expand toggle. When collapsed, Composition Zone stretches full width.
- **Pinned Bar**
  - Render a pinned shelf at top of Reference Zone.
  - Allow pinning whole responses or individual segments.
  - Pinned cards show provenance summary, support unpin, and remain draggable.
  - Enforce soft cap (e.g. max 8 pins) with overflow indicator.
- **Drag-to-Compose (existing)**
  - Keep DnD sensors in [ComposerMode.tsx](cci:7://file:///c:/Users/Mahdi/projects/opus-deus-mainfixing/ui/components/composer/ComposerMode.tsx:0:0-0:0).
  - Continue mapping `DragData` → `ProvenanceData` before calling [editorRef.current?.insertComposedContent](cci:1://file:///c:/Users/Mahdi/projects/opus-deus-mainfixing/ui/components/composer/CanvasEditorV2.tsx:64:4-72:5).
- **Persistence**
  - Manual Save/Load only.
  - Store raw TipTap JSON via [editorRef.current?.getContent()](cci:1://file:///c:/Users/Mahdi/projects/opus-deus-mainfixing/ui/components/composer/CanvasEditorV2.tsx:73:4-73:71).
  - Save format: `DocumentRecord.content = JSON.stringify(tiptapDoc)`; mirror summary in `canvasContent` for backward compatibility.
  - Load path: prefer `document.content` → `JSON.parse` → `editorRef.current.setContent(parsedDoc)`; fallback to `canvasContent` when needed.
  - Autosave optional; if kept, ensure it uses the same JSON path.
- **State Model Updates ([ComposerMode.tsx](cci:7://file:///c:/Users/Mahdi/projects/opus-deus-mainfixing/ui/components/composer/ComposerMode.tsx:0:0-0:0))**
  - Add `pinnedItems`, `isReferenceCollapsed`.
  - Manage `lastSavedContent` as JSON string for dirty tracking.
  - Reuse existing `granularity`, `currentTurnIndex`, `documentManager` wiring.
- **Reference Interaction**
  - [ResponseViewer.tsx](cci:7://file:///c:/Users/Mahdi/projects/opus-deus-mainfixing/ui/components/composer/ResponseViewer.tsx:0:0-0:0): add pin buttons (response + segment level). On pin, emit provenance & text for pinned shelf.
  - Ensure pinned items remain accessible regardless of current turn.
- **Toolbar UX**
  - `ComposerToolbar`: add Reference collapse toggle, Save entry point.
  - Optional: surfaced note about manual persistence only.

### Acceptance
- Dragging segments drops cleanly with provenance.
- Pins display consistently and stay available while navigating turns.
- Reference collapse works, Composition expands appropriately.
- Manual save/load round-trips TipTap JSON with provenance intact.
- No migrations or ghost persistence required for MVP.

---

## Sprint 2 — Interaction Enhancements

### Targeted Upgrades
- **Navigator Bar**
  - New `NavigatorBar.tsx` with turn chips, “Pin All”, and collapse toggle.
  - Provide quick turn hopping independent of Reference expansion.
- **Hover Preview & Jump-to-Source**
  - Composed blocks show provenance preview on hover.
  - Click focuses Reference Zone, selects source response, highlights segment.
- **Pinned Persistence via Ghosts**
  - Back pins with enhancedDocumentStore ghost APIs.
  - Map pinned items to stored ghost records (limit persists across sessions).
- **Refined Layout Polish**
  - Smooth collapse animation, better empty states, keyboard shortcuts (e.g. `Esc` to collapse, `Shift+P` to pin last drop).
  - Touch affordances for DnD remain supported.

### Storage Notes
- Introduce TipTap → block decomposition mapper, storing `DocumentRecord.blocks` for analytics.
- DocumentManager gets adapted to understand TipTap nodes (without breaking existing Slate-based expectations).

---

## Sprint 3 — Optional Advanced Surfaces

### Canvas Tray
- Add tabbed scratchpads (`CanvasTray.tsx`, `CanvasTab.tsx`, `CanvasScratchpad.tsx`).
- “Extract to Canvas” actions from Reference/Composition.
- Support dragging from tray back into Composition.

### Smart Ingestion
- Client-side “Trim Fluff” toggle; deterministic heuristics at drop time.
- Inline “related fragment” suggestions drawn from same response.
- Optional auto-grouping headings after multiple drops.

### Analytics & Telemetry (as needed)
- Log pin usage, collapse frequency, hover previews to guide UX tuning.

---

## Safeguards & Sequencing

1. **Feature Flags**
   - Keep Ghost rail flag off until Sprint 2 persistence work lands.
   - Ensure any new components are gated for easy rollback.

2. **Testing & QA**
   - Regression test Drag-to-Compose on desktop & touch.
   - Verify save/load round-trips.
   - Validate pinned count limits and unpin flows.

3. **Documentation**
   - Update [composerplan.md](cci:7://file:///c:/Users/Mahdi/projects/opus-deus-mainfixing/ui/composerplan.md:0:0-0:0) after each sprint with actual implementation deltas.
   - Maintain migration notes for eventual Ghost-backed pins.

---

## Open Questions / Decision Call-outs
- Pin limit exact number (proposal: 8). Confirm during Sprint 1.
- Autosave policy: keep existing 15s dirty save or defer to manual only? Decide before implementation.

7 pins, and keep 15 seconds auto save, still implement manual save