// Document Manager - Handles document persistence with Slate content decomposition
// Integrates with the persistence adapter to manage documents, canvas blocks, and ghosts

import { v4 as uuidv4 } from 'uuid';
import type { IPersistenceAdapter } from './adapters/IPersistenceAdapter.js';
import type { 
  DocumentRecord, 
  CanvasBlockRecord, 
  GhostRecord,
  SessionRecord,
  TurnRecord,
  ProviderResponseRecord
} from './types.js';

// Slate.js types for content decomposition
interface SlateNode {
  type: string;
  children?: SlateNode[];
  text?: string;
  [key: string]: any;
}

interface SlateDescendant extends SlateNode {
  id?: string;
  provenance?: {
    sessionId: string;
    aiTurnId: string;
    providerId: string;
    responseType: 'batch' | 'synthesis' | 'ensemble' | 'hidden';
    responseIndex: number;
    textRange?: [number, number];
  };
  metadata?: {
    granularity?: 'full' | 'paragraph' | 'sentence' | 'unknown';
    timestamp?: number;
    originalIndex?: number;
  };
}

interface DocumentSnapshot {
  id: string;
  timestamp: number;
  canvasContent: SlateDescendant[];
  blockCount: number;
  label?: string;
}

interface RefinementEntry {
  id: string;
  timestamp: number;
  type: 'manual_edit' | 'ai_refinement' | 'merge' | 'split';
  description: string;
  blockIds: string[];
}

interface ExportEntry {
  id: string;
  timestamp: number;
  format: 'markdown' | 'html' | 'docx' | 'pdf';
  filename: string;
  size: number;
}

export interface DocumentManagerConfig {
  autoSaveInterval?: number;
  maxSnapshots?: number;
  enableAutoDecomposition?: boolean;
  compressionThreshold?: number;
}

export class DocumentManager {
  private adapter: IPersistenceAdapter;
  private config: DocumentManagerConfig;
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(adapter: IPersistenceAdapter, config: DocumentManagerConfig = {}) {
    this.adapter = adapter;
    this.config = {
      autoSaveInterval: 2000,
      maxSnapshots: 10,
      enableAutoDecomposition: true,
      compressionThreshold: 1000,
      ...config
    };
  }

  /**
   * Create a new document with optional initial content
   */
  async createDocument(
    title: string,
    sourceSessionId?: string,
    initialContent?: SlateDescendant[]
  ): Promise<DocumentRecord> {
    const documentId = uuidv4();
    const now = Date.now();
    
    const document: DocumentRecord = {
      id: documentId,
      title,
      sourceSessionId,
      canvasContent: initialContent || [{ type: 'paragraph', children: [{ text: '' }] }],
      granularity: 'paragraph',
      isDirty: false,
      createdAt: now,
      lastModified: now,
      version: 1,
      blockCount: initialContent ? this.countBlocks(initialContent) : 0,
      refinementHistory: [],
      exportHistory: [],
      snapshots: []
    };

    // Save document
    await this.adapter.createDocument(document);

    // Decompose content into blocks if enabled
    if (this.config.enableAutoDecomposition && initialContent) {
      await this.decomposeContent(documentId, initialContent);
    }

    return document;
  }

  /**
   * Load a document with optional content reconstruction
   */
  async loadDocument(documentId: string, includeBlocks: boolean = false): Promise<DocumentRecord | null> {
    const document = await this.adapter.getDocument(documentId);
    if (!document) return null;

    if (includeBlocks) {
      // Reconstruct content from blocks if needed
      const blocks = await this.adapter.getCanvasBlocksByDocumentId(documentId);
      if (blocks.length > 0) {
        document.canvasContent = await this.reconstructContent(blocks);
      }
    }

    return document;
  }

  /**
   * Save document with automatic content decomposition
   */
  async saveDocument(
    documentId: string,
    updates: Partial<DocumentRecord>,
    content?: SlateDescendant[]
  ): Promise<DocumentRecord> {
    const existingDoc = await this.adapter.getDocument(documentId);
    if (!existingDoc) {
      throw new Error(`Document ${documentId} not found`);
    }

    const now = Date.now();
    const updatedDocument: DocumentRecord = {
      ...existingDoc,
      ...updates,
      lastModified: now,
      version: existingDoc.version + 1,
      isDirty: false
    };

    // Update content if provided
    if (content) {
      updatedDocument.canvasContent = content;
      updatedDocument.blockCount = this.countBlocks(content);

      // Decompose content into blocks
      if (this.config.enableAutoDecomposition) {
        await this.decomposeContent(documentId, content);
      }
    }

    // Create snapshot if significant changes
    if (this.shouldCreateSnapshot(existingDoc, updatedDocument)) {
      await this.createSnapshot(documentId, updatedDocument);
    }

    await this.adapter.updateDocument(documentId, updatedDocument);
    return updatedDocument;
  }

