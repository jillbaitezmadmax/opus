import type { DocumentRecord } from '../types';

const STORAGE_KEY_PREFIX = 'htos_composer_doc_';
const DOCUMENT_LIST_KEY = 'htos_composer_docs';

export interface DocumentSummary {
  id: string;
  title: string;
  lastModified: number;
}

class DocumentStore {
  /**
   * Save a document to chrome.storage.local
   * The document MUST conform to DocumentRecord schema
   */
  async saveDocument(doc: DocumentRecord): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${doc.id}`;
    
    // Mark as temporary storage for future migration
    const docToSave: DocumentRecord = {
  ...doc,
  _tempStorage: true, // <-- ADD THIS LINE BACK
  lastModified: Date.now()
};
    
    try {
      await chrome.storage.local.set({ [key]: docToSave });
      
      // Update document list
      await this.updateDocumentList(doc.id, doc.title, docToSave.lastModified);
      
      console.log('[DocumentStore] Saved document:', doc.id);
    } catch (error) {
      console.error('[DocumentStore] Save failed:', error);
      throw error;
    }
  }
  
  /**
   * Load a document by ID
   */
  async loadDocument(id: string): Promise<DocumentRecord | null> {
    const key = `${STORAGE_KEY_PREFIX}${id}`;
    
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] || null;
    } catch (error) {
      console.error('[DocumentStore] Load failed:', error);
      return null;
    }
  }
  
  /**
   * Delete a document
   */
  async deleteDocument(id: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${id}`;
    
    try {
      await chrome.storage.local.remove(key);
      await this.removeFromDocumentList(id);
      console.log('[DocumentStore] Deleted document:', id);
    } catch (error) {
      console.error('[DocumentStore] Delete failed:', error);
      throw error;
    }
  }
  
  /**
   * List all saved documents
   */
  async listDocuments(): Promise<DocumentSummary[]> {
    try {
      const result = await chrome.storage.local.get(DOCUMENT_LIST_KEY);
      return result[DOCUMENT_LIST_KEY] || [];
    } catch (error) {
      console.error('[DocumentStore] List failed:', error);
      return [];
    }
  }
  
  /**
   * Update the document list index
   */
  private async updateDocumentList(id: string, title: string, lastModified: number): Promise<void> {
    try {
      const result = await chrome.storage.local.get(DOCUMENT_LIST_KEY);
      const docs: DocumentSummary[] = result[DOCUMENT_LIST_KEY] || [];
      
      // Update existing or add new
      const existingIndex = docs.findIndex(doc => doc.id === id);
      const summary: DocumentSummary = { id, title, lastModified };
      
      if (existingIndex >= 0) {
        docs[existingIndex] = summary;
      } else {
        docs.push(summary);
      }
      
      // Sort by lastModified descending
      docs.sort((a, b) => b.lastModified - a.lastModified);
      
      await chrome.storage.local.set({ [DOCUMENT_LIST_KEY]: docs });
    } catch (error) {
      console.error('[DocumentStore] Update document list failed:', error);
    }
  }
  
  /**
   * Remove document from the list index
   */
  private async removeFromDocumentList(id: string): Promise<void> {
    try {
      const result = await chrome.storage.local.get(DOCUMENT_LIST_KEY);
      const docs: DocumentSummary[] = result[DOCUMENT_LIST_KEY] || [];
      
      const filtered = docs.filter(doc => doc.id !== id);
      await chrome.storage.local.set({ [DOCUMENT_LIST_KEY]: filtered });
    } catch (error) {
      console.error('[DocumentStore] Remove from document list failed:', error);
    }
  }
  
  /**
   * Check if chrome.storage.local is available
   */
  isAvailable(): boolean {
    return typeof chrome !== 'undefined' && 
           chrome.storage && 
           chrome.storage.local;
  }
  
  /**
   * Get storage usage statistics
   */
  async getStorageInfo(): Promise<{ bytesInUse: number; quota: number }> {
    try {
      const bytesInUse = await chrome.storage.local.getBytesInUse();
      const quota = chrome.storage.local.QUOTA_BYTES;
      return { bytesInUse, quota };
    } catch (error) {
      console.error('[DocumentStore] Storage info failed:', error);
      return { bytesInUse: 0, quota: 0 };
    }
  }
}

// Export singleton instance
export const documentStore = new DocumentStore();