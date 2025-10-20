import type { AiTurn } from '../../types';
import { getProviderById } from '../../providers/providerRegistry';

interface TurnSummaryCardProps {
  aiTurn: AiTurn;
  userPrompt: string;
  isFocused: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
}

const TurnSummaryCard: React.FC<TurnSummaryCardProps> = ({
  aiTurn,
  userPrompt,
  isFocused,
  onClick,
  style
}) => {
  // Extract provider IDs from all response types
  const providerIds = [
    ...Object.keys(aiTurn.batchResponses || {}),
    ...Object.keys(aiTurn.synthesisResponses || {}),
    ...Object.keys(aiTurn.mappingResponses || {})
  ];
  const uniqueProviders = [...new Set(providerIds)];
  
  const timestamp = new Date(aiTurn.createdAt).toLocaleTimeString();
  
  return (
    <div
      onClick={onClick}
      style={{
        ...style,
        padding: '12px',
        background: isFocused ? 'rgba(139, 92, 246, 0.15)' : '#1e293b',
        borderLeft: isFocused ? '3px solid #8b5cf6' : '3px solid transparent',
        borderBottom: '1px solid #334155',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        ':hover': {
          background: 'rgba(255, 255, 255, 0.05)'
        }
      }}
    >
      <div style={{ 
        fontSize: '11px', 
        color: '#64748b',
        marginBottom: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <span>{timestamp}</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {uniqueProviders.map(pid => {
            const provider = getProviderById(pid);
            return (
              <div
                key={pid}
                className={`model-logo ${provider?.logoBgClass}`}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '2px'
                }}
                title={provider?.name}
              />
            );
          })}
        </div>
      </div>
      
      <div style={{
        fontSize: '13px',
        color: '#e2e8f0',
        lineHeight: '1.4',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical'
      }}>
        {userPrompt}
      </div>
    </div>
  );
};

export default TurnSummaryCard;