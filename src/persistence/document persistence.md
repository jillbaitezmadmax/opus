
## 🔍 The Document Persistence Problem

You saw this error:
```javascript
[EnhancedDocumentStore] Persistence not available; document not saved: doc_1760597737276_v7e5fdqb3
```

This means when you try to save a document (canvas/composition), it's failing because:

1. **EnhancedDocumentStore can't find the persistence layer**
2. **The document message handlers exist but aren't connected properly**
3. **Documents aren't being written to the `documents` table in IndexedDB**

---

## 🛠️ What Needs to Be Fixed for Documents

### Issue 1: EnhancedDocumentStore Connection

**File**: `ui/services/enhancedDocumentStore.ts`

**Current code** (around line 20):
```typescript
async function getPersistenceLayer() {
  if (!USE_PERSISTENCE_LAYER) return null;

  if (extensionBridge.isAvailable()) {
    const isAvailable = await extensionBridge.isDocumentPersistenceAvailable();
    return isAvailable ? extensionBridge : null;
  }

  return null;
}
```

**Problem**: `USE_PERSISTENCE_LAYER` is a const set at compile time. Even if we fixed it earlier, the document store has its own copy.

**Fix Needed**:
```typescript
async function getPersistenceLayer() {
  // Remove compile-time flag check, always check runtime
  if (extensionBridge.isAvailable()) {
    try {
      // Check if persistence is actually enabled
      const status = await extensionBridge.getPersistenceStatus();
      if (status && status.documentPersistenceEnabled) {
        return extensionBridge;
      }
    } catch (error) {
      console.error('[EnhancedDocumentStore] Failed to check persistence:', error);
    }
  }
  
  console.warn('[EnhancedDocumentStore] Persistence layer not available');
  return null;
}
```

---

### Issue 2: Document Message Handlers Connection

The message handlers for documents exist in `sw-entry.js`:
- `SAVE_DOCUMENT` ✅ Handler exists
- `LOAD_DOCUMENT` ✅ Handler exists
- `LIST_DOCUMENTS` ✅ Handler exists
- `DELETE_DOCUMENT` ✅ Handler exists

**But they check**:
```javascript
if (HTOS_ENABLE_DOCUMENT_PERSISTENCE && self.__HTOS_PERSISTENCE_LAYER) {
  // save document...
}
```

**Potential issues**:
1. Is `HTOS_ENABLE_DOCUMENT_PERSISTENCE` actually `true`?
2. Is `self.__HTOS_PERSISTENCE_LAYER` actually set?
3. Does the persistence layer have a working `documentManager`?

---

### Issue 3: DocumentManager Initialization

**Check if DocumentManager exists**:

The persistence layer should have a `documentManager` that was initialized in `src/persistence/index.ts`:

```typescript
export async function initializePersistenceLayer(config) {
  // ... creates adapter ...
  
  // Creates repositories
  const repositories = {
    sessions: new SessionsRepository(adapter),
    documents: new DocumentsRepository(adapter),  // ← This should exist
    // ... other repos
  };
  
  // Should create documentManager
  const documentManager = new DocumentManager(adapter, repositories);  // ← Check this
  
  return {
    adapter,
    repositories,
    documentManager  // ← This should be exported
  };
}
```

**Verify** this is actually happening and `documentManager` is attached to `persistenceLayer`.

---

## 🔧 Step-by-Step Fix for Documents

### Step 1: Verify Persistence Layer Has DocumentManager

**Run in browser console** (extension page):
```javascript
console.log('Persistence layer:', self.__HTOS_PERSISTENCE_LAYER);
console.log('Has documentManager?', !!self.__HTOS_PERSISTENCE_LAYER?.documentManager);
console.log('DocumentManager methods:', 
  Object.keys(self.__HTOS_PERSISTENCE_LAYER?.documentManager || {})
);
```

**Expected output**:
```javascript
Has documentManager? true
DocumentManager methods: ['saveDocument', 'loadDocument', 'deleteDocument', 'createGhost', ...]
```

**If `false`**: DocumentManager wasn't initialized in persistence layer. Need to fix `src/persistence/index.ts`.

---

### Step 2: Verify Feature Flag is Set

**Run in browser console**:
```javascript
console.log('Document persistence enabled?', HTOS_ENABLE_DOCUMENT_PERSISTENCE);
```

**Should show**: `true`

**If `false`**: Check `sw-entry.js` at the top:
```javascript
globalThis.HTOS_USE_PERSISTENCE_ADAPTER = true;
globalThis.HTOS_ENABLE_DOCUMENT_PERSISTENCE = true;  // ← Should be here
```

---

### Step 3: Fix EnhancedDocumentStore Connection

**File**: `ui/services/enhancedDocumentStore.ts`

**Find** the `saveDocument` method (around line 60):
```typescript
async saveDocument(doc: DocumentRecord): Promise<void> {
  const persistence = await getPersistenceLayer();
  
  if (persistence && USE_PERSISTENCE_LAYER) {  // ← Remove USE_PERSISTENCE_LAYER check
    return this.saveDocumentWithPersistence(doc, persistence);
  } else {
    console.warn('[EnhancedDocumentStore] Persistence not available; document not saved:', doc.id);
    return;
  }
}
```

