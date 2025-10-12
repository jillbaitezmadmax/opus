import { useState } from 'react';
import type { TurnMessage, Ghost } from '../../types';
import NavigationTimeline from './NavigationTimeline';
import FocusPane from './FocusPane';
import { isAiTurn } from '../../types';

interface SourcePanelProps {
  allTurns: TurnMessage[];
  granularity: 'full' | 'paragraph' | 'sentence';
  sessionId: string | null;
  onAddGhost: (ghost: Ghost) => void;
}

const SourcePanel: React.FC<SourcePanelProps> = ({ 
  allTurns, 
  granularity,
  sessionId,
  onAddGhost
}) => {
  const [focusedTurnId, setFocusedTurnId] = useState<string | null>(null);
  
  const focusedTurn = allTurns.find(t => isAiTurn(t) && t.id === focusedTurnId);
  
  return (
    <div style={{
      width: '400px',
      background: '#1e293b',
      borderRadius: '12px',
      border: '1px solid #334155',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Focus Pane - Top 40% */}
      <div style={{ 
        height: '40%', 
        borderBottom: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #334155',
          fontSize: '14px',
          fontWeight: 600,
          color: '#e2e8f0'
        }}>
          Focus Pane
        </div>
        <FocusPane 
          turn={focusedTurn as any} 
          granularity={granularity}
          sessionId={sessionId}
          onAddGhost={onAddGhost}
        />
      </div>
      
      {/* Navigation Timeline - Bottom 60% */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <NavigationTimeline
          turns={allTurns}
          focusedTurnId={focusedTurnId}
          onTurnSelect={setFocusedTurnId}
        />
      </div>
    </div>
  );
};

export default SourcePanel;