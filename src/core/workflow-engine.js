// src/core/workflow-engine.js - FIXED VERSION

// =============================================================================
// HELPER FUNCTIONS FOR PROMPT BUILDING
// =============================================================================

function buildSynthesisPrompt(originalPrompt, sourceResults, synthesisProvider) {
  const otherResults = sourceResults
    .map(res => `**${(res.providerId || 'UNKNOWN').toUpperCase()}:**\n${String(res.text)}`)
    .join('\n\n');

  return `You are tasked with synthesizing multiple AI responses into a single, comprehensive answer.

**Original User Query:**
${originalPrompt}

**Responses from other AI models:**
${otherResults}

**Instructions:**
- Synthesize the above responses into a single, well-structured answer
- Identify common themes and reconcile any contradictions
- Provide the most accurate and helpful response possible
- Do not simply concatenate the responses - create a cohesive synthesis
- If the responses disagree, explain the different perspectives and provide your best judgment
- Maintain a natural, conversational tone

Please provide your synthesized response:`;
}

function buildEnsemblerPrompt(userPrompt, sourceResults) {
  const modelOutputsBlock = sourceResults
    .map(res => `=== ${String(res.providerId).toUpperCase()} ===\n${String(res.text)}`)
    .join('\n\n');

  return `You are not a synthesizer. You are a mirror that reveals what others cannot see.

Task: Present ALL insights from the models below in their most useful form for decision-making on "${userPrompt}".

Critical instruction: Do NOT synthesize into a single answer. Instead, reason internally via this structure—then output ONLY as seamless, narrative prose that implicitly embeds it all:

**Map the landscape** — Group similar ideas, preserving tensions and contradictions.
**Surface the invisible** — Highlight consensus (2+ models), unique sightings (one model) as natural flow.
**Frame the choices** — present alternatives as "If you prioritize X, this path fits because Y."
**Flag the unknowns** — Note disagreements/uncertainties as subtle cautions.

**Internal format for reasoning (NEVER output directly):**
- What Everyone Sees (consensus)
- The Tensions (disagreements)
- The Unique Insights
- The Choice Framework
- Confidence Check

Finally output your response as a narrative explaining everything implicitly to the user, like a natural response to the user's prompt—fluid, insightful, redacting model names/extraneous details. Build feedback as emergent wisdom—evoke clarity, agency, and subtle awe. Weave your final narrative as representation of a cohesive response of the collective thought to the user's prompt:

User Prompt: ${String(userPrompt || '')}

Model outputs to analyze:
${modelOutputsBlock}`;
}

// Track last seen text per provider/session for delta streaming
const lastStreamState = new Map();

function makeDelta(sessionId, providerId, fullText = "") {
  if (!sessionId) return fullText || "";
  const key = `${sessionId}:${providerId}`;
  const prev = lastStreamState.get(key) || "";
  let delta = "";

  if (fullText && fullText.length > prev.length) {
    delta = fullText.slice(prev.length);
  } else if (fullText && fullText !== prev) {
    delta = fullText;
  }

  lastStreamState.set(key, fullText || "");
  return delta;
}

// =============================================================================
// WORKFLOW ENGINE - FIXED
// =============================================================================

export class WorkflowEngine {
  constructor(orchestrator, sessionManager, port) {
    this.orchestrator = orchestrator;
    this.sessionManager = sessionManager;
    this.port = port;
  }

