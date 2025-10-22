/**
 * HTOS Gemini Pro Provider Adapter
 * - Separate provider ID 'gemini-pro' that defaults to Gemini 2.5 Pro model
 */
import { classifyProviderError } from "../core/request-lifecycle-manager.js";

export class GeminiProAdapter {
  constructor(controller) {
    this.id = "gemini-pro";
    this.capabilities = {
      needsDNR: false,
      needsOffscreen: false,
      supportsStreaming: false,
      supportsContinuation: true,
      synthesis: false,
      supportsModelSelection: false, // Pro variant is fixed
    };
    this.controller = controller;
  }

  async init() {
    return;
  }

  async healthCheck() {
    try {
      return await this.controller.isAvailable();
    } catch {
      return false;
    }
  }

  async sendPrompt(req, onChunk, signal) {
    const startTime = Date.now();
    try {
      const model = "gemini-pro"; // Force Pro model
      const result = await this.controller.geminiSession.ask(
        req.originalPrompt,
        {
          signal,
          cursor: req.meta?.cursor,
          model,
        }
      );

      return {
        providerId: this.id,
        ok: true,
        id: null,
        text: result.text,
        partial: false,
        latencyMs: Date.now() - startTime,
        meta: {
          cursor: result.cursor,
          token: result.token,
          modelName: result.modelName,
          model,
        },
      };
    } catch (error) {
      const classification = classifyProviderError("gemini-session", error);
      const errorCode = classification.type || "unknown";
      return {
        providerId: this.id,
        ok: false,
        text: null,
        errorCode,
        latencyMs: Date.now() - startTime,
        meta: {
          error: error.toString(),
          details: error.details,
          suppressed: classification.suppressed,
        },
      };
    }
  }

  async sendContinuation(prompt, providerContext, sessionId, onChunk, signal) {
    const startTime = Date.now();
    try {
      const cursor = providerContext.cursor;
      const model = providerContext.model || "gemini-pro";

      if (!cursor) {
        const meta = { ...(providerContext?.meta || providerContext || {}), model };
        return await this.sendPrompt(
          { originalPrompt: prompt, sessionId, meta },
          onChunk,
          signal
        );
      }

      const result = await this.controller.geminiSession.ask(prompt, {
        signal,
        cursor,
        model,
      });

      return {
        providerId: this.id,
        ok: true,
        id: null,
        text: result.text,
        partial: false,
        latencyMs: Date.now() - startTime,
        meta: {
          cursor: result.cursor,
          token: result.token,
          modelName: result.modelName,
          model,
        },
      };
    } catch (error) {
      const classification = classifyProviderError("gemini-session", error);
      const errorCode = classification.type || "unknown";
      return {
        providerId: this.id,
        ok: false,
        text: null,
        errorCode,
        latencyMs: Date.now() - startTime,
        meta: {
          error: error.toString(),
          details: error.details,
          suppressed: classification.suppressed,
          cursor: providerContext.cursor,
          model: providerContext.model || "gemini-pro",
        },
      };
    }
  }
}
