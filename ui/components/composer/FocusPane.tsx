import { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { v4 as uuidv4 } from 'uuid';
import type { AiTurn, GranularUnit, Ghost } from '../../types';
import { extractComposableContent, parseIntoGranularUnits } from '../../utils/composerUtils';
import { getProviderById } from '../../providers/providerRegistry';

interface FocusPaneProps {
  turn: AiTurn | null;
  granularity: 'full' | 'paragraph' | 'sentence';
  sessionId: string | null;
  onAddGhost: (ghostData: Omit<Ghost, 'order'>) => void;
}

interface DraggableUnitProps {
  unit: GranularUnit;
  provenance: {
    sessionId: string;
    aiTurnId: string;
    providerId: string;
    responseType: 'batch' | 'synthesis' | 'ensemble' | 'hidden';
    responseIndex: number;
    textRange?: [number, number];
  };
  onAltClick?: () => void;
}

const DraggableUnit: React.FC<DraggableUnitProps> = ({ unit, provenance, onAltClick }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: unit.id,
    data: { 
      unit, 
      provenance,
      // Include all necessary data for drag operations
      sessionId: provenance.sessionId,
      aiTurnId: provenance.aiTurnId,
      providerId: provenance.providerId,
      responseType: provenance.responseType,
      responseIndex: provenance.responseIndex,
      textRange: provenance.textRange,
      text: unit.text,
    }
  });
  
  const provider = getProviderById(unit.providerId);
  
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (e.altKey && onAltClick) {
          e.preventDefault();
          onAltClick();
        }
      }}
      style={{
        padding: '10px',
        background: isDragging ? '#334155' : '#1e293b',
        border: '1px solid',
        borderColor: isDragging ? '#8b5cf6' : '#334155',
        borderRadius: '6px',
        cursor: 'grab',
        marginBottom: '8px',
        opacity: isDragging ? 0.5 : 1,
        transition: 'all 0.2s ease'
      }}
    >
      <div style={{ 
        fontSize: '10px', 
        color: '#94a3b8',
        marginBottom: '6px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        {provider && (
          <div className={`model-logo ${provider.logoBgClass}`} 
               style={{ width: '10px', height: '10px', borderRadius: '2px' }} />
        )}
        <span>{provider?.name || unit.providerId}</span>
        <span>•</span>
        <span>{unit.type}</span>
      </div>
      
      <div style={{
        fontSize: '13px',
        color: '#e2e8f0',
        lineHeight: '1.5',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}>
        {unit.text}
      </div>
      
      <div style={{
        marginTop: '6px',
        fontSize: '10px',
        color: '#64748b',
        textAlign: 'center'
      }}>
        Drag to canvas • Alt+Click to collect
      </div>
    </div>
  );
};

const FocusPane: React.FC<FocusPaneProps> = ({ turn, granularity, sessionId, onAddGhost }) => {
  const sources = useMemo(() => 
    turn ? extractComposableContent(turn) : []
  , [turn]);
  
  const units = useMemo(() => {
    if (!turn) return [];
    
    return sources.flatMap(source => 
      parseIntoGranularUnits(source.content, granularity, source.id, source.providerId)
        .map(unit => ({
          unit,
          provenance: {
            sessionId: sessionId || '',
            aiTurnId: turn.id,
            providerId: unit.providerId,
            responseType: source.type,
            responseIndex: 0, // TODO: Extract from source ID if synthesis/ensemble
            textRange: undefined
          }
        }))
    );
  }, [sources, granularity, turn, sessionId]);

  // Handle Alt+Click ghost collection
  const handleGhostCollection = (unit: GranularUnit, provenance: any) => {
    const ghostData: Omit<Ghost, 'order'> = {
      id: uuidv4(),
      text: unit.text,
      preview: unit.text.length > 200 ? unit.text.substring(0, 200) + '...' : unit.text,
      provenance,
      createdAt: Date.now(),
      isPinned: false,
    };
    onAddGhost(ghostData);
  };
  
  if (!turn) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
        Select a turn from the timeline
      </div>
    );
  }
  
  return (
    <div style={{ 
      flex: 1, 
      overflowY: 'auto', 
      padding: '12px',
      background: '#0f172a',
      borderRadius: '8px'
    }}>
      <div style={{
        marginBottom: '12px',
        fontSize: '14px',
        fontWeight: 600,
        color: '#e2e8f0'
      }}>
        {sources.length} source{sources.length !== 1 ? 's' : ''} • {units.length} unit{units.length !== 1 ? 's' : ''}
      </div>
      
      {units.map(({ unit, provenance }) => (
        <DraggableUnit
          key={unit.id}
          unit={unit}
          provenance={provenance}
          onAltClick={() => handleGhostCollection(unit, provenance)}
        />
      ))}
    </div>
  );
};

export default FocusPane;