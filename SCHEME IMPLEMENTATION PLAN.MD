**Excellent. Let me break down the schema implementation into a complete, sequenced set of actionable tasks for your IDE agents.**

---

## Implementation Task Breakdown

### Phase 1: Database Infrastructure (Days 1-3)

#### Task 1.1: Create IndexedDB Type Definitions

**File:** `src/persistence/types.ts`

**Deliverable:**

```typescript
// Export all 9 store record interfaces from the schema
export interface SessionRecord { ... }
export interface ThreadRecord { ... }
export interface TurnRecord { ... }
export interface ProviderResponseRecord { ... }
export interface DocumentRecord { ... }
export interface CanvasBlockRecord { ... }
export interface GhostRecord { ... }
export interface ProviderContextRecord { ... }
export interface MetadataRecord { ... }

// Store configuration types
export interface StoreConfig {
  name: string;
  keyPath: string | string[];
  autoIncrement?: boolean;
  indices: IndexConfig[];
}

export interface IndexConfig {
  name: string;
  keyPath: string | string[];
  unique?: boolean;
  multiEntry?: boolean;
}
```

**Success Criteria:**

- All interfaces match schema exactly
- TypeScript compilation succeeds
- Exported types usable by other modules

---

#### Task 1.2: Create Database Initialization Module

**File:** `src/persistence/database.ts`

**Deliverable:**

```typescript
export const DB_NAME = 'OpusDeusDB';
export const DB_VERSION = 1;

// Store configurations (from schema)
export const STORE_CONFIGS: StoreConfig[] = [ /* all 9 stores */ ];

// Main database opener
export async function openDatabase(): Promise<IDBDatabase>;

// Schema creation
function createInitialSchema(db: IDBDatabase): void;

// Helper to get current version
export async function getCurrentSchemaVersion(): Promise<number>;
```

**Dependencies:** Task 1.1 (types)

**Success Criteria:**

- Database opens successfully in Chrome extension context
- All 9 stores created with correct indices
- Schema version stored in metadata store
- Proper error handling for quota exceeded

---

#### Task 1.3: Create Transaction Utilities

**File:** `src/persistence/transactions.ts`

**Deliverable:**

```typescript
// Transaction wrapper with automatic retry
export async function withTransaction<T>(
  db: IDBDatabase,
  storeNames: string | string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T>
): Promise<T>;

// Batch operations helper
export async function batchWrite<T>(
  db: IDBDatabase,
  storeName: string,
  records: T[]
): Promise<void>;

// Version-based optimistic locking
export async function updateWithVersionCheck<T extends { version: number }>(
  db: IDBDatabase,
  storeName: string,
  id: string | string[],
  updates: Partial<T>,
  expectedVersion: number
): Promise<{ success: boolean; currentVersion?: number }>;
```

**Dependencies:** Task 1.2 (database)

**Success Criteria:**

- Transactions handle errors gracefully
- Retry logic works for transient failures
- Version conflicts detected and returned

---

### Phase 2: Repository Layer (Days 4-6)

#### Task 2.1: Create Base Repository Class

**File:** `src/persistence/BaseRepository.ts`

**Deliverable:**

```typescript
export abstract class BaseRepository<T> {
  constructor(
    protected db: IDBDatabase,
    protected storeName: string
  ) {}
  
  async get(id: string | string[]): Promise<T | null>;
  async getAll(): Promise<T[]>;
  async put(record: T): Promise<void>;
  async delete(id: string | string[]): Promise<void>;
  
  protected async getByIndex(
    indexName: string,
    key: IDBValidKey | IDBKeyRange
  ): Promise<T[]>;
}
```

**Dependencies:** Task 1.2, 1.3

**Success Criteria:**

- Generic CRUD operations work
- Index queries abstracted
- TypeScript generics preserve type safety

---

#### Task 2.2: Implement Store-Specific Repositories

**Files:**

- `src/persistence/SessionRepository.ts`
- `src/persistence/ThreadRepository.ts`
- `src/persistence/TurnRepository.ts`
- `src/persistence/ProviderResponseRepository.ts`
- `src/persistence/DocumentRepository.ts`
- `src/persistence/CanvasBlockRepository.ts`
- `src/persistence/GhostRepository.ts`
- `src/persistence/ProviderContextRepository.ts`

