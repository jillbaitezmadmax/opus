import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import React from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';

import { TurnMessage, UserTurn, AiTurn, ProviderResponse, AppStep, HistorySessionSummary, BackendMessage, LLMProvider, isUserTurn, isAiTurn, UiPhase, FullSessionPayload, ViewMode, ProviderResponseStatus } from './types';
import { LLM_PROVIDERS_CONFIG, EXAMPLE_PROMPT } from './constants';
import { computeThinkFlag } from '../src/think/lib/think/computeThinkFlag.js';
import UserTurnBlock from './components/UserTurnBlock';
import AiTurnBlock from './components/AiTurnBlock';
import ChatInput from './components/ChatInput';
import HistoryPanel from './components/HistoryPanel';
import CompactModelTray from './components/CompactModelTray';
import { MenuIcon } from './components/Icons';
import api from './services/extension-api';
// legacy persistence removed
import { StreamingBuffer } from './utils/streamingBuffer';
import Banner from './components/Banner';

// simple connection hook: event-driven + single probe with generation token
import { useEffect as _useEffect, useRef as _useRef, useState as _useState, useCallback as _useCallback } from 'react';

type ConnState = 'unknown' | 'connected' | 'reconnecting';

function useConnection(api: {
  getConnectionStatus: () => Promise<{ isConnected: boolean }> | { isConnected: boolean };
  onConnectionStateChange?: (cb: (connected: boolean) => void) => () => void;
}) {
  const [connState, setConnState] = _useState<ConnState>('unknown');
  const genRef = _useRef(0);
  const mountedRef = _useRef(true);

  _useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      genRef.current++;
    };
  }, []);

  const probeOnce = _useCallback(async () => {
    const myGen = ++genRef.current;
    try {
      const res = await Promise.resolve(api.getConnectionStatus());
      if (!mountedRef.current) return false;
      if (genRef.current !== myGen) return false;
      const ok = !!(res && (res as any).isConnected);
      setConnState(ok ? 'connected' : 'reconnecting');
      return ok;
    } catch (err) {
      if (!mountedRef.current) return false;
      if (genRef.current !== myGen) return false;
      setConnState('reconnecting');
      return false;
    }
  }, [api]);

  _useEffect(() => {
    const start = async () => {
      await new Promise((r) => setTimeout(r, 100));
      if (!mountedRef.current) return;
      await probeOnce();
    };
    start();

    const unsub = api.onConnectionStateChange?.((connected: boolean) => {
      if (!mountedRef.current) return;
      setConnState(connected ? 'connected' : 'reconnecting');
      genRef.current++;
    });

    return () => {
      unsub?.();
      genRef.current++;
    };
  }, [api, probeOnce]);

  const refresh = _useCallback(async () => {
    return await probeOnce();
  }, [probeOnce]);

  return { connState, refresh };
}
import { ComposerMode } from './components/composer/ComposerMode';
import { ProviderKey, ExecuteWorkflowRequest } from '../shared/contract';

// buildmappingPrompt has been moved to the backend (workflow-engine.js)

const EMPTY_ELIGIBILITY = {
  synthMap: {} as Record<string, { disabled: boolean; reason?: string }> ,
  mappingMap: {} as Record<string, { disabled: boolean; reason?: string }> ,
  disableSynthesisRun: true,
  disableMappingRun: true,
} as const;

const App = () => {
  // Single source of truth: all messages in one array
  const [messages, setMessages] = useState<TurnMessage[]>([]);
  
  // Round-based saving state
  const [pendingUserTurns, setPendingUserTurns] = useState<Map<string, UserTurn>>(new Map());
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<HistorySessionSummary[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [currentAppStep, setCurrentAppStep] = useState<AppStep>('initial');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [uiTabId, setUiTabId] = useState<number | undefined>();
  const [uiPhase, setUiPhase] = useState<UiPhase>('idle');
  const [isContinuationMode, setIsContinuationMode] = useState(false);
  const [modelsTouched, setModelsTouched] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(() => {
    const hasUsed = localStorage.getItem('htos_has_used');
    return !hasUsed;
  });
  const [selectedModels, setSelectedModels] = useState<Record<string, boolean>>(
    LLM_PROVIDERS_CONFIG.reduce<Record<string, boolean>>((acc, provider) => {
      acc[provider.id] = ['claude', 'gemini', 'chatgpt'].includes(provider.id);
      return acc;
    }, {} as Record<string, boolean>)
  );
  const [isVisibleMode, setIsVisibleMode] = useState(true);
  const [lastSynthesisModel, setLastSynthesisModel] = useState<string>(() => {
    return localStorage.getItem('htos_last_synthesis_model') || 'gemini';
  });
  const [synthesisProvider, setSynthesisProvider] = useState<string | null>('gemini');
  
  // Mapping state with smart defaults
  const [mappingEnabled, setMappingEnabled] = useState<boolean>(() => {
    const hasUsed = localStorage.getItem('htos_has_used');
    if (!hasUsed) {
      // First-time user: set flag and enable mapping by default
      localStorage.setItem('htos_has_used', 'true');
      return true;
    }
    // Returning user: check saved preference
    const saved = localStorage.getItem('htos_mapping_enabled');
    return saved ? JSON.parse(saved) : false;
  });
  
  const [mappingProvider, setMappingProvider] = useState<string | null>(() => {
    const saved = localStorage.getItem('htos_mapping_provider');
    return saved || 'chatgpt';
  });
  // Add to your state
const [stepMetadata, setStepMetadata] = useState<Map<string, {
  type: 'batch' | 'synthesis' | 'mapping',
  providerId: string,
  aiTurnId: string
}>>(new Map());

  // Power user mode state
  const [powerUserMode, setPowerUserMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('htos_power_user_mode');
    return saved ? JSON.parse(saved) : false;
  });
  
  // Convert synthesisProvider to array for power user mode
  const [synthesisProviders, setSynthesisProviders] = useState<string[]>(() => {
    const saved = localStorage.getItem('htos_synthesis_providers');
    return saved ? JSON.parse(saved) : ['gemini'];
  });
  // Controls visibility of hidden source outputs for synthesis-first prompts
  const [showSourceOutputs, setShowSourceOutputs] = useState<boolean>(false);
  const [providerContexts, setProviderContexts] = useState<Record<string, any>>({});
  const [isInitializing, setIsInitializing] = useState(true);
  const [expandedUserTurns, setExpandedUserTurns] = useState<Record<string, boolean>>({});
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const { connState, refresh } = useConnection(api);
  const [connectionStatus, setConnectionStatus] = useState<{ isConnected: boolean; isReconnecting: boolean }>({ isConnected: false, isReconnecting: true });
  
  // UI alert banner state
  const [alertText, setAlertText] = useState<string | null>(null);
  
  // Round-level action bar selections
  const [synthSelectionsByRound, setSynthSelectionsByRound] = useState<Record<string, Record<string, boolean>>>({});
  const [mappingSelectionByRound, setMappingSelectionByRound] = useState<Record<string, string | null>>({});
  // Think toggles
  const [thinkOnChatGPT, setThinkOnChatGPT] = useState<boolean>(false);
  const [thinkSynthByRound, setThinkSynthByRound] = useState<Record<string, boolean>>({});
  const [thinkMappingByRound, setThinkMappingByRound] = useState<Record<string, boolean>>({});
  // Historical Clips: active viewing selection per AiTurn
  const [activeClips, setActiveClips] = useState<Record<string, { synthesis?: string; mapping?: string }>>({});
  // Chat input height for dynamic positioning
  const [chatInputHeight, setChatInputHeight] = useState<number>(80);
  // Show a scroll-to-bottom button when scrolled up beyond last few turns
  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false);
  
  // Composer Mode state
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CHAT);

  // Refs
  const activeAiTurnIdRef = useRef<string | null>(null);
  const scrollSaveTimeoutRef = useRef<number | undefined>(undefined);
  const didLoadTurnsRef = useRef(false);
  const appStartTimeRef = useRef<number>(Date.now());
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const lastScrollTopRef = useRef(0);
  const scrollBottomRef = useRef(true);
  const sessionIdRef = useRef<string | null>(null);
  const isSynthRunningRef = useRef(false);
  const historyOverlayRef = useRef<HTMLDivElement | null>(null);
  const streamingBufferRef = useRef<StreamingBuffer | null>(null);
  // Removed: bufferedAiTurnIdRef — single persistent StreamingBuffer no longer tracks per-turn ownership.
  
  // Valid provider ids for synthesis
  type ValidProvider = 'claude' | 'gemini' | 'chatgpt';
  
  // Update refs when state changes
  useEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // LocalStorage helpers for scroll persistence and last session
  const LS_SCROLL_KEY = 'htos_scroll_positions';
  const LS_LAST_SESSION_KEY = 'htos_last_session_id';

  const getScrollPositionsMap = (): Record<string, number> => {
    try {
      const raw = localStorage.getItem(LS_SCROLL_KEY);
      return raw ? JSON.parse(raw) as Record<string, number> : {};
    } catch {
      return {};
    }
  };
  const saveScrollPositionLS = (sid: string, pos: number) => {
    if (!sid) return;
    const map = getScrollPositionsMap();
    map[sid] = Math.max(0, Math.floor(pos));
    try { localStorage.setItem(LS_SCROLL_KEY, JSON.stringify(map)); } catch {}
  };
  const getScrollPositionLS = (sid: string): number | null => {
    if (!sid) return null;
    const map = getScrollPositionsMap();
    const v = map[sid];
    return typeof v === 'number' ? v : null;
  };
  const setLastActiveSessionLS = (sid: string | null) => {
    try {
      if (sid) localStorage.setItem(LS_LAST_SESSION_KEY, sid);
      else localStorage.removeItem(LS_LAST_SESSION_KEY);
    } catch {}
  };
  const getLastActiveSessionLS = (): string | null => {
    try { return localStorage.getItem(LS_LAST_SESSION_KEY); } catch { return null; }
  };

  // Attach scroll saver to the Virtuoso scroller
  const ScrollerWithSave = React.forwardRef<HTMLDivElement, any>((props, ref) => {
    const onScroll = (e: any) => {
      const st = e?.currentTarget?.scrollTop ?? (e?.target as HTMLElement)?.scrollTop ?? 0;
      if (scrollSaveTimeoutRef.current) window.clearTimeout(scrollSaveTimeoutRef.current);
      scrollSaveTimeoutRef.current = window.setTimeout(() => {
        const sid = sessionIdRef.current;
        if (sid) saveScrollPositionLS(sid, st);
        lastScrollTopRef.current = st;
      }, 200) as any;
    };
    return <div {...props} ref={ref} onScroll={onScroll} />;
  });

  // Persistence effects for mapping and power user mode settings
  useEffect(() => {
    localStorage.setItem('htos_mapping_enabled', JSON.stringify(mappingEnabled));
    if (mappingProvider) {
      localStorage.setItem('htos_mapping_provider', mappingProvider);
    }
  }, [mappingEnabled, mappingProvider]);

  useEffect(() => {
    localStorage.setItem('htos_power_user_mode', JSON.stringify(powerUserMode));
  }, [powerUserMode]);

  useEffect(() => {
    localStorage.setItem('htos_synthesis_providers', JSON.stringify(synthesisProviders));
  }, [synthesisProviders]);

  // Ensure Map (mapping) and Unify (synthesis) use different providers
  useEffect(() => {
    if (mappingEnabled && synthesisProvider && mappingProvider === synthesisProvider) {
      const alternate = LLM_PROVIDERS_CONFIG.find(p => selectedModels[p.id] && p.id !== synthesisProvider)?.id || null;
      if (alternate !== mappingProvider) {
        setMappingProvider(alternate);
        if (alternate) {
          localStorage.setItem('htos_mapping_provider', alternate);
        } else {
          localStorage.removeItem('htos_mapping_provider');
        }
      }
    }
  }, [mappingEnabled, synthesisProvider, mappingProvider, selectedModels]);

  // Removed ambiguous helper getAllProviderResponses to prevent synthesis/mapping from shadowing batch.
  const findRoundForUserTurn = useCallback((userTurnId: string) => {
    const userIndex = messages.findIndex(m => m.id === userTurnId);
    if (userIndex === -1) return null;
    // Find first non-synthesis/non-mapping AI turn after this user (provider outputs of this round)
    let aiIndex = -1;
    for (let i = userIndex + 1; i < messages.length; i++) {
      const t = messages[i];
      if (t.type === 'user') break; // next round begins
      if (t.type === 'ai') {
        const ai = t as AiTurn;
        if (!ai.isSynthesisAnswer && !ai.isMappingAnswer) {
          aiIndex = i;
          break;
        }
      }
    }
    const ai = aiIndex !== -1 ? (messages[aiIndex] as AiTurn) : undefined;
    return { userIndex, user: messages[userIndex] as UserTurn, aiIndex, ai };
  }, [messages]);

  const buildEligibleMapForRound = useCallback((userTurnId: string): {
    synthMap: Record<string, { disabled: boolean; reason?: string }>;
    mappingMap: Record<string, { disabled: boolean; reason?: string }>;
    disableSynthesisRun: boolean;
    disableMappingRun: boolean;
  } => {
    const round = findRoundForUserTurn(userTurnId);
    if (!round) return { synthMap: {}, mappingMap: {}, disableSynthesisRun: true, disableMappingRun: true };

    const { aiIndex, ai } = round;
    const outputs = Object.values(ai?.providerResponses || {}).filter(r => r.status === 'completed' && r.text?.trim());
    const enoughOutputs = outputs.length >= 2;

    // Check existing synthesis and mapping responses in the unified AiTurn
    const alreadySynthPids = ai?.synthesisResponses ? Object.keys(ai.synthesisResponses) : [];
    const alreadyMappingPids = ai?.mappingResponses ? Object.keys(ai.mappingResponses) : [];

    // Determine if there is at least one completed mapping result in this round
    const hasCompletedMapping = (() => {
      if (!ai?.mappingResponses) return false;
      for (const [pid, resp] of Object.entries(ai.mappingResponses as Record<string, any>)) {
        const arr: ProviderResponse[] = Array.isArray(resp) ? (resp as ProviderResponse[]) : [resp as ProviderResponse];
        const last = arr[arr.length - 1];
        if (last && last.status === 'completed' && (last.text?.trim())) return true;
      }
      return false;
    })();

    // Build eligibility map for Synthesis (multi-select)
    const synthMap: Record<string, { disabled: boolean; reason?: string }> = {};
    LLM_PROVIDERS_CONFIG.forEach(p => {
      const alreadySynth = alreadySynthPids.includes(p.id);
      if (!enoughOutputs) {
        synthMap[p.id] = { disabled: true, reason: 'Need ≥ 2 model outputs in this round' };
      } else if (alreadySynth) {
        synthMap[p.id] = { disabled: true, reason: 'Already synthesized for this round' };
      } else {
        synthMap[p.id] = { disabled: false };
      }
    });

    // Build eligibility map for Mapping (single-select)
    const mappingMap: Record<string, { disabled: boolean; reason?: string }> = {};
    LLM_PROVIDERS_CONFIG.forEach(p => {
      const alreadyMappingd = alreadyMappingPids.includes(p.id);
      if (!enoughOutputs) {
        mappingMap[p.id] = { disabled: true, reason: 'Need ≥ 2 model outputs in this round' };
      } else if (alreadyMappingd) {
        mappingMap[p.id] = { disabled: true, reason: 'Already mappingd for this round' };
      } else {
        mappingMap[p.id] = { disabled: false };
      }
    });

    return {
      synthMap,
      mappingMap,
      disableSynthesisRun: !enoughOutputs,
      disableMappingRun: !enoughOutputs,
    };
  }, [findRoundForUserTurn]);

  const eligibilityMaps = useMemo(() => {
    const maps: Record<string, {
      synthMap: Record<string, { disabled: boolean; reason?: string }>;
      mappingMap: Record<string, { disabled: boolean; reason?: string }>;
      disableSynthesisRun: boolean;
      disableMappingRun: boolean;
    }> = {};
    
    messages.forEach(turn => {
      if (isUserTurn(turn)) {
        maps[turn.id] = buildEligibleMapForRound(turn.id);
      }
    });
    
    return maps;
  }, [messages, buildEligibleMapForRound]);
  // ============================================================================
 // Abstract: Connection reducer for state hygiene—handles enums internally, exports boolean for API.