  /**
   * Delete document and all associated blocks and ghosts
   */
  async deleteDocument(documentId: string): Promise<void> {
    // Get all associated blocks and ghosts
    const [blocks, ghosts] = await Promise.all([
      this.adapter.getCanvasBlocksByDocumentId(documentId),
      this.adapter.getGhostsByDocumentId(documentId)
    ]);

    // Delete in transaction
    await this.adapter.transaction(async () => {
      // Delete blocks
      for (const block of blocks) {
        await this.adapter.deleteCanvasBlock(block.id);
      }

      // Delete ghosts
      for (const ghost of ghosts) {
        await this.adapter.deleteGhost(ghost.id);
      }

      // Delete document
      await this.adapter.deleteDocument(documentId);
    });
  }

  /**
   * Decompose Slate content into canvas blocks
   */
  private async decomposeContent(documentId: string, content: SlateDescendant[]): Promise<void> {
    // Clear existing blocks for this document
    const existingBlocks = await this.adapter.getCanvasBlocksByDocumentId(documentId);
    for (const block of existingBlocks) {
      await this.adapter.deleteCanvasBlock(block.id);
    }

    // Create new blocks
    const blocks: CanvasBlockRecord[] = [];
    let order = 0;

    for (const node of content) {
      const blockRecords = await this.nodeToBlocks(documentId, node, order);
      blocks.push(...blockRecords);
      order += blockRecords.length;
    }

    // Save all blocks
    for (const block of blocks) {
      await this.adapter.createCanvasBlock(block);
    }
  }

  /**
   * Convert a Slate node to canvas block records
   */
  private async nodeToBlocks(
    documentId: string,
    node: SlateDescendant,
    startOrder: number
  ): Promise<CanvasBlockRecord[]> {
    const blocks: CanvasBlockRecord[] = [];
    const now = Date.now();

    // Extract text content
    const text = this.extractText(node);
    
    // Create main block
    const block: CanvasBlockRecord = {
      id: node.id || uuidv4(),
      documentId,
      order: startOrder,
      nodeType: node.type,
      text,
      slateNode: node,
      provenance: node.provenance ? {
        sessionId: node.provenance.sessionId,
        aiTurnId: node.provenance.aiTurnId,
        providerId: node.provenance.providerId,
        responseType: node.provenance.responseType,
        responseIndex: node.provenance.responseIndex,
        textRange: node.provenance.textRange
      } : {
        sessionId: 'unknown',
        aiTurnId: 'unknown',
        providerId: 'manual',
        responseType: 'batch',
        responseIndex: 0
      },
      cachedSourceText: text,
      isOrphaned: false,
      createdAt: now,
      updatedAt: now
    };

    blocks.push(block);

    // Recursively process children if they exist
    if (node.children && Array.isArray(node.children)) {
      let childOrder = startOrder + 1;
      for (const child of node.children) {
        if (child.type && child.type !== 'text') {
          const childBlocks = await this.nodeToBlocks(documentId, child, childOrder);
          blocks.push(...childBlocks);
          childOrder += childBlocks.length;
        }
      }
    }

    return blocks;
  }

  /**
   * Reconstruct Slate content from canvas blocks
   */
  private async reconstructContent(blocks: CanvasBlockRecord[]): Promise<SlateDescendant[]> {
    const sortedBlocks = blocks.sort((a, b) => a.order - b.order);
    const content: SlateDescendant[] = [];

    for (const block of sortedBlocks) {
      // Use the stored Slate node with potential updates
      const node: SlateDescendant = {
        ...block.slateNode,
        id: block.id
      };

      // Update provenance if it exists
      if (block.provenance) {
        node.provenance = block.provenance;
      }

      content.push(node);
    }

    return content;
  }

  /**
   * Create a ghost from content
   */
  async createGhost(
    documentId: string,
    text: string,
    provenance: {
      sessionId: string;
      aiTurnId: string;
      providerId: string;
      responseType: 'batch' | 'synthesis' | 'ensemble' | 'hidden';
      responseIndex: number;
      textRange?: [number, number];
    }
  ): Promise<GhostRecord> {
    const ghostId = uuidv4();
    const now = Date.now();

    // Get current ghost count for ordering
    const existingGhosts = await this.adapter.getGhostsByDocumentId(documentId);
    const order = existingGhosts.length;

    const ghost: GhostRecord = {
      id: ghostId,
      documentId,
      text,
      preview: text.substring(0, 200),
      provenance,
      order,
      createdAt: now,
      isPinned: false
    };

    await this.adapter.createGhost(ghost);
    return ghost;
  }

  /**
   * Get all ghosts for a document
   */
  async getDocumentGhosts(documentId: string): Promise<GhostRecord[]> {
    const ghosts = await this.adapter.getGhostsByDocumentId(documentId);
    return ghosts.sort((a, b) => a.order - b.order);
  }

