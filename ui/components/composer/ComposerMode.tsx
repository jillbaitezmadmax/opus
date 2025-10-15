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
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [lastSaved, setLastSaved] = useState<number>(0);
  
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
        canvasContent: composerState.canvasContent,
        granularity: composerState.granularity,
        isDirty: false,
        createdAt: currentDocumentId ? Date.now() : Date.now(),
        lastModified: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        blockCount: composerState.canvasContent.length,
        refinementHistory: [],
        exportHistory: [],
        snapshots: [],
        _tempStorage: false
      };
      
      await enhancedDocumentStore.saveDocument(document);
      setCurrentDocumentId(documentId);
      actions.markSaved();
      setLastSaved(Date.now());
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
        actions.setCanvasContent(document.canvasContent as any);
        actions.setGranularity(document.granularity);
        setCurrentDocumentId(document.id);
        actions.markSaved();
      }
    } catch (error) {
      console.error('Failed to load document:', error);
    }
  }, [actions]);

  // Document initialization effect
  useEffect(() => {
    const initDocument = async () => {
      setIsLoadingDoc(true);
      try {
        if (focusedTurn?.composerState?.documentId) {
          const doc = await enhancedDocumentStore.loadDocument(focusedTurn.composerState.documentId);
          if (doc) {
            actions.setCanvasContent(doc.canvasContent as any);
            actions.setGranularity(doc.granularity);
            setCurrentDocumentId(doc.id);
            actions.markSaved();
            // Load existing ghosts for this document
            try {
              const ghosts = await enhancedDocumentStore.getDocumentGhosts(doc.id);
              (ghosts || []).forEach((g: any) => actions.addGhost(g));
            } catch {}
            setIsLoadingDoc(false);
            return;
          }
        }

        // No document exists - create new one
        const newDoc = await enhancedDocumentStore.createDocument(
          `Composition from ${new Date().toLocaleDateString()}`,
          sessionId || undefined,
          [{ type: 'paragraph', children: [{ text: '' }] }]
        );
        setCurrentDocumentId(newDoc.id);

        // Link document ID back to the focused AI turn
        if (onUpdateAiTurn && focusedTurn) {
          const defaultComposerState: ComposerState = {
            canvasContent: [{ type: 'paragraph', children: [{ text: '' }] }],
            granularity: 'paragraph',
            sourceMap: {},
            isDirty: false,
            createdAt: Date.now(),
            lastModified: Date.now(),
            refinementHistory: [],
            exportHistory: [],
            ghosts: [],
            content: [{ type: 'paragraph', children: [{ text: '' }] }]
          };
          
          onUpdateAiTurn(focusedTurn.id, {
            composerState: {
              ...defaultComposerState,
              ...(focusedTurn.composerState || {}),
              documentId: newDoc.id
            }
          });
        }
      } catch (error) {
        console.error('[Composer] Document init failed:', error);
      } finally {
        setIsLoadingDoc(false);
      }
    };

    initDocument();
  }, [focusedTurn?.id, sessionId]);
  
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

    // Handle ghost drag from GhostLayer
    if (dragData?.ghost) {
      const ghost = dragData.ghost as any; // Ghost
      const newNode: SlateDescendant = {
        type: 'composed-content',
        children: [{ text: ghost.text }],
        provenance: ghost.provenance,
        metadata: {
          granularity: 'full',
          timestamp: Date.now()
        }
      } as any;
      Transforms.insertNodes(editor, newNode, { at: [editor.children.length] });
      actions.setDirty(true);
      return;
    }

    // Handle unit drag from FocusPane with provenance
    if (dragData?.unit && dragData?.provenance) {
      const { unit, provenance } = dragData as any;
      const newNode: SlateDescendant = {
        type: 'composed-content',
        children: [{ text: unit.text }],
        provenance,
        metadata: {
          granularity: unit.type,
          timestamp: Date.now()
        }
      } as any;
      Transforms.insertNodes(editor, newNode, { at: [editor.children.length] });
      actions.setDirty(true);
      return;
    }
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
      {isLoadingDoc && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#e2e8f0',
          fontSize: '16px'
        }}>
          Loading document...
        </div>
      )}
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
            granularity={composerState.granularity}
            sessionId={sessionId}
            onAddGhost={(ghostData) => {
              // Compute order based on existing ghosts
              const ghost = {
                ...ghostData,
                order: composerState.ghosts.length
              } as any;
              actions.addGhost(ghost);
            }}
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