**Example (TurnRepository):**

```typescript
export class TurnRepository extends BaseRepository<TurnRecord> {
  constructor(db: IDBDatabase) {
    super(db, 'turns');
  }
  
  // Specific query methods from schema
  async getBySessionId(sessionId: string): Promise<TurnRecord[]> {
    return this.getByIndex('bySessionId_createdAt', 
      IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity])
    );
  }
  
  async getByThreadId(threadId: string): Promise<TurnRecord[]> {
    return this.getByIndex('byThreadId_createdAt',
      IDBKeyRange.bound([threadId, 0], [threadId, Infinity])
    );
  }
  
  async softDelete(turnId: string): Promise<void> {
    const turn = await this.get(turnId);
    if (turn) {
      turn.isDeleted = true;
      await this.put(turn);
    }
  }
}
```

**Dependencies:** Task 2.1

**Success Criteria:**

- All query patterns from schema implemented
- Each repository exports typed methods
- Compound index queries work correctly

---

#### Task 2.3: Implement Provenance Query Helpers

**File:** `src/persistence/ProvenanceQueries.ts`

**Deliverable:**

```typescript
// High-level provenance queries
export class ProvenanceQueries {
  constructor(
    private db: IDBDatabase,
    private blockRepo: CanvasBlockRepository,
    private responseRepo: ProviderResponseRepository,
    private turnRepo: TurnRepository
  ) {}
  
  // Get exact source response for a block
  async getBlockSource(
    provenance: CanvasBlockRecord['provenance']
  ): Promise<ProviderResponseRecord | null>;
  
  // Get all blocks from a turn
  async getBlocksByTurn(aiTurnId: string): Promise<CanvasBlockRecord[]>;
  
  // Get full provenance chain (block → response → turn → session)
  async getFullProvenance(blockId: string): Promise<{
    block: CanvasBlockRecord;
    response: ProviderResponseRecord;
    turn: AiTurnRecord;
    session: SessionRecord;
  }>;
  
  // Get all documents containing content from session
  async getDocumentsBySession(sessionId: string): Promise<string[]>;
}
```

**Dependencies:** Task 2.2

**Success Criteria:**

- All required queries from schema work
- Performance meets O(log n) targets
- Proper null handling for orphaned data

---

### Phase 3: SessionManager Integration (Days 7-9)

#### Task 3.1: Create Persistence Adapter Interface

**File:** `src/persistence/IPersistenceAdapter.ts`

**Deliverable:**

```typescript
// Abstract interface matching SessionManager's current API
export interface IPersistenceAdapter {
  // Session operations
  getSession(sessionId: string): Promise<SessionData | null>;
  saveSession(sessionId: string, data: SessionData): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  listSessions(): Promise<SessionSummary[]>;
  
  // Turn operations
  saveTurnPair(
    sessionId: string,
    threadId: string,
    userTurn: UserTurn,
    aiTurn: AiTurn
  ): Promise<void>;
  
  getTurns(sessionId: string): Promise<TurnMessage[]>;
  
  // Provider context operations
  saveProviderContext(
    sessionId: string,
    providerId: string,
    context: any
  ): Promise<void>;
  
  getProviderContexts(sessionId: string): Promise<Record<string, any>>;
}

// Legacy chrome.storage.local adapter (current implementation)
export class ChromeStorageAdapter implements IPersistenceAdapter { ... }

// New IndexedDB adapter
export class IndexedDBAdapter implements IPersistenceAdapter { ... }
```

**Dependencies:** Task 2.2

**Success Criteria:**

- Interface matches SessionManager's needs
- Both adapters implement same interface
- Can switch between implementations via config

---

#### Task 3.2: Implement IndexedDB Persistence Adapter

**File:** `src/persistence/IndexedDBAdapter.ts`

**Deliverable:**

