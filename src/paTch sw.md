# Critical Issue: Message Handler Not Responding

## 🔴 The Problem

The `GET_HEALTH_STATUS` message handler exists in the code but isn't responding. The error "The message port closed before a response was received" means the handler either:
1. Isn't registered at all
2. Doesn't call `sendResponse()`
3. Doesn't return `true` to keep the channel open

## 🔍 Root Cause Analysis

Looking at your error sequence:
```javascript
chrome.runtime.sendMessage({type: 'GET_HEALTH_STATUS'}, console.log);
// → "The message port closed before a response was received"
```

This means the message listener in `sw-entry.js` either:
- Isn't attached yet (timing issue)
- The handler doesn't have a case for `GET_HEALTH_STATUS`
- The handler has the case but doesn't `return true`

## 🛠️ The Fix

### Issue 1: Message Listener Registration Timing

The message listener needs to be registered **inside** the initialization, but **before** services are fully ready. Currently it might be registered too late.

**Find this in sw-entry.js** (around line 12400):

```javascript
// ============================================================================
// UNIFIED MESSAGE HANDLER
// ============================================================================
async function handleUnifiedMessage(message, sender, sendResponse) {
  try {
    const sm = await initializeSessionManager();
    // ... rest of handler
  }
}

// Message listener registration - WHERE IS THIS?
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.$bus) return false;
  if (request?.type) {
    const result = handleUnifiedMessage(request, sender, sendResponse);
    return result;
  }
  return false;
});
```

**Problem**: The listener is registered at module load, but `handleUnifiedMessage` tries to await `initializeSessionManager()`, which might not be ready yet for health checks.

---

### Fix: Make Health Status Available Immediately

**Replace the message listener section with:**

```javascript
// ============================================================================
// UNIFIED MESSAGE HANDLER
// ============================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Ignore bus messages
  if (request?.$bus) return false;
  
  if (!request?.type) return false;
  
  // Handle GET_HEALTH_STATUS immediately without waiting for init
  if (request.type === 'GET_HEALTH_STATUS') {
    (async () => {
      try {
        const health = await getHealthStatus();
        sendResponse({ success: true, data: health });
      } catch (error) {
        sendResponse({ 
          success: false, 
          error: error.message,
          initState: self.__HTOS_INIT_STATE 
        });
      }
    })();
    return true; // Keep channel open for async response
  }
  
  // All other messages go through unified handler
  (async () => {
    try {
      await handleUnifiedMessage(request, sender, sendResponse);
    } catch (error) {
      console.error('[SW] Message handler error:', error);
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    }
  })();
  return true; // Keep channel open for async response
});

async function handleUnifiedMessage(message, sender, sendResponse) {
  try {
    // Wait for initialization before handling most messages
    if (!globalServicesReady) {
      sendResponse({ 
        success: false, 
        error: 'Service worker still initializing',
        initState: self.__HTOS_INIT_STATE
      });
      return;
    }
    
    const sm = sessionManager; // Don't await, use already initialized
    
    switch (message.type) {
      // Your existing cases...
      
      case 'GET_FULL_HISTORY': {
        // existing code
      }
      
      // Remove GET_HEALTH_STATUS from here since it's handled above
      
      default:
        sendResponse({ success: false, error: 'Unknown message type: ' + message.type });
    }
  } catch (error) {
    console.error('[SW] Message handler error:', error);
    sendResponse({ success: false, error: error.message });
  }
}
```

---

### Issue 2: Missing `getHealthStatus()` Function

The health check function might not be accessible when called. Let's ensure it's defined properly:

**Add/update this function in sw-entry.js** (around line 12100):

```javascript
// ============================================================================
// HEALTH CHECK & DEBUGGING
// ============================================================================
async function getHealthStatus() {
  return {
    timestamp: Date.now(),
    serviceWorker: 'active',
    initState: self.__HTOS_INIT_STATE || { status: 'initializing' },
    sessionManager: sessionManager ? {
      initialized: sessionManager.isInitialized,
      usePersistence: sessionManager.usePersistenceAdapter,
      sessionCount: Object.keys(sessionManager.sessions).length
    } : null,
    persistenceLayer: self.__HTOS_PERSISTENCE_LAYER ? {
      available: true,
      adapterReady: self.__HTOS_PERSISTENCE_LAYER.adapter?.isReady?.() || false,
      hasRepositories: !!self.__HTOS_PERSISTENCE_LAYER.repositories
    } : null,
    featureFlags: {
      persistenceAdapter: HTOS_USE_PERSISTENCE_ADAPTER,
      documentPersistence: HTOS_ENABLE_DOCUMENT_PERSISTENCE
    },
    providers: providerRegistry?.listProviders() || []
  };
}
```

