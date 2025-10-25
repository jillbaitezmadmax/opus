import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core';
import { CanvasEditorV2 } from './CanvasEditorV2';
import { CanvasEditorRef } from './CanvasEditorV2';
import { TurnMessage, AiTurn } from '../../types';
import ComposerToolbar from './ComposerToolbar';
import HorizontalChatRail from './HorizontalChatRail';
import { convertTurnMessagesToChatTurns, ChatTurn, ResponseBlock } from '../../types/chat';
import { DragData, isValidDragData } from '../../types/dragDrop';
import { ProvenanceData } from './extensions/ComposedContentNode';
import ResponseViewer from './ResponseViewer';
import { Granularity } from '../../utils/segmentText';
import { SaveDialog } from './SaveDialog';
import { DocumentManager } from '../../../persistence/DocumentManager';
import { DocumentRecord } from '../../../persistence/types';
import DocumentsHistoryPanel from '../DocumentsHistoryPanel';

interface ComposerModeProps {
  allTurns: TurnMessage[];
  sessionId: string | null;
  onExit: () => void;
  onUpdateAiTurn?: (aiTurnId: string, updates: Partial<AiTurn>) => void;
  documentManager?: DocumentManager;
}

export const ComposerMode: React.FC<ComposerModeProps> = ({
  allTurns,
  sessionId,
  onExit,
  onUpdateAiTurn,
  documentManager
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

  const turns = useMemo(() => convertTurnMessagesToChatTurns(allTurns), [allTurns]);

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
    if (!documentManager || !sessionId) return;
    
    const content = getCurrentContent();
    if (!content.trim() || content === lastSavedContent) return;

    try {
      if (currentDocument) {
        // Update existing document
        await documentManager.saveDocument(currentDocument.id, content);
        setLastSavedContent(content);
      } else {
        // Create new autosave document
        const title = `Autosave - ${generateDefaultTitle(content)}`;
        const newDoc = await documentManager.createDocument({
          title,
          content,
          sessionId,
          type: 'composer',
          isAutosave: true
        });
        setCurrentDocument(newDoc);
        setLastSavedContent(content);
      }
    } catch (error) {
      console.error('Dirty save failed:', error);
    }
  }, [documentManager, sessionId, getCurrentContent, lastSavedContent, currentDocument, generateDefaultTitle]);

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
    if (!documentManager || !sessionId) return;

    setIsSaving(true);
    try {
      const content = getCurrentContent();
      
      if (currentDocument && !currentDocument.isAutosave) {
        // Update existing manual save
        await documentManager.saveDocument(currentDocument.id, content, { title });
      } else {
        // Create new manual save
        const newDoc = await documentManager.createDocument({
          title,
          content,
          sessionId,
          type: 'composer',
          isAutosave: false
        });
        setCurrentDocument(newDoc);
      }
      
      setLastSavedContent(content);
      setIsDirty(false);
      setShowSaveDialog(false);
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [documentManager, sessionId, getCurrentContent, currentDocument]);

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
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } })
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

          const provenance: ProvenanceData = {
            sessionId: sessionId || 'current',
            aiTurnId: dragData.metadata.turnId,
            providerId: dragData.metadata.providerId,
            responseType: 'batch',
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
  }, []);

  const handleTurnSelect = useCallback((index: number) => {
    setCurrentTurnIndex(index);
    setSelectedTurn(turns[index] || null);
    setSelectedResponse(undefined);
  }, [turns]);

  // Handle document selection from history panel
  const handleSelectDocument = useCallback((document: DocumentRecord) => {
    if (editorRef.current && document.canvasContent) {
      editorRef.current.setContent(document.canvasContent);
      setCurrentDocument(document);
      setLastSavedContent(JSON.stringify(document.canvasContent));
      setShowDocumentsPanel(false);
    }
  }, []);

  // Handle new document creation
  const handleNewDocument = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.setContent([]);
      setCurrentDocument(null);
      setLastSavedContent('');
      setShowDocumentsPanel(false);
    }
  }, []);

  // Handle document deletion
  const handleDeleteDocument = useCallback(async (documentId: string) => {
    if (documentManager) {
      try {
        await documentManager.deleteDocument(documentId);
      } catch (error) {
        console.error('Failed to delete document:', error);
      }
    }
  }, [documentManager]);

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

  return (
    <div style={{ height: '100vh', maxHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing: 'border-box', padding: '8px 0', overflowX: 'hidden'}}>
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

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: showDocumentsPanel ? 'minmax(0, 1fr) minmax(0, 1fr) 300px' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, padding: '0 12px', width: '100%' }}>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <ResponseViewer
                turn={selectedTurn || turns[currentTurnIndex] || null}
                response={selectedResponse}
                granularity={granularity}
                onGranularityChange={setGranularity}
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
        <HorizontalChatRail
          turns={turns}
          allTurns={allTurns}
          currentStepIndex={currentTurnIndex}
          onStepSelect={(idx) => handleTurnSelect(idx)}
          onStepHover={(idx) => {
            if (typeof idx === 'number') {
              setCurrentTurnIndex(idx);
              setSelectedTurn(turns[idx] || null);
            }
          }}
          onStepExpand={(idx) => setCurrentTurnIndex(idx)}
          onResponsePick={handleResponsePickFromRail}
        />
      </div>

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