```typescript
export class IndexedDBAdapter implements IPersistenceAdapter {
  private db: IDBDatabase;
  private repos: {
    sessions: SessionRepository;
    threads: ThreadRepository;
    turns: TurnRepository;
    responses: ProviderResponseRepository;
    contexts: ProviderContextRepository;
  };
  
  async saveTurnPair(
    sessionId: string,
    threadId: string,
    userTurn: UserTurn,
    aiTurn: AiTurn
  ): Promise<void> {
    // Transaction across turns and provider_responses stores
    await withTransaction(this.db, ['turns', 'provider_responses'], 'readwrite', async (tx) => {
      // Save UserTurn
      await this.repos.turns.put({ ...userTurn, sessionId, threadId });
      
      // Save AiTurn
      const aiTurnRecord: AiTurnRecord = {
        ...aiTurn,
        sessionId,
        threadId,
        batchResponseCount: Object.keys(aiTurn.batchResponses).length,
        synthesisResponseCount: Object.values(aiTurn.synthesisResponses).flat().length,
        ensembleResponseCount: Object.values(aiTurn.ensembleResponses).flat().length
      };
      await this.repos.turns.put(aiTurnRecord);
      
      // Normalize and save all provider responses
      await this.saveProviderResponses(sessionId, aiTurn);
    });
  }
  
  private async saveProviderResponses(sessionId: string, aiTurn: AiTurn): Promise<void> {
    const responses: ProviderResponseRecord[] = [];
    
    // Batch responses
    for (const [providerId, response] of Object.entries(aiTurn.batchResponses)) {
      responses.push({
        sessionId,
        aiTurnId: aiTurn.id,
        providerId,
        responseType: 'batch',
        responseIndex: 0,
        ...response
      });
    }
    
    // Synthesis responses (arrays)
    for (const [providerId, takes] of Object.entries(aiTurn.synthesisResponses)) {
      takes.forEach((response, index) => {
        responses.push({
          sessionId,
          aiTurnId: aiTurn.id,
          providerId,
          responseType: 'synthesis',
          responseIndex: index,
          ...response
        });
      });
    }
    
    // Ensemble responses (arrays)
    for (const [providerId, takes] of Object.entries(aiTurn.ensembleResponses)) {
      takes.forEach((response, index) => {
        responses.push({
          sessionId,
          aiTurnId: aiTurn.id,
          providerId,
          responseType: 'ensemble',
          responseIndex: index,
          ...response
        });
      });
    }
    
    await this.repos.responses.batchWrite(responses);
  }
  
  async getTurns(sessionId: string): Promise<TurnMessage[]> {
    // Query turns, then hydrate AI turns with responses
    const turnRecords = await this.repos.turns.getBySessionId(sessionId);
    const hydrated: TurnMessage[] = [];
    
    for (const record of turnRecords) {
      if (record.type === 'user') {
        hydrated.push(record as UserTurn);
      } else {
        // Hydrate AI turn by fetching responses
        const responses = await this.repos.responses.getByAiTurnId(record.id);
        const aiTurn = this.hydrateAiTurn(record as AiTurnRecord, responses);
        hydrated.push(aiTurn);
      }
    }
    
    return hydrated;
  }
  
  private hydrateAiTurn(record: AiTurnRecord, responses: ProviderResponseRecord[]): AiTurn {
    const batchResponses: Record<string, ProviderResponse> = {};
    const synthesisResponses: Record<string, ProviderResponse[]> = {};
    const ensembleResponses: Record<string, ProviderResponse[]> = {};
    
    for (const r of responses) {
      const response: ProviderResponse = {
        providerId: r.providerId,
        text: r.text,
        status: r.status,
        meta: r.meta,
        attemptNumber: r.attemptNumber,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      };
      
      if (r.responseType === 'batch') {
        batchResponses[r.providerId] = response;
      } else if (r.responseType === 'synthesis') {
        if (!synthesisResponses[r.providerId]) synthesisResponses[r.providerId] = [];
        synthesisResponses[r.providerId][r.responseIndex] = response;
      } else if (r.responseType === 'ensemble') {
        if (!ensembleResponses[r.providerId]) ensembleResponses[r.providerId] = [];
        ensembleResponses[r.providerId][r.responseIndex] = response;
      }
    }
    
    return {
      type: 'ai',
      id: record.id,
      createdAt: record.createdAt,
      sessionId: record.sessionId,
      userTurnId: record.userTurnId,
      batchResponses,
      synthesisResponses,
      ensembleResponses,
      meta: record.meta
    };
  }
}
```

