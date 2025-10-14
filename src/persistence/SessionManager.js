// Enhanced SessionManager with Persistence Adapter Integration
// Supports both legacy chrome.storage and new persistence layer via feature flag

import { createPersistenceAdapter } from './adapters/index.js';
import { createRepositories } from './repositories/index.js';

// Feature flag for persistence layer (can be controlled via environment or runtime)
const USE_PERSISTENCE_ADAPTER = globalThis.HTOS_USE_PERSISTENCE_ADAPTER ?? false;

// Global session cache (maintains backward compatibility)
const __HTOS_SESSIONS = (self.__HTOS_SESSIONS = self.__HTOS_SESSIONS || {});

export class SessionManager {
  constructor() {
    this.sessions = __HTOS_SESSIONS;
    this.storageKey = 'htos_sessions';
    this.isExtensionContext = typeof chrome !== 'undefined' && !!chrome.storage?.local;
    this.usePersistenceAdapter = USE_PERSISTENCE_ADAPTER;
    
    // Persistence layer components
    this.persistenceAdapter = null;
    this.repositories = null;
    this.isInitialized = false;
    
    // Initialize based on feature flag
    if (this.usePersistenceAdapter) {
      this.initializePersistenceLayer().catch(console.error);
    } else if (this.isExtensionContext) {
      this.loadSessions().catch(console.error);
    }
  }

  /**
   * Initialize the session manager
   */
  async initialize() {
    if (this.usePersistenceAdapter) {
      await this.initializePersistenceLayer();
    } else if (this.isExtensionContext) {
      await this.loadSessions();
    }
    console.log('[SessionManager] Initialization complete');
  }

  /**
   * Initialize the new persistence layer
   */
  async initializePersistenceLayer() {
    try {
      console.log('[SessionManager] Initializing persistence adapter...');
      
      // Create and initialize persistence adapter
      this.persistenceAdapter = createPersistenceAdapter('indexeddb', {
        dbName: 'HTOS_DB',
        version: 1
      });
      
      await this.persistenceAdapter.initialize();
      
      // Create repository collection
      this.repositories = this.persistenceAdapter.repositories;
      
      // Migrate existing sessions if needed
      await this.migrateExistingSessions();
      
      this.isInitialized = true;
      console.log('[SessionManager] Persistence layer initialized successfully');
    } catch (error) {
      console.error('[SessionManager] Failed to initialize persistence layer:', error);
      // Fallback to legacy storage
      this.usePersistenceAdapter = false;
      if (this.isExtensionContext) {
        await this.loadSessions();
      }
    }
  }

  /**
   * Migrate existing chrome.storage sessions to new persistence layer
   */
  async migrateExistingSessions() {
    if (!this.isExtensionContext || !this.repositories) return;
    
    try {
      const data = await chrome.storage.local.get(null);
      const sessionKeys = Object.keys(data).filter(key => key.startsWith(`${this.storageKey}_`));
      
      for (const key of sessionKeys) {
        const sessionId = key.replace(`${this.storageKey}_`, '');
        const legacySession = data[key];
        
        if (legacySession) {
          // Convert legacy session to new format
          await this.migrateLegacySession(sessionId, legacySession);
        }
      }
      
      console.log(`[SessionManager] Migrated ${sessionKeys.length} sessions to persistence layer`);
    } catch (error) {
      console.error('[SessionManager] Failed to migrate sessions:', error);
    }
  }

