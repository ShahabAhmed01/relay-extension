/**
 * Relay — Main Content Script Orchestrator
 * Immediate capture + lifecycle-aware SPA navigation + change-detected saves
 * + retry injection. Keyboard shortcut is owned solely by the manifest command.
 */

(function RelayContentInit() {
  'use strict';

  if (typeof RelayStorage === 'undefined' || typeof RelayPlatforms === 'undefined') return;

  var platform = null;
  try {
    platform = RelayPlatforms.detectPlatform(window.location.hostname, window.location.pathname);
  } catch (_e) {}
  if (!platform) return;

  var scraper = null;
  var lastSaveAt = 0;
  var lastCaptureSig = null;
  var saveInFlight = null;
  var fallbackToastShown = false;
  var SAVE_DEBOUNCE = 1200;
  var lastUrl = window.location.href;
  var navTimer = null;

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
        // Change detection: mutations re-fire constantly on streaming chats,
        // so skip the save when the conversation signature is unchanged.
        var sig = raw.length + '|' +
          ((raw[0] && raw[0].content) || '').slice(0, 120) + '|' +
          ((raw[raw.length - 1] && raw[raw.length - 1].content) || '').slice(0, 120);
        if (reason !== 'immediate' && sig === lastCaptureSig) return;
        lastCaptureSig = sig;
        // Native selectors failed and we fell back to the generic parser —
        // warn once instead of silently transferring possibly-garbled context.
        if (scraper.usedGeneric && !fallbackToastShown && typeof RelayToast !== 'undefined') {
          fallbackToastShown = true;
          try {
            RelayToast.show('Relay: using fallback capture on this site — verify context before switching.', 'warning', 5000);
          } catch (_e0) {}
        }
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
      if (window.location.href === lastUrl) return;
      lastUrl = window.location.href;
      debug('spa nav', lastUrl);
      try { if (scraper && scraper.disconnect) scraper.disconnect(); } catch (_e) {}
      startObserver();
      captureNow('immediate');
    }
    // Framework routers announce navigation via the History API — wrap it.
    try {
      var push = history.pushState;
      history.pushState = function () {
        var r = push.apply(this, arguments);
        setTimeout(check, 60);
        return r;
      };
    } catch (_e) {}
    try {
      var replace = history.replaceState;
      history.replaceState = function () {
        var r = replace.apply(this, arguments);
        setTimeout(check, 60);
        return r;
      };
    } catch (_e2) {}
    window.addEventListener('popstate', check);
    window.addEventListener('hashchange', check);
    // Low-frequency safety net for routers that bypass the History API.
    navTimer = setInterval(check, 5000);
  }

  function teardown() {
    try { if (navTimer) clearInterval(navTimer); } catch (_e) {}
    try { if (scraper && scraper.disconnect) scraper.disconnect(); } catch (_e2) {}
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
      window.addEventListener('beforeunload', teardown);
      window.addEventListener('pagehide', teardown);
      setTimeout(function () { captureNow('immediate'); }, 800);
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
          } else if (message.type === 'TOGGLE_PANEL') {
            if (typeof FloatingUI !== 'undefined') FloatingUI.togglePanel();
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
  }

  boot();
})();