**Replace with**:
```typescript
async saveDocument(doc: DocumentRecord): Promise<void> {
  const persistence = await getPersistenceLayer();
  
  if (persistence) {
    return this.saveDocumentWithPersistence(doc, persistence);
  } else {
    console.error('[EnhancedDocumentStore] Persistence not available; document not saved:', doc.id);
    throw new Error('Document persistence not available. Check extension initialization.');
  }
}
```

**Do the same for**:
- `loadDocument()`
- `deleteDocument()`
- `listDocuments()`
- `createGhost()`

Remove all `USE_PERSISTENCE_LAYER` checks - only check if `persistence` is truthy.

---

### Step 4: Verify extensionBridge Methods Work

**Test from UI console**:
```javascript
// Should return status with documentPersistenceEnabled: true
const status = await window.extensionBridge.getPersistenceStatus();
console.log('Persistence status:', status);

// Should return array of documents
const docs = await window.extensionBridge.listDocuments();
console.log('Documents:', docs);

// Try saving a test document
await window.extensionBridge.saveDocument('test-doc-123', {
  id: 'test-doc-123',
  title: 'Test Document',
  content: [{ type: 'paragraph', children: [{ text: 'Hello' }] }],
  createdAt: Date.now(),
  updatedAt: Date.now()
});
console.log('Document saved!');
```

---

### Step 5: Add Diagnostic Logging

**In `sw-entry.js`**, enhance the document handlers with logging:

```javascript
case 'SAVE_DOCUMENT': {
  console.log('[SW] SAVE_DOCUMENT request received:', {
    documentId: message.documentId,
    hasDocument: !!message.document,
    hasContent: !!message.content,
    persistenceEnabled: HTOS_ENABLE_DOCUMENT_PERSISTENCE,
    persistenceLayerExists: !!self.__HTOS_PERSISTENCE_LAYER,
    hasDocumentManager: !!self.__HTOS_PERSISTENCE_LAYER?.documentManager
  });
  
  if (HTOS_ENABLE_DOCUMENT_PERSISTENCE && self.__HTOS_PERSISTENCE_LAYER) {
    try {
      await self.__HTOS_PERSISTENCE_LAYER.documentManager.saveDocument(
        message.documentId,
        message.document,
        message.content
      );
      console.log('[SW] ✅ Document saved successfully:', message.documentId);
      sendResponse({ success: true });
    } catch (error) {
      console.error('[SW] ❌ Document save failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  } else {
    const reason = !HTOS_ENABLE_DOCUMENT_PERSISTENCE 
      ? 'HTOS_ENABLE_DOCUMENT_PERSISTENCE is false'
      : 'Persistence layer not initialized';
    console.error('[SW] Document persistence not available:', reason);
    sendResponse({ success: false, error: 'Document persistence not enabled' });
  }
  break;
}
```

---

## 📋 Verification Checklist for Documents

After applying fixes, check:

### 1. Persistence Layer Check
```javascript
// In extension console:
console.log('✓ Feature flag:', HTOS_ENABLE_DOCUMENT_PERSISTENCE);
console.log('✓ Persistence layer:', !!self.__HTOS_PERSISTENCE_LAYER);
console.log('✓ Document manager:', !!self.__HTOS_PERSISTENCE_LAYER?.documentManager);
console.log('✓ Adapter ready:', self.__HTOS_PERSISTENCE_LAYER?.adapter?.isReady());
```

All should be `true`.

### 2. UI Bridge Check
```javascript
// In UI console:
const status = await extensionBridge.getPersistenceStatus();
console.log('✓ Document persistence enabled:', status.documentPersistenceEnabled);
```

Should be `true`.

### 3. Test Document Save
```javascript
// In UI console:
await extensionBridge.saveDocument('test-123', {
  id: 'test-123',
  title: 'Test',
  canvasContent: [{ type: 'paragraph', children: [{ text: 'Test' }] }],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  lastModified: Date.now()
});
```

Should NOT show "Persistence not available" error.

### 4. Check IndexedDB
DevTools → Application → IndexedDB → `HybridThinkingDB` → `documents` table

Should see:
```javascript
{
  id: "test-123",
  title: "Test",
  canvasContent: [...],
  createdAt: 1760598000000,
  updatedAt: 1760598000000,
  lastModified: 1760598000000
}
```

---

## 🎯 Summary

**What the agent fixed**: ✅ Session/chat persistence
**What the agent ignored**: ❌ Document persistence

**Why documents still fail**:
1. EnhancedDocumentStore still checking compile-time flag `USE_PERSISTENCE_LAYER`
2. May not be checking runtime persistence status correctly
3. DocumentManager may not be initialized in persistence layer
4. Feature flag `HTOS_ENABLE_DOCUMENT_PERSISTENCE` may not be set

**What you need to do**:
1. Run diagnostic checks above to see what's missing
2. Apply fixes to `enhancedDocumentStore.ts` (remove compile-time checks)
3. Verify `documentManager` exists in persistence layer
4. Add diagnostic logging to document handlers
5. Test document save/load/list operations

**The good news**: The infrastructure is all there (message handlers, DocumentManager, etc.). It's just a connection/configuration issue, not missing functionality.

Want me to help you run the diagnostics to see exactly what's broken in the document persistence?