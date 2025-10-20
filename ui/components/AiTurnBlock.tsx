import { AiTurn, ProviderResponse, AppStep } from '../types';
import ProviderResponseBlock from './ProviderResponseBlock';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo, useState } from 'react';
import { hasComposableContent } from '../utils/composerUtils';
import { LLM_PROVIDERS_CONFIG } from '../constants';
import ClipsCarousel from './ClipsCarousel';
import { ChevronDownIcon, ChevronUpIcon } from './Icons'; // FIX: Import icons

interface AiTurnBlockProps {
  aiTurn: AiTurn;
  isLive?: boolean;
  isReducedMotion?: boolean;
  isLoading?: boolean;
  currentAppStep?: AppStep;
  showSourceOutputs?: boolean;
  onToggleSourceOutputs?: () => void;
  onEnterComposerMode?: (aiTurn: AiTurn) => void;
  activeSynthesisClipProviderId?: string;
  activeMappingClipProviderId?: string;
  onClipClick?: (type: 'synthesis' | 'mapping', providerId: string) => void;
}

const AiTurnBlock: React.FC<AiTurnBlockProps> = ({
  aiTurn,
  onToggleSourceOutputs,
  showSourceOutputs = false,
  onEnterComposerMode,
  isReducedMotion = false,
  isLoading = false,
  currentAppStep,
  activeSynthesisClipProviderId,
  activeMappingClipProviderId,
  onClipClick,
}) => {
  const [isSynthesisExpanded, setIsSynthesisExpanded] = useState(true); // FIX: Add state for expand/collapse
  const [isMappingExpanded, setIsMappingExpanded] = useState(true); // FIX: Add state for expand/collapse
  // Normalize responses
  const synthesisResponses = useMemo(() => {
    const map = aiTurn.synthesisResponses || {};
    const out: Record<string, ProviderResponse[]> = {};
    Object.entries(map as Record<string, any>).forEach(([pid, resp]) => {
      out[pid] = Array.isArray(resp) ? resp : [resp as ProviderResponse];
    });
    return out;
  }, [aiTurn.synthesisResponses]);

  const mappingResponses = useMemo(() => {
    const map = aiTurn.mappingResponses || {};
    const out: Record<string, ProviderResponse[]> = {};
    Object.entries(map as Record<string, any>).forEach(([pid, resp]) => {
      out[pid] = Array.isArray(resp) ? resp : [resp as ProviderResponse];
    });
    return out;
  }, [aiTurn.mappingResponses]);

  // Prepare source content (batch + hidden)
  const allSources = useMemo(() => {
    const sources: Record<string, ProviderResponse> = { ...(aiTurn.batchResponses || {}) };
    if (aiTurn.hiddenBatchOutputs) {
      Object.entries(aiTurn.hiddenBatchOutputs).forEach(([providerId, response]) => {
        if (!sources[providerId]) {
          const typedResponse = response as ProviderResponse; // Cast for type safety
          sources[providerId] = {
            providerId,
            text: typedResponse.text || '',
            status: 'completed' as const,
            createdAt: typedResponse.createdAt || Date.now(),
            updatedAt: typedResponse.updatedAt || Date.now(),
          } as ProviderResponse;
        }
      });
    }
    return sources;
  }, [aiTurn.batchResponses, aiTurn.hiddenBatchOutputs]);

  const hasSources = Object.keys(allSources).length > 0;

  // Active clip selection fallbacks: first available provider with takes
  const providerIds = useMemo(() => LLM_PROVIDERS_CONFIG.map(p => String(p.id)), []);

  const computeActiveProvider = (
    explicit: string | undefined,
    map: Record<string, ProviderResponse[]>
  ): string | undefined => {
    if (explicit) return explicit;
    for (const pid of providerIds) {
      const arr = map[pid];
      if (arr && arr.length > 0) return pid;
    }
    return undefined;
  };

  const activeSynthPid = computeActiveProvider(activeSynthesisClipProviderId, synthesisResponses);
  const activeMappingPid = computeActiveProvider(activeMappingClipProviderId, mappingResponses);

  const getLatestTake = (arr?: ProviderResponse[]): ProviderResponse | undefined => {
    if (!arr || arr.length === 0) return undefined;
    return arr[arr.length - 1];
  };

  return (
    <div className="ai-turn-block" style={{ border: '1px solid #334155', borderRadius: 12, padding: 12 }}>
      <div className="ai-turn-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* New HORIZONTAL wrapper for top two blocks in the main VERTICAL container */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: 16 }}>
          {/* Synthesis Section (First item in the horizontal row) */}
          <div className="synthesis-section" style={{ border: '1px solid #475569', borderRadius: 8, padding: 12, flex: 1 }}>
            <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h4 style={{ margin: 0, fontSize: 14, color: '#e2e8f0' }}>Synthesis</h4>
              {/* FIX: Add toggle button */}
              <button onClick={() => setIsSynthesisExpanded(p => !p)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}>
                {isSynthesisExpanded ? <ChevronUpIcon style={{width: 16, height: 16}} /> : <ChevronDownIcon style={{width: 16, height: 16}} />}
              </button>
            </div>
            {/* FIX: Conditionally render content */}
            {isSynthesisExpanded && (
              <>
                <ClipsCarousel
                  providers={LLM_PROVIDERS_CONFIG}
                  responsesMap={synthesisResponses}
                  activeProviderId={activeSynthPid}
                  onClipClick={(pid) => onClipClick?.('synthesis', pid)}
                />
                <div className="clip-content" style={{ marginTop: 12, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
              {activeSynthPid ? (
                (() => {
                  const take = getLatestTake(synthesisResponses[activeSynthPid]);
                  if (!take) return <div style={{ color: '#64748b' }}>No synthesis yet for this model.</div>;
                  return (
                    <div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{activeSynthPid} · {take.status}</div>
                      <div className="prose prose-sm max-w-none dark:prose-invert" style={{ lineHeight: 1.7, fontSize: 16 }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {String(take.text || '')}
                        </ReactMarkdown>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div style={{ color: '#64748b' }}>Choose a model to synthesize.</div>
              )}
            </div>
              </>
            )}
          </div>

          {/* Mapping Section (Second item in the horizontal row) */}
          <div className="mapping-section" style={{ border: '1px solid #475569', borderRadius: 8, padding: 12, flex: 1 }}>
            <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h4 style={{ margin: 0, fontSize: 14, color: '#e2e8f0' }}>Mapping</h4>
              {/* FIX: Add toggle button */}
              <button onClick={() => setIsMappingExpanded(p => !p)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}>
                {isMappingExpanded ? <ChevronUpIcon style={{width: 16, height: 16}} /> : <ChevronDownIcon style={{width: 16, height: 16}} />}
              </button>
            </div>
            {/* FIX: Conditionally render content */}
            {isMappingExpanded && (
                <>
                  <ClipsCarousel
                    providers={LLM_PROVIDERS_CONFIG}
                    responsesMap={mappingResponses}
                    activeProviderId={activeMappingPid}
                    onClipClick={(pid) => onClipClick?.('mapping', pid)}
                  />
                  <div className="clip-content" style={{ marginTop: 12, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
              {activeMappingPid ? (
                (() => {
                  const take = getLatestTake(mappingResponses[activeMappingPid]);
                  if (!take) return <div style={{ color: '#64748b' }}>No mapping yet for this model.</div>;
                  return (
                    <div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{activeMappingPid} · {take.status}</div>
                      <div className="prose prose-sm max-w-none dark:prose-invert" style={{ lineHeight: 1.7, fontSize: 16 }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {String(take.text || '')}
                        </ReactMarkdown>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div style={{ color: '#64748b' }}>Choose a model to mapping.</div>
              )}
            </div>
                </>
            )}
          </div>
        </div>

        {/* Batch Responses (Sources) - This is now the SECOND item in the main VERTICAL container */}
        {hasSources && (
          <div className="sources-wrapper" style={{ border: '1px solid #475569', borderRadius: 8, padding: 12 }}>
            <div className="sources-toggle" style={{ textAlign: 'center', marginBottom: 8 }}>
              <button
                onClick={() => onToggleSourceOutputs?.()}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0b1220', color: '#e2e8f0', cursor: 'pointer' }}
              >
                {showSourceOutputs ? 'Hide Sources' : 'Show Sources'}
              </button>
            </div>
            {showSourceOutputs && (
              <div className="sources-content">
                <ProviderResponseBlock
                  providerResponses={allSources}
                  isLoading={isLoading}
                  currentAppStep={currentAppStep as AppStep}
                  isReducedMotion={isReducedMotion}
                />
              </div>
            )}
          </div>
        )}

        {/* Composer Mode Entry Button */}
        {hasComposableContent(aiTurn) && (
          <div className="composer-entry" style={{ textAlign: 'center' }}>
            <button
              onClick={() => onEnterComposerMode?.(aiTurn)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #334155', background: '#1d4ed8', color: '#fff', cursor: 'pointer' }}
            >
              Open in Composer
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AiTurnBlock;
