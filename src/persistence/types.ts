// IndexedDB Schema Type Definitions for HTOS Document Composition System

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

// 1. Sessions Store
export interface SessionRecord {
  id: string;                    // sessionId
  title: string;
  createdAt: number;
  lastActivity: number;
  defaultThreadId: string;        // Always 'default-thread'
  activeThreadId: string;         // Currently active thread
  turnCount: number;              // Denormalized for performance
}

// 2. Threads Store
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
}

// 3. Turns Store
export interface BaseTurnRecord {
  id: string;
  type: 'user' | 'ai';
  sessionId: string;
  threadId: string;
  createdAt: number;
  isDeleted?: boolean;            // Soft delete flag
}

export interface UserTurnRecord extends BaseTurnRecord {
  type: 'user';
  text: string;
}

export interface AiTurnRecord extends BaseTurnRecord {
  type: 'ai';
  userTurnId: string;
  meta?: {
    branchPointTurnId?: string;
    replacesId?: string;
    isHistoricalRerun?: boolean;
  };
  // Response counts for quick access
  batchResponseCount: number;
  synthesisResponseCount: number;
  ensembleResponseCount: number;
}

export type TurnRecord = UserTurnRecord | AiTurnRecord;

// 4. Provider Responses Store
export interface ProviderResponseRecord {
  id?: number;                    // Auto-generated
  sessionId: string;               // Denormalized for efficient queries
  aiTurnId: string;
  providerId: string;              // 'claude' | 'gemini' | 'chatgpt' | 'qwen'
  responseType: 'batch' | 'synthesis' | 'ensemble' | 'hidden';
  responseIndex: number;           // 0 for batch, 0+ for synthesis/ensemble arrays
  text: string;
  status: 'pending' | 'streaming' | 'completed' | 'error';
  meta?: any;
  attemptNumber?: number;
  createdAt: number;
  updatedAt: number;
}

// 5. Documents Store
export interface RefinementEntry {
  id: string;
  timestamp: number;
  type: string;
  description: string;
}

export interface ExportEntry {
  id: string;
  timestamp: number;
  format: string;
  destination: string;
}

export interface DocumentSnapshot {
  id: string;
  timestamp: number;
  canvasContent: any[];
  blockCount: number;
  label?: string;
}

export interface DocumentRecord {
  id: string;
  title: string;
  sourceSessionId?: string;        // Primary session this doc was created from
  canvasContent: any[];            // Full Slate.js JSON structure
  granularity: 'full' | 'paragraph' | 'sentence';
  isDirty: boolean;
  createdAt: number;
  lastModified: number;
  version: number;                 // For optimistic locking
  blockCount: number;              // Denormalized for quick stats
  
  // Document metadata
  refinementHistory: RefinementEntry[];
  exportHistory: ExportEntry[];
  snapshots: DocumentSnapshot[];
}

// 6. Canvas Blocks Store
export interface CanvasBlockRecord {
  id: string;                      // Block UUID
  documentId: string;
  order: number;                   // Position in document
  nodeType: string;                // Slate node type
  text: string;                    // Extracted plain text for search
  slateNode: any;                  // Full Slate node JSON
  
  provenance: {
    sessionId: string;
    aiTurnId: string;
    providerId: string;
    responseType: 'batch' | 'synthesis' | 'ensemble' | 'hidden';
    responseIndex: number;
    textRange?: [number, number];  // Character range if partial
  };
  
  cachedSourceText?: string;       // Cached for orphan resilience
  isOrphaned?: boolean;            // True if source was deleted
  createdAt: number;
  updatedAt: number;
}

// 7. Ghosts Store
export interface GhostRecord {
  id: string;
  documentId: string;               // Document this ghost belongs to
  text: string;                     // Full cached text (resilience > references)
  preview: string;                  // First 200 chars for display
  
  provenance: {
    sessionId: string;
    aiTurnId: string;
    providerId: string;
    responseType: 'batch' | 'synthesis' | 'ensemble' | 'hidden';
    responseIndex: number;
    textRange?: [number, number];
  };
  
  order: number;                   // Position in ghost rail
  createdAt: number;
  isPinned: boolean;
}

// 8. Provider Contexts Store
export interface ProviderContextRecord {
  sessionId: string;
  providerId: string;
  meta: any;                       // Provider-specific state
  text?: string;                   // System message or context
  lastUpdated: number;
}

// 9. Metadata Store
export interface MetadataRecord {
  key: string;                     // 'schema_version' | 'last_migration' | etc.
  value: any;
  updatedAt: number;
}

// Utility types for operations
export interface VersionConflictResult {
  success: boolean;
  currentVersion?: number;
}

export interface BatchWriteResult {
  success: boolean;
  errors?: Error[];
}