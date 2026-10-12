/**
 * Relay v2 — Settings & small-state storage (chrome.storage.local).
 *
 * The canonical conversation archive lives in IndexedDB (utils/archive.js);
 * this module now handles ONLY settings and tiny transient pointers.
 * There is deliberately no session/message path here anymore: the v1
 * code path that silently replaced a full session with five messages on
 * quota errors is gone. Quotas are now surfaced honestly by the archive
 * layer instead of being "solved" by deleting user data.
 */

var RelayStorage = (function () {
  'use strict';

  var KEYS = {
    SETTINGS: 'relay_settings',
    LEGACY_SESSION: 'relay_session',   // v1 data — migrated, never written by v2
    LEGACY_HISTORY: 'relay_history',   // v1 data — migrated, never written by v2
    ACTIVE_TAB: 'relay_active_pointer', // {transferId} — which transfer a tab should pick up
    MIGRATION: 'relay_migration_v2',
  };

  var DEFAULT_SETTINGS = {
    // Capture
    autoCapture: true,
    pausePlatforms: [],
    captureAttachments: false, // opt-in: store attachment bytes locally
    // Handoff
    handoffMode: 'full',       // 'full' | 'multipart' | 'continuation'
    partBudget: 15000,
    continuationCount: 30,
    autoInsert: true,          // insert into the composer on arrival (never auto-send)
    confirmBeforeSwitch: false,
    includeBrief: false,
    copyMarkdown: true,
    // Appearance
    showFAB: true,
    fabPosition: 'bottom-right',
    fabSize: 'normal',
    theme: 'system',
    // Diagnostics
    debug: false,
  };

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
    } catch (_e) { return false; }
  }

  function clampInt(value, min, max, fallback) {
    var n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
  }

  /**
   * Merge stored settings with defaults and normalize. Tolerates and maps
   * v1 keys so existing users keep their intent after the upgrade:
   *   includeFullHistory=true  -> handoffMode 'full'
   *   includeFullHistory=false  -> handoffMode 'continuation'
   *   maxMessages (5-200)       -> continuationCount
   *   autoInject                -> autoInsert
   */
  function normalizeSettings(stored) {
    var s = Object.assign({}, DEFAULT_SETTINGS, stored || {});
    s.autoCapture = s.autoCapture !== false;
    s.captureAttachments = s.captureAttachments === true;
    s.autoInsert = s.autoInject !== undefined ? s.autoInject !== false : s.autoInsert !== false;
    delete s.autoInject;

    var explicitMode = ['full', 'multipart', 'continuation'].indexOf(s.handoffMode) >= 0 &&
      stored && stored.handoffMode !== undefined;
    if (stored && stored.includeFullHistory !== undefined && !explicitMode) {
      s.handoffMode = stored.includeFullHistory === true ? 'full' : 'continuation';
    }
    if (['full', 'multipart', 'continuation'].indexOf(s.handoffMode) < 0) {
      s.handoffMode = DEFAULT_SETTINGS.handoffMode;
    }
    if (stored && stored.maxMessages !== undefined && s.handoffMode === 'continuation' &&
        stored.continuationCount === undefined) {
      s.continuationCount = clampInt(stored.maxMessages, 1, 200, DEFAULT_SETTINGS.continuationCount);
    }
    s.continuationCount = clampInt(s.continuationCount, 1, 200, DEFAULT_SETTINGS.continuationCount);
    s.partBudget = clampInt(s.partBudget, 4000, 120000, DEFAULT_SETTINGS.partBudget);

    s.confirmBeforeSwitch = s.confirmBeforeSwitch === true;
    s.includeBrief = s.includeBrief === true;
    s.copyMarkdown = s.copyMarkdown !== false;
    s.showFAB = s.showFAB !== false;
    s.debug = s.debug === true;
    if (['bottom-right', 'bottom-left', 'top-right', 'top-left'].indexOf(s.fabPosition) < 0) {
      s.fabPosition = DEFAULT_SETTINGS.fabPosition;
    }
    if (['normal', 'large'].indexOf(s.fabSize) < 0) s.fabSize = DEFAULT_SETTINGS.fabSize;
    if (['system', 'dark', 'light'].indexOf(s.theme) < 0) s.theme = DEFAULT_SETTINGS.theme;
    if (!Array.isArray(s.pausePlatforms)) s.pausePlatforms = [];
    s.pausePlatforms = s.pausePlatforms.filter(function (p) { return typeof p === 'string'; });
    return s;
  }

  async function getSettings() {
    return normalizeSettings(await _get(KEYS.SETTINGS));
  }

  async function saveSettings(partial) {
    var current = await getSettings();
    var merged = normalizeSettings(Object.assign({}, current, partial || {}));
    var ok = await _set(KEYS.SETTINGS, merged);
    if (!ok) throw new Error('Could not save settings (storage write failed)');
    return merged;
  }

  // Small pointer for "this tab should pick up transfer X on arrival".
  async function setActiveTransferPointer(transferId) { return _set(KEYS.ACTIVE_TAB, { transferId: transferId, at: Date.now() }); }
  async function getActiveTransferPointer() { return _get(KEYS.ACTIVE_TAB); }

  async function isCapturePaused(platformId) {
    var s = await getSettings();
    if (!s.autoCapture) return { paused: true, scope: 'global' };
    if (s.pausePlatforms.indexOf(platformId) !== -1) return { paused: true, scope: 'platform' };
    return { paused: false };
  }

  async function getStorageUsage() {
    var api = _getBrowser();
    if (!api) return { bytes: 0, kb: 0, warn: false };
    try {
      var bytes = 0;
      if (api.storage.local.getBytesInUse) {
        try { bytes = await api.storage.local.getBytesInUse(null); } catch (_e2) { bytes = 0; }
      }
      if (!bytes) {
        var data = await api.storage.local.get(null);
        try { bytes = new TextEncoder().encode(JSON.stringify(data)).length; } catch (_e3) { bytes = 0; }
      }
      return { bytes: bytes, kb: Math.round((bytes / 1024) * 100) / 100, warn: false };
    } catch (_e) { return { bytes: 0, kb: 0, warn: false }; }
  }

  return {
    KEYS: KEYS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalizeSettings: normalizeSettings,
    getSettings: getSettings,
    saveSettings: saveSettings,
    setActiveTransferPointer: setActiveTransferPointer,
    getActiveTransferPointer: getActiveTransferPointer,
    isCapturePaused: isCapturePaused,
    getStorageUsage: getStorageUsage,
  };
})();

if (typeof window !== 'undefined') window.RelayStorage = RelayStorage;
if (typeof module !== 'undefined' && module.exports) module.exports = RelayStorage;
