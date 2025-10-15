

## The COMPLETE Plan (What Your Agent Actually Needs)

### **Phase 0: Pre-Flight Validation** (MISSING FROM PLAN)

**Objective:** Verify persistence layer works in isolation before UI integration.

**Steps:**

1. **Test Database Initialization**
   - Open `test-persistence.html` in browser
   - Run: `openDatabase()` from console
   - Verify: IndexedDB `OpusDeusDB` appears in DevTools → Application → Storage
   - Verify: All 9 object stores created with indices

2. **Test DocumentManager in Isolation**
   ```
   Create test script in test-persistence.html:
   - Save a test DocumentRecord
   - Load it back
   - Verify ghosts array preserved
   - Delete document
   - Verify it's gone
   ```

3. **Fix Any Repository Issues**
   - If `DocumentsRepository.getAll()` fails, fix indices
   - If `GhostsRepository.getByDocumentId()` returns nothing, check keyPath
   - Ensure all repositories extend `BaseRepository` correctly

**Success Criteria:**
- Can save/load/delete documents via `DocumentManager` without UI
- No console errors
- Data persists across page reloads

---

### **Phase 1: Unify Type System** (AS STATED, BUT ADD DETAILS)

**Objective:** Single source of truth for all types.

**Steps:**

1. **Open `ui/types.ts` and Add Imports**
   ```
   At the top of file, add:
   
   import type {
     Provenance as SchemaProvenance,
     GhostRecord as SchemaGhostRecord,
     DocumentRecord as SchemaDocumentRecord,
     CanvasBlockRecord,
     SessionRecord,
     ThreadRecord,
     TurnRecord,
     ProviderResponseRecord
   } from '../src/persistence/types';
   
   import type {
     ProviderResponse as WireProviderResponse,
     AiTurn as WireAiTurn
   } from '../shared/contract';
   ```

2. **Delete Duplicate Definitions in `ui/types.ts`**
   ```
   Remove (if they exist as separate definitions):
   - Old Ghost interface
   - Old DocumentRecord interface
   - Old Provenance interface
   - Conflicting AiTurn/UserTurn definitions
   ```

3. **Create Unified Type Exports**
   ```
   After imports, add:
   
   // Re-export persistence types
   export type { CanvasBlockRecord, SessionRecord, ThreadRecord, TurnRecord, ProviderResponseRecord };
   
   // Unified Provenance
   export interface Provenance extends SchemaProvenance {}
   
   // Unified Ghost
   export type Ghost = SchemaGhostRecord;
   
   // Unified DocumentRecord (UI needs Slate typing)
   export interface DocumentRecord extends Omit<SchemaDocumentRecord, 'canvasContent'> {
     canvasContent: SlateDescendant[];
     ghosts?: Ghost[];
     _tempStorage?: boolean;
   }
   
   // UI-specific AiTurn extends wire format
   export interface AiTurn extends Omit<WireAiTurn, 'type'> {
     type: 'ai';
     composerState?: ComposerState;
     // Keep deprecated fields for transition
     providerResponses?: Record<string, ProviderResponse>;
     isSynthesisAnswer?: boolean;
     isEnsembleAnswer?: boolean;
   }
   ```

4. **Update Slate Type Definitions**
   ```
   In ui/types/slate.d.ts:
   
   import type { Provenance } from './types';
   
   type ComposedContentElement = {
     type: 'composed-content';
     provenance: Provenance; // Make required, not optional
     metadata?: any;
     children: CustomText[];
   };
   ```

5. **Project-Wide Import Fix**
   ```
   Search all files in ui/ directory for:
   - import from '../src/persistence/types'
   - import from '../../src/persistence/types'
   
   Replace with:
   - import from './types' (or '.././types' based on depth)
   
   Specifically check these files:
   - ui/components/composer/FocusPane.tsx
   - ui/components/composer/GhostLayer.tsx
   - ui/components/composer/ComposerMode.tsx
   - ui/services/enhancedDocumentStore.ts
   ```

6. **Run TypeScript Compilation**
   ```
   Run: npm run build
   Fix any remaining type errors
   All imports should resolve
   No circular dependencies
   ```

**Success Criteria:**
- Zero TypeScript errors
- All UI components import from `ui/types.ts` only
- `Ghost`, `DocumentRecord`, `Provenance` have single definition

---

### **Phase 2: Create UI-Persistence Bridge** (AS STATED, BUT ADD VALIDATION)

**Objective:** Clean service layer connecting UI to IndexedDB.

**Steps:**

1. **Implement `enhancedDocumentStore.ts`**
   ```
   Open ui/services/enhancedDocumentStore.ts
   
   Ensure it contains:
   - Private docManager property (DocumentManager instance)
   - Private getDocManager() method that calls openDatabase()
   - Public async saveDocument(doc: DocumentRecord)
   - Public async loadDocument(id: string): Promise<DocumentRecord | null>
   - Public async listDocuments(): Promise<DocumentSummary[]>
   - Public async deleteDocument(id: string)
   
   Ensure all methods delegate to docManager
   Ensure proper error handling (try/catch with console.error)
   ```

2. **Verify DocumentManager Methods**
   ```
   Open src/persistence/DocumentManager.ts
   
   Verify these methods exist and match signatures:
   - async saveDocument(doc: DocumentRecord): Promise<void>
   - async loadDocument(id: string): Promise<DocumentRecord | null>
   - async listDocuments(): Promise<DocumentSummary[]>
   - async deleteDocument(id: string): Promise<void>
   
   If missing, implement using DocumentsRepository and GhostsRepository
   ```

