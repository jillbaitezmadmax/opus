/**
 * HTOS Offscreen Bootstrap - Multi-purpose Utility Host
 * NOW WITH: Active SW keepalive pinging
 */

import { BusController } from './BusController.js';

// =============================================================================
// SERVICE WORKER KEEPALIVE CONTROLLER
// =============================================================================

const KeepaliveController = {
  pingTimer: null,
  PING_INTERVAL: 20000, // Ping every 20 seconds (well below 30s threshold)
  
  async init() {
    console.log('[OffscreenBootstrap] Initializing KeepaliveController...');
    
    // Start immediate ping cycle
    this.startPinging();
    
    // Listen for keepalive requests from SW
    if (window.bus) {
      window.bus.on('htos.keepalive', this.handleKeepaliveRequest.bind(this));
    }
    
    // Listen for runtime messages as fallback
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'htos.keepalive') {
        this.handleKeepaliveRequest(message);
        return true;
      }
    });
  },
  
  startPinging() {
    if (this.pingTimer) return;
    
    const doPing = async () => {
      try {
        // Ping service worker via runtime message
        await chrome.runtime.sendMessage({ 
          type: 'htos.offscreen.ping',
          timestamp: Date.now() 
        });
        
        console.log('[Keepalive] SW ping sent');
      } catch (e) {
        // SW might be restarting, this is fine
        console.log('[Keepalive] SW ping failed (SW may be restarting)');
      }
      
      // Schedule next ping
      this.pingTimer = setTimeout(doPing, this.PING_INTERVAL);
    };
    
    // Start immediately
    doPing();
  },
  
  stopPinging() {
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }
  },
  
  handleKeepaliveRequest(message) {
    // SW is asking us to confirm we're alive
    // Send a pong back
    try {
      chrome.runtime.sendMessage({ 
        type: 'htos.offscreen.pong',
        timestamp: Date.now(),
        originalTimestamp: message?.timestamp 
      });
    } catch (e) {
      console.warn('[Keepalive] Failed to send pong:', e);
    }
    
    return { success: true, timestamp: Date.now() };
  }
};

// =============================================================================
// IFRAME LIFECYCLE CONTROLLER (Essential for Arkose Solver)
// =============================================================================

const IframeController = {
  async init() {
    console.log('[OffscreenBootstrap] Initializing IframeController...');
    
    this._src = chrome.runtime.getURL('oi.html');
    this._iframe = null;
    this._pingInterval = null;
    
    this._createIframe();
    this._manageIframeStability();
    
    console.log('[OffscreenBootstrap] IframeController initialized and is being monitored.');
  },

  _createIframe() {
    console.log('[OffscreenBootstrap] Creating new oi.html iframe...');
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = this._src;
    
    try {
      iframe.name = `offscreen-iframe | ${chrome.runtime.getURL('oi.js')}`;
    } catch (_) {}

    document.body.appendChild(iframe);
    this._iframe = iframe;

    if (window.bus && typeof window.bus.setIframe === 'function') {
      try {
        window.bus.setIframe(iframe);
        console.log('[OffscreenBootstrap] setIframe called immediately after append');
      } catch (e) {
        console.warn('[OffscreenBootstrap] Immediate setIframe failed:', e);
      }
    }

    return iframe;
  },

  _manageIframeStability() {
    this._pingInterval = setInterval(async () => {
      const isResponsive = await this._pingIframe();
      if (!isResponsive) {
        console.warn('[OffscreenBootstrap] Iframe is not responsive, triggering restart...');
        await this._restartIframe();
      } else {
        console.log('[OffscreenBootstrap] Iframe health check passed.');
      }
    }, 300000); // Ping every 5 minutes
  },

  async _pingIframe() {
    const timeoutMs = 5000;
    try {
      if (!window.bus || typeof window.bus.poll !== 'function') {
        console.warn('[OffscreenBootstrap] Bus is not available for polling.');
        return false;
      }

      const ok = await Promise.race([
        window.bus.poll('startup.oiReady').then(() => true).catch(() => false),
        new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
      ]);

      return !!ok;
    } catch (e) {
      console.error('[OffscreenBootstrap] _pingIframe unexpected error:', e);
      return false;
    }
  },

  async _restartIframe() {
    try {
      console.log('[OffscreenBootstrap] Restarting iframe...');
      if (this._iframe && this._iframe.parentNode) {
        this._iframe.parentNode.removeChild(this._iframe);
      }
      await new Promise(resolve => setTimeout(resolve, 250));
      this._createIframe();
      console.log('[OffscreenBootstrap] Iframe has been restarted.');
    } catch (error) {
      console.error('[OffscreenBootstrap] Failed to restart iframe:', error);
    }
  }
};