  async execute(request) {
    const { context, steps } = request;
    const stepResults = new Map();
    // In-memory per-workflow cache of provider contexts created by batch steps
    const workflowContexts = {};

    // Cache current user message for persistence usage
    this.currentUserMessage = context?.userMessage || this.currentUserMessage || '';

    // Ensure session exists and notify UI
    // If the compiler explicitly asked for backend-created session ids
    // (it sets context.sessionCreated), the compiler already generated the
    // sessionId and we must notify the UI immediately so it can bind the
    // optimistic user/ai turns that were created without an id.
    if (context.sessionCreated) {
      this.port.postMessage({ type: 'SESSION_STARTED', sessionId: context.sessionId });
    } else if (!context.sessionId || context.sessionId === 'new-session') {
      // Backwards-compatible fallback: generate an id and notify.
      context.sessionId = `sid-${Date.now()}`;
      this.port.postMessage({ type: 'SESSION_STARTED', sessionId: context.sessionId });
    }

    try {
      const promptSteps = steps.filter(step => step.type === 'prompt');
    const synthesisSteps = steps.filter(step => step.type === 'synthesis');
    const ensembleSteps = steps.filter(step => step.type === 'ensemble');

        // 1. Execute all batch prompt steps first, as they are dependencies.
    for (const step of promptSteps) {
        try {
            const result = await this.executePromptStep(step, context);
            stepResults.set(step.stepId, { status: 'completed', result });
            this.port.postMessage({ type: 'WORKFLOW_STEP_UPDATE', sessionId: context.sessionId, stepId: step.stepId, status: 'completed', result });

            // Cache provider contexts from this batch step into workflowContexts so
            // subsequent synthesis/ensemble steps in the same workflow can continue
            // the freshly-created conversations immediately.
            try {
              const resultsObj = result && result.results ? result.results : {};
              Object.entries(resultsObj).forEach(([pid, data]) => {
                if (data && data.meta && Object.keys(data.meta).length > 0) {
                  workflowContexts[pid] = data.meta;
                  console.log(`[WorkflowEngine] Cached context for ${pid}: ${Object.keys(data.meta).join(',')}`);
                }
              });
            } catch (e) { /* best-effort logging */ }
        } catch (error) {
            console.error(`[WorkflowEngine] Prompt step ${step.stepId} failed:`, error);
            stepResults.set(step.stepId, { status: 'failed', error: error.message });
            this.port.postMessage({ type: 'WORKFLOW_STEP_UPDATE', sessionId: context.sessionId, stepId: step.stepId, status: 'failed', error: error.message });
                // If the main prompt fails, the entire workflow cannot proceed.
                this.port.postMessage({ type: 'WORKFLOW_COMPLETE', sessionId: context.sessionId, workflowId: request.workflowId, finalResults: Object.fromEntries(stepResults) });
                return; // Exit early
        }
    }

        // 2. Now, execute synthesis and ensemble steps in parallel.
    const parallelSteps = [...synthesisSteps, ...ensembleSteps];
    if (parallelSteps.length > 0) {
        const parallelPromises = parallelSteps.map(async (step) => {
            try {
                 let result;
                 switch (step.type) {
                     case 'synthesis':
                         result = await this.executeSynthesisStep(step, context, stepResults, workflowContexts);
                         break;
                     case 'ensemble':
                         result = await this.executeEnsembleStep(step, context, stepResults, workflowContexts);
                         break;
                 }
                 stepResults.set(step.stepId, { status: 'completed', result });
                 this.port.postMessage({ type: 'WORKFLOW_STEP_UPDATE', sessionId: context.sessionId, stepId: step.stepId, status: 'completed', result });
             } catch (error) {
                console.error(`[WorkflowEngine] Parallel step ${step.stepId} failed:`, error);
                stepResults.set(step.stepId, { status: 'failed', error: error.message });
                this.port.postMessage({ type: 'WORKFLOW_STEP_UPDATE', sessionId: context.sessionId, stepId: step.stepId, status: 'failed', error: error.message });
                    // Do not throw; allow other parallel steps to continue.
            }
        });

            // Wait for all parallel steps to finish, regardless of success or failure.
        await Promise.allSettled(parallelPromises);
    }
    
        // 3. Signal completion.
    this.port.postMessage({ type: 'WORKFLOW_COMPLETE', sessionId: context.sessionId, workflowId: request.workflowId, finalResults: Object.fromEntries(stepResults) });
    // Persist the completed turn if applicable
    try { this._persistCompletedTurn(context, steps, stepResults); } catch (e) { console.warn('[WorkflowEngine] Persist turn failed:', e); }
        
} catch (error) {
        console.error(`[WorkflowEngine] Critical workflow execution error:`, error);
        this.port.postMessage({ type: 'WORKFLOW_COMPLETE', sessionId: context.sessionId, workflowId: request.workflowId, error: 'A critical error occurred.' });
}
  }

