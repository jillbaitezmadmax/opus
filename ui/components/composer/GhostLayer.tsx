import { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Ghost } from '../../types';
import { getProviderById } from '../../providers/providerRegistry';

interface GhostLayerProps {
  ghosts: Ghost[];
  onRemoveGhost: (ghostId: string) => void;
}

interface GhostChipProps {
  ghost: Ghost;
  onRemove: () => void;
}

const GhostChip = ({ ghost, onRemove }: GhostChipProps) => {
  const provider = getProviderById(ghost.provenance.providerId);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform, // We will remove the usage of this next
    isDragging,
  } = useDraggable({
    id: `ghost-${ghost.id}`,
    data: { ghost } // The ENTIRE data payload is now just the nested ghost object.
  });

  

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="ghost-chip"
      data-ghost-id={ghost.id}
      title={`${provider?.name || ghost.provenance.providerId} - ${ghost.provenance.responseType}`}
      style={{
        // Keep all the agent's great styling for the chip itself:
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        background: isDragging ? '#1e293b' : '#334155', // This can stay as is
        border: '1px solid #475569',
        borderRadius: '20px',
        color: '#e2e8f0',
        fontSize: '13px',
        fontWeight: 500,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        minWidth: '120px',
        maxWidth: '200px',
        position: 'relative',
        transition: 'all 0.2s ease',

        // ADD THIS LINE to handle the drag opacity correctly:
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {/* Provider indicator */}
      <div
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: provider?.color || '#64748b',
          flexShrink: 0,
        }}
      />
      
      {/* Ghost preview text */}
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {ghost.preview}
      </span>
      
      {/* Pin indicator */}
      {ghost.isPinned && (
        <span
          style={{
            fontSize: '10px',
            color: '#f59e0b',
          }}
        >
          📌
        </span>
      )}
      
      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        style={{
          background: 'none',
          border: 'none',
          color: '#94a3b8',
          cursor: 'pointer',
          padding: '2px',
          fontSize: '12px',
          lineHeight: 1,
          borderRadius: '50%',
          width: '16px',
          height: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        title="Remove ghost"
        aria-label="Remove ghost"
      >
        ×
      </button>
    </div>
  );
};

const GhostLayer = ({ ghosts, onRemoveGhost }: GhostLayerProps) => {
  // Sort ghosts by order, then by creation time
  const sortedGhosts = useMemo(() => {
    return [...ghosts].sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.createdAt - b.createdAt;
    });
  }, [ghosts]);

  if (ghosts.length === 0) {
    return (
      <div
        className="ghost-layer-empty"
        style={{
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          borderTop: '1px solid #334155',
          color: '#64748b',
          fontSize: '14px',
          fontStyle: 'italic',
        }}
      >
        Alt+Click content in the Focus Pane to collect ghosts here
      </div>
    );
  }

  return (
    <div
      className="ghost-layer"
      style={{
        height: '60px',
        background: '#0f172a',
        borderTop: '1px solid #334155',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
    >
      {/* Ghost count indicator */}
      <div
        style={{
          fontSize: '12px',
          color: '#64748b',
          fontWeight: 500,
          marginRight: '8px',
          flexShrink: 0,
        }}
      >
        {ghosts.length} ghost{ghosts.length !== 1 ? 's' : ''}
      </div>
      
      {/* Ghost chips */}
      {sortedGhosts.map((ghost) => (
        <GhostChip
          key={ghost.id}
          ghost={ghost}
          onRemove={() => onRemoveGhost(ghost.id)}
        />
      ))}
    </div>
  );
};

export default GhostLayer;