**Dependencies:** Task 2.2, 3.1

**Success Criteria:**

- Turns save and load correctly
- Responses normalized and hydrated properly
- Transactions handle errors
- Performance acceptable for 500+ turn sessions

---

#### Task 3.3: Update SessionManager to Use Adapter

**File:** `src/sw-entry.js` (modify existing)

**Changes:**

```javascript
// Add at top
import { IndexedDBAdapter } from './persistence/IndexedDBAdapter.js';
import { ChromeStorageAdapter } from './persistence/ChromeStorageAdapter.js';

// In SessionManager initialization
const USE_INDEXEDDB = true; // Feature flag
const persistenceAdapter = USE_INDEXEDDB 
  ? new IndexedDBAdapter()
  : new ChromeStorageAdapter();

// Replace all direct chrome.storage.local calls with adapter
class SessionManager {
  async getOrCreateSession(sessionId) {
    let session = await persistenceAdapter.getSession(sessionId);
    if (!session) {
      session = this.createNewSession(sessionId);
      await persistenceAdapter.saveSession(sessionId, session);
    }
    return session;
  }
  
  async addTurn(sessionId, threadId, userTurn, aiTurn) {
    await persistenceAdapter.saveTurnPair(sessionId, threadId, userTurn, aiTurn);
    // Update in-memory cache
    this.sessions.set(sessionId, /* ... */);
  }
  
  // ... rest of methods updated similarly
}
```

**Dependencies:** Task 3.2

**Success Criteria:**

- SessionManager works identically with both adapters
- Can toggle via feature flag
- Existing API consumers (workflow-engine, UI) unaffected

---

### Phase 4: Composer Integration (Days 10-13)

#### Task 4.1: Create Document Manager

**File:** `src/persistence/DocumentManager.ts`

**Deliverable:**

```typescript
export class DocumentManager {
  constructor(
    private db: IDBDatabase,
    private docRepo: DocumentRepository,
    private blockRepo: CanvasBlockRepository,
    private ghostRepo: GhostRepository
  ) {}
  
  // Create new document (optionally from session/turn)
  async createDocument(params: {
    title?: string;
    sourceSessionId?: string;
    sourceAiTurnId?: string;
  }): Promise<DocumentRecord>;
  
  // Load document with blocks
  async loadDocument(documentId: string): Promise<{
    document: DocumentRecord;
    blocks: CanvasBlockRecord[];
    ghosts: GhostRecord[];
  }>;
  
  // Save document with optimistic locking
  async saveDocument(
    documentId: string,
    updates: {
      canvasContent: any[];
      blocks: CanvasBlockRecord[];
      expectedVersion: number;
    }
  ): Promise<{ success: boolean; currentVersion?: number }>;
  
  // Decompose Slate content into blocks with provenance
  decomposeSlateContent(
    canvasContent: any[],
    documentId: string
  ): CanvasBlockRecord[];
  
  // Recompose blocks into Slate content
  recomposeSlateContent(blocks: CanvasBlockRecord[]): any[];
}
```

**Dependencies:** Task 2.2

**Success Criteria:**

- Documents save/load correctly
- Blocks preserve Slate hierarchy
- Version conflicts detected
- Provenance attached to all blocks

---

#### Task 4.2: Implement Slate Content Decomposition

**File:** `src/persistence/SlateDecomposer.ts`

**Deliverable:**

```typescript
export class SlateDecomposer {
  // Convert Slate nodes to canvas blocks
  static decompose(
    nodes: SlateDescendant[],
    documentId: string,
    startOrder: number = 0
  ): CanvasBlockRecord[] {
    const blocks: CanvasBlockRecord[] = [];
    let order = startOrder;
    
    for (const node of nodes) {
      if ('provenance' in node && node.provenance) {
        // Node has provenance (came from AI output)
        blocks.push({
          id: uuid(),
          documentId,
          order: order++,
          nodeType: node.type || 'paragraph',
          text: extractPlainText(node),
          slateNode: node,
          provenance: node.provenance,
          cachedSourceText: extractPlainText(node),
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      } else if ('children' in node) {
        // Recurse into children
        blocks.push(...this.decompose(node.children, documentId, order));
        order += blocks.length;
      }
    }
    
    return blocks;
  }
  
  // Reconstruct Slate content from blocks
  static recompose(blocks: CanvasBlockRecord[]): SlateDescendant[] {
    return blocks
      .sort((a, b) => a.order - b.order)
      .map(block => block.slateNode);
  }
}

function extractPlainText(node: any): string {
  if ('text' in node) return node.text;
  if ('children' in node) {
    return node.children.map(extractPlainText).join('');
  }
  return '';
}
```

