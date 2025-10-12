import { useMemo } from 'react';
import { FixedSizeList } from 'react-window';
import type { TurnMessage, AiTurn } from '../../types';
import { isAiTurn } from '../../types';
import TurnSummaryCard from './TurnSummaryCard';

interface NavigationTimelineProps {
  turns: TurnMessage[];
  focusedTurnId: string | null;
  onTurnSelect: (turnId: string) => void;
}

const NavigationTimeline: React.FC<NavigationTimelineProps> = ({
  turns,
  focusedTurnId,
  onTurnSelect
}) => {
  // Filter to AI turns only (those have composable content)
  const aiTurns = useMemo(() => 
    turns.filter(isAiTurn) as AiTurn[]
  , [turns]);
  
  // Get corresponding user prompts
  const turnPairs = useMemo(() => {
    return aiTurns.map(aiTurn => {
      const userTurn = turns.find(t => t.id === aiTurn.userTurnId);
      return {
        aiTurn,
        userPrompt: userTurn?.type === 'user' ? userTurn.text : 'Unknown'
      };
    });
  }, [aiTurns, turns]);
  
  if (turnPairs.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
        No conversation turns available
      </div>
    );
  }
  
  return (
    <div style={{ flex: 1, overflow: 'hidden' }}>
      <div style={{ 
        padding: '12px 16px', 
        borderBottom: '1px solid #334155',
        fontSize: '12px',
        fontWeight: 600,
        color: '#94a3b8',
        textTransform: 'uppercase'
      }}>
        Timeline ({turnPairs.length} turns)
      </div>
      
      <FixedSizeList
        height={window.innerHeight - 300} // Adjust based on layout
        itemCount={turnPairs.length}
        itemSize={80}
        width="100%"
      >
        {({ index, style }) => (
          <TurnSummaryCard
            key={turnPairs[index].aiTurn.id}
            aiTurn={turnPairs[index].aiTurn}
            userPrompt={turnPairs[index].userPrompt}
            isFocused={turnPairs[index].aiTurn.id === focusedTurnId}
            onClick={() => onTurnSelect(turnPairs[index].aiTurn.id)}
            style={style}
          />
        )}
      </FixedSizeList>
    </div>
  );
};

export default NavigationTimeline;