  /**
   * Convert a legacy session to the new persistence format
   */
  async migrateLegacySession(sessionId, legacySession) {
    try {
      // Create session record
      const sessionRecord = {
        id: sessionId,
        userId: 'default-user', // Default user for migration
        provider: 'multi', // Legacy sessions were multi-provider
        title: legacySession.title || '',
        isActive: true,
        createdAt: legacySession.createdAt || Date.now(),
        updatedAt: legacySession.lastActivity || Date.now()
      };
      
      await this.repositories.sessions.create(sessionRecord);
      
      // Migrate threads
      if (legacySession.threads) {
        for (const [threadId, thread] of Object.entries(legacySession.threads)) {
          const threadRecord = {
            id: threadId,
            sessionId: sessionId,
            parentThreadId: thread.parentThreadId || null,
            branchPointTurnId: thread.branchPointTurnId || null,
            title: thread.name || 'Main Thread',
            isActive: thread.isActive || false,
            createdAt: thread.createdAt || Date.now(),
            updatedAt: thread.lastActivity || Date.now()
          };
          
          await this.repositories.threads.create(threadRecord);
        }
      }
      
      // Migrate turns
      if (legacySession.turns && Array.isArray(legacySession.turns)) {
        for (let i = 0; i < legacySession.turns.length; i++) {
          const turn = legacySession.turns[i];
          const turnRecord = {
            id: turn.id || `turn-${sessionId}-${i}`,
            sessionId: sessionId,
            threadId: turn.threadId || 'default-thread',
            sequence: i,
            role: turn.type || 'user',
            content: turn.text || '',
            createdAt: turn.createdAt || Date.now(),
            updatedAt: turn.updatedAt || Date.now()
          };
          
          await this.repositories.turns.create(turnRecord);
        }
      }
      
      // Migrate provider contexts
      if (legacySession.providers) {
        for (const [providerId, context] of Object.entries(legacySession.providers)) {
          const contextRecord = {
            id: `ctx-${sessionId}-${providerId}`,
            sessionId: sessionId,
            providerId: providerId,
            threadId: 'default-thread',
            contextData: context,
            isActive: true,
            createdAt: Date.now(),
            updatedAt: context.lastUpdated || Date.now()
          };
          
          await this.repositories.providerContexts.create(contextRecord);
        }
      }
      
      // Keep legacy session in memory for backward compatibility
      this.sessions[sessionId] = legacySession;
      
    } catch (error) {
      console.error(`[SessionManager] Failed to migrate session ${sessionId}:`, error);
    }
  }

  /**
   * Get or create a session (enhanced with persistence layer support)
   */
  async getOrCreateSession(sessionId) {
    if (!sessionId) throw new Error('sessionId required');
    
    if (this.usePersistenceAdapter && this.isInitialized) {
      return this.getOrCreateSessionWithPersistence(sessionId);
    } else {
      return this.getOrCreateSessionLegacy(sessionId);
    }
  }

