// Provenance Query Helpers - Complex cross-store queries for data lineage and relationships

import type { RepositoryCollection } from '../repositories/index.js';
import type {
  SessionRecord,
  ThreadRecord,
  TurnRecord,
  ProviderResponseRecord,
  DocumentRecord,
  CanvasBlockRecord,
  GhostRecord,
  ProviderContextRecord,
  MetadataRecord
} from '../types.js';

/**
 * Provenance trace result containing the full lineage of an entity
 */
export interface ProvenanceTrace {
  /** Root entity being traced */
  entity: {
    id: string;
    type: string;
    data: any;
  };
  /** Parent entities in the hierarchy */
  parents: Array<{
    id: string;
    type: string;
    relationship: string;
    data: any;
  }>;
  /** Child entities in the hierarchy */
  children: Array<{
    id: string;
    type: string;
    relationship: string;
    data: any;
  }>;
  /** Related entities (siblings, references, etc.) */
  related: Array<{
    id: string;
    type: string;
    relationship: string;
    data: any;
  }>;
  /** Historical changes from ghosts */
  history: Array<{
    timestamp: number;
    operation: string;
    changes: any;
    metadata?: any;
  }>;
}

/**
 * Session lineage including all related entities
 */
export interface SessionLineage {
  session: SessionRecord;
  threads: ThreadRecord[];
  turns: TurnRecord[];
  providerResponses: ProviderResponseRecord[];
  documents: DocumentRecord[];
  canvasBlocks: CanvasBlockRecord[];
  providerContexts: ProviderContextRecord[];
  metadata: MetadataRecord[];
  totalEntities: number;
}

/**
 * Cross-reference result showing relationships between entities
 */
export interface CrossReference {
  sourceEntity: { id: string; type: string };
  targetEntity: { id: string; type: string };
  relationship: string;
  strength: number; // 0-1, how strong the relationship is
  metadata?: any;
}

/**
 * Activity timeline entry
 */
export interface ActivityEntry {
  timestamp: number;
  entityId: string;
  entityType: string;
  operation: string;
  userId?: string;
  sessionId?: string;
  threadId?: string;
  metadata?: any;
}

/**
 * Provenance query helper class
 */
export class ProvenanceQueries {
  constructor(private repositories: RepositoryCollection) {}

  /**
   * Get complete provenance trace for any entity
   */
  async getProvenanceTrace(entityId: string, entityType: string): Promise<ProvenanceTrace> {
    const trace: ProvenanceTrace = {
      entity: { id: entityId, type: entityType, data: null },
      parents: [],
      children: [],
      related: [],
      history: []
    };

    // Get the main entity
    trace.entity.data = await this.getEntityById(entityId, entityType);
    if (!trace.entity.data) {
      throw new Error(`Entity ${entityId} of type ${entityType} not found`);
    }

    // Get historical changes
    const ghosts = await this.repositories.ghosts.getByEntityId(entityId);
    trace.history = ghosts
      .filter(ghost => ghost.timestamp !== undefined && ghost.operation !== undefined)
      .map(ghost => ({
        timestamp: ghost.timestamp!,
        operation: ghost.operation!,
        changes: ghost.state,
        metadata: ghost.metadata
      })).sort((a, b) => b.timestamp - a.timestamp);

    // Build relationships based on entity type
    switch (entityType) {
      case 'session':
        await this.buildSessionProvenance(trace, trace.entity.data as SessionRecord);
        break;
      case 'thread':
        await this.buildThreadProvenance(trace, trace.entity.data as ThreadRecord);
        break;
      case 'turn':
        await this.buildTurnProvenance(trace, trace.entity.data as TurnRecord);
        break;
      case 'document':
        await this.buildDocumentProvenance(trace, trace.entity.data as DocumentRecord);
        break;
      case 'canvasBlock':
        await this.buildCanvasBlockProvenance(trace, trace.entity.data as CanvasBlockRecord);
        break;
      default:
        // Generic provenance for other types
        await this.buildGenericProvenance(trace, entityId, entityType);
    }

    return trace;
  }

