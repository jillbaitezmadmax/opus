# Complete Persistence Layer Fix Instructions for IDE Agent

**Objective:** Fix all TypeScript errors in the `src/persistence/` directory by aligning schema types with repository implementations, fixing API mismatches, and correcting module exports.

**IMPORTANT:** Work ONLY in the `src/persistence/` directory. Do NOT modify any files in `ui/`, `shared/`, or other directories. Execute phases in order.

---

## Phase 1: Update Schema Type Definitions

**Goal:** Add all missing fields to type interfaces so they match what the repository code expects.

### Task 1.1: Update SessionRecord

**File:** `src/persistence/types.ts`

**Action:** Locate the `SessionRecord` interface and add the following fields:

```typescript
export interface SessionRecord {
  id: string;
  title: string;
  createdAt: number;
  lastActivity: number;
  defaultThreadId: string;
  activeThreadId: string;
  turnCount: number;
  
  // ADD THESE NEW FIELDS:
  updatedAt: number;
  userId?: string;
  provider?: string;
  metadata?: Record<string, any>;
}
```

**Verification:** Ensure all four new fields (`updatedAt`, `userId`, `provider`, `metadata`) are present.

---

### Task 1.2: Update ThreadRecord

**File:** `src/persistence/types.ts`

**Action:** Locate the `ThreadRecord` interface and add these fields:

```typescript
export interface ThreadRecord {
  id: string;
  sessionId: string;
  parentThreadId: string | null;
  branchPointTurnId: string | null;
  name: string;
  color: string;
  isActive: boolean;
  createdAt: number;
  lastActivity: number;
  
  // ADD THESE NEW FIELDS:
  updatedAt: number;
  userId?: string;
  turnCount?: number;
}
```

**Verification:** Ensure three new fields added.

---

### Task 1.3: Update BaseTurnRecord and TurnRecord

**File:** `src/persistence/types.ts`

**Action:** Locate `BaseTurnRecord` interface and add these fields:

```typescript
export interface BaseTurnRecord {
  id: string;
  type: 'user' | 'ai';
  sessionId: string;
  threadId: string;
  createdAt: number;
  isDeleted?: boolean;
  
  // ADD THESE NEW FIELDS:
  updatedAt: number;
  userId?: string;
  role?: string;
  content?: string;
  sequence?: number;
  providerResponseIds?: string[];
}
```

**Verification:** Ensure six new fields added to `BaseTurnRecord`.

---

### Task 1.4: Update ProviderResponseRecord

**File:** `src/persistence/types.ts`

**Action:** Locate `ProviderResponseRecord` and make these changes:

1. **Change `id` type from `number` to `string`**
2. **Add `'cancelled'` to the `status` union type**
3. **Add new optional fields**

```typescript
export interface ProviderResponseRecord {
  id: string; // CHANGED: was number, now string
  sessionId: string;
  aiTurnId: string;
  providerId: string;
  responseType: 'batch' | 'synthesis' | 'ensemble' | 'hidden';
  responseIndex: number;
  text: string;
  status: 'pending' | 'streaming' | 'completed' | 'error' | 'cancelled'; // ADDED: cancelled
  meta?: any;
  attemptNumber?: number;
  createdAt: number;
  updatedAt: number;
  
  // ADD THESE NEW FIELDS:
  completedAt?: number;
  error?: string;
  content?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
  };
}
```

**Verification:** 
- `id` is now `string` (not `number`)
- `status` includes `'cancelled'`
- Four new optional fields added

---

### Task 1.5: Update DocumentRecord

**File:** `src/persistence/types.ts`

**Action:** Locate `DocumentRecord` and add these fields:

```typescript
export interface DocumentRecord {
  id: string;
  title: string;
  sourceSessionId?: string;
  canvasContent: any[];
  granularity: 'full' | 'paragraph' | 'sentence';
  isDirty: boolean;
  createdAt: number;
  lastModified: number;
  version: number;
  blockCount: number;
  refinementHistory: RefinementEntry[];
  exportHistory: ExportEntry[];
  snapshots: DocumentSnapshot[];
  
  // ADD THESE NEW FIELDS:
  updatedAt: number;
  content?: string;
  metadata?: Record<string, any>;
  type?: string;
}
```

