// Enhanced SessionManager with Persistence Adapter Integration
// Supports both legacy chrome.storage and new persistence layer via feature flag

import { SimpleIndexedDBAdapter } from './SimpleIndexedDBAdapter.js';
import * as chromeStoragePromise from './chromeStoragePromise.js';

// Global session cache (maintains backward compatibility)
const __HTOS_SESSIONS = (self.__HTOS_SESSIONS = self.__HTOS_SESSIONS || {});

export class SessionManager {
  constructor() {
    this.sessions = __HTOS_SESSIONS;
    this.storageKey = 'htos_sessions';
    this.isExtensionContext = typeof chrome !== 'undefined' && !!chrome.storage?.local;
    this.usePersistenceAdapter = false; // will be set during initialize(config)
    
    // Persistence layer components will be injected
    this.adapter = null;
    this.isInitialized = false;
  }

  /**
   * Append provider responses (mapping/synthesis/batch) to an existing AI turn
   * that follows the given historical user turn. Used to persist historical reruns
   * without creating a new user/ai turn pair.
   * additions shape: { batchResponses?, synthesisResponses?, mappingResponses? }
   */
  async appendProviderResponses(sessionId, targetUserTurnId, additions = {}) {
    try {
      const usePA = this.usePersistenceAdapter && this.isInitialized && this.adapter?.isReady();

      // Locate AI turn following the target user turn in legacy cache first
      let session = this.sessions[sessionId];
      if (!session) {
        // Hydrate via getOrCreate to ensure legacy cache exists
        session = await this.getOrCreateSession(sessionId);
      }
      let turns = Array.isArray(session?.turns) ? session.turns : [];
      let userIdx = turns.findIndex(t => t && t.id === targetUserTurnId && (t.type === 'user' || t.role === 'user'));
      if (userIdx === -1 || !turns[userIdx + 1] || (turns[userIdx + 1].type !== 'ai' && turns[userIdx + 1].role !== 'assistant')) {
        // Relocate: search all sessions for the correct one containing targetUserTurnId
        const all = this.sessions || {};
        let relocated = null;
        for (const [sid, s] of Object.entries(all)) {
          const arr = Array.isArray(s?.turns) ? s.turns : [];
          const idx = arr.findIndex(t => t && t.id === targetUserTurnId && (t.type === 'user' || t.role === 'user'));
          if (idx !== -1 && arr[idx + 1] && (arr[idx + 1].type === 'ai' || arr[idx + 1].role === 'assistant')) {
            sessionId = sid; // update to correct session
            session = s;
            turns = arr;
            userIdx = idx;
            relocated = sid;
            break;
          }
        }
        if (!relocated) {
          console.warn(`[SessionManager] appendProviderResponses: AI turn not found after userTurn ${targetUserTurnId} in any session`);
          return false;
        }
        console.warn(`[SessionManager] appendProviderResponses: relocated to session ${relocated} for userTurn ${targetUserTurnId}`);
      }
      const aiTurn = turns[userIdx + 1];

      const now = Date.now();
      const ensureArrayBucket = (obj, key) => { if (!obj[key]) obj[key] = []; return obj[key]; };

      const persistBucket = async (bucket, responseType) => {
        if (!bucket) return;
        for (const [providerId, value] of Object.entries(bucket)) {
          const entries = Array.isArray(value) ? value : [value];
          for (let idx = 0; idx < entries.length; idx++) {
            const entry = entries[idx] || {};
            // Update legacy mirror
            if (responseType === 'mapping') {
              const arr = ensureArrayBucket(aiTurn.mappingResponses = (aiTurn.mappingResponses || {}), providerId);
              arr.push({ providerId, text: entry.text || '', status: entry.status || 'completed', meta: entry.meta || {} });
            } else if (responseType === 'synthesis') {
              const arr = ensureArrayBucket(aiTurn.synthesisResponses = (aiTurn.synthesisResponses || {}), providerId);
              arr.push({ providerId, text: entry.text || '', status: entry.status || 'completed', meta: entry.meta || {} });
            } else if (responseType === 'batch') {
              aiTurn.batchResponses = aiTurn.batchResponses || {};
              aiTurn.batchResponses[providerId] = { providerId, text: entry.text || '', status: entry.status || 'completed', meta: entry.meta || {} };
            }

            if (usePA) {
              // Persist provider response record
              const respId = `pr-${sessionId}-${aiTurn.id}-${providerId}-${responseType}-${idx}-${Date.now()}`;
              const record = {
                id: respId,
                sessionId,
                aiTurnId: aiTurn.id,
                providerId,
                responseType,
                responseIndex: idx,
                text: entry.text || '',
                status: entry.status || 'completed',
                meta: entry.meta || {},
                createdAt: now,
                updatedAt: now,
                completedAt: now
              };
              await this.adapter.put('provider_responses', record);
            }
          }
        }
      };

      await persistBucket(additions.batchResponses, 'batch');
      await persistBucket(additions.synthesisResponses, 'synthesis');
      await persistBucket(additions.mappingResponses, 'mapping');

      session.lastActivity = now;
      await this.saveSession(sessionId);
      return true;
    } catch (error) {
      console.error('[SessionManager] appendProviderResponses failed:', error);
      return false;
    }
  }

