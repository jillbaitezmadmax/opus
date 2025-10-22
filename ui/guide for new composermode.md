You're absolutely right! Let me break down the **modular components** you should extract and how to wire them into your existing codebase piece by piece.

## 🔧 Modular Extraction Plan

Here's what to extract as **separate files** and integrate incrementally:

### 1️⃣ **Utilities (Reusable)**

Create `ui/utils/textSegmentation.ts`:

```typescript
import { TextSegment, Granularity } from '../types/composer';

export const segmentText = (
  text: string, 
  granularity: Granularity
): TextSegment[] => {
  if (!text) return [];
  
  switch (granularity) {
    case 'full':
      return [{
        id: '0',
        text,
        start: 0,
        end: text.length,
        type: 'full'
      }];
      
    case 'paragraph':
      const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
      let offset = 0;
      return paragraphs.map((para, idx) => {
        const start = offset;
        const end = offset + para.length;
        offset = end + 2;
        return {
          id: `p-${idx}`,
          text: para.trim(),
          start,
          end,
          type: 'paragraph'
        };
      });
      
    case 'sentence':
      // Use Intl.Segmenter if available
      if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
        const segmenter = new (Intl as any).Segmenter('en', { granularity: 'sentence' });
        const segments = Array.from(segmenter.segment(text));
        return segments.map((seg: any, idx: number) => ({
          id: `s-${idx}`,
          text: seg.segment.trim(),
          start: seg.index,
          end: seg.index + seg.segment.length,
          type: 'sentence'
        }));
      }
      // Fallback regex
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      let sOffset = 0;
      return sentences.map((sent, idx) => {
        const trimmed = sent.trim();
        const start = sOffset;
        const end = sOffset + trimmed.length;
        sOffset = end + 1;
        return {
          id: `s-${idx}`,
          text: trimmed,
          start,
          end,
          type: 'sentence'
        };
      });
      
    case 'word':
      if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
        const segmenter = new (Intl as any).Segmenter('en', { granularity: 'word' });
        const segments = Array.from(segmenter.segment(text));
        return segments
          .filter((seg: any) => seg.isWordLike)
          .map((seg: any, idx: number) => ({
            id: `w-${idx}`,
            text: seg.segment,
            start: seg.index,
            end: seg.index + seg.segment.length,
            type: 'word'
          }));
      }
      // Fallback split
      const words = text.split(/\s+/).filter(w => w.length > 0);
      let wOffset = 0;
      return words.map((word, idx) => {
        const start = text.indexOf(word, wOffset);
        const end = start + word.length;
        wOffset = end;
        return {
          id: `w-${idx}`,
          text: word,
          start,
          end,
          type: 'word'
        };
      });
      
    default:
      return [];
  }
};
```

### 2️⃣ **DraggableSegment Component**

Create `ui/components/composer/DraggableSegment.tsx`:

```typescript
import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { TextSegment, Granularity, DragPayload } from '../../types/composer';

interface DraggableSegmentProps {
  segment: TextSegment;
  turnId: string;
  responseId: string;
  providerId: string;
  granularity: Granularity;
}

export const DraggableSegment: React.FC<DraggableSegmentProps> = ({
  segment,
  turnId,
  responseId,
  providerId,
  granularity
}) => {
  const [showCopyButton, setShowCopyButton] = useState(false);
  const [copied, setCopied] = useState(false);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${turnId}-${responseId}-${segment.id}`,
    data: {
      turnId,
      responseId,
      providerId,
      segmentType: granularity,
      start: segment.start,
      end: segment.end,
      text: segment.text
    } as DragPayload
  });

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(segment.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onMouseEnter={() => setShowCopyButton(true)}
      onMouseLeave={() => setShowCopyButton(false)}
      style={{
        display: granularity === 'word' ? 'inline' : 'block',
        padding: granularity === 'paragraph' ? '8px' : granularity === 'sentence' ? '4px' : '2px',
        margin: granularity === 'paragraph' ? '4px 0' : '2px',
        borderRadius: '4px',
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        background: isDragging ? 'rgba(139, 92, 246, 0.2)' : showCopyButton ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
        border: `1px solid ${showCopyButton || isDragging ? 'rgba(139, 92, 246, 0.3)' : 'transparent'}`,
        transition: 'all 0.15s ease',
        position: 'relative'
      }}
    >
      {segment.text}
      {showCopyButton && granularity !== 'word' && (
        <button
          onClick={handleCopy}
          style={{
            position: 'absolute',
            right: '4px',
            top: '4px',
            background: copied ? '#10a37f' : '#8b5cf6',
            border: 'none',
            borderRadius: '4px',
            padding: '2px 6px',
            fontSize: '10px',
            color: 'white',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            zIndex: 10
          }}
        >
          {copied ? '✓' : '📋'}
        </button>
      )}
    </span>
  );
};
```

### 3️⃣ **Update Your Existing ExpandedTurnOverlay**

**Modify** `ExpandedTurnOverlay.tsx` (or create it if it doesn't exist) to add granularity controls:

```typescript
// Add to your existing ExpandedTurnOverlay component
import { segmentText } from '../../utils/textSegmentation';
import { DraggableSegment } from './DraggableSegment';