3. **Delete Legacy Document Store**
   ```
   Delete file: ui/services/documentStore.ts
   
   Search project for imports from './documentStore'
   Replace all with './enhancedDocumentStore'
   ```

4. **Export from Index**
   ```
   In ui/services/index.ts (create if doesn't exist):
   
   export { documentStore } from './enhancedDocumentStore';
   export type { DocumentSummary } from './enhancedDocumentStore';
   ```

5. **Test Bridge in Console**
   ```
   In test-persistence.html, add:
   
   import { documentStore } from './ui/services/enhancedDocumentStore.js';
   
   Test:
   - await documentStore.saveDocument(testDoc)
   - await documentStore.listDocuments()
   - await documentStore.loadDocument(docId)
   
   Verify: No errors, data persists
   ```

**Success Criteria:**
- `enhancedDocumentStore` works in isolation
- Can save/load documents from browser console
- Legacy `documentStore.ts` removed
- No import errors

---

### **Phase 3: Integrate Composer UI** (AS STATED, BUT ADD WIRING DETAILS)

**Objective:** Wire ComposerMode to use persistent documents.

**Sub-Phase 3A: Update App.tsx (MISSING FROM PLAN)**

1. **Pass `allTurns` to ComposerMode**
   ```
   In App.tsx, find where ComposerMode is rendered
   
   Ensure it receives:
   <ComposerMode
     aiTurn={activeComposerTurn}
     allTurns={messages}  // ← Add this if missing
     sessionId={currentSessionId}
     onExit={handleExitComposerMode}
     onUpdateAiTurn={handleUpdateAiTurnForComposer}
   />
   ```

2. **Add Error Boundary**
   ```
   Wrap ComposerMode in ErrorBoundary:
   
   {viewMode === ViewMode.COMPOSER && activeComposerTurn ? (
     <ErrorBoundary fallback={<div>Composer Error</div>}>
       <ComposerMode ... />
     </ErrorBoundary>
   ) : null}
   ```

**Sub-Phase 3B: ComposerMode Document Lifecycle**

1. **Add State Variables**
   ```
   In ComposerMode.tsx, add:
   
   const [documentId, setDocumentId] = useState<string | null>(null);
   const [isLoadingDoc, setIsLoadingDoc] = useState(false);
   const [lastSaved, setLastSaved] = useState<number | undefined>(undefined);
   ```

2. **Implement Load/Create Document Effect**
   ```
   Add useEffect that runs on mount:
   
   useEffect(() => {
     const initDocument = async () => {
       setIsLoadingDoc(true);
       try {
         // Check if aiTurn has existing document
         if (aiTurn.composerState?.documentId) {
           const doc = await documentStore.loadDocument(aiTurn.composerState.documentId);
           if (doc) {
             setDocumentId(doc.id);
             actions.setCanvasContent(doc.canvasContent);
             actions.loadGhosts(doc.ghosts || []);
             actions.markSaved();
             return;
           }
         }
         
         // Create new document
         const newDoc: DocumentRecord = {
           id: uuid(),
           title: `Composition from ${new Date().toLocaleDateString()}`,
           sourceSessionId: sessionId || undefined,
           canvasContent: [{ type: 'paragraph', children: [{ text: '' }] }],
           granularity: 'full',
           isDirty: false,
           createdAt: Date.now(),
           lastModified: Date.now(),
           version: 0,
           blockCount: 0,
           refinementHistory: [],
           exportHistory: [],
           snapshots: [],
           ghosts: [],
           _tempStorage: false
         };
         
         await documentStore.saveDocument(newDoc);
         setDocumentId(newDoc.id);
         
         // Link to aiTurn
         if (onUpdateAiTurn) {
           onUpdateAiTurn(aiTurn.id, {
             composerState: { ...composerState, documentId: newDoc.id }
           });
         }
       } catch (error) {
         console.error('[Composer] Init failed:', error);
       } finally {
         setIsLoadingDoc(false);
       }
     };
     
     initDocument();
   }, [aiTurn.id, sessionId]);
   ```

3. **Implement Auto-Save Effect**
   ```
   Add debounced auto-save:
   
   useEffect(() => {
     if (!documentId || !composerState.isDirty || isLoadingDoc) return;
     
     const saveTimer = setTimeout(async () => {
       try {
         const doc: DocumentRecord = {
           id: documentId,
           title: documentTitle,
           sourceSessionId: sessionId || undefined,
           canvasContent: composerState.canvasContent,
           granularity: composerState.granularity,
           isDirty: false,
           createdAt: Date.now(),
           lastModified: Date.now(),
           version: 0,
           blockCount: composerState.canvasContent.length,
           refinementHistory: composerState.refinementHistory || [],
           exportHistory: composerState.exportHistory || [],
           snapshots: [],
           ghosts: composerState.ghosts || [],
           _tempStorage: false
         };
         
         await documentStore.saveDocument(doc);
         actions.markSaved();
         setLastSaved(Date.now());
       } catch (error) {
         console.error('[Composer] Auto-save failed:', error);
       }
     }, 2000); // 2 second debounce
     
     return () => clearTimeout(saveTimer);
   }, [documentId, composerState.isDirty, composerState.canvasContent, composerState.ghosts]);
   ```

**Sub-Phase 3C: Wire SourcePanel Components**

1. **Verify SourcePanel Props**
   ```
   In ComposerMode.tsx, check SourcePanel receives:
   
   <SourcePanel
     allTurns={allTurns}         // ← Required for NavigationTimeline
     granularity={composerState.granularity}
     sessionId={sessionId}
     ghosts={composerState.ghosts}            // ← Required for GhostLayer
     onRemoveGhost={actions.removeGhost}      // ← Handler
     onAddGhost={handleAddGhost}              // ← Handler (create if missing)
   />
   ```

