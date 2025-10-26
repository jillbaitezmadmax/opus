I can now see your component structure and naming conventions. Here's a concise, natural-language instruction set for your agent to transition from your current design to the proposed Synthesis Canvas, using your actual code names:

Refactor the current UI to implement the Synthesis Canvas. Keep the top navigation bar with [Turn 1] [Turn 2●] and Pin All functionality. Replace the HorizontalChatRail (src: HorizontalChatRail.tsx) with a left-side Reference Zone that displays all responses per turn as collapsible cards. Each card shows provider, content preview, and a pin icon. Make this zone collapsible to a narrow rail with << toggle.

Convert the main area into the Composition Zone—centered, clean, and focused. Use CanvasEditorV2 (ref: editorRef) as the primary editor. When user drags a fragment from Reference Zone into CanvasEditorV2, insert clean text and attach provenance via insertComposedContent() command with ProvenanceData. Auto-append source tag like ^ Turn 2, Model X as subtle superscript.

Preserve handleDrop in CanvasEditorV2 but ensure it returns false to let DnD Kit handle drops—intercept drag events via DndContext in ComposerMode.tsx. Use DragData and isValidDragData to validate. On drop, call editor.commands.insertComposedContent() with position.

Add pinning to responses in Reference Zone. Store pinned turns in state. Pinned items remain visible across turn switches. Highlight pinned icons (📌). Enable multi-select pinning.

Implement workspace Canvases as a bottom tray below the Composition Zone. Add tabbed interface: [ Canvas 1● ] [ Canvas 2 ] [ + ]. Each canvas is a lightweight editable area. When user selects text in any response or editor, show floating toolbar with “Extract to Canvas”. Clicking opens bottom tray and inserts fragment into active canvas. Allow drag from canvas to main editor.

Keep ResponseViewer for full-response preview on click, but de-emphasize—focus is on composition, not viewing. Use ComposerToolbar for formatting, but add “Extract to Canvas” button.

Update ComposerMode props to include onUpdateAiTurn and documentManager for future sync. Use DocumentManager to persist canvas states.

Ensure mobile touch support via useSensors(MouseSensor, TouchSensor) in DndContext. On mobile, long-press to drag.

Default state: Reference Zone collapsed, Composition Zone full-width, bottom tray hidden. Expand Reference on turn click. Auto-collapse after drag if desired.

Prioritize flow: Click turn → expand Reference → drag fragment → drops into CanvasEditorV2 with provenance → collapse → write. No modals, no copy-paste.

Use existing ProvenanceData type to store source metadata. Hovering on ^ Turn 2, B shows tooltip with full original. Clicking jumps back and highlights.

Start with MVP: layout shift, drag-to-compose, pinning, collapse. Then add workspace Canvases. Use existing Granularity, ChatTurn, ResponseBlock types.

Preserve initialContent loading in CanvasEditorV2. After refactor, getContent() and getText() should reflect composed output.

Style with current Tailwind classes: dark theme (#0f172a, #1e293b), rounded cards, smooth transitions.

This transforms your tool from a response viewer into a thinking workspace—honoring your vision of composition over curation.


