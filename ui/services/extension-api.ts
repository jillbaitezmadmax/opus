// src/ui/services/extension-api.ts

// This file is now streamlined for the declarative workflow architecture.
// Old imperative methods have been removed in favor of `executeWorkflow`.

import {
  EXECUTE_WORKFLOW,
  GET_FULL_HISTORY,
  GET_HISTORY_SESSION,
  DELETE_SESSION,
  // Keep any non-workflow queries like this if needed
  GET_SYSTEM_STATUS, 
} from "../../shared/messaging";

import type { HistorySessionSummary, HistoryApiResponse } from "../types";
import type { ExecuteWorkflowRequest } from "../../shared/contract";
import { PortHealthManager } from './port-health-manager';

interface BackendApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { message: string };
}

let EXTENSION_ID: string | null = null;
let activePort: chrome.runtime.Port | null = null;
let activeListener: ((message: any) => void) | null = null;

/**
 * A simplified API module for communicating with the extension's backend.
 * It primarily uses a single entry point `executeWorkflow` for all AI tasks
 * and `queryBackend` for simple request-response data fetching.
 */
class ExtensionAPI {
  private portHealthManager: PortHealthManager | null = null;
  private connectionStateCallbacks: Set<(connected: boolean) => void> = new Set();
  private sessionId: string | null = null;
  private port: chrome.runtime.Port | null = null;
  private portMessageHandler: ((message: any) => void) | null = null;

  constructor() {
    this.portHealthManager = new PortHealthManager('htos-popup', {
      onHealthy: () => {
        console.log('[ExtensionAPI] Connection restored');
        this.notifyConnectionState(true);
      },
      onUnhealthy: () => {
        console.warn('[ExtensionAPI] Connection lost');
        this.notifyConnectionState(false);
      },
      onReconnect: () => {
        console.log('[ExtensionAPI] Reconnected to service worker');
        this.notifyConnectionState(true);
      }
    });
  }
  onConnectionStateChange(callback: (connected: boolean) => void): () => void {
    this.connectionStateCallbacks.add(callback);
    return () => this.connectionStateCallbacks.delete(callback);
  }

  private notifyConnectionState(connected: boolean) {
    this.connectionStateCallbacks.forEach(cb => {
      try {
        cb(connected);
      } catch (e) {
        console.error('[ExtensionAPI] Connection state callback error:', e);
      }
    });
  }

  getConnectionStatus() {
    return this.portHealthManager?.getStatus() || {
      isConnected: !!this.port,
      reconnectAttempts: 0,
      lastPongTimestamp: 0,
      timeSinceLastPong: Infinity
    };
  }

  checkHealth() {
    this.portHealthManager?.checkHealth();
  }

  /**
   * Sets the extension ID. This must be called once on application startup.
   */
  setExtensionId(id: string): void {
    if (!EXTENSION_ID) {
      EXTENSION_ID = id;
      console.log("Extension API connected with ID:", EXTENSION_ID);
    }
  }

  /**
   * Creates or retrieves a persistent port connection to the backend.
   * This is used for streaming workflow updates.
   */
  async ensurePort(options: { sessionId?: string; force?: boolean } = {}): Promise<chrome.runtime.Port> {
    const { sessionId, force = false } = options;
    
    if (sessionId) {
      this.sessionId = sessionId;
    }

    if (this.port && !force) {
      const status = this.portHealthManager?.getStatus();
      if (status?.isConnected) {
        return this.port;
      }
    }

    if (this.portHealthManager && this.portMessageHandler) {
      this.port = this.portHealthManager.connect(
        (message) => {
          if (this.portMessageHandler) {
            this.portMessageHandler(message);
          }
        },
        () => {
          console.warn('[ExtensionAPI] Port disconnected');
          this.port = null;
        }
      );
      
      return this.port;
    }

    // Fallback
    this.port = chrome.runtime.connect(EXTENSION_ID!, { name: 'htos-popup' });
    
    this.port.onMessage.addListener((message) => {
      if (this.portMessageHandler) {
        this.portMessageHandler(message);
      }
    });

    this.port.onDisconnect.addListener(() => {
      console.warn('[ExtensionAPI] Port disconnected (fallback mode)');
      this.port = null;
    });

    return this.port;
  }

