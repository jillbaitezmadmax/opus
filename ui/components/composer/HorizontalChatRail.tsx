import React, { useMemo, useRef, useEffect, useState } from 'react';
import type { ChatTurn } from '../../types/chat';
import type { TurnMessage, UserTurn, AiTurn, ProviderResponse } from '../../types';

interface HorizontalChatRailProps {
  turns: ChatTurn[];
  allTurns: TurnMessage[];
  currentStepIndex: number;
  onStepSelect: (chatTurnIndex: number, aiTurn: ChatTurn | null) => void;
  onStepHover?: (chatTurnIndex: number, aiTurn: ChatTurn | null) => void;
  onStepExpand?: (chatTurnIndex: number) => void;
  onResponsePick?: (turnIndex: number, providerId: string, content: string) => void;
  className?: string;
}

interface StepBuilt {
  user: UserTurn | null;
  aiMain: AiTurn | null;
  batch: { providerId: string; content: string }[];
  synthesis: { providerId: string; content: string }[];
  mapping: { providerId: string; content: string }[];
  chatTurnIndex: number | null; // index into turns[] for aiMain
  userChatIndex: number | null; // index into turns[] for user
}

const truncate = (text: string, len: number) => (text.length > len ? text.slice(0, len) + '…' : text);

const lastOf = (arr: ProviderResponse[] | undefined): ProviderResponse | null => {
  if (!arr || arr.length === 0) return null;
  return arr[arr.length - 1] || null;
};

