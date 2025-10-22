// ==================== TURN CARD ====================

const TurnCard: React.FC<{
  turn: ChatTurn;
  isActive: boolean;
  isMini?: boolean;
  onClick: () => void;
  onHoverExpand?: () => void;
}> = ({ turn, isActive, isMini = false, onClick, onHoverExpand }) => {
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
  }, []);import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';

// ==================== TYPES ====================

interface ResponseBlock {
  id: string;
  content: string;
  providerId: string;
  status?: 'pending' | 'streaming' | 'completed' | 'error';
  createdAt?: number;
  meta?: any;
}

interface ChatTurn {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: number;
  sessionId?: string;
  responses: ResponseBlock[];
  providerId?: string;
}

type Granularity = 'full' | 'paragraph' | 'sentence' | 'word';

interface TextSegment {
  id: string;
  text: string;
  start: number;
  end: number;
  type: Granularity;
}

interface DragPayload {
  turnId: string;
  responseId?: string;
  providerId: string;
  segmentType: Granularity;
  start: number;
  end: number;
  text: string;
}

// ==================== SAMPLE DATA ====================

const SAMPLE_TURNS: ChatTurn[] = [
  {
    id: 'turn_001',
    type: 'user',
    content: 'Write a comprehensive summary about deep learning architectures.\n\nFocus specifically on CNNs and Transformers, highlighting their unique characteristics.',
    timestamp: 1730235600000,
    sessionId: 'session_abc',
    responses: []
  },
  {
    id: 'turn_002',
    type: 'ai',
    content: 'Deep learning architectures have revolutionized artificial intelligence...',
    timestamp: 1730235605000,
    sessionId: 'session_abc',
    providerId: 'openai',
    responses: [
      {
        id: 'turn_002-batch-openai',
        content: 'Convolutional Neural Networks (CNNs) excel at processing spatial hierarchies in image data through their unique architecture of convolutional layers. These networks can automatically learn hierarchical patterns, from simple edges in early layers to complex objects in deeper layers.\n\nTransformers, on the other hand, handle long-range dependencies through their self-attention mechanism. Unlike CNNs, they can process entire sequences in parallel, making them highly efficient for natural language processing tasks. The multi-head attention allows them to focus on different aspects of the input simultaneously.',
        providerId: 'openai',
        status: 'completed',
        createdAt: 1730235605000,
        meta: { model: 'gpt-4o-mini' }
      },
      {
        id: 'turn_002-synthesis-claude-0',
        content: 'Synthesis: Both CNNs and Transformers represent paradigm shifts in deep learning. Hybrid architectures like Vision Transformers combine their strengths, applying self-attention to image patches while maintaining spatial processing capabilities. This fusion enables models to capture both local patterns and global context effectively.',
        providerId: 'claude-synthesis',
        status: 'completed',
        createdAt: 1730235606000,
        meta: { model: 'claude-3.5' }
      },
      {
        id: 'turn_002-mapping-openai-0',
        content: 'Article Outline:\n1. Introduction to Deep Learning\n2. CNNs: Architecture and Applications\n3. Transformers: Attention Mechanisms\n4. Comparative Analysis\n5. Hybrid Approaches\n6. Future Directions',
        providerId: 'openai-mapping',
        status: 'completed',
        createdAt: 1730235607000,
        meta: { tags: ['outline', 'blog'] }
      }
    ]
  },
  {
    id: 'turn_003',
    type: 'user',
    content: 'Please expand the section on attention mechanisms in more detail.',
    timestamp: 1730235610000,
    sessionId: 'session_abc',
    responses: []
  },
  {
    id: 'turn_004',
    type: 'ai',
    content: 'Attention mechanisms allow models to weight context efficiently...',
    timestamp: 1730235615000,
    sessionId: 'session_abc',
    providerId: 'anthropic',
    responses: [
      {
        id: 'turn_004-batch-anthropic',
        content: 'The attention mechanism revolutionized sequence modeling by introducing a way for models to focus on relevant parts of the input. Scaled dot-product attention computes compatibility scores between query and key vectors, then uses these scores to weight value vectors.\n\nMulti-head attention extends this by running multiple attention operations in parallel, each with different learned projections. This allows the model to capture different types of relationships simultaneously - some heads might focus on syntactic relationships while others capture semantic similarities.',
        providerId: 'anthropic',
        status: 'completed',
        createdAt: 1730235615000,
        meta: { partial: false }
      },
      {
        id: 'turn_004-synthesis-openai-0',
        content: 'Executive Summary: Attention mechanisms enable neural networks to dynamically focus on relevant information, much like human selective attention. This breakthrough made possible the current generation of large language models and multimodal AI systems.',
        providerId: 'openai-synthesis',
        status: 'completed',
        createdAt: 1730235616000
      }
    ]
  }
];

