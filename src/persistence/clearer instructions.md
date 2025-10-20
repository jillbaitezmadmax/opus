Add mapResponses as a new field that aliases ensembleResponses in the persistence layer. Then modify workflow-engine.js to run the Map phase before Synthesis, and pass Map output to the Synthesis prompt builder. Keep ensemble in the API for backward compatibility."

step 0: go through all your changes in the last two rounds in ui/types.ts, contract.ts, persistence/types.ts and sessionmanager.js and modify or align any incorrect changes with the actual intended logic.

Step 1: Clarify mapOutput 
// NEW: Single map output (replaces ensemble conceptually)
// LEGACY: Kept for backward compatibility only
  /** @deprecated Use mapOutput instead */
  // Counts
  batchCount: number;
  synthesisCount: number;
  /** @deprecated Check mapOutput instead */
key changes to make
mapOutput?: ProviderResponse (not | null, let undefined mean "not present")Added @deprecated JSDoc tags so your agent knows these are legacy fields

Step 2: Update Provenance (Remove 'ensemble')


Step 3: Fix Count Logic
✅ Boolean, not count
    // Legacy count for old UI code
    Why hasMapOutput instead of mapResponseCount:

You only ever have one map output per turn
Counting it is semantically weird (it's not a collection)
Boolean is clearer: "Does this turn have a map? Yes/No"

Step 4: Update UI to Prefer mapOutput
/* Map output (new) */
/* Ensemble responses (legacy fallback) */
Logic: Show mapOutput if present, otherwise fall back to old ensembleResponses for backward compatibility.


Correct parts to keep:

✅ mapOutput?: ProviderResponse in AiTurn interface
✅ Adding 'map' to provenance responseType union

Incorrect parts to fix:

❌ Remove 'ensemble' from responseType union (or mark deprecated)
❌ Don't use mapResponseCount—use hasMapOutput: boolean instead
❌ Mark ensembleResponses as @deprecated in the type definition

Prompt for your agent:

"In the AiTurn interface, mark ensembleResponses and ensembleCount as deprecated with JSDoc comments. Remove 'ensemble' from the Provenance.responseType union. Change any mapResponseCount logic to use hasMapOutput: !!turn.mapOutput instead of counting responses."