  /**
   * Get complete session lineage with all related entities
   */
  async getSessionLineage(sessionId: string): Promise<SessionLineage> {
    const session = await this.repositories.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const [threads, documents, providerContexts, metadata] = await Promise.all([
      this.repositories.threads.getBySessionId(sessionId),
      this.repositories.documents.getBySessionId(sessionId),
      this.repositories.providerContexts.getBySessionId(sessionId),
      this.repositories.metadata.getByEntityId(sessionId)
    ]);

    // Get all turns for all threads
    const allTurns: TurnRecord[] = [];
    const allProviderResponses: ProviderResponseRecord[] = [];
    
    for (const thread of threads) {
      const threadTurns = await this.repositories.turns.getByThreadId(thread.id);
      allTurns.push(...threadTurns);
      
      for (const turn of threadTurns) {
        const responses = await this.repositories.providerResponses.getByTurnId(turn.id);
        allProviderResponses.push(...responses);
      }
    }

    // Get all canvas blocks for all documents
    const allCanvasBlocks: CanvasBlockRecord[] = [];
    for (const document of documents) {
      const blocks = await this.repositories.canvasBlocks.getByDocumentId(document.id);
      allCanvasBlocks.push(...blocks);
    }

    const totalEntities = 1 + threads.length + allTurns.length + allProviderResponses.length + 
                         documents.length + allCanvasBlocks.length + providerContexts.length + metadata.length;

    return {
      session,
      threads,
      turns: allTurns,
      providerResponses: allProviderResponses,
      documents,
      canvasBlocks: allCanvasBlocks,
      providerContexts,
      metadata,
      totalEntities
    };
  }

  /**
   * Find cross-references between entities
   */
  async findCrossReferences(entityId: string, entityType: string): Promise<CrossReference[]> {
    const references: CrossReference[] = [];

    // Find direct references in other entities
    switch (entityType) {
      case 'session':
        // Find threads, documents, contexts that reference this session
        const sessionRefs = await Promise.all([
          this.repositories.threads.getBySessionId(entityId),
          this.repositories.documents.getBySessionId(entityId),
          this.repositories.providerContexts.getBySessionId(entityId)
        ]);

        sessionRefs[0].forEach(thread => {
          references.push({
            sourceEntity: { id: entityId, type: 'session' },
            targetEntity: { id: thread.id, type: 'thread' },
            relationship: 'contains',
            strength: 1.0
          });
        });

        sessionRefs[1].forEach(doc => {
          references.push({
            sourceEntity: { id: entityId, type: 'session' },
            targetEntity: { id: doc.id, type: 'document' },
            relationship: 'contains',
            strength: 1.0
          });
        });

        sessionRefs[2].forEach(context => {
          references.push({
            sourceEntity: { id: entityId, type: 'session' },
            targetEntity: { id: context.id, type: 'providerContext' },
            relationship: 'uses',
            strength: 0.8
          });
        });
        break;

      case 'thread':
        // Find turns that belong to this thread
        const turns = await this.repositories.turns.getByThreadId(entityId);
        turns.forEach(turn => {
          references.push({
            sourceEntity: { id: entityId, type: 'thread' },
            targetEntity: { id: turn.id, type: 'turn' },
            relationship: 'contains',
            strength: 1.0
          });
        });
        break;

      case 'turn':
        // Find provider responses for this turn
        const responses = await this.repositories.providerResponses.getByTurnId(entityId);
        responses.forEach(response => {
          references.push({
            sourceEntity: { id: entityId, type: 'turn' },
            targetEntity: { id: response.id, type: 'providerResponse' },
            relationship: 'generates',
            strength: 1.0
          });
        });
        break;

      case 'document':
        // Find canvas blocks that belong to this document
        const blocks = await this.repositories.canvasBlocks.getByDocumentId(entityId);
        blocks.forEach(block => {
          references.push({
            sourceEntity: { id: entityId, type: 'document' },
            targetEntity: { id: block.id, type: 'canvasBlock' },
            relationship: 'contains',
            strength: 1.0
          });
        });
        break;
    }

    // Find metadata references
    const metadata = await this.repositories.metadata.getByEntityId(entityId);
    metadata.forEach(meta => {
      references.push({
        sourceEntity: { id: entityId, type: entityType },
        targetEntity: { id: meta.id, type: 'metadata' },
        relationship: 'hasMetadata',
        strength: 0.6
      });
    });

    return references;
  }

