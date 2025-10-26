// Enhanced Document Store - Persistence-backed only, no legacy mode
// Uses the extension bridge as the persistence layer

import type { DocumentRecord } from '../types';
import { extensionBridge } from './extensionBridge';

// Bridge-only persistence access
async function getPersistenceLayer() {
  // Check if extension bridge is available and document persistence is enabled at runtime
  if (!extensionBridge.isAvailable()) throw new Error('Persistence layer not available');
  try {
    const status = await extensionBridge.getPersistenceStatus();
    const enabled = !!(status && status.documentPersistenceEnabled && status.persistenceLayerAvailable);
    if (!enabled) throw new Error('Persistence layer disabled');
    return extensionBridge;
  } catch (e) {
    throw new Error('Failed to access persistence layer');
  }
}

export interface EnhancedDocumentSummary {
  id: string;
  title: string;
  lastModified: number;
  blockCount?: number;
  sourceSessionId?: string;
  version?: number;
  isDirty?: boolean;
}

// Lightweight document summary type for list APIs
export interface DocumentSummary {
  id: string;
  title: string;
  lastModified: number;
}

class EnhancedDocumentStore {
  private isExtensionContext: boolean;
  private migrationInProgress: boolean = false;

  constructor() {
    this.isExtensionContext = typeof chrome !== 'undefined' && !!chrome.storage?.local;
  }

  /**
   * Save a document using the persistence layer
   */
  async saveDocument(doc: DocumentRecord): Promise<void> {
    const persistence = await getPersistenceLayer();
    return this.saveDocumentWithPersistence(doc, persistence);
  }

  /**
   * Load a document by ID
   */
  async loadDocument(id: string): Promise<DocumentRecord | null> {
    const persistence = await getPersistenceLayer();
    return this.loadDocumentWithPersistence(id, persistence);
  }

  /**
   * Delete a document
   */
  async deleteDocument(id: string): Promise<void> {
    const persistence = await getPersistenceLayer();
    return this.deleteDocumentWithPersistence(id, persistence);
  }

  /**
   * List all saved documents
   */
  async listDocuments(): Promise<EnhancedDocumentSummary[]> {
    const persistence = await getPersistenceLayer();
    return this.listDocumentsWithPersistence(persistence);
  }

  /**
   * Create a new document with enhanced features
   */
  async createDocument(
    title: string,
    sourceSessionId?: string,
    initialContent?: any[]
  ): Promise<DocumentRecord> {
    const doc: DocumentRecord = {
      id: this.generateId(),
      title,
      sourceSessionId,
      canvasContent: initialContent || [{ type: 'paragraph', children: [{ text: '' }] }],
      granularity: 'paragraph',
      isDirty: false,
      createdAt: Date.now(),
      lastModified: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      blockCount: initialContent ? this.countBlocks(initialContent) : 0,
      refinementHistory: [],
      exportHistory: [],
      snapshots: [],
      _tempStorage: false // Always persisted
    };
    await this.saveDocument(doc);
    return doc;
  }

  /**
   * Create a ghost from content
   */
  async createGhost(
    documentId: string,
    text: string,
    provenance: {
      sessionId: string;
      aiTurnId: string;
      providerId: string;
      responseType: 'batch' | 'synthesis' | 'mapping' | 'hidden';
      responseIndex: number;
      textRange?: [number, number];
    }
  ): Promise<any> {
    const persistence = await getPersistenceLayer();
    return (persistence as any).createGhost(documentId, text, provenance);
  }

  /**
   * Get ghosts for a document
   */
  async getDocumentGhosts(documentId: string): Promise<any[]> {
    const persistence = await getPersistenceLayer();
    try {
      if (typeof (persistence as any).getDocumentGhosts === 'function') {
        return await (persistence as any).getDocumentGhosts(documentId);
      }
    } catch {}
    return [];
  }

  /**
   * Delete a ghost by ID
   */
  async deleteGhost(ghostId: string): Promise<void> {
    const persistence = await getPersistenceLayer();
    try {
      if (typeof (persistence as any).deleteGhost === 'function') {
        await (persistence as any).deleteGhost(ghostId);
      }
    } catch (error) {
      console.error('[EnhancedDocumentStore] Failed to delete ghost:', error);
      throw error;
    }
  }

