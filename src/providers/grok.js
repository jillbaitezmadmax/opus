/**
 * HTOS Grok Provider Implementation
 *
 * This module wires Grok (xAI via X.com) integration following existing provider patterns.
 * It handles CSRF token management (cached from cookies/API via bus), conversation creation,
 * and message sending with NDJSON streaming support. Adapted from reverse-engineered flows
 * for 2025 compatibility (snake_case responses, Premium/geo errors).
 *
 * Build-phase safe: emitted to dist/providers/*
 */
import { BusController, utils } from "../core/vendor-exports.js";

// =============================================================================
// GROK MODELS CONFIGURATION
// =============================================================================
export const GrokModels = {
  "grok-3-latest": {
    id: "grok-3-latest",
    name: "Grok 3 (Latest)",
    description: "Latest free-tier Grok model",
    maxTokens: 8192, // Approximate; trim history if needed
  },
};

// =============================================================================
// GROK CONFIG (CSRF/Endpoints/Auth)
// =============================================================================
const DEFAULT_GROK_CONFIG = {
  bearerToken: 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA', // Static from X auth
  csrfTtlMs: 45 * 60 * 1000, // 45 minutes
  endpoints: {
    createConversation: 'https://x.com/i/api/graphql/vvC5uy7pWWHXS2aDi1FZeA/CreateGrokConversation',
    chat: 'https://grok.x.com/2/grok/add_response.json', // Cross-subdomain
  },
  forwardedFor: '08bf0d3c0fe172f1e9366f3a37bef60191709d15bfcb557e66f9f6eac92250023597790fa25561ccbfef87a9e192f25de1700a89c4cfdacd2a7525cc74908c5ddfe29b78265c29d168b9900e340bd3fbb4295f9e8d4225d1d5bdbcc0c169e65c9ed6e38ec6df693784edabb4c7b84f7c41b6610023e2e06c4ca610de348a4d5af5957a48158412f31ddddb5318e2cf1fe1267ab5729133c6a751f0e02844500f5e691404d3a8b7acf690843e061ecb242d8435de25f40515e758955fcb57835e2841c8329502a6e4b23bf55a4daada8df77a83be1dfcc1411806e19edfe7c066d82116dda20b9e0526dc2394fdd9b1acf618a261bbd54698cfdd', // From live 2025 session
  // Update at runtime if needed
};

// Runtime config - merges defaults
let GROK_CONFIG = { ...DEFAULT_GROK_CONFIG };

function updateGrokConfig(runtimeConfig) {
  console.log('[Grok] Updating config with runtime values:', Object.keys(runtimeConfig));
  GROK_CONFIG = { ...DEFAULT_GROK_CONFIG, ...runtimeConfig };
}

// =============================================================================
// GROK ERROR TYPES
// =============================================================================
export class GrokProviderError extends Error {
  constructor(type, details) {
    super(type);
    this.name = "GrokProviderError";
    this.type = type;
    this.details = details;
  }
  get is() {
    return {
      csrfExpired: this.type === "csrf_expired",
      noConversation: this.type === "no_conversation_id",
      network: this.type === "network",
      badRequest: this.type === "bad_request",
      aborted: this.type === "aborted",
      missingHostPermission: this.type === "missing_host_permission",
      grokUnavailable: this.type === "grok_unavailable",
      twitterUnauthorized: this.type === "twitter_unauthorized",
      unknown: this.type === "unknown",
    };
  }
}

// =============================================================================
// GROK PROVIDER CONTROLLER
// =============================================================================
export class GrokProviderController {
  constructor(dependencies = {}) {
    this.initialized = false;
    this.api = new GrokSessionApi(dependencies);
    this._conversationContext = null; // {conversationId, messages: []}
  }

  async init() {
    if (this.initialized) return;
    if (typeof BusController !== "undefined" && BusController.on) {
      BusController.on("grok.ask", this._handleAskRequest.bind(this));
    }
    this.initialized = true;
  }

  async _handleAskRequest(payload) {
    return await this.api.ask(payload.prompt, payload.options || {}, payload.onChunk || (() => {}));
  }

  get grokSession() {
    return this.api;
  }
  isOwnError(e) {
    return this.api.isOwnError(e);
  }
  async isAvailable() {
    try {
      await this.api._ensureCsrfToken({ refresh: true });
      return true;
    } catch {
      return false;
    }
  }

  // Compatibility wrappers for SW
  async _getCsrfToken({ refresh = false }) {
    try {
      const token = await this.api._ensureCsrfToken({ refresh });
      return { csrfToken: token || null };
    } catch (e) {
      return { error: (e && e.message) || String(e) };
    }
  }

  updateGrokConfig(runtimeConfig) {
    updateGrokConfig(runtimeConfig);
    return GROK_CONFIG;
  }

  getGrokConfig() {
    return { ...GROK_CONFIG };
  }
}

