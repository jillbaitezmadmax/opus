// Enhanced Service Worker Integration
// Import enhanced functionality while maintaining backward compatibility
import './sw-entry-enhanced.js';
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
import { Orchestrator } from "./orchestrator/orchestrator.js"; // Legacy Orchestrator used by FaultTolerant one.
import { ConnectionHandler } from "./core/connection-handler.js";

// Ensure fetch is correctly bound
try {
  if (typeof fetch === "function" && typeof globalThis !== "undefined") {
    globalThis.fetch = fetch.bind(globalThis);
  }
} catch (_) {}

// Initialize BusController globally
self.BusController = BusController;

// =============================================================================
// PERSISTENT OFFSCREEN DOCUMENT CONTROLLER
// =============================================================================
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

// =============================================================================
// SESSION MANAGER (Source of Truth for Session Data)
// =============================================================================
import { SessionManager as EnhancedSessionManager } from './persistence/SessionManager.js';

// Feature flag for persistence layer - can be enabled via environment or runtime
// Set to true to enable the new persistence layer with IndexedDB
globalThis.HTOS_USE_PERSISTENCE_ADAPTER = false;

// Backward compatibility: keep the global sessions object
const __HTOS_SESSIONS = (self.__HTOS_SESSIONS = self.__HTOS_SESSIONS || {});

// Use enhanced SessionManager with persistence adapter support
class SessionManager extends EnhancedSessionManager {
  constructor() {
    super();
    // Ensure backward compatibility with existing global sessions
    this.sessions = __HTOS_SESSIONS;
  }

}

const sessionManager = new SessionManager();

// =============================================================================
// PROVIDER ADAPTER REGISTRY
// =============================================================================
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
self.providerRegistry = providerRegistry; // For debugging

// =============================================================================
// FAULT-TOLERANT ORCHESTRATOR WRAPPER
// =============================================================================
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

// =============================================================================
// PORT CONNECTIONS -> ConnectionHandler per port
// =============================================================================
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


// =============================================================================
// EXTENSION ACTION HANDLER
// =============================================================================
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

// =============================================================================
// GLOBAL INFRASTRUCTURE INITIALIZATION
// =============================================================================
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

// =============================================================================
// PROVIDER INITIALIZATION
// =============================================================================
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

// =============================================================================
// ORCHESTRATOR INITIALIZATION
// =============================================================================
async function initializeOrchestrator() {
  try {
    self.lifecycleManager = new LifecycleManager();
    self.faultTolerantOrchestrator = new FaultTolerantOrchestrator();
    console.log("[SW] ✓ FaultTolerantOrchestrator initialized");
  } catch (e) {
    console.error("[SW] Orchestrator init failed", e);
  }
}

// =============================================================================
// GLOBAL SERVICES (single-shot initialization)
// =============================================================================
let globalServicesReady = null;

async function initializeGlobalServices() {
  if (globalServicesReady) return globalServicesReady;

  globalServicesReady = (async () => {
    console.log("[SW] Initializing global services...");
    await initializeGlobalInfrastructure();
    await initializeProviders();
    await initializeOrchestrator();
    const compiler = new WorkflowCompiler(sessionManager);
    console.log("[SW] Global services ready");
    return {
      orchestrator: self.faultTolerantOrchestrator,
      sessionManager: sessionManager,
      compiler,
    };
  })();

  return globalServicesReady;
}

// =============================================================================
// RUNTIME MESSAGE HANDLER (for history, system status etc.)
// =============================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request?.type || request.$bus) return false;

    switch(request.type) {
        case 'GET_FULL_HISTORY':
            const sessions = Object.values(sessionManager.sessions || {})
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
        
        case 'GET_HISTORY_SESSION':
            const session = sessionManager.sessions[request.sessionId];
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
        
        case 'GET_SYSTEM_STATUS':
             sendResponse({ success: true, data: { availableProviders: providerRegistry.listProviders() }});
             return true;
    }
    return false; // Indicate we are not handling this message asynchronously
});


// =============================================================================
// MAIN INITIALIZATION SEQUENCE
// =============================================================================
(async () => {
  try {
    await initializeGlobalServices();
    SWBootstrap.init();
    console.log("[SW] 🚀 Bootstrap complete. System ready.");
  } catch (e) {
    console.error("[SW] Bootstrap failed:", e);
  }
})();