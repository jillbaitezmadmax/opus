import { useMemo, useCallback, useState, useEffect } from 'react';
import { createEditor, Transforms, Editor, Element as SlateElement, BaseEditor } from 'slate';
import { Slate, Editable, withReact, ReactEditor } from 'slate-react';
import { DndContext, DragEndEvent, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { v4 as uuidv4 } from 'uuid';
import type { AiTurn, TurnMessage, SlateDescendant, GranularUnit, ComposerState, DocumentRecord } from '../../types';
import { extractComposableContent, serializeToPlainText } from '../../utils/composerUtils';
import { useComposerReducer } from '../../hooks/useComposerReducer';
import { enhancedDocumentStore } from '../../services/enhancedDocumentStore';
import ComposerToolbar from './ComposerToolbar';
import SourcePanel from './SourcePanel';
import CanvasEditor from './CanvasEditor';
import GhostLayer from './GhostLayer';

interface ComposerModeProps {
  allTurns: TurnMessage[];
  sessionId: string | null;
  onExit: () => void;
  onUpdateAiTurn?: (aiTurnId: string, updates: Partial<AiTurn>) => void;
}

// Slate plugin for composer-specific behavior
const withComposer = (editor: ReactEditor) => {
  const { insertData, normalizeNode } = editor;
  
  // Handle paste events
  editor.insertData = (data: DataTransfer) => {
    const text = data.getData('text/plain');
    if (text) {
      Transforms.insertText(editor, text);
      return;
    }
    insertData(data);
  };
  
  // Normalize composed nodes
  editor.normalizeNode = (entry) => {
    const [node, path] = entry;
    
    // Ensure composed-content nodes maintain metadata
    if ('type' in node && node.type === 'composed-content') {
      if (!('metadata' in node) || !node.metadata) {
        Transforms.setNodes(
          editor,
          { metadata: { granularity: 'unknown' } },
          { at: path }
        );
      }
    }
    
    normalizeNode(entry);
  };
  
  return editor;
};

const ComposerMode = ({ allTurns, sessionId, onExit, onUpdateAiTurn }: ComposerModeProps) => {
  // State for focused turn in navigation
  const [focusedTurnId, setFocusedTurnId] = useState<string | null>(null);
  
  // Document persistence state
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Find the focused turn or default to the last AI turn
  const focusedTurn = useMemo(() => {
    if (focusedTurnId) {
      const turn = allTurns.find(t => t.id === focusedTurnId);
      if (turn && turn.type === 'ai') return turn as AiTurn;
    }
    // Default to last AI turn
    const lastAiTurn = [...allTurns].reverse().find(t => t.type === 'ai') as AiTurn | undefined;
    return lastAiTurn || null;
  }, [allTurns, focusedTurnId]);

  // State management with useReducer - use focused turn's composer state
  const { state: composerState, actions } = useComposerReducer(focusedTurn?.composerState);
  
  // Document persistence functions
  const saveDocument = useCallback(async () => {
    if (!sessionId || isSaving) return;
    
    setIsSaving(true);
    try {
      const documentId = currentDocumentId || uuidv4();
      const document: DocumentRecord = {
        id: documentId,
        title: `Document ${new Date().toLocaleDateString()}`,
        sourceSessionId: sessionId,
        canvasContent: composerState.content,
        granularity: composerState.granularity,
        isDirty: false,
        createdAt: currentDocumentId ? undefined : new Date().toISOString(),
        lastModified: new Date().toISOString(),
        version: 1,
        blockCount: composerState.content.length,
        refinementHistory: [],
        exportHistory: [],
        snapshots: [],
        _tempStorage: true
      };
      
      await enhancedDocumentStore.saveDocument(document);
      setCurrentDocumentId(documentId);
      actions.markClean();
    } catch (error) {
      console.error('Failed to save document:', error);
    } finally {
      setIsSaving(false);
    }
  }, [sessionId, currentDocumentId, composerState, actions, isSaving]);
  
  const loadDocument = useCallback(async (documentId: string) => {
    try {
      const document = await enhancedDocumentStore.loadDocument(documentId);
      if (document) {
        actions.setContent(document.canvasContent);
        actions.setGranularity(document.granularity);
        setCurrentDocumentId(documentId);
        actions.markClean();
      }
    } catch (error) {
      console.error('Failed to load document:', error);
    }
  }, [actions]);
  
  // Debounced auto-save effect
  useEffect(() => {
    if (!composerState.isDirty || !sessionId || isSaving) return;
    
    const autoSaveTimer = setTimeout(() => {
      saveDocument();
    }, 2000); // Auto-save after 2 seconds of inactivity
    
    return () => clearTimeout(autoSaveTimer);
  }, [composerState.isDirty, composerState.lastModified, sessionId, isSaving, saveDocument]);
  
  // Initialize Slate editor
  const editor = useMemo(() => withComposer(withReact(createEditor())), []);
  
  // Extract composable sources from focused AI turn
  const sources = useMemo(() => focusedTurn ? extractComposableContent(focusedTurn) : [], [focusedTurn]);
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor)
  );
  
  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) return;
    
    const dragData = active.data.current;
    
    if (!dragData) return;
    
    // Handle different drag types
    if (dragData.type === 'content-unit') {
      // New FocusPane drag with provenance
      const { unit, provenance } = dragData;
      
      const newNode: SlateDescendant = {
        type: 'composed-content',
        id: uuidv4(),
        children: [{ text: unit.content }],
        provenance: {
          sessionId: provenance.sessionId,
          aiTurnId: provenance.aiTurnId,
          providerId: provenance.providerId,
          responseType: provenance.responseType,
          responseIndex: provenance.responseIndex,
          textRange: provenance.textRange,
        },
        metadata: {
          granularity: unit.type,
          timestamp: Date.now(),
        },
      };
      
      // Insert at the end of the document
      Transforms.insertNodes(editor, newNode, {
        at: [editor.children.length],
      });
    } else {
      // Legacy drag handling for backward compatibility
      const draggedUnit = dragData as GranularUnit;
      
      const newNode: SlateDescendant = {
        type: 'composed-content',
        sourceId: draggedUnit.sourceId,
        providerId: draggedUnit.providerId,
        children: [{ text: draggedUnit.text }],
        metadata: {
          originalIndex: draggedUnit.index,
          granularity: draggedUnit.type,
          timestamp: Date.now(),
        },
      };
      
      // Insert at the end of the document
      Transforms.insertNodes(editor, newNode, {
        at: [editor.children.length],
      });
    }
    
    // Add a paragraph break after
    Transforms.insertNodes(
      editor,
      { type: 'paragraph', children: [{ text: '' }] },
      { at: [editor.children.length] }
    );
    
    actions.setDirty(true);
  }, [editor, actions]);
  
  // Handle canvas content change
  const handleCanvasChange = useCallback((newContent: SlateDescendant[]) => {
    actions.setCanvasContent(newContent);
  }, [actions]);
  
  // Save composer state
  const handleSave = useCallback(() => {
    if (onUpdateAiTurn && focusedTurn) {
      const stateToSave = {
        ...composerState,
        lastModified: Date.now(),
      };
      
      onUpdateAiTurn(focusedTurn.id, { composerState: stateToSave });
      actions.markSaved();
    }
  }, [composerState, focusedTurn, onUpdateAiTurn, actions]);
  
  // Handle export
  const handleExport = useCallback(async () => {
    const plainText = serializeToPlainText(composerState.canvasContent);
    
    try {
      await navigator.clipboard.writeText(plainText);
      // TODO: Show success notification
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // TODO: Show error notification
    }
    
    // Track export in history
    if (plainText) {
      actions.addExport({
        id: uuidv4(),
        timestamp: Date.now(),
        format: 'text',
        content: plainText,
        metadata: {
          snapshot: plainText.substring(0, 200),
        },
      });
    }
  }, [composerState.canvasContent, actions]);
  
  // Handle refinement (placeholder for Phase 3)
  const handleRefine = useCallback(async () => {
    // TODO: Implement refinement in Phase 3
    console.log('Refinement feature coming in Phase 3');
  }, []);
  
  return (
    <div
      className="composer-mode-container"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#0f172a',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ComposerToolbar
        granularity={composerState.granularity}
        onGranularityChange={actions.setGranularity}
        onExit={onExit}
        onSave={saveDocument}
        onExport={handleExport}
        isDirty={composerState.isDirty}
        isSaving={isSaving}
      />
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div
          className="composer-split-view"
          style={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
            gap: '16px',
            padding: '16px',
          }}
        >
          <SourcePanel
            allTurns={allTurns}
            focusedTurnId={focusedTurnId}
            onFocusedTurnChange={setFocusedTurnId}
            sources={sources}
            granularity={composerState.granularity}
            sessionId={sessionId}
            onAddGhost={actions.addGhost}
          />
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <CanvasEditor
              editor={editor}
              value={composerState.canvasContent}
              onChange={handleCanvasChange}
              onRefine={handleRefine}
            />
            
            <GhostLayer
              ghosts={composerState.ghosts}
              onRemoveGhost={actions.removeGhost}
            />
          </div>
        </div>
      </DndContext>
    </div>
  );
};

export default ComposerMode;
