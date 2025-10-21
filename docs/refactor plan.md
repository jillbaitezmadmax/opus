# Architectural Plan for Composer Mode & Document System

## Overview

The opus-deus Chrome extension is evolving from a multi-model chat interface into a comprehensive AI-powered document composition system. The architecture maintains a clear separation between chat-based exploration (Flow Mode) and document creation (Composer Mode), with seamless transitions between them. The core innovation is tracking provenance - maintaining the lineage of every piece of content from its AI source through to the final document.

## Current State Analysis

The extension already has a modular React architecture with:
- A functional multi-model chat system with provider-specific response blocks
- Basic Composer Mode scaffolding with split-pane layout and canvas editor
- Service worker backend capable of orchestrating complex workflows
- Existing copy functionality on chat outputs

The key architectural gap is the lack of persistent document storage and the incomplete implementation of the composition workflow that transforms raw AI outputs into refined documents.

## Core Architectural Principles

### 1. Provenance as First-Class Citizen
Every piece of content carries metadata about its origin - which model generated it, from which conversation turn, and what transformations it has undergone. This creates an audit trail from AI response to final document, enabling features like "show source" and contextual refinement.

### 2. Unified Data Model
A single authoritative representation of conversation turns serves both modes. Flow Mode writes turns, Composer Mode reads them. This prevents data duplication and ensures consistency. The turn object becomes the canonical source of truth, referenced by ID rather than copied.

### 3. Progressive Enhancement
Start with the simplest working implementation - drag and drop with basic provenance tracking - then layer on advanced features like the ghost panel and refinement with context. Each feature should be independently valuable.

## Major Architectural Components

### Document Persistence Layer
Move beyond ephemeral browser sessions to IndexedDB for robust document storage. This isn't just about saving work - it fundamentally changes the user mental model from "temporary workspace" to "document creation environment". Documents become first-class entities with:
- Unique identifiers enabling return visits
- Canvas content stored as structured JSON (Slate format) rather than raw HTML
- Provenance index mapping each block to its source
- Version snapshots for checkpoint restoration
- Ghost collections preserved across sessions

The persistence layer acts as a bridge between the transient chat experience and permanent document artifacts. When entering Composer Mode from a chat, the system creates or loads a document associated with that session.

### Enhanced Composer Mode Architecture
The Composer transforms from a simple editor into a sophisticated assembly environment:

**Split-Pane Layout**: The left source panel provides two views:
- Focus Pane: Full content of a selected conversation turn
- Navigation Timeline: Virtualized list of turn summaries for quick navigation

**Canvas as Assembly Space**: The right pane isn't just an editor but a provenance-aware assembly area where:
- Dropped content maintains links to its source
- Each block stores structured metadata alongside its content
- Refinement operations include source context automatically

**Drag-and-Drop Intelligence**: Different granularities (full response, paragraph, sentence) aren't just UI conveniences but semantic units that preserve meaning during composition. The drag payload includes both content and complete provenance metadata.

### Ghost Panel (Echo Rail)
This seemingly simple feature represents a paradigm shift in how users interact with AI outputs. Instead of linear consumption, users can:
- Collect interesting fragments across multiple turns without commitment
- Build a "palette" of options before composing
- Compare alternative phrasings side-by-side
- Maintain working memory across long conversations

Architecturally, ghosts are lightweight references (text snippet + provenance ID) stored in the document state, rendered in a persistent rail that survives navigation between turns.

### Refinement with Provenance Context
When refining selected text, the system doesn't just send the fragment to an AI model. It constructs a rich context including:
- The selected text
- The complete original AI response it came from
- The user's original prompt that generated it
- Metadata about which model produced it

This context enables the refiner model to understand not just what to refine but why it was generated, producing more coherent and purposeful improvements.

## Implementation Strategy

### Phase 1: Complete Core Loop
First, establish the fundamental compose-refine-save cycle:
1. Finish the drag-and-drop implementation with proper provenance tracking
2. Wire up the Refine button to call AI models with provenance context
3. Implement IndexedDB document persistence with auto-save
4. Ensure smooth transitions between Flow and Composer modes

### Phase 2: Enhanced Navigation and Collection
Build the tools for managing large amounts of AI-generated content:
1. Implement the Navigation Timeline with virtualized scrolling
2. Add the Focus Pane for detailed turn inspection  
3. Create the Ghost Panel for fragment collection
4. Implement "Show Source" to trace content origins

### Phase 3: Advanced Document Features
Layer on capabilities that differentiate this from a simple editor:
1. Version snapshots with restore capability
2. Provenance visualization (hover tooltips, source highlighting)
3. Multi-select refinement for batch operations
4. Export with optional provenance metadata

## Technical Implications

### State Management
The introduction of persistent documents requires careful state coordination:
- App-level state manages mode transitions and modal visibility
- Composer state handles active document, ghosts, and UI configuration
- Navigation state tracks focused turn and timeline position
- All state changes that affect documents trigger persistence operations

### Performance Considerations
With potentially hundreds of conversation turns and complex documents:
- Use React virtualization for the Navigation Timeline
- Implement lazy loading for turn content
- Debounce auto-save operations
- Store ghosts as references, not full content copies

### Error Handling Philosophy
Given the creative nature of document composition, data loss is catastrophic:
- Every user action that modifies content triggers a save
- Network failures queue operations for retry
- Model API failures fall back gracefully without losing context
- Corrupt provenance data doesn't break the entire document

## User Experience Implications

This architecture enables a fundamentally different workflow from traditional AI chat interfaces. Users can:
1. Explore ideas through multi-model conversations
2. Collect and organize the best outputs without losing context
3. Refine content with full awareness of its origins
4. Build documents that are traceable, reproducible, and defensible

The ghost panel and timeline create a "workspace" feeling where nothing is lost and everything can be referenced. The provenance system provides confidence that refined content maintains fidelity to original sources.

## Success Metrics

The architecture succeeds when:
- Users can return to a document days later and continue work
- Every piece of composed content can be traced to its source
- Refinement produces contextually appropriate improvements
- The system handles hundreds of turns without performance degradation
- No user work is lost due to technical failures

This architecture positions the extension not just as an AI chat interface but as a professional document creation environment where AI outputs are raw materials transformed into polished deliverables through human curation and AI-assisted refinement.