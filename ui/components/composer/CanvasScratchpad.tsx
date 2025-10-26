import React, { useImperativeHandle, forwardRef } from 'react';
import { useEditor, EditorContent, JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { ComposedContent, ProvenanceData } from './extensions/ComposedContentNode';

interface CanvasScratchpadProps {
  initialContent?: JSONContent;
  placeholder?: string;
  onChange?: (content: JSONContent) => void;
  className?: string;
}

export interface CanvasScratchpadRef {
  insertComposedContent: (content: string, provenance: ProvenanceData, position?: number) => void;
  getContent: () => JSONContent;
  getText: () => string;
  clear: () => void;
  focus: () => void;
}

export const CanvasScratchpad = forwardRef<CanvasScratchpadRef, CanvasScratchpadProps>(({
  initialContent,
  placeholder = 'Drag content here or type...',
  onChange,
  className = '',
}, ref) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      ComposedContent,
    ],
    content: initialContent || '',
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm focus:outline-none ${className}`,
        style: 'min-height: 100px; padding: 12px;',
      },
    },
  });

  useImperativeHandle(ref, () => ({
    insertComposedContent: (content: string, provenance: ProvenanceData, position?: number) => {
      if (!editor) return;
      editor.commands.insertComposedContent({
        content,
        provenance,
        position,
      });
    },
    getContent: () => editor?.getJSON() || { type: 'doc', content: [] },
    getText: () => editor?.getText() || '',
    clear: () => editor?.commands.clearContent(),
    focus: () => editor?.commands.focus(),
  }), [editor]);

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        background: '#0f172a',
        borderRadius: '4px',
        overflow: 'auto',
        position: 'relative',
      }}
    >
      <EditorContent editor={editor} />
      
      <style>{`
        .canvas-scratchpad .ProseMirror {
          outline: none;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: #e2e8f0;
          font-size: 14px;
          line-height: 1.6;
        }
        
        .canvas-scratchpad .is-editor-empty::before {
          content: attr(data-placeholder);
          float: left;
          color: #64748b;
          pointer-events: none;
          height: 0;
        }
      `}</style>
    </div>
  );
});

CanvasScratchpad.displayName = 'CanvasScratchpad';