export const HorizontalChatRail: React.FC<HorizontalChatRailProps> = ({
  turns,
  allTurns,
  currentStepIndex,
  onStepSelect,
  onStepHover,
  onStepExpand,
  onResponsePick,
  className = ''
}) => {
  // Build steps by grouping each user with subsequent AI turns until next user.
  const steps = useMemo<StepBuilt[]>(() => {
    const out: StepBuilt[] = [];
    let i = 0;
    while (i < allTurns.length) {
      const msg = allTurns[i];
      if (msg.type === 'user') {
        const user = msg as UserTurn;
        let j = i + 1;
        let aiMain: AiTurn | null = null;
        while (j < allTurns.length && allTurns[j].type === 'ai') {
          const ai = allTurns[j] as AiTurn;
          // First non-synthesis/mapping AI becomes the main response turn
          if (!aiMain) aiMain = ai;
          j++;
        }
        const batch: { providerId: string; content: string }[] = [];
        if (aiMain) {
          Object.entries(aiMain.batchResponses || {}).forEach(([pid, resp]) => {
            const r = resp as ProviderResponse;
            if (r?.text?.trim()) batch.push({ providerId: pid, content: r.text! });
          });
        }
        // Pull synthesis responses from the same aiMain turn
        const synthesis: { providerId: string; content: string }[] = [];
        if (aiMain) {
          Object.entries(aiMain.synthesisResponses || {}).forEach(([pid, arr]) => {
            const a = Array.isArray(arr) ? (arr as ProviderResponse[]) : [arr as ProviderResponse];
            const last = lastOf(a);
            if (last?.text?.trim()) synthesis.push({ providerId: pid, content: last.text! });
          });
        }
        // Pull ensemble/mapping responses from the same aiMain turn
        const mapping: { providerId: string; content: string }[] = [];
        if (aiMain) {
          Object.entries(aiMain.mappingResponses || {}).forEach(([pid, arr]) => {
            const a = Array.isArray(arr) ? (arr as ProviderResponse[]) : [arr as ProviderResponse];
            const last = lastOf(a);
            if (last?.text?.trim()) mapping.push({ providerId: pid, content: last.text! });
          });
        }
        const chatTurnIndex = aiMain ? turns.findIndex(ct => ct.id === aiMain!.id) : -1;
        const userChatIndex = turns.findIndex(ct => ct.id === user.id);
        out.push({
          user,
          aiMain,
          batch,
          synthesis,
          mapping,
          chatTurnIndex: chatTurnIndex >= 0 ? chatTurnIndex : null,
          userChatIndex: userChatIndex >= 0 ? userChatIndex : null,
        });
        i = j;
      } else {
        // Stray AI (no preceding user) — show as its own step
        const ai = msg as AiTurn;
        const batch: { providerId: string; content: string }[] = [];
        Object.entries(ai.batchResponses || {}).forEach(([pid, resp]) => {
          const r = resp as ProviderResponse;
          if (r?.text?.trim()) batch.push({ providerId: pid, content: r.text! });
        });
        const mapping: { providerId: string; content: string }[] = [];
        Object.entries(ai.mappingResponses || {}).forEach(([pid, arr]) => {
          const a = Array.isArray(arr) ? (arr as ProviderResponse[]) : [arr as ProviderResponse];
          const last = lastOf(a);
          if (last?.text?.trim()) mapping.push({ providerId: pid, content: last.text! });
        });
        const synthesis: { providerId: string; content: string }[] = [];
        Object.entries(ai.synthesisResponses || {}).forEach(([pid, arr]) => {
          const a = Array.isArray(arr) ? (arr as ProviderResponse[]) : [arr as ProviderResponse];
          const last = lastOf(a);
          if (last?.text?.trim()) synthesis.push({ providerId: pid, content: last.text! });
        });
        const chatTurnIndex = turns.findIndex(ct => ct.id === ai.id);
        const pseudoUser: UserTurn | null = allTurns[i - 1]?.type === 'user' ? (allTurns[i - 1] as UserTurn) : null;
        const userChatIndex = pseudoUser ? turns.findIndex(ct => ct.id === pseudoUser.id) : -1;
        out.push({
          user: pseudoUser,
          aiMain: ai,
          batch,
          synthesis,
          mapping,
          chatTurnIndex: chatTurnIndex >= 0 ? chatTurnIndex : null,
          userChatIndex: userChatIndex >= 0 ? userChatIndex : null,
        });
        i += 1;
      }
    }
    return out;
  }, [allTurns, turns]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const cardWidth = 520; // approximate step width with padding
    const stepIndex = steps.findIndex(s => s.chatTurnIndex === currentStepIndex);
    const target = stepIndex >= 0 ? stepIndex : 0;
    container.scrollTo({ left: Math.max(0, target * cardWidth - cardWidth), behavior: 'smooth' });
  }, [currentStepIndex, steps]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 0);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth);
    };
    update();
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [scrollRef]);

  return (
    <div
      className={`composer-bottom-rail ${className}`}
      style={{
        background: '#0f172a',
        borderTop: '1px solid #334155',
        height: 200,
        transition: 'height 180ms ease',
        display: 'flex',
        alignItems: 'stretch',
        flexShrink: 0,
        boxSizing: 'border-box',
        position: 'relative'
      }}
    >
      {/* Left/right navigation controls */}
      <button
        aria-label="Previous"
        onClick={() => scrollRef.current?.scrollBy({ left: -520, behavior: 'smooth' })}
        disabled={!canScrollLeft}
        style={{
          position: 'absolute',
          left: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          background: '#1e293b',
          border: '1px solid #334155',
          color: '#e2e8f0',
          padding: '6px 8px',
          borderRadius: 8,
          opacity: canScrollLeft ? 1 : 0.4,
          cursor: canScrollLeft ? 'pointer' : 'default',
          zIndex: 2
        }}
      >◀</button>
      <button
        aria-label="Next"
        onClick={() => scrollRef.current?.scrollBy({ left: 520, behavior: 'smooth' })}
        disabled={!canScrollRight}
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          background: '#1e293b',
          border: '1px solid #334155',
          color: '#e2e8f0',
          padding: '6px 8px',
          borderRadius: 8,
          opacity: canScrollRight ? 1 : 0.4,
          cursor: canScrollRight ? 'pointer' : 'default',
          zIndex: 2
        }}
      >▶</button>

      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: 12,
          width: '100%'
        }}
      >
        {steps.map((step, idx) => {
          const isActive = step.chatTurnIndex === currentStepIndex;
          const synthPreview = step.synthesis[0]?.content || '';
          const mapPreview = step.mapping[0]?.content || '';

          let hoverTimer: any;

          return (
            <div
              key={idx}
              onClick={() => step.chatTurnIndex !== null && onStepSelect(step.chatTurnIndex, step.chatTurnIndex !== null ? turns[step.chatTurnIndex] : null)}
              onDoubleClick={() => step.chatTurnIndex !== null && onStepExpand?.(step.chatTurnIndex!)}
              onMouseEnter={() => {
                if (onStepHover && step.chatTurnIndex !== null) {
                  hoverTimer = setTimeout(() => onStepHover!(step.chatTurnIndex!, turns[step.chatTurnIndex!]), 300);
                }
              }}
              onMouseLeave={() => { if (hoverTimer) clearTimeout(hoverTimer); }}
              style={{
                minWidth: 520,
                maxWidth: 520,
                border: `2px solid ${isActive ? '#8b5cf6' : '#334155'}`,
                borderRadius: 12,
                padding: 12,
                background: isActive ? '#182334' : '#1e293b',
                boxShadow: isActive ? '0 6px 18px rgba(139,92,246,0.25)' : 'none',
                display: 'grid',
                gridTemplateColumns: '180px 1fr',
                gap: 12,
                alignItems: 'stretch',
                boxSizing: 'border-box',
                minHeight: 160
              }}
              aria-label={`Step ${idx + 1}`}
              title="Click to focus · Double click to expand"
            >
              {/* Left: User prompt column, centered box without centering text */}
              <div style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: 10,
                alignSelf: 'center',
                maxHeight: 160,
                overflow: 'hidden',
                cursor: step.userChatIndex !== null ? 'pointer' : 'default'
              }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (step.userChatIndex !== null) {
                    onStepSelect(step.userChatIndex, null);
                  }
                }}
              >
                <div style={{
                  color: '#cbd5e1',
                  fontSize: 12,
                  lineHeight: 1.35,
                  textAlign: 'left',
                  wordBreak: 'break-word',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 6,
                  WebkitBoxOrient: 'vertical',
                  whiteSpace: 'normal'
                }}>
                  {step.user ? truncate((step.user as UserTurn).text?.replace(/\n+/g, ' ') || '', 130) : '—'}
                </div>
              </div>

              {/* Right: Two rows – row1 Synthesis + Ensemble (mapping), row2 Batch responses */}
              <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 10, height: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (step.synthesis.length > 0 && step.chatTurnIndex !== null) {
                        onResponsePick?.(step.chatTurnIndex!, step.synthesis[0].providerId, step.synthesis[0].content);
                      }
                    }}
                    style={{ 
                      background: '#0f172a', 
                      border: '1px solid #334155', 
                      borderRadius: 8, 
                      padding: 10, 
                      maxHeight: 76, 
                      overflow: 'hidden',
                      cursor: step.synthesis.length > 0 ? 'pointer' : 'default',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (step.synthesis.length > 0) {
                        e.currentTarget.style.background = '#1e293b';
                        e.currentTarget.style.borderColor = '#475569';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#0f172a';
                      e.currentTarget.style.borderColor = '#334155';
                    }}
                  >
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Synthesis</div>
                    <div style={{ fontSize: 12, color: '#e2e8f0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>{synthPreview ? synthPreview : '—'}</div>
                  </div>
                  <div 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (step.mapping.length > 0 && step.chatTurnIndex !== null) {
                        onResponsePick?.(step.chatTurnIndex!, step.mapping[0].providerId, step.mapping[0].content);
                      }
                    }}
                    style={{ 
                      background: '#0f172a', 
                      border: '1px solid #334155', 
                      borderRadius: 8, 
                      padding: 10, 
                      maxHeight: 76, 
                      overflow: 'hidden',
                      cursor: step.mapping.length > 0 ? 'pointer' : 'default',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (step.mapping.length > 0) {
                        e.currentTarget.style.background = '#1e293b';
                        e.currentTarget.style.borderColor = '#475569';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#0f172a';
                      e.currentTarget.style.borderColor = '#334155';
                    }}
                  >
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Ensemble</div>
                    <div style={{ fontSize: 12, color: '#e2e8f0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>{mapPreview ? mapPreview : '—'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, overflow: 'hidden', maxHeight: 76 }}>
                  {step.batch.slice(0, 3).map((b, i) => (
                    <div key={i} 
                      onClick={(e) => { e.stopPropagation(); step.chatTurnIndex !== null && onResponsePick?.(step.chatTurnIndex!, b.providerId, b.content); }}
                      style={{ flex: '0 0 33%', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 10, overflow: 'hidden', cursor: 'pointer' }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>{b.providerId}</div>
                      <div style={{ fontSize: 12, color: '#e2e8f0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{b.content}</div>
                    </div>
                  ))}
                  {step.batch.length > 3 && (
                    <div style={{ flex: '0 0 80px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', border: '1px dashed #334155', borderRadius: 8, color: '#94a3b8', fontSize: 12 }}>
                      +{step.batch.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HorizontalChatRail;
