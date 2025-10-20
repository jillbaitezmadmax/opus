# Persistence Hardening: Implementation Plan

This document outlines the steps to implement robust persistence layer hardening, adapted for the current codebase structure. This plan improves upon the concepts from `was donoe.md` by placing logic in the most appropriate layers for better stability.

---

### 1. Add `recreateSchema` Method to the Adapter

**File:** `src/persistence/SimpleIndexedDBAdapter.ts`

**Goal:** Add a "nuclear option" method to completely reset and rebuild the database. This is useful for debugging, manual recovery, and provides the canonical repair pathway mentioned in the original notes.

**Implementation Steps:**

1.  Add the following public method to the `SimpleIndexedDBAdapter` class.

```typescript
/**
 * Deletes the entire database and re-initializes the adapter.
 * This is a destructive operation and will result in data loss.
 */
async recreateSchema(): Promise<void> {
  console.warn('Recreating database schema. All data will be lost.');
  const dbName = this.db?.name || 'htos-db'; // Get DB name before closing
  await this.close(); // Ensure current connection is closed
  
  // Delete the database
  await new Promise<void>((resolve, reject) => {
    const deleteRequest = indexedDB.deleteDatabase(dbName);
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error);
    deleteRequest.onblocked = () => {
      console.warn('Database deletion blocked. Please close other tabs/windows using the extension.');
      reject(new Error('Database deletion was blocked.'));
    };
  });

  // Re-initialize the adapter, which will create a new database from scratch
  await this.init({ autoRepair: false }); // autoRepair can be false as we just deleted everything
  console.warn('Database schema recreated successfully.');
}
```

---

### 2. Implement Service Worker Startup Gating

**File to Modify:** `src/sw-entry.js` (This is the most likely candidate for the main service worker logic).

**Goal:** Prevent race conditions by deferring or rejecting requests that arrive before the persistence layer is fully initialized and ready.

**Implementation Steps:**

1.  Ensure an instance of `SimpleIndexedDBAdapter` is created and initialized at the top level of the service worker script.
2.  Use a flag to track the initialization state.
3.  Add a guard clause to the main message handler (`handleUnifiedMessage` or equivalent) to check this flag.

```typescript
// At the top of src/sw-entry.js

import { SimpleIndexedDBAdapter } from './persistence/SimpleIndexedDBAdapter'; // Adjust path if needed

const persistenceAdapter = new SimpleIndexedDBAdapter();
let persistenceReady = false;

// Initialize persistence and update the readiness flag
persistenceAdapter.init({ autoRepair: true })
  .then(() => {
    persistenceReady = true;
    console.log('Persistence layer is ready.');
    // You can optionally dispatch a message here to notify UI components
  })
  .catch(error => {
    console.error('FATAL: Persistence layer failed to initialize.', error);
  });


// Then, inside your main message handler function...
function handleUnifiedMessage(message, sender, sendResponse) {
  if (!persistenceReady) {
    // Respond with a clear status if persistence is not ready
    sendResponse({
      error: 'ServiceWorker is initializing. Please retry shortly.',
      status: 'initializing'
    });
    return true; // Required for asynchronous sendResponse
  }

  // ... rest of the existing message handler logic
}
```

---

### 3. Transaction Preflight Checks (No Change Needed)

The goal of "Transaction Preflight Checks" from `was donoe.md` is to provide clear errors when a database table (object store) is missing.

*   **`src/persistence/transactions.ts`**: The `withTransaction` utility already does this correctly by catching errors and creating a specific `SchemaError`.
*   **`src/persistence/SimpleIndexedDBAdapter.ts`**: The `init()` method already calls `verifySchemaAndRepair()`.

This combination is robust:
1.  On startup, `init()` attempts to detect and repair any schema corruption.
2.  If corruption happens *after* startup, `withTransaction()` will fail with a clear error instead of crashing, which can be logged for debugging.

Adding further repair logic inside `withTransaction` is risky and unnecessary with the current structure. The existing implementation is sound.
