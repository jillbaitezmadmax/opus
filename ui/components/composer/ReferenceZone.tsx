import React from 'react';
import { PinnedBar } from './PinnedBar';
import { ResponseViewer } from './ResponseViewer';
import { GhostData } from '../../types/dragDrop';
import { ProvenanceData } from './extensions/ComposedContentNode';
import { ChatTurn, ResponseBlock } from '../../types/chat';
import { Granularity } from '../../utils/segmentText';
import { getProviderById } from '../../providers/providerRegistry';

interface ReferenceZoneProps {
  turn: ChatTurn | null;
  response?: ResponseBlock;
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
  pinnedGhosts: GhostData[];
  onPinSegment: (text: string, provenance: ProvenanceData) => Promise<void>;
  onUnpinGhost: (ghostId: string) => Promise<void>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelectResponse?: (providerId: string) => void;
  onExtractToCanvas?: (text: string, provenance: ProvenanceData) => void;
}

export const ReferenceZone: React.FC<ReferenceZoneProps> = ({
  turn,
  response,
  granularity,
  onGranularityChange,
  pinnedGhosts,
  onPinSegment,
  onUnpinGhost,
  isCollapsed,
  onToggleCollapse,
  onSelectResponse,
  onExtractToCanvas,
}) => {
  if (isCollapsed) {
    return (
      <div
        style={{
          width: '40px',
          height: '100%',
          background: '#0f172a',
          borderRight: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 0',
        }}
      >
        <button
          onClick={onToggleCollapse}
          style={{
            background: 'none',
            border: '1px solid #334155',
            borderRadius: '6px',
            color: '#e2e8f0',
            cursor: 'pointer',
            padding: '8px',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
          }}
          title="Expand Reference Zone"
          aria-label="Expand Reference Zone"
        >
          »
        </button>
        
        {/* Pin count indicator when collapsed */}
        {pinnedGhosts.length > 0 && (
          <div
            style={{
              marginTop: '12px',
              fontSize: '11px',
              color: '#64748b',
              fontWeight: 500,
              textAlign: 'center',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
            }}
          >
            {pinnedGhosts.length} pins
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        minWidth: '350px',
        maxWidth: '500px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f172a',
        borderRight: '1px solid #334155',
        overflow: 'hidden',
      }}
    >
      {/* Header with collapse toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid #334155',
          background: '#0f172a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ color: '#cbd5e1', fontSize: 14, fontWeight: 500 }}>
            Reference Zone
          </div>
          {/* Current provider label */}
          {turn && turn.type === 'ai' && (
            (() => {
              const currentResp = response || turn.responses?.[0];
              const providerId = currentResp?.providerId || '';
              const baseProviderId = providerId.replace(/-(synthesis|mapping)$/,'');
              const typeSuffix = providerId.includes('-synthesis') ? 'Synthesis' : providerId.includes('-mapping') ? 'Mapping' : 'Batch';
              const provider = getProviderById(baseProviderId);
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
                }} title={`Viewing ${provider?.name || baseProviderId} • ${typeSuffix}`}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: provider?.color || '#8b5cf6'
                  }} />
                  <span>{provider?.name || baseProviderId}</span>
                  <span style={{ opacity: 0.7 }}>• {typeSuffix}</span>
                </div>
              );
            })()
          )}
        </div>
        <button
          onClick={onToggleCollapse}
          style={{
            background: 'none',
            border: '1px solid #334155',
            borderRadius: '6px',
            color: '#e2e8f0',
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.2s ease',
          }}
          title="Collapse Reference Zone"
          aria-label="Collapse Reference Zone"
        >
          « Collapse
        </button>
      </div>

      {/* Provider selector row */}
      {turn && turn.type === 'ai' && turn.responses?.length > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px 6px 12px',
          borderBottom: '1px solid #1f2937',
          background: '#0b1220',
          flexWrap: 'wrap'
        }}>
          {turn.responses.map((r) => {
            const baseProviderId = r.providerId.replace(/-(synthesis|mapping)$/,'');
            const typeSuffix = r.providerId.includes('-synthesis') ? 'S' : r.providerId.includes('-mapping') ? 'M' : 'B';
            const provider = getProviderById(baseProviderId);
            const isActive = (response?.id || turn.responses[0]?.id) === r.id;
            return (
              <button
                key={r.id}
                onClick={() => onSelectResponse?.(r.providerId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 8px', borderRadius: 6,
                  border: '1px solid',
                  borderColor: isActive ? (provider?.color || '#8b5cf6') : '#334155',
                  background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent',
                  color: isActive ? '#e2e8f0' : '#94a3b8',
                  cursor: 'pointer'
                }}
                title={`${provider?.name || baseProviderId} • ${r.providerId.includes('-synthesis') ? 'Synthesis' : r.providerId.includes('-mapping') ? 'Mapping' : 'Batch'}`}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: provider?.color || '#8b5cf6' }} />
                <span style={{ fontSize: 12 }}>{provider?.name || baseProviderId}</span>
                <span style={{ fontSize: 10, opacity: 0.7 }}>({typeSuffix})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Pinned Bar */}
      <PinnedBar
        ghosts={pinnedGhosts}
        onRemoveGhost={onUnpinGhost}
      />

      {/* Response Viewer */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ResponseViewer
          turn={turn}
          response={response}
          granularity={granularity}
          onGranularityChange={onGranularityChange}
          onPinSegment={onPinSegment}
          onExtractToCanvas={onExtractToCanvas}
        />
      </div>
    </div>
  );
};

export default ReferenceZone;
