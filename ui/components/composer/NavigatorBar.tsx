import React, { useRef, useEffect, useState } from 'react';
import type { ChatTurn } from '../../types/chat';
import { getProviderById } from '../../providers/providerRegistry';

interface NavigatorBarProps {
  turns: ChatTurn[];
  currentTurnIndex: number;
  onSelectTurn: (index: number) => void;
  onPinAll?: () => void;
}

export const NavigatorBar: React.FC<NavigatorBarProps> = ({
  turns,
  currentTurnIndex,
  onSelectTurn,
  onPinAll,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  // Auto-scroll to current turn
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const activeChip = container.querySelector(`[data-turn-index="${currentTurnIndex}"]`);
      if (activeChip) {
        activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentTurnIndex]);

  // Update fade indicators on scroll
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowLeftFade(scrollLeft > 0);
      setShowRightFade(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      handleScroll();
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [turns]);

  const getTurnLabel = (turn: ChatTurn, index: number): string => {
    if (turn.type === 'user') {
      return `Q${index + 1}`;
    }
    // For AI turns, show provider count
    const providerCount = turn.responses?.length || 0;
    return providerCount > 1 ? `A${index + 1} (${providerCount})` : `A${index + 1}`;
  };

  const getTurnPreview = (turn: ChatTurn): string => {
    if (turn.type === 'user') {
      return turn.content?.substring(0, 50) || 'User message';
    }
    const primaryResponse = turn.responses?.[0];
    return primaryResponse?.content?.substring(0, 50) || 'AI response';
  };

  const getProviderColors = (turn: ChatTurn): string[] => {
    if (turn.type === 'user') return ['#64748b'];
    return (turn.responses || []).map(r => {
      const provider = getProviderById(r.providerId);
      return provider?.color || '#8b5cf6';
    });
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '60px',
        background: '#0f172a',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: '12px',
      }}
    >
      {/* Pin All Button */}
      {onPinAll && (
        <button
          onClick={onPinAll}
          style={{
            flexShrink: 0,
            padding: '6px 12px',
            background: '#334155',
            border: '1px solid #475569',
            borderRadius: '6px',
            color: '#94a3b8',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#475569';
            e.currentTarget.style.color = '#e2e8f0';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#334155';
            e.currentTarget.style.color = '#94a3b8';
          }}
          title="Pin all segments from current turn"
        >
          <span style={{ fontSize: '14px' }}>📌</span>
          Pin All
        </button>
      )}

      {/* Left Fade Indicator */}
      {showLeftFade && (
        <div
          style={{
            position: 'absolute',
            left: onPinAll ? '100px' : '12px',
            top: 0,
            bottom: 0,
            width: '40px',
            background: 'linear-gradient(to right, #0f172a, transparent)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* Turn Chips Container */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollBehavior: 'smooth',
          padding: '8px 0',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        className="hide-scrollbar"
      >
        {turns.map((turn, index) => {
          const isActive = index === currentTurnIndex;
          const colors = getProviderColors(turn);
          const label = getTurnLabel(turn, index);
          const preview = getTurnPreview(turn);

          return (
            <button
              key={turn.id}
              data-turn-index={index}
              onClick={() => onSelectTurn(index)}
              style={{
                flexShrink: 0,
                minWidth: '80px',
                padding: '8px 12px',
                background: isActive ? '#1e293b' : '#0f172a',
                border: '1px solid',
                borderColor: isActive ? '#8b5cf6' : '#334155',
                borderRadius: '8px',
                color: isActive ? '#e2e8f0' : '#94a3b8',
                fontSize: '12px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '4px',
                transition: 'all 0.2s ease',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = '#475569';
                  e.currentTarget.style.background = '#1e293b';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = '#334155';
                  e.currentTarget.style.background = '#0f172a';
                }
              }}
              title={preview}
            >
              {/* Provider Color Indicators */}
              <div style={{ display: 'flex', gap: '2px', marginBottom: '2px' }}>
                {colors.map((color, i) => (
                  <div
                    key={i}
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: color,
                    }}
                  />
                ))}
              </div>

              {/* Turn Label */}
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{label}</div>

              {/* Active Indicator */}
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    background: '#8b5cf6',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Right Fade Indicator */}
      {showRightFade && (
        <div
          style={{
            position: 'absolute',
            right: '12px',
            top: 0,
            bottom: 0,
            width: '40px',
            background: 'linear-gradient(to left, #0f172a, transparent)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default NavigatorBar;
