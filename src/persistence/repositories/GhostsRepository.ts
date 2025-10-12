// Ghosts Repository - Manages ghost records for temporal state tracking

import { BaseRepository } from '../BaseRepository.js';
import { GhostRecord } from '../types.js';

export class GhostsRepository extends BaseRepository<GhostRecord> {
  constructor(db: IDBDatabase) {
    super(db, 'Ghosts');
  }

  /**
   * Get ghosts by entity ID
   */
  async getByEntityId(entityId: string): Promise<GhostRecord[]> {
    const ghosts = await this.getByIndex('entityId', entityId);
    return ghosts.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get ghosts by entity type
   */
  async getByEntityType(entityType: string): Promise<GhostRecord[]> {
    return this.getByIndex('entityType', entityType);
  }

  /**
   * Get ghosts by session ID
   */
  async getBySessionId(sessionId: string): Promise<GhostRecord[]> {
    return this.getByIndex('sessionId', sessionId);
  }

  /**
   * Get ghosts by operation type
   */
  async getByOperation(operation: 'create' | 'update' | 'delete'): Promise<GhostRecord[]> {
    return this.getByIndex('operation', operation);
  }

  /**
   * Get ghosts within a time range
   */
  async getByTimeRange(startTime: Date, endTime: Date): Promise<GhostRecord[]> {
    const range = IDBKeyRange.bound(startTime.getTime(), endTime.getTime());
    return this.getByIndex('timestamp', range);
  }

  /**
   * Get latest ghost for an entity
   */
  async getLatestByEntityId(entityId: string): Promise<GhostRecord | null> {
    const ghosts = await this.getByEntityId(entityId);
    return ghosts.length > 0 ? ghosts[0] : null;
  }

  /**
   * Get ghost at specific timestamp
   */
  async getAtTimestamp(entityId: string, timestamp: number): Promise<GhostRecord | null> {
    const ghosts = await this.getByEntityId(entityId);
    
    // Find the ghost that was active at the given timestamp
    return ghosts.find(ghost => ghost.timestamp <= timestamp) || null;
  }

  /**
   * Get entity history (all ghosts for an entity)
   */
  async getEntityHistory(entityId: string): Promise<GhostRecord[]> {
    return this.getByEntityId(entityId);
  }

  /**
   * Get entity state at specific point in time
   */
  async getEntityStateAt(entityId: string, timestamp: number): Promise<any | null> {
    const ghost = await this.getAtTimestamp(entityId, timestamp);
    return ghost ? ghost.state : null;
  }

  /**
   * Create ghost snapshot
   */
  async createSnapshot(
    entityId: string,
    entityType: string,
    sessionId: string,
    operation: 'create' | 'update' | 'delete',
    state: any,
    metadata?: Record<string, any>
  ): Promise<GhostRecord> {
    const ghost: GhostRecord = {
      id: crypto.randomUUID(),
      entityId,
      entityType,
      sessionId,
      operation,
      state,
      timestamp: Date.now(),
      metadata: metadata || {}
    };

    await this.add(ghost);
    return ghost;
  }

  /**
   * Get changes between two timestamps
   */
  async getChangesBetween(
    entityId: string,
    startTime: number,
    endTime: number
  ): Promise<GhostRecord[]> {
    const ghosts = await this.getByEntityId(entityId);
    
    return ghosts.filter(ghost => 
      ghost.timestamp >= startTime && ghost.timestamp <= endTime
    );
  }

  /**
   * Get recent activity for a session
   */
  async getRecentActivity(sessionId: string, limit: number = 50): Promise<GhostRecord[]> {
    const ghosts = await this.getBySessionId(sessionId);
    return ghosts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get activity statistics for a session
   */
  async getSessionActivityStats(sessionId: string): Promise<{
    total: number;
    byOperation: Record<string, number>;
    byEntityType: Record<string, number>;
    timeRange: { start: number; end: number } | null;
    entitiesModified: number;
  }> {
    const ghosts = await this.getBySessionId(sessionId);
    
    const stats = {
      total: ghosts.length,
      byOperation: {} as Record<string, number>,
      byEntityType: {} as Record<string, number>,
      timeRange: null as { start: number; end: number } | null,
      entitiesModified: 0
    };

    if (ghosts.length === 0) {
      return stats;
    }

    const timestamps = ghosts.map(g => g.timestamp);
    stats.timeRange = {
      start: Math.min(...timestamps),
      end: Math.max(...timestamps)
    };

    const uniqueEntities = new Set<string>();

    ghosts.forEach(ghost => {
      stats.byOperation[ghost.operation] = (stats.byOperation[ghost.operation] || 0) + 1;
      stats.byEntityType[ghost.entityType] = (stats.byEntityType[ghost.entityType] || 0) + 1;
      uniqueEntities.add(ghost.entityId);
    });

    stats.entitiesModified = uniqueEntities.size;

    return stats;
  }

  /**
   * Restore entity to previous state
   */
  async restoreEntityTo(entityId: string, timestamp: number): Promise<any | null> {
    const targetGhost = await this.getAtTimestamp(entityId, timestamp);
    
    if (!targetGhost) {
      return null;
    }

    // Create a new ghost record for the restoration
    await this.createSnapshot(
      entityId,
      targetGhost.entityType,
      targetGhost.sessionId,
      'update',
      targetGhost.state,
      {
        restoredFrom: targetGhost.id,
        restoredAt: Date.now(),
        originalTimestamp: targetGhost.timestamp
      }
    );

    return targetGhost.state;
  }

  /**
   * Get diff between two ghost states
   */
  async getDiff(ghostId1: string, ghostId2: string): Promise<{
    ghost1: GhostRecord | null;
    ghost2: GhostRecord | null;
    changes: any;
  }> {
    const [ghost1, ghost2] = await Promise.all([
      this.get(ghostId1),
      this.get(ghostId2)
    ]);

    const changes = this.calculateStateDiff(
      ghost1?.state || {},
      ghost2?.state || {}
    );

    return { ghost1, ghost2, changes };
  }

  /**
   * Calculate differences between two states
   */
  private calculateStateDiff(state1: any, state2: any): any {
    const changes: any = {};

    // Simple diff implementation - can be enhanced with more sophisticated diffing
    const keys = new Set([...Object.keys(state1 || {}), ...Object.keys(state2 || {})]);

    for (const key of keys) {
      const val1 = state1?.[key];
      const val2 = state2?.[key];

      if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        changes[key] = {
          from: val1,
          to: val2
        };
      }
    }

    return changes;
  }

  /**
   * Clean up old ghosts
   */
  async cleanupOldGhosts(olderThanDays: number = 90, keepMinimum: number = 5): Promise<number> {
    const cutoffDate = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    
    // Get all entities that have ghosts
    const allGhosts = await this.getAll();
    const entitiesByType = new Map<string, GhostRecord[]>();

    allGhosts.forEach(ghost => {
      const key = `${ghost.entityType}:${ghost.entityId}`;
      if (!entitiesByType.has(key)) {
        entitiesByType.set(key, []);
      }
      entitiesByType.get(key)!.push(ghost);
    });

    let deletedCount = 0;

    // For each entity, keep minimum number of recent ghosts
    for (const [entityKey, ghosts] of entitiesByType) {
      const sortedGhosts = ghosts.sort((a, b) => b.timestamp - a.timestamp);
      const toDelete = sortedGhosts
        .slice(keepMinimum) // Keep minimum recent ghosts
        .filter(ghost => ghost.timestamp < cutoffDate);

      if (toDelete.length > 0) {
        const ids = toDelete.map(ghost => ghost.id);
        await this.deleteMany(ids);
        deletedCount += toDelete.length;
      }
    }

    return deletedCount;
  }

  /**
   * Get ghost timeline for multiple entities
   */
  async getTimeline(
    entityIds: string[],
    startTime?: number,
    endTime?: number
  ): Promise<GhostRecord[]> {
    const allGhosts: GhostRecord[] = [];

    for (const entityId of entityIds) {
      const entityGhosts = await this.getByEntityId(entityId);
      allGhosts.push(...entityGhosts);
    }

    let filteredGhosts = allGhosts;

    if (startTime !== undefined) {
      filteredGhosts = filteredGhosts.filter(ghost => ghost.timestamp >= startTime);
    }

    if (endTime !== undefined) {
      filteredGhosts = filteredGhosts.filter(ghost => ghost.timestamp <= endTime);
    }

    return filteredGhosts.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get entities modified in time range
   */
  async getModifiedEntities(
    startTime: number,
    endTime: number,
    entityType?: string
  ): Promise<string[]> {
    let ghosts = await this.getByTimeRange(new Date(startTime), new Date(endTime));

    if (entityType) {
      ghosts = ghosts.filter(ghost => ghost.entityType === entityType);
    }

    const entityIds = new Set(ghosts.map(ghost => ghost.entityId));
    return Array.from(entityIds);
  }

  /**
   * Update ghost metadata
   */
  async updateMetadata(ghostId: string, metadata: Record<string, any>): Promise<void> {
    const ghost = await this.get(ghostId);
    if (ghost) {
      ghost.metadata = { ...ghost.metadata, ...metadata };
      await this.put(ghost);
    }
  }

  /**
   * Get ghost statistics by entity type
   */
  async getStatsByEntityType(): Promise<Record<string, {
    total: number;
    byOperation: Record<string, number>;
    oldestTimestamp: number;
    newestTimestamp: number;
  }>> {
    const allGhosts = await this.getAll();
    const stats: Record<string, any> = {};

    allGhosts.forEach(ghost => {
      if (!stats[ghost.entityType]) {
        stats[ghost.entityType] = {
          total: 0,
          byOperation: {},
          oldestTimestamp: ghost.timestamp,
          newestTimestamp: ghost.timestamp
        };
      }

      const entityStats = stats[ghost.entityType];
      entityStats.total++;
      entityStats.byOperation[ghost.operation] = (entityStats.byOperation[ghost.operation] || 0) + 1;
      entityStats.oldestTimestamp = Math.min(entityStats.oldestTimestamp, ghost.timestamp);
      entityStats.newestTimestamp = Math.max(entityStats.newestTimestamp, ghost.timestamp);
    });

    return stats;
  }
}