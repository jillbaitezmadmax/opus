import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core';
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

  const turns = useMemo(() => convertTurnMessagesToChatTurns(allTurns), [allTurns]);

  // Load pinned ghosts when document changes
  useEffect(() => {
    const loadGhosts = async () => {
      if (!PERSISTENCE_FEATURE_FLAGS.ENABLE_GHOST_RAIL) {
        return;
      }
      
      const documentId = currentDocument?.id || 'scratch';
      try {
        const ghosts = await enhancedDocumentStore.getDocumentGhosts(documentId);
        setPinnedGhosts(ghosts || []);
      } catch (error) {
        console.warn('[ComposerMode] Failed to load ghosts, using in-memory fallback:', error);
        // Graceful fallback - keep in-memory pins
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
    }
  }, []);

  const handleDragEnd = useCallback((event: any) => {
    const { active, over } = event;

    if (over?.id === 'canvas-dropzone' && active?.data?.current) {
      const payload = active.data.current;

      if (payload?.type === 'composer-block' && payload?.text && payload?.provenance) {
        const prov: ProvenanceData = {
          ...payload.provenance,
          timestamp: typeof payload.provenance.timestamp === 'number' ? payload.provenance.timestamp : Date.now(),
        };
        editorRef.current?.insertComposedContent(payload.text, prov);
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
          const provenance: ProvenanceData = {
            sessionId: sessionId || 'current',
            aiTurnId: dragData.metadata.turnId,
            providerId: providerIdFull,
            responseType,
            responseIndex: 0,
            timestamp: Date.now(),
            granularity: mapGranularity(dragData.metadata.granularity),
            sourceText: dragData.content,
            sourceContext: dragData.metadata.sourceContext ? { fullResponse: dragData.metadata.sourceContext.fullResponse } : undefined,
          } as ProvenanceData;

          editorRef.current?.insertComposedContent(
            dragData.content,
            provenance
          );
        }
      }
    }

    setActiveDragData(null);
    setIsDragging(false);
    setDragStartCoordinates(null);
  }, [sessionId]);

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
          setPinnedGhosts(prev => [...prev, { ...ghostData, id: persistedGhost.id || ghostData.id }]);
          return;
        }
      } catch (error) {
        console.warn('[ComposerMode] Failed to persist ghost, using in-memory:', error);
      }
    }
    
    // Fallback to in-memory
    setPinnedGhosts(prev => [...prev, ghostData]);
  }, [currentDocument?.id, ghostIdCounter]);

  // Handle unpinning a ghost
  const handleUnpinGhost = useCallback(async (ghostId: string) => {
    // Try to delete from persistence if enabled
    if (PERSISTENCE_FEATURE_FLAGS.ENABLE_GHOST_RAIL) {
      try {
        await enhancedDocumentStore.deleteGhost(ghostId);
      } catch (error) {
        console.warn('[ComposerMode] Failed to delete ghost from persistence:', error);
      }
    }
    
    // Remove from local state
    setPinnedGhosts(prev => prev.filter(g => g.id !== ghostId));
  }, []);

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

  // Handle click-to-jump from composed blocks
  useEffect(() => {
    const handleBlockClick = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { provenance } = customEvent.detail || {};
      
      if (provenance?.aiTurnId) {
        // Find turn index by aiTurnId
        const turnIndex = turns.findIndex(t => t.id === provenance.aiTurnId);
        if (turnIndex !== -1) {
          setCurrentTurnIndex(turnIndex);
          setSelectedTurn(turns[turnIndex]);
          
          // Find and select the response
          const turn = turns[turnIndex];
          if (turn.type === 'ai') {
            const response = turn.responses?.find(r => r.providerId === provenance.providerId);
            if (response) {
              setSelectedResponse(response);
            }
          }
          
          // Expand reference zone if collapsed
          if (isReferenceCollapsed) {
            setIsReferenceCollapsed(false);
          }
        }
      }
    };
    
    document.addEventListener('composer-block-click', handleBlockClick);
    return () => document.removeEventListener('composer-block-click', handleBlockClick);
  }, [turns, isReferenceCollapsed]);

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