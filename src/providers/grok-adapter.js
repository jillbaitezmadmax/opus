/**
 * HTOS Grok Provider Adapter
 * - Implements ProviderAdapter interface for Grok
 *
 * Build-phase safe: emitted to dist/adapters/*
 */
import { classifyProviderError } from "../core/request-lifecycle-manager.js";

export class GrokAdapter {
  constructor(controller) {
    this.id = "grok";
    this.capabilities = {
      needsDNR: true, // For header rewrites (origin, referer, sec-fetch-site)
      needsOffscreen: false, // No Arkose/PoW
      supportsStreaming: true, // NDJSON streaming via onChunk
      supportsContinuation: true, // Via full history in cursor
      synthesis: false,
      supportsThinking: false, // No think-mode
    };
    this.controller = controller;
  }

  /** Initialize the adapter */
  async init() {
    return;
  }

  /**
   * Health check to ensure Grok path is available
   */
  async healthCheck() {
    try {
      return await this.controller.isAvailable();
    } catch {
      return false;
    }
  }

  /**
   * Send prompt to Grok. Supports streaming via onChunk.
   */
  async sendPrompt(req, onChunk, signal) {
    const startTime = Date.now();
    console.log(`[Grok Adapter] sendPrompt started (provider=${this.id})`);

    try {
      // For continuation, extract history from meta.cursor (array of messages)
      const historyCursor = req.meta?.cursor || []; // Expect [{sender, message, ...}]
      // Pass as chatId if first in history has it, else create new
      const providedChatId = historyCursor.length > 0 && historyCursor[0].conversationId ? historyCursor[0].conversationId : null;
      const persona = req.meta?.persona || 'fun'; // Optional persona

      const forwardOnChunk = (chunk) => {
        if (onChunk) {
          try {
            onChunk(chunk);
          } catch (_) {}
        }
      };

      const result = await this.controller.grokSession.ask(
        req.originalPrompt,
        {
          signal,
          model: req.meta?.model || 'grok-3-latest',
          chatId: providedChatId,
          persona,
        },
        forwardOnChunk
      );

      const response = {
        providerId: this.id,
        ok: true,
        id: null, // No message ID in Grok response
        text: result?.text ?? "",
        partial: false,
        latencyMs: Date.now() - startTime,
        meta: {
          model: result?.model || 'grok-3-latest',
          cursor: result.history || [...historyCursor, { sender: 1, message: req.originalPrompt }, { sender: 2, message: result.text }], // Update cursor with full history
          persona,
        },
      };

      console.log(`[Grok Adapter] providerComplete: grok status=success, latencyMs=${response.latencyMs}, textLen=${response.text.length}`);
      return response;

    } catch (error) {
      console.error(`[Grok Adapter] Error in sendPrompt:`, {
        error: error.toString(),
        stack: error.stack,
        details: error.details,
        latencyMs: Date.now() - startTime
      });

      const classification = classifyProviderError("grok-session", error);
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

  /**
   * Send continuation message using existing history cursor
   */
  async sendContinuation(prompt, providerContext, sessionId, onChunk, signal) {
    const meta = providerContext?.meta || providerContext || {};
    const historyCursor = meta.cursor || []; // Full history array

    console.log(`[Grok Adapter] Starting continuation with history len: ${historyCursor.length}`);

    if (historyCursor.length === 0) {
      console.log('[Grok Adapter] No history cursor, falling back to sendPrompt');
      return this.sendPrompt({ originalPrompt: prompt, meta }, onChunk, signal);
    }

    // Delegate to sendPrompt with cursor in meta
    return this.sendPrompt(
      { originalPrompt: prompt, meta: { ...meta, cursor: historyCursor } },
      onChunk,
      signal
    );
  }
}