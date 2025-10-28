/**
 * HTOS Lifecycle Manager
 * - Prevents background inactivity
 * - Provides heartbeat/keepalive for long-running tasks
 * - Three-layer defense: alarms, offscreen pings, port keepalives
 */

export class LifecycleManager {
  constructor(ping) {
    this.ping = ping;
    this.keepAlive = false;
    this.heartbeatTimer = null;
    this.isActive = false;
    
    // Adaptive intervals
    this.IDLE_INTERVAL = 5 * 60 * 1000; // 5 minutes when idle
    this.ACTIVE_INTERVAL = 25 * 1000; // 25 seconds when active (below MV3 30s threshold)
    this.ALARM_NAME = 'htos-adaptive-heartbeat';
    
    // Track workflow depth for nested operations
    this.workflowDepth = 0;
    
    // Offscreen document health
    this.offscreenHealthTimer = null;
    this.OFFSCREEN_CHECK_INTERVAL = 60 * 1000; // Check every minute
    
    this.setupWorkflowListeners();
  }

  setupWorkflowListeners() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'workflow.start') {
          this.activateWorkflowMode();
        } else if (message.type === 'workflow.end') {
          this.deactivateWorkflowMode();
        }
      });
    }
  }

  /**
   * PUBLIC: Activate workflow mode (called by ConnectionHandler)
   * Supports nested workflows via depth tracking
   */
  activateWorkflowMode() {
    this.workflowDepth++;
    console.log(`[Lifecycle] Workflow depth: ${this.workflowDepth}`);
    
    if (this.workflowDepth === 1) {
      // First workflow activation
      this.setActiveMode(true);
      this.keepalive(true);
      
      // Immediately ping to reset any pending timeout
      this.executePing().catch(e => 
        console.warn('[Lifecycle] Immediate ping failed:', e)
      );
    }
  }

  /**
   * PUBLIC: Deactivate workflow mode
   * Only returns to idle when all workflows complete
   */
  deactivateWorkflowMode() {
    this.workflowDepth = Math.max(0, this.workflowDepth - 1);
    console.log(`[Lifecycle] Workflow depth: ${this.workflowDepth}`);
    
    if (this.workflowDepth === 0) {
      // All workflows complete
      this.setActiveMode(false);
      this.keepalive(false);
    }
  }

  /**
   * Set active/idle mode with different ping intervals
   */
  setActiveMode(active) {
    if (this.isActive !== active) {
      this.isActive = active;
      const newInterval = active ? this.ACTIVE_INTERVAL : this.IDLE_INTERVAL;
      console.log(`[Lifecycle] Mode: ${active ? 'ACTIVE' : 'IDLE'} (${newInterval}ms)`);
      
      // Restart heartbeat with new interval
      if (this.heartbeatTimer) {
        this.stopHeartbeat();
        this.startHeartbeat(newInterval);
      }
    }
  }

  /**
   * Start heartbeat with optional custom interval
   */
  startHeartbeat(intervalMs) {
    if (intervalMs && intervalMs > 0) {
      this.heartbeatIntervalMs = intervalMs;
    }
    
    if (this.heartbeatTimer) return; // Already running
    
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      this.startAlarmBasedHeartbeat();
    } else {
      this.startTimerBasedHeartbeat();
    }
    
    // Also start offscreen health monitoring
    this.startOffscreenHealthCheck();
  }

  /**
   * Chrome alarms API (survives SW restarts)
   */
  startAlarmBasedHeartbeat() {
    chrome.alarms.clear(this.ALARM_NAME);
    
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === this.ALARM_NAME) {
        this.executePing();
      }
    });
    
    const periodMinutes = this.heartbeatIntervalMs / (1000 * 60);
    chrome.alarms.create(this.ALARM_NAME, {
      delayInMinutes: periodMinutes,
      periodInMinutes: periodMinutes
    });
    
    this.heartbeatTimer = 1; // Mark as active
    this.executePing(); // Immediate first ping
  }

  /**
   * Timer-based fallback (for non-alarm contexts)
   */
  startTimerBasedHeartbeat() {
    const tick = async () => {
      await this.executePing();
      this.heartbeatTimer = setTimeout(tick, this.heartbeatIntervalMs);
    };
    
    this.heartbeatTimer = setTimeout(tick, 0);
  }

  /**
   * Execute a ping to keep SW alive
   * Multi-strategy approach
   */
  async executePing() {
    try {
      // Strategy 1: Custom ping function (if provided)
      if (this.ping) {
        await this.ping();
      }
      
      // Strategy 2: Ping offscreen document
      if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
        try {
          await chrome.runtime.sendMessage({ 
            type: 'htos.keepalive',
            timestamp: Date.now() 
          });
        } catch (e) {
          // Offscreen might not exist yet, non-fatal
        }
      }
      
      // Strategy 3: Ensure offscreen exists
      await this.ensureOffscreenDocument();
      
      console.log('[Lifecycle] Ping executed successfully');
    } catch (e) {
      console.warn('[Lifecycle] Ping failed:', e);
    }
  }

  /**
   * Ensure offscreen document exists (self-healing)
   */
  async ensureOffscreenDocument() {
    if (typeof chrome === 'undefined' || !chrome.offscreen) {
      return;
    }
    
    try {
      const hasDoc = await chrome.offscreen.hasDocument();
      
      if (!hasDoc) {
        console.warn('[Lifecycle] Offscreen document missing, recreating...');
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: [
            chrome.offscreen.Reason.BLOBS,
            chrome.offscreen.Reason.DOM_PARSER
          ],
          justification: 'HTOS requires persistent offscreen document for SW keepalive and complex operations'
        });
        console.log('[Lifecycle] Offscreen document recreated');
      }
    } catch (e) {
      // Non-fatal: offscreen might already exist or be in creation
      if (!e.message?.includes('Only a single offscreen')) {
        console.warn('[Lifecycle] Offscreen check failed:', e);
      }
    }
  }

  /**
   * Monitor offscreen document health
   */
  startOffscreenHealthCheck() {
    if (this.offscreenHealthTimer) return;
    
    this.offscreenHealthTimer = setInterval(async () => {
      await this.ensureOffscreenDocument();
    }, this.OFFSCREEN_CHECK_INTERVAL);
  }

  /**
   * Stop all heartbeat mechanisms
   */
  stopHeartbeat() {
    // Stop alarms
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.clear(this.ALARM_NAME);
    }
    
    // Stop timers
    if (this.heartbeatTimer && typeof this.heartbeatTimer === 'number') {
      clearTimeout(this.heartbeatTimer);
    }
    
    if (this.offscreenHealthTimer) {
      clearInterval(this.offscreenHealthTimer);
      this.offscreenHealthTimer = null;
    }
    
    this.heartbeatTimer = null;
  }

  /**
   * Master keepalive control
   */
  keepalive(enable) {
    this.keepAlive = !!enable;
    
    if (enable) {
      if (!this.heartbeatTimer) {
        this.startHeartbeat();
      }
    } else {
      // Only stop if no workflows active
      if (this.workflowDepth === 0) {
        this.stopHeartbeat();
      }
    }
  }

  /**
   * Force immediate aggressive mode (for critical operations)
   */
  async forceActive(durationMs = 60000) {
    const originalMode = this.isActive;
    const originalDepth = this.workflowDepth;
    
    this.workflowDepth = 1; // Prevent deactivation
    this.setActiveMode(true);
    this.keepalive(true);
    
    // Ping immediately and repeatedly
    await this.executePing();
    
    // Auto-restore after duration
    setTimeout(() => {
      this.workflowDepth = originalDepth;
      this.setActiveMode(originalMode);
      if (originalDepth === 0) {
        this.keepalive(false);
      }
    }, durationMs);
  }
}