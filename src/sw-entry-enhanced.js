// Enhanced Service Worker Entry Point
// Integrates new persistence layer with existing functionality
// Uses feature flags for gradual migration

import { SessionManager } from './persistence/SessionManager.js';
import { initializePersistenceLayer } from './persistence/index.js';
import { errorHandler } from './utils/ErrorHandler.js';
import { persistenceMonitor } from './debug/PersistenceMonitor.js';

// Feature flags
const HTOS_USE_PERSISTENCE_ADAPTER = globalThis.HTOS_USE_PERSISTENCE_ADAPTER ?? false;
const HTOS_ENABLE_DOCUMENT_PERSISTENCE = globalThis.HTOS_ENABLE_DOCUMENT_PERSISTENCE ?? false;

// Global state
let sessionManager = null;
let persistenceLayer = null;

// Initialize persistence layer
async function initializePersistence() {
  if (!HTOS_USE_PERSISTENCE_ADAPTER) return null;
  
  const operationId = persistenceMonitor.startOperation('INITIALIZE_PERSISTENCE', {
    useAdapter: HTOS_USE_PERSISTENCE_ADAPTER,
    enableDocumentPersistence: HTOS_ENABLE_DOCUMENT_PERSISTENCE
  });
  
  try {
    const { initializePersistenceLayer } = await import('./persistence/index.js');
    persistenceLayer = await initializePersistenceLayer({
      dbName: 'HTOSPersistenceDB',
      version: 1,
      enableMigration: true,
      enableProvenance: globalThis.HTOS_ENABLE_PROVENANCE_TRACKING || false
    });
    
    persistenceMonitor.recordConnection('HTOSPersistenceDB', 1, [
      'sessions', 'threads', 'turns', 'provider_responses', 
      'documents', 'canvas_blocks', 'ghosts', 'provider_contexts', 'metadata'
    ]);
    
    console.log('[SW-Enhanced] Persistence layer initialized');
    persistenceMonitor.endOperation(operationId, { success: true });
    return persistenceLayer;
  } catch (error) {
    persistenceMonitor.endOperation(operationId, null, error);
    const handledError = await errorHandler.handleError(error, {
      operation: 'initializePersistence',
      context: { useAdapter: HTOS_USE_PERSISTENCE_ADAPTER }
    });
    console.error('[SW-Enhanced] Failed to initialize persistence layer:', handledError);
    return null;
  }
}

// Initialize session manager
async function initializeSessionManager() {
  if (sessionManager) return sessionManager;
  
  try {
    sessionManager = new SessionManager();
    await sessionManager.initialize();
    
    // Migrate legacy sessions if persistence is enabled
    if (HTOS_USE_PERSISTENCE_ADAPTER) {
      await sessionManager.migrateLegacySessions();
    }
    
    console.log('[SW-Enhanced] Session manager initialized');
    return sessionManager;
  } catch (error) {
    console.error('[SW-Enhanced] Failed to initialize session manager:', error);
    // Fallback to basic session manager
    sessionManager = { 
      getOrCreateSession: () => ({ id: 'fallback', turns: [] }),
      saveSession: () => Promise.resolve(),
      addTurn: () => Promise.resolve()
    };
    return sessionManager;
  }
}