// ==================== UTILITIES ====================

const getProviderColor = (providerId: string): string => {
  const colors: Record<string, string> = {
    'openai': '#10a37f',
    'anthropic': '#8b5cf6',
    'claude': '#8b5cf6',
    'google': '#4285f4',
    'xai': '#ff6b35',
  };
  return colors[providerId.replace('-synthesis', '').replace('-mapping', '')] || '#6b7280';
};

const segmentText = (text: string, granularity: Granularity): TextSegment[] => {
  if (!text) return [];
  
  switch (granularity) {
    case 'full':
      return [{
        id: '0',
        text,
        start: 0,
        end: text.length,
        type: 'full'
      }];
      
    case 'paragraph':
      const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
      let offset = 0;
      return paragraphs.map((para, idx) => {
        const start = offset;
        const end = offset + para.length;
        offset = end + 2; // account for \n\n
        return {
          id: `p-${idx}`,
          text: para.trim(),
          start,
          end,
          type: 'paragraph'
        };
      });
      
    case 'sentence':
      // Simple sentence split - in production use Intl.Segmenter
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      let sOffset = 0;
      return sentences.map((sent, idx) => {
        const trimmed = sent.trim();
        const start = sOffset;
        const end = sOffset + trimmed.length;
        sOffset = end + 1;
        return {
          id: `s-${idx}`,
          text: trimmed,
          start,
          end,
          type: 'sentence'
        };
      });
      
    case 'word':
      const words = text.split(/\s+/).filter(w => w.length > 0);
      let wOffset = 0;
      return words.map((word, idx) => {
        const start = text.indexOf(word, wOffset);
        const end = start + word.length;
        wOffset = end;
        return {
          id: `w-${idx}`,
          text: word,
          start,
          end,
          type: 'word'
        };
      });
      
    default:
      return [];
  }
};

// ==================== DRAGGABLE SEGMENT ====================

