# Goal

Stabilize the IndexedDB migration so the extension can safely use the new datastores. Deliver a reversible rollout path, full tests for persistence behavior, and CI checks that prevent similar regressions.

# High-level strategy (the patterns)

* **Pattern — “Adapter Gate”**: Put all persistence usage behind a small interface (StorageAdapter) with two concrete adapters (chrome storage and IndexedDB). This gives a safe toggle and quick rollback.
* **Pattern — “Transaction Guard”**: Ensure transactions only resolve/reject after both the IDB transaction completes and any asynchronous work inside it completes.
* **Pattern — “Migration with Backup”**: Export an immutable backup before migrating from chrome.storage to IndexedDB. Record a `schema_version` and allow safe retries.
* **Pattern — “Preflight Gate”**: Add compile-time and CI preflight checks (TypeScript strict + ESLint) so syntax, typing and common async mistakes are caught before shipping.

# Priority order (do these in sequence)

1. **Unblock build & runtime** — fix the obvious syntax/typo issues that are causing runtime exceptions.
2. **Stabilize transaction semantics** — replace/patch `withTransaction` so it is race-free.
3. **Add chrome.storage Promise wrappers** — ensure legacy fallback works reliably.
4. **Introduce (if not present) StorageAdapter + feature flag** — switch callers to adapter.
5. **Add tests + test harness** — unit + integration tests that prove correctness.
6. **Add migration runner + backup** — export chrome.storage and safely seed IndexedDB.
7. **CI & pre-merge checks** — enable `npx tsc --noEmit` and ESLint rules on CI and pre-commit.
8. **Rollout & monitoring** — staged enablement with telemetry and rollback capability.

# Concrete tasks for the IDE agent (natural language)

### 1 — Static scan & quick fixes (initial, blocking)

* Search the repo for obvious malformed tokens: `.config`, `.session`, `.existing`, `.updates`, occurrences of `await chrome.storage.local.get(`, and any `withTransaction`/`executeTransaction` implementations. Create a simple grep query for these strings.
* Replace malformed spread-like tokens with correct JavaScript spread usage (e.g., `...(config || {})`, `...session`).
* Ensure every file that was edited is saved and included in the repo build (check `tsconfig.json` include/exclude).
* Run `npx tsc --noEmit` and `npm run build`, fix reported syntax/type issues until clean.

### 2 — Stabilize `withTransaction` semantics

* Locate the helper that runs IDB transactions (`withTransaction`, `executeTransaction`, or similar).
* Change its control flow so the returned Promise resolves only after:

  1. The IDB transaction `oncomplete` fires, and
  2. The `work` function’s Promise resolves.
* Ensure on errors the transaction is aborted and the error bubbles to the caller.


### 3 — chrome.storage → Promise wrapper (legacy fallback)

* Audit all uses of `chrome.storage.local.get()` and `.set()`. Replace direct calls with a small wrapper that returns a Promise and rejects on `chrome.runtime.lastError`.
* Add tests to assert the wrapper resolves with stored values and rejects on simulated `lastError`.

### 4 — StorageAdapter & feature toggle

* Create a minimal `StorageAdapter` interface (init, get, put, delete, getAll).
* Implement `ChromeStorageAdapter` (wraps chrome.storage) and `IndexedDBAdapter` (current adapter).
* Add a factory that returns one of the adapters based on a runtime flag or extension setting (e.g., `USE_INDEXED_DB`).
* Replace direct calls to persistence stores across the codebase with calls to the adapter interface. Keep changes minimal: high-level modules should call `storageAdapter.get('sessions', id)` 




### 7 — CI, linting and developer guardrails

* Ensure `tsconfig.json` has `strict: true`, `noEmitOnError: true`, and includes all relevant source paths; add `checkJs` if some files are plain JS.
* Add `npx tsc --noEmit` and `npx eslint . --ext .ts,.js` to the CI pipeline and pre-commit hook (husky).
* Add ESLint rules that detect common async mistakes, e.g., `@typescript-eslint/no-floating-promises`, `no-unsafe-member-access`, and general best-practice rules.
* Add `@types/chrome` as a dev dependency and include types in TS config so the IDE can catch misuse of chrome APIs.