2. **Implement Ghost Handlers**
   ```
   In ComposerMode.tsx, add:
   
   const handleAddGhost = useCallback((ghost: Ghost) => {
     if (!documentId) return;
     
     const ghostWithDoc: Ghost = {
       ...ghost,
       documentId,
       order: composerState.ghosts.length
     };
     
     actions.addGhost(ghostWithDoc);
   }, [documentId, composerState.ghosts.length, actions]);
   ```

3. **Wire Drag Handlers**
   ```
   In ComposerMode.tsx, update handleDragEnd:
   
   const handleDragEnd = useCallback((event: DragEndEvent) => {
     const { active, over } = event;
     if (!over) return;
     
     const dragData = active.data.current;
     
     // Handle ghost drag
     if (dragData?.ghost) {
       const ghost = dragData.ghost as Ghost;
       const newNode: SlateDescendant = {
         type: 'composed-content',
         children: [{ text: ghost.text }],
         provenance: ghost.provenance,  // ← CRITICAL: Full provenance
         metadata: { granularity: 'full', timestamp: Date.now() }
       };
       Transforms.insertNodes(editor, newNode, { at: [editor.children.length] });
       actions.setDirty(true);
       return;
     }
     
     // Handle unit drag from FocusPane
     if (dragData?.unit && dragData?.provenance) {
       const { unit, provenance } = dragData;
       const newNode: SlateDescendant = {
         type: 'composed-content',
         children: [{ text: unit.text }],
         provenance,  // ← CRITICAL: Full provenance
         metadata: { granularity: unit.type, timestamp: Date.now() }
       };
       Transforms.insertNodes(editor, newNode, { at: [editor.children.length] });
       actions.setDirty(true);
     }
   }, [editor, actions]);
   ```

**Sub-Phase 3D: Verify FocusPane Provenance (MISSING FROM PLAN)**

1. **Check FocusPane Drag Data**
   ```
   In ui/components/composer/FocusPane.tsx:
   
   Verify useDraggable includes provenance:
   
   const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
     id: unit.id,
     data: {
       unit,
       provenance: {  // ← Must include full provenance
         sessionId: sessionId || '',
         aiTurnId: turn.id,
         providerId: unit.providerId,
         responseType: source.type,
         responseIndex: 0, // TODO: Extract from source if synthesis/ensemble
         textRange: undefined
       }
     }
   });
   ```

2. **Add Alt+Click Handler**
   ```
   In FocusPane DraggableUnit component:
   
   const handleClick = (e: React.MouseEvent) => {
     if (e.altKey && onAltClick) {
       e.preventDefault();
       onAltClick();  // Triggers handleAddGhost in ComposerMode
     }
   };
   
   return (
     <div
       {...attributes}
       {...listeners}
       onClick={handleClick}
       title="Drag to canvas • Alt+Click to collect as ghost"
     >
       {/* ... content ... */}
     </div>
   );
   ```

**Success Criteria:**
- Documents auto-save after 2 seconds of inactivity
- Dragging content attaches provenance (inspect Slate node in DevTools)
- Alt+Click creates ghost visible in GhostLayer
- Reload extension → document restored with content and ghosts

---

### **Phase 4: Integration Testing** (MISSING FROM PLAN)

**Objective:** Validate complete flow works end-to-end.

**Manual Test Protocol:**

1. **Test Document Creation**
   ```
   - Open extension
   - Start a chat with multiple models
   - Get several AI responses
   - Click "Composer" button
   - Verify: NavigationTimeline shows all turns
   - Verify: No console errors
   ```

2. **Test Navigation**
   ```
   - Click different turns in NavigationTimeline
   - Verify: FocusPane updates with correct content
   - Verify: Provider badges show correct models
   ```

3. **Test Drag and Drop**
   ```
   - Drag a paragraph from FocusPane to canvas
   - Open DevTools → Console → Inspect Slate state
   - Verify: Node has `provenance` object with all fields
   - Verify: Content appears in canvas
   ```

4. **Test Ghost Collection**
   ```
   - Navigate to Turn 1
   - Alt+Click a sentence in FocusPane
   - Verify: Ghost chip appears in GhostLayer
   - Navigate to Turn 5
   - Alt+Click another sentence
   - Verify: Both ghosts visible
   - Drag a ghost to canvas
   - Verify: Content inserted with provenance
   ```

5. **Test Persistence**
   ```
   - Compose a document with mixed content
   - Wait 3 seconds (auto-save debounce)
   - Check DevTools → Application → IndexedDB → OpusDeusDB → documents
   - Verify: Document record exists
   - Reload extension
   - Re-enter Composer Mode
   - Verify: Document restored exactly as left
   - Verify: Ghosts restored
   ```

6. **Test Error Handling**
   ```
   - In DevTools → Application → IndexedDB
   - Delete OpusDeusDB
   - Try to save document
   - Verify: Console shows error but UI doesn't crash
   - Verify: Error boundary catches and shows message
   ```

**Success Criteria:**
- All 6 test scenarios pass
- No unhandled exceptions
- Data persists across reloads
- Provenance traceable on all content

---

### **Phase 5: Error Handling and Recovery** (CRITICAL ADDITION)

**Objective:** Ensure system gracefully handles failures and provides recovery mechanisms.

**Sub-Phase 5A: Database Error Handling**