// =============================================================================
// GROK SESSION API
// =============================================================================
export class GrokSessionApi {
  constructor({ sharedState, utils, fetchImpl = fetch } = {}) {
    this._logs = true;
    this.sharedState = sharedState;
    this.utils = utils;
    this.fetch = fetchImpl;
    this.ask = this._wrapMethod(this.ask);
    // Caches
    this._csrfToken = null;
    this._csrfExpiry = 0;
    this._conversationContext = null; // {conversationId, messages: []}
  }

  _getHtosBus() {
    const htos = this._getHtos();
    if (htos?.$bus) return htos.$bus;
    try {
      if (typeof self !== 'undefined' && self.bus) return self.bus;
      if (typeof globalThis !== 'undefined' && globalThis.bus) return globalThis.bus;
      if (typeof BusController !== 'undefined' && BusController) return BusController;
    } catch (e) {}
    return null;
  }

  _getHtos() {
    try {
      if (typeof window !== "undefined" && window.htos) return window.htos;
      if (typeof globalThis !== "undefined" && globalThis.htos) return globalThis.htos;
    } catch (e) {}
    return null;
  }

  isOwnError(e) {
    return e instanceof GrokProviderError;
  }

  async ask(prompt, options = {}, onChunk = () => {}) {
    const { signal, model = 'grok-3-latest', persona = 'fun' } = options;
    const safePrompt = prompt.length > 300 ? prompt.slice(0, 300) + '...' : prompt;
    console.log(`[Grok Session] ask started: model=${model}, promptLen=${prompt.length}, persona=${persona}`);

    // Permission check
    if (typeof chrome !== 'undefined' && chrome.runtime && !await this._checkHostPermission('https://*.twitter.com/*')) {
      throw new GrokProviderError('missing_host_permission', 'Missing twitter.com permission');
    }

    // Ensure CSRF with refresh
    await this._ensureCsrfToken({ refresh: true });

    // Conversation setup
    if (!this._conversationContext) {
      const conversationId = await this._createConversation();
      this._conversationContext = { conversationId, messages: [] };
    }
    const conversationId = this._conversationContext.conversationId;

    // Push user message
    this._conversationContext.messages.push({ sender: 1, message: prompt });

    // Payload
    const body = {
      conversationId,
      responses: this._conversationContext.messages,
      systemPromptName: persona,
      grokModelOptionId: model,
      modelMode: 'MODEL_MODE_FAST',
      returnSearchResults: true,
      returnCitations: true,
      promptMetadata: { promptSource: 'NATURAL', action: 'INPUT' },
      imageGenerationCount: 4,
      requestFeatures: { eagerTweets: true, serverHistory: true },
      enableSideBySide: true,
      toolOverrides: {},
      modelConfigOverride: {},
      isTemporaryChat: false
    };

    const headers = await this._buildGrokHeaders();

    const controller = new AbortController();
    if (signal) signal.addEventListener('abort', () => controller.abort());

    const res = await this._fetchAuth(GROK_CONFIG.endpoints.chat, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      referrer: 'https://x.com/i/grok',
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 401) throw new GrokProviderError('grok_unavailable', 'Grok requires X Premium+');
      if (res.status === 451) throw new GrokProviderError('grok_unavailable', 'Grok not available in your country');
      if (res.status === 403) {
        this._csrfToken = null;
        await this._ensureCsrfToken({ refresh: true });
        return this.ask(prompt, options, onChunk); // Retry
      }
      const errText = await res.text();
      throw new GrokProviderError('bad_request', `${res.status}: ${errText}`);
    }

