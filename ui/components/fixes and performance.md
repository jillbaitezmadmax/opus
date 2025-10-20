# Full prioritized change list (natural-language, ready for agent)

Apply these in order. Each step is a single task the agent can perform. I keep DNR in chrome.storage as you requested.

1. **Add/confirm IndexedDB adapter (single canonical API)**

   * Create or verify `indexedDBAdapter` with methods: `init(), ready, getAllSessions(), getSession(id), saveSession(obj), deleteSession(id), saveDocument(doc), getDocument(id), getAllDocuments(), recreateSchema()`.
   * Adapter must create `sessions`, `documents`, `metadata/dnr` stores on init. (Keep a `dnr` store optional — but we will *not* move DNR yet.)

2. **Block SW init on IDB init**

   * In service worker init (`bg.js`/`sw-entry.js`), call `await indexedDBAdapter.init()` **before** registering message handlers, starting cleanup timers, or initializing SessionManager/DocumentStore. This prevents IDB race/NotFoundError.

3. **Rewire SessionManager to IDB-only**

   * Replace all `chrome.storage.local` reads/writes used for sessions with `indexedDBAdapter` equivalents.
   * Remove `legacy` branches and any `isExtensionContext` chrome.storage mode.
   * Fail fast on adapter errors (throw / return error) instead of falling back to chrome.storage.

4. **Rewire EnhancedDocumentStore to IDB-only**

   * Replace document persistence/read code to always use `indexedDBAdapter.saveDocument` / `getDocument`.
   * Remove “persistence not available” early-exit — wait for adapter.init() instead.
   * Ensure UI uses SW message or adapter to fetch document lists from IDB.

5. **Keep DNR storage in chrome.storage (do not change dnr-utils.js)**

   * Exclude `src/core/dnr-utils.js` from the chrome.storage removal sweep. Leave the `chrome.storage.local.get/set/remove(this.STORAGE_KEY)` calls intact so DNR restore behavior remains functional.
   * Keep `"storage"` permission in `manifest.json` while DNR uses chrome.storage.

6. **Remove all other uses of chrome.storage for sessions/documents**

   * Grep for `chrome.storage` usages and replace only the session/document-related calls with the adapter (do not touch DNR). Commit per-file to make rollbacks easy.

7. **Remove legacy fallback code paths**

   * Remove `saveSessionLegacy`, `getOrCreateSessionLegacy`, `saveTurnWithPersistence` fallback paths. Where code would have fallen back, **log and throw** so errors are visible (fail fast). This enforces IDB-only policy.

8. **Trim logging: remove `userMessagePreview` and keep `userMessageLength`**

   * Replace any `userMessagePreview: String(...).substring(0,120)` in logs with `userMessageLength: String(...).length`. If you absolutely want previews for dev, guard with `process.env.NODE_ENV === 'development'`.

9. **Compute `latestUserTurnId` once**

   * Move `_getLatestUserTurnId(sessionId)` call outside/above the synthesis/ensemble provider loops and reuse the resulting `latestUserTurnId` in both places.

10. **Extract `countResponses(responseBucket)` helper**

    * Implement `const countResponses = (bucket) => !bucket ? 0 : Object.values(bucket).flat().length;` and replace inline `.flat().length` uses for `batchResponseCount`, `synthesisResponseCount`, `ensembleResponseCount`.

11. **Extract `_resolveProviderContext(...)` helper**

    * Implement `_resolveProviderContext(providerId, workflowContexts, payload, previousResults, sessionId, threadId)` that performs the persisted → workflow cache → batch step cascade and returns a normalized object `{ meta, sourceHistorical?, sourceStepIds?, continueThread? }`.
    * Replace duplicate logic in both synthesis and ensemble code paths with calls to this helper.

12. **Refactor to reuse context resolution for synthesis & ensemble**

    * Use the same helper for both steps; pass step type if a small difference exists.

13. **Extract `createOptimisticAiTurn(...)` and reuse in both sendPrompt and continuation flows**

    * Replace duplicate AI-turn construction with one helper that accepts (aiTurnId, userTurnId, shouldUseSynthesis, shouldUseEnsemble, activeProviders, providerKeys, etc.) and returns the pending AI-turn object.

