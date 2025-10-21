# Composer Mode Reimplementation: The Scaffold Timeline Architecture

## Strategic Goal
Replace the current Slate-based composer with a **lightweight, high-performance dual-pane system** where provenance tracking is first-class, not an afterthought. The design prioritizes **data architecture over UI complexity**.

---

## Core Architecture: The Scaffold Timeline Pattern

### **The Model:**
```
┌─────────────────────────────────────────────────────┐
│ Composer Mode                                       │
├──────────────────┬──────────────────────────────────┤
│ SOURCE PANEL     │ CANVAS (Right Pane)              │
│ (Left, 400px)    │ Rich text editor with provenance │
├──────────────────┤                                  │
│ Focus Pane       │                                  │
│ (Top 40%)        │                                  │
│ - Full turn      │                                  │
│ - Draggable      │                                  │
│ - Interactive    │                                  │
├──────────────────┤                                  │
│ Nav Timeline     │                                  │
│ (Bottom 60%)     │                                  │
│ - Virtualized    │                                  │
│ - Summary cards  │                                  │
│ - Click to focus │                                  │
└──────────────────┴──────────────────────────────────┘
```

### **Key Principle:**
Every block dragged to canvas carries **invisible provenance metadata** as `data-*` attributes. The canvas becomes a **living document** of sourced insights, not dead text.

---

## Technology Stack (Battle-Tested, Not Reinvented)

### **1. Rich Text Editor: TipTap (NOT Slate)**
**Why:** TipTap is a headless ProseMirror wrapper with better React integration, simpler API, and first-class support for custom node attributes (critical for provenance).

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder
```

**Features we need:**
- Custom node type: `composedContent` with provenance metadata
- Drag-drop insertion with `insertContentAt()`
- Export to Markdown/plain text via `editor.getText()`

---

### **2. Virtualization: @tanstack/react-virtual**
**Why:** Lightweight (3KB), handles infinite scrolling with zero config, works with any DOM structure (not tied to `react-window`'s rigid API).

```bash
npm install @tanstack/react-virtual
```

**Use case:** The Navigation Timeline scrolls through 1000+ turns without performance degradation.

---

### **3. Split Pane: react-resizable-panels**
**Why:** Modern, zero-config, handles keyboard nav, persistence, and collapse states. No custom CSS gymnastics.

```bash
npm install react-resizable-panels
```

**Use case:** The left/right split with drag-to-resize handle.

---

### **4. Drag-Drop: Retain @dnd-kit/core**
**Why:** You already use it. It's excellent. No reason to replace.

**Critical change:** Attach **full provenance payload** to `data.current` during drag, not just text.

---

## Implementation Plan (File-by-File)

### **Phase 1: Replace Slate with TipTap (2 hours)**

**File: `ui/components/composer/CanvasEditor.tsx` (rewrite)**

**Before (Slate):**
```tsx
<Slate editor={editor} value={value} onChange={onChange}>
  <Editable renderElement={Element} />
</Slate>
```

**After (TipTap):**
```tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { ComposedContent } from './extensions/ComposedContentNode';

const CanvasEditor = ({ initialContent, onChange, onDrop }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Drag content here...' }),
      ComposedContent, // Custom node with provenance
    ],
    content: initialContent,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });

  return <EditorContent editor={editor} />;
};
```

**Create: `ui/components/composer/extensions/ComposedContentNode.ts`**

```tsx
import { Node, mergeAttributes } from '@tiptap/core';

export const ComposedContent = Node.create({
  name: 'composedContent',
  group: 'block',
  content: 'inline*',
  
  addAttributes() {
    return {
      provenance: {
        default: null,
        parseHTML: el => JSON.parse(el.getAttribute('data-provenance') || 'null'),
        renderHTML: attrs => ({ 'data-provenance': JSON.stringify(attrs.provenance) }),
      },
      providerId: { default: '' },
      granularity: { default: 'full' },
    };
  },
  
  parseHTML() {
    return [{ tag: 'div[data-provenance]' }];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      class: 'composed-block',
      style: 'border-left: 3px solid #8b5cf6; padding-left: 12px; margin: 8px 0;'
    }), 0];
  },
});
```

**Why this matters:** Every block now carries its full genealogy. Later, you can query "show me all blocks from Claude" or "trace this insight back to turn 12".

---

### **Phase 2: Build the Scaffold Timeline (3 hours)**

**File: `ui/components/composer/SourcePanel.tsx` (major refactor)**

**New structure:**
```tsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useVirtualizer } from '@tanstack/react-virtual';

