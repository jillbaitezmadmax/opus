// Chrome Storage Promise Wrapper
// Provides Promise-based interface for chrome.storage.local operations with proper error handling

/**
 * Promise-based wrapper for chrome.storage.local.get
 * @param keys - Keys to retrieve (string, array of strings, or null for all)
 * @returns Promise that resolves with the retrieved data or rejects on error
 */
export function get(keys?: string | string[] | null): Promise<{ [key: string]: any }> {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) {
      reject(new Error('Chrome storage API not available'));
      return;
    }

    // Ensure we never pass undefined to chrome.storage.local.get
    chrome.storage.local.get(keys ?? null, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Promise-based wrapper for chrome.storage.local.set
 * @param items - Object with key-value pairs to store
 * @returns Promise that resolves when storage is complete or rejects on error
 */
export function set(items: { [key: string]: any }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) {
      reject(new Error('Chrome storage API not available'));
      return;
    }

    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Promise-based wrapper for chrome.storage.local.remove
 * @param keys - Keys to remove (string or array of strings)
 * @returns Promise that resolves when removal is complete or rejects on error
 */
export function remove(keys: string | string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) {
      reject(new Error('Chrome storage API not available'));
      return;
    }

    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Promise-based wrapper for chrome.storage.local.clear
 * @returns Promise that resolves when storage is cleared or rejects on error
 */
export function clear(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) {
      reject(new Error('Chrome storage API not available'));
      return;
    }

    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Check if chrome storage is available
 * @returns boolean indicating if chrome.storage.local is available
 */
export function isAvailable(): boolean {
  return !!(chrome?.storage?.local);
}