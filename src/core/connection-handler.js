// src/core/connection-handler.js

import { WorkflowEngine } from "./workflow-engine.js";

/**
 * ConnectionHandler
 * 
 * Production-grade pattern for managing port connections.
 * Each UI connection gets its own isolated handler with proper lifecycle.
 * 
 * KEY PRINCIPLES:
 * 1. Connection-scoped: Each port gets its own WorkflowEngine instance
 * 2. Async initialization: Don't attach listeners until backend is ready
 * 3. Proper cleanup: Remove listeners and free resources on disconnect
 * 4. No global state pollution: Everything is encapsulated
 */

export class ConnectionHandler {
  constructor(port, services) {
    this.port = port;
    this.services = services; // { orchestrator, sessionManager, compiler }
    this.workflowEngine = null;
    this.messageHandler = null;
    this.isInitialized = false;
    this.lifecycleManager = services.lifecycleManager;
  }

  /**
   * Async initialization - waits for backend readiness
   */
  async init() {
    if (this.isInitialized) return;

    // Create WorkflowEngine for this connection
    this.workflowEngine = new WorkflowEngine(
      this.services.orchestrator,
      this.services.sessionManager,
      this.port
    );

    // Create message handler bound to this instance
    this.messageHandler = this._createMessageHandler();

    // Attach listener
    this.port.onMessage.addListener(this.messageHandler);

    // Attach disconnect handler
    this.port.onDisconnect.addListener(() => this._cleanup());

    this.isInitialized = true;
    console.log('[ConnectionHandler] Initialized for port:', this.port.name);
    
    // Signal that handler is ready
    this.port.postMessage({ type: 'HANDLER_READY' });
  }

  /**
   * Create the message handler function
   * This is separate so we can properly remove it on cleanup
   */
  _createMessageHandler() {
    return async (message) => {
      if (!message || !message.type) return;

      console.log(`[ConnectionHandler] Received: ${message.type}`);

      try {
        switch (message.type) {
          case 'EXECUTE_WORKFLOW':
            await this._handleExecuteWorkflow(message);
            break;

          case 'KEEPALIVE_PING':
            this.port.postMessage({ 
              type: 'KEEPALIVE_PONG', 
              timestamp: Date.now() 
            });
            break;

          case 'reconnect':
            this.port.postMessage({ 
              type: 'reconnect_ack', 
              serverTime: Date.now() 
            });
            break;

          case 'abort':
            await this._handleAbort(message);
            break;

          default:
            console.warn(`[ConnectionHandler] Unknown message type: ${message.type}`);
        }
      } catch (error) {
        console.error('[ConnectionHandler] Message handling failed:', error);
        this._sendError(message, error);
      }
    };
  }

  /**
   * Handle EXECUTE_WORKFLOW message
   */
  async _handleExecuteWorkflow(message) {
    const executeRequest = message.payload;

    try {
      // Activate lifecycle manager before workflow
      this.lifecycleManager?.activateWorkflowMode();

      // Auto-relocate sessionId if needed (after reconnects or UI drift)
      await this._relocateSessionId(executeRequest);

      // Compile high-level request to detailed workflow
      const workflowRequest = this.services.compiler.compile(executeRequest);

      // Execute via engine
      await this.workflowEngine.execute(workflowRequest);

    } finally {
      // Deactivate lifecycle manager after workflow
      this.lifecycleManager?.deactivateWorkflowMode();
    }
  }

  /**
   * Session relocation guard: if the UI sends sessionId=null for a request that
   * is clearly NOT a new conversation (historical mapping/synthesis or continuation),
   * find the correct session to attach to.
   */
  async _relocateSessionId(executeRequest) {
    try {
      const isHistorical = !!executeRequest?.historicalContext?.userTurnId;
      const isContinuation = executeRequest?.mode === 'continuation';
      const isNew = executeRequest?.mode === 'new-conversation';

      if (isNew) return; // New chat is allowed to pass null to create a session
      if (executeRequest?.sessionId) return; // Already set correctly

      // If historical, search for the session that contains the user turn
      if (isHistorical) {
        const targetTurnId = executeRequest.historicalContext.userTurnId;
        const sessions = this.services.sessionManager?.sessions || {};
        for (const [sid, s] of Object.entries(sessions)) {
          const turns = Array.isArray(s?.turns) ? s.turns : [];
          const idx = turns.findIndex(t => t?.id === targetTurnId && (t?.type === 'user' || t?.role === 'user'));
          if (idx !== -1) {
            executeRequest.sessionId = sid;
            console.warn(`[ConnectionHandler] Relocated historical request to session ${sid}`);
            return;
          }
        }
        // Persistence fallback: lookup turnId to find sessionId
        try {
          const sm = this.services.sessionManager;
          if (sm?.usePersistenceAdapter && sm?.isInitialized && sm.adapter?.isReady()) {
            const turnRecord = await sm.adapter.get('turns', targetTurnId);
            const foundSid = turnRecord?.sessionId;
            if (foundSid) {
              executeRequest.sessionId = foundSid;
              try { await sm.getOrCreateSession(foundSid); } catch (_) {}
              console.warn(`[ConnectionHandler] Relocated historical request via persistence to session ${foundSid}`);
              return;
            }
          }
        } catch (_) { /* non-fatal */ }
        // If not found, let engine fallback search handle it
      }

      // For plain continuation with no explicit historical turn, attach to the most recent session
      if (isContinuation && !executeRequest.sessionId) {
        const sessions = this.services.sessionManager?.sessions || {};
        let bestSid = null;
        let bestTs = -1;
        for (const [sid, s] of Object.entries(sessions)) {
          const ts = Number(s?.lastActivity) || 0;
          if (ts > bestTs) { bestTs = ts; bestSid = sid; }
        }
        if (bestSid) {
          executeRequest.sessionId = bestSid;
          console.warn(`[ConnectionHandler] Relocated continuation request to session ${bestSid}`);
        }
      }
    } catch (e) {
      // Non-fatal; continue as-is
    }
  }

  /**
   * Handle abort message
   */
  async _handleAbort(message) {
    if (message.sessionId && this.services.orchestrator) {
      this.services.orchestrator._abortRequest(message.sessionId);
    }
  }

  /**
   * Send error back to UI
   */
  _sendError(originalMessage, error) {
    this.port.postMessage({
      type: 'WORKFLOW_STEP_UPDATE',
      sessionId: originalMessage.payload?.sessionId || 'unknown',
      stepId: 'handler-error',
      status: 'failed',
      error: error.message || String(error)
    });
  }

  /**
   * Cleanup on disconnect
   */
  _cleanup() {
    console.log('[ConnectionHandler] Cleaning up connection');

    // Deactivate lifecycle manager on disconnect
    this.lifecycleManager?.deactivateWorkflowMode();

    // Remove message listener
    if (this.messageHandler) {
      try {
        this.port.onMessage.removeListener(this.messageHandler);
      } catch (e) {
        // Port may already be dead
      }
    }

    // Null out references for GC
    this.workflowEngine = null;
    this.messageHandler = null;
    this.port = null;
    this.services = null;
    this.lifecycleManager = null;
    this.isInitialized = false;
  }
}
