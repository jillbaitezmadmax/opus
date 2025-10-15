// ============================================================================
// UNIFIED SERVICE WORKER ENTRY POINT
// Combines persistence layer, provider management, and message routing
// ============================================================================

// Core Infrastructure Imports
import {
  NetRulesManager,
  CSPController,
  UserAgentController,
  ArkoseController,
  BusController,
  LifecycleManager,
  HTOSRequestLifecycleManager,
  utils,
} from "./core/vendor-exports.js";
import { WorkflowCompiler } from "./core/workflow-compiler.js";
import { SWBootstrap } from "./HTOS/ServiceWorkerBootstrap.js";
import { ClaudeAdapter } from "./providers/claude-adapter.js";
import { GeminiAdapter } from "./providers/gemini-adapter.js";
import { ChatGPTAdapter } from "./providers/chatgpt-adapter.js";
import { QwenAdapter } from "./providers/qwen-adapter.js";
import { ClaudeProviderController } from "./providers/claude.js";
import { GeminiProviderController } from "./providers/gemini.js";
import { ChatGPTProviderController } from "./providers/chatgpt.js";
import { QwenProviderController } from "./providers/qwen.js";
import { DNRUtils } from "./core/dnr-utils.js";
import { ConnectionHandler } from "./core/connection-handler.js";

// Persistence Layer Imports
import { SessionManager } from './persistence/SessionManager.js';
import { initializePersistenceLayer } from './persistence/index.js';
import { errorHandler } from './utils/ErrorHandler.js';
import { persistenceMonitor } from './debug/PersistenceMonitor.js';

// ============================================================================
// FEATURE FLAGS (Source of Truth)
// ============================================================================
// ✅ CHANGED: Enable persistence by default for production use
globalThis.HTOS_USE_PERSISTENCE_ADAPTER = true;
globalThis.HTOS_ENABLE_DOCUMENT_PERSISTENCE = true;
globalThis.HTOS_ENABLE_PROVENANCE_TRACKING = false; // Optional advanced feature

const HTOS_USE_PERSISTENCE_ADAPTER = globalThis.HTOS_USE_PERSISTENCE_ADAPTER;
const HTOS_ENABLE_DOCUMENT_PERSISTENCE = globalThis.HTOS_ENABLE_DOCUMENT_PERSISTENCE;

// ============================================================================
// GLOBAL STATE MANAGEMENT
// ============================================================================
let sessionManager = null;
let persistenceLayer = null;
const __HTOS_SESSIONS = (self.__HTOS_SESSIONS = self.__HTOS_SESSIONS || {});

// Ensure fetch is correctly bound
try {
  if (typeof fetch === "function" && typeof globalThis !== "undefined") {
    globalThis.fetch = fetch.bind(globalThis);
  }
} catch (_) {}

// Initialize BusController globally
self.BusController = BusController;

// ============================================================================
// PERSISTENCE LAYER INITIALIZATION
// ============================================================================
async function initializePersistence() {
  if (!HTOS_USE_PERSISTENCE_ADAPTER) {
    console.log('[SW] Persistence adapter disabled by feature flag');
    return null;
  }
  
  const operationId = persistenceMonitor.startOperation('INITIALIZE_PERSISTENCE', {
    useAdapter: HTOS_USE_PERSISTENCE_ADAPTER,
    enableDocumentPersistence: HTOS_ENABLE_DOCUMENT_PERSISTENCE
  });
  
  try {
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
    
    console.log('[SW] ✅ Persistence layer initialized');
    persistenceMonitor.endOperation(operationId, { success: true });
    return persistenceLayer;
  } catch (error) {
    persistenceMonitor.endOperation(operationId, null, error);
    const handledError = await errorHandler.handleError(error, {
      operation: 'initializePersistence',
      context: { useAdapter: HTOS_USE_PERSISTENCE_ADAPTER }
    });
    console.error('[SW] ❌ Failed to initialize persistence layer:', handledError);
    console.warn('[SW] Falling back to legacy chrome.storage');
    return null;
  }
}

