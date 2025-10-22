import React, { useState } from 'react';
import { VirtualizedHorizontalTimeline } from './VirtualizedHorizontalTimeline';
import { FocusPaneV2 } from './FocusPaneV2';
import type { ChatTurn, ResponseBlock } from '../../types/chat';

interface SourcePanelProps {
  turns: ChatTurn[];
  allTurns?: any[]; // Add allTurns property
  selectedTurn?: ChatTurn;
  selectedResponse?: ResponseBlock;
  onTurnSelect: (turn: ChatTurn) => void;
  onResponseSelect?: (response: ResponseBlock) => void;
  onDragStart: (data: any) => void;
  currentTurnIndex: number;
  onTurnExpand: (index: number) => void;
  className?: string;
}

export const SourcePanel: React.FC<SourcePanelProps> = ({
  turns,
  selectedTurn,
  selectedResponse,
  onTurnSelect,
  onResponseSelect,
  onDragStart,
  currentTurnIndex,
  onTurnExpand,
  className = '',
}) => {
  return (
    <div
      className={`source-panel ${className}`}
      style={{
        width: '100%',
        height: '100%',
        background: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Focus Pane - Top 40% */}
      <div
        className="focus-pane-container"
        style={{
          height: '40%',
          minHeight: '200px',
          borderBottom: '2px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#1e293b',
        }}
      >
        {/* Focus Pane Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #334155',
            background: '#1e293b',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#e2e8f0',
            }}
          >
            Focus View
          </div>
          {selectedTurn && (
            <div
              style={{
                fontSize: '11px',
                color: '#64748b',
                marginTop: '4px',
              }}
            >
              Turn {selectedTurn.id} • {selectedTurn.responses.length} response
              {selectedTurn.responses.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Focus Pane Content */}
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
          }}
        >
          <FocusPaneV2
            turn={selectedTurn ?? null}
            selectedResponseId={selectedResponse?.id}
            onDragStart={onDragStart}
          />
        </div>
      </div>

      {/* Timeline Rail - Bottom 60% */}
      <div
        className="timeline-container"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#0f172a',
        }}
      >
        {/* Timeline Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #334155',
            background: '#1e293b',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#e2e8f0',
            }}
          >
            Timeline Rail
          </div>
          <div
            style={{
              fontSize: '11px',
              color: '#64748b',
              marginTop: '4px',
            }}
          >
            {turns.length} turn{turns.length !== 1 ? 's' : ''} • Scroll or click to focus
          </div>
        </div>

        {/* Timeline Content */}
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            padding: '8px',
          }}
        >
          <VirtualizedHorizontalTimeline
            turns={turns}
            currentTurnIndex={currentTurnIndex}
            onTurnSelect={(index) => {
              const turn = turns[index];
              if (turn) onTurnSelect(turn);
            }}
            onTurnExpand={onTurnExpand}
          />
        </div>
      </div>
    </div>
  );
};

export default SourcePanel;
