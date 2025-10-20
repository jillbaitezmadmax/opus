🔴 Critical Gaps That Will Break
Gap 1: The Compiler Doesn't Generate 'map' Steps
The Problem:
javascript// In workflow-engine.js
const mapSteps = steps.filter(step => step.type === 'map'); // ← Looking for 'map' type
But in workflow-compiler.js, there's NO code that creates steps with type: 'map'.
Current compiler output:
javascript// workflow-compiler.js compiles to:
steps = [
  { type: 'prompt', ... },      // Batch
  { type: 'synthesis', ... },   // Synthesis
  { type: 'ensemble', ... }     // ← Still called 'ensemble', not 'map'
]
Result: mapSteps.length === 0 always, so mapOutputText stays null, and synthesis never receives map input.

Fix Required:
 Update Compiler (Proper Fix)
 In workflow-compiler.js
if (request.ensemble?.enabled) {
  steps.push({
    id: `map-${Date.now()}`,
    type: 'map', // ← Rename from 'ensemble'
    payload: {
      mapProvider: request.ensemble.provider,
      originalPrompt: request.userMessage,
      sourceStepIds: [batchStepId],
    },
  });
}


Gap 2: executeMapStep() References Missing Payload Fields
The Problem:
javascript// In executeMapStep()
const sourceData = await this.resolveSourceData(
  payload, // ← What's in payload?
  context,
  previousResults
);

const prompt = this.buildEnsemblerPrompt(
  payload.originalPrompt, // ← Does payload have originalPrompt?
  sourceData
);

const fanoutResult = await orchestrator.executeParallelFanout(
  [payload.mapProvider], // ← Does payload have mapProvider?
  prompt,
  ...
);
But the compiler generates steps like:
javascript{
  type: 'ensemble',
  payload: {
    ensembleProvider: 'claude', // ← NOT 'mapProvider'
    // originalPrompt: ... might not exist
    sourceStepIds: [...]
  }
}
Result: payload.mapProvider is undefined, causing the orchestrator call to fail.

Fix Required:
In executeMapStep(), add fallback:
javascriptasync executeMapStep(step, context, previousResults, workflowContexts = {}) {
  const payload = step.payload;
  
  // FALLBACK: Support both old 'ensembleProvider' and new 'mapProvider'
  const provider = payload.mapProvider || payload.ensembleProvider;
  
  if (!provider) {
    throw new Error('Map step missing provider (mapProvider or ensembleProvider)');
  }
  
  const sourceData = await this.resolveSourceData(payload, context, previousResults);
  const prompt = this.buildEnsemblerPrompt(
    payload.originalPrompt || context.userMessage, // ← Fallback to context
    sourceData
  );
  
  const fanoutResult = await orchestrator.executeParallelFanout(
    [provider], // ← Use resolved provider
    prompt,
    ...
  );
  
  return {
    providerId: provider,
    text: fanoutResult[provider]?.text || '',
    status: 'completed',
    meta: fanoutResult[provider]?.meta || {},
  };
}

Gap 3: UI Still Sends ensemble in Request, Not map
The Problem:
Your UI likely sends requests like:
typescript// In RoundActionBar.tsx (or wherever Map button is)
executeWorkflow({
  providers: [],
  ensemble: { // ← Still called 'ensemble'
    enabled: true,
    provider: 'claude',
  },
  historicalContext: { ... }
})
But your types now expect:
typescriptinterface ExecuteWorkflowRequest {
  map?: { // ← New field name
    enabled: boolean;
    provider: ProviderKey;
  };
  ensemble?: { ... }; // ← Legacy, for backward compat
}
Result: The compiler doesn't recognize ensemble anymore if you changed it, OR it still creates 'ensemble' steps if you kept backward compat.

Fix Required:
In workflow-compiler.js, support BOTH:
javascriptexport function compileWorkflow(request) {
  const steps = [];
  
  // ... batch steps
  
  // Map step (support both 'map' and 'ensemble' for backward compat)
  const mapConfig = request.map || request.ensemble;
  if (mapConfig?.enabled) {
    steps.push({
      id: `map-${Date.now()}`,
      type: 'map', // ← Always compile as 'map' internally
      payload: {
        mapProvider: mapConfig.provider,
        originalPrompt: request.userMessage,
        sourceStepIds: [batchStepId],
      },
    });
  }
  
  // ... synthesis steps
}
And in UI, update the Map button:
typescript// RoundActionBar.tsx
const handleMapClick = async () => {
  await executeWorkflow({
    providers: [],
    map: { // ← Use new field name
      enabled: true,
      provider: 'claude-3-5-sonnet-20241022',
    },
    historicalContext: { ... },
  });
};

Testing Checklist: Will It Work?
TestExpectedCurrent ResultStatusClick Map buttonGenerates map output❌ No map step compiled🔴 FAILMap output appears in UIShows in timeline❌ mapOutput is null🔴 FAILClick Synthesis after MapIncludes map in prompt❌ mapOutputText is null🔴 FAILMap persists in DBhasMapOutput: true✅ If manually triggered🟡 PARTIALLoad old sessionMigrates to mapOutput✅ Works🟢 PASS

Quick Fix Patch (Apply These 3 Changes)
Fix 1:  In workflow-compiler.js
if (request.ensemble?.enabled) {
  steps.push({
    id: `map-${Date.now()}`,
    type: 'map', // ← Rename from 'ensemble'
    payload: {
      mapProvider: request.ensemble.provider,
      originalPrompt: request.userMessage,
      sourceStepIds: [batchStepId],
    },
  });
}
.


Fix 2: Add Fallback in executeMapStep()
File: src/core/workflow-engine.js
javascript// In executeMapStep() function
async executeMapStep(step, context, previousResults, workflowContexts = {}) {
  const payload = step.payload;
  
  // ADD THIS BLOCK:
  const provider = payload.mapProvider || payload.ensembleProvider;
  if (!provider) {
    throw new Error('[executeMapStep] Missing provider in payload');
  }
  const originalPrompt = payload.originalPrompt || context.userMessage;
  
  // ... rest of function, use `provider` and `originalPrompt`
}

Fix 3: Support Both map and ensemble in Compiler
File: src/core/workflow-compiler.js
javascript// Find where ensemble steps are compiled (around line 100-150)
// ADD THIS:
const mapConfig = request.map || request.ensemble; // ← Support both
if (mapConfig?.enabled) {
  steps.push({
    id: `map-${Date.now()}`,
    type: 'map', // ← Compile as 'map' internally
    payload: {
      mapProvider: mapConfig.provider,
      ensembleProvider: mapConfig.provider, // ← Backward compat
      originalPrompt: request.userMessage,
      sourceStepIds: [batchStepId],
    },
  });
}

Summary: Will It Work?
After these 3 fixes: ✅ Yes, it will work.
Without these fixes:

Map button does nothing (no steps compiled)
Synthesis never receives map output
UI shows no map response

Estimated fix time: 15 minutes to apply the 3 patches above.
Test flow after fixes:

Click Map button → Should see map output in timeline
Click Synthesis → Prompt should include "Structured Map: ..."
Check IndexedDB → hasMapOutput: true in turn record
Reload page → Map output still visible (persistence works)

