we are refacotoring composer mode from what it was to the visionoutlined in

Outcome

- Replace the horizontal rail with a collapsible Reference Zone left column, keep CanvasEditorV2 as Composition Zone, add Navigator top bar, introduce Bottom Canvas Tray for parallel thinking, and wire Drag-to-Compose with provenance-first behavior.
Architecture

- Two-column layout under the existing top bar:
  - Reference Zone: collapsible left column that shows pins and the current turn’s responses.
  - Composition Zone: existing CanvasEditorV2 full-width when Reference is collapsed.
- Navigator top bar: lightweight, shows turns for quick navigation and a Pin All affordance.
- Bottom Canvas Tray: tabbed scratchpads for extracting and staging text before composing.
Core Components

- ComposerMode.tsx (orchestrator)
  - Owns navigation, pinned state, Reference collapse state, Canvas Tray state, and DnD sensors.
  - Continues handling drag and drop via DndContext , inserting via editorRef.current?.insertComposedContent .
- CanvasEditorV2.tsx (Composition Zone)
  - Already supports insertComposedContent(content, provenance) via TipTap ComposedContent extension.
- ResponseViewer.tsx (Reference Zone content)
  - Already segments text ( paragraph / sentence ) and renders DraggableSegment s with DragData and ProvenanceData .
- New: ReferenceZone.tsx
  - Collapsible shell that replaces HorizontalChatRail usage.
  - Renders the selected turn’s responses and a pinned section.
  - Provides granularity controls and pin controls.
- New: NavigatorBar.tsx
  - Top row with turn chips ( [Turn 1] [Turn 2] … ), Pin All , and reference collapse toggle.
  - Integrates with ComposerMode navigation state ( currentTurnIndex ).
- New: CanvasTray/ components
  - CanvasTray.tsx parent holds tab list and active canvas content.
  - CanvasTab.tsx tab items [Canvas 1] [Canvas 2] [ + ] .
  - CanvasScratchpad.tsx simple TipTap editor or text area with insertComposedContent for provenance continuity.
State Model

- ComposerMode.tsx
  - currentTurnIndex : selected turn.
  - pinnedTurnIds: Set<string> : pinned turns.
  - isReferenceCollapsed: boolean : Reference Zone collapse state.
  - granularity: 'paragraph' | 'sentence' : shared setting passed to ResponseViewer .
  - canvasTabs: {id: string, title: string}[] , activeCanvasId: string : bottom tray tabs.
  - Reuse isDirty , isSaving , showDocumentsPanel , and documentManager for persistence.
- ProvenanceData (TipTap node attribute)
  - Use the existing shape in ComposedContentNode and continue mapping from DragData (see below).
Drag-to-Compose

- Source: DraggableSegment in ResponseViewer uses useDraggable and createContentBlockDragData .
- Target: CanvasEditorV2 declares droppable 'canvas-dropzone' using useDroppable .
- Insert: ComposerMode.handleDragEnd already maps DragData → ProvenanceData and calls editorRef.current?.insertComposedContent .
- Provenance tagging rules:
  - Map DragData.metadata.granularity to ProvenanceData.granularity ( paragraph / sentence → same; word / phrase → sentence ; turn / response → full ).
  - Include sourceText and sourceContext.fullResponse when available, so hover previews can show the original block.
- UI affordances:
  - Render all composed blocks using the ComposedContent tiptap node. Keep the provider-colored border and tooltip, and add hover preview and click-to-jump (below).
Hover Preview + Click-to-Jump

- Hover preview:
  - On mouseenter of a composed block, show a small tooltip-style preview using provenance.sourceText or provenance.sourceContext.fullResponse if present.
  - For larger previews, open a small floating card near the block; avoid modal.
- Click-to-jump:
  - On click, expand the Reference Zone (if collapsed), select the provenance turn and response, and scroll that response into view with a highlight.
  - Implementation:
    - Add a click handler to ComposedContent blocks via TipTap node view or event decoration.
    - Dispatch to ComposerMode a onJumpToSource(provenance) function that sets currentTurnIndex , ensures Reference expands, and sets a highlightResponse state that ResponseViewer uses to flash the source segment.
Pin & Compare

- Affordances:
  - Add a pin icon on each response in ResponseViewer and each turn chip in NavigatorBar .
  - Pin All on the navigator pins all responses in the current turn.
- Behavior:
  - Pinned items render at the top of Reference Zone regardless of currentTurnIndex .
  - Comparison mode is implied when pinnedTurnIds.size > 1 ; visually group pinned turns and their responses.
- Data:
  - Store pinned turn IDs; optionally store pinned response IDs for finer control.
Collapse-to-Compose