// ============================================================================
// SESSION MANAGER INITIALIZATION
// ============================================================================
async function initializeSessionManager() {
  if (sessionManager) return sessionManager;
  
  try {
    sessionManager = new SessionManager();
    
    // Ensure backward compatibility with global sessions object
    sessionManager.sessions = __HTOS_SESSIONS;
    
    await sessionManager.initialize();
    
    // Migrate legacy sessions if persistence is enabled
    if (HTOS_USE_PERSISTENCE_ADAPTER && sessionManager.migrateLegacySessions) {
      await sessionManager.migrateLegacySessions();
    }
    
    console.log('[SW] ✅ Session manager initialized');
    return sessionManager;
  } catch (error) {
    console.error('[SW] ❌ Failed to initialize session manager:', error);
    // Fallback to basic session manager
    sessionManager = { 
      sessions: __HTOS_SESSIONS,
      getOrCreateSession: (sid) => {
        if (!__HTOS_SESSIONS[sid]) {
          __HTOS_SESSIONS[sid] = {
            sessionId: sid,
            providers: {},
            turns: [],
            threads: { 'default-thread': { id: 'default-thread', isActive: true } },
            createdAt: Date.now(),
            lastActivity: Date.now()
          };
        }
        return __HTOS_SESSIONS[sid];
      },
      saveSession: () => Promise.resolve(),
      addTurn: () => Promise.resolve()
    };
    return sessionManager;
  }
}

// ============================================================================
// PERSISTENT OFFSCREEN DOCUMENT CONTROLLER
// ============================================================================
const OffscreenController = {
  _initialized: false,
  async init() {
    if (this._initialized) return;
    console.log('[SW] Initializing persistent offscreen document controller...');
    await this._createOffscreenPageIfMissing();
    if (!self.BusController) {
      self.BusController = BusController;
      await self.BusController.init();
    }
    this._initialized = true;
  },
  async _createOffscreenPageIfMissing() {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.BLOBS, chrome.offscreen.Reason.DOM_PARSER],
        justification: 'HTOS needs persistent offscreen DOM for complex operations and a stable message bus.',
      });
    }
  }
};

// ============================================================================
// PROVIDER ADAPTER REGISTRY
// ============================================================================
class ProviderRegistry {
  constructor() {
    this.adapters = new Map();
    this.controllers = new Map();
  }
  register(providerId, controller, adapter) {
    this.controllers.set(providerId, controller);
    this.adapters.set(providerId, adapter);
  }
  getAdapter(providerId) { return this.adapters.get(String(providerId).toLowerCase()); }
  getController(providerId) { return this.controllers.get(String(providerId).toLowerCase()); }
  listProviders() { return Array.from(this.adapters.keys()); }
  isAvailable(providerId) { return this.adapters.has(String(providerId).toLowerCase()); }
}
const providerRegistry = new ProviderRegistry();
self.providerRegistry = providerRegistry;

// ============================================================================
// FAULT-TOLERANT ORCHESTRATOR WRAPPER
// ============================================================================
class FaultTolerantOrchestrator {
  constructor() {
    this.activeRequests = new Map();
    this.lifecycleManager = self.lifecycleManager;
  }

  async executeParallelFanout(prompt, providers, options = {}) {
    const {
      sessionId = `req-${Date.now()}`,
      onPartial = () => {},
      onAllComplete = () => {},
      useThinking = false,
      providerContexts = {}
    } = options;

    if (this.lifecycleManager) this.lifecycleManager.keepalive(true);

    const results = new Map();
    const errors = new Map();
    const abortControllers = new Map();
    this.activeRequests.set(sessionId, { abortControllers });

    const providerPromises = providers.map(providerId => {
      const abortController = new AbortController();
      abortControllers.set(providerId, abortController);
      
      const adapter = providerRegistry.getAdapter(providerId);
      if (!adapter) {
        errors.set(providerId, new Error(`Provider ${providerId} not available`));
        return Promise.resolve();
      }

      const request = {
        originalPrompt: prompt,
        sessionId,
        meta: { ...(providerContexts[providerId]?.meta || {}), useThinking }
      };

      return adapter.sendPrompt(
        request, 
        (chunk) => onPartial(providerId, typeof chunk === 'string' ? chunk : chunk.text), 
        abortController.signal
      )
        .then(result => results.set(providerId, result))
        .catch(error => errors.set(providerId, error));
    });

    Promise.allSettled(providerPromises).then(() => {
      onAllComplete(results, errors);
      this.activeRequests.delete(sessionId);
      if (this.lifecycleManager) this.lifecycleManager.keepalive(false);
    });
  }

