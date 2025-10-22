import React, { useState, useMemo, useEffect } from 'react';
import { ChatTurn } from '../../types/chat';
import { Granularity, segmentText } from '../../utils/segmentText';
import { DraggableSegment } from './DraggableSegment';
import { ProvenanceData } from './extensions/ComposedContentNode';

interface ExpandedTurnOverlayProps {
  turn: ChatTurn;
  onClose: () => void;
  prevTurn?: ChatTurn;
  nextTurn?: ChatTurn;
  onNavigate: (direction: 'prev' | 'next') => void;
}

const getProviderColor = (providerId: string): string => {
  const colors: Record<string, string> = {
    'openai': '#10a37f',
    'anthropic': '#8b5cf6',
    'claude': '#8b5cf6',
    'google': '#4285f4',
    'xai': '#ff6b35',
  };
  return colors[providerId.replace('-synthesis', '').replace('-mapping', '')] || '#6b7280';
};

export const ExpandedTurnOverlay: React.FC<ExpandedTurnOverlayProps> = ({
  turn,
  onClose,
  prevTurn,
  nextTurn,
  onNavigate
}) => {
  const [granularity, setGranularity] = useState<Granularity>('paragraph');
  const [selectedResponseId, setSelectedResponseId] = useState<string>(
    turn.responses[0]?.id || ''
  );

  const selectedResponse = turn.responses.find(r => r.id === selectedResponseId);
  const displayContent = turn.type === 'user' ? turn.content : selectedResponse?.content || turn.content;
  
  const segments = useMemo(() => {
    return segmentText(displayContent, granularity);
  }, [displayContent, granularity]);

  const provenance: ProvenanceData = {
    turnId: turn.id,
    responseId: selectedResponse?.id,
    providerId: turn.type === 'user' ? 'user' : (selectedResponse?.providerId || turn.providerId || 'unknown'),
    timestamp: turn.timestamp,
    sessionId: turn.sessionId
  };

  const sourceContext = {
    fullResponse: displayContent,
    beforeText: undefined,
    afterText: undefined
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && prevTurn) onNavigate('prev');
      if (e.key === 'ArrowRight' && nextTurn) onNavigate('next');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, prevTurn, nextTurn, onNavigate]);

  // Update selected response when turn changes
  useEffect(() => {
    setSelectedResponseId(turn.responses[0]?.id || '');
  }, [turn.id]);

  const TurnCard: React.FC<{ turn: ChatTurn; isMini: boolean; onClick: () => void }> = ({ 
    turn, 
    isMini, 
    onClick 
  }) => {
    const displayContent = turn.type === 'user' 
      ? turn.content 
      : turn.responses[0]?.content || turn.content;
    
    const truncated = displayContent.length > 60
      ? displayContent.substring(0, 60) + '...'
      : displayContent;

    return (
      <div
        onClick={onClick}
        style={{
          minWidth: '200px',
          maxWidth: '200px',
          background: '#1e293b',
          border: '2px solid #334155',
          borderRadius: '12px',
          padding: '12px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          opacity: 0.7,
          transform: 'scale(0.9)',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '6px',
            background: turn.type === 'user' ? '#3b82f6' : getProviderColor(turn.providerId || 'default'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px'
          }}>
            {turn.type === 'user' ? '👤' : '🤖'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>
              {turn.type === 'user' ? 'User' : turn.providerId || 'AI'}
            </div>
          </div>
          {turn.type === 'ai' && turn.responses.length > 1 && (
            <div style={{
              fontSize: '10px',
              background: '#334155',
              padding: '2px 6px',
              borderRadius: '4px',
              color: '#94a3b8'
            }}>
              {turn.responses.length}
            </div>
          )}
        </div>
        <div style={{
          fontSize: '11px',
          color: '#e2e8f0',
          lineHeight: '1.4',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {truncated}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        display: 'flex',
        gap: '20px',
        alignItems: 'center',
        maxWidth: '1400px',
        width: '100%',
        height: '80vh'
      }}>
        {/* Previous Turn Mini */}
        {prevTurn && (
          <TurnCard
            turn={prevTurn}
            isMini={true}
            onClick={() => onNavigate('prev')}
          />
        )}

        {/* Main Overlay */}
        <div style={{
          flex: 1,
          background: '#0f172a',
          borderRadius: '16px',
          border: '2px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          maxHeight: '80vh',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            padding: '20px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: turn.type === 'user' ? '#3b82f6' : getProviderColor(turn.providerId || 'default'),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {turn.type === 'user' ? '👤' : '🤖'}
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#e2e8f0' }}>
                  {turn.type === 'user' ? 'User Prompt' : turn.providerId || 'AI Response'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {new Date(turn.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px 8px'
              }}
            >
              ×
            </button>
          </div>

          {/* Response Selector for AI turns */}
          {turn.type === 'ai' && turn.responses.length > 1 && (
            <div style={{
              padding: '12px 20px',
              borderBottom: '1px solid #334155',
              display: 'flex',
              gap: '8px',
              overflowX: 'auto'
            }}>
              {turn.responses.map(resp => (
                <button
                  key={resp.id}
                  onClick={() => setSelectedResponseId(resp.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${selectedResponseId === resp.id ? '#8b5cf6' : '#334155'}`,
                    background: selectedResponseId === resp.id ? 'rgba(139, 92, 246, 0.2)' : '#1e293b',
                    color: '#e2e8f0',
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {resp.providerId}
                </button>
              ))}
            </div>
          )}

          {/* Granularity Controls */}
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            gap: '8px',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '12px', color: '#94a3b8', marginRight: '8px' }}>
              Drag Granularity:
            </span>
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
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px'
          }}>
            {/* Keyboard shortcuts hint */}
            <div style={{
              fontSize: '11px',
              color: '#64748b',
              marginBottom: '16px',
              padding: '8px 12px',
              background: 'rgba(100, 116, 139, 0.1)',
              borderRadius: '6px',
              border: '1px solid rgba(100, 116, 139, 0.2)'
            }}>
              💡 <strong>Drag</strong> any segment to the canvas • <strong>ESC</strong> to close • <strong>←→</strong> to navigate
            </div>

            {/* Draggable Content */}
            <div style={{
              color: '#e2e8f0',
              lineHeight: '1.6',
              fontSize: '14px'
            }}>
              {segments.map(segment => (
                <DraggableSegment
                  key={segment.id}
                  segment={segment}
                  turnId={turn.id}
                  responseId={selectedResponse?.id || turn.id}
                  providerId={provenance.providerId}
                  granularity={granularity}
                  provenance={provenance}
                  sourceContext={sourceContext}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Next Turn Mini */}
        {nextTurn && (
          <TurnCard
            turn={nextTurn}
            isMini={true}
            onClick={() => onNavigate('next')}
          />
        )}
      </div>
    </div>
  );
};