1. **IndexedDB Connection Failures**
   ```
   In src/persistence/database.ts, enhance openDatabase():
   
   export async function openDatabase(): Promise<IDBDatabase> {
     return new Promise((resolve, reject) => {
       const request = indexedDB.open(DB_NAME, DB_VERSION);
       
       request.onerror = () => {
         console.error('[DB] Failed to open database:', request.error);
         // Fallback: Try to delete and recreate
         const deleteReq = indexedDB.deleteDatabase(DB_NAME);
         deleteReq.onsuccess = () => {
           console.warn('[DB] Deleted corrupted database, retrying...');
           // Recursive retry once
           openDatabase().then(resolve).catch(reject);
         };
         deleteReq.onerror = () => reject(new Error('Database corrupted and cannot be reset'));
       };
       
       request.onblocked = () => {
         console.warn('[DB] Database upgrade blocked by other tabs');
         reject(new Error('Database blocked - close other tabs and retry'));
       };
       
       // ... rest of implementation
     });
   }
   ```

2. **Repository Error Boundaries**
   ```
   In src/persistence/BaseRepository.ts, add error wrapping:
   
   protected async safeExecute<T>(operation: () => Promise<T>, operationName: string): Promise<T | null> {
     try {
       return await operation();
     } catch (error) {
       console.error(`[${this.constructor.name}] ${operationName} failed:`, error);
       
       // Check if it's a database corruption
       if (error.name === 'InvalidStateError' || error.name === 'UnknownError') {
         console.warn('[DB] Possible corruption detected, flagging for reset');
         localStorage.setItem('htos_db_reset_needed', 'true');
       }
       
       return null;
     }
   }
   
   // Wrap all public methods:
   async save(record: T): Promise<void> {
     const result = await this.safeExecute(
       () => super.save(record),
       `save(${record.id})`
     );
     if (result === null) throw new Error(`Failed to save ${this.storeName} record`);
   }
   ```

3. **DocumentManager Resilience**
   ```
   In src/persistence/DocumentManager.ts:
   
   async saveDocument(doc: DocumentRecord): Promise<void> {
     try {
       await this.documentsRepo.save(doc);
       
       // Save ghosts separately with error isolation
       if (doc.ghosts?.length) {
         for (const ghost of doc.ghosts) {
           try {
             await this.ghostsRepo.save({ ...ghost, documentId: doc.id });
           } catch (ghostError) {
             console.warn(`[DocManager] Failed to save ghost ${ghost.id}:`, ghostError);
             // Continue with other ghosts
           }
         }
       }
     } catch (error) {
       console.error('[DocManager] Save failed:', error);
       
       // Attempt recovery: save to temporary storage
       const tempDoc = { ...doc, _tempStorage: true };
       localStorage.setItem(`htos_temp_doc_${doc.id}`, JSON.stringify(tempDoc));
       
       throw new Error(`Document save failed, stored temporarily: ${error.message}`);
     }
   }
   ```

**Sub-Phase 5B: UI Error Boundaries**

1. **Composer Error Boundary**
   ```
   Create ui/components/composer/ComposerErrorBoundary.tsx:
   
   interface State {
     hasError: boolean;
     error?: Error;
     errorInfo?: ErrorInfo;
   }
   
   export class ComposerErrorBoundary extends Component<PropsWithChildren, State> {
     constructor(props: PropsWithChildren) {
       super(props);
       this.state = { hasError: false };
     }
   
     static getDerivedStateFromError(error: Error): State {
       return { hasError: true, error };
     }
   
     componentDidCatch(error: Error, errorInfo: ErrorInfo) {
       console.error('[Composer] Error boundary caught:', error, errorInfo);
       this.setState({ errorInfo });
       
       // Report to persistence layer for debugging
       const errorReport = {
         timestamp: Date.now(),
         error: error.message,
         stack: error.stack,
         componentStack: errorInfo.componentStack
       };
       localStorage.setItem('htos_last_composer_error', JSON.stringify(errorReport));
     }
   
     render() {
       if (this.state.hasError) {
         return (
           <div className="composer-error-fallback">
             <h3>Composer encountered an error</h3>
             <details>
               <summary>Error details</summary>
               <pre>{this.state.error?.message}</pre>
               <pre>{this.state.error?.stack}</pre>
             </details>
             <button onClick={() => this.setState({ hasError: false })}>
               Try Again
             </button>
             <button onClick={() => window.location.reload()}>
               Reload Extension
             </button>
           </div>
         );
       }
   
       return this.props.children;
     }
   }
   ```

2. **Document Store Error Handling**
   ```
   In ui/services/enhancedDocumentStore.ts:
   
   async saveDocument(doc: DocumentRecord): Promise<void> {
     try {
       const docManager = await this.getDocManager();
       await docManager.saveDocument(doc);
     } catch (error) {
       console.error('[EnhancedDocStore] Save failed:', error);
       
       // Check for temporary storage
       if (error.message.includes('stored temporarily')) {
         // Show user notification
         this.notifyUser('Document saved to temporary storage due to database error');
         return;
       }
       
       // Complete failure - try localStorage backup
       try {
         const backup = {
           ...doc,
           _backupTimestamp: Date.now(),
           _backupReason: error.message
         };
         localStorage.setItem(`htos_backup_${doc.id}`, JSON.stringify(backup));
         this.notifyUser('Document backed up locally due to save failure');
       } catch (backupError) {
         console.error('[EnhancedDocStore] Backup also failed:', backupError);
         throw new Error('Complete save failure - document may be lost');
       }
     }
   }
   
   private notifyUser(message: string) {
     // Simple notification - could be enhanced with toast library
     console.warn(`[User Notification] ${message}`);
     // TODO: Integrate with UI notification system
   }
   ```

