import { LLMProvider } from '../types';
import { LLM_PROVIDERS_CONFIG } from '../constants';

interface ModelTrayProps {
  selectedModels: Record<string, boolean>;
  onToggleModel: (providerId: string) => void;
  isLoading?: boolean;
  // Think-mode (global) toggle for ChatGPT
  thinkOnChatGPT?: boolean;
  onToggleThinkChatGPT?: () => void;
  // Synthesis provider selection
  synthesisProvider?: string | null;
  onSetSynthesisProvider?: (providerId: string | null) => void;
  // Mapping controls
  mappingEnabled?: boolean;
  onToggleMapping?: (enabled: boolean) => void;
  mappingProvider?: string | null;
  onSetMappingProvider?: (providerId: string | null) => void;
  // Power user mode
  powerUserMode?: boolean;
  synthesisProviders?: string[];
  onToggleSynthesisProvider?: (providerId: string) => void;
}

const ModelTray = ({ 
  selectedModels, 
  onToggleModel, 
  isLoading = false, 
  thinkOnChatGPT = false, 
  onToggleThinkChatGPT, 
  synthesisProvider, 
  onSetSynthesisProvider,
  mappingEnabled = false,
  onToggleMapping,
  mappingProvider,
  onSetMappingProvider,
  powerUserMode = false,
  synthesisProviders = [],
  onToggleSynthesisProvider
}: ModelTrayProps) => {
  // Calculate active models count
  const activeCount = Object.values(selectedModels).filter(Boolean).length;
  const hasMultipleModels = activeCount >= 2;
  
  // Get selected providers for advanced controls
  const selectedProviderIds = Object.keys(selectedModels).filter(id => selectedModels[id]);
  const selectedProviders = LLM_PROVIDERS_CONFIG.filter(provider => selectedProviderIds.includes(provider.id));

  return (
    <div
      className="model-tray"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '12px 12px 0 0',
        borderBottom: 'none',
        position: 'relative', // Added this line
      }}
    >
      {/* Model Selection Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            fontSize: '12px',
            color: '#94a3b8',
            fontWeight: 500,
            marginRight: '8px',
          }}
        >
          Models:
        </span>
        
        {LLM_PROVIDERS_CONFIG.map((provider: LLMProvider) => {
          const isSelected = selectedModels[provider.id];
          return (
            <div key={provider.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => !isLoading && onToggleModel(provider.id)}
                disabled={isLoading}
                title={`${isSelected ? 'Deselect' : 'Select'} ${provider.name}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: isSelected 
                    ? 'rgba(99, 102, 241, 0.2)' 
                    : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${
                    isSelected 
                      ? 'rgba(99, 102, 241, 0.4)' 
                      : 'rgba(255, 255, 255, 0.1)'
                  }`,
                  borderRadius: '8px',
                  color: isSelected ? '#a5b4fc' : '#64748b',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  opacity: isLoading ? 0.6 : (isSelected ? 1 : 0.7),
                  transform: 'scale(1)',
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.background = isSelected 
                      ? 'rgba(99, 102, 241, 0.3)' 
                      : 'rgba(255, 255, 255, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.background = isSelected 
                      ? 'rgba(99, 102, 241, 0.2)' 
                      : 'rgba(255, 255, 255, 0.05)';
                  }
                }}
              >
                {/* Model Logo */}
                <div
                  className={`model-logo ${provider.logoBgClass}`}
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '3px',
                    opacity: isSelected ? 1 : 0.6,
                  }}
                />
                
                {/* Model Name */}
                <span>{provider.name}</span>
                
                {/* Selection Indicator */}
                <span
                  style={{
                    fontSize: '10px',
                    opacity: isSelected ? 1 : 0.4,
                  }}
                >
                  {isSelected ? '✓' : '○'}
                </span>
              </button>
            </div>
          );
        })}

        {/* Active Count Indicator */}
        <div
          style={{
            marginLeft: 'auto',
            fontSize: '11px',
            color: '#64748b',
            padding: '4px 8px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '6px',
          }}
        >
          {activeCount} selected
        </div>
      </div>

      {/* Advanced Controls - Only show when multiple models are selected */}
      {hasMultipleModels && (
        <div style={{ display: 'flex', gap: '16px' }}>
          {/* Left Column - Synthesis Controls */}
          <div style={{ flex: 1 }}>
            <div style={{ 
              fontSize: '12px', 
              color: '#94a3b8', 
              fontWeight: 500, 
              marginBottom: '8px' 
            }}>
              {powerUserMode ? '⭐ Synthesis (Multi-Select)' : '⭐ Synthesis'}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {selectedProviders.map((provider) => {
                const isSelected = powerUserMode 
                  ? synthesisProviders.includes(provider.id)
                  : synthesisProvider === provider.id;
                
                return (
                  <button
                    key={provider.id}
                    onClick={() => {
                      if (isLoading) return;
                      if (powerUserMode && onToggleSynthesisProvider) {
                        onToggleSynthesisProvider(provider.id);
                      } else if (onSetSynthesisProvider) {
                        onSetSynthesisProvider(isSelected ? null : provider.id);
                      }
                    }}
                    disabled={isLoading}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      background: isSelected 
                        ? 'rgba(251, 191, 36, 0.2)' 
                        : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${
                        isSelected 
                          ? 'rgba(251, 191, 36, 0.4)' 
                          : 'rgba(255, 255, 255, 0.1)'
                      }`,
                      borderRadius: '6px',
                      color: isSelected ? '#fbbf24' : '#64748b',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {provider.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column - Mapping Controls */}
          <div style={{ flex: 1 }}>
            <div style={{ 
              fontSize: '12px', 
              color: '#94a3b8', 
              fontWeight: 500, 
              marginBottom: '8px' 
            }}>
              🔀 Mapping
            </div>
            
            {/* Mapping Enable Checkbox */}
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={mappingEnabled}
                  onChange={(e) => !isLoading && onToggleMapping?.(e.target.checked)}
                  disabled={isLoading}
                  style={{
                    width: '14px',
                    height: '14px',
                    accentColor: '#6366f1',
                  }}
                />
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Enable Mapping
                </span>
              </label>
            </div>

            {/* Mapping Provider Selection - Only show when enabled */}
            {mappingEnabled && (
              <>
                <div style={{ 
                  fontSize: '11px', 
                  color: '#94a3b8', 
                  marginBottom: '6px' 
                }}>
                  Mapping Provider:
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {selectedProviders.map((provider) => {
                    const isSelected = mappingProvider === provider.id;
                    
                    return (
                      <button
                        key={provider.id}
                        onClick={() => {
                          if (isLoading) return;
                          onSetMappingProvider?.(provider.id);
                        }}
                        disabled={isLoading}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          background: isSelected 
                            ? 'rgba(34, 197, 94, 0.2)' 
                            : 'rgba(255, 255, 255, 0.05)',
                          border: `1px solid ${
                            isSelected 
                              ? 'rgba(34, 197, 94, 0.4)' 
                              : 'rgba(255, 255, 255, 0.1)'
                          }`,
                          borderRadius: '6px',
                          color: isSelected ? '#22c55e' : '#64748b',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {provider.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Think Toggle - Only show when ChatGPT is selected */}
      {selectedModels.chatgpt && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => !isLoading && onToggleThinkChatGPT?.()}
            disabled={isLoading}
            title={`Think mode for ChatGPT ${thinkOnChatGPT ? 'ON' : 'OFF'}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              background: thinkOnChatGPT ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${thinkOnChatGPT ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: '999px',
              color: thinkOnChatGPT ? '#a5b4fc' : '#64748b',
              fontSize: '12px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: '14px' }}>🤔</span>
            <span>Think (ChatGPT)</span>
            <span style={{ fontSize: '10px', opacity: thinkOnChatGPT ? 1 : 0.7 }}>{thinkOnChatGPT ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ModelTray;