### 8 — Telemetry, logging and rollout

* Add ephemeral telemetry events around persistence (only for dev/test builds initially):

  * `persistence.init.success`, `persistence.init.fail`
  * `persistence.migrate.start`, `persistence.migrate.success`, `persistence.migrate.fail`
  * `persistence.transaction.commit`, `persistence.transaction.abort` with error codes
* Add clear logs in adapter init and migration code; include error message, stack and `schema_version`.
* Rollout plan:

  1. Keep `USE_INDEXED_DB=false` by default.
  2. Flip to `true` on a developer profile and run the test harness.
  3. If no errors, enable for a controlled local user group.
  4. If any spike in `persistence.*.fail`, flip feature flag to false for instant rollback.

# Acceptance criteria — how we know it’s safe to switch on

* All unit and integration tests for persistence are green in CI.
* `npx tsc --noEmit` returns zero errors.
* `npm run build` output includes `IndexedDBAdapter` and no missing imports.
* The test harness `test-persistence.html` completes:

  * round-trip put/get for 100 records
  * transaction with delayed work completes and persists
  * migration from chrome.storage performs and backup is stored
* No startup exceptions in the extension background/service worker console when ENABLED.
* Telemetry shows healthy operations for at least one full dev session (no `persistence.*.fail` events).

# PR & code review guidance (what to include in the PR)

* Title: `persistence: stabilize indexeddb migration + adapter gate`
* Description:

  * One-sentence summary of the change.
  * List of the high-level fixes: typo fixes, transaction guard, chrome.storage Promise wrapper, StorageAdapter abstraction, migration runner, tests, CI updates.
  * Risks & mitigation: describe rollback via feature flag and backup files.
  * Explicit verification steps for reviewers to run locally (commands and test harness steps).
* Files to pay attention to in review:

  * `persistence/*`, `storage/*`, `migration/*`, `tests/persistence.*`, `tsconfig.json`, `.eslintrc.*`, `package.json` CI script changes.
* Include test output (jest snapshots or logs) in PR description.

# Rollback procedure (if something breaks after enabling)

1. Flip `USE_INDEXED_DB` to `false` in the extension settings / runtime flag.
2. Reload extension in chrome://extensions.
3. Read `migrationBackup:<latest>` from chrome.storage and, if necessary, rehydrate chrome.storage from that backup.
4. Inspect telemetry to determine the failure surface and revert the PR if necessary.

# Developer notes & gotchas (things the agent must watch for)

* Some files may be excluded from `tsconfig` or the IDE; confirm the file list and run the grep commands across the repo.
* Ensure the background/service worker is reloaded after each build; Chrome’s service worker can remain running old code.
* When writing tests that access IndexedDB in Node, either run them in a browser environment or use a DOM/IDB shim; prefer running the integration tests in an actual browser page (test harness) rather than in Node where IDB isn’t native.
* Don’t change too many parts of the application at once. Keep the adapter interface small and stable to reduce the blast radius.

# Suggested checklist for the IDE agent to mark tasks complete

* [ ] Fixed malformed spread tokens and syntax errors in persistence files.
* [ ] Implemented and tested transaction guard.
* [ ] Implemented chrome.storage Promise wrapper and replaced direct calls.
* [ ] Added StorageAdapter interface, Chrome and IndexedDB adapters, and factory toggle.
* [ ] Replaced high-level callers to use StorageAdapter.
* [ ] Added migration runner and backup creation; tested migration end-to-end.
* [ ] Added/updated tests for init, put/get, transaction race, fallback, and migration.
* [ ] Added `tsc` + `eslint` to CI and pre-commit hooks.
* [ ] Added telemetry events for persistence.
* [ ] Created PR with description, verification steps, and test output.

---
