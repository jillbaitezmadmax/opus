// Repository Index - Exports all repository classes

export { BaseRepository } from '../BaseRepository.js';
export { SessionsRepository } from './SessionsRepository.js';
export { ThreadsRepository } from './ThreadsRepository.js';
export { TurnsRepository } from './TurnsRepository.js';
export { ProviderResponsesRepository } from './ProviderResponsesRepository.js';
export { DocumentsRepository } from './DocumentsRepository.js';
export { CanvasBlocksRepository } from './CanvasBlocksRepository.js';
export { GhostsRepository } from './GhostsRepository.js';
export { ProviderContextsRepository } from './ProviderContextsRepository.js';
export { MetadataRepository } from './MetadataRepository.js';

// Repository collection type for dependency injection
export interface RepositoryCollection {
  sessions: SessionsRepository;
  threads: ThreadsRepository;
  turns: TurnsRepository;
  providerResponses: ProviderResponsesRepository;
  documents: DocumentsRepository;
  canvasBlocks: CanvasBlocksRepository;
  ghosts: GhostsRepository;
  providerContexts: ProviderContextsRepository;
  metadata: MetadataRepository;
}

/**
 * Create all repositories from a database instance
 */
export function createRepositories(db: IDBDatabase): RepositoryCollection {
  return {
    sessions: new SessionsRepository(db),
    threads: new ThreadsRepository(db),
    turns: new TurnsRepository(db),
    providerResponses: new ProviderResponsesRepository(db),
    documents: new DocumentsRepository(db),
    canvasBlocks: new CanvasBlocksRepository(db),
    ghosts: new GhostsRepository(db),
    providerContexts: new ProviderContextsRepository(db),
    metadata: new MetadataRepository(db)
  };
}