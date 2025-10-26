import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor, pointerWithin } from '@dnd-kit/core';
 import { CanvasEditorV2 } from './CanvasEditorV2';
 import { CanvasEditorRef } from './CanvasEditorV2';
 import { TurnMessage, AiTurn } from '../../types';
 import ComposerToolbar from './ComposerToolbar';
 // HorizontalChatRail removed in Phase 2 - replaced by NavigatorBar
 import { NavigatorBar } from './NavigatorBar';
 import { convertTurnMessagesToChatTurns, ChatTurn, ResponseBlock } from '../../types/chat';
 import { DragData, isValidDragData, GhostData } from '../../types/dragDrop';
 import { ProvenanceData } from './extensions/ComposedContentNode';
 import ResponseViewer from './ResponseViewer';
 import { Granularity } from '../../utils/segmentText';
 import { SaveDialog } from './SaveDialog';
 import type { DocumentRecord } from '../../types';
 import DocumentsHistoryPanel from '../DocumentsHistoryPanel';
 import { ReferenceZone } from './ReferenceZone';
 import { enhancedDocumentStore } from '../../services/enhancedDocumentStore';
 import { PERSISTENCE_FEATURE_FLAGS } from '../../../src/persistence/index';
 import { CanvasTray } from './CanvasTray';
 import { CanvasTabData } from './CanvasTab';

interface ComposerModeProps {
  allTurns: TurnMessage[];
  sessionId: string | null;
  onExit: () => void;
  onUpdateAiTurn?: (aiTurnId: string, updates: Partial<AiTurn>) => void;
}

