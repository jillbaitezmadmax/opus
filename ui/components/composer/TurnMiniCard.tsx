import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useDraggable } from '@dnd-kit/core';
import { TurnMessage, AiTurn } from '../../types';
import { extractComposableContent } from '../../utils/composerUtils';

interface TurnMiniCardProps {
  turn: TurnMessage;
  isFocused: boolean;
  isVisible: boolean; // Only render 2-3 turns in either direction
  onClick: () => void;
  onBlockDragStart: (data: any) => void;
}

export const TurnMiniCard: React.FC<TurnMiniCardProps> = ({
  turn,
  isFocused,
  isVisible,
  onClick,
  onBlockDragStart,
}) => {
  // Extract up to 5 blocks from this turn
  const blocks = useMemo(() => {
    if (turn.type !== 'ai') return [];
    const sources = extractComposableContent(turn as AiTurn);
    return sources
      .filter((s: any) => s.type !== 'hidden')
      .slice(0, 5) as Array<{
        id: string;
        providerId: string;
        content: string;
        type: 'batch' | 'synthesis' | 'ensemble';
      }>;
  }, [turn]);

  return (
    <motion.div
      className="turn-mini-card"
      onClick={onClick}
      animate={{
        scale: isFocused ? 1.05 : 1,
        opacity: isVisible ? 1 : 0.4,
      }}
      transition={{ duration: 0.2 }}
      style={{
        padding: '8px',
        margin: '8px 0',
        background: isFocused ? '#1e293b' : '#0f172a',
        border: isFocused ? '2px solid #8b5cf6' : '1px solid #334155',
        borderRadius: '8px',
        cursor: 'pointer',
      }}
    >
      {/* Turn header */}
      <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>
        Turn {turn.id} • {blocks.length} blocks
      </div>

      {/* Mini blocks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {blocks.map((block, idx) => (
          <MiniBlock
            key={idx}
            block={block}
            isFocused={isFocused}
            onDragStart={onBlockDragStart}
          />
        ))}
      </div>
    </motion.div>
  );
};

interface MiniBlockProps {
  block: {
    id: string;
    providerId: string;
    content: string;
    type: 'batch' | 'synthesis' | 'ensemble';
  };
  isFocused: boolean;
  onDragStart: (data: any) => void;
}

const MiniBlock: React.FC<MiniBlockProps> = ({ block, isFocused, onDragStart }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `mini-${block.id}`,
    data: {
      type: 'composer-block',
      text: block.content,
      provenance: {
        providerId: block.providerId,
        responseType: block.type,
        granularity: 'full',
        timestamp: Date.now(),
      },
    },
  });

  const getProviderColor = (providerId: string) => {
    const colors: Record<string, string> = {
      'openai': '#10a37f',
      'anthropic': '#8b5cf6',
      'google': '#4285f4',
      'xai': '#ff6b35',
      'alibaba': '#ff6a00',
    };
    return colors[providerId] || '#6b7280';
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        padding: '4px 6px',
        background: '#1e293b',
        borderLeft: `2px solid ${getProviderColor(block.providerId)}`,
        borderRadius: '3px',
        fontSize: '9px',
        color: '#94a3b8',
        cursor: 'grab',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
      }}
    >
      {/* Truncated content (first 30 chars) */}
      {block.content.slice(0, 30)}...
      
      {/* Hover tooltip */}
      {isHovered && isFocused && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            position: 'absolute',
            left: '100%',
            top: 0,
            marginLeft: '8px',
            background: '#1e293b',
            border: '1px solid #475569',
            borderRadius: '6px',
            padding: '8px',
            minWidth: '200px',
            maxWidth: '300px',
            fontSize: '11px',
            color: '#e2e8f0',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            whiteSpace: 'normal',
            lineHeight: '1.4',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px', color: getProviderColor(block.providerId) }}>
            {block.providerId}
          </div>
          {block.content.slice(0, 200)}...
        </motion.div>
      )}
    </div>
  );
};