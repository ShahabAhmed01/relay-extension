/**
 * Relay - Storage Utility
 * Wraps chrome.storage.local with typed helpers, compression, and size guards.
 */

const RelayStorage = (() => {
  const KEYS = {
    SESSION:        'relay_session',
    PENDING_INJECT: 'relay_pending',
    SETTINGS:       'relay_settings',
    HISTORY:        'relay_history',
  };

  const DEFAULT_SETTINGS = {
    maxMessages: 30,
    autoCapture: true,
    showFAB: true,
    fabPosition: 'bottom-right',
    fabSize: 'normal',
    theme: 'system',
    includeFullHistory: false,
    confirmBeforeSwitch: false,
  };

  const MIN_MESSAGES = 5;
  const MAX_MESSAGES = 100;
  const MAX_SESSION_BYTES = 1.5 * 1024 * 1024;
  const PENDING_TTL_MS = 5 * 60 * 1000;

  function _getBrowser() {
    if (typeof browser !== 'undefined' && browser.storage) return browser;
    if (typeof chrome !== 'undefined' && chrome.storage) return chrome;
    return null;
  }

  async function _get(key) {
    const api = _getBrowser();
    if (!api) return null;
    try {
      const result = await api.storage.local.get(key);
      return result[key] !== undefined ? result[key] : null;
    } catch (_e) {
      return null;
    }
  }

  async function _set(key, value) {
    const api = _getBrowser();
    if (!api) return false;
    try {
      await api.storage.local.set({ [key]: value });
      return true;
    } catch (_e) {
      return false;
    }
  }

  async function _remove(key) {
    const api = _getBrowser();
    if (!api) return false;
    try {
      await api.storage.local.remove(key);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function _byteSize(value) {
    try {
      return new Blob([JSON.stringify(value)]).size;
    } catch (_e) {
      return JSON.stringify(value || '').length;
    }
  }

  function normalizeMaxMessages(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.maxMessages;
    return Math.min(Math.max(parsed, MIN_MESSAGES), MAX_MESSAGES);
  }

  function normalizeSettings(settings) {
    const merged = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    merged.maxMessages = normalizeMaxMessages(merged.maxMessages);
    merged.autoCapture = merged.autoCapture !== false;
    merged.showFAB = merged.showFAB !== false;
    merged.includeFullHistory = merged.includeFullHistory === true;
    merged.confirmBeforeSwitch = merged.confirmBeforeSwitch === true;
    if (!['bottom-right', 'bottom-left'].includes(merged.fabPosition)) {
      merged.fabPosition = DEFAULT_SETTINGS.fabPosition;
    }
    if (!['normal', 'large'].includes(merged.fabSize)) {
      merged.fabSize = DEFAULT_SETTINGS.fabSize;
    }
    if (!['system', 'dark', 'light'].includes(merged.theme)) {
      merged.theme = DEFAULT_SETTINGS.theme;
    }
    return merged;
  }

  async function _prepareMessages(messages) {
    const settings = await getSettings();
    const list = Array.isArray(messages) ? messages.slice() : [];
    let prepared = settings.includeFullHistory ? list : list.slice(-settings.maxMessages);
    let truncatedBySize = false;

    while (prepared.length > MIN_MESSAGES && _byteSize(prepared) > MAX_SESSION_BYTES) {
      prepared = prepared.slice(1);
      truncatedBySize = true;
    }

    return { messages: prepared, settings, truncatedBySize };
  }

  function _packSession(session) {
    if (typeof RelayCompress === 'undefined') return session;
    try {
      const compressed = RelayCompress.compress(JSON.stringify(session));
      return {
        __compressed: true,
        data: compressed,
        messageCount: session.messageCount,
        platformId: session.platformId,
        platformName: session.platformName,
        capturedAt: session.capturedAt,
        updatedAt: session.updatedAt,
        truncated: session.truncated,
        originalMessageCount: session.originalMessageCount,
      };
    } catch (_e) {
      return session;
    }
  }

  async function saveSession(platformId, platformName, messages) {
    const displayName = platformName || platformId;
    const now = Date.now();
    const existing = await getSession();
    const prepared = await _prepareMessages(messages);
    const session = {
      platformId,
      platformName: displayName,
      messages: prepared.messages,
      capturedAt: (existing && existing.platformId === platformId) ? existing.capturedAt : now,
      updatedAt: now,
      messageCount: prepared.messages.length,
      originalMessageCount: Array.isArray(messages) ? messages.length : 0,
      truncated: prepared.truncatedBySize || (!prepared.settings.includeFullHistory && Array.isArray(messages) && messages.length > prepared.messages.length),
    };

    await _set(KEYS.SESSION, _packSession(session));
    await addToHistory(session);
    return session;
  }

  async function getSession() {
    const raw = await _get(KEYS.SESSION);
    if (!raw) return null;
    try {
      if (raw.__compressed && raw.data && typeof RelayCompress !== 'undefined') {
        return JSON.parse(RelayCompress.decompress(raw.data));
      }
      return raw;
    } catch (_e) {
      return raw;
    }
  }

  async function clearSession() {
    await _remove(KEYS.SESSION);
  }

  async function setPendingInjection(data) {
    if (!data || !data.targetPlatformId || !data.formattedContext) return false;
    const pending = {
      targetPlatformId: String(data.targetPlatformId),
      formattedContext: String(data.formattedContext),
      timestamp: Date.now(),
    };
    return await _set(KEYS.PENDING_INJECT, pending);
  }

  async function getPendingInjection() {
    const pending = await _get(KEYS.PENDING_INJECT);
    if (!pending || !pending.timestamp) return null;
    if (Date.now() - pending.timestamp > PENDING_TTL_MS) {
      await clearPendingInjection();
      return null;
    }
    return pending;
  }

  async function clearPendingInjection() {
    await _remove(KEYS.PENDING_INJECT);
  }

  async function getSettings() {
    const stored = await _get(KEYS.SETTINGS);
    return normalizeSettings(stored);
  }

  async function saveSettings(partial) {
    const current = await getSettings();
    const merged = normalizeSettings(Object.assign({}, current, partial || {}));
    await _set(KEYS.SETTINGS, merged);
    return merged;
  }

  async function addToHistory(session) {
    let history = await getHistory();
    const entry = {
      platformId: session.platformId,
      platformName: session.platformName,
      messageCount: session.messageCount,
      capturedAt: session.capturedAt,
      updatedAt: session.updatedAt,
      truncated: session.truncated === true,
      originalMessageCount: session.originalMessageCount || session.messageCount,
    };
    const exists = history.findIndex((h) => h.capturedAt === entry.capturedAt && h.platformId === entry.platformId);
    if (exists >= 0) {
      history[exists] = entry;
    } else {
      history.unshift(entry);
    }
    if (history.length > 10) history = history.slice(0, 10);
    await _set(KEYS.HISTORY, history);
  }

  async function getHistory() {
    const h = await _get(KEYS.HISTORY);
    return Array.isArray(h) ? h : [];
  }

  async function clearHistory() {
    await _remove(KEYS.HISTORY);
  }

  async function getStorageUsage() {
    const api = _getBrowser();
    if (!api) return { bytes: 0, kb: 0 };
    try {
      const data = await api.storage.local.get(null);
      const bytes = _byteSize(data);
      return { bytes, kb: Math.round(bytes / 1024 * 100) / 100 };
    } catch (_e) {
      return { bytes: 0, kb: 0 };
    }
  }

  async function exportAll() {
    const api = _getBrowser();
    if (!api) return '{}';
    try {
      const data = await api.storage.local.get(null);
      return JSON.stringify(data, null, 2);
    } catch (_e) {
      return '{}';
    }
  }

  return {
    KEYS,
    DEFAULT_SETTINGS,
    MIN_MESSAGES,
    MAX_MESSAGES,
    PENDING_TTL_MS,
    normalizeMaxMessages,
    normalizeSettings,
    saveSession,
    getSession,
    clearSession,
    setPendingInjection,
    getPendingInjection,
    clearPendingInjection,
    getSettings,
    saveSettings,
    addToHistory,
    getHistory,
    clearHistory,
    getStorageUsage,
    exportAll,
  };
})();

if (typeof window !== 'undefined') {
  window.RelayStorage = RelayStorage;
}