export const ComposerMode: React.FC<ComposerModeProps> = ({
  allTurns,
  sessionId,
  onExit,
  onUpdateAiTurn,
  
}) => {
  const editorRef = useRef<CanvasEditorRef>(null);
  const [activeDragData, setActiveDragData] = useState<any>(null);
  const [selectedTurn, setSelectedTurn] = useState<ChatTurn | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<ResponseBlock | undefined>();
  const [isDragging, setIsDragging] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>('paragraph');
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [dragStartCoordinates, setDragStartCoordinates] = useState<{ x: number; y: number } | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [showDocumentsPanel, setShowDocumentsPanel] = useState(false);
  const [currentDocument, setCurrentDocument] = useState<DocumentRecord | null>(null);
  const [lastSavedContent, setLastSavedContent] = useState<string>('');
  const [dirtySaveTimer, setDirtySaveTimer] = useState<NodeJS.Timeout | null>(null);
  const [pinnedGhosts, setPinnedGhosts] = useState<GhostData[]>([]);
  const [isReferenceCollapsed, setIsReferenceCollapsed] = useState(false);
  const [ghostIdCounter, setGhostIdCounter] = useState(0);
  const [documentsRefreshTick, setDocumentsRefreshTick] = useState(0);
  const [showNavigatorBar, setShowNavigatorBar] = useState(true);
  const [canvasTabs, setCanvasTabs] = useState<CanvasTabData[]>([]);
  const [showCanvasTray, setShowCanvasTray] = useState(true);
  const [workspaceTabId, setWorkspaceTabId] = useState<string | null>(null);
  const workspaceEditorRef = useRef<CanvasEditorRef>(null);
  const turnsRef = useRef<ChatTurn[]>([]);
  const isRefCollapsedRef = useRef<boolean>(false);
  const [navFlashTick, setNavFlashTick] = useState(0);

  const turns = useMemo(() => convertTurnMessagesToChatTurns(allTurns), [allTurns]);
  useEffect(() => { turnsRef.current = turns; }, [turns]);
  useEffect(() => { isRefCollapsedRef.current = isReferenceCollapsed; }, [isReferenceCollapsed]);

  // Load pinned ghosts when document changes
  useEffect(() => {
    const localKey = (docId: string) => `composer:pinnedGhosts:${docId}`;
    const loadLocalGhosts = (docId: string) => {
      try {
        const raw = localStorage.getItem(localKey(docId));
        return raw ? (JSON.parse(raw) as GhostData[]) : [];
      } catch (e) {
        console.warn('[ComposerMode] Failed to parse local pinned ghosts', e);
        return [];
      }
    };

    const saveLocalGhosts = (docId: string, ghosts: GhostData[]) => {
      try {
        localStorage.setItem(localKey(docId), JSON.stringify(ghosts));
      } catch (e) {
        console.warn('[ComposerMode] Failed to save local pinned ghosts', e);
      }
    };

    const loadGhosts = async () => {
      const documentId = currentDocument?.id || 'scratch';

      // If persistence is disabled, use localStorage
      if (!PERSISTENCE_FEATURE_FLAGS.ENABLE_GHOST_RAIL) {
        const local = loadLocalGhosts(documentId);
        setPinnedGhosts(local || []);
        return;
      }

      try {
        const ghosts = await enhancedDocumentStore.getDocumentGhosts(documentId);
        if (ghosts && ghosts.length) {
          setPinnedGhosts(ghosts);
          saveLocalGhosts(documentId, ghosts);
        } else {
          // Fallback to any locally saved ghosts
          const local = loadLocalGhosts(documentId);
          setPinnedGhosts(local || []);
        }
      } catch (error) {
        console.warn('[ComposerMode] Failed to load ghosts, using local fallback:', error);
        const local = loadLocalGhosts(documentId);
        setPinnedGhosts(local || []);
      }
    };
    
    loadGhosts();
  }, [currentDocument?.id]);

  // Helper function to get current editor content
  const getCurrentContent = useCallback(() => {
    const jsonContent = editorRef.current?.getContent();
    return jsonContent ? JSON.stringify(jsonContent) : '';
  }, []);

  // Helper function to generate default title from content
  const generateDefaultTitle = useCallback((content: string) => {
    try {
      const jsonContent = JSON.parse(content);
      // Extract plain text from the JSON content
      const extractText = (node: any): string => {
        if (node.type === 'text') {
          return node.text || '';
        }
        if (node.content && Array.isArray(node.content)) {
          return node.content.map(extractText).join('');
        }
        return '';
      };
      
      const plainText = extractText(jsonContent).trim();
      const firstLine = plainText.split('\n')[0] || '';
      return firstLine.length > 50 ? firstLine.substring(0, 47) + '...' : firstLine || 'Untitled Document';
    } catch {
      return 'Untitled Document';
    }
  }, []);

  // Check if content has changed
  const checkIfDirty = useCallback(() => {
    const currentContent = getCurrentContent();
    const dirty = currentContent !== lastSavedContent && currentContent.trim() !== '';
    setIsDirty(dirty);
    return dirty;
  }, [getCurrentContent, lastSavedContent]);

  // Dirty save functionality - saves every 15 seconds
  const performDirtySave = useCallback(async () => {
    const content = getCurrentContent();
    if (!content.trim() || content === lastSavedContent) return;

    try {
      const parsedContent = JSON.parse(content);
      const nodes = Array.isArray(parsedContent?.content) ? parsedContent.content : [];
      const now = Date.now();

      if (currentDocument) {
        // Update existing document via enhanced store
        const updatedDoc: DocumentRecord = {
          ...currentDocument,
          title: currentDocument.title || generateDefaultTitle(content),
          canvasContent: nodes as any,
          lastModified: now,
          updatedAt: now,
          // blockCount: optional; service worker may recompute
        } as DocumentRecord;
        await enhancedDocumentStore.saveDocument(updatedDoc);
        setLastSavedContent(content);
        setDocumentsRefreshTick((t) => t + 1);
      } else {
        // Create new autosave document via enhanced store
        const title = `Autosave - ${generateDefaultTitle(content)}`;
        const newDoc = await enhancedDocumentStore.createDocument(
          title,
          sessionId || undefined,
          nodes as any
        );
        setCurrentDocument(newDoc);
        setLastSavedContent(content);
        setDocumentsRefreshTick((t) => t + 1);
      }
    } catch (error) {
      console.error('[ComposerMode] Dirty save failed:', error);
    }
  }, [sessionId, getCurrentContent, lastSavedContent, currentDocument, generateDefaultTitle]);

  // Set up dirty save timer
  useEffect(() => {
    if (dirtySaveTimer) {
      clearInterval(dirtySaveTimer);
    }

    const timer = setInterval(() => {
      if (checkIfDirty()) {
        performDirtySave();
      }
    }, 15000); // 15 seconds

    setDirtySaveTimer(timer);

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [checkIfDirty, performDirtySave]);

  // Autosave when leaving
  const handleExit = useCallback(async () => {
    if (dirtySaveTimer) {
      clearInterval(dirtySaveTimer);
    }

    // Perform final autosave if content is dirty
    if (checkIfDirty()) {
      await performDirtySave();
    }

    onExit();
  }, [onExit, checkIfDirty, performDirtySave, dirtySaveTimer]);

  // Handle manual save
  const handleSave = useCallback(async (title: string) => {
    setIsSaving(true);
    try {
      const content = getCurrentContent();
      const parsedContent = JSON.parse(content);
      const nodes = Array.isArray(parsedContent?.content) ? parsedContent.content : [];
      const now = Date.now();

      if (currentDocument) {
        // Update existing document via enhanced store
        const updatedDoc: DocumentRecord = {
          ...currentDocument,
          title: title || currentDocument.title,
          canvasContent: nodes as any,
          lastModified: now,
          updatedAt: now,
        } as DocumentRecord;
        await enhancedDocumentStore.saveDocument(updatedDoc);
      } else {
        // Create new document via enhanced store
        const newDoc = await enhancedDocumentStore.createDocument(
          title || generateDefaultTitle(content),
          sessionId || undefined,
          nodes as any
        );
        setCurrentDocument(newDoc);
      }

      setLastSavedContent(content);
      setIsDirty(false);
      setDocumentsRefreshTick((t) => t + 1);

      // Auto-close dialog after successful save
      setTimeout(() => {
        setShowSaveDialog(false);
        setIsSaving(false);
      }, 300);
    } catch (error) {
      console.error('[ComposerMode] Save failed:', error);
      setIsSaving(false);
    }
  }, [sessionId, getCurrentContent, currentDocument, generateDefaultTitle]);

  // Handle refine functionality
  const handleRefine = useCallback(async (content: string, model: string) => {
    setIsRefining(true);
    try {
      // TODO: Implement actual LLM call for grammar correction
      console.log('Refining content with model:', model);
      console.log('Content to refine:', content);
      
      // Placeholder for actual implementation
      // This would send the content to the selected LLM with a grammar correction prompt
      // and then update the canvas with the refined content
      
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
      
      // For now, just log the action
      console.log('Refine completed');
    } catch (error) {
      console.error('Error during refine:', error);
    } finally {
      setIsRefining(false);
    }
  }, []);

  // Handle content changes
  const handleContentChange = useCallback(() => {
    // Debounce the dirty check
    setTimeout(() => {
      checkIfDirty();
    }, 100);
  }, [checkIfDirty]);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 100,
        tolerance: 5,
      },
    })
  );

  const handleDragStart = useCallback((event: any) => {
    setActiveDragData(event.active.data.current);
    setIsDragging(true);
    
    // Capture mouse coordinates from the activator event
    if (event.activatorEvent) {
      const rect = document.body.getBoundingClientRect();
      setDragStartCoordinates({
        x: event.activatorEvent.clientX - rect.left,
        y: event.activatorEvent.clientY - rect.top
      });
      setPointerPos({ x: event.activatorEvent.clientX, y: event.activatorEvent.clientY });
    }
  }, []);

  // Track pointer position during drag for accurate insertion
  useEffect(() => {
    if (!isDragging) return;
    const onPointerMove = (e: PointerEvent) => {
      setPointerPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('pointermove', onPointerMove);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [isDragging]);

  const handleDragEnd = useCallback((event: any) => {
     const { active, over } = event;

     if (over?.id === 'canvas-dropzone' && active?.data?.current) {
       const payload = active.data.current;

      // Compute target insertion position based on pointer coordinates
      let insertionPos: number | undefined = undefined;
      const editorAny = (editorRef.current as any);
      const pmView = editorAny?.editor?.view;
      if (pmView && typeof pmView.posAtCoords === 'function' && pointerPos) {
        const result = pmView.posAtCoords({ left: pointerPos.x, top: pointerPos.y });
        if (result?.pos) insertionPos = result.pos;
      }

       if (payload?.type === 'composer-block' && payload?.text && payload?.provenance) {
         const prov: ProvenanceData = {
           ...payload.provenance,
           timestamp: typeof payload.provenance.timestamp === 'number' ? payload.provenance.timestamp : Date.now(),
         };
        editorRef.current?.insertComposedContent(payload.text, prov, insertionPos);
       } else {
         const dragData: DragData = payload;
         if (isValidDragData(dragData)) {
           const mapGranularity = (g: DragData['metadata']['granularity']): ProvenanceData['granularity'] => {
             switch (g) {
               case 'paragraph': return 'paragraph';
               case 'sentence': return 'sentence';
               case 'word':
               case 'phrase': return 'sentence';
               case 'response':
               case 'turn':
               default: return 'full';
             }
           };

           const providerIdFull = dragData.metadata.providerId;
           const responseType: ProvenanceData['responseType'] = /-synthesis$/.test(providerIdFull)
             ? 'synthesis'
             : /-mapping$/.test(providerIdFull)
             ? 'mapping'
             : 'batch';

           // Prefer provenance from the payload when present; fall back to mapping
           const baseProv: ProvenanceData | undefined = (payload && (payload as any).provenance) as ProvenanceData | undefined;
           const provenance: ProvenanceData = {
             ...(baseProv || {
               sessionId: sessionId || 'current',
               aiTurnId: dragData.metadata.turnId,
               providerId: providerIdFull,
               responseType,
               responseIndex: 0,
               granularity: mapGranularity(dragData.metadata.granularity),
             }),
             timestamp: Date.now(),
             // Use full response text when available for hover preview, else segment
             sourceText: baseProv?.sourceText || dragData.metadata.sourceContext?.fullResponse || dragData.content,
             sourceContext: baseProv?.sourceContext || (dragData.metadata.sourceContext ? { fullResponse: dragData.metadata.sourceContext.fullResponse } : undefined),
           } as ProvenanceData;

           editorRef.current?.insertComposedContent(
             dragData.content,
             provenance,
             insertionPos
           );
         }
       }
     }

     setActiveDragData(null);
     setIsDragging(false);
     setDragStartCoordinates(null);
     setPointerPos(null);
   }, [sessionId, pointerPos]);

  const handleTurnSelect = useCallback((index: number) => {
    setCurrentTurnIndex(index);
    setSelectedTurn(turns[index] || null);
    setSelectedResponse(undefined);
  }, [turns]);

  // Handle document selection from history panel
  const handleSelectDocument = useCallback((document: DocumentRecord) => {
    if (editorRef.current && document.canvasContent) {
      // Parse and normalize to TipTap doc JSON
      const raw = typeof document.canvasContent === 'string' 
        ? JSON.parse(document.canvasContent) 
        : document.canvasContent;
      const docJson = Array.isArray(raw) ? { type: 'doc', content: raw } : raw;
      // Ensure editor is ready and set content via exposed ref API
      editorRef.current.setContent?.(docJson as any);
      setCurrentDocument(document);
      setLastSavedContent(JSON.stringify(docJson));
      setShowDocumentsPanel(false);
    }
  }, []);

  // Handle new document creation
  const handleNewDocument = useCallback(() => {
    if (editorRef.current) {
      const editor = (editorRef.current as any).editor;
      if (editor) {
        editor.commands.clearContent();
      }
      setCurrentDocument(null);
      setLastSavedContent('');
      setShowDocumentsPanel(false);
    }
  }, []);

  // Handle document deletion
  const handleDeleteDocument = useCallback(async (documentId: string) => {
    try {
      await enhancedDocumentStore.deleteDocument(documentId);
    } catch (error) {
      console.error('[ComposerMode] Failed to delete document:', error);
    }
  }, []);

  const handleResponsePickFromRail = useCallback((turnIndex: number, providerId: string, content: string) => {
    const turn = turns[turnIndex];
    if (!turn) return;
    setCurrentTurnIndex(turnIndex);
    setSelectedTurn(turn);
    const resp: ResponseBlock | undefined = turn.responses.find(r => r.providerId === providerId) || {
      id: `${turn.id}-picked-${providerId}`,
      content,
      providerId,
    } as ResponseBlock;
    setSelectedResponse(resp);
  }, [turns]);

  // Handle pinning a segment
  const handlePinSegment = useCallback(async (text: string, provenance: ProvenanceData) => {
    const documentId = currentDocument?.id || 'scratch';
    const preview = text.length > 50 ? text.substring(0, 47) + '...' : text;
    
    const saveLocalGhosts = (ghosts: GhostData[]) => {
      try {
        localStorage.setItem(`composer:pinnedGhosts:${documentId}`, JSON.stringify(ghosts));
      } catch (e) {
        console.warn('[ComposerMode] Failed to save local pinned ghosts', e);
      }
    };
    
    // Create ghost data
    const ghostData: GhostData = {
      id: `ghost-${Date.now()}-${ghostIdCounter}`,
      text,
      preview,
      provenance,
      createdAt: Date.now(),
      isPinned: true,
    };
    
    setGhostIdCounter(prev => prev + 1);
    
    // Try to persist if enabled
    if (PERSISTENCE_FEATURE_FLAGS.ENABLE_GHOST_RAIL) {
      try {
        const persistedGhost = await enhancedDocumentStore.createGhost(
          documentId,
          text,
          {
            sessionId: provenance.sessionId,
            aiTurnId: provenance.aiTurnId,
            providerId: provenance.providerId,
            responseType: provenance.responseType,
            responseIndex: provenance.responseIndex,
            textRange: undefined,
          }
        );
        // Use persisted ghost if available
        if (persistedGhost) {
          setPinnedGhosts(prev => {
            const next = [...prev, { ...ghostData, id: persistedGhost.id || ghostData.id }];
            saveLocalGhosts(next);
            return next;
          });
          return;
        }
      } catch (error) {
        console.warn('[ComposerMode] Failed to persist ghost, using in-memory:', error);
      }
    }
    
    // Fallback to in-memory and localStorage
    setPinnedGhosts(prev => {
      const next = [...prev, ghostData];
      saveLocalGhosts(next);
      return next;
    });
  }, [currentDocument?.id, ghostIdCounter]);

  // Handle unpinning a ghost
  const handleUnpinGhost = useCallback(async (ghostId: string) => {
    const documentId = currentDocument?.id || 'scratch';
    const saveLocalGhosts = (ghosts: GhostData[]) => {
      try {
        localStorage.setItem(`composer:pinnedGhosts:${documentId}`, JSON.stringify(ghosts));
      } catch (e) {
        console.warn('[ComposerMode] Failed to save local pinned ghosts', e);
      }
    };

    // Try to delete from persistence if enabled
    if (PERSISTENCE_FEATURE_FLAGS.ENABLE_GHOST_RAIL) {
      try {
        await enhancedDocumentStore.deleteGhost(ghostId);
      } catch (error) {
        console.warn('[ComposerMode] Failed to delete ghost from persistence:', error);
      }
    }
    
    // Remove from local state and persist locally
    setPinnedGhosts(prev => {
      const next = prev.filter(g => g.id !== ghostId);
      saveLocalGhosts(next);
      return next;
    });
  }, [currentDocument?.id]);

  // Handle extract to canvas from main editor
  const handleExtractToMainFromCanvas = useCallback((content: string, provenance: ProvenanceData) => {
    if (editorRef.current) {
      editorRef.current.insertComposedContent(content, provenance);
    }
  }, []);

  // Handle canvas tabs change
  const handleCanvasTabsChange = useCallback((tabs: CanvasTabData[]) => {
    setCanvasTabs(tabs);
    // TODO: Persist canvas tabs to document record
  }, []);

  // Handle extract to canvas from ResponseViewer
  const handleExtractToCanvas = useCallback((text: string, provenance: ProvenanceData) => {
    // Dispatch custom event that CanvasTray can listen to
    const event = new CustomEvent('extract-to-canvas', {
      detail: { text, provenance },
      bubbles: true,
    });
    document.dispatchEvent(event);
  }, []);

  // Handle click-to-jump from composed blocks with stable listener and robust matching
  useEffect(() => {
    const handleBlockClick = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { provenance } = (customEvent.detail || {}) as { provenance?: ProvenanceData };
      try { console.log('[ComposerMode] composer-block-click received', { provenance }); } catch {}
      if (!provenance) return;
      const aiTurnId = String(provenance.aiTurnId ?? '');
      const providerIdFull = String(provenance.providerId ?? '');
      const baseProviderId = providerIdFull.replace(/-(synthesis|mapping)$/,'');
      const tlist = turnsRef.current || [];
      try { console.log('[ComposerMode] turns length', tlist.length); } catch {}

      // Primary match by exact id
      let turnIndex = tlist.findIndex(t => t.id === aiTurnId);
      // Fallback: numeric id match (e.g., 'turn-3' vs '3')
      if (turnIndex === -1) {
        const num = aiTurnId.replace(/\D+/g, '');
        if (num) {
          turnIndex = tlist.findIndex(t => (t.id || '').toString().replace(/\D+/g, '') === num);
        }
      }

      if (turnIndex !== -1) {
        setCurrentTurnIndex(turnIndex);
        const turn = tlist[turnIndex];
        setSelectedTurn(turn);

        if (turn.type === 'ai') {
          const responses = turn.responses || [];
          let response = responses.find(r => r.providerId === providerIdFull);
          if (!response) {
            const typeSuffix = providerIdFull.endsWith('-synthesis') ? '-synthesis' : providerIdFull.endsWith('-mapping') ? '-mapping' : '';
            if (typeSuffix) {
              response = responses.find(r => r.providerId.replace(/-(synthesis|mapping)$/,'') === baseProviderId && r.providerId.endsWith(typeSuffix));
            }
          }
          if (!response) {
            // Base-only fallback
            response = responses.find(r => r.providerId.replace(/-(synthesis|mapping)$/,'') === baseProviderId);
          }
          if (!response && typeof provenance.responseIndex === 'number') {
            const candidates = responses.filter(r => r.providerId.replace(/-(synthesis|mapping)$/,'') === baseProviderId);
            if (candidates[provenance.responseIndex]) response = candidates[provenance.responseIndex];
          }
          if (response) {
            setSelectedResponse(response);
          } else {
            setSelectedResponse(undefined);
          }
        } else {
          setSelectedResponse(undefined);
        }

        if (isRefCollapsedRef.current) {
          setIsReferenceCollapsed(false);
        }
        setNavFlashTick(t => t + 1);
        try { console.log('[ComposerMode] navigation applied', { turnIndex, aiTurnId, providerIdFull }); } catch {}
      } else {
        try { console.warn('[ComposerMode] No matching turn for aiTurnId', { aiTurnId }); } catch {}
      }
    };
    document.addEventListener('composer-block-click', handleBlockClick);
    return () => document.removeEventListener('composer-block-click', handleBlockClick);
  }, []);

  // Listen for open-canvas-workspace event to open a full workspace view
  useEffect(() => {
    const handleOpenWorkspace = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { tabId } = (customEvent.detail || {}) as { tabId?: string };
      if (tabId) {
        setWorkspaceTabId(tabId as string);
      }
    };
    document.addEventListener('open-canvas-workspace', handleOpenWorkspace);
    return () => document.removeEventListener('open-canvas-workspace', handleOpenWorkspace);
  }, []);

  // Load selected workspace tab content into the workspace editor
  useEffect(() => {
    if (!workspaceTabId) return;
    const activeWorkspaceTab = canvasTabs.find(t => t.id === workspaceTabId);
    if (!activeWorkspaceTab) return;
    const editor = workspaceEditorRef.current as any;
    if (editor?.setContent && activeWorkspaceTab.content) {
      const docJson = Array.isArray(activeWorkspaceTab.content) ? { type: 'doc', content: activeWorkspaceTab.content } : activeWorkspaceTab.content;
      editor.setContent(docJson as any);
    }
  }, [workspaceTabId, canvasTabs]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Esc - Toggle Reference Zone collapse
      if (e.key === 'Escape' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Don't trigger if user is typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        setIsReferenceCollapsed(prev => !prev);
      }
      
      // Cmd/Ctrl + 1-9 - Navigate to turn
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const turnIndex = parseInt(e.key) - 1;
        if (turnIndex < turns.length) {
          setCurrentTurnIndex(turnIndex);
          setSelectedTurn(turns[turnIndex]);
          setSelectedResponse(undefined);
        }
      }
      
      // Shift + P - Pin current segment (placeholder for future enhancement)
      if (e.shiftKey && e.key === 'P' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        // TODO: Pin last hovered/selected segment
        console.log('[ComposerMode] Shift+P pressed - pin last segment (not yet implemented)');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [turns, isReferenceCollapsed]);

  return (
    <div style={{ height: '100vh', maxHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing: 'border-box', padding: 0 }}>
      <ComposerToolbar 
        editorRef={editorRef}
        onExit={handleExit}
        onSave={() => {
          const content = getCurrentContent();
          const defaultTitle = generateDefaultTitle(content);
          setShowSaveDialog(true);
        }}
        onRefine={handleRefine}
        onToggleDocuments={() => setShowDocumentsPanel(!showDocumentsPanel)}
        isRefining={isRefining}
        showDocumentsPanel={showDocumentsPanel}
        isDirty={isDirty}
        isSaving={isSaving}
      />

      {/* Navigator Bar */}
      {showNavigatorBar && (
        <NavigatorBar
          turns={turns}
          currentTurnIndex={currentTurnIndex}
          onSelectTurn={handleTurnSelect}
          onPinAll={() => {
            // Pin all segments from current turn
            const currentTurn = turns[currentTurnIndex];
            if (currentTurn && currentTurn.type === 'ai') {
              const response = selectedResponse || currentTurn.responses?.[0];
              if (response) {
                // TODO: Implement pin all segments
                console.log('[ComposerMode] Pin all from turn:', currentTurn.id);
              }
            }
          }}
        />
      )}

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          collisionDetection={pointerWithin}
        >
          <div style={{ 
            flex: 1, 
            minHeight: 0, 
            display: 'grid', 
            gridTemplateColumns: showDocumentsPanel
              ? (isReferenceCollapsed 
                ? '40px minmax(0, 1fr) minmax(220px, 320px)'
                : 'minmax(260px, 400px) minmax(0, 1fr) minmax(220px, 320px)')
              : (isReferenceCollapsed 
                ? '40px minmax(0, 1fr)'
                : 'minmax(260px, 400px) minmax(0, 1fr)'),
            gap: 0, 
            width: '100%',
            boxSizing: 'border-box',
            overflow: 'hidden',
            overflowX: 'hidden'
          }}>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <ReferenceZone
                turn={selectedTurn || turns[currentTurnIndex] || null}
                response={selectedResponse}
                granularity={granularity}
                onGranularityChange={setGranularity}
                pinnedGhosts={pinnedGhosts}
                onPinSegment={handlePinSegment}
                onUnpinGhost={handleUnpinGhost}
                isCollapsed={isReferenceCollapsed}
                onToggleCollapse={() => setIsReferenceCollapsed(prev => !prev)}
                onSelectResponse={(providerId) => {
                  const turn = (selectedTurn || turns[currentTurnIndex]);
                  if (!turn || turn.type === 'user') return;
                  // Try exact providerId match first (includes suffix if present)
                  let resp = turn.responses?.find(r => r.providerId === providerId);
                  if (!resp) {
                    // Fallback: match by base provider id (strip suffixes)
                    const base = providerId.replace(/-(synthesis|mapping)$/,'');
                    resp = turn.responses?.find(r => r.providerId.replace(/-(synthesis|mapping)$/,'') === base);
                  }
                  setSelectedResponse(resp);
                }}
                onExtractToCanvas={handleExtractToCanvas}
                flashTick={navFlashTick}
              />
            </div>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <CanvasEditorV2
                ref={editorRef}
                placeholder="Drag content here to compose..."
                onChange={handleContentChange}
              />
            </div>
            {showDocumentsPanel && (
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <DocumentsHistoryPanel
                  isOpen={showDocumentsPanel}
                  onSelectDocument={handleSelectDocument}
                  onDeleteDocument={handleDeleteDocument}
                  onNewDocument={handleNewDocument}
                  refreshSignal={documentsRefreshTick}
                />
              </div>
            )}
          </div>

          <DragOverlay
            style={dragStartCoordinates ? {
              transform: `translate(${dragStartCoordinates.x}px, ${dragStartCoordinates.y}px)`,
              transformOrigin: 'top left'
            } : undefined}
          >
            {isDragging && activeDragData && (
              <div style={{
                background: '#1e293b',
                border: '1px solid #8b5cf6',
                borderRadius: '8px',
                padding: '12px',
                maxWidth: '300px',
                color: '#e2e8f0',
                fontSize: '13px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                pointerEvents: 'none',
              }}>
                {(activeDragData.text || activeDragData.content || '').toString().substring(0, 100)}...
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Canvas Tray */}
      {showCanvasTray && (
        <CanvasTray
          onExtractToMain={handleExtractToMainFromCanvas}
          initialTabs={canvasTabs}
          onTabsChange={handleCanvasTabsChange}
        />
      )}

      {/* Full Canvas Workspace Overlay */}
      {workspaceTabId && (() => {
        const activeWorkspaceTab = canvasTabs.find(t => t.id === workspaceTabId);
        if (!activeWorkspaceTab) return null;
        return (
          <div
            style={{
              position: 'fixed',
              top: 64,
              left: 0,
              right: 0,
              bottom: 240, // leave tray visible as thumbnails
              background: '#0b1220',
              borderTop: '1px solid #334155',
              borderBottom: '1px solid #334155',
              boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
              zIndex: 9000,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderBottom: '1px solid #334155',
                background: '#0f172a',
              }}
            >
              <div style={{ flex: 1, color: '#e2e8f0', fontWeight: 600, fontSize: 13 }}>
                Workspace: {activeWorkspaceTab.title}
              </div>
              <button
                onClick={() => setWorkspaceTabId(null)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid #334155',
                  background: 'transparent',
                  color: '#94a3b8',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
                title="Close workspace view"
              >
                × Close
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <CanvasEditorV2
                ref={workspaceEditorRef}
                placeholder={`Workspace: ${activeWorkspaceTab.title}`}
                onChange={() => {
                  const json: any = workspaceEditorRef.current?.getContent();
                  setCanvasTabs(prev => prev.map(t => (
                    t.id === activeWorkspaceTab.id ? { ...t, content: json, updatedAt: Date.now() } : t
                  )));
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderTop: '1px solid #334155',
                background: '#0f172a',
              }}
            >
              <button
                onClick={() => {
                  if (workspaceEditorRef.current) {
                    const json: any = workspaceEditorRef.current.getContent();
                    const extractions: { text: string; provenance: ProvenanceData }[] = [];
                    let plainText = '';

                    const extractText = (node: any): string => {
                      if (!node) return '';
                      if (typeof node.text === 'string') return node.text;
                      const children = Array.isArray(node.content) ? node.content : [];
                      return children.map(extractText).join('');
                    };

                    const walk = (node: any, inside: boolean = false) => {
                      if (!node) return;
                      const isComposed = node.type === 'composedContent' && node.attrs?.provenance;
                      if (isComposed) {
                        const text = extractText(node);
                        if (text.trim()) {
                          extractions.push({ text, provenance: node.attrs.provenance as ProvenanceData });
                        }
                      } else if (!inside) {
                        plainText += extractText(node);
                      }

                      const children = Array.isArray(node.content) ? node.content : [];
                      const nextInside = inside || !!isComposed;
                      for (const child of children) walk(child, nextInside);
                    };

                    walk(json);

                    for (const item of extractions) {
                      handleExtractToMainFromCanvas(item.text, item.provenance);
                    }

                    if (plainText.trim()) {
                      const provenance: ProvenanceData = {
                        sessionId: 'canvas',
                        aiTurnId: activeWorkspaceTab.id,
                        providerId: 'canvas',
                        responseType: 'batch',
                        responseIndex: 0,
                        timestamp: Date.now(),
                        granularity: 'full',
                        sourceText: plainText,
                      };
                      handleExtractToMainFromCanvas(plainText, provenance);
                    }
                  }
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid #334155',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
                title="Extract workspace to main canvas"
              >
                ↑ Extract to Main
              </button>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {new Date(activeWorkspaceTab.updatedAt || Date.now()).toLocaleTimeString()}
              </div>
            </div>
          </div>
        );
      })()}

      <SaveDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleSave}
        defaultTitle={generateDefaultTitle(getCurrentContent())}
        isSaving={isSaving}
      />

      <style>{`
        .source-panel,
        .canvas-panel {
          height: 100%;
          border-radius: 8px;
          background-color: #1e293b;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
        }

        .canvas-panel {
          flex-grow: 1;
          position: relative;
        }
      `}</style>
    </div>
  );
};