# TypeScript Errors: Strategic Fix Plan

You have **33 errors** across multiple files. Let me triage them into categories and provide surgical fixes.

---

## Error Categories

| Category | Count | Priority | Root Cause |
|----------|-------|----------|------------|
| **Missing imports** | 8 | 🔴 Critical | `useState`, `useRef`, `useEffect` not imported |
| **Type mismatches** | 12 | 🔴 Critical | `ChatTurn` vs `TurnMessage` incompatibility |
| **Missing modules** | 3 | 🟡 High | `@dnd-kit/modifiers`, `rangy` types, context files |
| **TipTap commands** | 2 | 🔴 Critical | Custom command not typed correctly |
| **Duplicate declarations** | 2 | 🟡 High | `FocusPaneV2` defined twice |
| **Props mismatches** | 6 | 🟡 High | Wrong prop names/types |

---

## Fix Strategy: Bottom-Up (Dependencies First)

---

### **1. Install Missing Dependencies** (skip if already installed)

```bash
npm install @dnd-kit/modifiers
npm install --save-dev @types/rangy
```

If `@types/rangy` doesn't exist:

**Create: `ui/types/rangy.d.ts`**

```typescript
declare module 'rangy' {
  export function getSelection(): Selection;
  export interface Selection {
    rangeCount: number;
    getRangeAt(index: number): Range;
  }
  export interface Range {
    toString(): string;
    commonAncestorContainer: Node;
  }
}

declare module 'rangy/lib/rangy-textrange';
```

---

### **2. Fix `FocusPaneV2.tsx` - Missing Imports & Duplicate Declaration**

**Problem:** You have TWO `FocusPaneV2` definitions in the same file (lines 311 and 515). This is causing the redeclaration error.

**Fix:** Delete the second definition and add missing imports.

**Update: `ui/components/composer/FocusPaneV2.tsx`** (top of file)

```typescript
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rangy from 'rangy';
import 'rangy/lib/rangy-textrange';
import { ProvenanceData } from './extensions/ComposedContentNode';
import type { TurnMessage, AiTurn } from '../../types';
import { extractComposableContent } from '../../utils/composerUtils';

interface Turn {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: number;
  providerId?: string;
  responses?: Array<{
    id: string;
    content: string;
    providerId: string;
  }>;
}

interface FocusPaneProps {
  turn: Turn | null;
  selectedResponseId?: string;
  onDragStart: (data: any) => void; // Make required, not optional
  className?: string;
}

// ... keep only ONE FocusPaneV2 definition (the first one)
// DELETE the second one at line 515

export const FocusPaneV2: React.FC<FocusPaneProps> = ({ ... }) => {
  // Implementation here
};
```

**Critical:** Scroll to line 515 and **delete the entire second `FocusPaneV2` definition**. You only need one.

---

### **3. Fix `ComposedContentNode.ts` - TipTap Commands Type**

**Problem:** TipTap's `addCommands()` expects `Partial<RawCommands>`, but you're returning an object with typed parameters.

**Fix:** Use TipTap's command builder pattern correctly.

**Update: `ui/components/composer/extensions/ComposedContentNode.ts`**

```typescript
import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core'; // Add this import

export interface ProvenanceData {
  sessionId: string;
  aiTurnId: string;
  providerId: string;
  responseType: string;
  responseIndex: number;
  timestamp: number;
  granularity: 'full' | 'paragraph' | 'sentence' | 'selection';
  sourceText?: string;
  originalIndex?: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    composedContent: {
      insertComposedContent: (options: {
        content: string;
        provenance: ProvenanceData;
        position?: number;
      }) => ReturnType;
      deleteComposedBlock: (position: number) => ReturnType;
    };
  }
}

export const ComposedContent = Node.create({
  name: 'composedContent',
  group: 'block',
  content: 'inline*',
  
  addAttributes() {
    return {
      provenance: {
        default: null,
        parseHTML: (element) => {
          const provenanceAttr = element.getAttribute('data-provenance');
          try {
            return provenanceAttr ? JSON.parse(provenanceAttr) : null;
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          if (!attributes.provenance) return {};
          return { 
            'data-provenance': JSON.stringify(attributes.provenance),
            'data-provider-id': attributes.provenance.providerId,
            'data-granularity': attributes.provenance.granularity,
          };
        },
      },
      providerId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-provider-id') || '',
        renderHTML: (attributes) => ({ 'data-provider-id': attributes.providerId }),
      },
      granularity: {
        default: 'full',
        parseHTML: (element) => element.getAttribute('data-granularity') || 'full',
        renderHTML: (attributes) => ({ 'data-granularity': attributes.granularity }),
      },
    };
  },
  
  parseHTML() {
    return [
      { tag: 'div[data-provenance]' },
      { tag: 'div.composed-block' },
    ];
  },
  
  renderHTML({ HTMLAttributes, node }) {
    const providerColors: Record<string, string> = {
      'openai': '#10a37f',
      'anthropic': '#8b5cf6',
      'google': '#4285f4',
      'xai': '#ff6b35',
      'alibaba': '#ff6a00',
    };
    
    const providerId = node.attrs.providerId || 'default';
    const borderColor = providerColors[providerId] || '#6b7280';
    
    return [
      'div', 
      mergeAttributes(HTMLAttributes, {
        class: 'composed-block',
        style: `
          border-left: 3px solid ${borderColor};
          padding-left: 12px;
          margin: 8px 0;
          background: rgba(${borderColor.slice(1).match(/.{2}/g)?.map(hex => parseInt(hex, 16)).join(', ') || '107, 114, 128'}, 0.05);
          border-radius: 4px;
          position: relative;
        `,
        'data-composer-block': 'true',
      }), 
      0
    ];
  },
  
  addCommands() {
    return {
      insertComposedContent:
        (options) =>
        ({ commands }: CommandProps) => {
          return commands.insertContentAt(
            options.position ?? this.editor.state.selection.to,
            {
              type: this.name,
              attrs: {
                provenance: options.provenance,
                providerId: options.provenance.providerId,
                granularity: options.provenance.granularity,
              },
              content: [{ type: 'text', text: options.content }],
            }
          );
        },
      deleteComposedBlock:
        (position) =>
        ({ commands }: CommandProps) => {
          return commands.deleteRange({
            from: position,
            to: position + 1,
          });
        },
    };
  },
});
```