// Enhanced message handler
async function handleMessage(message, sender, sendResponse) {
  try {
    const sm = await initializeSessionManager();
    
    switch (message.type) {
      case 'GET_SESSION': {
        const operationId = persistenceMonitor.startOperation('GET_SESSION', {
          sessionId: message.sessionId
        });

        try {
          const session = await sm.getOrCreateSession(message.sessionId);
          persistenceMonitor.endOperation(operationId, { sessionFound: !!session });
          sendResponse({ success: true, session });
        } catch (error) {
          persistenceMonitor.endOperation(operationId, null, error);
          try {
            await errorHandler.handleError(error, {
              operation: 'getSession',
              sessionId: message.sessionId,
              retry: () => sm.getOrCreateSession(message.sessionId)
            });
          } catch (handledError) {
            sendResponse({ success: false, error: handledError.message });
          }
        }
        break;
      }
        
      case 'SAVE_TURN':
        await sm.addTurn(message.sessionId, message.turn);
        sendResponse({ success: true });
        break;
        
      case 'UPDATE_PROVIDER_CONTEXT':
        await sm.updateProviderContext(
          message.sessionId,
          message.providerId,
          message.context
        );
        sendResponse({ success: true });
        break;
        
      case 'CREATE_THREAD':
        const thread = await sm.createThread(
          message.sessionId,
          message.title,
          message.sourceAiTurnId
        );
        sendResponse({ success: true, thread });
        break;
        
      case 'SWITCH_THREAD':
        await sm.switchThread(message.sessionId, message.threadId);
        sendResponse({ success: true });
        break;
        
      case 'DELETE_SESSION':
        await sm.deleteSession(message.sessionId);
        sendResponse({ success: true });
        break;
        
      case 'GET_PERSISTENCE_STATUS':
        const status = {
          persistenceEnabled: HTOS_USE_PERSISTENCE_ADAPTER,
          documentPersistenceEnabled: HTOS_ENABLE_DOCUMENT_PERSISTENCE,
          sessionManagerType: sm.constructor.name,
          persistenceLayerAvailable: !!persistenceLayer
        };
        sendResponse({ success: true, status });
        break;
        
      case 'ENABLE_PERSISTENCE':
        if (sm.enablePersistenceAdapter) {
          await sm.enablePersistenceAdapter();
          globalThis.HTOS_USE_PERSISTENCE_ADAPTER = true;
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Persistence adapter not available' });
        }
        break;
        
      case 'DISABLE_PERSISTENCE':
        if (sm.disablePersistenceAdapter) {
          await sm.disablePersistenceAdapter();
          globalThis.HTOS_USE_PERSISTENCE_ADAPTER = false;
          sendResponse({ success: false });
        } else {
          sendResponse({ success: false, error: 'Persistence adapter not available' });
        }
        break;
        
      // Document-related messages (when document persistence is enabled)
      case 'SAVE_DOCUMENT':
        if (HTOS_ENABLE_DOCUMENT_PERSISTENCE && persistenceLayer) {
          await persistenceLayer.documentManager.saveDocument(
            message.documentId,
            message.document,
            message.content
          );
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Document persistence not enabled' });
        }
        break;
        
      case 'LOAD_DOCUMENT':
        if (HTOS_ENABLE_DOCUMENT_PERSISTENCE && persistenceLayer) {
          const document = await persistenceLayer.documentManager.loadDocument(
            message.documentId,
            message.reconstructContent
          );
          sendResponse({ success: true, document });
        } else {
          sendResponse({ success: false, error: 'Document persistence not enabled' });
        }
        break;
        
      case 'CREATE_GHOST':
        if (HTOS_ENABLE_DOCUMENT_PERSISTENCE && persistenceLayer) {
          const ghost = await persistenceLayer.documentManager.createGhost(
            message.documentId,
            message.text,
            message.provenance
          );
          sendResponse({ success: true, ghost });
        } else {
          sendResponse({ success: false, error: 'Document persistence not enabled' });
        }
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('[SW-Enhanced] Message handler error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Enhanced startup sequence
async function startup() {
  console.log('[SW-Enhanced] Starting up...');
  
  // Initialize persistence layer first
  if (HTOS_USE_PERSISTENCE_ADAPTER) {
    await initializePersistence();
  }
  
  // Initialize session manager
  await initializeSessionManager();
  
  // Set up message listeners
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only handle enhanced persistence messages, let original handler deal with others
    if (message.type && [
      'GET_SESSION', 'SAVE_TURN', 'UPDATE_PROVIDER_CONTEXT', 'CREATE_THREAD',
      'SWITCH_THREAD', 'DELETE_SESSION', 'GET_PERSISTENCE_STATUS',
      'ENABLE_PERSISTENCE', 'DISABLE_PERSISTENCE', 'SAVE_DOCUMENT',
      'LOAD_DOCUMENT', 'CREATE_GHOST', 'GET_HEALTH_STATUS'
    ].includes(message.type)) {
      handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    }
    // Let other messages pass through to original handlers
  });
  
  // Set up install/update handlers
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[SW-Enhanced] Extension installed/updated:', details.reason);
    
    if (details.reason === 'update' && HTOS_USE_PERSISTENCE_ADAPTER) {
      // Trigger migration on update
      const sm = await initializeSessionManager();
      if (sm.migrateLegacySessions) {
        await sm.migrateLegacySessions();
      }
    }
  });
  
  // Periodic cleanup and maintenance
  setInterval(async () => {
    try {
      if (persistenceLayer && persistenceLayer.adapter) {
        // Cleanup old data
        await persistenceLayer.adapter.cleanup();
      }
    } catch (error) {
      console.error('[SW-Enhanced] Cleanup error:', error);
    }
  }, 60000 * 30); // Every 30 minutes
  
  console.log('[SW-Enhanced] Startup complete');
}

// Health check endpoint
async function getHealthStatus() {
  const sm = await initializeSessionManager();
  
  return {
    timestamp: Date.now(),
    serviceWorker: 'active',
    sessionManager: sm ? 'initialized' : 'failed',
    persistenceLayer: persistenceLayer ? 'active' : 'disabled',
    featureFlags: {
      persistenceAdapter: HTOS_USE_PERSISTENCE_ADAPTER,
      documentPersistence: HTOS_ENABLE_DOCUMENT_PERSISTENCE
    }
  };
}

// Export for testing and debugging
globalThis.__HTOS_ENHANCED_SW = {
  getHealthStatus,
  getSessionManager: () => sessionManager,
  getPersistenceLayer: () => persistenceLayer,
  reinitialize: startup,
  runTests: async () => {
    try {
      const { PersistenceIntegrationTest } = await import('./test-persistence-integration.js');
      const tester = new PersistenceIntegrationTest();
      return await tester.runAllTests();
    } catch (error) {
      console.error('Failed to run persistence tests:', error);
      throw error;
    }
  }
};

// Start the enhanced service worker
startup().catch(error => {
  console.error('[SW-Enhanced] Startup failed:', error);
});

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('[SW-Enhanced] Browser startup detected');
});

// Handle extension suspend/resume
chrome.runtime.onSuspend.addListener(() => {
  console.log('[SW-Enhanced] Service worker suspending');
});

chrome.runtime.onSuspendCanceled.addListener(() => {
  console.log('[SW-Enhanced] Service worker suspend canceled');
});