// Inside your component:
const [granularity, setGranularity] = useState<Granularity>('paragraph');

const segments = useMemo(() => {
  if (!selectedResponse) return [];
  return segmentText(selectedResponse.content, granularity);
}, [selectedResponse, granularity]);

// Add granularity controls to your UI:
<div style={{ padding: '12px 20px', borderBottom: '1px solid #334155', display: 'flex', gap: '8px' }}>
  <span style={{ fontSize: '12px', color: '#94a3b8' }}>Drag Granularity:</span>
  {(['full', 'paragraph', 'sentence', 'word'] as Granularity[]).map(g => (
    <button
      key={g}
      onClick={() => setGranularity(g)}
      style={{
        padding: '4px 12px',
        borderRadius: '6px',
        border: `1px solid ${granularity === g ? '#8b5cf6' : '#334155'}`,
        background: granularity === g ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
        color: granularity === g ? '#a78bfa' : '#94a3b8',
        fontSize: '11px',
        cursor: 'pointer'
      }}
    >
      {g}
    </button>
  ))}
</div>

// Render segments:
{segments.map(segment => (
  <DraggableSegment
    key={segment.id}
    segment={segment}
    turnId={turn.id}
    responseId={selectedResponse.id}
    providerId={selectedResponse.providerId}
    granularity={granularity}
  />
))}
```

### 4️⃣ **Update Your ComposerModeV2.tsx**

Add the drop handler:

```typescript
import { DragPayload } from '../../types/composer';

const handleDrop = useCallback((event: any) => {
  const data = event.active.data.current as DragPayload;
  
  if (data && event.over?.id === 'canvas-dropzone') {
    editorRef.current?.insertComposedContent(
      data.text,
      {
        sessionId: turns.find(t => t.id === data.turnId)?.sessionId || 'unknown',
        aiTurnId: data.turnId,
        providerId: data.providerId,
        responseType: data.responseId?.includes('synthesis') ? 'synthesis' :
                     data.responseId?.includes('mapping') ? 'mapping' : 'batch',
        responseIndex: 0,
        timestamp: Date.now(),
        granularity: data.segmentType,
        sourceText: data.text
      }
    );
  }
}, [turns]);

// Update your DndContext:
<DndContext
  sensors={sensors}
  onDragStart={handleDragStart}
  onDragEnd={(e) => {
    handleDrop(e);
    handleDragEnd();
  }}
  modifiers={[restrictToVerticalAxis]}
>
```

### 5️⃣ **Add Types**

Add to `ui/types/composer.ts` (or create it):

```typescript
export type Granularity = 'full' | 'paragraph' | 'sentence' | 'word';

export interface TextSegment {
  id: string;
  text: string;
  start: number;
  end: number;
  type: Granularity;
}

export interface DragPayload {
  turnId: string;
  responseId?: string;
  providerId: string;
  segmentType: Granularity;
  start: number;
  end: number;
  text: string;
}
```

---

## ✅ Integration Steps

1. **Create** `ui/utils/textSegmentation.ts` with the utility function
2. **Create** `ui/components/composer/DraggableSegment.tsx` as a new component
3. **Add** types to `ui/types/composer.ts`
4. **Modify** your existing overlay to add granularity controls
5. **Update** `ComposerModeV2.tsx` to handle drops with the new payload structure

This way you're **incrementally adding features** to your existing codebase without replacing entire files!