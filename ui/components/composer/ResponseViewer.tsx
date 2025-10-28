import React, { useMemo } from 'react';
import type { ChatTurn, ResponseBlock } from '../../types/chat';
import { DraggableSegment } from './DraggableSegment';
import { Granularity, segmentText } from '../../utils/segmentText';
import { ProvenanceData } from './extensions/ComposedContentNode';
import { getProviderById } from '../../providers/providerRegistry';

interface ResponseViewerProps {
  turn: ChatTurn | null;
  response?: ResponseBlock | undefined;
  granularity: Granularity; // kept for compatibility but enforced to 'paragraph'
  onGranularityChange: (g: Granularity) => void; // no-op in UI (sentence removed)
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
  // Enforce paragraph granularity for provenance
  const provGranularity: ProvenanceData['granularity'] = useMemo(() => {
    return 'paragraph';
  }, []);

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

  // Always segment by paragraph
  const segments = useMemo(() => segmentText(text, 'paragraph'), [text]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Controls (sentence toggle removed; compact header) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #334155',
        background: '#0f172a',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ color: '#cbd5e1', fontSize: 11 }}>
            {turn?.type === 'ai' ? 'AI Response' : 'User Message'}
          </div>
          {turn && turn.type === 'ai' && (
            (() => {
              const provider = getProviderById(baseProviderId);
              const typeLabel = responseType === 'batch' ? 'Batch' : responseType === 'synthesis' ? 'Synthesis' : 'Mapping';
              return (
                <div style={{
                  fontSize: 10,
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  border: '1px solid #334155',
                  borderRadius: 4,
                  padding: '1px 4px'
                }} title={`${provider?.name || baseProviderId} • ${typeLabel}`}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: provider?.color || '#8b5cf6' }} />
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
              background: '#1e293b',
              color: '#e2e8f0',
              fontSize: 12,
              cursor: 'default'
            }}
          >Paragraph</button>
        </div>
      </div>

      {/* Content area: outer wrapper handles visible overflow for arrows; inner scrolls */}
      <div style={{
        position: 'relative',
        overflow: 'visible',
        flex: 1,
        minHeight: 0,
        background: '#0b1220',
        borderRadius: 8
      }}>
        <div style={{
          overflow: 'auto',
          height: '100%',
          padding: 16
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
              granularity={'paragraph'}
              provenance={provenance}
              sourceContext={{ fullResponse: text }}
              onPin={onPinSegment}
              onExtractToCanvas={onExtractToCanvas}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ResponseViewer;