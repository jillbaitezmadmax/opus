import React, { useRef, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useDraggable } from '@dnd-kit/core';
import { createResponseDragData } from '../../types/dragDrop';

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

interface VirtualizedTimelineProps {
  turns: Turn[];
  focusedId?: string | null;
  onSelect: (turnId: string) => void;
  onResponseSelect?: (turnId: string, responseId: string) => void;
  className?: string;
}

interface TurnSummaryCardProps {
  turn: Turn;
  isFocused: boolean;
  onClick: () => void;
  onResponseClick?: (responseId: string) => void;
  style?: React.CSSProperties;
}

const TurnSummaryCard: React.FC<TurnSummaryCardProps> = ({
  turn,
  isFocused,
  onClick,
  onResponseClick,
  style,
}) => {
  const truncateText = (text: string, maxLength: number = 100) => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getProviderColor = (providerId?: string) => {
    const colors: Record<string, string> = {
      'openai': '#10a37f',
      'anthropic': '#8b5cf6',
      'google': '#4285f4',
      'xai': '#ff6b35',
      'alibaba': '#ff6a00',
    };
    return colors[providerId || ''] || '#6b7280';
  };

  return (
    <div
      style={style}
      className={`turn-summary-card ${isFocused ? 'focused' : ''}`}
      onClick={onClick}
    >
      <div className="turn-header">
        <div className="turn-type">
          {turn.type === 'user' ? '👤' : '🤖'}
          <span className="turn-time">{formatTimestamp(turn.timestamp)}</span>
        </div>
        {turn.providerId && (
          <div 
            className="provider-badge"
            style={{ backgroundColor: getProviderColor(turn.providerId) }}
          >
            {turn.providerId}
          </div>
        )}
      </div>
      
      <div className="turn-content">
        {truncateText(turn.content)}
      </div>

      {/* AI responses */}
      {turn.responses && turn.responses.length > 0 && (
        <div className="responses-container">
          {turn.responses.map((response) => (
            <ResponseBlock
              key={response.id}
              response={response}
              turnId={turn.id}
              onClick={() => onResponseClick?.(response.id)}
            />
          ))}
        </div>
      )}

      <style>{`
        .turn-summary-card {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 12px;
          margin: 4px 0;
          cursor: pointer;
          transition: all 0.2s ease;
          border-left: 3px solid transparent;
        }

        .turn-summary-card:hover {
          background: #334155;
          transform: translateX(2px);
        }

        .turn-summary-card.focused {
          border-left-color: #8b5cf6;
          background: #2d3748;
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.2);
        }

        .turn-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .turn-type {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #94a3b8;
        }

        .turn-time {
          font-family: monospace;
        }

        .provider-badge {
          font-size: 10px;
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
          font-weight: 600;
        }

        .turn-content {
          color: #e2e8f0;
          font-size: 13px;
          line-height: 1.4;
          margin-bottom: 8px;
        }

        .responses-container {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid #475569;
        }
      `}</style>
    </div>
  );
};

interface ResponseBlockProps {
  response: {
    id: string;
    content: string;
    providerId: string;
  };
  turnId: string;
  onClick: () => void;
}

const ResponseBlock: React.FC<ResponseBlockProps> = ({ response, turnId, onClick }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `response-${response.id}`,
    data: createResponseDragData(
      response.content,
      {
        sessionId: 'current',
        aiTurnId: turnId,
        providerId: response.providerId,
        responseType: 'batch',
        responseIndex: 0,
        timestamp: Date.now(),
        granularity: 'full',
        sourceText: response.content
      },
      turnId,
      response.id,
      response.providerId,
      { fullResponse: 'batch' }
    ),
  });

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
      className={`response-block ${isDragging ? 'dragging' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        borderLeftColor: getProviderColor(response.providerId),
      }}
    >
      <div className="response-header">
        <span className="provider-name">{response.providerId}</span>
        <span className="drag-handle">⋮⋮</span>
      </div>
      <div className="response-content">
        {response.content.substring(0, 80)}...
      </div>

      <style>{`
        .response-block {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-left: 3px solid;
          border-radius: 4px;
          padding: 8px;
          cursor: grab;
          transition: all 0.2s ease;
          position: relative;
        }

        .response-block:hover {
          background: #1e293b;
          transform: scale(1.02);
        }

        .response-block.dragging {
          opacity: 0.5;
          transform: rotate(5deg);
        }

        .response-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }

        .provider-name {
          font-size: 10px;
          color: #64748b;
          text-transform: uppercase;
          font-weight: 600;
        }

        .drag-handle {
          color: #475569;
          font-size: 12px;
          cursor: grab;
        }

        .response-content {
          color: #cbd5e1;
          font-size: 11px;
          line-height: 1.3;
        }
      `}</style>
    </div>
  );
};

export const VirtualizedTimeline: React.FC<VirtualizedTimelineProps> = ({
  turns,
  focusedId,
  onSelect,
  onResponseSelect,
  className = '',
}) => {
  return (
    <Virtuoso
      data={turns}
      itemContent={(index, turn) => (
        <TurnSummaryCard
          key={turn.id}
          turn={turn}
          isFocused={turn.id === focusedId}
          onClick={() => onSelect(turn.id)}
          onResponseClick={(responseId) => onResponseSelect?.(turn.id, responseId)}
        />
      )}
      style={{ height: '100%' }}
    />
  );
};