Here’s a practical integration plan that uses your composer-timelinev3.md as guidance and fits cleanly into the existing ComposerModeV2 + SourcePanel + CanvasEditorV2 architecture, while minimizing disruption and keeping existing virtualization and types.

High-Level Approach

Keep the current vertical VirtualizedTimeline in SourcePanel for stability and streaming-friendly virtualization.
Add a full-screen ExpandedTurnOverlay that replaces the old “Focus Pane” behavior when a turn is selected.
Implement paragraph/sentence/word segmentation and draggable segments inside the overlay, wired to the existing dnd-kit context and CanvasEditorV2 drop zone.
Use existing chat and drag-drop types (ui/types/chat.ts, ui/types/dragDrop.ts) instead of duplicating new ones from the .md to avoid drift.
File Changes

New: ui/components/composer/ExpandedTurnOverlay.tsx
New: ui/components/composer/DraggableSegment.tsx
New: ui/utils/segmentText.ts
Optional Types: ui/types/composer.ts for Granularity and TextSegment if you prefer not to inline in overlay
Where To Integrate

ui/components/composer/ComposerModeV2.tsx

Keep the DndContext, panels, and CanvasEditorV2.
Add overlay state (expandedTurnId or reuse selectedTurn) at this root so the overlay can span the entire composer, not just the left panel.
On drag end, insert into CanvasEditorV2 when the drop target is canvas-dropzone.
ui/components/composer/SourcePanel.tsx

Keep the bottom “Timeline Rail” (VirtualizedTimeline) as-is.
Replace the top “Focus Pane” with an overlay trigger: when a timeline turn is clicked, set selected turn and open the overlay (instead of rendering FocusPaneV2 in place).
Keep timeline header/status; remove Focus Pane header content once overlay takes over “focus”.
ui/components/composer/VirtualizedTimeline.tsx

Leave virtualization intact.
Use onSelect to open overlay.
Keep response click behavior; overlay can show a response selector for AI turns similar to the .md.
Segmented Dragging

ui/utils/segmentText.ts

Implement segmentText(text, granularity) using Intl.Segmenter for sentence and word, and a simple split for paragraph.
Memoize segmentation inside overlay based on (text, granularity, responseId).
ui/components/composer/DraggableSegment.tsx

Use useDraggable with data.current shaped as your existing DragData from ui/types/dragDrop.ts.
Build payloads with createContentBlockDragData(content, provenance, turnId, responseId, blockId, providerId, granularity).
Add hover affordances and a copy-on-hover hint like the .md shows.
Expanded Overlay

ui/components/composer/ExpandedTurnOverlay.tsx
Props: { turn: ChatTurn; onClose: () => void; prevTurn?: ChatTurn; nextTurn?: ChatTurn; onNavigate: (dir: 'prev' | 'next') => void }.
Header: avatar (👤/🤖), provider badge, timestamp, close button.
Response selector: for AI turns when turn.responses.length > 1.
Granularity controls: ['full', 'paragraph', 'sentence', 'word'].
Content area:
User turns: show content (non-draggable by segment unless you want granularity for users too).
AI turns: segment selected response’s text and render DraggableSegment for each segment.
Keyboard navigation: listen for ArrowLeft/ArrowRight/Esc to navigate prev/next or close.
Side mini-cards for prev/next: render TurnCard (small) like your .md, or keep it simpler with just arrows to begin.
Drag-and-Drop Wiring

Use existing CanvasEditorV2 droppable id: canvas-dropzone.
In ComposerModeV2.tsx, change onDragEnd to insert content when dropped onto canvas:
Validate event.active.data.current with isValidDragData.
If event.over?.id === 'canvas-dropzone', call editorRef.current?.insertComposedContent(dragData.content, dragData.provenance).
Keep the DragOverlay to display drag ghost text as you already do.
Types Alignment

Prefer existing ui/types/dragDrop.ts:
Use DragData, createContentBlockDragData, isValidDragData.
Map segment granularity to DragData.metadata.granularity.
Use ui/types/chat.ts:
Drive overlay with ChatTurn and ResponseBlock.
Provider mapping: suffixes -synthesis / -mapping still apply; pick responseType from responseId.
Suggested Implementation Steps

Step 1: Add segmentText utility.
Step 2: Add DraggableSegment.tsx with useDraggable and a payload created via createContentBlockDragData.
Step 3: Create ExpandedTurnOverlay.tsx:
Response selector, granularity, segmented content list using DraggableSegment.
Prev/Next controls; keyboard handlers; close button.
Step 4: Update ComposerModeV2.tsx:
Add overlay state and render ExpandedTurnOverlay when selectedTurn is set.
Enhance onDragEnd to insert content into CanvasEditorV2 when dropping onto canvas-dropzone.
Step 5: Update SourcePanel.tsx:
Wire onTurnSelect from VirtualizedTimeline to open overlay (set selected turn in parent).
Hide or remove FocusPaneV2 with the overlay taking over “focus”.
Step 6: Optional: Persist composition via localStorage and add an “Export” action that reads editorRef.current.getText().
Key Behaviors To Keep

Vertical virtualization (react-virtuoso) in VirtualizedTimeline.tsx for performance.
Timeline remains the browsing surface; overlay becomes the detailed focus pane.
Drag ghost overlay stays consistent with your current UI.
Granularity toggles drive segmentation cost; use memoization.
Assumptions

Keep vertical rail instead of implementing a new horizontal scroller (lower migration risk and consistent with react-virtuoso).
TurnActionBar remains unused; quick actions, if needed, belong in ExpandedTurnOverlay.
convertTurnMessagesToChatTurns drives ChatTurn[] everywhere for consistency.
Example Wiring Snippets

ComposerModeV2.tsx drop handling:
onDragEnd={(e) => { const data = e.active.data.current; if (isValidDragData(data) && e.over?.id === 'canvas-dropzone') editorRef.current?.insertComposedContent(data.content, data.provenance); setIsDragging(false); }}
DraggableSegment.tsx payload:
createContentBlockDragData(segment.text, provenance, turn.id, response.id, segment.id, response.providerId, granularity)
Performance Notes

Lazy segment only when overlay opens; memoize by (text, granularity).
Avoid segmenting full response text at word granularity until needed.
Keep VirtualizedTimeline as-is to avoid layout thrashing.
Rollout Plan

Phase 1: Add overlay + segmentation + drag payloads, maintain current timeline and canvas.
Phase 2: Replace FocusPaneV2 with overlay, remove dead props/paths.
Phase 3: Persistence and export, plus optional search/filter and analytics.
If you want me to scaffold the three new files with the described props and utilities, I can add them now and wire the minimal overlay and drag insertion into ComposerModeV2.tsx and SourcePanel.tsx. Since those changes would affect the UI, I’ll open a preview to verify interactions once the components are in place.