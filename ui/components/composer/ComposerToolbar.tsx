import RefineButton from './RefineButton';

interface ComposerToolbarProps {
  onExit?: () => void;
  onSave?: () => void;
  onExport?: () => void;
  onRefine?: (selectedModel: string, content: string) => void;
  onToggleDocuments?: () => void;
  isDirty?: boolean;
  isSaving?: boolean;
  isRefining?: boolean;
  showDocumentsPanel?: boolean;
  editorRef: React.RefObject<any>;
}

const ComposerToolbar = ({
  onExit,
  onSave,
  onExport,
  onRefine,
  onToggleDocuments,
  isDirty,
  isSaving = false,
  isRefining = false,
  showDocumentsPanel = false,
  editorRef,
}: ComposerToolbarProps) => {
  return (
    <div
      className="composer-toolbar"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        gap: '16px',
        flexWrap: 'wrap',  // ADD THIS
  minHeight: '60px',  // ADD THIS
      }}
    >
      {/* Left section - Exit and title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={onExit}
          style={{
            background: '#334155',
            border: '1px solid #475569',
            borderRadius: '8px',
            padding: '8px 16px',
            color: '#e2e8f0',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
          aria-label="Exit Composer Mode"
        >
          <span style={{ fontSize: '16px' }}>←</span>
          Back to Chat
        </button>
        
        <div style={{ fontSize: '18px', fontWeight: 600, color: '#e2e8f0' }}>
          Composer Mode
        </div>
        
        {isDirty && (
          <span
            style={{
              fontSize: '12px',
              color: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '16px' }}>●</span>
            Unsaved changes
          </span>
        )}
      </div>
      
      {/* Center section - Title */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px',
        flex: 1,
        justifyContent: 'center'
      }}>
        <h2 style={{ 
          margin: 0, 
          fontSize: '16px', 
          fontWeight: 600, 
          color: '#e2e8f0' 
        }}>
          Composer Mode
        </h2>
        {isDirty && (
          <span style={{
            fontSize: '12px',
            color: '#f59e0b',
            fontWeight: 500,
            background: 'rgba(245, 158, 11, 0.1)',
            padding: '2px 8px',
            borderRadius: '4px',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}>
            Unsaved changes
          </span>
        )}
      </div>
      
      {/* Right section - Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={onToggleDocuments}
          style={{
            background: showDocumentsPanel ? '#3b82f6' : '#334155',
            border: '1px solid',
            borderColor: showDocumentsPanel ? '#3b82f6' : '#475569',
            borderRadius: '8px',
            padding: '8px 16px',
            color: showDocumentsPanel ? '#fff' : '#94a3b8',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
          aria-label="Toggle documents panel"
        >
          <span style={{ fontSize: '16px' }}>📄</span>
          Documents
        </button>
        
        <RefineButton
          onRefine={(selectedModel, content) => {
            // Get content from editor and pass to refine handler
            const editorContent = editorRef.current?.getContent?.() || '';
            onRefine?.(selectedModel, editorContent);
          }}
          isRefining={isRefining}
          disabled={!editorRef.current}
        />
        
        <button
          onClick={onSave}
          disabled={!isDirty || isSaving}
          style={{
            background: isDirty && !isSaving ? '#10b981' : '#334155',
            border: '1px solid',
            borderColor: isDirty && !isSaving ? '#10b981' : '#475569',
            borderRadius: '8px',
            padding: '8px 16px',
            color: isDirty && !isSaving ? '#fff' : '#64748b',
            fontSize: '14px',
            fontWeight: 500,
            cursor: isDirty && !isSaving ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: isDirty && !isSaving ? 1 : 0.6,
          }}
          aria-label="Save composition"
        >
          <span style={{ fontSize: '16px' }}>💾</span>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        
        <button
          onClick={onExport}
          style={{
            background: '#8b5cf6',
            border: '1px solid #8b5cf6',
            borderRadius: '8px',
            padding: '8px 16px',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
          aria-label="Copy to clipboard"
        >
          <span style={{ fontSize: '16px' }}>📋</span>
          Copy
        </button>
      </div>
    </div>
  );
};

export default ComposerToolbar;
