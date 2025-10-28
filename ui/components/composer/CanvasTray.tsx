import React, { useState, useCallback } from 'react';
import { CanvasTabData } from './CanvasTab';

interface CanvasTrayProps {
  tabs: CanvasTabData[];
  activeTabId: string;
  onActivateTab: (tabId: string) => void;
  onTabsChange?: (tabs: CanvasTabData[]) => void;
}

export const CanvasTray: React.FC<CanvasTrayProps> = ({
  tabs,
  activeTabId,
  onActivateTab,
  onTabsChange,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleAddTab = useCallback(() => {
    const now = Date.now();
    const newTab: CanvasTabData = {
      id: `canvas-${now}`,
      title: `Canvas ${tabs.length + 1}`,
      content: { type: 'doc', content: [] },
      createdAt: now,
      updatedAt: now,
    };
    const updated = [...tabs, newTab];
    onTabsChange?.(updated);
    onActivateTab(newTab.id);
  }, [tabs, onTabsChange, onActivateTab]);

  const handleRenameTab = useCallback((tabId: string, newTitle: string) => {
    const updated = tabs.map((t) => (t.id === tabId ? { ...t, title: newTitle } : t));
    onTabsChange?.(updated);
  }, [tabs, onTabsChange]);

  if (isCollapsed) {
    return (
      <div style={{ height: '32px', background: '#0f172a', borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8 }}>
        <button
          onClick={() => setIsCollapsed(false)}
          style={{ width: 28, height: 28, borderRadius: '50%', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
          title="Expand"
        >
          ▲
        </button>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>Canvas Tabs: {tabs.length}</span>
      </div>
    );
  }

  return (
    <div style={{ height: '48px', background: '#0f172a', borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#0b1220', overflowX: 'auto' }}>
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              onClick={() => onActivateTab(tab.id)}
              title={tab.title}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isActive ? '#8b5cf6' : '#334155',
                color: isActive ? '#0b1220' : '#e2e8f0',
                border: '1px solid #475569',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
                boxShadow: isActive ? '0 0 0 2px rgba(139,92,246,0.35)' : 'none',
              }}
            >
              {idx + 1}
            </button>
          );
        })}
        <button
          onClick={handleAddTab}
          style={{ width: 28, height: 28, borderRadius: '50%', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
          title="Add canvas"
        >
          +
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setIsCollapsed(true)}
          style={{ width: 28, height: 28, borderRadius: '50%', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
          title="Collapse"
        >
          ▼
        </button>
      </div>
    </div>
  );
};

export default CanvasTray;