import React, { useState, useRef, useEffect } from 'react';
import { ChatTurn } from '../../types/chat';

interface TurnCardProps {
  turn: ChatTurn;
  isActive: boolean;
  isMini?: boolean;
  onClick: () => void;
  onHoverExpand?: () => void;
}

const getProviderColor = (providerId: string): string => {
  const colors: Record<string, string> = {
    'openai': '#10a37f',
    'anthropic': '#8b5cf6',
    'claude': '#8b5cf6',
    'google': '#4285f4',
    'xai': '#ff6b35',
  };
  return colors[providerId?.replace('-synthesis', '').replace('-mapping', '')] || '#6b7280';
};

export const TurnCard: React.FC<TurnCardProps> = ({ 
  turn, 
  isActive, 
  isMini = false, 
  onClick, 
  onHoverExpand 
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const displayContent = turn.type === 'user' 
    ? turn.content 
    : turn.responses[0]?.content || turn.content;
  
  const truncated = displayContent.length > (isMini ? 60 : 120)
    ? displayContent.substring(0, isMini ? 60 : 120) + '...'
    : displayContent;

  const handleMouseEnter = () => {
    setIsHovering(true);
    if (onHoverExpand && !isMini) {
      hoverTimeoutRef.current = setTimeout(() => {
        onHoverExpand();
      }, 800); // 800ms delay before auto-expand
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        minWidth: isMini ? '200px' : '300px',
        maxWidth: isMini ? '200px' : '300px',
        background: isActive ? '#2d3748' : '#1e293b',
        border: `2px solid ${isActive ? '#8b5cf6' : '#334155'}`,
        borderRadius: '12px',
        padding: isMini ? '12px' : '16px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        opacity: isMini ? 0.7 : 1,
        transform: isMini ? 'scale(0.9)' : isHovering ? 'translateY(-4px) scale(1.02)' : 'scale(1)',
        boxShadow: isActive 
          ? '0 4px 12px rgba(139, 92, 246, 0.3)' 
          : isHovering && !isMini
          ? '0 8px 20px rgba(139, 92, 246, 0.4)'
          : '0 2px 4px rgba(0, 0, 0, 0.2)',
        position: 'relative'
      }}
    >
      {isHovering && !isMini && (
        <div style={{
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          background: '#8b5cf6',
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          boxShadow: '0 2px 8px rgba(139, 92, 246, 0.6)'
        }}>
          🔍
        </div>
      )}
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{
          width: isMini ? '20px' : '24px',
          height: isMini ? '20px' : '24px',
          borderRadius: '6px',
          background: turn.type === 'user' ? '#3b82f6' : getProviderColor(turn.providerId || 'default'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isMini ? '10px' : '12px'
        }}>
          {turn.type === 'user' ? '👤' : '🤖'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: isMini ? '10px' : '12px', color: '#94a3b8', fontWeight: 600 }}>
            {turn.type === 'user' ? 'User' : turn.providerId || 'AI'}
          </div>
          {!isMini && (
            <div style={{ fontSize: '10px', color: '#64748b' }}>
              {new Date(turn.timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>
        {turn.type === 'ai' && turn.responses.length > 1 && !isMini && (
          <div style={{
            fontSize: '10px',
            background: '#334155',
            padding: '2px 6px',
            borderRadius: '4px',
            color: '#94a3b8'
          }}>
            {turn.responses.length} responses
          </div>
        )}
      </div>
      
      <div style={{
        fontSize: isMini ? '11px' : '13px',
        color: '#e2e8f0',
        lineHeight: '1.4',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: isMini ? 'nowrap' : 'normal',
        display: '-webkit-box',
        WebkitLineClamp: isMini ? 2 : 3,
        WebkitBoxOrient: 'vertical'
      }}>
        {truncated}
      </div>
    </div>
  );
};