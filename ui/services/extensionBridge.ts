// Extension Bridge Service
// Provides a clean interface for UI components to communicate with the enhanced service worker

export interface SessionData {
  id: string;
  turns: any[];
  threads?: any[];
  providerContexts?: Record<string, any>;
  createdAt?: number;
  lastModified?: number;
}

export interface PersistenceStatus {
  persistenceEnabled: boolean;
  documentPersistenceEnabled: boolean;
  sessionManagerType: string;
  persistenceLayerAvailable: boolean;
}

export interface DocumentData {
  id: string;
  title: string;
  canvasContent: any[];
  sourceSessionId?: string;
  lastModified: number;
  version: number;
  blockCount: number;
}

export interface GhostData {
  id: string;
  documentId: string;
  text: string;
  preview: string;
  provenance: {
    sessionId: string;
    aiTurnId: string;
    providerId: string;
    responseType: 'batch' | 'synthesis' | 'ensemble' | 'hidden';
    responseIndex: number;
    textRange?: [number, number];
  };
  createdAt: number;
  isPinned: boolean;
}

// Message type definitions
interface DeleteDocumentMessage {
  type: 'DELETE_DOCUMENT';
  documentId: string;
}

interface ListDocumentsMessage {
  type: 'LIST_DOCUMENTS';
}

class ExtensionBridge {
  private isExtensionContext: boolean;

  constructor() {
    this.isExtensionContext = typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;
  }

  /**
   * Send a message to the service worker
   */
  private async sendMessage(message: any): Promise<any> {
    if (!this.isExtensionContext) {
      throw new Error('Extension context not available');
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      });
    });
  }

  // Session Management

  /**
   * Get or create a session
   */
  async getSession(sessionId: string): Promise<SessionData> {
    const response = await this.sendMessage({
      type: 'GET_SESSION',
      sessionId
    });
    return response.session;
  }

  /**
   * Save a turn to a session
   */
  async saveTurn(sessionId: string, turn: any): Promise<void> {
    await this.sendMessage({
      type: 'SAVE_TURN',
      sessionId,
      turn
    });
  }

  /**
   * Update provider context for a session
   */
  async updateProviderContext(sessionId: string, providerId: string, context: any): Promise<void> {
    await this.sendMessage({
      type: 'UPDATE_PROVIDER_CONTEXT',
      sessionId,
      providerId,
      context
    });
  }

  /**
   * Create a new thread in a session
   */
  async createThread(sessionId: string, title: string, sourceAiTurnId?: string): Promise<any> {
    const response = await this.sendMessage({
      type: 'CREATE_THREAD',
      sessionId,
      title,
      sourceAiTurnId
    });
    return response.thread;
  }

  /**
   * Switch to a different thread
   */
  async switchThread(sessionId: string, threadId: string): Promise<void> {
    await this.sendMessage({
      type: 'SWITCH_THREAD',
      sessionId,
      threadId
    });
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.sendMessage({
      type: 'DELETE_SESSION',
      sessionId
    });
  }

  // Document Management (when document persistence is enabled)

  /**
   * Save a document
   */
  async saveDocument(documentId: string, document: DocumentData, content?: any[]): Promise<void> {
    await this.sendMessage({
      type: 'SAVE_DOCUMENT',
      documentId,
      document,
      content
    });
  }

  /**
   * Load a document
   */
  async loadDocument(documentId: string, reconstructContent: boolean = true): Promise<DocumentData | null> {
    try {
      const response = await this.sendMessage({
        type: 'LOAD_DOCUMENT',
        documentId,
        reconstructContent
      });
      return response.document;
    } catch (error) {
      if ((error as Error).message.includes('Document persistence not enabled')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentId: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Extension bridge not available');
    }

    await this.sendMessage({
      type: 'DELETE_DOCUMENT',
      documentId
    } as DeleteDocumentMessage);
  }

  /**
   * List documents
   */
  async listDocuments(): Promise<Array<{ id: string; title: string; lastModified: number }>> {
    if (!this.isAvailable()) {
      throw new Error('Extension bridge not available');
    }

    const response = await this.sendMessage({
      type: 'LIST_DOCUMENTS'
    } as ListDocumentsMessage);

    return response.documents || [];
  }

  /**
   * Create a ghost from content
   */
  async createGhost(documentId: string, text: string, provenance: GhostData['provenance']): Promise<GhostData> {
    const response = await this.sendMessage({
      type: 'CREATE_GHOST',
      documentId,
      text,
      provenance
    });
    return response.ghost;
  }

  // Persistence Management

  /**
   * Get persistence status
   */
  async getPersistenceStatus(): Promise<PersistenceStatus> {
    const response = await this.sendMessage({
      type: 'GET_PERSISTENCE_STATUS'
    });
    return response.status;
  }

  /**
   * Enable persistence adapter
   */
  async enablePersistence(): Promise<void> {
    await this.sendMessage({
      type: 'ENABLE_PERSISTENCE'
    });
  }

  /**
   * Disable persistence adapter
   */
  async disablePersistence(): Promise<void> {
    await this.sendMessage({
      type: 'DISABLE_PERSISTENCE'
    });
  }

  // Utility Methods

  /**
   * Check if extension context is available
   */
  isAvailable(): boolean {
    return this.isExtensionContext;
  }

  /**
   * Get health status from service worker
   */
  async getHealthStatus(): Promise<any> {
    if (!this.isExtensionContext) {
      return { status: 'not_in_extension' };
    }

    try {
      // Access the global health check function
      const response = await this.sendMessage({
        type: 'GET_HEALTH_STATUS'
      });
      return response.status;
    } catch (error) {
      return { status: 'error', error: (error as Error).message };
    }
  }

  /**
   * Check if document persistence is available
   */
  async isDocumentPersistenceAvailable(): Promise<boolean> {
    try {
      const status = await this.getPersistenceStatus();
      return status.documentPersistenceEnabled && status.persistenceLayerAvailable;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if session persistence is available
   */
  async isSessionPersistenceAvailable(): Promise<boolean> {
    try {
      const status = await this.getPersistenceStatus();
      return status.persistenceEnabled;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const extensionBridge = new ExtensionBridge();

// Export types for use in other components