  /**
   * Persist a completed user/ai turn pair to the SessionManager.
   * Skips persistence for historical reruns (targetUserTurnId present).
   */
  _persistCompletedTurn(context, steps, stepResults) {
    // Skip persistence for historical reruns
    if (context?.targetUserTurnId) return;

    const userMessage = context?.userMessage || this.currentUserMessage || '';
    if (!userMessage) return; // No content to persist

    // Build UserTurn
    const timestamp = Date.now();
    const userTurnId = this._generateId('user');
    const userTurn = {
      type: 'user',
      id: userTurnId,
      text: userMessage,
      createdAt: timestamp
    };

    // Collect AI results
    const batchResponses = {};
    const synthesisResponses = {};
    const ensembleResponses = {};

    const stepById = new Map((steps || []).map(s => [s.stepId, s]));
    stepResults.forEach((value, stepId) => {
      const step = stepById.get(stepId);
      if (!step || value?.status !== 'completed') return;
      const result = value.result;
      switch (step.type) {
        case 'prompt': {
          const resultsObj = result?.results || {};
          Object.entries(resultsObj).forEach(([providerId, r]) => {
            batchResponses[providerId] = {
              providerId,
              text: r.text || '',
              status: r.status || 'completed',
              meta: r.meta || {}
            };
          });
          break;
        }
        case 'synthesis': {
          const providerId = result?.providerId;
          if (!providerId) return;
          const entry = {
            providerId,
            text: result?.text || '',
            status: result?.status || 'completed',
            meta: result?.meta || {}
          };
          if (!synthesisResponses[providerId]) synthesisResponses[providerId] = [];
          synthesisResponses[providerId].push(entry);
          break;
        }
        case 'ensemble': {
          const providerId = result?.providerId;
          if (!providerId) return;
          const entry = {
            providerId,
            text: result?.text || '',
            status: result?.status || 'completed',
            meta: result?.meta || {}
          };
          if (!ensembleResponses[providerId]) ensembleResponses[providerId] = [];
          ensembleResponses[providerId].push(entry);
          break;
        }
      }
    });

    const hasData = Object.keys(batchResponses).length > 0 || Object.keys(synthesisResponses).length > 0 || Object.keys(ensembleResponses).length > 0;
    if (!hasData) return; // Nothing to persist

    // Build AiTurn
    const aiTurn = {
      type: 'ai',
      id: this._generateId('ai'),
      createdAt: Date.now(),
      userTurnId: userTurn.id,
      batchResponses,
      synthesisResponses,
      ensembleResponses
    };

    this.sessionManager.saveTurn(context.sessionId, userTurn, aiTurn);
  }

  _generateId(prefix = 'turn') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ==========================================================================
  // STEP EXECUTORS - FIXED
  // ==========================================================================

  /**
   * Execute prompt step - FIXED to return proper format
   */
  async executePromptStep(step, context) {
    const { prompt, providers, useThinking, providerContexts } = step.payload;
    
    return new Promise((resolve, reject) => {
      this.orchestrator.executeParallelFanout(prompt, providers, {
        sessionId: context.sessionId,
        useThinking,
        providerContexts,
        onPartial: (providerId, chunk) => {
          console.log(`[Engine] onPartial RAW:`, providerId, typeof chunk, chunk);
          const delta = makeDelta(context.sessionId, providerId, chunk.text);
          this.port.postMessage({ 
            type: 'PARTIAL_RESULT', 
            sessionId: context.sessionId, 
            stepId: step.stepId, 
            providerId, 
            chunk: { text: delta } 
          });
          console.log(`[Engine] Sending PARTIAL_RESULT:`, { stepId: step.stepId, providerId, deltaLength: delta.length });
        },
        onAllComplete: (results, errors) => {
          // Save contexts
          results.forEach((res, pid) => {
            this.sessionManager.updateProviderContext(
              context.sessionId, 
              pid, 
              res, 
              true, 
              { skipSave: true }
            );
          });
          this.sessionManager.saveSession(context.sessionId);

          // Convert Map to proper format for next steps
          const formattedResults = {};
          results.forEach((result, providerId) => {
            formattedResults[providerId] = {
              providerId: providerId,
              text: result.text || '', // ✅ Extract text explicitly
              status: result.status || 'completed',
              meta: result.meta || {}
            };
          });

          // Check if any provider actually succeeded
          const hasValidResults = Object.values(formattedResults).some(
            r => r.status === 'completed' && r.text && r.text.trim().length > 0
          );

          if (!hasValidResults) {
            reject(new Error('All providers failed or returned empty responses'));
            return;
          }

          resolve({ 
            results: formattedResults,
            errors: errors ? Object.fromEntries(errors) : {}
          });
        }
      });
    });
  }