const connectionReducer = (state: { isConnected: boolean; isReconnecting: boolean }, action: { type: 'UPDATE' | 'RECONNECT'; payload?: boolean }) => {
  switch (action.type) {
    case 'UPDATE':
      return { isConnected: action.payload ?? state.isConnected, isReconnecting: !action.payload && state.isReconnecting };
    case 'RECONNECT':
      return { ...state, isReconnecting: true };
    default:
      return state;
  }
};

// Monitor connection health (merge both effects; reducer handles initial/load)
// Monitor connection health (merge effects; no dispatch yet)
useEffect(() => {
  const handleConnectionStateChange = (connected: boolean) => {
  console.log(`[App] Connection: ${connected ? 'up' : 'down'}`);
  setConnectionStatus({ isConnected: !!connected, isReconnecting: !connected });
};


  const unsubscribe = api.onConnectionStateChange(handleConnectionStateChange);
  api.checkHealth(); // Initial ping

  // Initial load (debounced)
  // original location: the initial (debounced) connection-status probe
setTimeout(async () => {
  try {
    // await the API in case it returns a Promise
    const status = await api.getConnectionStatus();
    const ok = !!(status && status.isConnected);
    setConnectionStatus({ isConnected: ok, isReconnecting: !ok });
  } catch (err) {
    // explicit fallback
    console.error('getConnectionStatus failed', err);
    setConnectionStatus({ isConnected: false, isReconnecting: true });
  }
}, 500);


  return unsubscribe;
}, []);

// Periodic checks (simplified; tie to loading)
useEffect(() => {
  if (!isLoading) return;
  const interval = setInterval(api.checkHealth, 10000);
  return () => clearInterval(interval);
}, [isLoading]);

