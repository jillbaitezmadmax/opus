import React, { useMemo } from 'react';
import type { ChatTurn, ResponseBlock } from '../../types/chat';
import { DraggableSegment } from './DraggableSegment';
import { Granularity, segmentText } from '../../utils/segmentText';
import { ProvenanceData } from './extensions/ComposedContentNode';

interface ResponseViewerProps {
  turn: ChatTurn | null;
  response?: ResponseBlock | undefined;
  granularity: Granularity; // 'paragraph' | 'sentence'
  onGranularityChange: (g: Granularity) => void;
}

export const ResponseViewer: React.FC<ResponseViewerProps> = ({
  turn,
  response,
  granularity,
  onGranularityChange,
}) => {
  const selectedBelongs = useMemo(() => {
    if (!turn || turn.type === 'user' || !response?.providerId) return false;
    return (turn.responses || []).some(r => r.providerId === response.providerId);
  }, [turn, response]);

  const text = useMemo(() => {
    if (!turn) return '';
    if (turn.type === 'user') return turn.content || '';
    if (response && selectedBelongs) return response.content || '';
    return turn.responses?.[0]?.content || turn.content || '';
  }, [turn, response, selectedBelongs]);

  const providerId = useMemo(() => {
    if (!turn || turn.type === 'user') return 'user';
    if (response && selectedBelongs) return response.providerId || 'unknown';
    return turn.providerId || 'unknown';
  }, [turn, response, selectedBelongs]);

  // Map UI granularity to provenance granularity union
  const provGranularity: ProvenanceData['granularity'] = useMemo(() => {
    if (granularity === 'paragraph') return 'paragraph';
    if (granularity === 'sentence') return 'sentence';
    // Any other UI values (e.g., 'word') collapse to selection/full provenance
    return 'selection';
  }, [granularity]);

  const provenance: ProvenanceData = useMemo(() => ({
    sessionId: turn?.sessionId || 'current',
    aiTurnId: turn?.id || 'unknown',
    providerId: providerId,
    responseType: 'batch',
    responseIndex: 0,
    timestamp: Date.now(),
    granularity: provGranularity,
    sourceText: text,
    sourceContext: { fullResponse: text }
  }), [turn, providerId, provGranularity, text]);

  const segments = useMemo(() => segmentText(text, granularity), [text, granularity]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #334155',
        background: '#0f172a',
      }}>
        <div style={{ color: '#cbd5e1', fontSize: 12 }}>
          {turn?.type === 'ai' ? 'AI Response' : 'User Message'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onGranularityChange('paragraph')}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #334155',
              background: granularity === 'paragraph' ? '#1e293b' : '#0f172a',
              color: '#e2e8f0',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >Paragraph</button>
          <button
            onClick={() => onGranularityChange('sentence')}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #334155',
              background: granularity === 'sentence' ? '#1e293b' : '#0f172a',
              color: '#e2e8f0',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >Sentence</button>
        </div>
      </div>

      {/* Content, rendered in-place with draggable segments */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: 16,
        background: '#0b1220',
        borderRadius: 8
      }}>
        {segments.length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>No content available.</div>
        )}
        {segments.map(seg => (
          <DraggableSegment
            key={seg.id}
            segment={seg}
            turnId={turn?.id || 'unknown'}
            responseId={response?.id || `${turn?.id}-primary`}
            providerId={providerId}
            granularity={granularity}
            provenance={provenance}
            sourceContext={{ fullResponse: text }}
          />
        ))}
      </div>
    </div>
  );
};

export default ResponseViewer;