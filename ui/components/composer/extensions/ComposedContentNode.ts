import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

export interface ProvenanceData {
  sessionId: string;
  aiTurnId: string;
  providerId: string;
  responseType: "hidden" | "synthesis" | "batch" | "ensemble";
  responseIndex: number;
  timestamp: number;
  granularity: 'full' | 'paragraph' | 'sentence' | 'selection';
  sourceText?: string;
  originalIndex?: number;
  sourceContext?: {
    fullResponse?: string;
  };
}

export const ComposedContent = Node.create({
  name: 'composedContent',
  group: 'block',
  content: 'inline*',
  
  addAttributes() {
    return {
      provenance: {
        default: null,
        parseHTML: (element) => {
          const provenanceAttr = element.getAttribute('data-provenance');
          try {
            return provenanceAttr ? JSON.parse(provenanceAttr) : null;
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          if (!attributes.provenance) return {};
          return { 
            'data-provenance': JSON.stringify(attributes.provenance),
            'data-provider-id': attributes.provenance.providerId,
            'data-granularity': attributes.provenance.granularity,
          };
        },
      },
      providerId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-provider-id') || '',
        renderHTML: (attributes) => ({ 'data-provider-id': attributes.providerId }),
      },
      granularity: {
        default: 'full',
        parseHTML: (element) => element.getAttribute('data-granularity') || 'full',
        renderHTML: (attributes) => ({ 'data-granularity': attributes.granularity }),
      },
    };
  },
  
  parseHTML() {
    return [
      { tag: 'div[data-provenance]' },
      { tag: 'div.composed-block' },
    ];
  },
  
  renderHTML({ HTMLAttributes, node }) {
    
    const providerColors: Record<string, string> = {
      
      'openai': '#10a37f',
      'anthropic': '#8b5cf6',
      'google': '#4285f4',
      'xai': '#ff6b35',
      'alibaba': '#ff6a00',
      
    };
    
    const providerId = node.attrs.providerId || 'default';
    const borderColor = providerColors[providerId] || '#6b7280';
    
    return [
      'div', 
      mergeAttributes(HTMLAttributes, {
        class: 'composed-block',
        style: `
          border-left: 3px solid ${borderColor};
          padding-left: 12px;
          margin: 8px 0;
          background: rgba(${borderColor.slice(1).match(/.{2}/g)?.map(hex => parseInt(hex, 16)).join(', ') || '107, 114, 128'}, 0.05);
          border-radius: 4px;
          position: relative;
        `,
        'data-composer-block': 'true',
        title: `${node.attrs.provenance?.providerId} • ${node.attrs.provenance?.granularity}`, // Tooltip
      }), 
      0,
    ];
  },
  
  addCommands() {
    return {
      insertComposedContent:
        (options) =>
        ({ commands }: CommandProps) => {
          return commands.insertContentAt(
            options.position ?? this.editor.state.selection.to,
            {
              type: this.name,
              attrs: {
                provenance: options.provenance,
                providerId: options.provenance.providerId,
                granularity: options.provenance.granularity,
              },
              content: [{ type: 'text', text: options.content }],
            }
          );
        },
      deleteComposedBlock:
        (position) =>
        ({ commands }: CommandProps) => {
          return commands.deleteRange({
            from: position,
            to: position + 1,
          });
        }
    }
  }
});


declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    composedContent: {
      insertComposedContent: (options: {
        content: string;
        provenance: ProvenanceData;
        position?: number;
      }) => ReturnType;
      deleteComposedBlock: (position: number) => ReturnType;
    };
  }
}