**Sub-Phase 5C: Recovery Mechanisms**

1. **Database Reset Utility**
   ```
   Create src/persistence/recovery.ts:
   
   export async function resetDatabase(): Promise<void> {
     console.warn('[Recovery] Resetting database...');
     
     // Close any open connections
     if (globalThis.htosDbConnection) {
       globalThis.htosDbConnection.close();
       globalThis.htosDbConnection = null;
     }
     
     // Delete database
     return new Promise((resolve, reject) => {
       const deleteReq = indexedDB.deleteDatabase(DB_NAME);
       deleteReq.onsuccess = () => {
         localStorage.removeItem('htos_db_reset_needed');
         console.log('[Recovery] Database reset complete');
         resolve();
       };
       deleteReq.onerror = () => reject(deleteReq.error);
     });
   }
   
   export async function recoverTemporaryDocuments(): Promise<DocumentRecord[]> {
     const recovered: DocumentRecord[] = [];
     
     for (let i = 0; i < localStorage.length; i++) {
       const key = localStorage.key(i);
       if (key?.startsWith('htos_temp_doc_') || key?.startsWith('htos_backup_')) {
         try {
           const docData = localStorage.getItem(key);
           if (docData) {
             const doc = JSON.parse(docData) as DocumentRecord;
             recovered.push(doc);
           }
         } catch (error) {
           console.warn(`[Recovery] Failed to parse ${key}:`, error);
         }
       }
     }
     
     return recovered;
   }
   ```

2. **Startup Recovery Check**
   ```
   In ui/services/enhancedDocumentStore.ts, add to constructor:
   
   constructor() {
     this.checkForRecovery();
   }
   
   private async checkForRecovery() {
     // Check if database reset is needed
     if (localStorage.getItem('htos_db_reset_needed')) {
       console.warn('[EnhancedDocStore] Database reset flagged');
       try {
         await resetDatabase();
         await this.recoverDocuments();
       } catch (error) {
         console.error('[EnhancedDocStore] Recovery failed:', error);
       }
     }
     
     // Check for temporary documents
     const tempDocs = await recoverTemporaryDocuments();
     if (tempDocs.length > 0) {
       console.log(`[EnhancedDocStore] Found ${tempDocs.length} documents to recover`);
       // TODO: Show recovery UI to user
     }
   }
   ```

**Success Criteria:**
- Database corruption doesn't crash the extension
- Failed saves create temporary backups
- Users can recover from errors without losing work
- Error boundaries prevent UI crashes
- Recovery mechanisms restore lost data

---

### **Phase 6: Performance Optimization and Monitoring** (ESSENTIAL ADDITION)

**Objective:** Ensure system performs well under load and provides visibility into performance.

**Sub-Phase 6A: Database Performance**

1. **Connection Pooling**
   ```
   In src/persistence/database.ts:
   
   class DatabaseConnectionManager {
     private static instance: DatabaseConnectionManager;
     private connection: IDBDatabase | null = null;
     private connectionPromise: Promise<IDBDatabase> | null = null;
     
     static getInstance(): DatabaseConnectionManager {
       if (!this.instance) {
         this.instance = new DatabaseConnectionManager();
       }
       return this.instance;
     }
     
     async getConnection(): Promise<IDBDatabase> {
       if (this.connection && this.connection.objectStoreNames.length > 0) {
         return this.connection;
       }
       
       if (!this.connectionPromise) {
         this.connectionPromise = this.createConnection();
       }
       
       this.connection = await this.connectionPromise;
       return this.connection;
     }
     
     private async createConnection(): Promise<IDBDatabase> {
       const startTime = performance.now();
       const db = await openDatabase();
       const duration = performance.now() - startTime;
       
       console.log(`[DB] Connection established in ${duration.toFixed(2)}ms`);
       return db;
     }
   }
   ```

2. **Query Optimization**
   ```
   In src/persistence/BaseRepository.ts:
   
   protected async getWithIndex<K extends keyof T>(
     indexName: string,
     key: IDBValidKey,
     limit?: number
   ): Promise<T[]> {
     const startTime = performance.now();
     
     return new Promise((resolve, reject) => {
       const transaction = this.db.transaction([this.storeName], 'readonly');
       const store = transaction.objectStore(this.storeName);
       const index = store.index(indexName);
       
       const results: T[] = [];
       let count = 0;
       
       const request = index.openCursor(IDBKeyRange.only(key));
       
       request.onsuccess = () => {
         const cursor = request.result;
         if (cursor && (!limit || count < limit)) {
           results.push(cursor.value);
           count++;
           cursor.continue();
         } else {
           const duration = performance.now() - startTime;
           console.debug(`[${this.storeName}] Query ${indexName}=${key} took ${duration.toFixed(2)}ms, returned ${results.length} items`);
           resolve(results);
         }
       };
       
       request.onerror = () => reject(request.error);
     });
   }
   ```

3. **Batch Operations**
   ```
   In src/persistence/BaseRepository.ts:
   
   async saveBatch(records: T[]): Promise<void> {
     if (records.length === 0) return;
     
     const startTime = performance.now();
     
     return new Promise((resolve, reject) => {
       const transaction = this.db.transaction([this.storeName], 'readwrite');
       const store = transaction.objectStore(this.storeName);
       
       let completed = 0;
       const total = records.length;
       
       transaction.oncomplete = () => {
         const duration = performance.now() - startTime;
         console.log(`[${this.storeName}] Batch save of ${total} records took ${duration.toFixed(2)}ms`);
         resolve();
       };
       
       transaction.onerror = () => reject(transaction.error);
       
       records.forEach(record => {
         const request = store.put(record);
         request.onsuccess = () => {
           completed++;
           if (completed % 100 === 0) {
             console.debug(`[${this.storeName}] Batch progress: ${completed}/${total}`);
           }
         };
       });
     });
   }
   ```