  /**
   * Helper function to count responses in a response bucket
   * @param {Object} responseBucket - Object containing provider responses
   * @returns {number} Total count of responses
   */
  countResponses(responseBucket) {
    return responseBucket ? Object.values(responseBucket).flat().length : 0;
  }

  /**
   * Initialize the session manager.
   * It now accepts the persistence adapter as an argument.
   */
  async initialize(config = {}) {
    const {
      adapter = null,
      usePersistenceAdapter = true,
      migrateLegacy = true,
      initTimeoutMs = 8000
    } = config || {};
    
    this.usePersistenceAdapter = !!usePersistenceAdapter;
    
    if (this.usePersistenceAdapter) {
      console.log('[SessionManager] Initializing with persistence adapter...');
      
      if (adapter) {
        this.adapter = adapter;
      } else {
        // Create and initialize SimpleIndexedDBAdapter
        this.adapter = new SimpleIndexedDBAdapter();
        await this.adapter.init({ timeoutMs: initTimeoutMs, autoRepair: true });
      }
      
      if (migrateLegacy && this.isExtensionContext) {
        await this.migrateExistingSessions();
      }
      this.isInitialized = true;
      console.log('[SessionManager] Persistence layer integration successful.');
    } else {
      console.log('[SessionManager] Initializing in legacy chrome.storage mode.');
      if (this.isExtensionContext) {
        await this.loadSessions();
      }
      this.isInitialized = true; // Mark as initialized even for legacy mode
    }
    console.log('[SessionManager] Initialization complete');
  }

