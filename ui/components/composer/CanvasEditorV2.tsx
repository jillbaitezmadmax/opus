import React, { useEffect, useImperativeHandle, forwardRef } from 'react';
import { useEditor, EditorContent, JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { ComposedContent, ProvenanceData } from './extensions/ComposedContentNode';
import { useDroppable } from '@dnd-kit/core';

interface CanvasEditorProps {
  initialContent?: JSONContent;
  placeholder?: string;
  onChange?: (content: JSONContent) => void;
  onDrop?: (data: any, position: number) => void;
  className?: string;
}

export interface CanvasEditorRef {
  insertComposedContent: (content: string, provenance: ProvenanceData, position?: number) => void;
  getContent: () => JSONContent;
  getText: () => string;
  clear: () => void;
  focus: () => void;
}

export const CanvasEditorV2 = forwardRef<CanvasEditorRef, CanvasEditorProps>(({
  initialContent,
  placeholder = 'Drag content here to start composing...',
  onChange,
  onDrop,
  className = '',
}, ref) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'canvas-dropzone',
    data: { type: 'canvas' },
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable default heading and paragraph handling to use our custom nodes
        heading: false,
      }),
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
        class: `prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none ${className}`,
        style: 'min-height: 200px; padding: 16px;',
      },
      handleDrop: (view, event, slice, moved) => {
        // Let TipTap handle the drop, we'll intercept via DnD Kit
        return false;
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

  useEffect(() => {
    if (editor && initialContent) {
      editor.commands.setContent(initialContent);
    }
  }, [editor, initialContent]);

  return (
    <div 
      ref={setNodeRef}
      className={`canvas-editor-container ${isOver ? 'drop-target-active' : ''}`}
      style={{
        minHeight: '400px',
        border: '2px dashed #e5e7eb',
        borderRadius: '8px',
        transition: 'all 0.2s ease',
        backgroundColor: isOver ? '#f3f4f6' : 'transparent',
        borderColor: isOver ? '#8b5cf6' : '#e5e7eb',
      }}
    >
      <EditorContent editor={editor} />
      
      {/* Drop zone overlay when dragging */}
      {isOver && (
        <div className="absolute inset-0 bg-purple-50 bg-opacity-50 flex items-center justify-center pointer-events-none">
          <div className="bg-purple-100 text-purple-700 px-4 py-2 rounded-lg font-medium">
            Drop content here
          </div>
        </div>
      )}
      
      <style>{`
        .canvas-editor-container {
          position: relative;
        }
        
        .canvas-editor-container .ProseMirror {
          outline: none;
        }
        
        .canvas-editor-container .is-editor-empty::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        
        .composed-block {
          margin: 12px 0;
          transition: all 0.2s ease;
        }
        
        .composed-block:hover {
          transform: translateX(2px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .composed-block::before {
          content: '';
          position: absolute;
          left: -16px;
          top: 50%;
          transform: translateY(-50%);
          width: 4px;
          height: 20px;
          background: currentColor;
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        
        .composed-block:hover::before {
          opacity: 0.3;
        }
        
        .drop-target-active {
          border-style: solid !important;
        }
      `}</style>
    </div>
  );
});