  /**
   * Create a document snapshot
   */
  async createSnapshot(documentId: string, document: DocumentRecord, label?: string): Promise<void> {
    const snapshot: DocumentSnapshot = {
      id: uuidv4(),
      timestamp: Date.now(),
      canvasContent: document.canvasContent,
      blockCount: document.blockCount,
      label
    };

    // Add to snapshots array
    const updatedSnapshots = [...document.snapshots, snapshot];

    // Limit snapshots
    if (updatedSnapshots.length > (this.config.maxSnapshots || 10)) {
      updatedSnapshots.shift(); // Remove oldest
    }

    await this.adapter.updateDocument(documentId, {
      ...document,
      snapshots: updatedSnapshots
    });
  }

  /**
   * Get document provenance information
   */
  async getDocumentProvenance(documentId: string): Promise<{
    sessions: SessionRecord[];
    turns: TurnRecord[];
    responses: ProviderResponseRecord[];
  }> {
    const blocks = await this.adapter.getCanvasBlocksByDocumentId(documentId);
    
    const sessionIds = new Set<string>();
    const turnIds = new Set<string>();
    const responseKeys = new Set<string>();

    // Collect unique identifiers
    for (const block of blocks) {
      if (block.provenance) {
        sessionIds.add(block.provenance.sessionId);
        turnIds.add(block.provenance.aiTurnId);
        responseKeys.add(`${block.provenance.aiTurnId}-${block.provenance.providerId}-${block.provenance.responseType}-${block.provenance.responseIndex}`);
      }
    }

    // Fetch related records
    const [sessions, turns, responses] = await Promise.all([
      Promise.all(Array.from(sessionIds).map(id => this.adapter.getSession(id))).then(results => 
        results.filter(Boolean) as SessionRecord[]
      ),
      Promise.all(Array.from(turnIds).map(id => this.adapter.getTurn(id))).then(results => 
        results.filter(Boolean) as TurnRecord[]
      ),
      this.getResponsesByKeys(Array.from(responseKeys))
    ]);

    return { sessions, turns, responses };
  }

  /**
   * Auto-save document with debouncing
   */
  enableAutoSave(documentId: string, getDocument: () => DocumentRecord): void {
    // Clear existing timer
    const existingTimer = this.autoSaveTimers.get(documentId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      try {
        const document = getDocument();
        if (document.isDirty) {
          await this.saveDocument(documentId, document);
        }
      } catch (error) {
        console.error(`Auto-save failed for document ${documentId}:`, error);
      } finally {
        this.autoSaveTimers.delete(documentId);
      }
    }, this.config.autoSaveInterval);

    this.autoSaveTimers.set(documentId, timer);
  }

  /**
   * Disable auto-save for a document
   */
  disableAutoSave(documentId: string): void {
    const timer = this.autoSaveTimers.get(documentId);
    if (timer) {
      clearTimeout(timer);
      this.autoSaveTimers.delete(documentId);
    }
  }

  // Helper methods

  private extractText(node: SlateDescendant): string {
    if (node.text !== undefined) {
      return node.text;
    }

    if (node.children && Array.isArray(node.children)) {
      return node.children.map(child => this.extractText(child)).join('');
    }

    return '';
  }

  private countBlocks(content: SlateDescendant[]): number {
    let count = 0;
    for (const node of content) {
      count++;
      if (node.children && Array.isArray(node.children)) {
        count += this.countBlocks(node.children.filter(child => child.type && child.type !== 'text'));
      }
    }
    return count;
  }

  private shouldCreateSnapshot(oldDoc: DocumentRecord, newDoc: DocumentRecord): boolean {
    // Create snapshot if significant content change or version milestone
    const contentChanged = JSON.stringify(oldDoc.canvasContent) !== JSON.stringify(newDoc.canvasContent);
    const versionMilestone = newDoc.version % 5 === 0;
    
    return contentChanged && (versionMilestone || newDoc.blockCount !== oldDoc.blockCount);
  }

  private async getResponsesByKeys(keys: string[]): Promise<ProviderResponseRecord[]> {
    const responses: ProviderResponseRecord[] = [];
    
    for (const key of keys) {
      const [aiTurnId, providerId, responseType, responseIndex] = key.split('-');
      try {
        const response = await this.adapter.getProviderResponseByCompoundKey(
          aiTurnId,
          providerId,
          responseType as any,
          parseInt(responseIndex)
        );
        if (response) {
          responses.push(response);
        }
      } catch (error) {
        console.warn(`Failed to fetch response for key ${key}:`, error);
      }
    }

    return responses;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    // Clear all auto-save timers
    for (const timer of this.autoSaveTimers.values()) {
      clearTimeout(timer);
    }
    this.autoSaveTimers.clear();
  }
}

/**
 * Factory function to create a document manager
 */
export function createDocumentManager(
  adapter: IPersistenceAdapter,
  config?: DocumentManagerConfig
): DocumentManager {
  return new DocumentManager(adapter, config);
}