  _abortRequest(sessionId) {
    const request = this.activeRequests.get(sessionId);
    if (request) {
      request.abortControllers.forEach(controller => controller.abort());
      this.activeRequests.delete(sessionId);
      if (this.lifecycleManager) this.lifecycleManager.keepalive(false);
    }
  }
}

// ============================================================================
// GLOBAL INFRASTRUCTURE INITIALIZATION
// ============================================================================
async function initializeGlobalInfrastructure() {
  console.log("[SW] Initializing global infrastructure...");
  try {
    await NetRulesManager.init();
    CSPController.init();
    await UserAgentController.init();
    await ArkoseController.init();
    await DNRUtils.initialize();
    await OffscreenController.init();
    await BusController.init();
    self.bus = BusController;
    console.log("[SW] Global infrastructure initialization complete.");
  } catch (e) {
    console.error("[SW] Core infrastructure init failed", e);
  }
}

// ============================================================================
// PROVIDER INITIALIZATION
// ============================================================================
async function initializeProviders() {
  console.log("[SW] Initializing providers...");
  const providerConfigs = [
    { name: 'claude', Controller: ClaudeProviderController, Adapter: ClaudeAdapter },
    { name: 'gemini', Controller: GeminiProviderController, Adapter: GeminiAdapter },
    { name: 'chatgpt', Controller: ChatGPTProviderController, Adapter: ChatGPTAdapter },
    { name: 'qwen', Controller: QwenProviderController, Adapter: QwenAdapter },
  ];
  for (const config of providerConfigs) {
    try {
      const controller = new config.Controller();
      if (typeof controller.init === 'function') await controller.init();
      const adapter = new config.Adapter(controller);
      if (typeof adapter.init === 'function') await adapter.init();
      providerRegistry.register(config.name, controller, adapter);
      console.log(`[SW] ✓ ${config.name} initialized`);
    } catch (e) {
      console.error(`[SW] Failed to initialize ${config.name}:`, e);
    }
  }
  return providerRegistry.listProviders();
}

// ============================================================================
// ORCHESTRATOR INITIALIZATION
// ============================================================================
async function initializeOrchestrator() {
  try {
    self.lifecycleManager = new LifecycleManager();
    self.faultTolerantOrchestrator = new FaultTolerantOrchestrator();
    console.log("[SW] ✓ FaultTolerantOrchestrator initialized");
  } catch (e) {
    console.error("[SW] Orchestrator init failed", e);
  }
}

// ============================================================================
// GLOBAL SERVICES (single-shot initialization)
// ============================================================================
let globalServicesReady = null;

async function initializeGlobalServices() {
  if (globalServicesReady) return globalServicesReady;

  globalServicesReady = (async () => {
    console.log("[SW] 🚀 Initializing global services...");
    
    // 1. Initialize persistence layer FIRST
    if (HTOS_USE_PERSISTENCE_ADAPTER) {
      await initializePersistence();
    }
    
    // 2. Initialize session manager (depends on persistence)
    await initializeSessionManager();
    
    // 3. Initialize infrastructure
    await initializeGlobalInfrastructure();
    
    // 4. Initialize providers
    await initializeProviders();
    
    // 5. Initialize orchestrator
    await initializeOrchestrator();
    
    // 6. Create compiler
    const compiler = new WorkflowCompiler(sessionManager);
    
    console.log("[SW] ✅ Global services ready");
    return {
      orchestrator: self.faultTolerantOrchestrator,
      sessionManager: sessionManager,
      compiler,
    };
  })();

  return globalServicesReady;
}