- Default state: Reference Zone collapsed to a thin rail.
- Expand behavior:
  - Clicking a turn chip temporarily expands Reference Zone.
  - After drag, pressing Escape or clicking << collapses back.
- Layout:
  - Use a CSS grid or flex layout so Composition Zone stretches to full-width when Reference is collapsed.
  - Preserve DnD target area so drops remain consistent.
Bottom Canvas Tray

- Purpose: scratchpads for extraction, rephrasing, and idea staging.
- Behavior:
  - Tabs [Canvas 1 ●] [Canvas 2] [ + ] with add/remove/rename.
  - Right-click or toolbar action from Reference Zone or Composition Zone: “Extract to Canvas”.
  - Drops insert into the active canvas using the same insertComposedContent pattern for consistent provenance.
- Integration:
  - Minimal persistence: keep in local UI state first; optionally integrate with DocumentManager later by storing each canvas as a lightweight DocumentRecord of type canvas .
  - Drag-from-canvas to main Composition should work identically (make canvas content segments draggable using DraggableSegment or a lighter variant).
Smart Ingestion (Optional)

- Preferences panel toggle (simple, non-modal):
  - Trim fluff : strip boilerplate phrases (“Sure, here’s…”, “I hope this helps”) on drop.
  - Suggest related fragments : on drop, show a non-blocking inline hint with up to 3 similar fragments from the same turn; click to insert.
  - Auto-group by theme : if >3 items dropped in short succession, wrap them under a small heading (“Insights on X”) without a modal.
- Implementation tips:
  - Start with deterministic rules; leave semantic similarity as a stub that checks same response for repeats.
  - Keep these operations client-side and fast; no confirmation modal.
Persistence

- Composition content:
  - Continue using documentManager only if you require snapshots and block decomposition; otherwise rely on CanvasEditorV2.getContent() and build save/export from TipTap JSON.
- Ghosts / blocks:
  - If needed, map ComposedContent to CanvasBlockRecord for provenance queries via DocumentManager.decomposeContent .
- Canvases:
  - If persisting canvases, use DocumentRecord.type='canvas' and DocumentsRepository.getBySessionAndType(sessionId, 'canvas') to load.
Types & Data

- Drag payloads:
  - Use existing ui/types/dragDrop.ts helpers:
    - createContentBlockDragData(text, provenance, turnId, responseId, segmentId, providerId, granularity, sourceContext) .
  - Validate in ComposerMode.handleDragEnd via isValidDragData .
- Provenance:
  - Use ProvenanceData from ComposedContentNode consistently across Reference → Composition → Canvas Tray.
- Granularity:
  - Keep Granularity control at the Reference Zone level, pass down to ResponseViewer to segment text.
Integration Steps

- Replace HorizontalChatRail with ReferenceZone in ComposerMode :
  - Pass turns , currentTurnIndex , granularity , pinnedTurnIds , onPin , onUnpin , and onResponsePick .
- Add NavigatorBar above Reference + Composition:
  - Provide onTurnSelect , onPinAll , and onToggleReferenceCollapse .
- Wire hover preview and click-to-jump:
  - Add block event handlers in ComposedContent node view to call up to ComposerMode callbacks.
- Add CanvasTray at the bottom:
  - Toggled via a button in the toolbar or a persistent control at the bottom edge.
  - Ensure each scratchpad provides insertComposedContent and supports drag-out to Composition.
- Keep DnD constraints:
  - Maintain existing sensors and droppable id 'canvas-dropzone' .
  - Ensure Reference Zone elements remain draggable; drop targets remain exclusive to Composition and Canvas editors.
- Save/export:
  - Continue using ComposerToolbar for Save/Export/Refine.
  - Save writes TipTap JSON (or hands to DocumentManager if desired).
UX Details

- Micro-interactions:
  - ESC collapses Reference Zone.
  - Hover on composed block shows origin preview; click jumps to source.
  - Pinned section stays visible even when navigating turns.
- Visual language:
  - Use provider color border for composed blocks (already implemented).
  - Pinned turns grouped and subtly highlighted at the top of Reference Zone.
QA Checklist

- Dragging paragraphs/sentences from Reference inserts correctly with provenance.
- Hover preview shows source; click selects source turn/response and highlights.
- Reference collapse and expand works, with Composition filling the viewport when collapsed.
- Pinned items persist across turn navigation; multiple pins show grouped at top.
- Canvas Tray supports creating, switching tabs, extracting text, and dragging to Composition.
- Save/export round-trips TipTap JSON without losing provenance attributes.
- No modals are introduced; all interactions are direct or inline.
Scope Boundaries

- Defer full semantic similarity; start with deterministic “Trim fluff”.
- Keep persistence optional for canvases; prioritize fluid UI first.
- Avoid changing underlying session/turn types; rely on existing TurnMessage , AiTurn , and ProviderResponse .

