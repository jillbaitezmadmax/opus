# Query: gemini
# Excluding: .md

113 results - 15 files

shared\contract.ts:
  4: export type ProviderKey = "claude" | "gemini" | "chatgpt" | "qwen";

src\sw-entry.js:
   20: import { GeminiAdapter } from "./providers/gemini-adapter.js";
   24: import { GeminiProviderController } from "./providers/gemini.js";
  343:     { name: 'gemini', Controller: GeminiProviderController, Adapter: GeminiAdapter },

src\core\dnr-auditor.js:
  96:         if (url.includes('gemini.google.com')) {
  97:             return 'gemini';

src\core\dnr-utils.js:
  472:       case 'gemini':
  482:             condition: { urlFilter: '*://gemini.google.com/*', resourceTypes: [chrome.declarativeNetRequest.ResourceType.SUB_FRAME] }

src\core\request-lifecycle-manager.js:
   25:   geminiLogin: "gemini-login",
   26:   geminiNoAccess: "gemini-no-access",
   27:   geminiUnexpected: "gemini-unexpected",
  259:   updateGeminiState(chat, connection, token, cursor) {
  260:     connection.token = token; chat.geminiCursor = cursor;
  268:       case "gemini-session": chat.geminiCursor = null; break;
  282:     case "gemini-session": {
  283:       if (type === "login") return { type: t("geminiLogin") };
  284:       if (type === "noGeminiAccess") return { type: t("geminiNoAccess") };
  285:       if (type === "badToken") return { type: t("geminiLogin") };
  286:       if (type === "failedToReadResponse") return { type: t("geminiUnexpected") };
  287:       if (type === "network") return { type: t("geminiUnexpected") };
  289:       return { type: t("geminiUnexpected") };

src\core\workflow-compiler.js:
  310:     const validProviders = ["claude", "gemini", "chatgpt", "qwen"];

src\core\workflow-engine.js:
  629:         // Results is now an object: { claude: {...}, gemini: {...} }

src\persistence\types.ts:
  100:   providerId: string;              // 'claude' | 'gemini' | 'chatgpt' | 'qwen'

src\providers\gemini-adapter.js:
    2:  * HTOS Gemini Provider Adapter
    3:  * - Implements ProviderAdapter interface for Gemini
    9: export class GeminiAdapter {
   11:     this.id = "gemini";
   36:       // Perform a simple check to verify Gemini API is accessible
   46:       // Extract model from request metadata (defaults to "gemini-flash")
   47:       const model = req.meta?.model || "gemini-flash";
   49:       console.log(`[GeminiAdapter] Sending prompt with model: ${model}`);
   51:       // Send prompt to Gemini with model selection
   52:       const result = await this.controller.geminiSession.ask(
   78:       const classification = classifyProviderError("gemini-session", error);
  110:       const model = providerContext.model || "gemini-flash";
  114:           "[GeminiAdapter] No cursor found in provider context, falling back to new chat"
  129:         `[GeminiAdapter] Continuing chat with cursor and model: ${model}`
  132:       // Send continuation to Gemini with existing cursor and model
  133:       const result = await this.controller.geminiSession.ask(prompt, {
  156:       const classification = classifyProviderError("gemini-session", error);

src\providers\gemini.js:
    2:  * HTOS Gemini Provider Implementation
    4:  * This adapter module provides Gemini AI integration following HTOS patterns.
    5:  * Handles Gemini session-based authentication using browser cookies.
   12: // GEMINI MODELS CONFIGURATION
   14: export const GeminiModels = {
   15:   "gemini-flash": {
   16:     id: "gemini-flash",
   17:     name: "Gemini 2.5 Flash",
   22:   "gemini-pro": {
   23:     id: "gemini-pro",
   24:     name: "Gemini 2.5 Pro",
   32: // GEMINI ERROR TYPES
   34: export class GeminiProviderError extends Error {
   37:     this.name = "GeminiProviderError";
   47:       noGeminiAccess: this.type === "noGeminiAccess",
   56: // GEMINI SESSION API
   58: export class GeminiSessionApi {
   69:     return e instanceof GeminiProviderError;
   73:    * Send prompt to Gemini AI and handle response
   78:    * @param {string} options.model - Model to use ("gemini-flash" or "gemini-pro")
   87:       model = "gemini-flash",
   98:     const modelConfig = GeminiModels[model] || GeminiModels["gemini-flash"];
  141:       // Gemini returns an XSSI prefix like ")]}'" followed by multiple JSON lines.
  172:       this._throw("noGeminiAccess");
  226:     console.info("[Gemini] Response received:", {
  246:       this.sharedState?.ai?.connections?.get?.("gemini-session")
  252:    * Fetch authentication token from Gemini
  280:    * Make authenticated fetch request to Gemini
  284:     let url = `https://gemini.google.com${path}`;
  321:     return new GeminiProviderError(type, details);
  326:       console.error("GeminiSessionApi:", ...args);
  332: // GEMINI PROVIDER CONTROLLER
  334: export class GeminiProviderController {
  337:     this.api = new GeminiSessionApi(dependencies);
  345:         "gemini-provider.ask",
  349:         "gemini-provider.fetchToken",
  369:    * Check if Gemini is available (user is logged in)
  381:    * Expose Gemini API instance for direct usage
  383:   get geminiSession() {
  395: export default GeminiProviderController;
  400:   window.HTOS.GeminiProvider = GeminiProviderController;

ui\App.tsx:
   115:       acc[provider.id] = ['claude', 'gemini', 'chatgpt'].includes(provider.id);
   121:     return localStorage.getItem('htos_last_synthesis_model') || 'gemini';
   123:   const [synthesisProvider, setSynthesisProvider] = useState<string | null>('gemini');
   158:     return saved ? JSON.parse(saved) : ['gemini'];
   202:   type ValidProvider = 'claude' | 'gemini' | 'chatgpt';
   952:           acc[provider.id] = ['claude', 'gemini', 'chatgpt'].includes(provider.id);
  1530:       acc[provider.id] = ['claude', 'gemini', 'chatgpt'].includes(provider.id);

ui\components\ProviderPill.tsx:
  8:     gemini:  { emoji: '🔵', name: 'Gemini' },

ui\providers\providerIcons.tsx:
  20: export const GeminiIcon  = baseIcon(tokens.accents.gemini);

ui\providers\providerRegistry.ts:
   4: import { ChatGPTIcon, ClaudeIcon, GeminiIcon, QwenIcon } from './providerIcons';
  19:   { id: 'gemini',  name: 'Gemini',  color: '#4285F4', logoBgClass: 'bg-blue-500',   hostnames: ['gemini.google.com'],           icon: GeminiIcon },

ui\theme\tokens.ts:
  24:     gemini: '#4285F4',