14. **Replace `||` with `??` for meta extraction**

    * Change `const meta = providerContext?.meta || providerContext || {};` to `const meta = providerContext?.meta ?? providerContext ?? {};` (or use the explicit `'meta' in (providerContext||{})` variant if you want to respect an explicit `meta: null`).

15. **Consolidate logging by pushing step object before logging**

    * Build `const synthStep = {...}` then `steps.push(synthStep); console.log('[Compiler] Synthesis step', { synthStepId, provider, ...synthStep.payload });` — apply same pattern for ensemble.

16. **Remove unused `hasContext` variable**

    * Delete the computed but unused `hasContext` flag to clean up code.

17. **Fix fallback/recursion behavior where it remains**

    * Where any catch previously called `this.saveTurn(...)` or similar, replace with immediate fail (throw) or direct explicit legacy call — but since we removed legacy branches, **throw** and log the persistence error instead. This ensures no recursion.

18. **Patch `withTransaction/executeTransaction` to preflight object stores and retry once**

    * Before creating a transaction, check `db.objectStoreNames.contains(store)`. On missing store, call `indexedDBAdapter.recreateSchema()` and retry once. This prevents NotFoundError during cleanup timers.

19. **Ensure SW handlers return responses and `return true` for async**

    * Ensure all `chrome.runtime.onMessage` handlers that perform async work `return true` and always call `sendResponse({ok:false, error})` on catch so message ports don't silently close.

20. **Add small unit tests / dev checks**

    * Add a small dev-only script to call `indexedDBAdapter.getAllSessions()` and `getAllDocuments()` and log results. Use this to confirm migrations safe and persistence works.

21. **Acceptance test checklist (manual)**

    * SW init logs `IndexedDBAdapter initialized` and `Persistence initialized`.
    * No `[SessionManager] Initializing in legacy chrome.storage mode.` logs.
    * Creating a new session shows it stored in IndexedDB (`Application > IndexedDB`).
    * Documents show up in `documents` object store and `EnhancedDocumentStore` logs success.
    * History panel loads with no `message port closed` errors.
    * DNR still restores on SW start (check `chrome.declarativeNetRequest.getDynamicRules()` and keep `chrome.storage` for that key).

22. **Commit plan & rollback**

    * Make small, focused commits per area: (1) adapter, (2) SW init, (3) SessionManager rewires, (4) DocumentStore rewires, (5) logging & helpers refactors. Keep previous branch/commit so you can revert quickly.

---

## Files / places to edit (high-value pointers for the agent)

* `src/persistence/indexeddb-adapter.ts` — new/confirm adapter
* `bg.js` / `sw-entry.js` — SW init: await adapter.init(); register handlers after init
* `src/persistence/chromeStoragePromise.ts` — keep only if DNR uses it; otherwise safe to delete later
* `src/persistence/ChromeStorageAdapter.ts` — remove (or leave only used-by-DNR bits)
* `src/persistence/SessionManager.js` — rewire to IDB-only (remove legacy branches)
* `ui/services/enhancedDocumentStore.ts` — rewire to IDB-only
* `src/core/workflow-compiler.js` — compute `latestUserTurnId` once, extract step object before logging
* `src/core/workflow-engine.js` — add `_resolveProviderContext` integration (where needed)
* `src/core/continuation-or-send.js` (or your sendPrompt/continuation handlers) — extract `createOptimisticAiTurn`
* Any file with `userMessagePreview` — replace with `userMessageLength`
* `src/core/dnr-utils.js` — **leave as-is** (do not alter storage call)
* `manifest.json` — keep `"storage"` permission while DNR relies on it
extra files to be touched:
extension-api
Claude-adapter
gemini-adapter.js
app.tsx
---

## Final notes / tradeoffs

* This plan enforces **IDB-only** for sessions & documents and leaves **DNR** using chrome.storage (safer).
* The code changes are mostly mechanical but include a few behavioral shifts: failing fast on persistence errors (instead of silently falling back) and consolidation of context resolution — both improve correctness but change error propagation (so test carefully).
* Do not remove `"storage"` from `manifest.json` until you migrate DNR to IDB and verify restore ordering.

---
