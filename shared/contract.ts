// ============================================================================
// CORE TYPES & ENUMS
// ============================================================================
export type ProviderKey = "claude" | "gemini" | "chatgpt" | "qwen";
export type WorkflowStepType = "prompt" | "synthesis" | "ensemble";
export type WorkflowMode = "new-conversation" | "continuation";
export type SynthesisStrategy = "continuation" | "fresh";

// ============================================================================
// SECTION 1: UNIFIED EXECUTION REQUEST (UI -> BACKEND)
// SOURCE: This is from your "New Contract" and the core of the new architecture.
// ============================================================================
/**
 * This is the high-level, declarative request the UI sends to the backend.
 * It describes user intent, not execution steps.
 */
export interface ExecuteWorkflowRequest {
  sessionId: string;
  threadId: string;
  mode: WorkflowMode; // Global default
  userMessage: string;
  providers: ProviderKey[];

  // Multi-synthesis: Array of providers that each synthesize
  synthesis?: { enabled: boolean; providers: ProviderKey[] };

  // Multi-ensemble: Array of providers that each ensemble
  ensemble?: { enabled: boolean; providers: ProviderKey[] };

  useThinking?: boolean;

  historicalContext?: {
    userTurnId?: string;
    sourceType?: "batch" | "synthesis" | "ensemble";
    attemptNumber?: number;
    branchPointTurnId?: string;
    inheritContextUpTo?: string;
    replaceTurnId?: string;
  };
}

export interface ExecuteWorkflowResponse {
  turnId: string;
  workflowId: string;
  status: "processing";
}

// ============================================================================
// SECTION 2: COMPILED WORKFLOW (BACKEND-INTERNAL)
// SOURCE: This is from your "New Contract." It's essential for the backend's internal logic.
// ============================================================================
/**
 * These are the low-level, imperative steps produced by the WorkflowCompiler
 * and consumed by the WorkflowEngine.
 */
export interface PromptStepPayload {
  prompt: string;
  providers: ProviderKey[];
  providerContexts?: Record<
    ProviderKey,
    { meta: any; continueThread: boolean }
  >;
  hidden?: boolean;
  useThinking?: boolean;
}

export interface SynthesisStepPayload {
  synthesisProvider: ProviderKey;
  strategy: SynthesisStrategy;
  sourceStepIds?: string[];
  sourceHistorical?: {
    turnId: string;
    responseType: "batch" | "synthesis" | "ensemble";
  };
  originalPrompt: string;
  useThinking?: boolean;
  continueConversationId?: string;
  attemptNumber?: number;
}

// NOTE: Added Omit<...> to reduce duplication, but the effective type is the same.
export interface EnsembleStepPayload
  extends Omit<SynthesisStepPayload, "synthesisProvider"> {
  ensembleProvider: ProviderKey;
}

export interface WorkflowStep {
  stepId: string;
  type: WorkflowStepType;
  payload: PromptStepPayload | SynthesisStepPayload | EnsembleStepPayload;
}

export interface WorkflowContext {
  sessionId: string;
  threadId: string;
  targetUserTurnId: string;
}

export interface WorkflowRequest {
  workflowId: string;
  context: WorkflowContext;
  steps: WorkflowStep[];
}

// ============================================================================
// SECTION 3: REAL-TIME MESSAGING (BACKEND -> UI)
// SOURCE: This is from your "New Contract." It defines the streaming communication.
// ============================================================================
/**
 * These are the messages sent from the backend to the UI via the persistent port
 * to provide real-time updates on workflow execution.
 */
export interface SessionStartedMessage {
  type: "SESSION_STARTED";
  sessionId: string;
}

export interface PartialResultMessage {
  type: "PARTIAL_RESULT";
  sessionId: string;
  stepId: string;
  providerId: ProviderKey;
  chunk: { text?: string; meta?: any };
}

// NOTE: I made the `result` property more specific and robust here.
export interface WorkflowStepUpdateMessage {
  type: "WORKFLOW_STEP_UPDATE";
  sessionId: string;
  stepId: string;
  status: "completed" | "failed";
  result?: {
    // For batch prompt steps, this will be populated
    results?: Record<string, ProviderResponse>;
    // For single-provider steps (synthesis/ensemble), these will be populated
    providerId?: string;
    text?: string;
    status?: string;
    meta?: any;
  };
  error?: string;
}

export interface WorkflowCompleteMessage {
  type: "WORKFLOW_COMPLETE";
  sessionId: string;
  workflowId: string;
  finalResults?: Record<string, any>;
  error?: string;
}

export type PortMessage =
  | SessionStartedMessage
  | PartialResultMessage
  | WorkflowStepUpdateMessage
  | WorkflowCompleteMessage;

// ============================================================================
// SECTION 4: PERSISTENT DATA MODELS (FOR UI & SESSION STATE)
// SOURCE: This section is from your "Old Contract" and is MERGED IN here. It's essential.
// ============================================================================
/**
 * These are the core data entities that represent the application's state.
 * They are used for UI rendering and are persisted by the SessionManager.
 */
export interface ProviderResponse {
  providerId: string;
  text: string;
  status: "pending" | "streaming" | "completed" | "error";
  createdAt: number;
  updatedAt?: number;
  attemptNumber?: number;
  meta?: {
    conversationId?: string;
    parentMessageId?: string;
    tokenCount?: number;
    thinkingUsed?: boolean;
  };
}

export interface AiTurn {
  id: string;
  type: "ai";
  sessionId: string | null;
  threadId: string;
  userTurnId: string;
  createdAt: number;
  batchResponses: Record<string, ProviderResponse>;
  synthesisResponses: Record<string, ProviderResponse[]>;
  ensembleResponses: Record<string, ProviderResponse[]>;
  meta?: {
    branchPointTurnId?: string;
    replacesId?: string;
    isHistoricalRerun?: boolean;
  };
}

export interface Thread {
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

// ============================================================================
// TYPE GUARDS
// SOURCE: From your "New Contract."
// ============================================================================
export function isPromptPayload(payload: any): payload is PromptStepPayload {
  return "prompt" in payload && "providers" in payload;
}
export function isSynthesisPayload(
  payload: any
): payload is SynthesisStepPayload {
  return "synthesisProvider" in payload;
}
export function isEnsemblePayload(
  payload: any
): payload is EnsembleStepPayload {
  return "ensembleProvider" in payload;
}
