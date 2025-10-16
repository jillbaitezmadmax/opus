# Comprehensive Plan to Fix IndexedDB Integration
checklist
Phase 1: Establish Initialization Contract

❌ Remove module-level feature flag checks in SessionManager.js

Remove const USE_PERSISTENCE_ADAPTER = globalThis.HTOS_USE_PERSISTENCE_ADAPTER ?? false;
Remove this.usePersistenceAdapter = USE_PERSISTENCE_ADAPTER; from constructor
Move feature flag checking to initialize() method


❌ Make SessionManager.initialize() accept explicit config

Add parameter: async initialize(config = { adapter, useAdapter })
Add validation: throw error if useAdapter=true but adapter=null
Set this.usePersistenceAdapter = config.useAdapter


✅ Make Service Worker initialization synchronous ✓

✓ Move chrome.runtime.onMessage.addListener inside initialization
✓ Move cleanup timer inside initialization
✓ Wrap in async IIFE



Phase 2: Fix SessionManager Initialization Flow

❌ Update initializeSessionManager in sw-entry.js

Change call to: await sessionManager.initialize({ adapter: persistenceLayer?.adapter, useAdapter: true })
Remove try-catch fallback that creates minimal SessionManager
Verify by logging sessionManager.getPersistenceStatus()


❌ Fix property naming inconsistency

