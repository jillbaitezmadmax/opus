// Enhanced Document Store - Supports both legacy chrome.storage and new persistence layer
// Uses feature flags to enable gradual migration

import type { DocumentRecord } from '../types';
import { extensionBridge } from './extensionBridge';

// Feature flags
const USE_PERSISTENCE_LAYER = (globalThis as any).HTOS_USE_PERSISTENCE_ADAPTER ?? false;

// Bridge-only persistence access
async function getPersistenceLayer() {
  if (!USE_PERSISTENCE_LAYER) return null;

  // Check if extension bridge is available and document persistence is enabled
  if (extensionBridge.isAvailable()) {
    const isAvailable = await extensionBridge.isDocumentPersistenceAvailable();
    return isAvailable ? extensionBridge : null;
  }

  return null;
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
    
    if (persistence && USE_PERSISTENCE_LAYER) {
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
    
    if (persistence && USE_PERSISTENCE_LAYER) {
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
    
    if (persistence && USE_PERSISTENCE_LAYER) {
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
    
    if (persistence && USE_PERSISTENCE_LAYER) {
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
    
    if (persistence && USE_PERSISTENCE_LAYER) {
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
      responseType: 'batch' | 'synthesis' | 'ensemble' | 'hidden';
      responseIndex: number;
      textRange?: [number, number];
    }
  ): Promise<any> {
    const persistence = await getPersistenceLayer();
    
    if (persistence && USE_PERSISTENCE_LAYER) {
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
    
    if (persistence && USE_PERSISTENCE_LAYER) {
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
    if (USE_PERSISTENCE_LAYER) {
      throw new Error('Ghost creation via persistence layer not yet implemented');
    }
    // Legacy auto-save would be handled by the component
  }

  /**
   * Disable auto-save for a document
   */
  disableAutoSave(documentId: string): void {
    if (USE_PERSISTENCE_LAYER) {
      throw new Error('Ghost deletion via persistence layer not yet implemented');
    }
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
    return USE_PERSISTENCE_LAYER && extensionBridge.isAvailable();
  }

  /**
   * Get storage information
   */
  async getStorageInfo(): Promise<{ bytesInUse: number; quota: number; usingPersistenceLayer: boolean }> {
    // Storage info not available via bridge; return stub info
    return {
      bytesInUse: 0,
      quota: 0,
      usingPersistenceLayer: USE_PERSISTENCE_LAYER
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