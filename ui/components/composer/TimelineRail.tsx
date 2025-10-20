import { Virtuoso } from 'react-virtuoso';
import { TurnMiniCard } from './TurnMiniCard';
import { TurnMessage } from '../../types';

interface TimelineRailProps {
  turns: TurnMessage[];
  focusedTurnId: string | null;
  onTurnClick: (turnId: string) => void;
  onBlockDragStart: (blockData: any) => void;
}

export const TimelineRail: React.FC<TimelineRailProps> = ({
  turns,
  focusedTurnId,
  onTurnClick,
  onBlockDragStart,
}) => {
  return (
    <Virtuoso
      data={turns}
      itemContent={(index, turn) => (
        <TurnMiniCard
          turn={turn}
          isFocused={turn.id === focusedTurnId}
          onClick={() => onTurnClick(turn.id)}
          onBlockDragStart={onBlockDragStart}
          isVisible={
            // Show 2-3 turns in either direction
            Math.abs(turns.findIndex(t => t.id === focusedTurnId) - index) <= 2
          }
        />
      )}
      style={{ height: '100%' }}
      // Scroll to focused turn when it changes
      initialTopMostItemIndex={turns.findIndex(t => t.id === focusedTurnId)}
      followOutput="smooth"
    />
  );
};