  /**
   * Resolve source data - FIXED to handle new format
   */
  async resolveSourceData(payload, context, previousResults) {
    if (payload.sourceHistorical) {
      // Historical source
      const { turnId: userTurnId, responseType } = payload.sourceHistorical;
      console.log(`[WorkflowEngine] Resolving historical data from turn: ${userTurnId}`);
      
      const session = this.sessionManager.sessions[context.sessionId];
      if (!session) throw new Error(`Session ${context.sessionId} not found.`);

      // Find the AI turn that FOLLOWS the user turn
      const userTurnIndex = session.turns.findIndex(t => t.id === userTurnId && t.type === 'user');
      if (userTurnIndex === -1) throw new Error(`Historical user turn ${userTurnId} not found.`);
      
      const aiTurn = session.turns[userTurnIndex + 1];
      if (!aiTurn || aiTurn.type !== 'ai') {
        throw new Error(`Could not find corresponding AI turn for ${userTurnId}`);
      }
      
      let sourceContainer;
      switch(responseType) {
        case 'synthesis': 
          sourceContainer = aiTurn.synthesisResponses || {}; 
          break;
        case 'ensemble': 
          sourceContainer = aiTurn.ensembleResponses || {}; 
          break;
        default: 
          sourceContainer = aiTurn.batchResponses || {}; 
          break;
      }
      
      // Convert to array format
      const sourceArray = Object.values(sourceContainer)
        .flat()
        .filter(res => res.status === 'completed' && res.text && res.text.trim().length > 0)
        .map(res => ({
          providerId: res.providerId,
          text: res.text
        }));

      console.log(`[WorkflowEngine] Found ${sourceArray.length} historical sources`);
      return sourceArray;

    } else if (payload.sourceStepIds) {
      // Current workflow source
      const sourceArray = [];
      
      for (const stepId of payload.sourceStepIds) {
        const stepResult = previousResults.get(stepId);
        
        if (!stepResult || stepResult.status !== 'completed') {
          console.warn(`[WorkflowEngine] Step ${stepId} not found or incomplete`);
          continue;
        }

        const { results } = stepResult.result;
        
        // Results is now an object: { claude: {...}, gemini: {...} }
        Object.entries(results).forEach(([providerId, result]) => {
          if (result.status === 'completed' && result.text && result.text.trim().length > 0) {
            sourceArray.push({
              providerId: providerId,
              text: result.text
            });
          }
        });
      }

      console.log(`[WorkflowEngine] Found ${sourceArray.length} current workflow sources`);
      return sourceArray;
    }
    
    throw new Error('No valid source specified for step.');
  }

  /**
   * Execute synthesis step - FIXED error messages
   */
  async executeSynthesisStep(step, context, previousResults, workflowContexts = {}) {
    const payload = step.payload;
    const sourceData = await this.resolveSourceData(payload, context, previousResults);
    
    if (sourceData.length === 0) {
      throw new Error("No valid sources for synthesis. All providers returned empty or failed responses.");
    }

    console.log(`[WorkflowEngine] Running synthesis with ${sourceData.length} sources:`, 
      sourceData.map(s => s.providerId).join(', '));

    const synthPrompt = buildSynthesisPrompt(
      payload.originalPrompt, 
      sourceData, 
      payload.synthesisProvider
    );

    // Build providerContexts from workflowContexts (preferred) or fallback to
    // continueFromBatchStep for backwards compatibility.
    const providerContexts = {};
    if (workflowContexts && workflowContexts[payload.synthesisProvider]) {
      providerContexts[payload.synthesisProvider] = {
        meta: workflowContexts[payload.synthesisProvider],
        continueThread: true
      };
      console.log(`[WorkflowEngine] Synthesis using workflow-cached context for ${payload.synthesisProvider}: ${Object.keys(workflowContexts[payload.synthesisProvider]).join(',')}`);
    } else if (payload.continueFromBatchStep) {
      const batchResult = previousResults.get(payload.continueFromBatchStep);
      if (batchResult?.status === 'completed' && batchResult.result?.results) {
        const synthProviderResult = batchResult.result.results[payload.synthesisProvider];
        if (synthProviderResult?.meta) {
          providerContexts[payload.synthesisProvider] = {
            meta: synthProviderResult.meta,
            continueThread: true
          };
          console.log(`[WorkflowEngine] Synthesis continuing conversation for ${payload.synthesisProvider} via batch step`);
        }
      }
    }

    return new Promise((resolve, reject) => {
      this.orchestrator.executeParallelFanout(synthPrompt, [payload.synthesisProvider], {
        sessionId: context.sessionId,
        useThinking: payload.useThinking,
        providerContexts: Object.keys(providerContexts).length ? providerContexts : undefined,
        onPartial: (providerId, chunk) => {
          console.log(`[Engine] onPartial RAW:`, providerId, typeof chunk, chunk);
          const delta = makeDelta(context.sessionId, providerId, chunk.text);
          this.port.postMessage({ 
            type: 'PARTIAL_RESULT', 
            sessionId: context.sessionId, 
            stepId: step.stepId, 
            providerId, 
            chunk: { text: delta } 
          });
          console.log(`[Engine] Sending PARTIAL_RESULT:`, { stepId: step.stepId, providerId, deltaLength: delta.length });
        },
        onAllComplete: (results) => {
          const finalResult = results.get(payload.synthesisProvider);
          
          if (!finalResult || !finalResult.text) {
            reject(new Error(`Synthesis provider ${payload.synthesisProvider} returned empty response`));
            return;
          }

          this.sessionManager.updateProviderContext(
            context.sessionId, 
            payload.synthesisProvider, 
            finalResult, 
            true, 
            { skipSave: true }
          );
          this.sessionManager.saveSession(context.sessionId);
          
          resolve({
            providerId: payload.synthesisProvider,
            text: finalResult.text, // ✅ Return text explicitly
            status: 'completed',
            meta: finalResult.meta || {}
          });
        }
      });
    });
  }

