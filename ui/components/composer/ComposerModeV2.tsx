import React, { useState, useRef, useCallback, useMemo } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { CanvasEditorV2 } from './CanvasEditorV2';
import { TurnMessage, AiTurn } from '../../types';
import ComposerToolbar from './ComposerToolbar';
import SourcePanel from './SourcePanel';
import { convertTurnMessagesToChatTurns, ChatTurn, ResponseBlock } from '../../types/chat';

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

  const turns = useMemo(() => convertTurnMessagesToChatTurns(allTurns), [allTurns]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = useCallback((event: any) => {
    setActiveDragData(event.active.data.current);
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setActiveDragData(null);
    setIsDragging(false);
  }, []);

  const handleTurnSelect = useCallback((turn: ChatTurn) => {
    setSelectedTurn(turn);
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
                onTurnSelect={handleTurnSelect}
                onResponseSelect={handleResponseSelect}
                onDragStart={handleBlockDragStart}
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