import React, { useState, useRef, useCallback, useMemo } from 'react';
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
  onUpdateAiTurn
}) => {
  const editorRef = useRef<CanvasEditorRef>(null);
  const [activeDragData, setActiveDragData] = useState<any>(null);
  const [selectedTurn, setSelectedTurn] = useState<ChatTurn | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<ResponseBlock | undefined>();
  const [isDragging, setIsDragging] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>('paragraph');

  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);

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
  }, []);

  const handleTurnSelect = useCallback((index: number) => {
    setCurrentTurnIndex(index);
    setSelectedTurn(turns[index] || null);
    setSelectedResponse(undefined);
  }, [turns]);

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
        onExit={onExit}
        isDirty={false}
      />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, padding: '0 12px', width: '100%' }}>
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
                onChange={() => {}}
              />
            </div>
          </div>

          <DragOverlay>
            {isDragging && activeDragData && (
              <div style={{
                background: '#1e293b',
                border: '1px solid #8b5cf6',
                borderRadius: '8px',
                padding: '12px',
                maxWidth: '300px',
                color: '#e2e8f0',
                fontSize: '13px',
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