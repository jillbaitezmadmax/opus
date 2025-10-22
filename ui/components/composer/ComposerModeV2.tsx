import React, { useState, useRef, useCallback, useMemo } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { CanvasEditorV2 } from './CanvasEditorV2';
import { TurnMessage, AiTurn } from '../../types';
import ComposerToolbar from './ComposerToolbar';
import SourcePanel from './SourcePanel';
import { convertTurnMessagesToChatTurns, ChatTurn, ResponseBlock } from '../../types/chat';
import { ExpandedTurnOverlay } from './ExpandedTurnOverlay';
import { DragData, isValidDragData } from '../../types/dragDrop';
import { ProvenanceData } from './extensions/ComposedContentNode';

// Import the CanvasEditorRef type from CanvasEditorV2
import { CanvasEditorRef } from './CanvasEditorV2';

interface ComposerModeV2Props {
  allTurns: TurnMessage[];
  sessionId: string | null;
  onExit: () => void;
  onUpdateAiTurn?: (aiTurnId: string, updates: Partial<AiTurn>) => void;
}

export const ComposerModeV2: React.FC<ComposerModeV2Props> = ({
  allTurns,
  sessionId,
  onExit,
  onUpdateAiTurn
}) => {
  const editorRef = useRef<CanvasEditorRef>(null);
  const [activeDragData, setActiveDragData] = useState<any>(null);
  const [selectedTurn, setSelectedTurn] = useState<ChatTurn | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<ResponseBlock | undefined>();
  const [isDragging, setIsDragging] = useState(false);
  const [dragData, setDragData] = useState<any>();
  
  // New state for horizontal timeline and expanded overlay
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [expandedTurnIndex, setExpandedTurnIndex] = useState<number | null>(null);

  const turns = useMemo(() => convertTurnMessagesToChatTurns(allTurns), [allTurns]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = useCallback((event: any) => {
    setActiveDragData(event.active.data.current);
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback((event: any) => {
    const { active, over } = event;
    
    // Handle segment drops to canvas
    if (over?.id === 'canvas-dropzone' && active?.data?.current) {
      const dragData: DragData = active.data.current;
      
      if (isValidDragData(dragData) && dragData.type === 'content_block') {
        const provenance: ProvenanceData = {
          turnId: dragData.metadata.turnId,
          responseId: dragData.metadata.responseId,
          blockId: dragData.metadata.blockId,
          providerId: dragData.metadata.providerId,
          granularity: dragData.metadata.granularity,
          timestamp: new Date().toISOString(),
        };
        
        editorRef.current?.insertComposedContent(
          dragData.content,
          provenance
        );
      }
    }
    
    setActiveDragData(null);
    setIsDragging(false);
  }, []);

  // Timeline navigation handlers
  const handleTurnSelect = useCallback((index: number) => {
    setCurrentTurnIndex(index);
    setSelectedTurn(turns[index] || null);
  }, [turns]);

  const handleTurnExpand = useCallback((index: number) => {
    setExpandedTurnIndex(index);
  }, []);

  const handleCloseExpanded = useCallback(() => {
    setExpandedTurnIndex(null);
  }, []);

  const handleResponseSelect = useCallback((response: ResponseBlock) => {
    setSelectedResponse(response);
  }, []);

  const handleBlockDragStart = useCallback((data: any) => {
    setDragData(data);
    setIsDragging(true);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <ComposerToolbar 
        editorRef={editorRef}
        onExit={onExit}
        isDirty={false}
      />
      
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <PanelGroup direction="horizontal">
            <Panel defaultSize={30} minSize={20} maxSize={50}>
              <SourcePanel
                turns={turns}
                allTurns={allTurns}
                selectedTurn={selectedTurn || undefined}
                selectedResponse={selectedResponse}
                onTurnSelect={(turn: ChatTurn) => {
                  const index = turns.findIndex(t => t.id === turn.id);
                  if (index !== -1) handleTurnSelect(index);
                }}
                onResponseSelect={handleResponseSelect}
                onDragStart={handleBlockDragStart}
                currentTurnIndex={currentTurnIndex}
                onTurnExpand={handleTurnExpand}
              />
            </Panel>
            
            <PanelResizeHandle style={{ width: '2px', background: '#334155' }} />
            
            <Panel defaultSize={70} minSize={50} maxSize={80}>
              <CanvasEditorV2
                ref={editorRef}
                placeholder="Drag content here to compose..."
                onChange={() => {}}
              />
            </Panel>
          </PanelGroup>

          <DragOverlay>
            {isDragging && dragData && (
              <div style={{
                background: '#1e293b',
                border: '1px solid #8b5cf6',
                borderRadius: '8px',
                padding: '12px',
                maxWidth: '300px',
                color: '#e2e8f0',
                fontSize: '13px',
              }}>
                {dragData.text?.substring(0, 100)}...
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Expanded Turn Overlay */}
      {expandedTurnIndex !== null && (
        <ExpandedTurnOverlay
          turn={turns[expandedTurnIndex]}
          turnIndex={expandedTurnIndex}
          totalTurns={turns.length}
          onClose={handleCloseExpanded}
          onNavigate={handleTurnSelect}
        />
      )}

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