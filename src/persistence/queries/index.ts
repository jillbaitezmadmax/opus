// Persistence Queries Index

export {
  ProvenanceQueries,
  type ProvenanceTrace,
  type SessionLineage,
  type CrossReference,
  type ActivityEntry
} from './ProvenanceQueries.js';

/**
 * Factory function to create provenance queries instance
 */
import type { RepositoryCollection } from '../repositories/index.js';

export function createProvenanceQueries(repositories: RepositoryCollection): ProvenanceQueries {
  return new ProvenanceQueries(repositories);
}