  /**
   * Get or create session using new persistence layer
   */
  async getOrCreateSessionWithPersistence(sessionId) {
    try {
      // Try to get existing session
      let sessionRecord = await this.repositories.sessions.get(sessionId);
      
      if (!sessionRecord) {
        // Create new session
        sessionRecord = {
          id: sessionId,
          userId: 'default-user',
          provider: 'multi',
          title: '',
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        await this.repositories.sessions.create(sessionRecord);
        
        // Create default thread
        const defaultThread = {
          id: 'default-thread',
          sessionId: sessionId,
          parentThreadId: null,
          branchPointTurnId: null,
          title: 'Main Thread',
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        await this.repositories.threads.create(defaultThread);
      }
      
      // Build legacy-compatible session object for backward compatibility
      const legacySession = await this.buildLegacySessionObject(sessionId);
      this.sessions[sessionId] = legacySession;
      
      return legacySession;
    } catch (error) {
      console.error(`[SessionManager] Failed to get/create session ${sessionId}:`, error);
      // Fallback to legacy method
      return this.getOrCreateSessionLegacy(sessionId);
    }
  }

  /**
   * Legacy session creation (original implementation)
   */
  getOrCreateSessionLegacy(sessionId) {
    if (!this.sessions[sessionId]) {
      this.sessions[sessionId] = {
        sessionId,
        providers: {},
        contextHistory: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
        title: '',
        turns: [],
        threads: {
          'default-thread': {
            id: 'default-thread',
            sessionId: sessionId,
            parentThreadId: null,
            branchPointTurnId: null,
            name: 'Main Thread',
            color: '#6366f1',
            isActive: true,
            createdAt: Date.now(),
            lastActivity: Date.now()
          }
        }
      };
    }
    return this.sessions[sessionId];
  }

  /**
   * Build legacy-compatible session object from persistence layer
   */
  async buildLegacySessionObject(sessionId) {
    try {
      const sessionRecord = await this.repositories.sessions.get(sessionId);
      if (!sessionRecord) return null;
      
      // Get threads
      const threads = await this.repositories.threads.getBySessionId(sessionId);
      const threadsObj = {};
      threads.forEach(thread => {
        threadsObj[thread.id] = {
          id: thread.id,
          sessionId: thread.sessionId,
          parentThreadId: thread.parentThreadId,
          branchPointTurnId: thread.branchPointTurnId,
          name: thread.title,
          color: '#6366f1',
          isActive: thread.isActive,
          createdAt: thread.createdAt,
          lastActivity: thread.updatedAt
        };
      });
      
      // Get turns
      const turns = await this.repositories.turns.getBySessionId(sessionId);
      const turnsArray = turns.map(turn => ({
        id: turn.id,
        type: turn.role,
        text: turn.content,
        threadId: turn.threadId,
        createdAt: turn.createdAt,
        updatedAt: turn.updatedAt
      }));
      
      // Get provider contexts
      const contexts = await this.repositories.providerContexts.getBySessionId(sessionId);
      const providersObj = {};
      contexts.forEach(context => {
        providersObj[context.providerId] = {
          ...context.contextData,
          lastUpdated: context.updatedAt
        };
      });
      
      return {
        sessionId: sessionRecord.id,
        providers: providersObj,
        contextHistory: [],
        createdAt: sessionRecord.createdAt,
        lastActivity: sessionRecord.updatedAt,
        title: sessionRecord.title,
        turns: turnsArray,
        threads: threadsObj
      };
    } catch (error) {
      console.error(`[SessionManager] Failed to build legacy session object for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Load sessions from chrome.storage (legacy method)
   */
  async loadSessions() {
    if (!this.isExtensionContext) return;
    try {
      const data = await chrome.storage.local.get(null);
      const sessionKeys = Object.keys(data).filter(key => key.startsWith(`${this.storageKey}_`));
      for (const key of sessionKeys) {
        const sessionId = key.replace(`${this.storageKey}_`, '');
        if (data[key]) {
          this.sessions[sessionId] = data[key];
          // Ensure threads object exists for backward compatibility
          if (!this.sessions[sessionId].threads) {
            this.sessions[sessionId].threads = {
              'default-thread': {
                id: 'default-thread',
                sessionId: sessionId,
                parentThreadId: null,
                branchPointTurnId: null,
                name: 'Main Thread',
                color: '#6366f1',
                isActive: true,
                createdAt: this.sessions[sessionId].createdAt || Date.now(),
                lastActivity: this.sessions[sessionId].lastActivity || Date.now()
              }
            };
          }
        }
      }
      console.log(`[SessionManager] Loaded ${Object.keys(this.sessions).length} sessions.`);
    } catch (error) {
      console.error('[SessionManager] Failed to load sessions:', error);
    }
  }

  /**
   * Save session (enhanced with persistence layer support)
   */
  async saveSession(sessionId) {
    if (this.usePersistenceAdapter && this.isInitialized) {
      return this.saveSessionWithPersistence(sessionId);
    } else {
      return this.saveSessionLegacy(sessionId);
    }
  }

  /**
   * Save session using new persistence layer
   */
  async saveSessionWithPersistence(sessionId) {
    try {
      const session = this.sessions[sessionId];
      if (!session) return;
      
      // Update session record
      await this.repositories.sessions.update(sessionId, {
        title: session.title,
        updatedAt: Date.now()
      });
      
      console.log(`[SessionManager] Saved session ${sessionId} to persistence layer`);
    } catch (error) {
      console.error(`[SessionManager] Failed to save session ${sessionId} to persistence layer:`, error);
      // Fallback to legacy save
      await this.saveSessionLegacy(sessionId);
    }
  }

  /**
   * Legacy session save method
   */
  async saveSessionLegacy(sessionId) {
    if (!this.isExtensionContext || !this.sessions[sessionId]) return;
    try {
      const sessionKey = `${this.storageKey}_${sessionId}`;
      await chrome.storage.local.set({ [sessionKey]: this.sessions[sessionId] });
      console.log(`[SessionManager] Saved session ${sessionId} to chrome.storage`);
    } catch (error) {
      console.error(`[SessionManager] Failed to save session ${sessionId} to chrome.storage:`, error);
    }
  }

  /**
   * Add turn to session (enhanced with persistence layer support)
   */
  async addTurn(sessionId, userTurn, aiTurn, threadId = 'default-thread') {
    if (this.usePersistenceAdapter && this.isInitialized) {
      return this.addTurnWithPersistence(sessionId, userTurn, aiTurn, threadId);
    } else {
      return this.addTurnLegacy(sessionId, userTurn, aiTurn, threadId);
    }
  }

  /**
   * Add turn using new persistence layer
   */
  async addTurnWithPersistence(sessionId, userTurn, aiTurn, threadId = 'default-thread') {
    try {
      const session = await this.getOrCreateSession(sessionId);
      
      // Get next sequence numbers
      const existingTurns = await this.repositories.turns.getBySessionId(sessionId);
      let nextSequence = existingTurns.length;
      
      // Add user turn
      if (userTurn) {
        const userTurnRecord = {
          id: userTurn.id || `turn-${sessionId}-${nextSequence}`,
          sessionId: sessionId,
          threadId: threadId,
          sequence: nextSequence++,
          role: 'user',
          content: userTurn.text || '',
          createdAt: userTurn.createdAt || Date.now(),
          updatedAt: Date.now()
        };
        
        await this.repositories.turns.create(userTurnRecord);
        
        // Add to legacy session for compatibility
        session.turns = session.turns || [];
        session.turns.push({ ...userTurn, threadId });
      }
      
      // Add AI turn
      if (aiTurn) {
        const aiTurnRecord = {
          id: aiTurn.id || `turn-${sessionId}-${nextSequence}`,
          sessionId: sessionId,
          threadId: threadId,
          sequence: nextSequence,
          role: 'assistant',
          content: aiTurn.text || '',
          createdAt: aiTurn.createdAt || Date.now(),
          updatedAt: Date.now()
        };
        
        await this.repositories.turns.create(aiTurnRecord);
        
        // Add to legacy session for compatibility
        session.turns = session.turns || [];
        session.turns.push({ ...aiTurn, threadId, completedAt: Date.now() });
      }
      
      // Update session title and activity
      if (!session.title && userTurn?.text) {
        session.title = String(userTurn.text).slice(0, 50);
        await this.repositories.sessions.update(sessionId, {
          title: session.title,
          updatedAt: Date.now()
        });
      }
      
      session.lastActivity = Date.now();
      
    } catch (error) {
      console.error(`[SessionManager] Failed to add turn to persistence layer:`, error);
      // Fallback to legacy method
      this.addTurnLegacy(sessionId, userTurn, aiTurn, threadId);
    }
  }

  /**
   * Legacy add turn method
   */
  addTurnLegacy(sessionId, userTurn, aiTurn, threadId = 'default-thread') {
    const session = this.getOrCreateSessionLegacy(sessionId);
    session.turns = session.turns || [];
    
    if (userTurn) session.turns.push({ ...userTurn, threadId });
    if (aiTurn) session.turns.push({ ...aiTurn, threadId, completedAt: Date.now() });

    if (!session.title && userTurn?.text) {
      session.title = String(userTurn.text).slice(0, 50);
    }
    session.lastActivity = Date.now();
    this.saveSessionLegacy(sessionId).catch(console.error);
  }

  /**
   * Delete session (enhanced with persistence layer support)
   */
  async deleteSession(sessionId) {
    if (this.usePersistenceAdapter && this.isInitialized) {
      return this.deleteSessionWithPersistence(sessionId);
    } else {
      return this.deleteSessionLegacy(sessionId);
    }
  }

  /**
   * Delete session using new persistence layer
   */
  async deleteSessionWithPersistence(sessionId) {
    try {
      // Delete from persistence layer
      await this.repositories.sessions.delete(sessionId);
      
      // Delete related data
      const threads = await this.repositories.threads.getBySessionId(sessionId);
      for (const thread of threads) {
        await this.repositories.threads.delete(thread.id);
      }
      
      const turns = await this.repositories.turns.getBySessionId(sessionId);
      for (const turn of turns) {
        await this.repositories.turns.delete(turn.id);
      }
      
      const contexts = await this.repositories.providerContexts.getBySessionId(sessionId);
      for (const context of contexts) {
        await this.repositories.providerContexts.delete(context.id);
      }
      
      // Delete from memory
      if (this.sessions[sessionId]) {
        delete this.sessions[sessionId];
      }
      
      // Delete from chrome.storage as well for cleanup
      if (this.isExtensionContext) {
        try {
          await chrome.storage.local.remove(`${this.storageKey}_${sessionId}`);
        } catch (e) {
          console.error('Failed to remove from chrome.storage:', e);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`[SessionManager] Failed to delete session ${sessionId} from persistence layer:`, error);
      // Fallback to legacy delete
      return this.deleteSessionLegacy(sessionId);
    }
  }

  /**
   * Legacy delete session method
   */
  async deleteSessionLegacy(sessionId) {
    if (this.sessions[sessionId]) {
      delete this.sessions[sessionId];
      if (this.isExtensionContext) {
        try {
          await chrome.storage.local.remove(`${this.storageKey}_${sessionId}`);
        } catch (e) {
          console.error(e);
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Update provider context (enhanced with persistence layer support)
   */
  async updateProviderContext(sessionId, providerId, result, preserveChat = true, options = {}) {
    if (this.usePersistenceAdapter && this.isInitialized) {
      return this.updateProviderContextWithPersistence(sessionId, providerId, result, preserveChat, options);
    } else {
      return this.updateProviderContextLegacy(sessionId, providerId, result, preserveChat, options);
    }
  }

  /**
   * Update provider context using new persistence layer
   */
  async updateProviderContextWithPersistence(sessionId, providerId, result, preserveChat = true, options = {}) {
    const { skipSave = true } = options;
    if (!sessionId || !providerId) return;
    
    try {
      const session = await this.getOrCreateSession(sessionId);
      
      // Get or create provider context
      const contexts = await this.repositories.providerContexts.getByProviderAndSession(providerId, sessionId);
      let contextRecord = contexts[0]; // Get the most recent one
      
      if (!contextRecord) {
        // Create new context
        contextRecord = {
          id: `ctx-${sessionId}-${providerId}-${Date.now()}`,
          sessionId: sessionId,
          providerId: providerId,
          threadId: 'default-thread',
          contextData: {},
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }
      
      // Update context data
      const existingContext = contextRecord.contextData || {};
      contextRecord.contextData = {
        ...existingContext,
        text: result?.text || existingContext.text || '',
        meta: { ...(existingContext.meta || {}), ...(result?.meta || {}) },
        lastUpdated: Date.now()
      };
      contextRecord.updatedAt = Date.now();
      
      // Save or update context
      if (contexts.length > 0) {
        await this.repositories.providerContexts.update(contextRecord.id, contextRecord);
      } else {
        await this.repositories.providerContexts.create(contextRecord);
      }
      
      // Update legacy session for compatibility
      session.providers = session.providers || {};
      session.providers[providerId] = contextRecord.contextData;
      session.lastActivity = Date.now();
      
      if (!skipSave) {
        await this.saveSession(sessionId);
      }
      
    } catch (error) {
      console.error(`[SessionManager] Failed to update provider context in persistence layer:`, error);
      // Fallback to legacy method
      this.updateProviderContextLegacy(sessionId, providerId, result, preserveChat, options);
    }
  }

  /**
   * Legacy update provider context method
   */
  updateProviderContextLegacy(sessionId, providerId, result, preserveChat = true, options = {}) {
    const { skipSave = true } = options;
    if (!sessionId || !providerId) return;
    const session = this.getOrCreateSessionLegacy(sessionId);
    const existingContext = session.providers[providerId] || {};

    session.providers[providerId] = {
      ...existingContext,
      text: result?.text || existingContext.text || '',
      meta: { ...(existingContext.meta || {}), ...(result?.meta || {}) },
      lastUpdated: Date.now()
    };

    session.lastActivity = Date.now();
    if (!skipSave) {
      this.saveSessionLegacy(sessionId).catch(err => console.error(`Failed to save session ${sessionId}:`, err));
    }
  }

  /**
   * Get provider contexts (backward compatible)
   */
  getProviderContexts(sessionId, threadId = 'default-thread') {
    const session = this.sessions[sessionId];
    if (!session) return {};
    const contexts = {};
    for (const [providerId, data] of Object.entries(session.providers || {})) {
      if (data?.meta) contexts[providerId] = { meta: data.meta };
    }
    return contexts;
  }

  /**
   * Create thread (enhanced with persistence layer support)
   */
  async createThread(sessionId, parentThreadId = null, branchPointTurnId = null, name = null, color = '#8b5cf6') {
    if (this.usePersistenceAdapter && this.isInitialized) {
      return this.createThreadWithPersistence(sessionId, parentThreadId, branchPointTurnId, name, color);
    } else {
      return this.createThreadLegacy(sessionId, parentThreadId, branchPointTurnId, name, color);
    }
  }

  /**
   * Create thread using new persistence layer
   */
  async createThreadWithPersistence(sessionId, parentThreadId = null, branchPointTurnId = null, name = null, color = '#8b5cf6') {
    try {
      const session = await this.getOrCreateSession(sessionId);
      const threadId = `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const existingThreads = await this.repositories.threads.getBySessionId(sessionId);
      const threadRecord = {
        id: threadId,
        sessionId: sessionId,
        parentThreadId: parentThreadId,
        branchPointTurnId: branchPointTurnId,
        title: name || `Branch ${existingThreads.length}`,
        isActive: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      await this.repositories.threads.create(threadRecord);
      
      // Add to legacy session for compatibility
      session.threads = session.threads || {};
      session.threads[threadId] = {
        id: threadId,
        sessionId: sessionId,
        parentThreadId: parentThreadId,
        branchPointTurnId: branchPointTurnId,
        name: threadRecord.title,
        color: color || '#8b5cf6',
        isActive: false,
        createdAt: threadRecord.createdAt,
        lastActivity: threadRecord.updatedAt
      };
      
      await this.saveSession(sessionId);
      return session.threads[threadId];
    } catch (error) {
      console.error(`[SessionManager] Failed to create thread in persistence layer:`, error);
      // Fallback to legacy method
      return this.createThreadLegacy(sessionId, parentThreadId, branchPointTurnId, name, color);
    }
  }

  /**
   * Legacy create thread method
   */
  createThreadLegacy(sessionId, parentThreadId = null, branchPointTurnId = null, name = null, color = '#8b5cf6') {
    const session = this.getOrCreateSessionLegacy(sessionId);
    const threadId = `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    session.threads = session.threads || {};
    session.threads[threadId] = {
      id: threadId,
      sessionId: sessionId,
      parentThreadId: parentThreadId,
      branchPointTurnId: branchPointTurnId,
      name: name || `Branch ${Object.keys(session.threads).length}`,
      color: color || '#8b5cf6',
      isActive: false,
      createdAt: Date.now(),
      lastActivity: Date.now()
    };
    this.saveSessionLegacy(sessionId).catch(console.error);
    return session.threads[threadId];
  }

  /**
   * Switch thread (enhanced with persistence layer support)
   */
  async switchThread(sessionId, threadId) {
    if (this.usePersistenceAdapter && this.isInitialized) {
      return this.switchThreadWithPersistence(sessionId, threadId);
    } else {
      return this.switchThreadLegacy(sessionId, threadId);
    }
  }

  /**
   * Switch thread using new persistence layer
   */
  async switchThreadWithPersistence(sessionId, threadId) {
    try {
      const session = this.sessions[sessionId];
      if (!session || !session.threads || !session.threads[threadId]) {
        throw new Error(`Thread ${threadId} not found in session ${sessionId}`);
      }
      
      // Update all threads in persistence layer
      const threads = await this.repositories.threads.getBySessionId(sessionId);
      for (const thread of threads) {
        const isActive = thread.id === threadId;
        await this.repositories.threads.update(thread.id, {
          isActive: isActive,
          updatedAt: isActive ? Date.now() : thread.updatedAt
        });
      }
      
      // Update legacy session for compatibility
      Object.values(session.threads).forEach(thread => { thread.isActive = false; });
      session.threads[threadId].isActive = true;
      session.threads[threadId].lastActivity = Date.now();
      
      await this.saveSession(sessionId);
      return session.threads[threadId];
    } catch (error) {
      console.error(`[SessionManager] Failed to switch thread in persistence layer:`, error);
      // Fallback to legacy method
      return this.switchThreadLegacy(sessionId, threadId);
    }
  }

  /**
   * Legacy switch thread method
   */
  switchThreadLegacy(sessionId, threadId) {
    const session = this.sessions[sessionId];
    if (!session || !session.threads || !session.threads[threadId]) {
      throw new Error(`Thread ${threadId} not found in session ${sessionId}`);
    }
    Object.values(session.threads).forEach(thread => { thread.isActive = false; });
    session.threads[threadId].isActive = true;
    session.threads[threadId].lastActivity = Date.now();
    this.saveSessionLegacy(sessionId).catch(console.error);
    return session.threads[threadId];
  }

  /**
   * Get stored turn by id (backward compatible)
   */
  getTurn(sessionId, turnId) {
    const session = this.sessions[sessionId];
    if (!session) return null;
    return (session.turns || []).find(t => t.id === turnId) || null;
  }

  /**
   * Get all turns for a session (backward compatible)
   */
  getTurns(sessionId) {
    const session = this.sessions[sessionId];
    if (!session) return [];
    return session.turns || [];
  }

  /**
   * Save turn (legacy compatibility method)
   */
  saveTurn(sessionId, userTurn, aiTurn) {
    const session = this.getOrCreateSessionLegacy(sessionId);
    session.turns = session.turns || [];

    if (userTurn) session.turns.push({ ...userTurn });
    if (aiTurn) session.turns.push({ ...aiTurn });

    session.lastActivity = Date.now();
    if (!session.title && userTurn?.text) {
      session.title = String(userTurn.text).slice(0, 50);
    }

    this.saveSession(sessionId).catch(err => console.error(`Failed to save session ${sessionId}:`, err));
  }

  /**
   * Get persistence adapter status
   */
  getPersistenceStatus() {
    return {
      usePersistenceAdapter: this.usePersistenceAdapter,
      isInitialized: this.isInitialized,
      adapterReady: this.persistenceAdapter?.isReady() || false,
      repositoriesAvailable: !!this.repositories
    };
  }

  /**
   * Enable persistence adapter at runtime (for testing/debugging)
   */
  async enablePersistenceAdapter() {
    if (!this.usePersistenceAdapter) {
      this.usePersistenceAdapter = true;
      await this.initializePersistenceLayer();
    }
  }

  /**
   * Disable persistence adapter and fallback to legacy storage
   */
  async disablePersistenceAdapter() {
    if (this.usePersistenceAdapter) {
      this.usePersistenceAdapter = false;
      if (this.persistenceAdapter) {
        await this.persistenceAdapter.close();
        this.persistenceAdapter = null;
        this.repositories = null;
        this.isInitialized = false;
      }
      // Reload sessions from chrome.storage
      if (this.isExtensionContext) {
        await this.loadSessions();
      }
    }
  }
}