// In component: const [connectionStatus, dispatch] = useReducer(connectionReducer, { isConnected: true, isReconnecting: false });

  // ============================================================================
  // Graceful shutdown handler
  // ============================================================================
  
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        const pos = (virtuosoRef.current as any)?.getState?.()?.scrollTop ?? lastScrollTopRef.current ?? 0;
        if (currentSessionId) {
          saveScrollPositionLS(currentSessionId, pos);
        }
      } catch (e) {
        console.error('Shutdown save failed:', e);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleBeforeUnload();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

    };
  }, []);

  // Removed duplicate connection health effect to prevent conflicting state updates

  // Connection health timers removed; useConnection handles probe + event updates.

  // First turn handling
  const isFirstTurn = !messages.some(m => m.type === 'user');

  const handleToggleUserTurn = useCallback((turnId: string) => {
    setExpandedUserTurns(prev => ({
      ...prev,
      [turnId]: !(prev[turnId] ?? true)
    }));
    // Virtuoso handles dynamic sizing automatically
  }, []);

  // Remove frequent full re-measures; per-row ResizeObserver handles dynamic size
  // A full remeasure still occurs when messages length changes (see below)

  // Utility: Update last AI turn in messages array atomically
  const updateLastAiTurn = useCallback((updater: (aiTurn: AiTurn) => AiTurn) => {
    setMessages((prev: TurnMessage[]) => {
       const lastAiIndex = [...prev].reverse().findIndex(t => t.type === 'ai');
       if (lastAiIndex === -1) return prev;
       
       const actualIndex = prev.length - 1 - lastAiIndex;
       const updated = [...prev];
       const updatedAiTurn = updater(updated[actualIndex] as AiTurn);
       updated[actualIndex] = updatedAiTurn;

      // Explicitly check completion across known containers without merging helpers
      const latestFromArrayMap = (container?: Record<string, ProviderResponse[] | ProviderResponse>): Record<string, ProviderResponse> => {
        const out: Record<string, ProviderResponse> = {};
        if (!container) return out;
        Object.entries(container as Record<string, any>).forEach(([pid, resp]) => {
          if (Array.isArray(resp)) {
            const last = resp[resp.length - 1];
            if (last) out[pid] = last;
          } else if (resp && typeof resp === 'object') {
            out[pid] = resp as ProviderResponse;
          }
        });
        return out;
      };

      const allResponses: Record<string, ProviderResponse> = {
        ...(updatedAiTurn.batchResponses || {}),
        ...latestFromArrayMap(updatedAiTurn.synthesisResponses),
        ...latestFromArrayMap(updatedAiTurn.mappingResponses),
        ...(updatedAiTurn.providerResponses || {}) // legacy
      };
      const allComplete = Object.values(allResponses).every(r => r.status === 'completed' || r.status === 'error');
      
      if (allComplete) {
        setIsLoading(false);
        setUiPhase('awaiting_action');
        const isMapping = updatedAiTurn.isMappingAnswer;
        const isSynthesis = updatedAiTurn.isSynthesisAnswer;
        setCurrentAppStep(isMapping || isSynthesis ? 'synthesisDone' : 'awaitingSynthesis');
        setIsContinuationMode(true);
        activeAiTurnIdRef.current = null;
        
        // Clean up pending user turn if it exists
        if (pendingUserTurns.has(updatedAiTurn.id)) {
          setPendingUserTurns(prevMap => {
            const newMap = new Map(prevMap);
            newMap.delete(updatedAiTurn.id);
            return newMap;
          });
        }
        
        // Proactively refresh history if the panel is open
        if (isHistoryPanelOpen) {
          // History is now managed by backend API
          api.getHistoryList()
            .then((response) => {
              const formattedSessions: HistorySessionSummary[] = response.sessions.map((session: HistorySessionSummary) => ({
                id: session.sessionId,
                sessionId: session.sessionId,
                title: session.title || 'Untitled',
                startTime: session.startTime || Date.now(),
                lastActivity: session.lastActivity || Date.now(),
                messageCount: session.messageCount || 0,
                firstMessage: session.firstMessage || '',
                messages: [],
              }));
              setHistorySessions(formattedSessions);
            })
            .catch(console.error);
        }
      }
      
      return updated;
    });
  }, [pendingUserTurns, isHistoryPanelOpen]);

  // Targeted update by AI turn id (supports mid-list synthesis streaming)
  const updateAiTurnById = useCallback((aiTurnId: string, updater: (aiTurn: AiTurn) => AiTurn) => {
    setMessages((prev: TurnMessage[]) => {
      const idx = prev.findIndex(t => t.id === aiTurnId);
      if (idx === -1) return prev;
      
      const updated = [...prev];
      const updatedAiTurn = updater(updated[idx] as AiTurn);
      updated[idx] = updatedAiTurn;

      // Completion check now looks at all possible response arrays
      const allBatch = Object.values(updatedAiTurn.batchResponses || {});
      const allSynth = Object.values(updatedAiTurn.synthesisResponses || {}).flatMap(arr => Array.isArray(arr) ? arr : [arr]);
      const allMapping = Object.values(updatedAiTurn.mappingResponses || {}).flatMap(arr => Array.isArray(arr) ? arr : [arr]);
      const allResponses = [...allBatch, ...allSynth, ...allMapping];

      const allComplete = allResponses.length > 0 && allResponses.every(r => r.status === 'completed' || r.status === 'error');

      if (allComplete && activeAiTurnIdRef.current === aiTurnId) {
        setIsLoading(false);
        setUiPhase('awaiting_action');
        setIsContinuationMode(true);
        activeAiTurnIdRef.current = null;
      }

      // New: if there are mapping responses, pick the most-recent completed mapping provider and update per-round selection
      try {
        if (updatedAiTurn.mappingResponses) {
          let latestProvider: string | null = null;
          let latestTs = 0;
          Object.entries(updatedAiTurn.mappingResponses as Record<string, ProviderResponse[] | ProviderResponse>).forEach(([pid, resp]) => {
            const arr = Array.isArray(resp) ? (resp as ProviderResponse[]) : [resp as ProviderResponse];
            const last = arr[arr.length - 1];
            if (last && last.status === 'completed' && last.text?.trim()) {
              const ts = (last.updatedAt || last.createdAt || 0) as number;
              if (ts > latestTs) {
                latestTs = ts;
                latestProvider = pid;
              }
            }
          });
          if (latestProvider && (updatedAiTurn.userTurnId)) {
            setMappingSelectionByRound(prev => {
              const cur = prev[updatedAiTurn.userTurnId];
              if (cur === latestProvider) return prev;
              return { ...prev, [updatedAiTurn.userTurnId]: latestProvider };
            });
          }
        }
      } catch (e) { /* best-effort */ }

      return updated;
    });
  }, [setMessages, setIsLoading, setUiPhase, setIsContinuationMode, setMappingSelectionByRound]);

  // Handler for Composer Mode to update AiTurn
  const handleUpdateAiTurnForComposer = useCallback((aiTurnId: string, updates: Partial<AiTurn>) => {
    setMessages((prev: TurnMessage[]) => {
      const idx = prev.findIndex(t => t.type === 'ai' && (t as AiTurn).id === aiTurnId);
      if (idx === -1) return prev;
      
      const updated = [...prev];
      updated[idx] = { ...(updated[idx] as AiTurn), ...updates };
      return updated;
    });
  }, []);

  // Handler to enter Composer Mode
  const handleEnterComposerMode = useCallback(() => {
    setViewMode(ViewMode.COMPOSER);
  }, []);

  // Handler to exit Composer Mode
  const handleExitComposerMode = useCallback(() => {
    setViewMode(ViewMode.CHAT);
  }, []);

  // Helper: Create optimistic AI turn with pending responses
  const createOptimisticAiTurn = useCallback((
    aiTurnId: string,
    userTurn: UserTurn,
    activeProviders: ProviderKey[],
    shouldUseSynthesis: boolean,
    shouldUseMapping: boolean,
    synthesisProvider?: string,
    mappingProvider?: string
  ): AiTurn => {
    if (shouldUseSynthesis || shouldUseMapping) {
      // ✅ Initialize batch responses for the batch step that runs first
      const pendingBatch: Record<string, ProviderResponse> = {};
      activeProviders.forEach(pid => {
        pendingBatch[pid] = {
          providerId: pid,
          text: '',
          status: 'pending',
          createdAt: Date.now()
        };
      });
      
      // Unified AI turn with synthesis and/or mapping
      return {
        type: 'ai',
        id: aiTurnId,
        createdAt: Date.now(),
        sessionId: currentSessionId,
        threadId: 'default-thread',
        userTurnId: userTurn.id,
        meta: shouldUseSynthesis ? { synthForUserTurnId: userTurn.id } : undefined,
        batchResponses: pendingBatch, // ✅ Changed from {}
        synthesisResponses: shouldUseSynthesis ? {
          [synthesisProvider as string]: [{
            providerId: synthesisProvider as ProviderKey,
            text: '',
            status: 'pending',
            createdAt: Date.now()
          }]
        } : {},
        mappingResponses: shouldUseMapping ? {
          [mappingProvider as string]: [{
            providerId: mappingProvider as ProviderKey,
            text: '',
            status: 'pending',
            createdAt: Date.now()
          }]
        } : {}
      };
    } else {
      // Standard batch workflow - create AI turn with pending batch responses
      const pendingBatch: Record<string, ProviderResponse> = {};
      activeProviders.forEach(pid => {
        pendingBatch[pid] = {
          providerId: pid,
          text: '',
          status: 'pending',
          createdAt: Date.now()
        };
      });
      return {
        type: 'ai',
        id: aiTurnId,
        createdAt: Date.now(),
        sessionId: currentSessionId,
        threadId: 'default-thread',
        userTurnId: userTurn.id,
        batchResponses: pendingBatch,
        synthesisResponses: {},
        mappingResponses: {}
      };
    }
  }, [currentSessionId]);

  // ===== Round helpers: locate round, existing synth/mapping blocks, and insertion point =====
  // Helper to find the first insertion index before an AI turn
  const findFirstInsertIndexBeforeAi = useCallback((userTurnId: string) => {
    const round = findRoundForUserTurn(userTurnId);
    if (!round) return -1;
    const { userIndex, aiIndex } = round;
    // We want to insert after any existing synthesis/mapping blocks for this round, but before main AI outputs
    let insertAt = userIndex + 1;
    for (let i = userIndex + 1; i < messages.length; i++) {
      const t = messages[i];
      if (t.type === 'user') break;
      if (t.type === 'ai') {
        const ai = t as AiTurn;
        if ((ai.isSynthesisAnswer || ai.isMappingAnswer) && (ai.meta as any)?.synthForUserTurnId === userTurnId) {
          insertAt = i + 1; // insert after the last synthesis/mapping block of this round
          continue;
        }
        // First non-synth/mapping AI encountered: we must insert before it
        break;
      }
    }
    // If there is a provider AI index and our insertAt is after it (edge), clamp to aiIndex
    if (aiIndex !== -1 && insertAt > aiIndex) return aiIndex;
    return insertAt;
  }, [messages, findRoundForUserTurn]);


  const providerHasActivityAfter = useCallback((providerId: string, roundAiIndex: number): boolean => {
    if (roundAiIndex === -1) return false;
    for (let i = roundAiIndex + 1; i < messages.length; i++) {
      const t = messages[i];
      if (t.type !== 'ai') continue;
      const ai = t as AiTurn;
      if (ai.providerResponses && ai.providerResponses[providerId]) return true;
    }
    return false;
  }, [messages]);

  
  // ===== Mapping and synthesis provider handlers =====
  const handleToggleMapping = useCallback((enabled: boolean) => {
    setMappingEnabled(enabled);
    // Immediate persistence to prevent stale state
    localStorage.setItem('htos_mapping_enabled', JSON.stringify(enabled));
    // If mapping is turned off, nullify synthesis selections
    if (!enabled) {
      setSynthesisProvider(null);
      try { localStorage.removeItem('htos_synthesis_provider'); } catch (_) {}
      setSynthesisProviders([]);
      try { localStorage.removeItem('htos_synthesis_providers'); } catch (_) {}
    }
  }, []);

  const handleSetMappingProvider = useCallback((providerId: string | null) => {
    setMappingProvider(providerId);
    // If the chosen Map provider matches Unify provider, auto-pick an alternate for Unify
    if (providerId && synthesisProvider === providerId) {
      const alternate = LLM_PROVIDERS_CONFIG.find(p => selectedModels[p.id] && p.id !== providerId)?.id || null;
      setSynthesisProvider(alternate);
      if (alternate) {
        localStorage.setItem('htos_synthesis_provider', alternate);
      } else {
        localStorage.removeItem('htos_synthesis_provider');
      }
    }
    // If mapping provider is cleared, also clear synthesis selections
    if (!providerId) {
      setSynthesisProvider(null);
      try { localStorage.removeItem('htos_synthesis_provider'); } catch (_) {}
      setSynthesisProviders([]);
      try { localStorage.removeItem('htos_synthesis_providers'); } catch (_) {}
    }
    // Immediate persistence to prevent stale state
    if (providerId) {
      localStorage.setItem('htos_mapping_provider', providerId);
    } else {
      localStorage.removeItem('htos_mapping_provider');
    }
  }, [synthesisProvider, selectedModels]);

  const handleToggleSynthesisProvider = useCallback((providerId: string) => {
    setSynthesisProviders(prev => {
      const newProviders = prev.includes(providerId) 
        ? prev.filter(id => id !== providerId)
        : [...prev, providerId];
      
      // Immediate persistence to prevent stale state
      localStorage.setItem('htos_synthesis_providers', JSON.stringify(newProviders));
      return newProviders;
    });
  }, []);

  // ===== Round bar handlers =====
  const handleToggleSynthForRound = useCallback((userTurnId: string, providerId: string) => {
    setSynthSelectionsByRound(prev => {
      const current = prev[userTurnId] || {};
      return { ...prev, [userTurnId]: { ...current, [providerId]: !current[providerId] } };
    });
  }, []);

  const handleSelectMappingForRound = useCallback((userTurnId: string, providerId: string) => {
    setMappingSelectionByRound(prev => {
      const current = prev[userTurnId] || null;
      return { ...prev, [userTurnId]: current === providerId ? null : providerId };
    });
  }, []);

  const handleRunSynthesisForRound = useCallback(async (userTurnId: string, providerIdOverride?: string) => {
    if (!currentSessionId || isSynthRunningRef.current) return;

    const roundInfo = findRoundForUserTurn(userTurnId);
    if (!roundInfo || !roundInfo.user || !roundInfo.ai) return;

    const { ai } = roundInfo;

    const results: Record<string, string> = {};
    Object.entries(ai.batchResponses || {}).forEach(([pid, resp]) => {
      const r = resp as ProviderResponse;
      if (r.status === 'completed' && r.text?.trim()) results[pid] = r.text!;
    });
    if (Object.keys(results).length < 2) return;

    const selected = providerIdOverride
      ? [providerIdOverride]
      : Object.entries(synthSelectionsByRound[userTurnId] || {})
          .filter(([_, on]) => on)
          .map(([pid]) => pid);
    if (selected.length === 0) return;

    // If this is a historical re-run (providerIdOverride), we MUST use the existing mapping result for that round.
    // Do NOT request a new mapping step in the ExecuteWorkflowRequest; the backend should use the historical mapping.
    // If there is no mapping present, UI should have prevented this call (see handleClipClick gating).
    const isHistoricalRerun = !!providerIdOverride;

    const clipPreferredMapping = activeClips[ai.id]?.mapping || null;
    const perRoundMapping = mappingSelectionByRound[userTurnId] || null;
    const preferredMappingCandidate = clipPreferredMapping || perRoundMapping;
    const preferredMappingProvider = preferredMappingCandidate && LLM_PROVIDERS_CONFIG.some(p => p.id === preferredMappingCandidate)
      ? preferredMappingCandidate as ProviderKey
      : null;

    updateAiTurnById(ai.id, (prevAiTurn) => {
      const prev = prevAiTurn.synthesisResponses || {};
      const next: Record<string, ProviderResponse[]> = { ...prev };
      selected.forEach((pid) => {
        const arr = Array.isArray(next[pid]) ? next[pid]! : [];
        arr.push({ providerId: pid, text: '', status: 'pending', createdAt: Date.now() });
        next[pid] = arr;
      });
      return { ...prevAiTurn, synthesisResponses: next };
    });

    activeAiTurnIdRef.current = ai.id;
    setIsLoading(true);
    setUiPhase('streaming');
    setCurrentAppStep('synthesis');
    isSynthRunningRef.current = true;

    try {
      // For historical reruns, do not attach mapping to the request (we rely on persisted mapping)
      const fallbackMapping = (() => {
        try {
          return localStorage.getItem("htos_mapping_provider");
        } catch {
          return null;
        }
      })();
      const effectiveMappingProvider =
        perRoundMapping || mappingProvider || fallbackMapping || null;

      const historicalContext: ExecuteWorkflowRequest['historicalContext'] = {
        userTurnId,
        sourceType: 'batch'
      };
      if (isHistoricalRerun && preferredMappingProvider) {
        historicalContext.preferredMappingProvider = preferredMappingProvider;
      }

      const request: ExecuteWorkflowRequest = {
        sessionId: currentSessionId,
        threadId: 'default-thread',
        mode: 'continuation',
        userMessage: roundInfo.user.text || '',
        providers: [], // no batch providers - synthesis only
        synthesis: {
          enabled: true,
          providers: selected as ProviderKey[],
        },
        // Only request mapping in the request when NOT a historical re-run (i.e., outgoing prompt/explicit run)
        mapping:
          !isHistoricalRerun && mappingEnabled && effectiveMappingProvider
            ? {
                enabled: true,
                providers: [effectiveMappingProvider as ProviderKey],
              }
            : undefined,
        useThinking: !!thinkSynthByRound[userTurnId],
        historicalContext
      };

      if (selected.length === 1) {
        setLastSynthesisModel(selected[0]);
        localStorage.setItem('htos_last_synthesis_model', selected[0]);
      }
      await api.executeWorkflow(request);
    } catch (err) {
      console.error("Synthesis run failed:", err);
      setIsLoading(false);
      setUiPhase("awaiting_action");
      activeAiTurnIdRef.current = null;
    } finally {
      isSynthRunningRef.current = false;
    }
  }, [currentSessionId, synthSelectionsByRound, uiTabId, findRoundForUserTurn, thinkSynthByRound, updateAiTurnById, mappingSelectionByRound, mappingProvider, mappingEnabled, activeClips]);

  // Build the mapping prompt using provided fixed template from spec
  

  const handleRunMappingForRound = useCallback(async (userTurnId: string, providerIdOverride?: string) => {
    if (!currentSessionId) return;

    const roundInfo = findRoundForUserTurn(userTurnId);
    if (!roundInfo?.user || !roundInfo.ai) return;

    const { user: roundUser, ai: roundAi } = roundInfo;
    const modelOutputs: Record<string, string> = {};
    Object.entries(roundAi.batchResponses || {}).forEach(([pid, resp]) => {
      const r = resp as ProviderResponse;
      if (r.status === 'completed' && r.text?.trim()) modelOutputs[pid] = r.text!;
    });
    if (Object.keys(modelOutputs).length < 2) return;

    const effectiveMappingProvider = providerIdOverride || mappingSelectionByRound[userTurnId];
    if (!effectiveMappingProvider) return;

    setMappingSelectionByRound(prev => {
      if (prev[userTurnId] === effectiveMappingProvider) return prev;
      return { ...prev, [userTurnId]: effectiveMappingProvider };
    });

    setIsLoading(true);
    setUiPhase('streaming');
    setCurrentAppStep('synthesis');

    updateAiTurnById(roundAi.id, (prevAiTurn: AiTurn) => {
      const prev = prevAiTurn.mappingResponses || {};
      const next: Record<string, ProviderResponse[]> = { ...prev };
      const arr = Array.isArray(next[effectiveMappingProvider])
        ? [...(next[effectiveMappingProvider] as ProviderResponse[])]
        : [];
      arr.push({
        providerId: effectiveMappingProvider as ProviderKey,
        text: '',
        status: 'pending',
        createdAt: Date.now(),
      });
      next[effectiveMappingProvider] = arr;
      return { ...prevAiTurn, mappingResponses: next };
    });

    activeAiTurnIdRef.current = roundAi.id;

    try {
      const request: ExecuteWorkflowRequest = {
        sessionId: currentSessionId,
        threadId: 'default-thread',
        mode: 'continuation',
        userMessage: roundUser.text || '',
        providers: [],
        mapping: {
          enabled: true,
          providers: [effectiveMappingProvider as ProviderKey],
        },
        useThinking: effectiveMappingProvider === 'chatgpt' ? !!thinkMappingByRound[userTurnId] : false,
        historicalContext: {
          userTurnId,
          sourceType: 'batch',
        },
      };

      await api.executeWorkflow(request);
    } catch (err) {
      console.error('Mapping run failed:', err);
      setIsLoading(false);
      setUiPhase('awaiting_action');
      activeAiTurnIdRef.current = null;
    }
  }, [api, currentSessionId, findRoundForUserTurn, mappingSelectionByRound, thinkMappingByRound, updateAiTurnById]);

  const handleClipClick = useCallback((aiTurnId: string, type: 'synthesis' | 'mapping', providerId: string) => {
    const aiTurn = messages.find(m => m.id === aiTurnId && m.type === 'ai') as AiTurn | undefined;
    if (!aiTurn) return;

    const responsesMap = type === 'synthesis' ? (aiTurn.synthesisResponses || {}) : (aiTurn.mappingResponses || {});
    const hasExisting = Array.isArray(responsesMap[providerId])
      ? (responsesMap[providerId] as ProviderResponse[]).length > 0
      : !!responsesMap[providerId];

    setActiveClips(prev => ({
      ...prev,
      [aiTurnId]: {
        ...(prev[aiTurnId] || {}),
        [type]: providerId,
      },
    }));

    const userTurnId = aiTurn.userTurnId;
    if (type === 'mapping' && userTurnId) {
      setMappingSelectionByRound(prev => {
        if (prev[userTurnId] === providerId) return prev;
        return { ...prev, [userTurnId]: providerId };
      });
    }

    if (hasExisting) {
      return;
    }

    if (type === 'synthesis') {
      const mappingResponses = aiTurn.mappingResponses || {};
      const hasCompletedMapping = Object.values(mappingResponses).some((value) => {
        const arr = Array.isArray(value) ? value : [value];
        const last = arr[arr.length - 1];
        return !!(last && last.status === 'completed' && last.text?.trim());
      });

      if (!hasCompletedMapping) {
        setAlertText('No mapping result exists for this round. Run mapping first before synthesizing.');
        return;
      }
    }

    if (!userTurnId) return;

    if (type === 'synthesis') {
      void handleRunSynthesisForRound(userTurnId, providerId);
    } else {
      void handleRunMappingForRound(userTurnId, providerId);
    }
  }, [messages, handleRunSynthesisForRound, handleRunMappingForRound]);







  // Removed manual scroll stick; Virtuoso followOutput manages auto-scroll.

  // Removed: getOrInitStreamingBuffer — buffer initialized once in port handler per clearup logic.

  // Removed manual scroll effect; Virtuoso followOutput handles scroll.

  // Virtuoso handles size computation automatically, no manual intervention needed

  // Bootstrap from persistence on startup
  useEffect(() => {
    if (didLoadTurnsRef.current) return;
    didLoadTurnsRef.current = true;

    const bootstrapFromPersistence = async () => {
      setIsInitializing(true);
      try {
        // Legacy UI persistence cleanup removed.
        const defaultModels: Record<string, boolean> = LLM_PROVIDERS_CONFIG.reduce<Record<string, boolean>>((acc, provider) => {
          acc[provider.id] = ['claude', 'gemini', 'chatgpt'].includes(provider.id);
          return acc;
        }, {} as Record<string, boolean>);
        
        setShowWelcome(true);
        setCurrentAppStep('initial');
        setCurrentSessionId(null);
        setMessages([]);
        setIsHistoryPanelOpen(false);
        setSelectedModels(defaultModels);
      } catch (error) {
        console.error('Failed to bootstrap from persistence:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    bootstrapFromPersistence();
  }, []);

  // Extension API initialization
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      api.setExtensionId(chrome.runtime.id);
      chrome.tabs.getCurrent((tab) => {
        if (tab?.id) {
          setUiTabId(tab.id);
        }
      });
    }
  }, []);

  const getStepType = (stepId: string): 'batch' | 'synthesis' | 'mapping' | null => {
    if (stepId.startsWith('batch-')) return 'batch';
    if (stepId.startsWith('synthesis-')) return 'synthesis';
    if (stepId.startsWith('mapping-')) return 'mapping';
    return null;
  };

 // ============================================================================
  // NEW: Unified Port Message Handler
  // This replaces the entire old `createPortMessageHandler`.
  // ============================================================================
  const createPortMessageHandler = useCallback(() => {
    // Initialize a single persistent StreamingBuffer bound to the active AI turn
    if (!streamingBufferRef.current) {
      // StreamingBuffer now provides batched updates: Array<{providerId,text,status,responseType}>
      streamingBufferRef.current = new StreamingBuffer((updates) => {
        const activeId = activeAiTurnIdRef.current;
        if (!activeId || !updates || updates.length === 0) return;

        // Apply all updates in one updater to avoid multiple re-renders and ensure correct types
        updateAiTurnById(activeId, (turn: AiTurn) => {
          const batchMap: Record<string, ProviderResponse> = { ...(turn.batchResponses || {}) };

          // Normalize synthesisResponses to arrays (AiTurn expects ProviderResponse[])
          const synthMap: Record<string, ProviderResponse[]> = {};
          Object.entries(turn.synthesisResponses || {}).forEach(([pid, val]) => {
            synthMap[pid] = Array.isArray(val) ? (val as ProviderResponse[]).slice() : [val as ProviderResponse];
          });

          // Normalize mappingResponses to arrays
          const mappingMap: Record<string, ProviderResponse[]> = {};
          Object.entries(turn.mappingResponses || {}).forEach(([pid, val]) => {
            mappingMap[pid] = Array.isArray(val) ? (val as ProviderResponse[]).slice() : [val as ProviderResponse];
          });

          updates.forEach((u) => {
            const { providerId, text: delta, status, responseType } = u;
            const statusCast = status as ProviderResponseStatus;

            if (responseType === 'batch') {
              const existing = batchMap[providerId] || { providerId, text: '', status: 'pending', createdAt: Date.now() } as ProviderResponse;
              batchMap[providerId] = { ...existing, text: (existing.text || '') + delta, status: statusCast, updatedAt: Date.now(), meta: { ...(existing.meta || {}) } };
            } else if (responseType === 'synthesis') {
              const arr = synthMap[providerId] || [];
              if (arr.length > 0) {
                arr[0] = { ...arr[0], text: (arr[0].text || '') + delta, status: statusCast, updatedAt: Date.now() };
              } else {
                arr.push({ providerId: providerId as ProviderKey, text: delta, status: statusCast, createdAt: Date.now() } as ProviderResponse);
              }
              synthMap[providerId] = arr;
            } else if (responseType === 'mapping') {
              const arr = mappingMap[providerId] || [];
              if (arr.length > 0) {
                arr[0] = { ...arr[0], text: (arr[0].text || '') + delta, status: statusCast, updatedAt: Date.now() };
              } else {
                arr.push({ providerId: providerId as ProviderKey, text: delta, status: statusCast, createdAt: Date.now() } as ProviderResponse);
              }
              mappingMap[providerId] = arr;
            }
          });

          return {
            ...turn,
            batchResponses: batchMap,
            synthesisResponses: synthMap,
            mappingResponses: mappingMap
          } as AiTurn;
        });
      });
    }
 // ...existing code...

    return (message: any) => {
      if (!message || !message.type) return;
      
      console.log('[UI] RAW PORT MESSAGE:', message.type, message);

      switch (message.type) {
        case 'SESSION_STARTED': {
          // Backend created a session id for a request that started without one.
          // Only backfill where the UI placed optimistic turns without session ids.
          const newSessionId = message.sessionId;
          setCurrentSessionId(newSessionId);
          setMessages((prev: TurnMessage[]) => prev.map((m: TurnMessage) => ({ ...m, sessionId: m.sessionId || newSessionId })));
          setPendingUserTurns((prevMap: Map<string, UserTurn>) => {
            const newMap = new Map(prevMap);
            newMap.forEach((userTurn: UserTurn | any, aiId: string) => {
              if (!userTurn.sessionId) newMap.set(aiId, { ...userTurn, sessionId: newSessionId } as UserTurn);
            });
            return newMap;
          });
          // Inform the extension layer about the active session id
          try { api.setSessionId(newSessionId); } catch (e) { /* best-effort */ }
           break;
         }

         case 'PARTIAL_RESULT': {
          const { stepId, providerId, chunk, sessionId: msgSessionId } = message;
          if (!providerId || !chunk?.text) return;

          // Ignore messages from other sessions to prevent cross-chat attachment
          if (msgSessionId && currentSessionId && msgSessionId !== currentSessionId) {
            try { console.warn(`[Port Handler] Ignoring PARTIAL_RESULT from session ${msgSessionId} (active ${currentSessionId})`); } catch (e) {}
            return;
          }

          // ✅ Detect step type from stepId pattern
          const stepType = getStepType(stepId);

          if (!stepType) {
            console.warn(`[Port] Unknown stepId pattern: ${stepId}`);
            return;
          }

           streamingBufferRef.current?.addDelta(providerId, chunk.text, 'streaming', stepType);

           if (chunk.meta) {
             setProviderContexts((prev: Record<string, any>) => ({ ...prev, [providerId]: { ...(prev[providerId] || {}), ...chunk.meta } }));
           }
           break;
         }

         case 'WORKFLOW_STEP_UPDATE': {
           const { stepId, status, result, error, sessionId: msgSessionId } = message;
           // Ignore messages from other sessions to prevent cross-chat attachment
           if (msgSessionId && currentSessionId && msgSessionId !== currentSessionId) {
             try { console.warn(`[Port Handler] Ignoring WORKFLOW_STEP_UPDATE from session ${msgSessionId} (active ${currentSessionId})`); } catch (e) {}
             break;
           }

           if (status === 'completed' && result) {
             // Ensure buffered streaming deltas are applied before marking complete
             streamingBufferRef.current?.flushImmediate();
             // A step can complete with a single result or a map of results for each provider
             const resultsMap = result.results || (result.providerId ? { [result.providerId]: result } : {});
             
             Object.entries(resultsMap).forEach(([providerId, data]: [string, any]) => {
                 // Use includes() to match flexible stepId naming (e.g. 'mapping-chatgpt-...')
                 let responseType: 'batch' | 'synthesis' | 'mapping' | 'unknown' = 'unknown';
                 if (typeof stepId === 'string') {
                   if (stepId.includes('synthesis')) responseType = 'synthesis';
                   else if (stepId.includes('mapping')) responseType = 'mapping';
                   else if (stepId.includes('batch') || stepId.includes('prompt')) responseType = 'batch';
                 }

                 if (responseType === 'unknown') {
                   try { console.warn(`[Port Handler] Unknown stepId routing for completion: ${String(stepId)} (${providerId})`); } catch (e) {}
                   return; // Avoid misrouting to batch by default
                 }

                 // Debug: show completion routing for provider results
                 try { console.log(`[Port Handler] Completing ${responseType} for ${providerId}: ${String(data.text || '').substring(0,50)}`); } catch (e) {}
                 
                 const activeId = activeAiTurnIdRef.current;
                 if (!activeId) return;
                 updateAiTurnById(activeId, (aiTurn: AiTurn) => {
                   if (responseType === 'synthesis') {
                     const map = { ...(aiTurn.synthesisResponses || {}) };
                     const takes = map[providerId] || [];
                     const last = takes[takes.length - 1];
                     const base = last || { providerId, text: '', status: 'pending', createdAt: Date.now() } as ProviderResponse;
                     const updated = { ...base, text: (data.text || base.text || ''), status: 'completed' as const, updatedAt: Date.now() };
                     map[providerId] = [...takes.slice(0, -1), updated];
                     return { ...aiTurn, synthesisResponses: map };
                   } else if (responseType === 'mapping') {
                     const map = { ...(aiTurn.mappingResponses || {}) };
                     const takes = map[providerId] || [];
                     const last = takes[takes.length - 1];
                     const base = last || { providerId, text: '', status: 'pending', createdAt: Date.now() } as ProviderResponse;
                     const updated = { ...base, text: (data.text || base.text || ''), status: 'completed' as const, updatedAt: Date.now() };
                     map[providerId] = [...takes.slice(0, -1), updated];
                     return { ...aiTurn, mappingResponses: map };
                   } else {
                     const map = { ...(aiTurn.batchResponses || {}) };
                     const existing = map[providerId] || { providerId, text: '', status: 'pending', createdAt: Date.now() } as ProviderResponse;
                     const incomingStatus = (data && (data.status || (data.ok === false ? 'failed' : 'completed'))) || 'completed';
                     const finalStatus = incomingStatus === 'failed' ? 'error' : 'completed';
                     const errorText = (() => {
                       if (incomingStatus !== 'failed') return '';
                       const code = data && (data.softError || data.errorCode);
                       switch (code) {
                         case 'too-many-requests': return 'Rate limit reached. Please wait and retry.';
                         case 'claude-free-limit-exceeded': return 'Claude free tier limit exceeded.';
                         case 'claude-bad-model': return 'Claude: selected model is not available.';
                         case 'claude-login': return 'Claude login required.';
                         default: {
                           const raw = data && data.meta && (data.meta._rawError || data.meta.error);
                           return raw ? String(raw) : 'Provider error.';
                         }
                       }
                     })();
                     const finalText = finalStatus === 'error'
                       ? (errorText || existing.text || '')
                       : (data.text || existing.text || '');
                     map[providerId] = { ...existing, text: finalText, status: finalStatus, updatedAt: Date.now(), meta: { ...(existing.meta || {}), ...(data.meta || {}) } };
                     return { ...aiTurn, batchResponses: map };
                   }
                 });
             });

            // Note: provider context handling is performed by the backend. UI
            // retains only streaming meta updates from PARTIAL_RESULT above.
           } else if (status === 'failed') {
             console.error(`[Port Handler] Step failed: ${stepId}`, error);
             // Future: Mark step as failed in UI
           }
           break;
         }

         case 'WORKFLOW_COMPLETE': {
           const { sessionId: msgSessionId } = message;
           // Ignore completion from other sessions
           if (msgSessionId && currentSessionId && msgSessionId !== currentSessionId) {
             try { console.warn(`[Port Handler] Ignoring WORKFLOW_COMPLETE from session ${msgSessionId} (active ${currentSessionId})`); } catch (e) {}
             break;
           }
           // Save current active AI turn id before we clear it
           const completedTurnId = activeAiTurnIdRef.current;

           // Finalize streaming buffer and clear active turn reference
           streamingBufferRef.current?.flushImmediate();

           setIsLoading(false);
           setUiPhase('awaiting_action');
           setIsContinuationMode(true);

           // Clear the active turn reference
           activeAiTurnIdRef.current = null;

           if (completedTurnId) {
             setPendingUserTurns((prev: Map<string, UserTurn>) => {
               const newMap = new Map(prev);
               newMap.delete(completedTurnId);
               return newMap;
             });
           }

           // Workflow finished — backend owns any continuation context.
           break;
         }
       }
     };
   }, [updateAiTurnById]); // Effect to manage port connection
  useEffect(() => {
    const handler = createPortMessageHandler();
    api.setPortMessageHandler(handler);
    return () => api.setPortMessageHandler(null);
  }, [createPortMessageHandler]);

  // History panel loading from backend
  useEffect(() => {
    if (!isHistoryPanelOpen) return;
    setIsHistoryLoading(true);

    const load = async () => {
      try {
        const response = await api.getHistoryList();
        // Ensure we have a valid response with sessions array
        const sessions = response?.sessions || [];
        
        const formattedSessions: HistorySessionSummary[] = sessions.map(session => ({
          id: session.sessionId,
          sessionId: session.sessionId,
          title: session.title || 'Untitled',
          startTime: session.startTime || Date.now(),
          lastActivity: session.lastActivity || Date.now(),
          messageCount: session.messageCount || 0,
          firstMessage: session.firstMessage || '',
          messages: [],
        }));
        
        setHistorySessions(formattedSessions);
      } catch (error) {
        console.error('Failed to load history:', error);
      } finally {
        setIsHistoryLoading(false);
      }
    };
    load();
    return () => {};
  }, [isHistoryPanelOpen]);

  // Legacy scroll persistence effect removed; handled by startup shutdown effect above.



  // Accessible focus trap for History overlay (Esc to close; tab loop contained)
  useEffect(() => {
    if (!isHistoryPanelOpen) return;
    const root = historyOverlayRef.current;
    if (!root) return;

    const selectors = 'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const getFocusables = (): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(selectors) as NodeListOf<HTMLElement>).filter((el: HTMLElement) => !el.hasAttribute('disabled'));
    let focusables = getFocusables();
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    const prevFocused = (document.activeElement as HTMLElement) || null;
    // Focus the first focusable element (e.g., New Chat button)
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsHistoryPanelOpen(false);
        return;
      }
      if (e.key === 'Tab') {
        focusables = getFocusables();
        const currentFirst = focusables[0];
        const currentLast = focusables[focusables.length - 1];
        if (focusables.length === 0) return;
        if (e.shiftKey) {
          if (document.activeElement === currentFirst) {
            e.preventDefault();
            currentLast?.focus();
          }
        } else {
          if (document.activeElement === currentLast) {
            e.preventDefault();
            currentFirst?.focus();
          }
        }
      }
    };

    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
      prevFocused?.focus?.();
    };
  }, [isHistoryPanelOpen]);

  

  const handleSendPrompt = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return;

    // Mark that user has used the app (no longer first load)
    if (isFirstLoad) {
      setIsFirstLoad(false);
      localStorage.setItem('htos_has_used', 'true');
    }

    // New workflow — clear any previous in-flight contexts.
    setIsLoading(true);
    setUiPhase('streaming');
    if (showWelcome) setShowWelcome(false);
    setCurrentAppStep('initial');
    setModelsTouched(true);

    const activeProviders = LLM_PROVIDERS_CONFIG
      .filter(p => selectedModels[p.id])
      .map(p => p.id as ProviderKey);
    if (activeProviders.length === 0) {
      setIsLoading(false);
      return;
    }

    // 1. Create and persist UserTurn
    const userTurn: UserTurn = { 
      type: 'user', 
      id: `user-${Date.now()}`, 
      text: prompt, 
      createdAt: Date.now(), 
      sessionId: currentSessionId 
    };
    const aiTurnId = `ai-${Date.now()}`;
    setPendingUserTurns((prev: Map<string, UserTurn>) => new Map(prev).set(aiTurnId, userTurn));
    setMessages((prev: TurnMessage[]) => [...prev, userTurn]);
    
    // 2. Build workflow using declarative ExecuteWorkflowRequest
    try {
      const shouldUseSynthesis = !!(synthesisProvider && activeProviders.length > 1);
      
      // Calculate mapping settings. Use latest mapping provider, falling back to localStorage if necessary
      const fallbackMapping = (() => { try { return localStorage.getItem('htos_mapping_provider'); } catch { return null; } })();
      const effectiveMappingProvider = mappingProvider || fallbackMapping || null;
      const shouldUseMapping = !!(mappingEnabled && effectiveMappingProvider && activeProviders.length > 1 && activeProviders.includes(effectiveMappingProvider as ProviderKey));

      // Determine mode: only new-conversation when no session or first message
      const mode: 'new-conversation' | 'continuation' = (!currentSessionId || messages.length === 0) ? 'new-conversation' : 'continuation';

      // Unified request for a new message (matches shared/contract.ts)
      const request: ExecuteWorkflowRequest = {
        // For new-conversation we send null so the backend creates the session id and not rely on the placeholder string
        // Cast to any to allow null to flow; backend/engine will handle creating the id.
        sessionId: (mode === 'new-conversation' ? null : currentSessionId) as any,
        threadId: 'default-thread',
        mode,
        userMessage: prompt,
        providers: activeProviders,
        synthesis: shouldUseSynthesis ? {
          enabled: true,
          providers: [synthesisProvider as ProviderKey]
        } : undefined,
        mapping: shouldUseMapping ? {
          enabled: true,
          providers: [effectiveMappingProvider as ProviderKey]
        } : undefined,
        useThinking: computeThinkFlag({ modeThinkButtonOn: thinkOnChatGPT, input: prompt })
       };

      // Create optimistic AI turn using helper function
      const aiTurn = createOptimisticAiTurn(
        aiTurnId,
        userTurn,
        activeProviders,
        shouldUseSynthesis,
        shouldUseMapping,
        synthesisProvider || undefined,
        effectiveMappingProvider || undefined
      );
      setMessages((prev: TurnMessage[]) => [...prev, aiTurn]);

      activeAiTurnIdRef.current = aiTurnId;
      streamingBufferRef.current?.clear();
      await api.executeWorkflow(request);

    } catch (error) {
        console.error('Failed to execute workflow:', error);
        setIsLoading(false);
        activeAiTurnIdRef.current = null;
        setPendingUserTurns((prev: Map<string, UserTurn>) => {
          const newMap = new Map(prev);
          newMap.delete(aiTurnId);
          return newMap;
        });
    }
  }, [selectedModels, showWelcome, currentSessionId, uiTabId, thinkOnChatGPT, synthesisProvider, mappingEnabled, mappingProvider]);

  const handleContinuation = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || !currentSessionId) return;
    
    // New continuation workflow — clear any prior in-flight contexts.
    setIsLoading(true);
    setUiPhase('streaming');
    setCurrentAppStep('initial');

    const activeProviders = LLM_PROVIDERS_CONFIG
      .filter(p => selectedModels[p.id])
      .map(p => p.id as ProviderKey);
    if (activeProviders.length === 0) return;

    const userTurn: UserTurn = { 
      type: 'user', 
      id: `user-${Date.now()}`, 
      text: trimmed, 
      createdAt: Date.now(), 
      sessionId: currentSessionId 
    };
    const aiTurnId = `ai-${Date.now()}`;
    setPendingUserTurns((prev: Map<string, UserTurn>) => new Map(prev).set(aiTurnId, userTurn));
    setMessages((prev: TurnMessage[]) => [...prev, userTurn]);
    
    try {
        // Determine synthesis/mapping settings for continuation, same as initial send
        // Synthesis should NOT depend on mapping flags; mapping is optional.
        const shouldUseSynthesis = !!(
          synthesisProvider &&
          activeProviders.length > 1
        );

        const fallbackMapping = (() => { try { return localStorage.getItem('htos_mapping_provider'); } catch { return null; } })();
        const effectiveMappingProvider = mappingProvider || fallbackMapping || null;

        const shouldUseMapping = !!(
          mappingEnabled &&
          effectiveMappingProvider &&
          activeProviders.length > 1 &&
          activeProviders.includes(effectiveMappingProvider as ProviderKey)
        );

        // Debug: log gating and provider selections for continuation
        try {
          console.log('[UI] Continuation config', {
            activeProviders,
            synthesisProvider,
            mappingEnabled,
            mappingProvider: effectiveMappingProvider,
            shouldUseSynthesis,
            shouldUseMapping,
            promptPreview: trimmed.substring(0, 120)
          });
        } catch (_) {}

        // Unified request for continuation
        const request: ExecuteWorkflowRequest = {
          sessionId: currentSessionId,
          threadId: 'default-thread',
          mode: 'continuation',
          userMessage: trimmed,
          providers: activeProviders,
          synthesis: shouldUseSynthesis ? {
            enabled: true,
            providers: [synthesisProvider as ProviderKey]
          } : undefined,
        mapping: shouldUseMapping ? {
            enabled: true,
            providers: [effectiveMappingProvider as ProviderKey]
          } : undefined,
          useThinking: computeThinkFlag({ modeThinkButtonOn: thinkOnChatGPT, input: trimmed })
        };

        // Create optimistic AI turn using helper function
        const aiTurn = createOptimisticAiTurn(
          aiTurnId,
          userTurn,
          activeProviders,
          shouldUseSynthesis,
          shouldUseMapping,
          synthesisProvider || undefined,
          effectiveMappingProvider || undefined
        );
        setMessages((prev: TurnMessage[]) => [...prev, aiTurn]);

        activeAiTurnIdRef.current = aiTurnId;
        streamingBufferRef.current?.clear();
        await api.executeWorkflow(request);

    } catch (error) {
        console.error('Continuation workflow failed:', error);
        setIsLoading(false);
        activeAiTurnIdRef.current = null;
        setPendingUserTurns((prev: Map<string, UserTurn>) => {
          const newMap = new Map(prev);
          newMap.delete(aiTurnId);
          return newMap;
        });
    }
  }, [currentSessionId, selectedModels, providerContexts, uiTabId, thinkOnChatGPT, synthesisProvider, mappingEnabled, mappingProvider]);

  const handleSynthesize = useCallback(async (providerId: string) => {
    // Legacy global synth no longer used; round-level bar handles synthesis
    return;
  }, [currentSessionId, messages, uiTabId]);

  // =========================================
  // Simplified Mapping: Single-Turn Action
  // =========================================

  // Deprecated global mapping (replaced by per-round run)
  const handleMappingTurn = useCallback(async () => { return; }, []);

  const getSelectedModelIds = useCallback((): string[] => {
    return LLM_PROVIDERS_CONFIG.filter((p: LLMProvider) => selectedModels[p.id]).map(p => p.id);
  }, [selectedModels]);

  const handleNewChat = useCallback(async () => {
    setMessages([]);
    setCurrentAppStep('initial');
    setIsLoading(false);
    setCurrentSessionId(null);
    setIsHistoryPanelOpen(false);
    setShowWelcome(true);
    setIsContinuationMode(false);
    setModelsTouched(false);
    activeAiTurnIdRef.current = null;
    setPendingUserTurns(new Map());
    
    const defaultModels: Record<string, boolean> = LLM_PROVIDERS_CONFIG.reduce<Record<string, boolean>>((acc, provider) => {
      acc[provider.id] = ['claude', 'gemini', 'chatgpt'].includes(provider.id);
      return acc;
    }, {} as Record<string, boolean>);
    setSelectedModels(defaultModels);
  }, []);

  const handleSelectChat = useCallback(async (session: HistorySessionSummary) => {
    const sessionId = session.sessionId;
    setCurrentSessionId(sessionId);
    setLastActiveSessionLS(sessionId);
    setIsLoading(true);
    try {
      const s: FullSessionPayload = await api.getHistorySession(sessionId) as unknown as FullSessionPayload;
      const rounds = s?.turns || [];
      const loadedMessages: TurnMessage[] = [];
      rounds.forEach((r: any) => {
        const baseTs = Number(r?.createdAt || Date.now());
        const userIdFromPayload = String(r?.userTurnId || r?.user?.id || '') || `user-${baseTs}`;
        const aiIdFromPayload = String(r?.aiTurnId || r?.ai?.id || '') || `ai-${baseTs + 1}`;
        loadedMessages.push({
          type: 'user',
          id: userIdFromPayload,
          text: String(r?.user?.text || ''),
          createdAt: Number(r?.user?.createdAt || baseTs),
          sessionId
        } as UserTurn);
        const providerResponses: Record<string, ProviderResponse> = {} as any;
        Object.entries(r?.providers || {}).forEach(([pid, data]: any) => {
          providerResponses[String(pid)] = {
            providerId: String(pid),
            text: String((data && data.text) || ''),
            status: 'completed',
            meta: (data && data.meta) || {},
            createdAt: Number(r?.completedAt || baseTs + 1),
            updatedAt: Number(r?.completedAt || baseTs + 1)
          } as any;
        });
        const aiTurn: AiTurn = {
          type: 'ai',
          id: aiIdFromPayload,
          createdAt: Number(r?.completedAt || baseTs + 1),
          sessionId,
          userTurnId: userIdFromPayload,
          batchResponses: providerResponses,
          synthesisResponses: r.synthesisResponses || {},
          mappingResponses: r.mappingResponses || {},
          providerResponses // legacy kept as shorthand
        } as AiTurn;
        loadedMessages.push(aiTurn);
      });
      setMessages(loadedMessages);

      // ✅ Context is already loaded - just ensure port exists
await api.ensurePort({ sessionId });

      setShowWelcome(false);
      // Determine app step
      if (loadedMessages.length === 0) {
        setCurrentAppStep('initial');
        setIsContinuationMode(false);
      } else {
        const lastTurn = loadedMessages[loadedMessages.length - 1];
        if (lastTurn.type === 'ai') {
          setCurrentAppStep('awaitingSynthesis');
          setIsContinuationMode(true);
        } else {
          setCurrentAppStep('initial');
          const hasAiTurn = loadedMessages.some(t => t.type === 'ai');
          setIsContinuationMode(hasAiTurn);
        }
      }
      // Restore scroll position for this session or scroll to bottom
      const savedPos = getScrollPositionLS(sessionId);
      setTimeout(() => {
        const v = virtuosoRef.current as any;
        if (!v) return;
        try {
          if (typeof savedPos === 'number') {
            v.scrollTo?.({ top: savedPos, behavior: 'auto' });
            lastScrollTopRef.current = savedPos;
          } else {
            const idx = loadedMessages.length - 1;
            v.scrollToIndex?.({ index: idx, align: 'end' });
          }
        } catch {}
      }, 50);
    } catch (error) {
      console.error('Error loading session:', error);
      setMessages([]);
      setCurrentAppStep('initial');
      setIsContinuationMode(false);
    } finally {
      setIsLoading(false);
      setIsHistoryPanelOpen(false);
    }
  }, []);

  const handleDeleteChat = useCallback(async (sessionId: string) => {
    try {
      // Delete from backend (source of truth)
      try {
        await api.deleteBackgroundSession(sessionId);
      } catch (e) {
        console.warn('Background session cleanup failed:', e);
      }

      // Clear any UI-local remnants (scroll/app state)
      try {
        // No need to delete session from persistence service as it's now managed by backend
      } catch {}

      try { api.clearSession(sessionId); } catch {}

      // History refresh is handled by the useEffect hook above
      
      if (currentSessionId === sessionId) {
        setMessages([]);
        setCurrentSessionId(null);
        setShowWelcome(true);
        setIsContinuationMode(false);
        setCurrentAppStep('initial');
        activeAiTurnIdRef.current = null;
        setPendingUserTurns(new Map());
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }, [isHistoryPanelOpen, currentSessionId]);

  // Row component for Virtuoso (memoized to reduce unnecessary re-renders)
  const Row = React.memo(({ index }: { index: number }) => {
    const turn = messages[index];

    if (turn && isUserTurn(turn)) {
      const eligibility = eligibilityMaps[turn.id] ?? EMPTY_ELIGIBILITY;
      return (
        <div
          style={{ padding: '8px 0', overflowAnchor: 'none' }}
          data-disable-synthesis={eligibility.disableSynthesisRun}
          data-disable-mapping={eligibility.disableMappingRun}
        >
          <UserTurnBlock
            userTurn={turn as UserTurn}
            isExpanded={expandedUserTurns[turn.id] ?? true}
            onToggle={handleToggleUserTurn}
          />
        </div>
      );
    }

    return (
      <div style={{ padding: '8px 0', overflowAnchor: 'none' }}>
        {turn && isAiTurn(turn) ? (() => {
          const ai = turn as AiTurn;

          // Compose mapping output under the synthesis turn for layered rendering
          let aiForRender: AiTurn = ai;
          if (ai.isSynthesisAnswer) {
            // The synthesis turn already contains mapping responses in the unified model
            aiForRender = ai; // No need to merge from separate turns
          }

          return (
            <AiTurnBlock
              aiTurn={aiForRender}
              isLive={turn.id === activeAiTurnIdRef.current}
              isReducedMotion={isReducedMotion}
              isLoading={isLoading}
              currentAppStep={currentAppStep}
              showSourceOutputs={showSourceOutputs}
              onToggleSourceOutputs={() => setShowSourceOutputs(prev => !prev)}
              onEnterComposerMode={handleEnterComposerMode}
              activeSynthesisClipProviderId={activeClips[aiForRender.id]?.synthesis}
              activeMappingClipProviderId={activeClips[aiForRender.id]?.mapping}
              onClipClick={(type, providerId) => handleClipClick(aiForRender.id, type, providerId)}
            />
          );
        })() : null}
      </div>
    );
  }, (prev, next) => prev.index === next.index);


  // Helpers used in JSX
  const handleToggleModel = (providerId: string) => {
    setSelectedModels(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const handleSetSynthesisProvider = (providerId: string | null) => {
    setSynthesisProvider(providerId);
    // If the chosen Unify provider matches Map provider, auto-pick an alternate for Map
    if (providerId && mappingProvider === providerId) {
      const alternate = LLM_PROVIDERS_CONFIG.find(p => selectedModels[p.id] && p.id !== providerId)?.id || null;
      setMappingProvider(alternate);
      if (alternate) {
        localStorage.setItem('htos_mapping_provider', alternate);
      } else {
        localStorage.removeItem('htos_mapping_provider');
      }
    }
    // Immediate persistence to prevent stale state
    if (providerId) {
      localStorage.setItem('htos_synthesis_provider', providerId);
    } else {
      localStorage.removeItem('htos_synthesis_provider');
    }
  };

  const activeProviderCount = LLM_PROVIDERS_CONFIG.filter((p: LLMProvider) => selectedModels[p.id]).length;

  const handleSwitchViewMode = (mode: ViewMode) => {
    setViewMode(mode);
  };

  return (
    <div className="sidecar-app-container" style={{ display: 'flex', height: '100vh', overflow: 'hidden', overflowX: 'hidden', gap: '0px', padding: '0', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {alertText && (
        <Banner text={alertText} onClose={() => setAlertText(null)} />
      )}
      <div
        className="main-content-wrapper"
        style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: '0',
          width: '100%',
          minWidth: 0,
          maxWidth: '100%',
          boxSizing: 'border-box',
          overflowX: 'hidden'
        }}
      >
        <header
          className="header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: 'rgba(10, 10, 25, 0.85)',
            backdropFilter: 'blur(14px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            flexShrink: 0,
          }}
        >
          <div className="logo-area" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setIsHistoryPanelOpen(!isHistoryPanelOpen)}
              style={{ background: 'none', border: 'none', color: '#e2e8f0', cursor: 'pointer', padding: '4px' }}
              aria-label="Toggle History Panel"
            >
              <MenuIcon style={{ width: '24px', height: '24px' }} />
            </button>
            <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '16px' }}>
              <div
                className="logo-icon"
                style={{
                  width: '24px',
                  height: '24px',
                  background: 'rgba(99, 102, 241, 0.25)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                }}
              >
                ⚡
              </div>
              Sidecar
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="settings-btn"
              onClick={() => setIsSettingsOpen(true)}
              style={{
                padding: '8px 12px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              ⚙️ Models
            </button>
            <button
              className="mode-btn"
              onClick={() => handleSwitchViewMode(viewMode === ViewMode.CHAT ? ViewMode.COMPOSER : ViewMode.CHAT)}
              style={{
                padding: '8px 12px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {viewMode === ViewMode.CHAT ? 'Composer' : 'Chat'}
            </button>
          </div>
        </header>

        <main className="chat-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0', minWidth: 0 }}>
          {viewMode === ViewMode.CHAT ? (
            <div style={{ flex: 1, overflow: 'hidden', padding: '0' }}>
              {showWelcome && (
                <div
                  className="welcome-state"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    textAlign: 'center',
                    padding: '40px 20px',
                  }}
                >
                  <div
                    className="welcome-icon"
                    style={{
                      width: '80px',
                      height: '80px',
                      background: 'linear-gradient(45deg, #6366f1, #8b5cf6)',
                      borderRadius: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '32px',
                      marginBottom: '24px',
                    }}
                  >
                    🧠
                  </div>
                  <h2 className="welcome-title" style={{ fontSize: '24px', fontWeight: 600, marginBottom: '12px' }}>
                    Intelligence Augmentation
                  </h2>
                  <p className="welcome-subtitle" style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '32px', maxWidth: '400px' }}>
                    Ask one question, get synthesized insights from multiple AI models in real-time
                  </p>
                  <button
                    onClick={() => handleSendPrompt(EXAMPLE_PROMPT)}
                    disabled={isLoading}
                    style={{
                      fontSize: '14px',
                      color: '#a78bfa',
                      padding: '8px 16px',
                      border: '1px solid #a78bfa',
                      borderRadius: '8px',
                      background: 'rgba(167, 139, 250, 0.1)',
                      cursor: 'pointer',
                      opacity: isLoading ? 0.5 : 1,
                    }}
                  >
                    Try: "{EXAMPLE_PROMPT}"
                  </button>
                </div>
              )}

      {/* Floating Scroll-to-bottom button */}
      {viewMode === ViewMode.CHAT && showScrollToBottom && (
        <button
          onClick={() => {
            const idx = messages.length > 0 ? messages.length - 1 : 0;
            try { virtuosoRef.current?.scrollToIndex({ index: idx, align: 'end', behavior: 'smooth' as any }); } catch {}
          }}
          aria-label="Scroll to bottom"
          style={{
            position: 'fixed',
            right: 20,
            bottom: (chatInputHeight || 80) + 24,
            zIndex: 1200,
            background: '#334155',
            border: '1px solid #475569',
            borderRadius: 20,
            padding: '8px 12px',
            color: '#e2e8f0',
            fontSize: 12,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          ↓ Scroll to bottom
        </button>
      )}

              {!showWelcome && (
                <Virtuoso
                  ref={virtuosoRef}
                  style={{ height: Math.max(300, window.innerHeight - 220), padding: '8px 0' }}
                  data={messages}
                  itemContent={(index, message) => <Row index={index} />}
                  followOutput="auto"
                  alignToBottom
                  overscan={8}
                  computeItemKey={(index, message) => (message as any).id}
                  increaseViewportBy={{ top: 200, bottom: 800 }}
                   components={{ Scroller: ScrollerWithSave }}
                   rangeChanged={(range) => {
                    // If the last rendered item is at least 2 away from the end, show the button
                    const threshold = 2;
                    const shouldShow = (messages.length - 1) - range.endIndex >= threshold;
                    setShowScrollToBottom(shouldShow);
                  }}
                  atBottomStateChange={(atBottom) => {
                    if (atBottom) setShowScrollToBottom(false);
                  }}
                />
              )}
            </div>
          ) : viewMode === ViewMode.COMPOSER ? (
            <ComposerMode
              allTurns={messages}
              sessionId={currentSessionId}
              onExit={handleExitComposerMode}
              onUpdateAiTurn={handleUpdateAiTurnForComposer}
            />
          ) : null}
        </main>

        {viewMode === ViewMode.CHAT && (
          <CompactModelTray
            selectedModels={selectedModels}
            onToggleModel={handleToggleModel}
            isLoading={isLoading}
            thinkOnChatGPT={thinkOnChatGPT}
            onToggleThinkChatGPT={() => setThinkOnChatGPT(prev => !prev)}
            synthesisProvider={synthesisProvider}
            onSetSynthesisProvider={handleSetSynthesisProvider}
            mappingEnabled={mappingEnabled}
            onToggleMapping={handleToggleMapping}
            mappingProvider={mappingProvider}
            onSetMappingProvider={handleSetMappingProvider}
            powerUserMode={powerUserMode}
            synthesisProviders={synthesisProviders}
            onToggleSynthesisProvider={handleToggleSynthesisProvider}
            isFirstLoad={isFirstLoad}
            chatInputHeight={chatInputHeight}
          />
        )}

        {viewMode === ViewMode.CHAT && (
          <ChatInput
            onSendPrompt={handleSendPrompt}
            onContinuation={handleContinuation}
            isLoading={isLoading}
            isReducedMotion={isReducedMotion}
            activeProviderCount={activeProviderCount}
            isVisibleMode={isVisibleMode}
            isContinuationMode={isContinuationMode}
            onHeightChange={setChatInputHeight}
          />
        )}
      </div>

      {isHistoryPanelOpen && (
        <>
          <div
            className="history-backdrop"
            aria-hidden="true"
            onClick={() => setIsHistoryPanelOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(2px)', zIndex: 1000 }}
          />
          <div
            ref={historyOverlayRef}
            role="dialog"
            aria-modal="true"
            aria-label="Chat history"
            className="history-overlay"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '320px',
              height: '100vh',
              background: 'rgba(10, 10, 25, 0.96)',
              backdropFilter: 'blur(15px)',
              borderRight: '1px solid rgba(255, 255, 255, 0.1)',
              zIndex: 1100,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <HistoryPanel
              isOpen={isHistoryPanelOpen}
              sessions={historySessions}
              isLoading={isHistoryLoading}
              onNewChat={handleNewChat}
              onSelectChat={handleSelectChat}
              onDeleteChat={handleDeleteChat}
            />
          </div>
        </>
      )}

      <div
        className="settings-panel"
        style={{
          position: 'fixed',
          top: 0,
          right: isSettingsOpen ? '0px' : '-350px',
          width: '350px',
          height: '100vh',
          background: 'rgba(15, 15, 35, 0.95)',
          backdropFilter: 'blur(20px)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
          transition: 'right 0.3s ease',
          zIndex: 100,
          padding: '20px',
          overflowY: 'auto',
        }}
      >
        <div className="settings-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h2 className="settings-title" style={{ fontSize: '18px', fontWeight: 600 }}>Model Configuration</h2>
          <button
            className="close-settings"
            onClick={() => setIsSettingsOpen(false)}
            style={{
              padding: '8px',
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              borderRadius: '4px',
              transition: 'background 0.2s ease',
              fontSize: '18px',
            }}
          >
            ✕
          </button>
        </div>
        
        <div className="model-config">
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#a78bfa' }}>Active Models</h3>
          {LLM_PROVIDERS_CONFIG.map(provider => (
            <div
              key={provider.id}
              className="model-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                marginBottom: '8px',
              }}
            >
              <div className="model-info" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className={`model-logo ${provider.logoBgClass}`} style={{ width: '16px', height: '16px', borderRadius: '3px' }}></div>
                <span>{provider.name}</span>
              </div>
              <div
                className={`model-toggle ${selectedModels[provider.id] ? 'active' : ''}`}
                onClick={() => handleToggleModel(provider.id)}
                style={{
                  width: '40px',
                  height: '20px',
                  background: selectedModels[provider.id] ? '#6366f1' : 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '10px',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '2px',
                    left: selectedModels[provider.id] ? '22px' : '2px',
                    width: '16px',
                    height: '16px',
                    background: 'white',
                    borderRadius: '50%',
                    transition: 'left 0.2s ease',
                  }}
                />
              </div>
            </div>
          ))}
          
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#a78bfa', marginTop: '20px' }}>Execution Mode</h3>
          <div className="mode-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              marginBottom: '8px',
            }}
          >
            <span>Run in Visible Tabs (for debugging)</span>
            <div
              onClick={() => setIsVisibleMode(!isVisibleMode)}
              style={{
                width: '40px',
                height: '20px',
                background: isVisibleMode ? '#6366f1' : 'rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: isVisibleMode ? '22px' : '2px',
                  width: '16px',
                  height: '16px',
                  background: 'white',
                  borderRadius: '50%',
                  transition: 'left 0.2s ease',
                }}
              />
            </div>
          </div>

          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#a78bfa', marginTop: '20px' }}>Advanced Features</h3>
          <div className="mode-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              marginBottom: '8px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span>Power User Mode</span>
              <span style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Enable multi-synthesis selection</span>
            </div>
            <div
              className={`mode-toggle ${powerUserMode ? 'active' : ''}`}
              onClick={() => setPowerUserMode(!powerUserMode)}
              style={{
                width: '40px',
                height: '20px',
                background: powerUserMode ? '#6366f1' : 'rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: powerUserMode ? '22px' : '2px',
                  width: '16px',
                  height: '16px',
                  background: 'white',
                  borderRadius: '50%',
                  transition: 'left 0.2s ease',
                }}
              />
            </div>
          </div>

          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#a78bfa', marginTop: '20px' }}>Advanced Features</h3>
          <div className="mode-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              marginBottom: '8px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span>Power User Mode</span>
              <span style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Enable multi-synthesis selection</span>
            </div>
            <div
              className={`mode-toggle ${powerUserMode ? 'active' : ''}`}
              onClick={() => setPowerUserMode(!powerUserMode)}
              style={{
                width: '40px',
                height: '20px',
                background: powerUserMode ? '#6366f1' : 'rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: powerUserMode ? '22px' : '2px',
                  width: '16px',
                  height: '16px',
                  background: 'white',
                  borderRadius: '50%',
                  transition: 'left 0.2s ease',
                }}
              />
            </div>
          </div>

          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#a78bfa', marginTop: '20px' }}>Accessibility</h3>
          <div className="mode-item"

            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              marginBottom: '8px',
            }}
          >
            <span>Reduced Motion</span>
            <div
              className={`mode-toggle ${isReducedMotion ? 'active' : ''}`}
              onClick={() => setIsReducedMotion(!isReducedMotion)}
              style={{
                width: '40px',
                height: '20px',
                background: isReducedMotion ? '#6366f1' : 'rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: isReducedMotion ? '22px' : '2px',
                  width: '16px',
                  height: '16px',
                  background: 'white',
                  borderRadius: '50%',
                  transition: 'left 0.2s ease',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;