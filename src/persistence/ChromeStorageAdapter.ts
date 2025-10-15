// Chrome Storage Adapter with minimal API matching SimpleIndexedDBAdapter
// Provides init(), get(), put(), delete(), getAll() methods using chrome.storage.local

import * as chromeStoragePromise from './chromeStoragePromise';

export interface SimpleRecord {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: any;
}

/**
 * Chrome Storage adapter with minimal API surface matching SimpleIndexedDBAdapter
 * Useful for fast local development and rollback scenarios
 */
export class ChromeStorageAdapter {
  private isInitialized = false;

  /**
   * Initialize the adapter
   * Verifies chrome.storage.local is available
   */
  async init(): Promise<void> {
    console.warn('persistence:init - Starting ChromeStorageAdapter initialization');
    
    try {
      // Verify chrome.storage.local is available
      if (!chrome?.storage?.local) {
        throw new Error('chrome.storage.local is not available');
      }
      
      // Test basic functionality
      await chromeStoragePromise.set({ '_test_key': 'test_value' });
      const testResult = await chromeStoragePromise.get(['_test_key']);
      if (testResult._test_key !== 'test_value') {
        throw new Error('chrome.storage.local test failed');
      }
      
      // Clean up test key
      await chromeStoragePromise.remove(['_test_key']);
      
      this.isInitialized = true;
      console.warn('persistence adapter initialized');
    } catch (error) {
      console.error('persistence:init - Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get a record by key from the specified store
   * Returns undefined if record is not found (safe behavior)
   */
  async get(storeName: string, key: string): Promise<SimpleRecord | undefined> {
    this.ensureReady();
    
    try {
      const storeKey = `${storeName}:${key}`;
      const result = await chromeStoragePromise.get([storeKey]);
      const record = result[storeKey];
      
      console.log(`persistence:get(${storeName}, ${key}) - ${record ? 'found' : 'not found'}`);
      return record || undefined;
    } catch (error) {
      console.error(`persistence:get(${storeName}, ${key}) - error:`, error);
      throw error;
    }
  }

  /**
   * Put a record into the specified store
   * Auto-populates id, createdAt, updatedAt fields if missing
   */
  async put(storeName: string, value: SimpleRecord, key?: string): Promise<SimpleRecord> {
    this.ensureReady();
    
    try {
      // Defensive deep-clone to prevent mutation issues
      const clonedValue = JSON.parse(JSON.stringify(value));
      
      // Auto-populate required fields
      const now = Date.now();
      if (!clonedValue.id && !key) {
        clonedValue.id = crypto.randomUUID();
      }
      if (key && !clonedValue.id) {
        clonedValue.id = key;
      }
      if (!clonedValue.createdAt) {
        clonedValue.createdAt = now;
      }
      clonedValue.updatedAt = now;
      
      const storeKey = `${storeName}:${clonedValue.id}`;
      await chromeStoragePromise.set({ [storeKey]: clonedValue });
      
      // Update store index
      await this.updateStoreIndex(storeName, clonedValue.id, 'add');
      
      console.log(`persistence:put(${storeName}, ${clonedValue.id}) - success`);
      return clonedValue;
    } catch (error) {
      console.error(`persistence:put(${storeName}, ${key || value.id}) - error:`, error);
      throw error;
    }
  }

  /**
   * Delete a record by key from the specified store
   */
  async delete(storeName: string, key: string): Promise<boolean> {
    this.ensureReady();
    
    try {
      const storeKey = `${storeName}:${key}`;
      await chromeStoragePromise.remove([storeKey]);
      
      // Update store index
      await this.updateStoreIndex(storeName, key, 'remove');
      
      console.log(`persistence:delete(${storeName}, ${key}) - success`);
      return true;
    } catch (error) {
      console.error(`persistence:delete(${storeName}, ${key}) - error:`, error);
      throw error;
    }
  }

  /**
   * Get all records from the specified store
   * Returns empty array if no records found (safe behavior)
   */
  async getAll(storeName: string): Promise<SimpleRecord[]> {
    this.ensureReady();
    
    try {
      // Get store index
      const indexKey = `_index:${storeName}`;
      const indexResult = await chromeStoragePromise.get([indexKey]);
      const recordIds: string[] = indexResult[indexKey] || [];
      
      if (recordIds.length === 0) {
        console.log(`persistence:getAll(${storeName}) - found 0 records`);
        return [];
      }
      
      // Get all records
      const storeKeys = recordIds.map(id => `${storeName}:${id}`);
      const result = await chromeStoragePromise.get(storeKeys);
      
      const records: SimpleRecord[] = [];
      for (const storeKey of storeKeys) {
        if (result[storeKey]) {
          records.push(result[storeKey]);
        }
      }
      
      console.log(`persistence:getAll(${storeName}) - found ${records.length} records`);
      return records;
    } catch (error) {
      console.error(`persistence:getAll(${storeName}) - error:`, error);
      throw error;
    }
  }

  /**
   * Check if the adapter is ready for use
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Close the adapter (no-op for chrome.storage)
   */
  async close(): Promise<void> {
    this.isInitialized = false;
  }

  /**
   * Ensure the adapter is ready before operations
   */
  private ensureReady(): void {
    if (!this.isReady()) {
      throw new Error('ChromeStorageAdapter is not initialized. Call init() first.');
    }
  }

  /**
   * Update the store index to track record IDs
   */
  private async updateStoreIndex(storeName: string, recordId: string, operation: 'add' | 'remove'): Promise<void> {
    const indexKey = `_index:${storeName}`;
    const indexResult = await chromeStoragePromise.get([indexKey]);
    let recordIds: string[] = indexResult[indexKey] || [];
    
    if (operation === 'add') {
      if (!recordIds.includes(recordId)) {
        recordIds.push(recordId);
      }
    } else if (operation === 'remove') {
      recordIds = recordIds.filter(id => id !== recordId);
    }
    
    await chromeStoragePromise.set({ [indexKey]: recordIds });
  }
}