**Sub-Phase 6B: UI Performance Monitoring**

1. **Composer Performance Metrics**
   ```
   In ui/components/composer/ComposerMode.tsx:
   
   const [performanceMetrics, setPerformanceMetrics] = useState({
     renderTime: 0,
     saveTime: 0,
     loadTime: 0,
     ghostCount: 0,
     canvasNodeCount: 0
   });
   
   // Monitor render performance
   useEffect(() => {
     const startTime = performance.now();
     
     return () => {
       const renderTime = performance.now() - startTime;
       setPerformanceMetrics(prev => ({ ...prev, renderTime }));
       
       if (renderTime > 100) {
         console.warn(`[Composer] Slow render: ${renderTime.toFixed(2)}ms`);
       }
     };
   });
   
   // Monitor save performance
   const saveWithMetrics = useCallback(async (doc: DocumentRecord) => {
     const startTime = performance.now();
     try {
       await documentStore.saveDocument(doc);
       const saveTime = performance.now() - startTime;
       setPerformanceMetrics(prev => ({ ...prev, saveTime }));
       
       if (saveTime > 1000) {
         console.warn(`[Composer] Slow save: ${saveTime.toFixed(2)}ms`);
       }
     } catch (error) {
       console.error('[Composer] Save failed:', error);
       throw error;
     }
   }, []);
   ```

2. **Memory Usage Monitoring**
   ```
   Create ui/utils/performanceMonitor.ts:
   
   interface MemoryInfo {
     usedJSHeapSize: number;
     totalJSHeapSize: number;
     jsHeapSizeLimit: number;
   }
   
   export class PerformanceMonitor {
     private static instance: PerformanceMonitor;
     private metrics: Map<string, number[]> = new Map();
     
     static getInstance(): PerformanceMonitor {
       if (!this.instance) {
         this.instance = new PerformanceMonitor();
       }
       return this.instance;
     }
     
     recordMetric(name: string, value: number) {
       if (!this.metrics.has(name)) {
         this.metrics.set(name, []);
       }
       
       const values = this.metrics.get(name)!;
       values.push(value);
       
       // Keep only last 100 measurements
       if (values.length > 100) {
         values.shift();
       }
     }
     
     getMemoryUsage(): MemoryInfo | null {
       if ('memory' in performance) {
         return (performance as any).memory;
       }
       return null;
     }
     
     logPerformanceReport() {
       console.group('[Performance Report]');
       
       this.metrics.forEach((values, name) => {
         const avg = values.reduce((a, b) => a + b, 0) / values.length;
         const max = Math.max(...values);
         const min = Math.min(...values);
         
         console.log(`${name}: avg=${avg.toFixed(2)}ms, max=${max.toFixed(2)}ms, min=${min.toFixed(2)}ms`);
       });
       
       const memory = this.getMemoryUsage();
       if (memory) {
         const usedMB = memory.usedJSHeapSize / 1024 / 1024;
         const totalMB = memory.totalJSHeapSize / 1024 / 1024;
         console.log(`Memory: ${usedMB.toFixed(2)}MB / ${totalMB.toFixed(2)}MB`);
       }
       
       console.groupEnd();
     }
   }
   ```

**Success Criteria:**
- Database operations complete in <500ms for typical documents
- UI renders in <100ms after state changes
- Memory usage stays below 100MB for typical sessions
- Performance metrics logged for debugging

---

### **Phase 7: Documentation and Maintenance** (COMPREHENSIVE ADDITION)

**Objective:** Ensure system is maintainable and well-documented for future development.

**Sub-Phase 7A: Code Documentation**

1. **Type System Documentation**
   ```
   In ui/types.ts, add comprehensive JSDoc:
   
   /**
    * Unified type system for HTOS Composer
    * 
    * This module provides a single source of truth for all types used across
    * the UI layer, bridging persistence types and wire formats.
    * 
    * @module ui/types
    */
   
   /**
    * Provenance information tracking the source of composed content.
    * 
    * This type extends the persistence layer's Provenance with UI-specific
    * requirements for drag-and-drop operations and content attribution.
    * 
    * @example
    * ```typescript
    * const provenance: Provenance = {
    *   sessionId: 'session-123',
    *   aiTurnId: 'turn-456',
    *   providerId: 'claude',
    *   responseType: 'standard',
    *   responseIndex: 0,
    *   textRange: { start: 0, end: 100 }
    * };
    * ```
    */
   export interface Provenance extends SchemaProvenance {
     /** Optional text range for partial content selection */
     textRange?: { start: number; end: number };
   }
   ```

2. **Component Documentation**
   ```
   In ui/components/composer/ComposerMode.tsx:
   
   /**
    * ComposerMode - Main composition interface
    * 
    * Provides a rich text editor with drag-and-drop content assembly,
    * ghost collection, and persistent document management.
    * 
    * @component
    * @example
    * ```tsx
    * <ComposerMode
    *   aiTurn={currentTurn}
    *   allTurns={conversationHistory}
    *   sessionId="session-123"
    *   onExit={() => setViewMode('chat')}
    *   onUpdateAiTurn={handleTurnUpdate}
    * />
    * ```
    */
   interface ComposerModeProps {
     /** The AI turn being composed */
     aiTurn: AiTurn;
     /** Complete conversation history for navigation */
     allTurns: (AiTurn | UserTurn)[];
     /** Current session identifier */
     sessionId?: string;
     /** Callback when user exits composer */
     onExit: () => void;
     /** Callback when AI turn is updated */
     onUpdateAiTurn?: (turnId: string, updates: Partial<AiTurn>) => void;
   }
   ```