  /**
   * Registers a single message handler for the active port. 
   * Replaces any existing handler.
   */
  setPortMessageHandler(handler: ((message: any) => void) | null): void {
    this.portMessageHandler = handler;
    console.log("[API] Port message handler registered.");
  }

  /**
   * The primary method for executing all AI-related tasks.
   * Constructs a workflow and sends it to the backend's WorkflowEngine.
   */
  async executeWorkflow(request: ExecuteWorkflowRequest): Promise<void> {
    const port = await this.ensurePort({ sessionId: request.sessionId });
    
    this.portHealthManager?.checkHealth();
    
    return new Promise((resolve, reject) => {
      try {
        port.postMessage({
          type: EXECUTE_WORKFLOW,
          payload: request
        });
        resolve();
      } catch (error) {
        console.error('[ExtensionAPI] Failed to execute workflow:', error);
        
        this.ensurePort({ force: true }).then(() => {
          try {
            this.port?.postMessage({
              type: EXECUTE_WORKFLOW,
              payload: request
            });
            resolve();
          } catch (retryError) {
            reject(retryError);
          }
        }).catch(reject);
      }
    });
  }

  /**
   * Sends a simple request-response message to the backend.
   * Used for fetching data like history, not for streaming AI responses.
   */
  async queryBackend<T>(message: { type: string; payload?: any }): Promise<T> {
    if (!EXTENSION_ID) throw new Error("Extension not connected. Please reload the extension.");

    return new Promise<T>((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          EXTENSION_ID as string,
          message,
          (response: BackendApiResponse<T>) => {
            if (chrome.runtime.lastError) {
              console.error("[API] Connection error:", chrome.runtime.lastError);
              return reject(new Error(`Extension connection failed: ${chrome.runtime.lastError.message}. Try reloading the extension.`));
            }
            
            if (!response) {
              console.error("[API] Empty response received");
              return reject(new Error("No response from extension. The service worker may be inactive."));
            }
            
            if (response?.success) {
              resolve(response.data as T);
            } else {
              console.error("[API] Backend error:", response?.error);
              reject(new Error(response?.error?.message || "Unknown backend error. Please check extension logs."));
            }
          }
        );
      } catch (err) {
        console.error("[API] Fatal extension error:", err);
        reject(new Error(`Extension communication error: ${err instanceof Error ? err.message : String(err)}`));
      }
    });
  }

  // === DATA & SESSION METHODS ===

  getHistoryList(): Promise<HistoryApiResponse> {
    return this.queryBackend<HistoryApiResponse>({ type: GET_FULL_HISTORY });
  }

  getHistorySession(sessionId: string): Promise<HistorySessionSummary> {
    return this.queryBackend<HistorySessionSummary>({ type: GET_HISTORY_SESSION, payload: { sessionId } });
  }

  deleteBackgroundSession(sessionId: string): Promise<{ removed: boolean }> {
    return this.queryBackend<{ removed: boolean }>({ type: DELETE_SESSION, payload: { sessionId } });
  }

  // Simple passthrough for session ID management in the backend
  // In the new model, the UI rarely needs to do this manually.
  // It's primarily handled via the workflow context.
  setSessionId(sessionId: string): void {
    // The backend now gets the session ID with every workflow request,
    // so this explicit sync message is no longer necessary.
    console.log(`[API] setSessionId called for ${sessionId}, but sync is now implicit.`);
    // this.ensurePort().then(port => {
    //     port.postMessage({ type: 'sync_session', sessionId });
    // });
  }

  // The UI no longer manages context. These are now NO-OPs or deprecated.
  updateProviderContext(providerId: string, context: any): void {
    console.warn("`updateProviderContext` is deprecated. Context is managed by the backend.");
  }
  
  clearSession(sessionId: string): void {
    // This can be kept to signal a clear event to the backend if needed,
    // but deleting the session is more explicit.
    console.log(`Clearing UI-related state for session ${sessionId}`);
  }
}

const api = new ExtensionAPI();
export default api;