  /**
   * Migrate existing chrome.storage sessions to new persistence layer
   */
  async migrateExistingSessions() {
    if (!this.isExtensionContext || !this.adapter) return;

    try {
      const data = await chromeStoragePromise.get(null);
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
      
      await this.adapter.put('sessions', sessionRecord);
      
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
          
          await this.adapter.put('threads', threadRecord);
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
          
          await this.adapter.put('turns', turnRecord);
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
          
          await this.adapter.put('provider_contexts', contextRecord);
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
      let sessionRecord = await this.adapter.get('sessions', sessionId);
      
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
        
        await this.adapter.put('sessions', sessionRecord);
        
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
        
        await this.adapter.put('threads', defaultThread);
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
      const sessionRecord = await this.adapter.get('sessions', sessionId);
      if (!sessionRecord) return null;
      
      // Get threads - using getAll and filtering by sessionId
      const allThreads = await this.adapter.getAll('threads');
      const threads = allThreads.filter(thread => thread.sessionId === sessionId);
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
      
      // Get turns - using getAll and filtering by sessionId
      const allTurns = await this.adapter.getAll('turns');
      const turns = allTurns
        .filter(turn => turn.sessionId === sessionId)
        .sort((a, b) => (a.sequence ?? a.createdAt) - (b.sequence ?? b.createdAt));

      // Prepare a lookup for AI turn responses by aiTurnId
      const allResponses = await this.adapter.getAll('provider_responses');
      const responsesByTurn = new Map();
      for (const resp of allResponses) {
        if (resp.sessionId !== sessionId) continue;
        const key = resp.aiTurnId;
        if (!responsesByTurn.has(key)) {
          responsesByTurn.set(key, { batch: {}, synthesis: {}, mapping: {} });
        }
        const bucket = responsesByTurn.get(key);
        const entry = {
          providerId: resp.providerId,
          text: resp.text || '',
          status: resp.status || 'completed',
          meta: resp.meta || {}
        };
        if (resp.responseType === 'batch') {
          bucket.batch[resp.providerId] = entry;
        } else if (resp.responseType === 'synthesis') {
          const arr = bucket.synthesis[resp.providerId] || [];
          arr.push(entry);
          bucket.synthesis[resp.providerId] = arr;
        } else if (resp.responseType === 'mapping') {
          const arr = bucket.mapping[resp.providerId] || [];
          arr.push(entry);
          bucket.mapping[resp.providerId] = arr;
        }
      }

      const turnsArray = turns.map(turn => {
        const base = {
          id: turn.id,
          text: turn.content,
          threadId: turn.threadId,
          createdAt: turn.createdAt,
          updatedAt: turn.updatedAt
        };
        if (turn.type === 'user' || turn.role === 'user') {
          return { ...base, type: 'user' };
        } else {
          // assistant/ai turn
          const respBuckets = responsesByTurn.get(turn.id) || { batch: {}, synthesis: {}, mapping: {} };
          return {
            ...base,
            type: 'ai',
            batchResponses: respBuckets.batch,
            synthesisResponses: respBuckets.synthesis,
            mappingResponses: respBuckets.mapping,
            completedAt: turn.updatedAt
          };
        }
      });
      
      // Get provider contexts - using getAll and filtering by sessionId
      const allContexts = await this.adapter.getAll('provider_contexts');
      const contexts = allContexts.filter(context => context.sessionId === sessionId);
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
      const data = await chromeStoragePromise.get(null);
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
      const sessionRecord = await this.adapter.get('sessions', sessionId);
      if (sessionRecord) {
        sessionRecord.title = session.title;
        sessionRecord.updatedAt = Date.now();
        await this.adapter.put('sessions', sessionRecord);
      }
      
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
      await chromeStoragePromise.set({ [sessionKey]: this.sessions[sessionId] });
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
      
      // Get next sequence numbers - using getAll and filtering by sessionId
      const allTurns = await this.adapter.getAll('turns');
      const existingTurns = allTurns.filter(turn => turn.sessionId === sessionId);
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
        
        await this.adapter.put('turns', userTurnRecord);
        
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
        
        await this.adapter.put('turns', aiTurnRecord);
        
        // Add to legacy session for compatibility
        session.turns = session.turns || [];
        session.turns.push({ ...aiTurn, threadId, completedAt: Date.now() });
      }
      
      // Update session title and activity
      if (!session.title && userTurn?.text) {
        session.title = String(userTurn.text).slice(0, 50);
        const sessionRecord = await this.adapter.get('sessions', sessionId);
        if (sessionRecord) {
          sessionRecord.title = session.title;
          sessionRecord.updatedAt = Date.now();
          await this.adapter.put('sessions', sessionRecord);
        }
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
      await this.adapter.delete('sessions', sessionId);
      
      // Delete related data - using getAll and filtering by sessionId
      const allThreads = await this.adapter.getAll('threads');
      const threads = allThreads.filter(thread => thread.sessionId === sessionId);
      for (const thread of threads) {
        await this.adapter.delete('threads', thread.id);
      }
      
      const allTurns = await this.adapter.getAll('turns');
      const turns = allTurns.filter(turn => turn.sessionId === sessionId);
      for (const turn of turns) {
        await this.adapter.delete('turns', turn.id);
      }

      // Also delete provider responses associated with this session
      try {
        const allResponses = await this.adapter.getAll('provider_responses');
        const responses = allResponses.filter(resp => resp.sessionId === sessionId);
        for (const resp of responses) {
          await this.adapter.delete('provider_responses', resp.id);
        }
      } catch (e) {
        console.warn('[SessionManager] Failed to delete provider responses for session', sessionId, e);
      }
      
      const allContexts = await this.adapter.getAll('provider_contexts');
      const contexts = allContexts.filter(context => context.sessionId === sessionId);
      for (const context of contexts) {
        await this.adapter.delete('provider_contexts', context.id);
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
      
      // Get or create provider context - using getAll and filtering
      const allContexts = await this.adapter.getAll('provider_contexts');
      const contexts = allContexts.filter(context => 
        context.providerId === providerId && context.sessionId === sessionId
      );
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
      await this.adapter.put('provider_contexts', contextRecord);
      
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
      
      // Get existing threads - using getAll and filtering by sessionId
      const allThreads = await this.adapter.getAll('threads');
      const existingThreads = allThreads.filter(thread => thread.sessionId === sessionId);
      
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
      
      await this.adapter.put('threads', threadRecord);
      
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
      
      // Update all threads in persistence layer - using getAll and filtering by sessionId
      const allThreads = await this.adapter.getAll('threads');
      const threads = allThreads.filter(thread => thread.sessionId === sessionId);
      
      for (const thread of threads) {
        const isActive = thread.id === threadId;
        const updatedThread = {
          ...thread,
          isActive: isActive,
          updatedAt: isActive ? Date.now() : thread.updatedAt
        };
        await this.adapter.put('threads', updatedThread);
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
  async saveTurn(sessionId, userTurn, aiTurn) {
    // If persistence adapter is active, persist full turn + provider responses
    if (this.usePersistenceAdapter && this.isInitialized && this.adapter?.isReady()) {
      return this.saveTurnWithPersistence(sessionId, userTurn, aiTurn);
    }

    // Legacy fallback
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
   * Legacy turn saving that bypasses persistence adapter checks
   * Used as fallback to prevent infinite recursion in error handling
   */
  saveTurnLegacy(sessionId, userTurn, aiTurn) {
    const session = this.getOrCreateSessionLegacy(sessionId);
    session.turns = session.turns || [];

    if (userTurn) session.turns.push({ ...userTurn });
    if (aiTurn) session.turns.push({ ...aiTurn });

    session.lastActivity = Date.now();
    if (!session.title && userTurn?.text) {
      session.title = String(userTurn.text).slice(0, 50);
    }

    this.saveSessionLegacy(sessionId).catch(err => console.error(`Failed to save session ${sessionId}:`, err));
  }

  /**
   * Persist a complete user+AI turn and all provider responses
   */
  async saveTurnWithPersistence(sessionId, userTurn, aiTurn) {
    try {
      // Ensure session exists and is hydrated into legacy cache
      const session = await this.getOrCreateSession(sessionId);

      // Determine next sequence
      const allTurns = await this.adapter.getAll('turns');
      const existingTurns = allTurns.filter(t => t.sessionId === sessionId);
      let nextSequence = existingTurns.length;

      const now = Date.now();

      // Persist user turn
      if (userTurn) {
        const userTurnRecord = {
          id: userTurn.id || `turn-${sessionId}-${nextSequence}`,
          type: 'user',
          role: 'user',
          sessionId,
          threadId: 'default-thread',
          createdAt: userTurn.createdAt || now,
          updatedAt: now,
          content: userTurn.text || '',
          sequence: nextSequence++
        };
        await this.adapter.put('turns', userTurnRecord);

        // Mirror in legacy cache for UI compatibility
        session.turns = session.turns || [];
        session.turns.push({ ...userTurn, threadId: 'default-thread' });
      }

      // Persist AI turn
      if (aiTurn) {
        const aiTurnId = aiTurn.id || `turn-${sessionId}-${nextSequence}`;
        const providerResponseIds = [];

        // Flatten and persist provider responses across types
        const persistResponses = async (bucket, responseType) => {
          if (!bucket) return;
          const providers = Object.keys(bucket);
          for (const providerId of providers) {
            const entries = Array.isArray(bucket[providerId]) ? bucket[providerId] : [bucket[providerId]];
            for (let idx = 0; idx < entries.length; idx++) {
              const entry = entries[idx] || {};
              const respId = `pr-${sessionId}-${aiTurnId}-${providerId}-${responseType}-${idx}-${Date.now()}`;
              const record = {
                id: respId,
                sessionId,
                aiTurnId,
                providerId,
                responseType,
                responseIndex: idx,
                text: entry.text || '',
                status: entry.status || 'completed',
                meta: entry.meta || {},
                createdAt: now,
                updatedAt: now,
                completedAt: now
              };
              await this.adapter.put('provider_responses', record);
              providerResponseIds.push(respId);
            }
          }
        };

        await persistResponses(aiTurn.batchResponses, 'batch');
        await persistResponses(aiTurn.synthesisResponses, 'synthesis');
        await persistResponses(aiTurn.mappingResponses, 'mapping');

        const aiTurnRecord = {
          id: aiTurnId,
          type: 'ai',
          role: 'assistant',
          sessionId,
          threadId: 'default-thread',
          createdAt: aiTurn.createdAt || now,
          updatedAt: now,
          content: aiTurn.text || '',
          sequence: nextSequence,
          userTurnId: userTurn?.id,
          providerResponseIds,
          batchResponseCount: this.countResponses(aiTurn.batchResponses),
          synthesisResponseCount: this.countResponses(aiTurn.synthesisResponses),
          mappingResponseCount: this.countResponses(aiTurn.mappingResponses)
        };
        await this.adapter.put('turns', aiTurnRecord);

        // Mirror in legacy cache for UI compatibility
        session.turns = session.turns || [];
        session.turns.push({ ...aiTurn, threadId: 'default-thread', completedAt: now });
      }

      // Title: first user turn text if missing
      if (!session.title && userTurn?.text) {
        session.title = String(userTurn.text).slice(0, 50);
        const sessionRecord = await this.adapter.get('sessions', sessionId);
        if (sessionRecord) {
          sessionRecord.title = session.title;
          sessionRecord.updatedAt = now;
          await this.adapter.put('sessions', sessionRecord);
        }
      }

      session.lastActivity = now;
      await this.saveSession(sessionId);
    } catch (error) {
      console.error(`[SessionManager] Failed to save turn with persistence:`, error);
      // Fallback to legacy path (bypasses persistence checks to prevent recursion)
      this.saveTurnLegacy(sessionId, userTurn, aiTurn);
    }
  }

  /**
   * Get persistence adapter status
   */
  getPersistenceStatus() {
    return {
      usePersistenceAdapter: this.usePersistenceAdapter,
      isInitialized: this.isInitialized,
      adapterReady: this.adapter?.isReady() || false
    };
  }

  /**
   * Enable persistence adapter at runtime (for testing/debugging)
   */
  async enablePersistenceAdapter() {
    if (!this.usePersistenceAdapter) {
      this.usePersistenceAdapter = true;
      if (!this.adapter) {
        this.adapter = new SimpleIndexedDBAdapter();
        await this.adapter.init({ timeoutMs: 8000, autoRepair: true });
      }
      this.isInitialized = true;
    }
  }

  /**
   * Disable persistence adapter and fallback to legacy storage
   */
  async disablePersistenceAdapter() {
    if (this.usePersistenceAdapter) {
      this.usePersistenceAdapter = false;
      if (this.adapter) {
        await this.adapter.close();
        this.adapter = null;
        this.isInitialized = false;
      }
      // Reload sessions from chrome.storage
      if (this.isExtensionContext) {
        await this.loadSessions();
      }
    }
  }
}