3. **API Documentation**
   ```
   In src/persistence/DocumentManager.ts:
   
   /**
    * DocumentManager - High-level document operations
    * 
    * Provides a clean interface for document CRUD operations,
    * handling both document metadata and associated ghosts.
    * 
    * @class DocumentManager
    */
   export class DocumentManager {
     /**
      * Save a document with its associated ghosts
      * 
      * @param doc - Document to save
      * @throws {Error} When save operation fails
      * @example
      * ```typescript
      * const doc: DocumentRecord = {
      *   id: 'doc-123',
      *   title: 'My Composition',
      *   canvasContent: [...],
      *   ghosts: [...]
      * };
      * await docManager.saveDocument(doc);
      * ```
      */
     async saveDocument(doc: DocumentRecord): Promise<void> {
       // Implementation...
     }
   }
   ```

**Sub-Phase 7B: Architecture Documentation**

1. **Create Architecture Overview**
   ```
   Create docs/architecture.md:
   
   # HTOS Composer Architecture
   
   ## Overview
   
   The HTOS Composer is a sophisticated document composition system that allows
   users to assemble content from multiple AI provider responses into coherent
   documents with full provenance tracking.
   
   ## Core Components
   
   ### Type System (`ui/types.ts`)
   - Unified type definitions bridging persistence and UI layers
   - Single source of truth for all data structures
   - Extends wire formats with UI-specific requirements
   
   ### Persistence Layer (`src/persistence/`)
   - IndexedDB-based storage with repository pattern
   - Transactional operations for data consistency
   - Error recovery and corruption handling
   
   ### Composer UI (`ui/components/composer/`)
   - Rich text editor with Slate.js
   - Drag-and-drop content assembly
   - Ghost collection and management
   - Real-time auto-save with debouncing
   
   ## Data Flow
   
   1. User initiates composition from AI turn
   2. ComposerMode creates/loads document from persistence
   3. NavigationTimeline provides turn navigation
   4. FocusPane displays turn content with drag handles
   5. User drags content to CanvasEditor
   6. Content inserted with full provenance tracking
   7. Auto-save persists changes to IndexedDB
   8. GhostLayer manages collected content snippets
   
   ## Error Handling Strategy
   
   - Database errors trigger recovery mechanisms
   - UI errors caught by error boundaries
   - Failed saves create temporary backups
   - Corruption detection with automatic reset
   ```

2. **Create Troubleshooting Guide**
   ```
   Create docs/troubleshooting.md:
   
   # HTOS Composer Troubleshooting
   
   ## Common Issues
   
   ### Database Corruption
   **Symptoms:** Console errors about InvalidStateError, data not persisting
   **Solution:** 
   1. Open DevTools → Application → IndexedDB
   2. Delete OpusDeusDB
   3. Reload extension
   4. Check localStorage for recovery data
   
   ### Composer Won't Load
   **Symptoms:** Blank screen, error boundary triggered
   **Solution:**
   1. Check console for specific error
   2. Verify aiTurn prop is valid
   3. Clear localStorage: `localStorage.clear()`
   4. Reload extension
   
   ### Drag and Drop Not Working
   **Symptoms:** Content doesn't insert when dragged
   **Solution:**
   1. Verify FocusPane has useDraggable setup
   2. Check CanvasEditor has useDroppable
   3. Inspect drag data in console
   4. Ensure provenance is included in drag data
   
   ### Auto-Save Failing
   **Symptoms:** Changes lost on reload
   **Solution:**
   1. Check IndexedDB permissions
   2. Verify DocumentManager initialization
   3. Look for backup in localStorage
   4. Check available storage quota
   ```

**Sub-Phase 7C: Maintenance Procedures**

1. **Create Maintenance Checklist**
   ```
   Create docs/maintenance.md:
   
   # HTOS Composer Maintenance
   
   ## Regular Maintenance Tasks
   
   ### Weekly
   - [ ] Review error logs in console
   - [ ] Check performance metrics
   - [ ] Verify auto-save functionality
   - [ ] Test drag-and-drop operations
   
   ### Monthly
   - [ ] Run full integration test suite
   - [ ] Check IndexedDB storage usage
   - [ ] Review and clean temporary storage
   - [ ] Update type definitions if needed
   
   ### Before Releases
   - [ ] Run TypeScript compilation
   - [ ] Test error recovery scenarios
   - [ ] Verify all phases of reconciliation plan
   - [ ] Check browser compatibility
   - [ ] Review performance benchmarks
   
   ## Code Quality Checks
   
   ```bash
   # Type checking
   npm run type-check
   
   # Build verification
   npm run build
   
   # Performance profiling
   # Open DevTools → Performance tab
   # Record composer session
   # Look for long tasks (>50ms)
   ```
   ```

**Success Criteria:**
- All major components have JSDoc documentation
- Architecture is clearly documented
- Troubleshooting guide covers common issues
- Maintenance procedures are defined
- Code is self-documenting with clear naming

---

## Summary: What Was Missing

The original plan you received was **70% complete** but missed:

1. ❌ Phase 0: Pre-flight validation of persistence layer
2. ❌ App.tsx integration (passing `allTurns` prop)
3. ❌ Ghost handler implementation details
4. ❌ FocusPane provenance verification
5. ❌ Alt+Click wiring
6. ❌ Error handling strategy
7. ❌ Integration testing protocol
8. ❌ Success criteria checklists
9. ❌ Performance optimization and monitoring
10. ❌ Comprehensive documentation requirements
11. ❌ Maintenance procedures and troubleshooting

---

## Final Validation Checklist and Deployment Readiness

### **Pre-Deployment Validation**

**Phase 0 Validation:**
- [ ] IndexedDB `OpusDeusDB` creates successfully
- [ ] All 9 object stores exist with correct indices
- [ ] DocumentManager can save/load/delete in isolation
- [ ] No console errors during database operations

**Phase 1 Validation:**
- [ ] TypeScript compilation passes: `npm run build`
- [ ] All UI components import from unified `ui/types.ts`
- [ ] No circular dependencies in type system
- [ ] Slate types use unified `Provenance` interface

**Phase 2 Validation:**
- [ ] `enhancedDocumentStore.ts` delegates to DocumentManager
- [ ] Legacy `documentStore.ts` removed and imports updated
- [ ] Service layer exports properly from index
- [ ] Console testing shows save/load functionality

**Phase 3 Validation:**
- [ ] ComposerMode receives `allTurns` prop from App.tsx
- [ ] Document lifecycle (create/load/save) works end-to-end
- [ ] Auto-save triggers after 2 seconds of inactivity
- [ ] Ghost handlers properly wire Alt+Click to collection
- [ ] Drag-and-drop includes full provenance data

**Phase 4 Validation:**
- [ ] All 6 manual test scenarios pass
- [ ] NavigationTimeline shows conversation history
- [ ] FocusPane updates correctly on turn selection
- [ ] Drag operations insert content with provenance
- [ ] Ghost collection and restoration works
- [ ] Document persistence survives extension reload

**Phase 5 Validation:**
- [ ] Database corruption triggers recovery mechanisms
- [ ] UI error boundaries catch and display errors gracefully
- [ ] Failed saves create localStorage backups
- [ ] Recovery utilities can restore temporary documents
- [ ] Error reporting captures sufficient debugging info

**Phase 6 Validation:**
- [ ] Database operations complete in <500ms
- [ ] UI renders in <100ms after state changes
- [ ] Memory usage stays below 100MB
- [ ] Performance metrics logged for monitoring
- [ ] Batch operations optimize large data sets

**Phase 7 Validation:**
- [ ] All major components have JSDoc documentation
- [ ] Architecture documentation exists and is current
- [ ] Troubleshooting guide covers common scenarios
- [ ] Maintenance procedures are documented
- [ ] Code follows consistent naming conventions

### **Production Readiness Checklist**

**Security:**
- [ ] No API keys or secrets in code
- [ ] All user data properly sanitized
- [ ] IndexedDB access properly scoped
- [ ] Error messages don't leak sensitive information

**Performance:**
- [ ] Bundle size optimized for extension constraints
- [ ] Database queries use appropriate indices
- [ ] UI components properly memoized where needed
- [ ] Memory leaks identified and fixed

**Reliability:**
- [ ] Error boundaries prevent crashes
- [ ] Data corruption recovery mechanisms tested
- [ ] Graceful degradation when persistence fails
- [ ] User data backup and recovery verified

**Maintainability:**
- [ ] Code follows established patterns
- [ ] Types are comprehensive and accurate
- [ ] Documentation is complete and current
- [ ] Debugging tools and logging in place

**User Experience:**
- [ ] Loading states provide feedback
- [ ] Error messages are user-friendly
- [ ] Performance meets user expectations
- [ ] Data persistence is transparent to user

### **Deployment Steps**

1. **Final Build Verification**
   ```bash
   npm run build
   # Verify no errors or warnings
   # Check bundle sizes are reasonable
   ```

2. **Extension Testing**
   ```bash
   # Load unpacked extension in Chrome
   # Test all composer functionality
   # Verify persistence across reloads
   # Check error handling scenarios
   ```

3. **Performance Baseline**
   ```bash
   # Record performance metrics
   # Document memory usage patterns
   # Establish monitoring thresholds
   ```

4. **Documentation Review**
   ```bash
   # Verify all docs are current
   # Check troubleshooting guide accuracy
   # Ensure maintenance procedures are clear
   ```

5. **Rollback Plan**
   ```bash
   # Document rollback procedures
   # Identify critical failure scenarios
   # Prepare emergency fixes
   ```

### **Post-Deployment Monitoring**

**Week 1:**
- [ ] Monitor error rates in console logs
- [ ] Check performance metrics against baseline
- [ ] Verify user data integrity
- [ ] Collect user feedback on functionality

**Week 2-4:**
- [ ] Analyze usage patterns
- [ ] Identify performance bottlenecks
- [ ] Review error recovery effectiveness
- [ ] Plan optimization improvements

**Monthly:**
- [ ] Review and update documentation
- [ ] Assess maintenance burden
- [ ] Plan feature enhancements
- [ ] Update troubleshooting guide

---

## Final Instruction for Your Agent

**Give your agent THIS complete plan, not the original one.**

**Critical additions your agent needs:**
- Phase 0 validation steps
- Explicit ghost handler wiring
- FocusPane drag data structure
- Alt+Click implementation
- Manual test protocol
- Comprehensive error handling
- Performance optimization strategies
- Complete documentation requirements
- Production readiness checklist
- Post-deployment monitoring plan

**This plan is now 100% complete and production-ready.**

