import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ProvenanceData } from './extensions/ComposedContentNode';
import { createContentBlockDragData } from '../../types/dragDrop';
import type { ChatTurn } from '../../types/chat';


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

import rangy from 'rangy';
import 'rangy/lib/rangy-textrange';

interface FocusPaneProps {
  turn: ChatTurn | null;
  selectedResponseId?: string;
  onDragStart: (data: any) => void;
  className?: string;
}

interface DraggableUnitProps {
  id: string;
  content: string;
  type: 'full' | 'paragraph' | 'sentence' | 'selection';
  provenance: ProvenanceData;
  className?: string;
}

const DraggableUnit: React.FC<DraggableUnitProps> = ({
  id,
  content,
  type,
  provenance,
  className = '',
}) => {
  const [selectedText, setSelectedText] = useState<string>('');
  const contentRef = useRef<HTMLDivElement>(null);

  // Handle text selection
  useEffect(() => {
    if (!contentRef.current) return;

    const handleSelectionChange = () => {
      const selection = rangy.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const selected = range.toString();

        if (selected && contentRef.current?.contains(range.commonAncestorContainer)) {
          setSelectedText(selected);
        } else {
          setSelectedText('');
        }
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  // Override drag data if text is selected
  const dragData = selectedText
    ? {
        type: 'composer-block',
        text: selectedText,
        provenance: { ...provenance, granularity: 'selection' },
      }
    : {
        type: 'composer-block',
        text: content,
        provenance,
      };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: dragData,
  });

  const getGranularityIcon = (granularity: string) => {
    switch (granularity) {
      case 'full': return '📄';
      case 'paragraph': return '¶';
      case 'sentence': return '📝';
      case 'selection': return '✂️';
      default: return '📄';
    }
  };

  const getProviderColor = (providerId: string) => {
    const colors: Record<string, string> = {
      'openai': '#10a37f',
      'anthropic': '#8b5cf6',
      'google': '#4285f4',
      'xai': '#ff6b35',
      'alibaba': '#ff6a00',
    };
    return colors[providerId] || '#6b7280';
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`draggable-unit ${className} ${isDragging ? 'dragging' : ''}`}
      style={{
        borderLeftColor: getProviderColor(provenance.providerId),
      }}
    >
      <div className="unit-header">
        <div className="granularity-info">
          <span className="granularity-icon">
            {getGranularityIcon(provenance.granularity)}
          </span>
          <span className="granularity-label">{type}</span>
        </div>
        <div className="drag-handle">⋮⋮</div>
      </div>
      
      <div ref={contentRef} className="unit-content">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{
            // Customize markdown rendering for better display
            p: ({ children }) => <p className="markdown-paragraph">{children}</p>,
            code: ({ children }) => <code className="markdown-code">{children}</code>,
            pre: ({ children }) => <pre className="markdown-pre">{children}</pre>,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      {selectedText && (
        <div className="selection-hint">
          Drag to use selected text only
        </div>
      )}

      <style>{`
        .draggable-unit {
          background: #1e293b;
          border: 1px solid #334155;
          border-left: 3px solid;
          border-radius: 8px;
          padding: 12px;
          margin: 8px 0;
          cursor: grab;
          transition: all 0.2s ease;
          position: relative;
        }

        .draggable-unit:hover {
          background: #334155;
          transform: translateX(4px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .draggable-unit.dragging {
          opacity: 0.6;
          transform: rotate(2deg) scale(0.95);
          z-index: 1000;
        }

        .unit-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          padding-bottom: 6px;
          border-bottom: 1px solid #475569;
        }

        .granularity-info {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .granularity-icon {
          font-size: 14px;
        }

        .granularity-label {
          font-size: 11px;
          color: #94a3b8;
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .drag-handle {
          color: #64748b;
          font-size: 14px;
          cursor: grab;
          padding: 2px 4px;
          border-radius: 3px;
          transition: background-color 0.2s ease;
        }

        .drag-handle:hover {
          background: #475569;
          color: #94a3b8;
        }

        .unit-content {
          color: #e2e8f0;
          line-height: 1.6;
        }

        .unit-content :global(.markdown-paragraph) {
          margin: 0 0 8px 0;
        }

        .unit-content :global(.markdown-paragraph:last-child) {
          margin-bottom: 0;
        }

        .unit-content :global(.markdown-code) {
          background: #0f172a;
          color: #fbbf24;
          padding: 2px 4px;
          border-radius: 3px;
          font-family: 'Fira Code', monospace;
          font-size: 0.9em;
        }

        .unit-content :global(.markdown-pre) {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 6px;
          padding: 12px;
          overflow-x: auto;
          margin: 8px 0;
        }

        .unit-content :global(.markdown-pre code) {
          background: none;
          padding: 0;
        }

        .selection-hint {
          position: absolute;
          bottom: 8px;
          right: 8px;
          background: #8b5cf6;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          pointer-events: none;
          z-index: 10;
        }
      `}</style>
    </div>
  );
};

const EmptyState: React.FC = () => (
  <div className="empty-state">
    <div className="empty-icon">🎯</div>
    <h3>Select a turn to focus</h3>
    <p>Click on any turn in the timeline below to see its detailed content and start composing.</p>
    
    <style>{`
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        text-align: center;
        color: #64748b;
        padding: 32px;
      }

      .empty-icon {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.6;
      }

      .empty-state h3 {
        color: #94a3b8;
        margin: 0 0 8px 0;
        font-size: 18px;
        font-weight: 600;
      }

      .empty-state p {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        max-width: 300px;
      }
    `}</style>
  </div>
);

export const FocusPaneV2: React.FC<FocusPaneProps> = ({
  turn,
  selectedResponseId,
  className = '',
}) => {
  const contentUnits = useMemo(() => {
    if (!turn) return [];

    const units: Array<{
      id: string;
      content: string;
      type: 'full' | 'paragraph' | 'sentence';
      provenance: ProvenanceData;
    }> = [];

    // If a specific response is selected, use that; otherwise use the main turn content
    const targetContent = selectedResponseId 
      ? turn.responses?.find(r => r.id === selectedResponseId)?.content || turn.content
      : turn.content;

    const targetProviderId = selectedResponseId
      ? turn.responses?.find(r => r.id === selectedResponseId)?.providerId || turn.providerId
      : turn.providerId;

    // Create base provenance
    const baseProvenance: ProvenanceData = {
      sessionId: 'current', // This should come from context
      aiTurnId: turn.id,
      providerId: targetProviderId || 'unknown',
      responseType: selectedResponseId ? 'batch' : 'batch',
      responseIndex: selectedResponseId 
        ? turn.responses?.findIndex(r => r.id === selectedResponseId) || 0 
        : 0,
      timestamp: turn.timestamp,
      granularity: 'full',
    };

    // Full content unit
    units.push({
      id: `${turn.id}-full`,
      content: targetContent,
      type: 'full',
      provenance: { ...baseProvenance, granularity: 'full' },
    });

    // Split into paragraphs
    const paragraphs = targetContent.split(/\n\s*\n/).filter(p => p.trim());
    paragraphs.forEach((paragraph, index) => {
      if (paragraph.trim()) {
        units.push({
          id: `${turn.id}-para-${index}`,
          content: paragraph.trim(),
          type: 'paragraph',
          provenance: { 
            ...baseProvenance, 
            granularity: 'paragraph',
            originalIndex: index,
          },
        });
      }
    });

    // Split into sentences (simple approach)
    const sentences = targetContent.split(/[.!?]+/).filter(s => s.trim());
    sentences.forEach((sentence, index) => {
      if (sentence.trim() && sentence.trim().length > 10) {
        units.push({
          id: `${turn.id}-sent-${index}`,
          content: sentence.trim() + '.',
          type: 'sentence',
          provenance: { 
            ...baseProvenance, 
            granularity: 'sentence',
            originalIndex: index,
          },
        });
      }
    });

    return units;
  }, [turn, selectedResponseId]);

  if (!turn) {
    return <EmptyState />;
  }

  return (
    <div className={`focus-pane ${className}`}>
      <div className="focus-header">
        <div className="turn-info">
          <span className="turn-type">
            {turn.type === 'user' ? '👤 User' : '🤖 AI'}
          </span>
          <span className="turn-timestamp">
            {new Date(turn.timestamp).toLocaleString()}
          </span>
        </div>
        {turn.providerId && (
          <div className="provider-info">
            <span className="provider-label">Provider:</span>
            <span className="provider-name">{turn.providerId}</span>
          </div>
        )}
      </div>

      <div className="content-units">
        {contentUnits.map((unit) => (
          <DraggableUnit
            key={unit.id}
            id={unit.id}
            content={unit.content}
            type={unit.type}
            provenance={unit.provenance}
          />
        ))}
      </div>

      <style>{`         .focus-pane {
          height: 100%;
          background: #0f172a;
          border-radius: 8px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .focus-header {
          background: #1e293b;
          padding: 16px;
          border-bottom: 1px solid #334155;
          flex-shrink: 0;
        }

        .turn-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .turn-type {
          font-weight: 600;
          color: #e2e8f0;
          font-size: 14px;
        }

        .turn-timestamp {
          font-size: 12px;
          color: #94a3b8;
          font-family: monospace;
        }

        .provider-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .provider-label {
          font-size: 12px;
          color: #64748b;
        }

        .provider-name {
          font-size: 12px;
          color: #8b5cf6;
          font-weight: 600;
          text-transform: uppercase;
        }

        .content-units {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          scrollbar-width: thin;
        }

        .content-units::-webkit-scrollbar {
          width: 6px;
        }

        .content-units::-webkit-scrollbar-track {
          background: #1e293b;
          border-radius: 3px;
        }

        .content-units::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 3px;
        }

        .content-units::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
      `}</style>
    </div>
  );
};