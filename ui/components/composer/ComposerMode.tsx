import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor, pointerWithin } from '@dnd-kit/core';
 import { CanvasEditorV2 } from './CanvasEditorV2';
 import { CanvasEditorRef } from './CanvasEditorV2';
 import { TurnMessage, AiTurn } from '../../types';
 import ComposerToolbar from './ComposerToolbar';
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
import { CanvasTabData } from '../../types';
import { JSONContent } from '@tiptap/react';

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
  const [canvasTabs, setCanvasTabs] = useState<CanvasTabData[]>(() => {
    const now = Date.now();
    return [0,1,2].map((i) => ({
      id: `canvas-${now}-${i+1}`,
      title: `Canvas ${i+1}`,
      content: { type: 'doc', content: [] },
      createdAt: now,
      updatedAt: now,
    }));
  });
  const [activeCanvasId, setActiveCanvasId] = useState<string>(
    () => (canvasTabs[0]?.id) || ''
  );
  const [showCanvasTray, setShowCanvasTray] = useState(true);
  const turnsRef = useRef<ChatTurn[]>([]);
  const isRefCollapsedRef = useRef<boolean>(false);
  const [refZoneMode, setRefZoneMode] = useState<'default' | 'canvas-focused' | 'expanded'>('default');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clearResetTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);
  const handleReferenceHover = useCallback(() => {
    clearResetTimeout();
    if (!isReferenceCollapsed) setRefZoneMode('expanded');
  }, [clearResetTimeout, isReferenceCollapsed]);
  const handleReferenceLeave = useCallback(() => {
    clearResetTimeout();
    timeoutRef.current = setTimeout(() => setRefZoneMode('default'), 2000);
  }, [clearResetTimeout]);
  const handleCanvasFocus = useCallback(() => {
    clearResetTimeout();
    setRefZoneMode('canvas-focused');
  }, [clearResetTimeout]);
  const handleCanvasBlur = useCallback(() => {
    clearResetTimeout();
    timeoutRef.current = setTimeout(() => setRefZoneMode('default'), 2000);
  }, [clearResetTimeout]);
  useEffect(() => { try { console.log('refZoneMode:', refZoneMode); } catch {} }, [refZoneMode]);

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
          canvasTabs,
          activeTabId: activeCanvasId,
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
          nodes as any,
          canvasTabs,
          activeCanvasId
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
          canvasTabs,
          activeTabId: activeCanvasId,
          lastModified: now,
          updatedAt: now,
        } as DocumentRecord;
        await enhancedDocumentStore.saveDocument(updatedDoc);
      } else {
        // Create new document via enhanced store
        const newDoc = await enhancedDocumentStore.createDocument(
          title || generateDefaultTitle(content),
          sessionId || undefined,
          nodes as any,
          canvasTabs,
          activeCanvasId
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
  const handleContentChange = useCallback((json: JSONContent) => {
    setCanvasTabs(prev => prev.map(tab =>
      tab.id === activeCanvasId ? { ...tab, content: json, updatedAt: Date.now() } : tab
    ));
    // Debounce the dirty check
    setTimeout(() => { checkIfDirty(); }, 100);
  }, [activeCanvasId, checkIfDirty]);

  // Sync main editor content when switching active canvas tab
  useEffect(() => {
    const active = canvasTabs.find(t => t.id === activeCanvasId);
    if (active && editorRef.current) {
      editorRef.current.setContent(active.content);
    }
  }, [activeCanvasId]);

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
    if (!editorRef.current) return;
    const raw = document.canvasContent as any;
    const normalized = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const docJson = Array.isArray(normalized) ? { type: 'doc', content: normalized } : normalized;

    // If the document has tabs, load them and set active tab
    const tabs = Array.isArray(document.canvasTabs) ? (document.canvasTabs as CanvasTabData[]) : null;
    if (tabs && tabs.length > 0) {
      setCanvasTabs(tabs);
      const nextActiveId = document.activeTabId || tabs[0].id;
      setActiveCanvasId(nextActiveId);
      const activeTab = tabs.find(t => t.id === nextActiveId);
      const activeContent = activeTab?.content || docJson;
      editorRef.current.setContent?.(activeContent as any);
      setLastSavedContent(JSON.stringify(activeContent));
    } else {
      // No tabs stored; use main document content and update first tab locally
      editorRef.current.setContent?.(docJson as any);
      setCanvasTabs(prev => prev.map((t, i) => i === 0 ? { ...t, content: docJson, updatedAt: Date.now() } : t));
      setLastSavedContent(JSON.stringify(docJson));
    }
    setCurrentDocument(document);
    setShowDocumentsPanel(false);
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
      const json = editorRef.current.getContent();
      setCanvasTabs(prev => prev.map(tab =>
        tab.id === activeCanvasId ? { ...tab, content: json, updatedAt: Date.now() } : tab
      ));
    }
  }, [activeCanvasId]);

  // Handle canvas tabs change
  const handleCanvasTabsChange = useCallback((tabs: CanvasTabData[]) => {
    setCanvasTabs(tabs);
    if (!tabs.some(t => t.id === activeCanvasId)) {
      setActiveCanvasId(tabs[0]?.id || '');
    }
    // Persist canvas tabs to document record (metadata only)
    if (currentDocument) {
      const now = Date.now();
      const updatedDoc: DocumentRecord = {
        ...currentDocument,
        canvasTabs: tabs as any,
        activeTabId: tabs.some(t => t.id === activeCanvasId) ? activeCanvasId : (tabs[0]?.id || ''),
        lastModified: now,
        updatedAt: now,
      } as DocumentRecord;
      enhancedDocumentStore.saveDocument(updatedDoc)
        .then(() => setCurrentDocument(updatedDoc))
        .catch(err => console.warn('[ComposerMode] Failed to persist canvas tabs:', err));
    }
  }, [activeCanvasId, currentDocument]);

  // Handle extract to canvas from ResponseViewer
  const handleExtractToCanvas = useCallback((text: string, provenance: ProvenanceData) => {
    if (editorRef.current) {
      editorRef.current.insertComposedContent(text, provenance);
      const json = editorRef.current.getContent();
      setCanvasTabs(prev => prev.map(tab =>
        tab.id === activeCanvasId ? { ...tab, content: json, updatedAt: Date.now() } : tab
      ));
    }
  }, [activeCanvasId]);

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
        // Removed flash tick; width transitions now controlled purely by refZoneMode
        try { console.log('[ComposerMode] navigation applied', { turnIndex, aiTurnId, providerIdFull }); } catch {}
      } else {
        try { console.warn('[ComposerMode] No matching turn for aiTurnId', { aiTurnId }); } catch {}
      }
    };
    document.addEventListener('composer-block-click', handleBlockClick);
    return () => document.removeEventListener('composer-block-click', handleBlockClick);
  }, []);

  // Removed full-screen workspace overlay behavior; canvas tray is inline only

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
            display: 'flex',
            flexDirection: 'row',
            gap: 0,
            width: '100%',
            boxSizing: 'border-box',
            overflow: 'hidden'
          }}>
            {(() => {
              const refPct = refZoneMode === 'expanded' ? 50 : refZoneMode === 'canvas-focused' ? 30 : 40;
              const docPx = showDocumentsPanel ? 280 : 0;
              const refWidth = isReferenceCollapsed ? '40px' : `${refPct}%`;
              const canvasWidth = isReferenceCollapsed
                ? `calc(100% - ${docPx}px - 40px)`
                : `calc(100% - ${docPx}px - ${refPct}%)`;
              return (
                <>
                  <div
                    style={{
                      minWidth: 0,
                      overflow: 'hidden',
                      margin: 0,
                      flex: `0 0 ${refWidth}`,
                      width: refWidth,
                      transition: 'width 250ms ease'
                    }}
                    onMouseEnter={handleReferenceHover}
                    onMouseLeave={handleReferenceLeave}
                  >
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
              />
                  </div>
                  <div
                    style={{
                      minWidth: 0,
                      overflow: 'hidden',
                      margin: 0,
                      flex: `0 0 ${canvasWidth}`,
                      width: canvasWidth,
                      transition: 'width 250ms ease'
                    }}
                    onMouseEnter={handleCanvasFocus}
                    onMouseLeave={handleCanvasBlur}
                    onClick={handleCanvasFocus}
                    onFocus={handleCanvasFocus}
                    onBlur={handleCanvasBlur}
                    tabIndex={0}
                  >
              <CanvasEditorV2
                ref={editorRef}
                placeholder="Drag content here to compose..."
                onChange={handleContentChange}
                onInteraction={handleCanvasFocus}
              />
                  </div>
                </>
              );
            })()}
            {showDocumentsPanel && (
              <div style={{ minWidth: 0, overflow: 'hidden', width: '280px', flex: '0 0 280px', margin: 0 }}>
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
          tabs={canvasTabs}
          activeTabId={activeCanvasId}
          onActivateTab={setActiveCanvasId}
          onTabsChange={handleCanvasTabsChange}
        />
      )}

      {/* Full Canvas Workspace Overlay removed; inline CanvasTray is used */}

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