**Verification:** Four new fields added.

---

### Task 1.6: Update CanvasBlockRecord

**File:** `src/persistence/types.ts`

**Action:** Locate `CanvasBlockRecord` and add these fields:

```typescript
export interface CanvasBlockRecord {
  id: string;
  documentId: string;
  order: number;
  nodeType: string;
  text: string;
  slateNode: any;
  provenance: {
    sessionId: string;
    aiTurnId: string;
    providerId: string;
    responseType: 'batch' | 'synthesis' | 'ensemble' | 'hidden';
    responseIndex: number;
    textRange?: [number, number];
  };
  cachedSourceText?: string;
  isOrphaned?: boolean;
  createdAt: number;
  updatedAt: number;
  
  // ADD THESE NEW FIELDS:
  parentId?: string;
  children?: string[];
  content?: string;
  metadata?: Record<string, any>;
  type?: string;
}
```

**Verification:** Five new fields added.

---

### Task 1.7: Update GhostRecord

**File:** `src/persistence/types.ts`

**Action:** The current `GhostRecord` is insufficient. Replace it entirely with this complete definition:

```typescript
export interface GhostRecord {
  id: string;
  documentId: string;
  text: string;
  preview: string;
  provenance: {
    sessionId: string;
    aiTurnId: string;
    providerId: string;
    responseType: 'batch' | 'synthesis' | 'ensemble' | 'hidden';
    responseIndex: number;
    textRange?: [number, number];
  };
  order: number;
  createdAt: number;
  isPinned: boolean;
  
  // ADD THESE NEW FIELDS:
  timestamp?: number;
  entityId?: string;
  entityType?: string;
  operation?: string;
  sessionId?: string;
  state?: string;
  metadata?: Record<string, any>;
}
```

**Verification:** Seven new optional fields added.

---

### Task 1.8: Update ProviderContextRecord

**File:** `src/persistence/types.ts`

**Action:** Locate `ProviderContextRecord` and add these fields:

```typescript
export interface ProviderContextRecord {
  sessionId: string;
  providerId: string;
  meta: any;
  text?: string;
  lastUpdated: number;
  
  // ADD THESE NEW FIELDS:
  isActive?: boolean;
  contextData?: any;
  metadata?: Record<string, any>;
}
```

**Verification:** Three new fields added.

---

## Phase 2: Fix Module Exports

**Goal:** Fix import/export statements to use correct paths with `.js` extensions for ES modules.

### Task 2.1: Fix Adapter Exports

**File:** `src/persistence/adapters/index.ts`

**Action:** Update all export statements to include `.js` extensions:

```typescript
export type { IPersistenceAdapter } from './IPersistenceAdapter.js';
export { IndexedDBAdapter } from './IndexedDBAdapter.js';
```

**Verification:** Both exports use `.js` extension.

---

### Task 2.2: Fix Repository Exports

**File:** `src/persistence/repositories/index.ts`

**Action:** Update all export statements to include `.js` extensions:

```typescript
export { SessionsRepository } from './SessionsRepository.js';
export { ThreadsRepository } from './ThreadsRepository.js';
export { TurnsRepository } from './TurnsRepository.js';
export { ProviderResponsesRepository } from './ProviderResponsesRepository.js';
export { DocumentsRepository } from './DocumentsRepository.js';
export { CanvasBlocksRepository } from './CanvasBlocksRepository.js';
export { GhostsRepository } from './GhostsRepository.js';
export { ProviderContextsRepository } from './ProviderContextsRepository.js';
export { MetadataRepository } from './MetadataRepository.js';
```

**Verification:** All nine repository exports use `.js` extension.

---

### Task 2.3: Fix Query Exports

**File:** `src/persistence/queries/index.ts`

**Action:** Update export statement:

```typescript
export { ProvenanceQueries } from './ProvenanceQueries.js';
```

**Verification:** Export uses `.js` extension.

---

### Task 2.4: Fix Main Persistence Index

**File:** `src/persistence/index.ts`

