// Enhanced Document Store - Supports both legacy chrome.storage and new persistence layer
// Uses feature flags to enable gradual migration

import type { DocumentRecord } from '../types';
import { documentStore as legacyDocumentStore, DocumentSummary } from './documentStore';
import { extensionBridge } from './extensionBridge';

// Feature flags
const USE_PERSISTENCE_LAYER = globalThis.HTOS_USE_PERSISTENCE_ADAPTER ?? false;

// Import persistence layer types (will be available when feature is enabled)
let persistenceLayer: any = null;

// Lazy load persistence layer
async function getPersistenceLayer() {
  if (!USE_PERSISTENCE_LAYER) return null;
  
  // Check if extension bridge is available and document persistence is enabled
  if (extensionBridge.isAvailable()) {
    const isAvailable = await extensionBridge.isDocumentPersistenceAvailable();
    return isAvailable ? extensionBridge : null;
  }
  
  if (!persistenceLayer) {
    try {
      // Dynamic import to avoid loading when not needed
      const { initializePersistenceLayer } = await import('../../src/persistence/index.js');
      persistenceLayer = await initializePersistenceLayer({
        autoSaveInterval: 2000,
        maxSnapshots: 10,
        enableAutoDecomposition: true
      });
    } catch (error) {
      console.error('[EnhancedDocumentStore] Failed to initialize persistence layer:', error);
      return null;
    }
  }
  
  return persistenceLayer;
}

export interface EnhancedDocumentSummary extends DocumentSummary {
  blockCount?: number;
  sourceSessionId?: string;
  version?: number;
  isDirty?: boolean;
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
      return legacyDocumentStore.saveDocument(doc);
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
      return legacyDocumentStore.loadDocument(id);
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
      return legacyDocumentStore.deleteDocument(id);
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
      const legacyDocs = await legacyDocumentStore.listDocuments();
      return legacyDocs.map(doc => ({ ...doc, blockCount: 0, version: 1 }));
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
      return persistence.documentManager.createDocument(title, sourceSessionId, initialContent);
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
      return persistence.documentManager.createGhost(documentId, text, provenance);
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
      return persistence.documentManager.getDocumentGhosts(documentId);
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
    const persistence = getPersistenceLayer();
    
    if (persistence && USE_PERSISTENCE_LAYER) {
      persistence.then(p => {
        if (p) p.documentManager.enableAutoSave(documentId, getDocument);
      });
    }
    // Legacy auto-save would be handled by the component
  }

  /**
   * Disable auto-save for a document
   */
  disableAutoSave(documentId: string): void {
    const persistence = getPersistenceLayer();
    
    if (persistence && USE_PERSISTENCE_LAYER) {
      persistence.then(p => {
        if (p) p.documentManager.disableAutoSave(documentId);
      });
    }
  }

  /**
   * Migrate legacy documents to new persistence layer
   */
  async migrateLegacyDocuments(): Promise<void> {
    if (this.migrationInProgress || !USE_PERSISTENCE_LAYER) return;
    
    this.migrationInProgress = true;
    
    try {
      const persistence = await getPersistenceLayer();
      if (!persistence) return;
      
      // Get all legacy documents
      const legacyDocs = await legacyDocumentStore.listDocuments();
      
      for (const summary of legacyDocs) {
        try {
          const legacyDoc = await legacyDocumentStore.loadDocument(summary.id);
          if (legacyDoc && (legacyDoc as any)._tempStorage) {
            // Migrate to new persistence layer
            await persistence.documentManager.saveDocument(summary.id, legacyDoc);
            console.log(`[EnhancedDocumentStore] Migrated document ${summary.id}`);
          }
        } catch (error) {
          console.error(`[EnhancedDocumentStore] Failed to migrate document ${summary.id}:`, error);
        }
      }
      
      console.log(`[EnhancedDocumentStore] Migration completed for ${legacyDocs.length} documents`);
    } catch (error) {
      console.error('[EnhancedDocumentStore] Migration failed:', error);
    } finally {
      this.migrationInProgress = false;
    }
  }

  /**
   * Check if storage is available
   */
  isAvailable(): boolean {
    return legacyDocumentStore.isAvailable() || USE_PERSISTENCE_LAYER;
  }

  /**
   * Get storage information
   */
  async getStorageInfo(): Promise<{ bytesInUse: number; quota: number; usingPersistenceLayer: boolean }> {
    const legacyInfo = await legacyDocumentStore.getStorageInfo();
    
    return {
      ...legacyInfo,
      usingPersistenceLayer: USE_PERSISTENCE_LAYER
    };
  }

  // Private methods for persistence layer operations

  private async saveDocumentWithPersistence(doc: DocumentRecord, persistence: any): Promise<void> {
    try {
      if (persistence === extensionBridge) {
        // Use extension bridge
        await extensionBridge.saveDocument(doc.id, doc, doc.canvasContent);
      } else {
        // Use direct persistence layer
        if (doc.id && await persistence.adapter.getDocument(doc.id)) {
          // Update existing document
          await persistence.documentManager.saveDocument(doc.id, doc, doc.canvasContent);
        } else {
          // Create new document
          await persistence.adapter.createDocument(doc);
          
          // Decompose content if enabled
          if (doc.canvasContent && doc.canvasContent.length > 0) {
            // This will be handled by the document manager automatically
          }
        }
      }
    } catch (error) {
      console.error('[EnhancedDocumentStore] Persistence save failed:', error);
      // Fallback to legacy storage
      await legacyDocumentStore.saveDocument(doc);
    }
  }

  private async loadDocumentWithPersistence(id: string, persistence: any): Promise<DocumentRecord | null> {
    try {
      if (persistence === extensionBridge) {
        // Use extension bridge
        return await extensionBridge.loadDocument(id, true);
      } else {
        // Use direct persistence layer
        return await persistence.documentManager.loadDocument(id, true);
      }
    } catch (error) {
      console.error('[EnhancedDocumentStore] Persistence load failed:', error);
      // Fallback to legacy storage
      return legacyDocumentStore.loadDocument(id);
    }
  }

  private async deleteDocumentWithPersistence(id: string, persistence: any): Promise<void> {
    try {
      await persistence.documentManager.deleteDocument(id);
    } catch (error) {
      console.error('[EnhancedDocumentStore] Persistence delete failed:', error);
      // Fallback to legacy storage
      await legacyDocumentStore.deleteDocument(id);
    }
  }

  private async listDocumentsWithPersistence(persistence: any): Promise<EnhancedDocumentSummary[]> {
    try {
      // Get all documents from persistence layer
      const documents = await persistence.adapter.getAllDocuments();
      
      return documents.map((doc: DocumentRecord) => ({
        id: doc.id,
        title: doc.title,
        lastModified: doc.lastModified,
        blockCount: doc.blockCount,
        sourceSessionId: doc.sourceSessionId,
        version: doc.version,
        isDirty: doc.isDirty
      }));
    } catch (error) {
      console.error('[EnhancedDocumentStore] Persistence list failed:', error);
      // Fallback to legacy storage
      const legacyDocs = await legacyDocumentStore.listDocuments();
      return legacyDocs.map(doc => ({ ...doc, blockCount: 0, version: 1 }));
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