const DraggableSegment: React.FC<{
  segment: TextSegment;
  turnId: string;
  responseId: string;
  providerId: string;
  granularity: Granularity;
}> = ({ segment, turnId, responseId, providerId, granularity }) => {
  const [showCopyButton, setShowCopyButton] = useState(false);
  const [copied, setCopied] = useState(false);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${turnId}-${responseId}-${segment.id}`,
    data: {
      turnId,
      responseId,
      providerId,
      segmentType: granularity,
      start: segment.start,
      end: segment.end,
      text: segment.text
    } as DragPayload
  });

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(segment.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onMouseEnter={() => setShowCopyButton(true)}
      onMouseLeave={() => setShowCopyButton(false)}
      style={{
        display: granularity === 'word' ? 'inline' : 'block',
        padding: granularity === 'paragraph' ? '8px' : granularity === 'sentence' ? '4px' : '2px',
        margin: granularity === 'paragraph' ? '4px 0' : '2px',
        borderRadius: '4px',
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        background: isDragging ? 'rgba(139, 92, 246, 0.2)' : showCopyButton ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
        border: `1px solid ${showCopyButton || isDragging ? 'rgba(139, 92, 246, 0.3)' : 'transparent'}`,
        transition: 'all 0.15s ease',
        position: 'relative'
      }}
      className="draggable-segment"
    >
      {segment.text}
      {showCopyButton && granularity !== 'word' && (
        <button
          onClick={handleCopy}
          style={{
            position: 'absolute',
            right: '4px',
            top: '4px',
            background: copied ? '#10a37f' : '#8b5cf6',
            border: 'none',
            borderRadius: '4px',
            padding: '2px 6px',
            fontSize: '10px',
            color: 'white',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            zIndex: 10
          }}
        >
          {copied ? '✓' : '📋'}
        </button>
      )}
    </span>
  );
};

// ==================== TURN CARD ====================

const TurnCard: React.FC<{
  turn: ChatTurn;
  isActive: boolean;
  isMini?: boolean;
  onClick: () => void;
}> = ({ turn, isActive, isMini = false, onClick }) => {
  const displayContent = turn.type === 'user' 
    ? turn.content 
    : turn.responses[0]?.content || turn.content;
  
  const truncated = displayContent.length > (isMini ? 60 : 120)
    ? displayContent.substring(0, isMini ? 60 : 120) + '...'
    : displayContent;

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

// ==================== EXPANDED OVERLAY ====================

const ExpandedTurnOverlay: React.FC<{
  turn: ChatTurn;
  onClose: () => void;
  prevTurn?: ChatTurn;
  nextTurn?: ChatTurn;
  onNavigate: (direction: 'prev' | 'next') => void;
}> = ({ turn, onClose, prevTurn, nextTurn, onNavigate }) => {
  const [granularity, setGranularity] = useState<Granularity>('paragraph');
  const [selectedResponseId, setSelectedResponseId] = useState<string>(
    turn.responses[0]?.id || ''
  );

  const selectedResponse = turn.responses.find(r => r.id === selectedResponseId);
  const segments = useMemo(() => {
    if (!selectedResponse) return [];
    return segmentText(selectedResponse.content, granularity);
  }, [selectedResponse, granularity]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && prevTurn) onNavigate('prev');
      if (e.key === 'ArrowRight' && nextTurn) onNavigate('next');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, prevTurn, nextTurn, onNavigate]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        display: 'flex',
        gap: '20px',
        alignItems: 'center',
        maxWidth: '1400px',
        width: '100%',
        height: '80vh'
      }}>
        {/* Previous Turn Mini */}
        {prevTurn && (
          <TurnCard
            turn={prevTurn}
            isActive={false}
            isMini={true}
            onClick={() => onNavigate('prev')}
          />
        )}

        {/* Main Overlay */}
        <div style={{
          flex: 1,
          background: '#0f172a',
          borderRadius: '16px',
          border: '2px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          maxHeight: '80vh',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            padding: '20px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: turn.type === 'user' ? '#3b82f6' : getProviderColor(turn.providerId || 'default'),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {turn.type === 'user' ? '👤' : '🤖'}
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#e2e8f0' }}>
                  {turn.type === 'user' ? 'User Prompt' : turn.providerId || 'AI Response'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {new Date(turn.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px 8px'
              }}
            >
              ×
            </button>
          </div>

          {/* Response Selector for AI turns */}
          {turn.type === 'ai' && turn.responses.length > 1 && (
            <div style={{
              padding: '12px 20px',
              borderBottom: '1px solid #334155',
              display: 'flex',
              gap: '8px',
              overflowX: 'auto'
            }}>
              {turn.responses.map(resp => (
                <button
                  key={resp.id}
                  onClick={() => setSelectedResponseId(resp.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${selectedResponseId === resp.id ? '#8b5cf6' : '#334155'}`,
                    background: selectedResponseId === resp.id ? 'rgba(139, 92, 246, 0.2)' : '#1e293b',
                    color: '#e2e8f0',
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {resp.providerId}
                </button>
              ))}
            </div>
          )}

          {/* Granularity Controls */}
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            gap: '8px',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '12px', color: '#94a3b8', marginRight: '8px' }}>
              Drag Granularity:
            </span>
            {(['full', 'paragraph', 'sentence', 'word'] as Granularity[]).map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${granularity === g ? '#8b5cf6' : '#334155'}`,
                  background: granularity === g ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                  color: granularity === g ? '#a78bfa' : '#94a3b8',
                  fontSize: '11px',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px'
          }}>
            {/* Keyboard shortcuts hint */}
            <div style={{
              marginBottom: '16px',
              padding: '12px',
              background: 'rgba(139, 92, 246, 0.1)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#a78bfa',
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap'
            }}>
              <span><kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px' }}>←</kbd> Previous</span>
              <span><kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px' }}>→</kbd> Next</span>
              <span><kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px' }}>Esc</kbd> Close</span>
              <span>💡 Hover segments to copy</span>
            </div>

            <div style={{
              fontSize: '14px',
              lineHeight: '1.8',
              color: '#e2e8f0'
            }}>
              {turn.type === 'user' ? (
                <div style={{
                  padding: '12px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(59, 130, 246, 0.3)'
                }}>
                  {turn.content}
                </div>
              ) : selectedResponse ? (
                segments.map(segment => (
                  <DraggableSegment
                    key={segment.id}
                    segment={segment}
                    turnId={turn.id}
                    responseId={selectedResponse.id}
                    providerId={selectedResponse.providerId}
                    granularity={granularity}
                  />
                ))
              ) : (
                <div style={{ color: '#64748b' }}>No content available</div>
              )}
            </div>
          </div>
        </div>

        {/* Next Turn Mini */}
        {nextTurn && (
          <TurnCard
            turn={nextTurn}
            isActive={false}
            isMini={true}
            onClick={() => onNavigate('next')}
          />
        )}
      </div>
    </div>
  );
};

// ==================== CANVAS EDITOR ====================

const CanvasEditor: React.FC<{
  droppedSegments: Array<{ id: string; text: string; providerId: string }>;
  onRemoveSegment: (id: string) => void;
  onClearAll: () => void;
  onExport: () => void;
}> = ({ droppedSegments, onRemoveSegment, onClearAll, onExport }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'canvas-dropzone',
    data: { type: 'canvas' }
  });

  const wordCount = droppedSegments.reduce((sum, seg) => {
    return sum + seg.text.split(/\s+/).filter(w => w.length > 0).length;
  }, 0);

  const charCount = droppedSegments.reduce((sum, seg) => sum + seg.text.length, 0);
  const readingTime = Math.ceil(wordCount / 200); // Assuming 200 words per minute

  const providerBreakdown = droppedSegments.reduce((acc, seg) => {
    acc[seg.providerId] = (acc[seg.providerId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ margin: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Toolbar */}
      {droppedSegments.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px',
          background: '#1e293b',
          borderRadius: '8px',
          border: '1px solid #334155'
        }}>
          <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: '#94a3b8' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ color: '#64748b', fontSize: '10px' }}>BLOCKS</span>
              <span style={{ fontSize: '18px', fontWeight: 600, color: '#e2e8f0' }}>
                {droppedSegments.length}
              </span>
            </div>
            <div style={{ width: '1px', background: '#334155' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ color: '#64748b', fontSize: '10px' }}>WORDS</span>
              <span style={{ fontSize: '18px', fontWeight: 600, color: '#e2e8f0' }}>
                {wordCount.toLocaleString()}
              </span>
            </div>
            <div style={{ width: '1px', background: '#334155' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ color: '#64748b', fontSize: '10px' }}>CHARACTERS</span>
              <span style={{ fontSize: '18px', fontWeight: 600, color: '#e2e8f0' }}>
                {charCount.toLocaleString()}
              </span>
            </div>
            <div style={{ width: '1px', background: '#334155' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ color: '#64748b', fontSize: '10px' }}>READ TIME</span>
              <span style={{ fontSize: '18px', fontWeight: 600, color: '#e2e8f0' }}>
                ~{readingTime}m
              </span>
            </div>
            <div style={{ width: '1px', background: '#334155' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ color: '#64748b', fontSize: '10px' }}>PROVIDERS</span>
              <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                {Object.entries(providerBreakdown).map(([provider, count]) => (
                  <div
                    key={provider}
                    style={{
                      background: getProviderColor(provider),
                      color: 'white',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600
                    }}
                    title={`${provider}: ${count} blocks`}
                  >
                    {count}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onExport}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #10a37f',
                background: '#10a37f',
                color: 'white',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#0d8f6f';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#10a37f';
              }}
            >
              <span>📥</span> Export
            </button>
            <button
              onClick={onClearAll}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #ef4444',
                background: 'transparent',
                color: '#ef4444',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span>🗑️</span> Clear
            </button>
          </div>
        </div>
      )}

      {/* Drop Zone */}
      <div
        ref={setNodeRef}
        style={{
          minHeight: '200px',
          background: isOver ? 'rgba(139, 92, 246, 0.1)' : '#1e293b',
          border: `2px dashed ${isOver ? '#8b5cf6' : '#475569'}`,
          borderRadius: '12px',
          padding: '20px',
          transition: 'all 0.2s ease'
        }}
      >
        {droppedSegments.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#64748b',
            fontSize: '14px',
            padding: '40px'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📝</div>
            <div style={{ fontWeight: 500, marginBottom: '4px' }}>Drop segments here to compose</div>
            <div style={{ fontSize: '12px' }}>Drag paragraphs, sentences, or words from the timeline</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {droppedSegments.map((segment, idx) => (
              <div
                key={segment.id}
                style={{
                  background: '#0f172a',
                  border: `2px solid ${getProviderColor(segment.providerId)}`,
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: '#e2e8f0',
                  position: 'relative'
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    fontSize: '10px',
                    color: '#94a3b8',
                    fontWeight: 600
                  }}>
                    {segment.providerId} • Block {idx + 1}
                  </div>
                  <button
                    onClick={() => onRemoveSegment(segment.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      fontSize: '18px',
                      cursor: 'pointer',
                      padding: '0 4px',
                      lineHeight: 1
                    }}
                    title="Remove this block"
                  >
                    ×
                  </button>
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{segment.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== VIRTUALIZED TIMELINE ====================

const VirtualizedHorizontalTimeline: React.FC<{
  turns: ChatTurn[];
  currentIndex: number;
  onTurnClick: (index: number) => void;
  onNavigate: (direction: 'prev' | 'next') => void;
}> = ({ turns, currentIndex, onTurnClick, onNavigate }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 5 });

  // Calculate visible turns (current + 2 on each side)
  useEffect(() => {
    const start = Math.max(0, currentIndex - 2);
    const end = Math.min(turns.length, currentIndex + 3);
    setVisibleRange({ start, end });

    // Scroll current turn into center
    if (scrollRef.current) {
      const container = scrollRef.current;
      const cardWidth = 330; // 300px card + 30px gap
      const scrollTarget = (currentIndex - 2) * cardWidth;
      container.scrollTo({
        left: Math.max(0, scrollTarget),
        behavior: 'smooth'
      });
    }
  }, [currentIndex, turns.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        onNavigate('prev');
      } else if (e.key === 'ArrowRight' && currentIndex < turns.length - 1) {
        e.preventDefault();
        onNavigate('next');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, turns.length, onNavigate]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Navigation Buttons */}
      <div style={{
        position: 'absolute',
        left: '20px',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 10
      }}>
        <button
          onClick={() => onNavigate('prev')}
          disabled={currentIndex === 0}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: currentIndex === 0 ? '#334155' : '#8b5cf6',
            border: 'none',
            color: 'white',
            fontSize: '20px',
            cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
            opacity: currentIndex === 0 ? 0.5 : 1,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (currentIndex > 0) {
              e.currentTarget.style.transform = 'scale(1.1)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ‹
        </button>
      </div>

      <div style={{
        position: 'absolute',
        right: '20px',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 10
      }}>
        <button
          onClick={() => onNavigate('next')}
          disabled={currentIndex >= turns.length - 1}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: currentIndex >= turns.length - 1 ? '#334155' : '#8b5cf6',
            border: 'none',
            color: 'white',
            fontSize: '20px',
            cursor: currentIndex >= turns.length - 1 ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
            opacity: currentIndex >= turns.length - 1 ? 0.5 : 1,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (currentIndex < turns.length - 1) {
              e.currentTarget.style.transform = 'scale(1.1)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ›
        </button>
      </div>

      {/* Timeline Container */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '30px',
          padding: '40px 80px',
          overflowX: 'auto',
          scrollBehavior: 'smooth'
        }}
      >
        {turns.slice(visibleRange.start, visibleRange.end).map((turn, idx) => {
          const actualIndex = visibleRange.start + idx;
          const isActive = actualIndex === currentIndex;
          const isMini = Math.abs(actualIndex - currentIndex) > 0;

          return (
            <TurnCard
              key={turn.id}
              turn={turn}
              isActive={isActive}
              isMini={isMini}
              onClick={() => onTurnClick(actualIndex)}
              onHoverExpand={!isMini && !isActive ? () => onTurnClick(actualIndex) : undefined}
            />
          );
        })}
      </div>

      {/* Progress Indicator */}
      <div style={{
        textAlign: 'center',
        padding: '10px',
        fontSize: '12px',
        color: '#64748b'
      }}>
        Turn {currentIndex + 1} of {turns.length}
      </div>
    </div>
  );
};

const ComposerTimelineV3: React.FC = () => {
  const [turns] = useState<ChatTurn[]>(SAMPLE_TURNS);
  const [currentIndex, setCurrentIndex] = useState(1); // Start at second turn
  const [expandedTurnId, setExpandedTurnId] = useState<string | null>(null);
  const [dragData, setDragData] = useState<DragPayload | null>(null);
  const [droppedSegments, setDroppedSegments] = useState<Array<{ id: string; text: string; providerId: string }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { setNodeRef: setCanvasRef } = useDroppable({
    id: 'canvas-dropzone',
    data: { type: 'canvas' }
  });

  const currentTurn = turns[currentIndex];
  const prevTurn = currentIndex > 0 ? turns[currentIndex - 1] : undefined;
  const nextTurn = currentIndex < turns.length - 1 ? turns[currentIndex + 1] : undefined;
  const expandedTurn = turns.find(t => t.id === expandedTurnId);

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setExpandedTurnId(turns[currentIndex - 1].id);
    } else if (direction === 'next' && currentIndex < turns.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setExpandedTurnId(turns[currentIndex + 1].id);
    }
  }, [currentIndex, turns]);

  const handleDrop = useCallback((event: any) => {
    const data = event.active.data.current as DragPayload;
    if (data && event.over?.id === 'canvas-dropzone') {
      setDroppedSegments(prev => [...prev, {
        id: `${data.turnId}-${Date.now()}`,
        text: data.text,
        providerId: data.providerId
      }]);
    }
  }, []);

  const handleRemoveSegment = useCallback((id: string) => {
    setDroppedSegments(prev => prev.filter(s => s.id !== id));
  }, []);

  const handleClearAll = useCallback(() => {
    if (window.confirm('Clear all composed content?')) {
      setDroppedSegments([]);
    }
  }, []);

  const handleExport = useCallback(() => {
    const content = droppedSegments.map(s => s.text).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `composition-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [droppedSegments]);

  return (
    <DndContext
      onDragStart={(e) => setDragData(e.active.data.current as DragPayload)}
      onDragEnd={(e) => {
        handleDrop(e);
        setDragData(null);
      }}
    >
      <div style={{
        height: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #334155',
          background: '#1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', color: '#e2e8f0', fontWeight: 600 }}>
              🎯 Composer Timeline
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748b' }}>
              Click to expand • Drag segments to compose • Arrow keys to navigate
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{
              padding: '8px 16px',
              background: '#0f172a',
              borderRadius: '8px',
              border: '1px solid #334155',
              fontSize: '14px',
              color: '#e2e8f0'
            }}>
              <span style={{ color: '#64748b' }}>Session:</span>{' '}
              <span style={{ fontFamily: 'monospace', color: '#a78bfa' }}>
                {turns[0]?.sessionId?.slice(-6) || 'N/A'}
              </span>
            </div>
            <div style={{
              padding: '8px 16px',
              background: droppedSegments.length > 0 ? 'rgba(16, 163, 127, 0.2)' : '#0f172a',
              borderRadius: '8px',
              border: `1px solid ${droppedSegments.length > 0 ? '#10a37f' : '#334155'}`,
              fontSize: '14px',
              color: droppedSegments.length > 0 ? '#10a37f' : '#64748b',
              fontWeight: 500
            }}>
              {droppedSegments.length} blocks composed
            </div>
          </div>
        </div>

        {/* Timeline */}
        <VirtualizedHorizontalTimeline
          turns={turns}
          currentIndex={currentIndex}
          onTurnClick={(index) => setCurrentIndex(index)}
          onNavigate={handleNavigate}
        />

        {/* Canvas Drop Zone */}
        <CanvasEditor 
          droppedSegments={droppedSegments}
          onRemoveSegment={handleRemoveSegment}
          onClearAll={handleClearAll}
          onExport={handleExport}
        />

        {/* Expanded Overlay */}
        {expandedTurn && (
          <ExpandedTurnOverlay
            turn={expandedTurn}
            onClose={() => setExpandedTurnId(null)}
            prevTurn={turns[turns.findIndex(t => t.id === expandedTurnId) - 1]}
            nextTurn={turns[turns.findIndex(t => t.id === expandedTurnId) + 1]}
            onNavigate={handleNavigate}
          />
        )}

        {/* Drag Overlay */}
        <DragOverlay>
          {dragData && (
            <div style={{
              background: '#1e293b',
              border: '2px solid #8b5cf6',
              borderRadius: '8px',
              padding: '12px',
              maxWidth: '300px',
              color: '#e2e8f0',
              fontSize: '13px',
              boxShadow: '0 8px 24px rgba(139, 92, 246, 0.4)'
            }}>
              <div style={{ fontSize: '10px', color: '#a78bfa', marginBottom: '4px' }}>
                {dragData.segmentType.toUpperCase()}
              </div>
              {dragData.text.substring(0, 100)}
              {dragData.text.length > 100 && '...'}
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
};

export default ComposerTimelineV3;

/* 
===========================================
INTEGRATION GUIDE FOR YOUR APPLICATION
===========================================

1. REPLACE SAMPLE DATA WITH REAL DATA
--------------------------------------------
Replace the SAMPLE_TURNS constant with your actual data:

import { convertTurnMessagesToChatTurns } from '../types/chat';

const ComposerModeV3: React.FC<{
  allTurns: TurnMessage[];
  sessionId: string | null;
}> = ({ allTurns, sessionId }) => {
  const turns = useMemo(() => 
    convertTurnMessagesToChatTurns(allTurns), 
    [allTurns]
  );
  
  return <ComposerTimelineV3 turns={turns} sessionId={sessionId} />;
};


2. CONNECT TO TIPTAP CANVAS EDITOR
--------------------------------------------
Replace the CanvasEditor drop handler with your actual editor:

import { CanvasEditorV2, CanvasEditorRef } from './CanvasEditorV2';

const editorRef = useRef<CanvasEditorRef>(null);

const handleDrop = useCallback((event: any) => {
  const data = event.active.data.current as DragPayload;
  if (data && event.over?.id === 'canvas-dropzone') {
    editorRef.current?.insertComposedContent(
      data.text,
      {
        sessionId: data.turnId.split('_')[0] || 'unknown',
        aiTurnId: data.turnId,
        providerId: data.providerId,
        responseType: data.responseId?.includes('synthesis') ? 'synthesis' :
                     data.responseId?.includes('mapping') ? 'mapping' : 'batch',
        responseIndex: 0,
        timestamp: Date.now(),
        granularity: data.segmentType === 'full' ? 'full' :
                    data.segmentType === 'paragraph' ? 'paragraph' : 
                    'sentence',
        sourceText: data.text
      }
    );
  }
}, []);


3. ADD PERSISTENCE
--------------------------------------------
Save composition state to localStorage or your backend:

const [droppedSegments, setDroppedSegments] = useState<Array<...>>(() => {
  const saved = localStorage.getItem('composer-canvas');
  return saved ? JSON.parse(saved) : [];
});

useEffect(() => {
  localStorage.setItem('composer-canvas', JSON.stringify(droppedSegments));
}, [droppedSegments]);


4. ENHANCE TEXT SEGMENTATION
--------------------------------------------
For production, use Intl.Segmenter for better sentence/word splitting:

const segmentText = (text: string, granularity: Granularity): TextSegment[] => {
  if (!text) return [];
  
  switch (granularity) {
    case 'sentence':
      if (typeof Intl.Segmenter !== 'undefined') {
        const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
        const segments = Array.from(segmenter.segment(text));
        return segments.map((seg, idx) => ({
          id: `s-${idx}`,
          text: seg.segment.trim(),
          start: seg.index,
          end: seg.index + seg.segment.length,
          type: 'sentence'
        }));
      }
      // Fallback to regex...
      
    case 'word':
      if (typeof Intl.Segmenter !== 'undefined') {
        const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
        const segments = Array.from(segmenter.segment(text));
        return segments
          .filter(seg => seg.isWordLike)
          .map((seg, idx) => ({
            id: `w-${idx}`,
            text: seg.segment,
            start: seg.index,
            end: seg.index + seg.segment.length,
            type: 'word'
          }));
      }
      // Fallback to split...
  }
};


5. ADD REAL EXPORT FUNCTIONALITY
--------------------------------------------
Export to multiple formats:

const handleExport = useCallback((format: 'txt' | 'md' | 'json') => {
  let content: string;
  let mimeType: string;
  let extension: string;
  
  switch (format) {
    case 'md':
      content = droppedSegments.map((seg, idx) => 
        `### Block ${idx + 1} (${seg.providerId})\n\n${seg.text}`
      ).join('\n\n---\n\n');
      mimeType = 'text/markdown';
      extension = 'md';
      break;
      
    case 'json':
      content = JSON.stringify({
        composition: droppedSegments,
        metadata: {
          created: Date.now(),
          wordCount,
          charCount,
          sessionId
        }
      }, null, 2);
      mimeType = 'application/json';
      extension = 'json';
      break;
      
    default: // txt
      content = droppedSegments.map(s => s.text).join('\n\n');
      mimeType = 'text/plain';
      extension = 'txt';
  }
  
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `composition-${Date.now()}.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
}, [droppedSegments, wordCount, charCount, sessionId]);


6. KEYBOARD SHORTCUTS
--------------------------------------------
Current shortcuts implemented:
- Arrow Left/Right: Navigate turns (timeline view)
- Arrow Left/Right: Navigate turns in overlay
- Esc: Close overlay
- Click: Expand turn
- Hover (800ms): Auto-expand turn (power users)


7. ACCESSIBILITY IMPROVEMENTS
--------------------------------------------
Add ARIA labels and roles:

<div 
  role="region" 
  aria-label="Timeline navigator"
  aria-live="polite"
>
  {/* Timeline content */}