**Action:** Update all export statements to use `.js` extensions:

```typescript
export * from './types.js';
export * from './database.js';
export * from './transactions.js';
export * from './BaseRepository.js';
export * from './DocumentManager.js';
export * from './adapters/index.js';
export * from './repositories/index.js';
export * from './queries/index.js';
```

**Verification:** All exports use `.js` extension.

---

## Phase 3: Fix API Mismatches

**Goal:** Correct function calls that have wrong signatures or arguments.

### Task 3.1: Fix openDatabase Calls

**File:** `src/persistence/adapters/IndexedDBAdapter.ts`

**Action:** Find any calls to `openDatabase()` and ensure they pass NO arguments:

**Find this pattern:**
```typescript
this.db = await openDatabase(dbName, version);
```

**Replace with:**
```typescript
this.db = await openDatabase();
```

**Verification:** All `openDatabase()` calls have zero arguments.

---

### Task 3.2: Fix getHealth Return Type

**File:** `src/persistence/adapters/IPersistenceAdapter.ts`

**Action:** Update the `getHealth` method signature:

**Change from:**
```typescript
getHealth(): Promise<boolean>;
```

**Change to:**
```typescript
getHealth(): Promise<{
  isHealthy: boolean;
  totalRecords: number;
  storeHealthStatuses: Record<string, { count: number; sampleRecord?: any }>;
}>;
```

**Verification:** `getHealth` now returns an object type, not boolean.

---

### Task 3.3: Fix Transaction Calls in DocumentManager

**File:** `src/persistence/DocumentManager.ts`

**Action:** 

1. First, check the signature of `withTransaction` in `src/persistence/transactions.ts`
2. Find the exact function signature (parameters and their types)
3. Update all `withTransaction` calls in `DocumentManager.ts` to match that signature exactly

**If the signature is:**
```typescript
withTransaction<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>): Promise<T>
```

**Then your calls should look like:**
```typescript
await withTransaction(this.db, ['documents', 'canvas_blocks'], 'readwrite', async (tx) => {
  // ... work here
});
```

**Verification:** All `withTransaction` calls match the function signature exactly.

---

### Task 3.4: Fix Database Health Check

**File:** `src/persistence/database.ts`

**Action:** Find any property access like `db.readyState` or `db.error` and fix them:

**Change:**
```typescript
if (!db.readyState) { /* ... */ }
```

**To:**
```typescript
if (!db || db === null) { /* ... */ }
```

**Change:**
```typescript
if (db.error) { /* ... */ }
```

**To:**
```typescript
// IDBDatabase doesn't have an error property - remove this check
// or use: if (request.error) where request is IDBOpenDBRequest
```

**Verification:** No references to non-existent `db.readyState` or `db.error`.

---

## Phase 4: Fix Repository Code

**Goal:** Add explicit types to callback parameters to fix "implicitly has 'any' type" errors.

### Task 4.1: Fix Type Annotations in All Repositories

**Files:** All files in `src/persistence/repositories/` directory

**Action:** For each repository file, find callback functions in methods like `.forEach()`, `.map()`, `.filter()`, `.sort()` and add explicit type annotations.

**Pattern to find:**
```typescript
items.forEach(item => {  // ← item has implicit any
```

**Replace with:**
```typescript
items.forEach((item: SessionRecord) => {  // ← explicit type
```

**Specific examples by repository:**

**SessionsRepository.ts:**
```typescript
.sort((a: SessionRecord, b: SessionRecord) => b.lastActivity - a.lastActivity)
.forEach((session: SessionRecord) => { /* ... */ })
```

**ThreadsRepository.ts:**
```typescript
.sort((a: ThreadRecord, b: ThreadRecord) => b.createdAt - a.createdAt)
.filter((thread: ThreadRecord) => thread.isActive)
```

**TurnsRepository.ts:**
```typescript
.sort((a: TurnRecord, b: TurnRecord) => a.createdAt - b.createdAt)
.forEach((turn: TurnRecord) => { /* ... */ })
```

**ProviderResponsesRepository.ts:**
```typescript
.filter((response: ProviderResponseRecord) => response.status === 'completed')
.map((response: ProviderResponseRecord) => response.text)
```