**Dependencies:** Task 4.1

**Success Criteria:**

- Slate hierarchy preserved
- Plain text extracted for search
- Provenance retained in blocks
- Recomposition produces valid Slate JSON

---

#### Task 4.3: Update ComposerMode to Use DocumentManager

**File:** `ui/components/composer/ComposerMode.tsx` (modify)

**Changes:**

```typescript
import { DocumentManager } from '../../../src/persistence/DocumentManager';

// In ComposerMode component
const [documentId, setDocumentId] = useState<string | null>(null);
const [docVersion, setDocVersion] = useState<number>(0);

// On enter composer mode
useEffect(() => {
  const initDocument = async () => {
    if (aiTurn.composerState) {
      // Load existing document
      const doc = await documentManager.loadDocument(aiTurn.composerState.documentId);
      setDocumentId(doc.document.id);
      setDocVersion(doc.document.version);
      actions.setCanvasContent(doc.document.canvasContent);
    } else {
      // Create new document
      const doc = await documentManager.createDocument({
        title: `Composition from ${aiTurn.id}`,
        sourceSessionId: sessionId,
        sourceAiTurnId: aiTurn.id
      });
      setDocumentId(doc.id);
      setDocVersion(doc.version);
    }
  };
  initDocument();
}, [aiTurn]);

// On save (debounced)
const handleSave = useCallback(async () => {
  if (!documentId) return;
  
  const blocks = documentManager.decomposeSlateContent(
    composerState.canvasContent,
    documentId
  );
  
  const result = await documentManager.saveDocument(documentId, {
    canvasContent: composerState.canvasContent,
    blocks,
    expectedVersion: docVersion
  });
  
  if (result.success) {
    setDocVersion(docVersion + 1);
    actions.markSaved();
  } else {
    // Version conflict - show UI warning
    alert(`Document was updated elsewhere. Current version: ${result.currentVersion}`);
  }
}, [documentId, composerState, docVersion]);
```

**Dependencies:** Task 4.1, 4.2

**Success Criteria:**

- Documents save automatically
- Version conflicts detected and handled
- Provenance preserved on all dragged content
- No data loss on browser crash

---

#### Task 4.4: Implement Ghost Layer Persistence

**File:** `ui/components/composer/GhostLayer.tsx` (new)

**Deliverable:**

```typescript
export const GhostLayer: React.FC<{
  documentId: string;
  ghosts: GhostRecord[];
  onDragGhost: (ghost: GhostRecord) => void;
  onRemoveGhost: (ghostId: string) => void;
}> = ({ documentId, ghosts, onDragGhost, onRemoveGhost }) => {
  // Render ghost chips
  // Each ghost is draggable with full provenance
};

// In ComposerMode
const [ghosts, setGhosts] = useState<GhostRecord[]>([]);

// Alt+Click handler in FocusPane
const handleAltClick = async (unit: GranularUnit, provenance: any) => {
  if (!documentId) return;
  
  const ghost: GhostRecord = {
    id: uuid(),
    documentId,
    text: unit.text,
    preview: unit.text.substring(0, 200),
    provenance,
    order: ghosts.length,
    createdAt: Date.now(),
    isPinned: false
  };
  
  await ghostRepo.put(ghost);
  setGhosts([...ghosts, ghost]);
};
```

**Dependencies:** Task 2.2, 4.3

**Success Criteria:**

- Ghosts persist across sessions
- Alt+Click creates ghost
- Ghosts draggable to canvas with provenance
- Ghosts removable

---

### Phase 5: UI API Integration (Days 14-15)

#### Task 5.1: Update Extension API for History Queries

**File:** `ui/services/extension-api.ts` (modify)

**Changes:**

