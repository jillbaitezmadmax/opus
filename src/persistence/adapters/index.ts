// Persistence Adapters Index

export type {
  IPersistenceAdapter,
  PersistenceConfig,
  QueryOptions,
  BatchResult,
  HealthStatus
} from './IPersistenceAdapter.js';

export { IndexedDBAdapter } from './IndexedDBAdapter.js';

/**
 * Factory function to create a persistence adapter
 */
export function createPersistenceAdapter(type: 'indexeddb' = 'indexeddb'): IPersistenceAdapter {
  switch (type) {
    case 'indexeddb':
      return new IndexedDBAdapter();
    default:
      throw new Error(`Unknown persistence adapter type: ${type}`);
  }
}