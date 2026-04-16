// Simple localStorage-based storage to replace window.storage from Claude.ai
const STORAGE_PREFIX = "revise_";

export const storage = {
  async get(key) {
    try {
      const value = localStorage.getItem(STORAGE_PREFIX + key);
      if (value === null) return null;
      return { key, value };
    } catch (e) {
      return null;
    }
  },

  async set(key, value) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, value);
      return { key, value };
    } catch (e) {
      console.error("Storage set error:", e);
      return null;
    }
  },

  async delete(key) {
    try {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return { key, deleted: true };
    } catch (e) {
      return null;
    }
  },

  async list(prefix = "") {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX + prefix)) {
          keys.push(k.substring(STORAGE_PREFIX.length));
        }
      }
      return { keys, prefix };
    } catch (e) {
      return { keys: [], prefix };
    }
  },
};
