/**
 * Relay v1.1.0 — Main Content Script Orchestrator
 * Immediate capture + SPA navigation + single-save debounce + retry injection.
 */

(function RelayContentInit() {
  'use strict';

  if (typeof RelayStorage === 'undefined' || typeof RelayPlatforms === 'undefined') return;

  var platform = null;
  try { platform = RelayPlatforms.detectPlatform(window.location.hostname); } catch (_e) {}
  if (!platform) return;

  var scraper = null;
  var lastSaveAt = 0;
  var saveInFlight = null;
  var SAVE_DEBOUNCE = 1200;
  var lastUrl = window.location.href;

  function debug() {
    try {
      if (window.__RELAY_DEBUG) console.debug.apply(console, ['[relay]'].concat([].slice.call(arguments)));
    } catch (_e) {}
  }

  async function captureNow(reason) {
    if (!scraper) return;
    var now = Date.now();
    if (now - lastSaveAt < SAVE_DEBOUNCE && reason !== 'immediate') return;
    lastSaveAt = now;
    if (saveInFlight) { try { await saveInFlight; } catch (_e) {} }
    saveInFlight = (async function () {
      try {
        var raw = scraper.scrapeMessages ? scraper.scrapeMessages() : [];
        if (!raw || !raw.length) return;
        var cleaned = (typeof RelaySanitize !== 'undefined')
          ? RelaySanitize.sanitizeForStorage(raw) : raw;
        if (!cleaned.length) return;
        await RelayStorage.saveSession(platform.id, platform.name, cleaned);
        if (typeof FloatingUI !== 'undefined') {
          try { FloatingUI.setFABPulse(true); } catch (_e2) {}
        }
        try {
          var api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
          if (api && api.runtime && api.runtime.sendMessage) {
            api.runtime.sendMessage({ type: 'UPDATE_BADGE' }).catch(function () {});
          }
        } catch (_e3) {}
        debug('captured', reason, cleaned.length);
      } catch (err) { debug('capture failed', err); }
    })();
    try { await saveInFlight; } finally { saveInFlight = null; }
  }

  function onMutations() { captureNow('mutation'); }

  function startObserver() {
    if (!scraper || !scraper.observe) return;
    try { scraper.observe(onMutations); } catch (_e) {}
  }

  function watchSpaNav() {
    function check() {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        debug('spa nav', lastUrl);
        try { if (scraper && scraper.disconnect) scraper.disconnect(); } catch (_e) {}
        startObserver();
        captureNow('immediate');
      }
    }
    setInterval(check, 1500);
    window.addEventListener('popstate', function () { setTimeout(check, 100); });
    try {
      var push = history.pushState;
      history.pushState = function () {
        var r = push.apply(this, arguments);
        setTimeout(check, 100);
        return r;
      };
    } catch (_e) {}
  }

  async function boot() {
    var settings = await RelayStorage.getSettings();
    try { window.__RELAY_DEBUG = !!settings.debug; } catch (_e) {}
    if (typeof FloatingUI !== 'undefined') {
      try { await FloatingUI.init(); } catch (_e2) {}
    }
    if (typeof InjectorManager !== 'undefined') {
      try { scraper = InjectorManager.getScraper(platform.id); } catch (_e3) { scraper = null; }
    }
    if (settings.autoCapture && scraper) {
      startObserver();
      watchSpaNav();
      setTimeout(function () { captureNow('immediate'); }, 800);
      window.addEventListener('beforeunload', function () {
        try { if (scraper.disconnect) scraper.disconnect(); } catch (_e4) {}
      });
    }
    if (typeof InjectorManager !== 'undefined' && InjectorManager.checkAndInject) {
      try { await InjectorManager.checkAndInject(); } catch (_e5) {}
    }
    var api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
    if (api && api.runtime && api.runtime.onMessage) {
      api.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
        try {
          if (!message || typeof message.type !== 'string') return false;
          if (message.type === 'OPEN_PANEL') {
            if (typeof FloatingUI !== 'undefined') FloatingUI.openPanel();
            sendResponse({ success: true });
          } else if (message.type === 'GET_SESSION') {
            RelayStorage.getSession().then(function (session) { sendResponse({ session: session }); });
            return true;
          } else if (message.type === 'RETRY_INJECTION') {
            if (typeof InjectorManager !== 'undefined') {
              InjectorManager.checkAndInject().then(
                function (r) { sendResponse({ success: true, result: r }); },
                function (e) { sendResponse({ success: false, error: String(e) }); }
              );
              return true;
            }
            sendResponse({ success: false });
          } else if (message.type === 'PING') {
            sendResponse({ success: true });
          }
        } catch (err) {
          try { sendResponse({ success: false, error: String(err) }); } catch (_e6) {}
        }
        return false;
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        try { if (typeof FloatingUI !== 'undefined') FloatingUI.togglePanel(); } catch (_e7) {}
      }
    });
  }

  boot();
})();

