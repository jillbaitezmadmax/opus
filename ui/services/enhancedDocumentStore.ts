// Enhanced Document Store - Supports both legacy chrome.storage and new persistence layer
// Uses feature flags to enable gradual migration

import type { DocumentRecord } from '../types';
import { extensionBridge } from './extensionBridge';

// Bridge-only persistence access
async function getPersistenceLayer() {
  // Check if extension bridge is available and document persistence is enabled at runtime
  if (!extensionBridge.isAvailable()) return null;
  try {
    const status = await extensionBridge.getPersistenceStatus();
    const enabled = !!(status && status.documentPersistenceEnabled && status.persistenceLayerAvailable);
    return enabled ? extensionBridge : null;
  } catch {
    return null;
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
   * Save a document using the appropriate storage method
   */
  async saveDocument(doc: DocumentRecord): Promise<void> {
    const persistence = await getPersistenceLayer();
    
    if (persistence) {
      return this.saveDocumentWithPersistence(doc, persistence);
    } else {
      console.warn('[EnhancedDocumentStore] Persistence not available; document not saved:', doc.id);
      return;
    }
  }

  /**
   * Load a document by ID
   */
  async loadDocument(id: string): Promise<DocumentRecord | null> {
    const persistence = await getPersistenceLayer();
    
    if (persistence) {
      return this.loadDocumentWithPersistence(id, persistence);
    } else {
      console.warn('[EnhancedDocumentStore] Persistence not available; cannot load document:', id);
      return null;
    }
  }

  /**
   * Delete a document
   */
  async deleteDocument(id: string): Promise<void> {
    const persistence = await getPersistenceLayer();
    
    if (persistence) {
      return this.deleteDocumentWithPersistence(id, persistence);
    } else {
      console.warn('[EnhancedDocumentStore] Persistence not available; cannot delete document:', id);
      return;
    }
  }

  /**
   * List all saved documents
   */
  async listDocuments(): Promise<EnhancedDocumentSummary[]> {
    const persistence = await getPersistenceLayer();
    
    if (persistence) {
      return this.listDocumentsWithPersistence(persistence);
    } else {
      console.warn('[EnhancedDocumentStore] Persistence not available; returning empty document list');
      return [];
    }
  }

  /**
   * Create a new document with enhanced features
   */
  async createDocument(
    title: string,
    sourceSessionId?: string,
    initialContent?: any[]
  ): Promise<DocumentRecord> {
    const persistence = await getPersistenceLayer();
    
    if (persistence) {
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
        _tempStorage: false // Important: Mark for permanent storage
      };
      await this.saveDocument(doc);
      return doc;
    } else {
      // Create using legacy format
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
        _tempStorage: true
      };
      
      await this.saveDocument(doc);
      return doc;
    }
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
    
    if (persistence) {
      return persistence.createGhost(documentId, text, provenance);
    } else {
      // Legacy ghost creation (store in document)
      const doc = await this.loadDocument(documentId);
      if (!doc) throw new Error(`Document ${documentId} not found`);
      
      const ghost = {
        id: this.generateId(),
        documentId,
        text,
        preview: text.substring(0, 200),
        provenance,
        order: (doc as any).ghosts?.length || 0,
        createdAt: Date.now(),
        isPinned: false
      };
      
      const updatedDoc = {
        ...doc,
        ghosts: [...((doc as any).ghosts || []), ghost],
        lastModified: Date.now()
      };
      
      await this.saveDocument(updatedDoc);
      return ghost;
    }
  }

  /**
   * Get ghosts for a document
   */
  async getDocumentGhosts(documentId: string): Promise<any[]> {
    const persistence = await getPersistenceLayer();
    
    if (persistence) {
      // Bridge does not yet expose this; return empty list for now
      try {
        // If bridge adds support, call persistence.getDocumentGhosts(documentId)
        if (typeof (persistence as any).getDocumentGhosts === 'function') {
          return await (persistence as any).getDocumentGhosts(documentId);
        }
      } catch {}
      return [];
    } else {
      // Legacy ghost retrieval
      const doc = await this.loadDocument(documentId);
      return (doc as any)?.ghosts || [];
    }
  }

  /**
   * Enable auto-save for a document
   */
  enableAutoSave(documentId: string, getDocument: () => DocumentRecord): void {
    throw new Error('Ghost creation via persistence layer not yet implemented');
    // Legacy auto-save would be handled by the component
  }

  /**
   * Disable auto-save for a document
   */
  disableAutoSave(documentId: string): void {
    throw new Error('Ghost deletion via persistence layer not yet implemented');
  }

  /**
   * Migrate legacy documents to new persistence layer
   */
  async migrateLegacyDocuments(): Promise<void> {
    // Legacy migration path removed
    return;
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