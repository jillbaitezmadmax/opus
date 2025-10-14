// Persistence Adapters Index

import type {
  IPersistenceAdapter,
  PersistenceConfig,
  QueryOptions,
  BatchResult,
  HealthStatus
} from './IPersistenceAdapter';

import { IndexedDBAdapter } from './IndexedDBAdapter';

export type {
  IPersistenceAdapter,
  PersistenceConfig,
  QueryOptions,
  BatchResult,
  HealthStatus
};

export { IndexedDBAdapter };

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