</div>

<button
  onClick={handleNavigate('prev')}
  aria-label="Navigate to previous turn"
  disabled={currentIndex === 0}
>
  ‹
</button>


8. PERFORMANCE OPTIMIZATIONS
--------------------------------------------
For large conversation histories:

- Increase virtualization buffer: increaseViewportBy={{ top: 800, bottom: 1200 }}
- Debounce search/filter: Use useDeferredValue for filter queries
- Memoize expensive computations: Wrap segmentText in useMemo
- Lazy load overlay content: Only segment text when overlay opens


9. RESPONSIVE DESIGN
--------------------------------------------
Add breakpoints for mobile:

const isMobile = window.innerWidth < 768;

// Adjust card sizes
minWidth: isMobile ? '150px' : '300px'

// Stack overlay on mobile
flexDirection: isMobile ? 'column' : 'row'


10. ANALYTICS/TRACKING
--------------------------------------------
Track user interactions:

const trackEvent = (event: string, data?: any) => {
  // Your analytics here
  console.log('Event:', event, data);
};

// In handlers:
trackEvent('turn_expanded', { turnId, providerId });
trackEvent('segment_dragged', { segmentType, provider });
trackEvent('composition_exported', { wordCount, blockCount });


FEATURE CHECKLIST
--------------------------------------------
✅ Timeline with mini-cards
✅ Previous/next navigation
✅ Expandable overlay (click)
✅ Hover-to-expand (800ms delay)
✅ Multi-granularity dragging (full/paragraph/sentence/word)
✅ Drag & drop to canvas
✅ Canvas with provider-colored blocks
✅ Remove individual blocks
✅ Clear all blocks
✅ Export functionality
✅ Word count & statistics
✅ Provider breakdown
✅ Reading time estimate
✅ Keyboard navigation
✅ Copy individual segments
✅ Visual feedback on drag
✅ Responsive cards
✅ Status indicators
✅ Keyboard shortcuts display

NEXT STEPS
--------------------------------------------
1. Replace SAMPLE_TURNS with convertTurnMessagesToChatTurns(allTurns)
2. Connect canvas drop to your CanvasEditorV2
3. Add persistence (localStorage/backend)
4. Enhance with Intl.Segmenter
5. Add export format options
6. Implement search/filter
7. Add undo/redo for canvas
8. Mobile responsive layout
9. Add dark/light theme toggle
10. Implement analytics tracking
*/