// ============================================================================
// UNIFIED MESSAGE HANDLER
// Handles both legacy history operations AND enhanced persistence operations
// ============================================================================
async function handleUnifiedMessage(message, sender, sendResponse) {
  try {
    const sm = await initializeSessionManager();
    
    switch (message.type) {
      // ========================================================================
      // HISTORY OPERATIONS (Legacy compatibility)
      // ========================================================================
      case 'GET_FULL_HISTORY': {
        const sessions = Object.values(sm.sessions || {})
          .map(s => ({
            id: s.sessionId,
            sessionId: s.sessionId,
            title: s.title || s.turns?.[0]?.text?.slice(0, 50) || 'New Chat',
            startTime: s.createdAt,
            lastActivity: s.lastActivity,
            messageCount: (s.turns?.length || 0),
            firstMessage: s.turns?.[0]?.text || ''
          }))
          .sort((a, b) => b.lastActivity - a.lastActivity);
        sendResponse({ success: true, data: { sessions } });
        return true;
      }
      
      case 'GET_HISTORY_SESSION': {
        const session = sm.sessions[message.sessionId];
        if (session) {
          const transformed = {
            id: session.sessionId,
            sessionId: session.sessionId,
            title: session.title,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            turns: session.turns || [],
            providerContexts: session.providers || {}
          };
          sendResponse({ success: true, data: transformed });
        } else {
          sendResponse({ success: false, error: 'Session not found' });
        }
        return true;
      }
      
      case 'GET_SYSTEM_STATUS': {
        sendResponse({ 
          success: true, 
          data: { 
            availableProviders: providerRegistry.listProviders(),
            persistenceEnabled: HTOS_USE_PERSISTENCE_ADAPTER,
            documentsEnabled: HTOS_ENABLE_DOCUMENT_PERSISTENCE,
            sessionManagerType: sm.constructor.name,
            persistenceLayerAvailable: !!persistenceLayer
          }
        });
        return true;
      }
      
      // ========================================================================
      // PERSISTENCE OPERATIONS (Enhanced functionality)
      // ========================================================================
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
          const handledError = await errorHandler.handleError(error, {
            operation: 'getSession',
            sessionId: message.sessionId,
            retry: () => sm.getOrCreateSession(message.sessionId)
          });
          sendResponse({ success: false, error: handledError.message });
        }
        return true;
      }
        
      case 'SAVE_TURN': {
        await sm.addTurn(message.sessionId, message.turn);
        sendResponse({ success: true });
        return true;
      }
        
      case 'UPDATE_PROVIDER_CONTEXT': {
        await sm.updateProviderContext(
          message.sessionId,
          message.providerId,
          message.context
        );
        sendResponse({ success: true });
        return true;
      }
        
      case 'CREATE_THREAD': {
        const thread = await sm.createThread(
          message.sessionId,
          message.title,
          message.sourceAiTurnId
        );
        sendResponse({ success: true, thread });
        return true;
      }
        
      case 'SWITCH_THREAD': {
        await sm.switchThread(message.sessionId, message.threadId);
        sendResponse({ success: true });
        return true;
      }
        
      case 'DELETE_SESSION': {
        await sm.deleteSession(message.sessionId);
        sendResponse({ success: true });
        return true;
      }
        
      case 'GET_PERSISTENCE_STATUS': {
        const status = {
          persistenceEnabled: HTOS_USE_PERSISTENCE_ADAPTER,
          documentPersistenceEnabled: HTOS_ENABLE_DOCUMENT_PERSISTENCE,
          sessionManagerType: sm.constructor.name,
          persistenceLayerAvailable: !!persistenceLayer,
          adapterStatus: sm.getPersistenceStatus ? sm.getPersistenceStatus() : null
        };
        sendResponse({ success: true, status });
        return true;
      }
        
      case 'ENABLE_PERSISTENCE': {
        if (sm.enablePersistenceAdapter) {
          await sm.enablePersistenceAdapter();
          globalThis.HTOS_USE_PERSISTENCE_ADAPTER = true;
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Persistence adapter not available' });
        }
        return true;
      }
        
      case 'DISABLE_PERSISTENCE': {
        if (sm.disablePersistenceAdapter) {
          await sm.disablePersistenceAdapter();
          globalThis.HTOS_USE_PERSISTENCE_ADAPTER = false;
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Persistence adapter not available' });
        }
        return true;
      }
        
      // ========================================================================
      // DOCUMENT OPERATIONS (When document persistence is enabled)
      // ========================================================================
      case 'SAVE_DOCUMENT': {
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
        return true;
      }
        
      case 'LOAD_DOCUMENT': {
        if (HTOS_ENABLE_DOCUMENT_PERSISTENCE && persistenceLayer) {
          const document = await persistenceLayer.documentManager.loadDocument(
            message.documentId,
            message.reconstructContent
          );
          sendResponse({ success: true, document });
        } else {
          sendResponse({ success: false, error: 'Document persistence not enabled' });
        }
        return true;
      }
        
      case 'CREATE_GHOST': {
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
        return true;
      }
        
      default:
        // Unknown message type - don't handle it
        return false;
    }
  } catch (error) {
    console.error('[SW] Message handler error:', error);
    sendResponse({ success: false, error: error.message });
    return true;
  }
}