  /**
   * Execute ensemble step - FIXED
   */
  async executeEnsembleStep(step, context, previousResults, workflowContexts = {}) {
    const payload = step.payload;
    const sourceData = await this.resolveSourceData(payload, context, previousResults);
    
    if (sourceData.length === 0) {
      throw new Error("No valid sources for ensemble. All providers returned empty or failed responses.");
    }

    console.log(`[WorkflowEngine] Running ensemble with ${sourceData.length} sources:`, 
      sourceData.map(s => s.providerId).join(', '));

    const ensemblePrompt = buildEnsemblerPrompt(payload.originalPrompt, sourceData);

    // Build providerContexts from workflowContexts (preferred) or fallback to
    // continueFromBatchStep for backwards compatibility.
    const providerContexts = {};
    if (workflowContexts && workflowContexts[payload.ensembleProvider]) {
      providerContexts[payload.ensembleProvider] = {
        meta: workflowContexts[payload.ensembleProvider],
        continueThread: true
      };
      console.log(`[WorkflowEngine] Ensemble using workflow-cached context for ${payload.ensembleProvider}: ${Object.keys(workflowContexts[payload.ensembleProvider]).join(',')}`);
    } else if (payload.continueFromBatchStep) {
      const batchResult = previousResults.get(payload.continueFromBatchStep);
      if (batchResult?.status === 'completed' && batchResult.result?.results) {
        const ensembleProviderResult = batchResult.result.results[payload.ensembleProvider];
        if (ensembleProviderResult?.meta) {
          providerContexts[payload.ensembleProvider] = {
            meta: ensembleProviderResult.meta,
            continueThread: true
          };
          console.log(`[WorkflowEngine] Ensemble continuing conversation for ${payload.ensembleProvider} via batch step`);
        }
      }
    }

    return new Promise((resolve, reject) => {
      this.orchestrator.executeParallelFanout(ensemblePrompt, [payload.ensembleProvider], {
        sessionId: context.sessionId,
        useThinking: payload.useThinking,
        providerContexts: Object.keys(providerContexts).length ? providerContexts : undefined,
        onPartial: (providerId, chunk) => {
          console.log(`[Engine] onPartial RAW:`, providerId, typeof chunk, chunk);
          const delta = makeDelta(context.sessionId, providerId, chunk.text);
          this.port.postMessage({ 
            type: 'PARTIAL_RESULT', 
            sessionId: context.sessionId, 
            stepId: step.stepId, 
            providerId, 
            chunk: { text: delta } 
          });
          console.log(`[Engine] Sending PARTIAL_RESULT:`, { stepId: step.stepId, providerId, deltaLength: delta.length });
        },
        onAllComplete: (results) => {
          const finalResult = results.get(payload.ensembleProvider);
          
          if (!finalResult || !finalResult.text) {
            reject(new Error(`Ensemble provider ${payload.ensembleProvider} returned empty response`));
            return;
          }

          this.sessionManager.updateProviderContext(
            context.sessionId, 
            payload.ensembleProvider, 
            finalResult, 
            true, 
            { skipSave: true }
          );
          this.sessionManager.saveSession(context.sessionId);
          
          resolve({
            providerId: payload.ensembleProvider,
            text: finalResult.text, // ✅ Return text explicitly
            status: 'completed',
            meta: finalResult.meta || {}
          });
        }
      });
    });
  }
}