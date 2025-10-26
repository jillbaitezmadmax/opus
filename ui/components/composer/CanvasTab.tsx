import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { CanvasScratchpad, CanvasScratchpadRef } from './CanvasScratchpad';
import { JSONContent } from '@tiptap/react';
import { ProvenanceData } from './extensions/ComposedContentNode';

export interface CanvasTabData {
  id: string;
  title: string;
  content: JSONContent;
  createdAt: number;
  updatedAt: number;
}

interface CanvasTabProps {
  tab: CanvasTabData;
  isActive: boolean;
  onContentChange: (tabId: string, content: JSONContent) => void;
  onExtractToMain?: (content: string, provenance: ProvenanceData) => void;
}

export const CanvasTab = forwardRef<CanvasScratchpadRef, CanvasTabProps>(({
  tab,
  isActive,
  onContentChange,
  onExtractToMain,
}, ref) => {
  const editorRef = useRef<CanvasScratchpadRef>(null);

  useImperativeHandle(ref, () => ({
    insertComposedContent: (content: string, provenance: ProvenanceData, position?: number) => {
      editorRef.current?.insertComposedContent(content, provenance, position);
    },
    getContent: () => editorRef.current?.getContent() || { type: 'doc', content: [] },
    getText: () => editorRef.current?.getText() || '',
    clear: () => editorRef.current?.clear(),
    focus: () => editorRef.current?.focus(),
  }), []);

  useEffect(() => {
    if (isActive && editorRef.current) {
      editorRef.current.focus();
    }
  }, [isActive]);

  const handleChange = (content: JSONContent) => {
    onContentChange(tab.id, content);
  };

  if (!isActive) {
    return null;
  }

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f172a',
      }}
    >
      {/* Tab Content Area */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <CanvasScratchpad
          ref={editorRef}
          initialContent={tab.content}
          placeholder={`Canvas: ${tab.title}`}
          onChange={handleChange}
          className="canvas-scratchpad"
        />
      </div>

      {/* Optional: Quick Actions Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderTop: '1px solid #334155',
          background: '#0b1220',
        }}
      >
        <button
          onClick={() => {
            const event = new CustomEvent('open-canvas-workspace', {
              detail: { tabId: tab.id },
              bubbles: true,
            });
            document.dispatchEvent(event);
          }}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #334155',
            background: '#1e293b',
            color: '#e2e8f0',
            fontSize: 12,
            cursor: 'pointer',
          }}
          title="Open this canvas as a full workspace"
        >
          ⤢ Open as Workspace
        </button>
        <button
          onClick={() => {
            if (editorRef.current) {
              // Prefer provenance-preserving extraction per composed block
              const json = editorRef.current.getContent();
              const extractions: { text: string; provenance: ProvenanceData }[] = [];
              let plainText = '';

              const extractText = (node: any): string => {
                if (!node) return '';
                if (typeof node.text === 'string') return node.text;
                const children = Array.isArray(node.content) ? node.content : [];
                return children.map(extractText).join('');
              };

              const walk = (node: any) => {
                if (!node) return;
                if (node.type === 'composedContent' && node.attrs?.provenance) {
                  const text = extractText(node);
                  if (text.trim()) {
                    extractions.push({ text, provenance: node.attrs.provenance as ProvenanceData });
                  }
                } else {
                  // Accumulate plain text from non-composed nodes
                  plainText += extractText(node);
                }

                const children = Array.isArray(node.content) ? node.content : [];
                for (const child of children) walk(child);
              };

              walk(json);

              // Dispatch composed blocks first to preserve model provenance
              for (const item of extractions) {
                onExtractToMain?.(item.text, item.provenance);
              }

              // Then include any free-typed canvas text (as canvas provenance)
              if (plainText.trim()) {
                const provenance: ProvenanceData = {
                  sessionId: 'canvas',
                  aiTurnId: tab.id,
                  providerId: 'canvas',
                  responseType: 'batch',
                  responseIndex: 0,
                  timestamp: Date.now(),
                  granularity: 'full',
                  sourceText: plainText,
                };
                onExtractToMain?.(plainText, provenance);
              }
            }
          }}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #334155',
            background: '#1e293b',
            color: '#e2e8f0',
            fontSize: 12,
            cursor: 'pointer',
          }}
          title="Extract all content to main canvas"
        >
          ↑ Extract to Main
        </button>
        <button
          onClick={() => {
            if (editorRef.current) {
              editorRef.current.clear();
            }
          }}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #334155',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: 12,
            cursor: 'pointer',
          }}
          title="Clear canvas"
        >
          Clear
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {new Date(tab.updatedAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
});

CanvasTab.displayName = 'CanvasTab';
