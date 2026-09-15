/**
 * Relay v1.1.0 — Storage Utility
 * Typed helpers, LZ compression, quota-aware truncation, 30-min TTL, 25 history.
 */

var RelayStorage = (function () {
  'use strict';

  var KEYS = {
    SESSION: 'relay_session',
    PENDING_INJECT: 'relay_pending',
    SETTINGS: 'relay_settings',
    HISTORY: 'relay_history',
  };

  var DEFAULT_SETTINGS = {
    maxMessages: 30,
    autoCapture: true,
    showFAB: true,
    fabPosition: 'bottom-right',
    fabSize: 'normal',
    theme: 'system',
    includeFullHistory: false,
    confirmBeforeSwitch: false,
    autoInject: true,
    copyMarkdown: true,
    maxChars: 120000,
    debug: false,
  };

  var MIN_MESSAGES = 5;
  var MAX_MESSAGES = 200;
  var MAX_SESSION_BYTES = 1.5 * 1024 * 1024;
  var MAX_SESSION_CHARS = 150000;
  var PENDING_TTL_MS = 30 * 60 * 1000;
  var HISTORY_LIMIT = 25;
  var WARN_BYTES = 7 * 1024 * 1024;

  function _getBrowser() {
    if (typeof browser !== 'undefined' && browser.storage) return browser;
    if (typeof chrome !== 'undefined' && chrome.storage) return chrome;
    return null;
  }

  async function _get(key) {
    var api = _getBrowser();
    if (!api) return null;
    try {
      var result = await api.storage.local.get(key);
      return result[key] !== undefined ? result[key] : null;
    } catch (_e) { return null; }
  }

  async function _set(key, value) {
    var api = _getBrowser();
    if (!api) return false;
    try {
      var o = {}; o[key] = value;
      await api.storage.local.set(o);
      return true;
    } catch (e) {
      try {
        if (e && /quota/i.test(String((e && e.message) || e))) {
          if (key === KEYS.SESSION && value && Array.isArray(value.messages)) {
            var slim = value.messages.slice(-MIN_MESSAGES);
            value = Object.assign({}, value, { messages: slim, messageCount: slim.length, truncated: true });
            var o2 = {}; o2[key] = value;
            await api.storage.local.set(o2);
            return true;
          }
        }
      } catch (_e2) {}
      return false;
    }
  }

  async function _remove(key) {
    var api = _getBrowser();
    if (!api) return false;
    try { await api.storage.local.remove(key); return true; } catch (_e) { return false; }
  }

  function _byteSize(value) {
    try {
      if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(JSON.stringify(value)).length;
      return new Blob([JSON.stringify(value)]).size;
    } catch (_e) {
      try { return JSON.stringify(value || '').length; } catch (_e2) { return 0; }
    }
  }

  function _totalChars(messages) {
    var n = 0;
    for (var i = 0; i < messages.length; i++) n += String(messages[i].content || '').length;
    return n;
  }

  function normalizeMaxMessages(value) {
    var parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.maxMessages;
    return Math.min(Math.max(parsed, MIN_MESSAGES), MAX_MESSAGES);
  }

  function normalizeSettings(settings) {
    var merged = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    merged.maxMessages = normalizeMaxMessages(merged.maxMessages);
    merged.autoCapture = merged.autoCapture !== false;
    merged.showFAB = merged.showFAB !== false;
    merged.includeFullHistory = merged.includeFullHistory === true;
    merged.confirmBeforeSwitch = merged.confirmBeforeSwitch === true;
    merged.autoInject = merged.autoInject !== false;
    merged.copyMarkdown = merged.copyMarkdown !== false;
    merged.debug = merged.debug === true;
    var mc = Number.parseInt(merged.maxChars, 10);
    merged.maxChars = Number.isFinite(mc) ? Math.min(Math.max(mc, 20000), 500000) : DEFAULT_SETTINGS.maxChars;
    if (['bottom-right', 'bottom-left', 'top-right', 'top-left'].indexOf(merged.fabPosition) < 0) {
      merged.fabPosition = DEFAULT_SETTINGS.fabPosition;
    }
    if (!['normal', 'large'].includes(merged.fabSize)) merged.fabSize = DEFAULT_SETTINGS.fabSize;
    if (!['system', 'dark', 'light'].includes(merged.theme)) merged.theme = DEFAULT_SETTINGS.theme;
    return merged;
  }

  async function _prepareMessages(messages) {
    var settings = await getSettings();
    var list = Array.isArray(messages) ? messages.slice() : [];
    var prepared = settings.includeFullHistory ? list : list.slice(-settings.maxMessages);
    var truncated = !settings.includeFullHistory && list.length > prepared.length;
    var budget = Math.min(settings.maxChars || MAX_SESSION_CHARS, MAX_SESSION_CHARS);
    while (prepared.length > MIN_MESSAGES && _totalChars(prepared) > budget) {
      prepared = prepared.slice(1);
      truncated = true;
    }
    var guard = 0;
    while (prepared.length > MIN_MESSAGES && _byteSize(prepared) > MAX_SESSION_BYTES && guard++ < 300) {
      prepared = prepared.slice(1);
      truncated = true;
    }
    return { messages: prepared, settings: settings, truncated: truncated };
  }

    function _packSession(session) {
    try {
      var json = JSON.stringify(session);
      var compressed = RelayCompress.compress(json);
      if (compressed && compressed.length < json.length) {
        return {
          __compressed: true, data: compressed, messageCount: session.messageCount,
          platformId: session.platformId, platformName: session.platformName,
          capturedAt: session.capturedAt, updatedAt: session.updatedAt,
          truncated: session.truncated, originalMessageCount: session.originalMessageCount, v: 2,
        };
      }
      return session;
    } catch (_e) { return session; }
  }

  function _unpackSession(raw) {
    if (!raw) return null;
    try {
      if (raw.__compressed && raw.data && typeof RelayCompress !== 'undefined') {
        var s = RelayCompress.decompress(raw.data);
        if (s) return JSON.parse(s);
      }
      return raw;
    } catch (_e) { return raw; }
  }

  async function saveSession(platformId, platformName, messages) {
    var now = Date.now();
    var existing = await getSession();
    var prepared = await _prepareMessages(messages);
    var session = {
      platformId: platformId,
      platformName: platformName || platformId,
      messages: prepared.messages,
      capturedAt: (existing && existing.platformId === platformId && existing.capturedAt) || now,
      updatedAt: now,
      messageCount: prepared.messages.length,
      originalMessageCount: Array.isArray(messages) ? messages.length : 0,
      truncated: !!prepared.truncated,
      v: 2,
    };
    if (!session.messages.length && existing && existing.messages && existing.messages.length) return existing;

    await _set(KEYS.SESSION, _packSession(session));
    await addToHistory(session);
    return session;
  }

  async function getSession() {
    var raw = await _get(KEYS.SESSION);
    return _unpackSession(raw);
  }

  async function clearSession() { await _remove(KEYS.SESSION); }

  async function setPendingInjection(data) {
    if (!data || !data.targetPlatformId || !data.formattedContext) return false;
    var pending = {
      targetPlatformId: String(data.targetPlatformId),
      formattedContext: String(data.formattedContext),
      sourcePlatformId: data.sourcePlatformId ? String(data.sourcePlatformId) : null,
      attempts: Number(data.attempts) || 0,
      timestamp: Date.now(), v: 2,
    };
    return await _set(KEYS.PENDING_INJECT, pending);
  }

  async function getPendingInjection() {
    var pending = await _get(KEYS.PENDING_INJECT);
    if (!pending || !pending.timestamp) return null;
    if (Date.now() - pending.timestamp > PENDING_TTL_MS) {
      await clearPendingInjection();
      return null;
    }
    return pending;
  }

  async function bumpPendingAttempts() {
    var p = await _get(KEYS.PENDING_INJECT);
    if (!p) return null;
    p.attempts = (Number(p.attempts) || 0) + 1;
    await _set(KEYS.PENDING_INJECT, p);
    return p;
  }

  async function clearPendingInjection() { await _remove(KEYS.PENDING_INJECT); }

  async function getSettings() {
    var stored = await _get(KEYS.SETTINGS);
    return normalizeSettings(stored);
  }

  async function saveSettings(partial) {
    var current = await getSettings();
    var merged = normalizeSettings(Object.assign({}, current, partial || {}));
    await _set(KEYS.SETTINGS, merged);
    return merged;
  }

  async function addToHistory(session) {
    var history = await getHistory();
    var entry = {
      platformId: session.platformId, platformName: session.platformName,
      messageCount: session.messageCount, capturedAt: session.capturedAt, updatedAt: session.updatedAt,
      truncated: session.truncated === true,
      originalMessageCount: session.originalMessageCount || session.messageCount,
    };
    var i = history.findIndex(function (h) { return h.capturedAt === entry.capturedAt && h.platformId === entry.platformId; });
    if (i >= 0) history[i] = entry;
    else history.unshift(entry);
    if (history.length > HISTORY_LIMIT) history = history.slice(0, HISTORY_LIMIT);
    await _set(KEYS.HISTORY, history);
  }

  async function getHistory() {
    var h = await _get(KEYS.HISTORY);
    return Array.isArray(h) ? h : [];
  }

  async function clearHistory() { await _remove(KEYS.HISTORY); }

  async function getStorageUsage() {
    var api = _getBrowser();
    if (!api) return { bytes: 0, kb: 0, warn: false };
    try {
      var quota = 0;
      try {
        if (api.storage.local.getBytesInUse) quota = await api.storage.local.getBytesInUse(null);
      } catch (_e) {}
      var data = await api.storage.local.get(null);
      var bytes = quota || _byteSize(data);
      return { bytes: bytes, kb: Math.round((bytes / 1024) * 100) / 100, quota: quota, warn: bytes > WARN_BYTES };
    } catch (_e) { return { bytes: 0, kb: 0, warn: false }; }
  }

  async function exportAll() {
    var api = _getBrowser();
    if (!api) return '{}';
    try {
      var data = await api.storage.local.get(null);
      if (data && data[KEYS.SESSION]) data[KEYS.SESSION] = _unpackSession(data[KEYS.SESSION]);
      return JSON.stringify({ exportedAt: new Date().toISOString(), version: 2, data: data }, null, 2);
    } catch (_e) { return '{}'; }
  }

  return {
    KEYS: KEYS, DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    MIN_MESSAGES: MIN_MESSAGES, MAX_MESSAGES: MAX_MESSAGES,
    PENDING_TTL_MS: PENDING_TTL_MS, HISTORY_LIMIT: HISTORY_LIMIT,
    normalizeMaxMessages: normalizeMaxMessages, normalizeSettings: normalizeSettings,
    saveSession: saveSession, getSession: getSession, clearSession: clearSession,
    setPendingInjection: setPendingInjection, getPendingInjection: getPendingInjection,
    bumpPendingAttempts: bumpPendingAttempts, clearPendingInjection: clearPendingInjection,
    getSettings: getSettings, saveSettings: saveSettings,
    addToHistory: addToHistory, getHistory: getHistory, clearHistory: clearHistory,
    getStorageUsage: getStorageUsage, exportAll: exportAll,
  };
})();

if (typeof window !== 'undefined') window.RelayStorage = RelayStorage;
if (typeof module !== 'undefined' && module.exports) module.exports = RelayStorage;