// ============================================================================
// MESSAGE LISTENER REGISTRATION
// ============================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Ignore bus messages
  if (request?.$bus) return false;
  
  // Handle all messages through unified handler
  if (request?.type) {
    const result = handleUnifiedMessage(request, sender, sendResponse);
    return result; // Keep channel open for async responses
  }
  
  return false;
});

// ============================================================================
// PORT CONNECTIONS -> ConnectionHandler per port
// ============================================================================
chrome.runtime.onConnect.addListener(async (port) => {
  if (port.name !== "htos-popup") return;

  console.log("[SW] New connection received, initializing handler...");

  try {
    const services = await initializeGlobalServices();
    const handler = new ConnectionHandler(port, services);
    await handler.init();
    console.log("[SW] Connection handler ready");
  } catch (error) {
    console.error("[SW] Failed to initialize connection handler:", error);
    try {
      port.postMessage({ type: 'INITIALIZATION_FAILED', error: error.message });
    } catch (_) {}
  }
});

// ============================================================================
// EXTENSION ACTION HANDLER
// ============================================================================
chrome.action?.onClicked.addListener(async () => {
  try {
    const url = chrome.runtime.getURL("ui/index.html");
    const [existingTab] = await chrome.tabs.query({ url });
    if (existingTab?.id) {
      await chrome.tabs.update(existingTab.id, { active: true });
      if (existingTab.windowId) await chrome.windows.update(existingTab.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url });
    }
  } catch (e) {
    console.error("[SW] Failed to open UI tab:", e);
  }
});

// ============================================================================
// INSTALL/UPDATE HANDLERS
// ============================================================================
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[SW] Extension installed/updated:', details.reason);
  
  if (details.reason === 'update' && HTOS_USE_PERSISTENCE_ADAPTER) {
    // Trigger migration on update
    const sm = await initializeSessionManager();
    if (sm.migrateLegacySessions) {
      await sm.migrateLegacySessions();
    }
  }
});

// ============================================================================
// PERIODIC MAINTENANCE
// ============================================================================
setInterval(async () => {
  try {
    if (persistenceLayer?.adapter) {
      // Cleanup old data
      await persistenceLayer.adapter.cleanup();
    }
  } catch (error) {
    console.error('[SW] Cleanup error:', error);
  }
}, 60000 * 30); // Every 30 minutes

// ============================================================================
// LIFECYCLE HANDLERS
// ============================================================================
chrome.runtime.onStartup.addListener(() => {
  console.log('[SW] Browser startup detected');
});

chrome.runtime.onSuspend.addListener(() => {
  console.log('[SW] Service worker suspending');
});

chrome.runtime.onSuspendCanceled.addListener(() => {
  console.log('[SW] Service worker suspend canceled');
});

// ============================================================================
// HEALTH CHECK & DEBUGGING
// ============================================================================
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
    },
    providers: providerRegistry.listProviders()
  };
}

// Export for testing and debugging
globalThis.__HTOS_SW = {
  getHealthStatus,
  getSessionManager: () => sessionManager,
  getPersistenceLayer: () => persistenceLayer,
  getProviderRegistry: () => providerRegistry,
  reinitialize: initializeGlobalServices,
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

// ============================================================================
// MAIN INITIALIZATION SEQUENCE
// ============================================================================
(async () => {
  try {
    await initializeGlobalServices();
    SWBootstrap.init();
    console.log("[SW] 🚀 Bootstrap complete. System ready.");
    
    // Log health status
    const health = await getHealthStatus();
    console.log("[SW] Health Status:", health);
  } catch (e) {
    console.error("[SW] Bootstrap failed:", e);
  }
})();