```typescript
// Update getHistoryList to query IndexedDB
async getHistoryList(): Promise<HistoryApiResponse> {
  const response = await this.sendMessage({
    type: 'GET_FULL_HISTORY'
  });
  return response;
}

// In service worker message handler (src/sw-entry.js)
case 'GET_FULL_HISTORY': {
  const sessions = await persistenceAdapter.listSessions();
  return { sessions };
}

case 'GET_HISTORY_SESSION': {
  const { sessionId } = message;
  const session = await persistenceAdapter.getSession(sessionId);
  const turns = await persistenceAdapter.getTurns(sessionId);
  const providerContexts = await persistenceAdapter.getProviderContexts(sessionId);
  
  return {
    ...session,
    turns,
    providerContexts
  };
}
```

**Dependencies:** Task 3.2

**Success Criteria:**

- History panel loads sessions from IndexedDB
- Session details load correctly
- Performance acceptable for 50+ sessions

---

#### Task 5.2: Add Provenance UI Indicators

**File:** `ui/components/composer/ProvenanceIndicator.tsx` (new)

**Deliverable:**

```typescript
export const ProvenanceIndicator: React.FC<{
  provenance: CanvasBlockRecord['provenance'];
  onShowSource: () => void;
}> = ({ provenance, onShowSource }) => {
  const provider = getProviderById(provenance.providerId);
  
  return (
    <div className="provenance-badge">
      <div className={`model-logo ${provider?.logoBgClass}`} />
      <span>{provider?.name}</span>
      <span>{provenance.responseType}</span>
      <button onClick={onShowSource}>Show Source</button>
    </div>
  );
};

// Add to CanvasEditor for each composed-content block
```

**Dependencies:** Task 4.3

**Success Criteria:**

- Provenance visible on hover
- "Show Source" jumps to originating turn
- Visual indicators for different response types

---

### Phase 6: Testing & Validation (Days 16-17)

#### Task 6.1: Create Data Integrity Tests

**File:** `tests/persistence/integrity.test.ts`

**Test Cases:**

```typescript
describe('Data Integrity', () => {
  test('Turn save/load roundtrip', async () => {
    // Save turn pair, load back, verify structure
  });
  
  test('Response normalization', async () => {
    // Verify synthesis arrays stored correctly
  });
  
  test('Provenance chain completeness', async () => {
    // Create block, trace to source, verify all links
  });
  
  test('Orphan handling', async () => {
    // Delete turn, verify blocks marked orphaned
  });
  
  test('Version conflict detection', async () => {
    // Concurrent updates, verify version check works
  });
});
```

---

#### Task 6.2: Performance Validation

**File:** `tests/persistence/performance.test.ts`

**Test Cases:**

```typescript
describe('Performance', () => {
  test('Load 500-turn session', async () => {
    // Create session with 500 turns
    const start = Date.now();
    const turns = await adapter.getTurns(sessionId);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000); // 1 second max
  });
  
  test('Query blocks by turn (10,000 blocks)', async () => {
    // Verify O(log n) with index
  });
  
  test('Document autosave (debounced)', async () => {
    // Verify no excessive writes
  });
});
```

---

## Summary: Complete Task List

### Phase 1: Infrastructure (3 days)

- [x] Task 1.1: Type definitions
- [x] Task 1.2: Database initialization
- [x] Task 1.3: Transaction utilities

### Phase 2: Repositories (3 days)

- [x] Task 2.1: Base repository
- [x] Task 2.2: Store-specific repositories (9 files)
- [x] Task 2.3: Provenance queries

### Phase 3: SessionManager (3 days)

- [x] Task 3.1: Adapter interface
- [x] Task 3.2: IndexedDB adapter
- [x] Task 3.3: SessionManager integration

### Phase 4: Composer (4 days)

- [x] Task 4.1: Document manager
- [x] Task 4.2: Slate decomposition
- [x] Task 4.3: ComposerMode integration
- [x] Task 4.4: Ghost layer persistence

### Phase 5: UI Integration (2 days)

- [x] Task 5.1: Extension API updates
- [x] Task 5.2: Provenance UI

### Phase 6: Testing (2 days)

- [x] Task 6.1: Integrity tests
- [x] Task 6.2: Performance tests



---


---
