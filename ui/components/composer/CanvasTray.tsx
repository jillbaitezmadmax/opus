import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { CanvasTab, CanvasTabData } from './CanvasTab';
import { JSONContent } from '@tiptap/react';
import { ProvenanceData } from './extensions/ComposedContentNode';
import { CanvasScratchpadRef } from './CanvasScratchpad';

interface CanvasTrayProps {
  onExtractToMain?: (content: string, provenance: ProvenanceData) => void;
  initialTabs?: CanvasTabData[];
  onTabsChange?: (tabs: CanvasTabData[]) => void;
}

export const CanvasTray: React.FC<CanvasTrayProps> = ({
  onExtractToMain,
  initialTabs = [],
  onTabsChange,
}) => {
  const [tabs, setTabs] = useState<CanvasTabData[]>(
    initialTabs.length > 0
      ? initialTabs
      : [
          {
            id: `canvas-${Date.now()}`,
            title: 'Canvas 1',
            content: { type: 'doc', content: [] },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ]
  );
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0]?.id || '');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const activeCanvasRef = useRef<CanvasScratchpadRef | null>(null);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId), [tabs, activeTabId]);

  // Listen for extract-to-canvas events
  useEffect(() => {
    const handleExtractToCanvas = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { text, provenance } = customEvent.detail || {};
      
      if (text && provenance && activeCanvasRef.current) {
        activeCanvasRef.current.insertComposedContent(text, provenance);
      }
    };
    
    document.addEventListener('extract-to-canvas', handleExtractToCanvas);
    return () => document.removeEventListener('extract-to-canvas', handleExtractToCanvas);
  }, []);

  const handleContentChange = useCallback(
    (tabId: string, content: JSONContent) => {
      setTabs((prev) => {
        const updated = prev.map((tab) =>
          tab.id === tabId
            ? { ...tab, content, updatedAt: Date.now() }
            : tab
        );
        onTabsChange?.(updated);
        return updated;
      });
    },
    [onTabsChange]
  );

  const handleAddTab = useCallback(() => {
    const newTab: CanvasTabData = {
      id: `canvas-${Date.now()}`,
      title: `Canvas ${tabs.length + 1}`,
      content: { type: 'doc', content: [] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setTabs((prev) => {
      const updated = [...prev, newTab];
      onTabsChange?.(updated);
      return updated;
    });
    setActiveTabId(newTab.id);
  }, [tabs.length, onTabsChange]);

  const handleRemoveTab = useCallback(
    (tabId: string) => {
      if (tabs.length === 1) return; // Keep at least one tab

      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== tabId);
        onTabsChange?.(filtered);
        return filtered;
      });

      if (activeTabId === tabId) {
        const currentIndex = tabs.findIndex((t) => t.id === tabId);
        const nextTab = tabs[currentIndex + 1] || tabs[currentIndex - 1];
        setActiveTabId(nextTab?.id || '');
      }
    },
    [tabs, activeTabId, onTabsChange]
  );

  const handleRenameTab = useCallback(
    (tabId: string, newTitle: string) => {
      setTabs((prev) => {
        const updated = prev.map((tab) =>
          tab.id === tabId ? { ...tab, title: newTitle } : tab
        );
        onTabsChange?.(updated);
        return updated;
      });
    },
    [onTabsChange]
  );

  if (isCollapsed) {
    return (
      <div
        style={{
          height: '32px',
          background: '#0f172a',
          borderTop: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
        }}
      >
        <button
          onClick={() => setIsCollapsed(false)}
          style={{
            background: 'none',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: 12,
          }}
          title="Expand Canvas Tray"
        >
          ▲ Canvas Tray ({tabs.length})
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '240px',
        background: '#0f172a',
        borderTop: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Tab Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 8px',
          borderBottom: '1px solid #334155',
          background: '#0b1220',
          overflowX: 'auto',
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid',
                borderColor: isActive ? '#8b5cf6' : '#334155',
                background: isActive ? 'rgba(139, 92, 246, 0.15)' : '#1e293b',
                color: isActive ? '#e2e8f0' : '#94a3b8',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                minWidth: 100,
                maxWidth: 150,
              }}
              onClick={() => setActiveTabId(tab.id)}
            >
              <input
                type="text"
                value={tab.title}
                onChange={(e) => handleRenameTab(tab.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  fontSize: 'inherit',
                  fontWeight: 'inherit',
                  outline: 'none',
                  width: '100%',
                  padding: 0,
                }}
              />
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveTab(tab.id);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                  title="Close tab"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        <button
          onClick={handleAddTab}
          style={{
            background: 'none',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 500,
          }}
          title="Add new canvas"
        >
          + New
        </button>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setIsCollapsed(true)}
          style={{
            background: 'none',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: 12,
          }}
          title="Collapse Canvas Tray"
        >
          ▼
        </button>
      </div>

      {/* Active Tab Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {activeTab && (
          <CanvasTab
            ref={activeCanvasRef}
            tab={activeTab}
            isActive={true}
            onContentChange={handleContentChange}
            onExtractToMain={onExtractToMain}
          />
        )}
      </div>
    </div>
  );
};
