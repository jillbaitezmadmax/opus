import React, { useMemo } from 'react';
import type { ChatTurn, ResponseBlock } from '../../types/chat';
import { DraggableSegment } from './DraggableSegment';
import { Granularity, segmentText } from '../../utils/segmentText';
import { ProvenanceData } from './extensions/ComposedContentNode';
import { getProviderById } from '../../providers/providerRegistry';

interface ResponseViewerProps {
  turn: ChatTurn | null;
  response?: ResponseBlock | undefined;
  granularity: Granularity; // 'paragraph' | 'sentence'
  onGranularityChange: (g: Granularity) => void;
  onPinSegment?: (text: string, provenance: ProvenanceData) => void;
  onExtractToCanvas?: (text: string, provenance: ProvenanceData) => void;
}

export const ResponseViewer: React.FC<ResponseViewerProps> = ({
  turn,
  response,
  granularity,
  onGranularityChange,
  onPinSegment,
  onExtractToCanvas,
}) => {
  // Determine effective response to display
  const effectiveResponse = useMemo<ResponseBlock | undefined>(() => {
    if (!turn) return undefined;
    if (turn.type === 'user') return undefined;
    if (response && (turn.responses || []).some(r => r.id === response.id)) return response;
    return turn.responses?.[0];
  }, [turn, response]);

  const text = useMemo(() => {
    if (!turn) return '';
    if (turn.type === 'user') return turn.content || '';
    return effectiveResponse?.content || '';
  }, [turn, effectiveResponse]);

  const providerIdFull = useMemo(() => {
    if (!turn || turn.type === 'user') return 'user';
    return effectiveResponse?.providerId || turn.providerId || 'unknown';
  }, [turn, effectiveResponse]);

  const baseProviderId = useMemo(() => providerIdFull.replace(/-(synthesis|mapping)$/,'') , [providerIdFull]);
  const responseType: ProvenanceData['responseType'] = useMemo(() => {
    if (/-synthesis$/.test(providerIdFull)) return 'synthesis';
    if (/-mapping$/.test(providerIdFull)) return 'mapping';
    return 'batch';
  }, [providerIdFull]);
  const responseIndex = useMemo(() => {
    if (!turn || turn.type === 'user') return 0;
    const idx = (turn.responses || []).findIndex(r => r.id === effectiveResponse?.id);
    return idx >= 0 ? idx : 0;
  }, [turn, effectiveResponse]);

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
    providerId: providerIdFull,
    responseType,
    responseIndex,
    timestamp: Date.now(),
    granularity: provGranularity,
    sourceText: text,
    sourceContext: { fullResponse: text }
  }), [turn, providerIdFull, responseType, responseIndex, provGranularity, text]);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ color: '#cbd5e1', fontSize: 12 }}>
            {turn?.type === 'ai' ? 'AI Response' : 'User Message'}
          </div>
          {turn && turn.type === 'ai' && (
            (() => {
              const provider = getProviderById(baseProviderId);
              const typeLabel = responseType === 'batch' ? 'Batch' : responseType === 'synthesis' ? 'Synthesis' : 'Mapping';
              return (
                <div style={{
                  fontSize: 12,
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '2px 6px'
                }} title={`${provider?.name || baseProviderId} • ${typeLabel}`}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: provider?.color || '#8b5cf6' }} />
                  <span>{provider?.name || baseProviderId}</span>
                  <span style={{ opacity: 0.7 }}>• {typeLabel}</span>
                </div>
              );
            })()
          )}
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
            responseId={effectiveResponse?.id || `${turn?.id}-primary`}
            providerId={providerIdFull}
            granularity={granularity}
            provenance={provenance}
            sourceContext={{ fullResponse: text }}
            onPin={onPinSegment}
            onExtractToCanvas={onExtractToCanvas}
          />
        ))}
      </div>
    </div>
  );
};

export default ResponseViewer;