  /**
   * Get activity timeline for a session or user
   */
  async getActivityTimeline(
    filter: { sessionId?: string; userId?: string; threadId?: string },
    limit: number = 100
  ): Promise<ActivityEntry[]> {
    const activities: ActivityEntry[] = [];

    // Collect activities from ghosts (change history)
    let ghosts: GhostRecord[] = [];
    if (filter.sessionId) {
      ghosts = await this.repositories.ghosts.getBySessionId(filter.sessionId);
    } else if (filter.userId) {
      // Get recent sessions for the user and then get ghosts
      const recentSessions = await this.repositories.sessions.getRecentByUserId(filter.userId, 10);
      if (recentSessions.length > 0) {
        ghosts = await this.repositories.ghosts.getRecentActivity(recentSessions[0].id, limit * 2);
      }
    } else {
      // Get all sessions and pick the most recent one
      const allSessions = await this.repositories.sessions.getAll();
      const sortedSessions = allSessions.sort((a, b) => b.updatedAt - a.updatedAt);
      if (sortedSessions.length > 0) {
        ghosts = await this.repositories.ghosts.getRecentActivity(sortedSessions[0].id, limit * 2);
      }
    }

    // Convert ghosts to activity entries
    ghosts
      .filter(ghost => ghost.timestamp !== undefined && ghost.operation !== undefined && ghost.entityId !== undefined && ghost.entityType !== undefined)
      .forEach(ghost => {
        activities.push({
          timestamp: ghost.timestamp!,
          entityId: ghost.entityId!,
          entityType: ghost.entityType!,
          operation: ghost.operation!,
          sessionId: ghost.sessionId,
          metadata: ghost.metadata
        });
      });

    // Add creation activities from main entities
    if (filter.sessionId) {
      const [threads, turns, documents] = await Promise.all([
        this.repositories.threads.getBySessionId(filter.sessionId),
        this.repositories.turns.getBySessionId(filter.sessionId),
        this.repositories.documents.getBySessionId(filter.sessionId)
      ]);

      // Add thread creations
      threads.forEach(thread => {
        activities.push({
          timestamp: thread.createdAt,
          entityId: thread.id,
          entityType: 'thread',
          operation: 'create',
          sessionId: thread.sessionId
        });
      });

      // Add turn creations
      turns.forEach(turn => {
        activities.push({
          timestamp: turn.createdAt,
          entityId: turn.id,
          entityType: 'turn',
          operation: 'create',
          sessionId: turn.sessionId,
          threadId: turn.threadId
        });
      });

      // Add document creations
      documents.forEach(doc => {
        activities.push({
          timestamp: doc.createdAt,
          entityId: doc.id,
          entityType: 'document',
          operation: 'create',
          sessionId: doc.sessionId || doc.sourceSessionId || ''
        });
      });
    }

    // Sort by timestamp (newest first) and limit
    return activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Find orphaned entities (entities without proper parent relationships)
   */
  async findOrphanedEntities(): Promise<Array<{ id: string; type: string; reason: string }>> {
    const orphans: Array<{ id: string; type: string; reason: string }> = [];

    // Find threads without valid sessions
    const allThreads = await this.repositories.threads.getAll();
    for (const thread of allThreads) {
      const session = await this.repositories.sessions.get(thread.sessionId);
      if (!session) {
        orphans.push({
          id: thread.id,
          type: 'thread',
          reason: `References non-existent session ${thread.sessionId}`
        });
      }
    }

    // Find turns without valid threads
    const allTurns = await this.repositories.turns.getAll();
    for (const turn of allTurns) {
      const thread = await this.repositories.threads.get(turn.threadId);
      if (!thread) {
        orphans.push({
          id: turn.id,
          type: 'turn',
          reason: `References non-existent thread ${turn.threadId}`
        });
      }
    }

    // Find provider responses without valid turns
    const allResponses = await this.repositories.providerResponses.getAll();
    for (const response of allResponses) {
      const turn = await this.repositories.turns.get(response.aiTurnId);
      if (!turn) {
        orphans.push({
          id: response.id,
          type: 'providerResponse',
          reason: `References non-existent turn ${response.aiTurnId}`
        });
      }
    }

    // Find canvas blocks without valid documents
    const allBlocks = await this.repositories.canvasBlocks.getAll();
    for (const block of allBlocks) {
      const document = await this.repositories.documents.get(block.documentId);
      if (!document) {
        orphans.push({
          id: block.id,
          type: 'canvasBlock',
          reason: `References non-existent document ${block.documentId}`
        });
      }
    }

    return orphans;
  }

  /**
   * Get entity statistics and relationships summary
   */
  async getEntityStats(): Promise<Record<string, any>> {
    const [
      sessionCount,
      threadCount,
      turnCount,
      responseCount,
      documentCount,
      blockCount,
      ghostCount,
      contextCount,
      metadataCount
    ] = await Promise.all([
      this.repositories.sessions.count(),
      this.repositories.threads.count(),
      this.repositories.turns.count(),
      this.repositories.providerResponses.count(),
      this.repositories.documents.count(),
      this.repositories.canvasBlocks.count(),
      this.repositories.ghosts.count(),
      this.repositories.providerContexts.count(),
      this.repositories.metadata.count()
    ]);

    return {
      entities: {
        sessions: sessionCount,
        threads: threadCount,
        turns: turnCount,
        providerResponses: responseCount,
        documents: documentCount,
        canvasBlocks: blockCount,
        ghosts: ghostCount,
        providerContexts: contextCount,
        metadata: metadataCount,
        total: sessionCount + threadCount + turnCount + responseCount + 
               documentCount + blockCount + ghostCount + contextCount + metadataCount
      },
      relationships: {
        avgThreadsPerSession: threadCount / Math.max(sessionCount, 1),
        avgTurnsPerThread: turnCount / Math.max(threadCount, 1),
        avgResponsesPerTurn: responseCount / Math.max(turnCount, 1),
        avgBlocksPerDocument: blockCount / Math.max(documentCount, 1),
        avgMetadataPerEntity: metadataCount / Math.max(sessionCount + threadCount + turnCount + responseCount + documentCount + blockCount, 1)
      }
    };
  }

  // Private helper methods

  private async getEntityById(id: string, type: string): Promise<any> {
    switch (type) {
      case 'session': return this.repositories.sessions.get(id);
      case 'thread': return this.repositories.threads.get(id);
      case 'turn': return this.repositories.turns.get(id);
      case 'providerResponse': return this.repositories.providerResponses.get(id);
      case 'document': return this.repositories.documents.get(id);
      case 'canvasBlock': return this.repositories.canvasBlocks.get(id);
      case 'ghost': return this.repositories.ghosts.get(id);
      case 'providerContext': return this.repositories.providerContexts.get(id);
      case 'metadata': return this.repositories.metadata.get(id);
      default: return null;
    }
  }

  private async buildSessionProvenance(trace: ProvenanceTrace, session: SessionRecord): Promise<void> {
    // Children: threads, documents, contexts
    const [threads, documents, contexts] = await Promise.all([
      this.repositories.threads.getBySessionId(session.id),
      this.repositories.documents.getBySessionId(session.id),
      this.repositories.providerContexts.getBySessionId(session.id)
    ]);

    threads.forEach(thread => {
      trace.children.push({
        id: thread.id,
        type: 'thread',
        relationship: 'contains',
        data: thread
      });
    });

    documents.forEach(doc => {
      trace.children.push({
        id: doc.id,
        type: 'document',
        relationship: 'contains',
        data: doc
      });
    });

    contexts.forEach(context => {
      trace.children.push({
        id: context.id,
        type: 'providerContext',
        relationship: 'uses',
        data: context
      });
    });
  }

  private async buildThreadProvenance(trace: ProvenanceTrace, thread: ThreadRecord): Promise<void> {
    // Parent: session
    const session = await this.repositories.sessions.get(thread.sessionId);
    if (session) {
      trace.parents.push({
        id: session.id,
        type: 'session',
        relationship: 'belongsTo',
        data: session
      });
    }

    // Children: turns
    const turns = await this.repositories.turns.getByThreadId(thread.id);
    turns.forEach(turn => {
      trace.children.push({
        id: turn.id,
        type: 'turn',
        relationship: 'contains',
        data: turn
      });
    });
  }

  private async buildTurnProvenance(trace: ProvenanceTrace, turn: TurnRecord): Promise<void> {
    // Parent: thread
    const thread = await this.repositories.threads.get(turn.threadId);
    if (thread) {
      trace.parents.push({
        id: thread.id,
        type: 'thread',
        relationship: 'belongsTo',
        data: thread
      });

      // Grandparent: session
      const session = await this.repositories.sessions.get(thread.sessionId);
      if (session) {
        trace.parents.push({
          id: session.id,
          type: 'session',
          relationship: 'belongsTo',
          data: session
        });
      }
    }

    // Children: provider responses
    const responses = await this.repositories.providerResponses.getByTurnId(turn.id);
    responses.forEach(response => {
      trace.children.push({
        id: response.id,
        type: 'providerResponse',
        relationship: 'generates',
        data: response
      });
    });
  }

  private async buildDocumentProvenance(trace: ProvenanceTrace, document: DocumentRecord): Promise<void> {
    // Parent: session
    const sessionId = document.sessionId || document.sourceSessionId;
    if (sessionId) {
      const session = await this.repositories.sessions.get(sessionId);
      if (session) {
        trace.parents.push({
          id: session.id,
          type: 'session',
          relationship: 'belongsTo',
          data: session
        });
      }
    }

    // Children: canvas blocks
    const blocks = await this.repositories.canvasBlocks.getByDocumentId(document.id);
    blocks.forEach(block => {
      trace.children.push({
        id: block.id,
        type: 'canvasBlock',
        relationship: 'contains',
        data: block
      });
    });
  }

  private async buildCanvasBlockProvenance(trace: ProvenanceTrace, block: CanvasBlockRecord): Promise<void> {
    // Parent: document
    const document = await this.repositories.documents.get(block.documentId);
    if (document) {
      trace.parents.push({
        id: document.id,
        type: 'document',
        relationship: 'belongsTo',
        data: document
      });

      // Grandparent: session
      const sessionId = document.sessionId || document.sourceSessionId;
    if (sessionId) {
      const session = await this.repositories.sessions.get(sessionId);
      if (session) {
        trace.parents.push({
          id: session.id,
          type: 'session',
          relationship: 'belongsTo',
          data: session
        });
      }
      }
    }

    // Parent block (if hierarchical)
    if (block.parentId) {
      const parentBlock = await this.repositories.canvasBlocks.get(block.parentId);
      if (parentBlock) {
        trace.parents.push({
          id: parentBlock.id,
          type: 'canvasBlock',
          relationship: 'childOf',
          data: parentBlock
        });
      }
    }

    // Child blocks
    const childBlocks = await this.repositories.canvasBlocks.getByParentId(block.id);
    childBlocks.forEach(child => {
      trace.children.push({
        id: child.id,
        type: 'canvasBlock',
        relationship: 'contains',
        data: child
      });
    });
  }

  private async buildGenericProvenance(trace: ProvenanceTrace, entityId: string, entityType: string): Promise<void> {
    // Find metadata for this entity
    const metadata = await this.repositories.metadata.getByEntityId(entityId);
    metadata.forEach(meta => {
      trace.related.push({
        id: meta.id,
        type: 'metadata',
        relationship: 'hasMetadata',
        data: meta
      });
    });
  }
}