// =============================================================================
// GENERAL UTILITY CONTROLLER (Provides localStorage access to Service Worker)
// =============================================================================

const UtilsController = {
  async init() {
    console.log('[OffscreenBootstrap] Initializing UtilsController...');
    if (window.bus) {
      window.bus.on('utils.ls.get', this._localStorageGet.bind(this));
      window.bus.on('utils.ls.set', this._localStorageSet.bind(this));
      window.bus.on('utils.ls.has', this._localStorageHas.bind(this));
      window.bus.on('utils.ls.remove', this._localStorageRemove.bind(this));
    }
  },

  _localStorageGet(key) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (e) { 
      console.warn('[UtilsController] Failed to get/parse localStorage key:', key);
      return null; 
    }
  },

  _localStorageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[UtilsController] Failed to set localStorage key:', key, e);
      return false; 
    }
  },

  _localStorageHas(key) {
    try {
      return localStorage.getItem(key) !== null;
    } catch (e) {
      console.warn('[UtilsController] Failed to check localStorage key:', key);
      return false;
    }
  },

  _localStorageRemove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error('[UtilsController] Failed to remove localStorage key:', key, e);
      return false;
    }
  }
};

// =============================================================================
// MAIN BOOTSTRAP CONTROLLER
// =============================================================================

const OffscreenBootstrap = {
  _discoverBus() {
    const candidates = [
      { name: 'BusController', ref: window.BusController },
      { name: 'HTOSBusController', ref: window.HTOSBusController },
      { name: '__htos_global.$bus', ref: window.__htos_global?.$bus },
      { name: 'window.bus', ref: window.bus }
    ];
    
    for (const candidate of candidates) {
      if (candidate.ref && typeof candidate.ref.init === 'function') {
        console.log(`[OffscreenBootstrap] Bus discovery: using ${candidate.name}`);
        return candidate.ref;
      }
    }
    
    console.warn('[OffscreenBootstrap] Bus discovery: no suitable bus controller found, falling back to BusController');
    return BusController;
  },

  async init() {
    console.log('[OffscreenBootstrap] Starting initialization inside offscreen.html...');
    
    try {
      // 1. Initialize Bus Controller first
      console.log('[OffscreenBootstrap] Initializing BusController...');
      const busController = this._discoverBus();
      await busController.init();
      window.bus = busController;
      console.log('[OffscreenBootstrap] BusController initialized and available as window.bus');
      
      // 2. Initialize ALL controllers (including keepalive)
      console.log('[OffscreenBootstrap] Initializing specialized controllers...');
      await Promise.all([
        KeepaliveController.init(),  // NEW: Active SW pinging
        IframeController.init(),
        UtilsController.init()
      ]);
      console.log('[OffscreenBootstrap] All specialized controllers initialized successfully');
      
      console.log('[OffscreenBootstrap] âœ… Initialization completed successfully.');
      
    } catch (error) {
      console.error('[OffscreenBootstrap] Initialization failed:', error);
      throw error;
    }
  }
};

// =============================================================================
// EXPORT
// =============================================================================

export { OffscreenBootstrap };