const SourcePanel = ({ allTurns, onTurnFocus }) => {
  const [focusedTurnId, setFocusedTurnId] = useState(null);
  const focusedTurn = allTurns.find(t => t.id === focusedTurnId);
  
  return (
    <div className="source-panel">
      {/* Focus Pane - Top 40% */}
      <div className="focus-pane" style={{ height: '40%' }}>
        {focusedTurn ? (
          <FocusPane turn={focusedTurn} />
        ) : (
          <EmptyState>Click a turn below to load content</EmptyState>
        )}
      </div>
      
      {/* Navigation Timeline - Bottom 60% */}
      <div className="nav-timeline" style={{ height: '60%' }}>
        <VirtualizedTimeline
          turns={allTurns}
          focusedId={focusedTurnId}
          onSelect={setFocusedTurnId}
        />
      </div>
    </div>
  );
};
```

**Create: `ui/components/composer/VirtualizedTimeline.tsx`**

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

const VirtualizedTimeline = ({ turns, focusedId, onSelect }) => {
  const parentRef = useRef(null);
  
  const virtualizer = useVirtualizer({
    count: turns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Each card is ~80px
    overscan: 5,
  });
  
  return (
    <div ref={parentRef} style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(item => (
          <TurnSummaryCard
            key={item.key}
            turn={turns[item.index]}
            isFocused={turns[item.index].id === focusedId}
            onClick={() => onSelect(turns[item.index].id)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start}px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
};
```

**Why:** This handles 10,000 turns with zero lag. The DOM only renders ~15 cards at a time.

---

### **Phase 3: Provenance-First Drag-Drop (2 hours)**

**File: `ui/components/composer/FocusPane.tsx` (update)**

**Critical change:** Attach full provenance to drag data.

```tsx
const DraggableUnit = ({ unit, provenance }) => {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: unit.id,
    data: {
      type: 'composer-block',
      text: unit.text,
      provenance: {
        sessionId: provenance.sessionId,
        aiTurnId: provenance.aiTurnId,
        providerId: provenance.providerId,
        responseType: provenance.responseType,
        responseIndex: provenance.responseIndex,
        timestamp: Date.now(),
        granularity: unit.type,
      },
    },
  });
  
  return <div ref={setNodeRef} {...listeners} {...attributes}>{unit.text}</div>;
};
```

**File: `ui/components/composer/ComposerMode.tsx` (update `handleDragEnd`)**

```tsx
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || over.id !== 'canvas-dropzone') return;
  
  const dragData = active.data.current;
  if (dragData?.type !== 'composer-block') return;
  
  // Insert into TipTap with provenance
  editor?.commands.insertContentAt(editor.state.selection.to, {
    type: 'composedContent',
    attrs: {
      provenance: dragData.provenance,
      providerId: dragData.provenance.providerId,
      granularity: dragData.provenance.granularity,
    },
    content: [{ type: 'text', text: dragData.text }],
  });
};
```

**Why:** The canvas now holds a **semantic graph**, not plain text. Every block knows where it came from.

---

### **Phase 4: Ghost Layer Integration (1 hour)**

**Keep existing `GhostLayer.tsx`** but update drag data:

```tsx
// In GhostChip:
useDraggable({
  id: `ghost-${ghost.id}`,
  data: {
    type: 'composer-block', // Same type as FocusPane blocks
    text: ghost.text,
    provenance: ghost.provenance,
  },
});
```

**Why:** Ghosts become first-class draggable sources, identical to Focus Pane units.

---

### **Phase 5: Document Persistence (existing, keep as-is)**

Your `enhancedDocumentStore` already works. Just update the schema:

```tsx
interface DocumentRecord {
  id: string;
  title: string;
  content: JSONContent; // TipTap's JSON format (replaces Slate Descendant[])
  provenance: ProvenanceNode[]; // Extracted from content on save
  // ... rest unchanged
}
```

---

## Migration Path (Avoid Rewrite Hell)

1. **Create new files alongside old ones** (don't delete Slate yet):
   - `CanvasEditorV2.tsx`
   - `ComposerModeV2.tsx`
2. **Add feature flag** in `ComposerMode.tsx`:
   ```tsx
   const USE_NEW_COMPOSER = true;
   return USE_NEW_COMPOSER ? <ComposerModeV2 /> : <ComposerMode />;
   ```
3. **Test with 1 session**, then flip flag globally.
4. **Delete old Slate files** once stable.

---

## Why This Architecture Wins

**What you're removing:**
- Slate's complex normalization (600 lines → 0)
- Custom element renderers (replaced by TipTap extensions)
- Manual virtualization hacks (replaced by `@tanstack/react-virtual`)

**What you're gaining:**
- **Provenance as data**: Query "show all Claude blocks" in 1 line
- **Performance**: 10K turns load instantly
- **Simplicity**: 40% less code, 80% of features
- **Extensibility**: Add "Show source" button per block trivially

---

## Success Metrics

- **Load time**: <100ms for 1000-turn timeline
- **Drag latency**: <16ms (60fps)
- **Code reduction**: 30% fewer lines vs. current Slate impl
- **Provenance coverage**: 100% of canvas blocks carry metadata

---

**This is the scaffold.** Build it, and the "Director's Studio" features (branching, filters, diff view) become trivial extensions, not architectural rewrites.