---

### Issue 3: Document Store "Persistence not available"

The error `[EnhancedDocumentStore] Persistence not available` means the document store can't find the persistence layer.

**In ui/services/enhancedDocumentStore.ts**, find the `getPersistenceLayer()` function:

```typescript
async function getPersistenceLayer() {
  if (!USE_PERSISTENCE_LAYER) return null;

  // Check if extension bridge is available and document persistence is enabled
  if (extensionBridge.isAvailable()) {
    const isAvailable = await extensionBridge.isDocumentPersistenceAvailable();
    return isAvailable ? extensionBridge : null;
  }

  return null;
}
```

**Problem**: This checks `USE_PERSISTENCE_LAYER` which is a const set at module load.

**Replace with:**

```typescript
async function getPersistenceLayer() {
  // Always check via extension bridge (don't rely on compile-time flag)
  if (extensionBridge.isAvailable()) {
    try {
      const status = await extensionBridge.getPersistenceStatus();
      if (status && status.documentPersistenceEnabled) {
        return extensionBridge;
      }
    } catch (error) {
      console.error('[EnhancedDocumentStore] Failed to check persistence status:', error);
    }
  }
  return null;
}
```

---

## 📝 Complete Patch

Here's the complete fix for sw-entry.js:

```javascript
// ============================================================================
// MESSAGE LISTENER REGISTRATION (Move this AFTER getHealthStatus definition)
// ============================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.$bus) return false;
  if (!request?.type) return false;
  
  // Special handling for health status - respond immediately
  if (request.type === 'GET_HEALTH_STATUS') {
    getHealthStatus()
      .then(health => {
        sendResponse({ success: true, data: health });
      })
      .catch(error => {
        sendResponse({ 
          success: false, 
          error: error.message,
          initState: self.__HTOS_INIT_STATE 
        });
      });
    return true;
  }
  
  // All other messages
  handleUnifiedMessage(request, sender, sendResponse)
    .catch(error => {
      console.error('[SW] Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    });
  return true;
});

// ============================================================================
// UNIFIED MESSAGE HANDLER (async)
// ============================================================================
async function handleUnifiedMessage(message, sender, sendResponse) {
  // Check if services are ready
  if (!sessionManager) {
    sendResponse({ 
      success: false, 
      error: 'Service worker still initializing. Please wait and try again.',
      initState: self.__HTOS_INIT_STATE
    });
    return;
  }
  
  try {
    switch (message.type) {
      // ========================================================================
      // HISTORY OPERATIONS
      // ========================================================================
      case 'GET_FULL_HISTORY': {
        const sessions = Object.values(sessionManager.sessions || {})
          .map(s => ({
            id: s.sessionId,
            sessionId: s.sessionId,
            title: s.title || s.turns?.[0]?.text?.slice(0, 50) || 'New Chat',
            startTime: s.createdAt,
            lastActivity: s.lastActivity,
            messageCount: (s.turns?.length || 0),
            firstMessage: s.turns?.[0]?.text || ''
          }))
          .sort((a, b) => b.lastActivity - a.lastActivity);
        sendResponse({ success: true, data: { sessions } });
        break;
      }
      
      case 'GET_HISTORY_SESSION': {
        const session = sessionManager.sessions[message.sessionId];
        if (session) {
          const transformed = {
            id: session.sessionId,
            sessionId: session.sessionId,
            title: session.title,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            turns: session.turns || [],
            providerContexts: session.providers || {}
          };
          sendResponse({ success: true, data: transformed });
        } else {
          sendResponse({ success: false, error: 'Session not found' });
        }
        break;
      }
      
      case 'GET_SYSTEM_STATUS': {
        sendResponse({ 
          success: true, 
          data: { 
            availableProviders: providerRegistry?.listProviders() || [],
            persistenceEnabled: HTOS_USE_PERSISTENCE_ADAPTER,
            documentsEnabled: HTOS_ENABLE_DOCUMENT_PERSISTENCE,
            sessionManagerType: sessionManager?.constructor.name,
            persistenceLayerAvailable: !!self.__HTOS_PERSISTENCE_LAYER
          }
        });
        break;
      }
      
      // ========================================================================
      // PERSISTENCE OPERATIONS
      // ========================================================================
      case 'GET_SESSION': {
        try {
          const session = await sessionManager.getOrCreateSession(message.sessionId);
          sendResponse({ success: true, session });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;
      }
        
      case 'SAVE_TURN': {
        try {
          await sessionManager.addTurn(message.sessionId, message.turn);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;
      }
        
      case 'UPDATE_PROVIDER_CONTEXT': {
        try {
          await sessionManager.updateProviderContext(
            message.sessionId,
            message.providerId,
            message.context
          );
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;
      }
        
      case 'DELETE_SESSION': {
        try {
          await sessionManager.deleteSession(message.sessionId);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;
      }
        
      case 'GET_PERSISTENCE_STATUS': {
        const status = {
          persistenceEnabled: HTOS_USE_PERSISTENCE_ADAPTER,
          documentPersistenceEnabled: HTOS_ENABLE_DOCUMENT_PERSISTENCE,
          sessionManagerType: sessionManager?.constructor.name,
          persistenceLayerAvailable: !!self.__HTOS_PERSISTENCE_LAYER,
          adapterStatus: sessionManager.getPersistenceStatus ? 
            sessionManager.getPersistenceStatus() : null
        };
        sendResponse({ success: true, status });
        break;
      }
        
      // ========================================================================
      // DOCUMENT OPERATIONS
      // ========================================================================
      case 'SAVE_DOCUMENT': {
        if (HTOS_ENABLE_DOCUMENT_PERSISTENCE && self.__HTOS_PERSISTENCE_LAYER) {
          try {
            await self.__HTOS_PERSISTENCE_LAYER.documentManager.saveDocument(
              message.documentId,
              message.document,
              message.content
            );
            sendResponse({ success: true });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
        } else {
          sendResponse({ success: false, error: 'Document persistence not enabled' });
        }
        break;
      }
        
      case 'LOAD_DOCUMENT': {
        if (HTOS_ENABLE_DOCUMENT_PERSISTENCE && self.__HTOS_PERSISTENCE_LAYER) {
          try {
            const document = await self.__HTOS_PERSISTENCE_LAYER.documentManager.loadDocument(
              message.documentId,
              message.reconstructContent
            );
            sendResponse({ success: true, document });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
        } else {
          sendResponse({ success: false, error: 'Document persistence not enabled' });
        }
        break;
      }
        
      case 'LIST_DOCUMENTS': {
        if (HTOS_ENABLE_DOCUMENT_PERSISTENCE && self.__HTOS_PERSISTENCE_LAYER) {
          try {
            const docs = await self.__HTOS_PERSISTENCE_LAYER.adapter.listDocuments();
            const summaries = (docs || []).map(doc => ({
              id: doc.id,
              title: doc.title,
              lastModified: doc.lastModified || doc.updatedAt || doc.createdAt
            }));
            sendResponse({ success: true, data: summaries });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
        } else {
          sendResponse({ success: false, error: 'Document persistence not enabled' });
        }
        break;
      }
        
      case 'DELETE_DOCUMENT': {
        if (HTOS_ENABLE_DOCUMENT_PERSISTENCE && self.__HTOS_PERSISTENCE_LAYER) {
          try {
            await self.__HTOS_PERSISTENCE_LAYER.documentManager.deleteDocument(
              message.documentId
            );
            sendResponse({ success: true });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
        } else {
          sendResponse({ success: false, error: 'Document persistence not enabled' });
        }
        break;
      }
        
      default:
        sendResponse({ success: false, error: 'Unknown message type: ' + message.type });
    }
  } catch (error) {
    console.error('[SW] Message handler error:', error);
    sendResponse({ success: false, error: error.message });
  }
}
```

---

## 🧪 Test After Fix

```javascript
// Should work now:
chrome.runtime.sendMessage({type: 'GET_HEALTH_STATUS'}, console.log);
// Expected: { success: true, data: { timestamp, serviceWorker: 'active', ... } }

// Test document persistence check:
chrome.runtime.sendMessage({type: 'GET_PERSISTENCE_STATUS'}, console.log);
// Expected: { success: true, status: { documentPersistenceEnabled: true, ... } }
```

The key changes:
1. Health status responds immediately without waiting for init
2. Message listener always returns `true` to keep channel open
3. All async handlers properly await and call `sendResponse()`
4. EnhancedDocumentStore checks runtime status instead of compile-time flag