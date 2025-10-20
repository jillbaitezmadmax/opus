import { NodeViewWrapper } from '@tiptap/react';
import { ProvenanceData } from './ComposedContentNode';

const getProviderColor = (providerId: string) => {
  const colors: Record<string, string> = {
    'openai': '#10a37f',
    'anthropic': '#8b5cf6',
    'google': '#4285f4',
    'xai': '#ff6b35',
    'alibaba': '#ff6a00',
  };
  return colors[providerId] || '#6b7280';
};

export default function ComposedBlockView({ node, deleteNode }: any) {
  const provenance = node.attrs.provenance as ProvenanceData;
  
  return (
    <NodeViewWrapper className="composed-block-wrapper">
      <div
        className="composed-block"
        style={{
          borderLeft: `3px solid ${getProviderColor(provenance.providerId)}`,
          padding: '12px',
          margin: '8px 0',
          background: '#f9fafb',
          borderRadius: '4px',
          position: 'relative',
        }}
      >
        {/* Provenance header */}
        <div
          style={{
            fontSize: '10px',
            color: '#6b7280',
            marginBottom: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            <strong>{provenance.providerId}</strong> • {provenance.granularity} • {provenance.responseType}
          </span>
          <button
            onClick={deleteNode}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '14px',
            }}
            title="Remove block"
          >
            ×
          </button>
        </div>
        
        {/* Content (editable) */}
        <div contentEditable suppressContentEditableWarning>
          {node.textContent}
        </div>
      </div>
    </NodeViewWrapper>
  );
}