  /**
   * Update ghost metadata
   */
  async updateGhost(ghostId: string, updates: Partial<any>): Promise<void> {
    const persistence = await getPersistenceLayer();
    try {
      if (typeof (persistence as any).updateGhost === 'function') {
        await (persistence as any).updateGhost(ghostId, updates);
      }
    } catch (error) {
      console.error('[EnhancedDocumentStore] Failed to update ghost:', error);
      throw error;
    }
  }

  /**
   * Enable auto-save for a document
   */
  enableAutoSave(documentId: string, getDocument: () => DocumentRecord): void {
    // Auto-save implementation deferred - using dirty save in ComposerMode
    console.warn('[EnhancedDocumentStore] enableAutoSave not yet implemented');
  }

  /**
   * Disable auto-save for a document
   */
  disableAutoSave(documentId: string): void {
    // Auto-save implementation deferred - using dirty save in ComposerMode
    console.warn('[EnhancedDocumentStore] disableAutoSave not yet implemented');
  }

  
  /**
   * Check if storage is available
   */
  isAvailable(): boolean {
    return extensionBridge.isAvailable();
  }

  /**
   * Get storage information
   */
  async getStorageInfo(): Promise<{ bytesInUse: number; quota: number; usingPersistenceLayer: boolean }> {
    // Storage info not available via bridge; return stub info based on runtime status
    let usingPersistenceLayer = false;
    try {
      const status = await extensionBridge.getPersistenceStatus();
      usingPersistenceLayer = !!(status && status.documentPersistenceEnabled && status.persistenceLayerAvailable);
    } catch {}
    return {
      bytesInUse: 0,
      quota: 0,
      usingPersistenceLayer
    };
  }

  // Private methods for persistence layer operations

  private async saveDocumentWithPersistence(doc: DocumentRecord, persistence: any): Promise<void> {
    try {
      // The 'persistence' variable is now guaranteed to be the extensionBridge.
      await persistence.saveDocument(doc.id, doc, doc.canvasContent);
    } catch (error) {
      console.error('[EnhancedDocumentStore] Persistence save failed (no legacy fallback):', error);
    }
  }

  private async loadDocumentWithPersistence(id: string, persistence: any): Promise<DocumentRecord | null> {
    try {
      // The 'persistence' variable is now guaranteed to be the extensionBridge.
      return await persistence.loadDocument(id, true);
    } catch (error) {
      console.error('[EnhancedDocumentStore] Persistence load failed (no legacy fallback):', error);
      return null;
    }
  }

  private async deleteDocumentWithPersistence(id: string, persistence: any): Promise<void> {
    try {
      // The 'persistence' variable is now guaranteed to be the extensionBridge.
      await persistence.deleteDocument(id);
    } catch (error) {
      console.error('[EnhancedDocumentStore] Persistence delete failed (no legacy fallback):', error);
    }
  }

  private async listDocumentsWithPersistence(persistence: any): Promise<EnhancedDocumentSummary[]> {
    try {
      // The 'persistence' variable is now guaranteed to be the extensionBridge.
      const documents = await persistence.listDocuments();
      return (documents || []).map((doc: any) => ({
        id: doc.id,
        title: doc.title,
        lastModified: doc.lastModified,
        blockCount: doc.blockCount,
        sourceSessionId: doc.sourceSessionId,
        version: doc.version,
        isDirty: doc.isDirty
      }));
    } catch (error) {
      console.error('[EnhancedDocumentStore] Persistence list failed (no legacy fallback):', error);
      return [];
    }
  }

  // Helper methods

  private generateId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private countBlocks(content: any[]): number {
    let count = 0;
    for (const node of content) {
      count++;
      if (node.children && Array.isArray(node.children)) {
        count += this.countBlocks(node.children.filter((child: any) => child.type && child.type !== 'text'));
      }
    }
    return count;
  }
}

// Export singleton instance
export const enhancedDocumentStore = new EnhancedDocumentStore();