**Apply this pattern to ALL callback functions in ALL repository files.**

**Verification:** Run TypeScript compiler - no more "implicitly has 'any' type" errors.

---

### Task 4.2: Fix IndexedDBAdapter Type Issues

**File:** `src/persistence/adapters/IndexedDBAdapter.ts`

**Action:** Fix the `setInterval` return type:

**Find:**
```typescript
private healthCheckInterval: NodeJS.Timeout | null = null;
```

**Change to:**
```typescript
private healthCheckInterval: any = null;
```

**Verification:** No type error on `setInterval` assignment.

---

## Phase 5: Fix DocumentManager Issues

**Goal:** Ensure DocumentManager uses repository instances correctly.

### Task 5.1: Fix Repository Method Calls

**File:** `src/persistence/DocumentManager.ts`

**Action:** Find any calls to adapter methods that should be repository methods.

**Pattern to find:**
```typescript
await this.adapter.getGhostsByDocumentId(documentId);
```

**Replace with:**
```typescript
await this.ghostsRepo.getByDocumentId(documentId);
```

**Do this for all repository-specific queries:**
- Use `this.docsRepo` for document operations
- Use `this.blocksRepo` for canvas block operations
- Use `this.ghostsRepo` for ghost operations

**Verification:** DocumentManager only calls methods that exist on the repository instances.

---

### Task 5.2: Ensure Repository Instances Exist

**File:** `src/persistence/DocumentManager.ts`

**Action:** In the constructor, verify all repository instances are created:

```typescript
constructor(private db: IDBDatabase) {
  this.docsRepo = new DocumentsRepository(db);
  this.blocksRepo = new CanvasBlocksRepository(db);
  this.ghostsRepo = new GhostsRepository(db);
}
```

**Verification:** All three repository instances are initialized in constructor.

---

## Phase 6: Final Compilation Check

### Task 6.1: Run TypeScript Compiler

**Action:** Execute the build command:

```bash
npm run build
```

**Expected Result:** Zero TypeScript errors in the `src/persistence/` directory.

**If errors remain:**
1. Read the error message carefully
2. Identify which phase's fix was incomplete
3. Go back to that phase and verify all changes were made
4. Re-run the compiler

---

### Task 6.2: Verify File Structure

**Action:** Ensure these files exist with correct names:

```
src/persistence/
├── types.ts
├── database.ts
├── transactions.ts
├── BaseRepository.ts
├── DocumentManager.ts
├── index.ts
├── adapters/
│   ├── IPersistenceAdapter.ts
│   ├── IndexedDBAdapter.ts
│   └── index.ts
├── repositories/
│   ├── SessionsRepository.ts
│   ├── ThreadsRepository.ts
│   ├── TurnsRepository.ts
│   ├── ProviderResponsesRepository.ts
│   ├── DocumentsRepository.ts
│   ├── CanvasBlocksRepository.ts
│   ├── GhostsRepository.ts
│   ├── ProviderContextsRepository.ts
│   ├── MetadataRepository.ts
│   └── index.ts
└── queries/
    ├── ProvenanceQueries.ts
    └── index.ts
```

**Verification:** All files are `.ts` (not `.js`), all directories exist.

---

## Success Criteria

Before reporting completion, verify:

- [ ] All type definitions in `src/persistence/types.ts` include new fields
- [ ] All `export` statements use `.js` extensions
- [ ] All `openDatabase()` calls have zero arguments
- [ ] `getHealth()` returns object type, not boolean
- [ ] All callback parameters have explicit type annotations
- [ ] No references to `db.readyState` or `db.error`
- [ ] DocumentManager uses repository instances correctly
- [ ] `npm run build` completes with ZERO errors in `src/persistence/`

---

## Important Notes

- **Do NOT modify any files outside `src/persistence/` directory**
- **Do NOT skip phases - execute in order**
- **Do NOT assume similar code is correct - check every file**
- **If stuck on a specific error, report the exact error message and file location**

---

**After completing all phases and passing the success criteria, report back for the next stage of UI integration.**