Replace all this.persistenceAdapter → this.adapter
Remove references to this.repositories (doesn't exist on SessionManager)
Fix getPersistenceStatus() method
Fix enablePersistenceAdapter() method
Fix disablePersistenceAdapter() method



Phase 3: Connect Document Persistence

✅ Add document operations to message handler ✓

✓ Added SAVE_DOCUMENT case
✓ Added LOAD_DOCUMENT case
✓ Added DELETE_DOCUMENT case
✓ Added LIST_DOCUMENTS case with lastModified fallback


✅ Create shared persistence layer reference ✓

✓ Added self.__HTOS_PERSISTENCE_LAYER = persistenceLayer;



Phase 4: Fix Database Schema Verification

✅ Add schema verification to initialization ✓

✓ Call checkDatabaseHealth() after openDatabase()
✓ Log discrepancies
✓ Throw error on schema mismatch


❌ Add schema repair mechanism

Close database on SCHEMA_MISMATCH
Delete database using indexedDB.deleteDatabase(DB_NAME)
Reopen to create fresh schema
Allow only one repair attempt


❌ Store schema version in metadata

Write {key: 'schema_version', value: DB_VERSION, updatedAt: Date.now()} after init
Read on future initializations
Trigger migration/reset if version mismatch


❌ Make transactions schema-aware

Add check in withTransaction() before creating transaction
Verify: storeNames.every(name => db.objectStoreNames.contains(name))
Throw SchemaError with details if stores missing
Handle SchemaError in retry logic



Phase 5: Fix Cleanup Timer Issue

✅ Guard cleanup timer ✓

✓ Start timer only after initialization completes
✓ Add runtime checks for persistenceLayer?.repositories
✓ Wrap in try-catch


✅ Disabled duplicate cleanup timers ✓

✓ Set autoCleanup: false in adapter initialization


⚠️ Make repository cleanup methods defensive (PARTIAL)

✓ Timer has guards
❌ Individual repository cleanup methods don't verify adapter.isReady()
❌ Don't have try-catch for NotFoundError at method level



Phase 6: Implement Proper Error Handling

✅ Create initialization state tracking ✓

✓ Added self.__HTOS_INIT_STATE object
✓ Tracks initialization progress


❌ Add initialization timeout

Wrap initializeGlobalServices() in Promise.race with 30s timeout
Log __HTOS_INIT_STATE on timeout
Show user-facing error message


✅ Create health check endpoint ✓

✓ Added GET_HEALTH_STATUS message handler
❌ UI doesn't call this on mount (not implemented in UI)
❌ No warning banner in UI on health check failure



Phase 7: Testing and Verification

❌ Create test script for initialization steps

Test adapter initialization
Test schema verification
Test session save/load cycle
Test document save/load cycle
Test cleanup execution


❌ Add sequential initialization logs

Add numbered logs at each major step
Format: [SW:INIT:1], [SW:INIT:2], etc.

❌ Fix SessionsRepository methods (mentioned but not done)

Add if (!this.adapter.isReady()) return 0; before cleanup operations
Wrap in try-catch for NotFoundError
Log and return 0 instead of propagating error


❌ Fix ProviderContextsRepository methods (mentioned but not done)

Same defensive checks as SessionsRepository


❌ Verify extensionBridge message shapes match handlers

Agent checked but didn't verify all methods
Specifically: listDocuments(), deleteDocument(), getHealthStatus()


❌ Add metadata schema_version tracking (mentioned, not implemented)

Write version to metadata store on successful init
Read and validate on subsequent inits


❌ Implement verifySchemaAndRepair function (thought about, not created)

Standalone function in SimpleIndexedDBAdapter
Called during init
Handles delete-and-recreate logic
❌ Test error recovery scenarios

Test manual store deletion
Test corrupted schema version
Test quota exceeded
Test service worker kill mid-operation


## Executive Summary

Your extension has all the right infrastructure built, but the initialization sequence and feature flag management are causing the persistence layer to not activate properly. The core issue is **timing and coordination** - feature flags are being checked before they're set, adapters are initialized but not properly wired to consumers, and fallback logic is triggering when it shouldn't.

## Root Cause Analysis

### Primary Issues

1. **Feature Flag Timing Mismatch**: The SessionManager checks `USE_PERSISTENCE_ADAPTER` at module load time (when the JS file is parsed), but the service worker only sets `globalThis.HTOS_USE_PERSISTENCE_ADAPTER = true` later during initialization. By the time the flag is set to true, SessionManager has already captured it as false.

2. **Async Initialization Race Condition**: The service worker starts multiple initialization paths in parallel (persistence layer, session manager, providers), but SessionManager's constructor runs synchronously and makes decisions before async initialization completes.

3. **Missing Persistence Layer Handoff**: Even though `initializePersistence()` creates a persistence layer with an adapter, the SessionManager's `initialize()` method doesn't reliably receive it because error handling causes it to become null.

4. **Document Store Disconnection**: The EnhancedDocumentStore checks if persistence is available through the extension bridge pattern, but never actually connects to the persistence layer that was initialized in the service worker.

5. **Cleanup Timer Starting Too Early**: The periodic maintenance timer starts immediately when sw-entry.js loads, but it tries to access `persistenceLayer.repositories` which might still be null or initializing.

## Comprehensive Fix Strategy

### Phase 1: Establish Initialization Contract

**Objective**: Create a guaranteed initialization sequence where nothing runs until everything is ready.

#### Step 1.1: Remove Module-Level Feature Flag Checks

In `SessionManager.js`, the line:
```javascript
const USE_PERSISTENCE_ADAPTER = globalThis.HTOS_USE_PERSISTENCE_ADAPTER ?? false;
```

This executes when the module loads, which is before your service worker sets the global flag. You need to remove this entirely from the module scope and move feature flag checking into the `initialize()` method where it can read the current value.

**What to do**: 
- Delete the module-level constant declaration
- In the constructor, remove the line `this.usePersistenceAdapter = USE_PERSISTENCE_ADAPTER;`
- Instead, add a parameter to the `initialize()` method to explicitly receive configuration

#### Step 1.2: Make Service Worker Initialization Synchronous

Your `initializeGlobalServices()` function returns a promise that resolves when everything is ready, but other parts of the service worker don't wait for it. Specifically, the cleanup timer and message handlers can execute before initialization completes.

**What to do**:
- Wrap the entire sw-entry.js bottom section (where the cleanup timer and health check are) in an async IIFE that awaits `initializeGlobalServices()`
- Move the `chrome.runtime.onMessage.addListener` registration INSIDE the initialization function, only after persistence is confirmed ready
- The cleanup timer should only start after `persistenceLayer` is verified non-null

### Phase 2: Fix SessionManager Initialization Flow

**Objective**: Ensure SessionManager always receives and uses the persistence adapter when it exists.

#### Step 2.1: Redesign SessionManager Constructor and Initialize

Currently, the SessionManager constructor tries to be smart about feature flags and sets up state before initialization. This needs to change to a pure dependency injection pattern.

**What to do**:

1. **Constructor should do minimal work**: Only set default values, don't make decisions about which storage to use
   
2. **Initialize method becomes the decision point**: 
   - It should receive an explicit `persistenceAdapter` parameter (not defaulting to null)
   - It should receive an explicit `usePersistence` boolean flag
   - If `usePersistence` is true but `persistenceAdapter` is null, it should throw an error (fail-fast principle)
   - Remove the entire legacy chrome.storage loading path from automatic execution

3. **Remove the dual-mode complexity**: Instead of having both `getOrCreateSessionWithPersistence()` and `getOrCreateSessionLegacy()`, decide once during initialization which mode to use and set a strategy object

#### Step 2.2: Fix the initializeSessionManager Function

In sw-entry.js, your `initializeSessionManager` function creates a SessionManager and passes the adapter, but then catches errors and creates a fallback SessionManager. This fallback doesn't use persistence.

**What to do**:
- Remove the try-catch fallback entirely - if persistence initialization fails, the whole service worker should fail
- Pass an explicit config object: `await sessionManager.initialize({ adapter: persistenceLayer.adapter, useAdapter: true })`
- After initialization, verify by calling `sessionManager.getPersistenceStatus()` and logging it - if it shows the wrong mode, throw an error

### Phase 3: Connect Document Persistence

**Objective**: Make document saving and loading work through IndexedDB instead of showing "persistence not available" messages.

#### Step 3.1: Fix the getPersistenceLayer Function

The `enhancedDocumentStore.ts` file has a function `getPersistenceLayer()` that checks feature flags and the extension bridge. This is overly complex and doesn't connect to the actual persistence layer created in the service worker.

**What to do**:

1. **Create a shared persistence layer reference**: Add a module-level variable in sw-entry.js that stores the initialized persistence layer: `self.__HTOS_PERSISTENCE_LAYER = persistenceLayer;`

2. **Document store should access it directly**: Instead of going through extension bridge checks, the EnhancedDocumentStore should import a singleton that provides access to the service worker's persistence layer

3. **Use message passing for UI-to-SW communication**: When the UI wants to save/load documents, it should send messages to the service worker, which then uses its persistence layer. Don't try to access IndexedDB directly from UI contexts.

#### Step 3.2: Add Document Operations to Message Handler

Your `handleUnifiedMessage` function in sw-entry.js already has cases for SAVE_DOCUMENT, LOAD_DOCUMENT, etc., but they check if `HTOS_ENABLE_DOCUMENT_PERSISTENCE` is true and if `persistenceLayer` exists. 

**What to do**:
- These checks are correct, but you need to ensure the feature flag is always true when persistence is initialized
- Add detailed error logging when these operations fail - don't just return "not enabled", log what `persistenceLayer` actually is
- Test document save by sending a message from DevTools: `chrome.runtime.sendMessage({type: 'SAVE_DOCUMENT', document: {...}})`

### Phase 4: Fix Database Schema Verification

**Objective**: Ensure all required object stores exist before any operations attempt to use them.

#### Step 4.1: Add Schema Verification to Initialization

Your `database.ts` has a `checkDatabaseHealth()` function but it's never called during initialization. The `openDatabase()` function creates stores in `onupgradeneeded`, but if the database already exists with the wrong schema, this never runs.

**What to do**:

1. **Add explicit schema validation**: After calling `openDatabase()` in SimpleIndexedDBAdapter's `init()` method, add a verification step:
   - Get the actual store names: `Array.from(db.objectStoreNames)`
   - Compare against expected stores from STORE_CONFIGS
   - If any are missing, log the discrepancy and throw a specific error: "SCHEMA_MISMATCH"

2. **Add a schema repair mechanism**: When SCHEMA_MISMATCH is detected:
   - Close the database
   - Delete it using `indexedDB.deleteDatabase(DB_NAME)`
   - Call `openDatabase()` again to create fresh schema
   - Log that a schema reset occurred

3. **Store the schema version in metadata**: After successful initialization, write a record to the metadata store: `{key: 'schema_version', value: DB_VERSION, updatedAt: Date.now()}`
   - On future initializations, read this first
   - If it doesn't match your code's DB_VERSION, trigger schema migration or reset

#### Step 4.2: Make Transactions Schema-Aware

Your `transactions.ts` file has a `withTransaction` function that wraps operations, but it doesn't check if stores exist before creating the transaction.

**What to do**:
- At the start of `withTransaction`, before creating the transaction, check: `storeNames.every(name => db.objectStoreNames.contains(name))`
- If this returns false, throw a `SchemaError` with details about which stores are missing
- Catch this specific error type in the retry logic and trigger schema repair instead of just retrying

### Phase 5: Fix the Cleanup Timer Issue

**Objective**: Stop NotFoundError from occurring during periodic maintenance.

#### Step 5.1: Guard the Cleanup Timer

The `setInterval` at the bottom of sw-entry.js runs every 30 minutes and tries to access `persistenceLayer.repositories`. The error occurs because this code can execute before initialization completes.

**What to do**:

1. **Move timer initialization inside the ready callback**: Don't start the timer at module level - start it inside the async initialization function after everything is confirmed ready

2. **Add runtime checks**: Even though you start it after initialization, add defensive checks:
   ```javascript
   if (!persistenceLayer?.repositories?.sessions) {
     console.warn('[SW] Cleanup skipped - persistence layer not ready');
     return;
   }
   ```

3. **Add error boundary**: Wrap the entire cleanup operation in try-catch that specifically handles schema errors and triggers repair instead of failing silently

#### Step 5.2: Make Repository Cleanup Methods Defensive

Your repositories (like SessionsRepository) have cleanup methods that run queries. These should be made defensive against missing stores.

**What to do**:
- Before each repository cleanup operation, verify the adapter is ready: `if (!this.adapter.isReady()) return 0;`
- Wrap the actual cleanup logic in try-catch that specifically catches DOMException with name 'NotFoundError'
- If caught, log it and return 0 (nothing cleaned) rather than propagating the error
- Consider triggering a schema verification and repair flow when this error occurs

### Phase 6: Implement Proper Error Handling

**Objective**: Make failures visible and recoverable instead of silent.

#### Step 6.1: Create Initialization State Tracking

Add a global state object that tracks initialization progress:

```javascript
self.__HTOS_INIT_STATE = {
  startedAt: null,
  persistenceLayerReady: false,
  sessionManagerReady: false,
  documentsReady: false,
  providersReady: [],
  errors: []
};
```

Update this at each major milestone in your initialization sequence. This allows you to debug why initialization is failing and in what order things happen.

#### Step 6.2: Add Initialization Timeout

Your initialization functions can hang if IndexedDB fails to open (browser bugs, quota issues, etc.). Add a timeout:

**What to do**:
- Wrap `initializeGlobalServices()` in a Promise.race with a timeout promise (e.g., 30 seconds)
- If timeout wins, log the current `__HTOS_INIT_STATE` to see what failed
- Show a user-facing error in the UI: "Extension initialization failed - try restarting your browser"

#### Step 6.3: Create a Health Check Endpoint

Your `getHealthStatus()` function exists but isn't exposed to the UI. 

**What to do**:
- Add a message handler case: `GET_HEALTH_STATUS` that returns the current health status
- Make the UI call this on mount and display a warning banner if health check fails
- Include in the health status: adapter ready state, number of sessions loaded, schema version, last successful operation timestamp

### Phase 7: Testing and Verification Strategy

**Objective**: Create a systematic way to verify each fix works before moving to the next.

#### Step 7.1: Unit Test Each Initialization Step

Create a test file that can be run from DevTools:

**What to do**:
1. **Test adapter initialization**: Call `indexedDBAdapter.init()` directly and verify `isReady()` returns true
2. **Test schema verification**: Query `db.objectStoreNames` and compare to expected
3. **Test session save/load cycle**: Create a session, save it, reload service worker, load it back
4. **Test document save/load cycle**: Same as above for documents
5. **Test cleanup**: Manually trigger cleanup and verify it completes without errors

#### Step 7.2: Create Sequential Initialization Logs

Add a numbered log at each major step:

```javascript
console.log('[SW:INIT:1] Starting persistence layer initialization');
console.log('[SW:INIT:2] Persistence layer ready, opening database');
console.log('[SW:INIT:3] Database opened, verifying schema');
// etc.
```

This lets you see exactly where initialization stops if it fails.

#### Step 7.3: Test Error Recovery

Deliberately break things to test recovery:

**What to do**:
1. **Delete a store manually**: Use DevTools → Application → IndexedDB, delete the 'sessions' store, reload extension - it should detect and repair
2. **Corrupt the schema version**: Set metadata.schema_version to 999, reload - it should trigger migration
3. **Simulate quota exceeded**: Fill up storage, try to save - should show user-friendly error
4. **Kill service worker mid-operation**: Use DevTools to stop service worker while saving - next startup should recover

## Implementation Order

Execute these fixes in this specific order to avoid dependencies:

1. **First**: Fix feature flag timing (Phase 1, Step 1.1) - This unblocks everything else
2. **Second**: Fix SessionManager initialization contract (Phase 2) - This establishes the correct pattern
3. **Third**: Add schema verification (Phase 4, Step 4.1) - This catches schema issues early
4. **Fourth**: Connect document persistence (Phase 3) - Now that sessions work, extend to documents
5. **Fifth**: Guard cleanup timer (Phase 5, Step 5.1) - Prevent errors during maintenance
6. **Sixth**: Add error handling (Phase 6) - Make failures visible and recoverable
7. **Last**: Implement testing strategy (Phase 7) - Verify everything works end-to-end

## Success Criteria

You'll know the fix is complete when:

1. **Service worker logs show**: "persistence adapter initialized" followed by "SessionManager Loaded X sessions (IDB)" with X > 0 if you had prior sessions
2. **No errors in console**: Specifically no "NotFoundError", "Persistence not available", or "message port closed" errors
3. **History panel works**: Shows list of sessions with titles
4. **Document saving works**: Logs show "EnhancedDocumentStore saved" and you can see entries in IndexedDB → documents store
5. **Cleanup runs without errors**: After 30 minutes (or manual trigger), see "Cleanup complete" log with no errors
6. **Reload resilience**: Restart browser, reload extension - everything still works without re-initialization errors

## Common Pitfalls to Avoid

1. **Don't add more fallback logic**: Every place you add "if persistence fails, use chrome.storage", you create another code path that won't work when you finally remove chrome.storage. Instead, fail fast and fix the root cause.

2. **Don't check feature flags in multiple places**: Have ONE place that decides whether to use persistence (the initialization function), and everything else assumes it's already decided.

3. **Don't initialize things in parallel unless they're truly independent**: Persistence must complete before SessionManager starts. SessionManager must complete before message handlers register.

4. **Don't catch and swallow errors during initialization**: If persistence fails to initialize, the extension should be considered broken and should show an error state. Silent fallbacks hide the real problem.

5. **Don't assume IndexedDB is always available**: In rare cases (private browsing modes, browser bugs), IndexedDB might be blocked. Have a single error handler for this case that shows a clear message to the user.

This plan addresses the root causes systematically and ensures that once implemented, your persistence layer will be the reliable, single source of truth for all extension data.