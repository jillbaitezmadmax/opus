import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { TextSegment, Granularity } from '../../utils/segmentText';
import { createContentBlockDragData, DragData } from '../../types/dragDrop';
import { ProvenanceData } from './extensions/ComposedContentNode';

interface DraggableSegmentProps {
  segment: TextSegment;
  turnId: string;
  responseId: string;
  providerId: string;
  granularity: Granularity;
  provenance: ProvenanceData;
  sourceContext?: {
    beforeText?: string;
    afterText?: string;
    fullResponse?: string;
  };
  onPin?: (text: string, provenance: ProvenanceData) => void;
  onExtractToCanvas?: (text: string, provenance: ProvenanceData) => void;
}

export const DraggableSegment: React.FC<DraggableSegmentProps> = ({
  segment,
  turnId,
  responseId,
  providerId,
  granularity,
  provenance,
  sourceContext,
  onPin,
  onExtractToCanvas
}) => {
  const [showCopyButton, setShowCopyButton] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [extracted, setExtracted] = useState(false);

  const dragData: DragData = createContentBlockDragData(
    segment.text,
    provenance,
    turnId,
    responseId,
    segment.id,
    providerId,
    granularity as DragData['metadata']['granularity'],
    sourceContext
  );

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${turnId}-${responseId}-${segment.id}`,
    data: dragData
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

  const handlePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onPin) {
      onPin(segment.text, provenance);
      setPinned(true);
      setTimeout(() => setPinned(false), 1500);
    }
  };

  const handleExtractToCanvas = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onExtractToCanvas) {
      onExtractToCanvas(segment.text, provenance);
      setExtracted(true);
      setTimeout(() => setExtracted(false), 1500);
    }
  };

  const getSegmentStyles = () => {
    const baseStyles = {
      cursor: 'grab',
      opacity: isDragging ? 0.5 : 1,
      background: isDragging 
        ? 'rgba(139, 92, 246, 0.2)' 
        : showCopyButton 
        ? 'rgba(139, 92, 246, 0.1)' 
        : 'transparent',
      border: `1px solid ${showCopyButton || isDragging ? 'rgba(139, 92, 246, 0.3)' : 'transparent'}`,
      transition: 'all 0.15s ease',
      position: 'relative' as const,
      borderRadius: '4px'
    };

    switch (granularity) {
      case 'paragraph':
        return {
          ...baseStyles,
          display: 'block',
          padding: '8px',
          margin: '4px 0'
        };
      case 'sentence':
        return {
          ...baseStyles,
          display: 'inline-block',
          padding: '4px',
          margin: '2px'
        };
      case 'word':
        return {
          ...baseStyles,
          display: 'inline',
          padding: '2px',
          margin: '1px'
        };
      case 'full':
      default:
        return {
          ...baseStyles,
          display: 'block',
          padding: '12px',
          margin: '8px 0'
        };
    }
  };

  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onMouseEnter={() => setShowCopyButton(true)}
      onMouseLeave={() => setShowCopyButton(false)}
      style={getSegmentStyles()}
      className="draggable-segment"
    >
      {segment.text}
      {showCopyButton && granularity !== 'word' && (
        <div style={{ position: 'absolute', right: '4px', top: '4px', display: 'flex', gap: '4px', zIndex: 10 }}>
          {onExtractToCanvas && (
            <button
              onClick={handleExtractToCanvas}
              style={{
                background: extracted ? '#10a37f' : '#3b82f6',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10px',
                color: 'white',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
              title="Extract to canvas"
            >
              {extracted ? '✓' : '↓'}
            </button>
          )}
          {onPin && (
            <button
              onClick={handlePin}
              style={{
                background: pinned ? '#f59e0b' : '#8b5cf6',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10px',
                color: 'white',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
              title="Pin this segment"
            >
              {pinned ? '✓' : '📌'}
            </button>
          )}
          <button
            onClick={handleCopy}
            style={{
              background: copied ? '#10a37f' : '#8b5cf6',
              border: 'none',
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '10px',
              color: 'white',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>
      )}
    </span>
  );
};