    // NDJSON streaming
    const decoder = new TextDecoder();
    let aggregatedText = '';
    const reader = res.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.result?.message) {
              const msg = parsed.result.message;
              if (!msg.startsWith('[link]')) {
                aggregatedText += msg;
                onChunk({ text: aggregatedText, partial: true });
              }
            } else if (parsed.result?.query && !aggregatedText) {
              onChunk({ text: `_${parsed.result.query}_`, partial: true });
            }
          } catch (parseErr) {
            console.warn('[Grok Stream] Parse error:', parseErr, line);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Push Grok response
    this._conversationContext.messages.push({ sender: 2, message: aggregatedText });

    onChunk({ text: aggregatedText, partial: false });
    console.log(`[Grok Session] ask completed: textLen=${aggregatedText.length}`);
    return { text: aggregatedText, model };
  }

  // =============================================================================
  // PRIVATE HELPERS
  // =============================================================================
  _wrapMethod(fn) {
    return async (...args) => {
      try {
        return await fn.call(this, ...args);
      } catch (e) {
        let err;
        if (this.isOwnError(e)) err = e;
        else if (String(e).includes('Failed to fetch')) err = new GrokProviderError('network', e.message);
        else if (String(e).includes('aborted')) err = new GrokProviderError('aborted', e.message);
        else err = new GrokProviderError('unknown', e.message);

        if (err.details) this._logError(err.message, err.details);
        else this._logError(err.message);
        throw err;
      }
    };
  }

  _throw(type, details) {
    throw new GrokProviderError(type, details);
  }

  _logError(...args) {
    if (this._logs) console.error('GrokSessionApi:', ...args);
  }

  async _ensureCsrfToken({ refresh = false } = {}) {
    const now = Date.now();
    if (this._csrfToken && now < this._csrfExpiry && !refresh) return this._csrfToken;

    const bus = this._getHtosBus();
    if (bus?.send) {
      const msgRes = await bus.send('read-twitter-csrf-token', { refresh });
      if (!msgRes) throw new GrokProviderError('twitter_unauthorized', 'No logged-in X account');
      this._csrfToken = msgRes;
    } else {
      const cookies = await chrome.cookies.getAll({ url: 'https://x.com', name: 'ct0' });
      this._csrfToken = cookies[0]?.value;
    }

    if (!this._csrfToken) throw new GrokProviderError('csrf_expired', 'No CSRF token');
    this._csrfExpiry = now + GROK_CONFIG.csrfTtlMs;
    return this._csrfToken;
  }

  async _createConversation() {
    const csrf = await this._ensureCsrfToken({ refresh: true });
    const transactionId = this._generateTransactionId();
    const headers = {
      'authorization': GROK_CONFIG.bearerToken,
      'content-type': 'application/json',
      'x-csrf-token': csrf,
      'x-client-transaction-id': transactionId,
      'x-twitter-auth-type': 'OAuth2Session',
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'priority': 'u=1, i',
      'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
      'x-xp-forwarded-for': GROK_CONFIG.forwardedFor,
      'referrer': 'https://x.com/i/grok'
    };

    const body = JSON.stringify({ variables: {}, queryId: 'vvC5uy7pWWHXS2aDi1FZeA' });

    const res = await this._fetchAuth(GROK_CONFIG.endpoints.createConversation, {
      method: 'POST',
      headers,
      body
    });

    if (!res.ok) {
      if (res.status === 401) throw new GrokProviderError('grok_unavailable', 'Grok requires X Premium+');
      if (res.status === 451) throw new GrokProviderError('grok_unavailable', 'Grok not available in your country');
      if (res.status === 403) {
        this._csrfToken = null;
        await this._ensureCsrfToken({ refresh: true });
        return this._createConversation(); // Retry
      }
      const errText = await res.text();
      throw new GrokProviderError('no_conversation_id', `${res.status}: ${errText}`);
    }

    const data = await res.json();
    const id = data.data?.create_grok_conversation?.conversation_id || data.data?.createGrokConversation?.restId;
    if (!id) throw new GrokProviderError('no_conversation_id', 'No ID in response');
    return id;
  }

  async _buildGrokHeaders() {
    const csrf = await this._ensureCsrfToken();
    const transactionId = this._generateTransactionId();
    return {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'authorization': GROK_CONFIG.bearerToken,
      'content-type': 'text/plain;charset=UTF-8', // For chat; JSON for create
      'priority': 'u=1, i',
      'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site', // same-origin for create
      'x-client-transaction-id': transactionId,
      'x-csrf-token': csrf,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-xai-request-id': this._generateTransactionId(), // Separate for chat
      'x-xp-forwarded-for': GROK_CONFIG.forwardedFor,
      'referrer': 'https://x.com/i/grok'
    };
  }

  async _fetchAuth(path, opts = {}) {
    const headers = { ...opts.headers || await this._buildGrokHeaders() };
    const payload = { ...opts, headers };

    if (payload.body && typeof payload.body !== 'string') payload.body = JSON.stringify(payload.body);

    const fetchOptions = {
      ...payload,
      credentials: 'include',
    };

    let res;
    try {
      res = await this.fetch(path, fetchOptions);
    } catch (fetchErr) {
      this._logError('Network fetch failed:', fetchErr);
      throw fetchErr;
    }

    if (res.status === 403) throw new GrokProviderError('csrf_expired', 'Auth failed: CSRF expired');
    return res;
  }

  _generateTransactionId() {
    const randomBytes = new Uint8Array(128);
    crypto.getRandomValues(randomBytes);
    return btoa(String.fromCharCode(...randomBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  async _checkHostPermission(host) {
    if (typeof chrome === 'undefined' || !chrome.permissions) return true;
    return new Promise(resolve => chrome.permissions.contains({ origins: [host] }, resolve));
  }

  resetConversation() {
    this._conversationContext = null;
  }
}

// Stub for streamAsyncIterable if needed (native body.getReader() used above)
function streamAsyncIterable(readableStream) {
  const reader = readableStream.getReader();
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => reader.read().then(({ done, value }) => ({ done, value }))
    })
  };
}

// =============================================================================
// EXPORTS
// =============================================================================
export default GrokProviderController;

if (typeof window !== "undefined") {
  window.HTOS = window.HTOS || {};
  window.HTOS.GrokProvider = GrokProviderController;
}