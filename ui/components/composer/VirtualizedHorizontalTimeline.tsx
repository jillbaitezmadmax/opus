import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatTurn } from '../../types/chat';
import { TurnCard } from './TurnCard';

interface VirtualizedHorizontalTimelineProps {
  turns: ChatTurn[];
  currentTurnIndex: number;
  onTurnSelect: (index: number) => void;
  onTurnExpand: (index: number) => void;
  className?: string;
}

export const VirtualizedHorizontalTimeline: React.FC<VirtualizedHorizontalTimelineProps> = ({
  turns,
  currentTurnIndex,
  onTurnSelect,
  onTurnExpand,
  className = ''
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: Math.min(5, turns.length) });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(turns.length > 5);

  // Calculate visible range based on current turn
  const updateVisibleRange = useCallback(() => {
    const windowSize = 5;
    let start = Math.max(0, currentTurnIndex - Math.floor(windowSize / 2));
    let end = Math.min(turns.length, start + windowSize);
    
    // Adjust start if we're near the end
    if (end - start < windowSize && turns.length >= windowSize) {
      start = Math.max(0, end - windowSize);
    }
    
    setVisibleRange({ start, end });
    setCanScrollLeft(start > 0);
    setCanScrollRight(end < turns.length);
  }, [currentTurnIndex, turns.length]);

  useEffect(() => {
    updateVisibleRange();
  }, [updateVisibleRange]);

  // Auto-scroll to keep current turn visible
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const cardWidth = 320; // 300px card + 20px gap
      const targetScroll = (currentTurnIndex - visibleRange.start) * cardWidth;
      
      container.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
      });
    }
  }, [currentTurnIndex, visibleRange]);

  const handlePrevious = () => {
    if (canScrollLeft) {
      const newStart = Math.max(0, visibleRange.start - 1);
      const newEnd = Math.min(turns.length, newStart + 5);
      setVisibleRange({ start: newStart, end: newEnd });
      setCanScrollLeft(newStart > 0);
      setCanScrollRight(newEnd < turns.length);
    }
  };

  const handleNext = () => {
    if (canScrollRight) {
      const newEnd = Math.min(turns.length, visibleRange.end + 1);
      const newStart = Math.max(0, newEnd - 5);
      setVisibleRange({ start: newStart, end: newEnd });
      setCanScrollLeft(newStart > 0);
      setCanScrollRight(newEnd < turns.length);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return; // Don't interfere with input fields
      }
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (currentTurnIndex > 0) {
            onTurnSelect(currentTurnIndex - 1);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (currentTurnIndex < turns.length - 1) {
            onTurnSelect(currentTurnIndex + 1);
          }
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          onTurnExpand(currentTurnIndex);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTurnIndex, turns.length, onTurnSelect, onTurnExpand]);

  const visibleTurns = turns.slice(visibleRange.start, visibleRange.end);

  return (
    <div className={`horizontal-timeline ${className}`} style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '16px',
      background: '#0f172a',
      borderRadius: '12px',
      border: '1px solid #334155',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Previous Button */}
      <button
        onClick={handlePrevious}
        disabled={!canScrollLeft}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: canScrollLeft ? '#8b5cf6' : '#334155',
          border: 'none',
          color: 'white',
          cursor: canScrollLeft ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
          transition: 'all 0.2s ease',
          opacity: canScrollLeft ? 1 : 0.5,
          flexShrink: 0
        }}
        title="Previous turns (←)"
      >
        ←
      </button>

      {/* Timeline Container */}
      <div
        ref={scrollContainerRef}
        style={{
          display: 'flex',
          gap: '20px',
          overflowX: 'hidden',
          scrollBehavior: 'smooth',
          flex: 1,
          padding: '8px 0'
        }}
      >
        {visibleTurns.map((turn, index) => {
          const actualIndex = visibleRange.start + index;
          const isActive = actualIndex === currentTurnIndex;
          
          // Show mini cards for non-active turns that are far from current
          const isMini = !isActive && Math.abs(actualIndex - currentTurnIndex) > 1;
          
          return (
            <TurnCard
              key={`${turn.id}-${actualIndex}`}
              turn={turn}
              isActive={isActive}
              isMini={isMini}
              onClick={() => onTurnSelect(actualIndex)}
              onHoverExpand={() => onTurnExpand(actualIndex)}
            />
          );
        })}
      </div>

      {/* Next Button */}
      <button
        onClick={handleNext}
        disabled={!canScrollRight}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: canScrollRight ? '#8b5cf6' : '#334155',
          border: 'none',
          color: 'white',
          cursor: canScrollRight ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
          transition: 'all 0.2s ease',
          opacity: canScrollRight ? 1 : 0.5,
          flexShrink: 0
        }}
        title="Next turns (→)"
      >
        →
      </button>

      {/* Turn Counter */}
      <div style={{
        position: 'absolute',
        bottom: '4px',
        right: '4px',
        fontSize: '10px',
        color: '#64748b',
        background: '#1e293b',
        padding: '2px 6px',
        borderRadius: '4px'
      }}>
        {currentTurnIndex + 1} / {turns.length}
      </div>

      {/* Keyboard Hints */}
      <div style={{
        position: 'absolute',
        top: '4px',
        right: '4px',
        fontSize: '9px',
        color: '#475569',
        display: 'flex',
        gap: '8px'
      }}>
        <span>← → Navigate</span>
        <span>Enter Expand</span>
      </div>
    </div>
  );
};