**Key changes:**
- Added `declare module '@tiptap/core'` to extend command types
- Fixed command function signatures: `(options) => ({ commands }) => ...`
- Added `CommandProps` import for proper typing

---

### **4. Fix Type Mismatch: `ChatTurn` vs `TurnMessage`**

**Problem:** Your new components use `ChatTurn`, but existing code uses `TurnMessage`.

**Strategy:** Create a unified adapter in `ComposerModeV2`.

**Update: `ui/components/composer/ComposerModeV2.tsx`**

```typescript
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { CanvasEditorV2, CanvasEditorRef } from './CanvasEditorV2';
import SourcePanel from './SourcePanel';
import ComposerToolbar from './ComposerToolbar'; // Default import
import { ChatTurn, ResponseBlock, convertTurnMessagesToChatTurns } from '../../types/chat';
import type { TurnMessage, AiTurn } from '../../types';
import { ProvenanceData } from './extensions/ComposedContentNode';

interface ComposerModeV2Props {
  allTurns: TurnMessage[];
  sessionId: string | null;
  onExit: () => void;
  onUpdateAiTurn?: (aiTurnId: string, updates: Partial<AiTurn>) => void;
}

export const ComposerModeV2: React.FC<ComposerModeV2Props> = ({
  allTurns,
  sessionId,
  onExit,
  onUpdateAiTurn
}) => {
  // Convert TurnMessage[] to ChatTurn[] for compatibility
  const turns = useMemo(() => convertTurnMessagesToChatTurns(allTurns), [allTurns]);
  
  // State
  const [selectedTurn, setSelectedTurn] = useState<ChatTurn | undefined>(turns[0]);
  const [selectedResponse, setSelectedResponse] = useState<ResponseBlock | undefined>();
  const [isDragging, setIsDragging] = useState(false);
  const [dragData, setDragData] = useState<any>();
  
  // Canvas ref
  const editorRef = useRef<CanvasEditorRef>(null);
  
  // Handlers
  const handleTurnSelect = useCallback((turn: ChatTurn) => {
    setSelectedTurn(turn);
    setSelectedResponse(undefined);
  }, []);

  const handleResponseSelect = useCallback((response: ResponseBlock) => {
    setSelectedResponse(response);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setIsDragging(true);
    setDragData(event.active.data.current);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && over.id === 'canvas-dropzone') {
      const data = active.data.current;
      
      if (data?.type === 'composer-block' && editorRef.current) {
        editorRef.current.insertComposedContent(
          data.text,
          data.provenance,
          undefined // Insert at cursor
        );
      }
    }
    
    setIsDragging(false);
    setDragData(undefined);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToWindowEdges]}
      >
        {/* Toolbar */}
        <ComposerToolbar
          granularity="full"
          onGranularityChange={() => {}}
          onExit={onExit}
          onSave={() => {}}
          onExport={() => {}}
          isDirty={false}
        />

        {/* Main Content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <PanelGroup direction="horizontal">
            <Panel defaultSize={30} minSize={20} maxSize={50}>
              <SourcePanel
                turns={turns}
                selectedTurn={selectedTurn}
                selectedResponse={selectedResponse}
                onTurnSelect={handleTurnSelect}
                onResponseSelect={handleResponseSelect}
                onDragStart={setDragData}
              />
            </Panel>

            <PanelResizeHandle style={{ width: '2px', background: '#334155' }} />

            <Panel defaultSize={70} minSize={50} maxSize={80}>
              <CanvasEditorV2
                ref={editorRef}
                placeholder="Drag content here to compose..."
              />
            </Panel>
          </PanelGroup>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {isDragging && dragData && (
            <div style={{
              background: '#1e293b',
              border: '1px solid #8b5cf6',
              borderRadius: '8px',
              padding: '12px',
              maxWidth: '300px',
              color: '#e2e8f0',
              fontSize: '13px',
            }}>
              {dragData.text?.substring(0, 100)}...
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

export default ComposerModeV2;
```

