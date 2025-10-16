// Type declarations for SessionManager.js

export interface SessionData {
  id: string;
  turns: any[];
  threads: Record<string, any>;
  providerContexts: Record<string, any>;
  metadata: {
    createdAt: number;
    updatedAt: number;
    activeThreadId: string;
  };
}

export interface TurnData {
  id: string;
  userTurn: any;
  aiTurn: any;
  threadId: string;
  timestamp: number;
}

export interface ThreadData {
  id: string;
  name: string | null;
  color: string;
  parentThreadId: string | null;
  branchPointTurnId: string | null;
  createdAt: number;
}

export interface ProviderContextOptions {
  preserveChat?: boolean;
  [key: string]: any;
}

export interface PersistenceStatus {
  usePersistenceAdapter: boolean;
  isInitialized: boolean;
  adapterReady: boolean;
}

export declare class SessionManager {
  sessions: Record<string, SessionData>;
  storageKey: string;
  isExtensionContext: boolean;
  usePersistenceAdapter: boolean;
  adapter: any;
  isInitialized: boolean;

  constructor();
  
  initialize(config?: { adapter?: any; usePersistenceAdapter?: boolean; migrateLegacy?: boolean; initTimeoutMs?: number }): Promise<void>;
  migrateExistingSessions(): Promise<void>;
  migrateLegacySession(sessionId: string, legacySession: any): Promise<void>;
  
  getOrCreateSession(sessionId: string): Promise<SessionData>;
  getOrCreateSessionWithPersistence(sessionId: string): Promise<SessionData>;
  getOrCreateSessionLegacy(sessionId: string): SessionData;
  buildLegacySessionObject(sessionId: string): Promise<SessionData>;
  
  loadSessions(): Promise<void>;
  saveSession(sessionId: string): Promise<void>;
  saveSessionWithPersistence(sessionId: string): Promise<void>;
  saveSessionLegacy(sessionId: string): Promise<void>;
  
  addTurn(sessionId: string, userTurn: any, aiTurn: any, threadId?: string): Promise<void>;
  addTurnWithPersistence(sessionId: string, userTurn: any, aiTurn: any, threadId?: string): Promise<void>;
  addTurnLegacy(sessionId: string, userTurn: any, aiTurn: any, threadId?: string): void;
  
  deleteSession(sessionId: string): Promise<void>;
  deleteSessionWithPersistence(sessionId: string): Promise<void>;
  deleteSessionLegacy(sessionId: string): Promise<void>;
  
  updateProviderContext(sessionId: string, providerId: string, result: any, preserveChat?: boolean, options?: ProviderContextOptions): Promise<void>;
  updateProviderContextWithPersistence(sessionId: string, providerId: string, result: any, preserveChat?: boolean, options?: ProviderContextOptions): Promise<void>;
  updateProviderContextLegacy(sessionId: string, providerId: string, result: any, preserveChat?: boolean, options?: ProviderContextOptions): void;
  
  getProviderContexts(sessionId: string, threadId?: string): any;
  
  createThread(sessionId: string, parentThreadId?: string | null, branchPointTurnId?: string | null, name?: string | null, color?: string): Promise<string>;
  createThreadWithPersistence(sessionId: string, parentThreadId?: string | null, branchPointTurnId?: string | null, name?: string | null, color?: string): Promise<string>;
  createThreadLegacy(sessionId: string, parentThreadId?: string | null, branchPointTurnId?: string | null, name?: string | null, color?: string): string;
  
  switchThread(sessionId: string, threadId: string): Promise<void>;
  switchThreadWithPersistence(sessionId: string, threadId: string): Promise<void>;
  switchThreadLegacy(sessionId: string, threadId: string): void;
  
  getTurn(sessionId: string, turnId: string): any;
  getTurns(sessionId: string): any[];
  saveTurn(sessionId: string, userTurn: any, aiTurn: any): Promise<void>;
  
  getPersistenceStatus(): PersistenceStatus;
  enablePersistenceAdapter(): Promise<void>;
  disablePersistenceAdapter(): Promise<void>;
}

export default SessionManager;