---

### **5. Fix `SourcePanel.tsx` - Make `onDragStart` Required**

**Update: `ui/components/composer/SourcePanel.tsx`**

```typescript
interface SourcePanelProps {
  turns: ChatTurn[];
  selectedTurn?: ChatTurn;
  selectedResponse?: ResponseBlock;
  onTurnSelect: (turn: ChatTurn) => void;
  onResponseSelect?: (response: ResponseBlock) => void;
  onDragStart: (data: any) => void; // REMOVE the ? to make it required
  className?: string;
}
```

---

### **6. Fix `VirtualizedTimeline.tsx` - Remove Invalid Prop**

**Problem:** Line 156 passes `onDragStart` to `VirtualizedTimeline`, but it doesn't accept that prop.

**Fix:** Remove it from the interface (Timeline cards handle their own drag via `useDraggable`).

**Update: `ui/components/composer/VirtualizedTimeline.tsx`**

```typescript
interface VirtualizedTimelineProps {
  turns: Turn[];
  focusedId?: string | null;
  onSelect: (turnId: string) => void;
  onResponseSelect?: (turnId: string, responseId: string) => void;
  // onDragStart?: (data: any) => void; // DELETE THIS LINE
  className?: string;
}
```

And in `SourcePanel.tsx`, remove the prop when calling:

```typescript
<VirtualizedTimeline
  turns={turns}
  focusedId={selectedTurn?.id ?? null}
  onSelect={(turnId) => { ... }}
  onResponseSelect={(turnId, responseId) => { ... }}
  // onDragStart={onDragStart} // DELETE THIS LINE
/>
```

---

### **7. Fix `TurnMiniCard.tsx` - Type Filter**

**Problem:** `extractComposableContent` returns sources with type `'hidden'`, but `MiniBlockProps` only allows `'batch' | 'synthesis' | 'ensemble'`.

**Fix:** Filter out hidden sources.

**Update: `ui/components/composer/TurnMiniCard.tsx`**

```typescript
const blocks = useMemo(() => {
  if (turn.type !== 'ai') return [];
  const sources = extractComposableContent(turn as AiTurn);
  // Filter out hidden sources
  return sources
    .filter(s => s.type !== 'hidden')
    .slice(0, 5) as Array<{
      id: string;
      providerId: string;
      content: string;
      type: 'batch' | 'synthesis' | 'ensemble';
    }>;
}, [turn]);
```

---

### **8. Fix `ComposerMode.tsx` - Import & Props**

**Problem:** Importing `ComposerModeV2` as default, but it's a named export.

**Fix:**

```typescript
// Line 14: Change this:
import ComposerModeV2 from './ComposerModeV2';

// To this:
import { ComposerModeV2 } from './ComposerModeV2';
```

**And update SourcePanel props:**

```typescript
<SourcePanel
  turns={convertTurnMessagesToChatTurns(allTurns)} // Convert here
  selectedTurn={...}
  selectedResponse={...}
  onTurnSelect={(turn) => setFocusedTurnId(turn.id)}
  onResponseSelect={...}
  onDragStart={(ghostData: any) => {
    actions.addGhost({ ...ghostData, order: composerState.ghosts.length });
  }}
/>
```

---

### **9. Fix `App.tsx` - Missing `setConnectionStatus`**

**Problem:** You're calling `setConnectionStatus` but it's not defined.

**Fix:** Add the state variable.

**Update: `ui/App.tsx`** (around line 256)

```typescript
// Add this near your other useState declarations:
const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
```

---

### **10. Fix `CanvasEditorV2.tsx` - JSX Style Tag**

**Problem:** Line 126 has `<style jsx>` which isn't valid React.

**Fix:** Use inline styles or a CSS module instead.

**Remove the `<style jsx>` block** and move styles to inline or a separate CSS file.

---

## Summary: Execution Order

Run these fixes in this order:

```bash
# 1. Install dependencies
npm install @dnd-kit/modifiers
npm install --save-dev @types/rangy

# 2. Create rangy types (if @types/rangy fails)
# Create ui/types/rangy.d.ts with the declaration above

# 3. Fix files in this order:
# - ComposedContentNode.ts (TipTap commands)
# - FocusPaneV2.tsx (imports + delete duplicate)
# - VirtualizedTimeline.tsx (remove onDragStart prop)
# - SourcePanel.tsx (make onDragStart required)
# - TurnMiniCard.tsx (filter hidden sources)
# - ComposerModeV2.tsx (fix imports + types)
# - ComposerMode.tsx (named import)
# - App.tsx (add setConnectionStatus)
# - CanvasEditorV2.tsx (remove <style jsx>)
```

---

## After Fixes: Expected Result

✅ **0 TypeScript errors**  
✅ Canvas accepts drops with provenance  
✅ Timeline renders virtualized  
✅ Focus Pane shows granular units  
✅ All types align (`ChatTurn` ↔ `TurnMessage`)

**Estimated fix time:** 30-45 minutes if you follow the order above.

Let me know which specific error you want me to elaborate on, or if you hit any blockers after applying these fixes!