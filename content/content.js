/**
 * Relay v2 — Main Content Script Orchestrator.
 *
 * Capture pipeline:
 *  scrape -> fingerprint signature (multiset) -> unchanged? skip
 *         -> CAPTURE_BATCH to background -> background reconciles into
 *            the IndexedDB archive atomically -> result feeds the panel
 *            health display and badge.
 *
 * Reliability rules implemented here:
 *  - Empty DOM during SPA navigation never wipes or marks the archive.
 *  - Change detection covers mid-conversation edits, streaming growth,
 *    repeated identical messages and scroll-window changes (multiset of
 *    role+content fingerprints, not count + first/last excerpts).
 *  - Streaming messages save with a shorter debounce.
 *  - Full-capture runs on request from the panel; it only scrolls.
 */

(function RelayContentInit() {
  'use strict';

  if (typeof RelayStorage === 'undefined' || typeof RelayPlatforms === 'undefined') return;

  var platform = null;
  try {
    platform = RelayPlatforms.detectPlatform(window.location.hostname, window.location.pathname);
  } catch (_e) {}
  if (!platform) return;

  function api() {
    return (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  }
  function send(message) { return api().runtime.sendMessage(message); }

  var scraper = null;
  var lastSignature = null;
  var captureTimer = null;
  var saveInFlight = null;
  var lastSaveResult = null;
  var fallbackToastShown = false;
  var fullCaptureRun = null;
  var lastUrl = window.location.href;
  var navTimer = null;
  var lastCaptureAt = 0;

  var DEBOUNCE_MS = 1200;
  var STREAM_DEBOUNCE_MS = 500;
  var MIN_INTERVAL_MS = 400;

  function debug() {
    try {
      if (window.__RELAY_DEBUG) console.debug.apply(console, ['[relay]'].concat([].slice.call(arguments)));
    } catch (_e) {}
  }

  // --- Change detection (multiset of fingerprints) --------------------------

  function fingerprintOf(role, content) {
    if (typeof RelayReconcile !== 'undefined') return RelayReconcile.fingerprint(role, content);
    return role + ':' + String(content || '').length;
  }

  function signatureOf(messages) {
    var counts = new Map();
    messages.forEach(function (m) {
      var fp = fingerprintOf(m.role, m.content);
      counts.set(fp, (counts.get(fp) || 0) + 1);
    });
    var parts = [];
    counts.forEach(function (n, fp) { parts.push(fp + 'x' + n); });
    parts.sort();
    return parts.join('|');
  }

  // --- Capture ---------------------------------------------------------------

  async function captureNow(reason) {
    if (!scraper) return;
    if (captureTimer) { clearTimeout(captureTimer); captureTimer = null; }
    var now = Date.now();
    if (now - lastCaptureAt < MIN_INTERVAL_MS && reason !== 'immediate') return;

    if (saveInFlight) { try { await saveInFlight; } catch (_e) {} }
    saveInFlight = (async function () {
      try {
        var raw = scraper.scrapeMessages ? scraper.scrapeMessages() : [];
        // Empty DOM guard: during SPA navigation platforms briefly render
        // nothing. Never treat that as "conversation gone".
        if (!raw || !raw.length) return;

        var sig = signatureOf(raw);
        if (sig === lastSignature) return; // nothing actually changed

        if (scraper.usedGeneric && !fallbackToastShown && typeof RelayToast !== 'undefined') {
          fallbackToastShown = true;
          try {
            RelayToast.show('Relay: native selectors failed here — using fallback capture. Verify the context before switching.', 'warning', 6000);
          } catch (_e0) {}
        }

        // Opt-in attachment capture: fetch same-origin attachment bytes.
        var settings = await RelayStorage.getSettings();
        var messages = raw;
        if (settings.captureAttachments) {
          messages = await Promise.all(raw.map(function (m) { return maybeFetchAttachments(m); }));
        }

        lastSignature = sig;
        lastCaptureAt = Date.now();
        var resp = await send({
          type: 'CAPTURE_BATCH',
          platformId: platform.id,
          url: window.location.href,
          title: document.title || '',
          messages: messages,
        });
        lastSaveResult = resp && resp.ok ? resp : { ok: false, error: resp && resp.error, detail: resp && resp.detail };
        debug('captured', reason, messages.length, lastSaveResult);

        if (lastSaveResult && lastSaveResult.ok) {
          if (typeof FloatingUI !== 'undefined') {
            try { FloatingUI.onCaptureResult(lastSaveResult.result); } catch (_e2) {}
          }
        } else if (lastSaveResult && lastSaveResult.error === 'quota') {
          // Honest failure: the batch was NOT saved. Reset the signature so
          // the next mutation retries automatically once space is freed.
          lastSignature = null;
          if (typeof RelayToast !== 'undefined') {
            try {
              RelayToast.show('Relay: storage is full — the latest messages could NOT be saved. Export or free space; earlier messages are safe.', 'error', 9000);
            } catch (_e3) {}
          }
          if (typeof FloatingUI !== 'undefined') {
            try { FloatingUI.onCaptureQuotaFailure(); } catch (_e4) {}
          }
        }
      } catch (err) {
        debug('capture failed', err);
      }
    })();
    try { await saveInFlight; } finally { saveInFlight = null; }
  }

  async function maybeFetchAttachments(message) {
    if (!Array.isArray(message.attachments) || !message.attachments.length) return message;
    var out = Object.assign({}, message);
    out.attachments = await Promise.all(message.attachments.map(async function (att) {
      if (!att || att.status !== 'reference' || !att.url) return att;
      // Only same-origin fetches: host permissions cover the site itself.
      // relay-audit: same-origin-fetch — opt-in attachment capture; the URL
      // is always derived from the conversation's own page origin, never a
      // literal remote address, and only when the user enabled the setting.
      try {
        var parsed = new URL(att.url, location.href);
        if (parsed.origin !== location.origin) return att;
        if (parsed.protocol !== 'https:') return att;
        var resp = await fetch(parsed.href, { credentials: 'omit' });
        if (!resp.ok) return att;
        var buf = await resp.arrayBuffer();
        if (!buf || buf.byteLength === 0 || buf.byteLength > 8 * 1024 * 1024) return att;
        var copy = Object.assign({}, att);
        copy.data = buf;
        copy.status = 'captured';
        copy.mime = resp.headers.get('content-type') || copy.mime;
        copy.size = buf.byteLength;
        return copy;
      } catch (_e) {
        return att; // stays an honest reference-only record
      }
    }));
    return out;
  }

  function scheduleCapture(delay) {
    if (captureTimer) clearTimeout(captureTimer);
    captureTimer = setTimeout(function () { captureTimer = null; captureNow('mutation'); }, delay);
  }

  function onMutations() {
    // Streamed responses change only the tail: use a short debounce so
    // long answers are checkpointed promptly, coalescing in the archive.
    scheduleCapture(STREAM_DEBOUNCE_MS);
  }

  function startObserver() {
    if (!scraper || !scraper.observe) return;
    try { scraper.observe(onMutations); } catch (_e) {}
  }

  function watchSpaNav() {
    function check() {
      if (window.location.href === lastUrl) return;
      lastUrl = window.location.href;
      debug('spa nav', lastUrl);
      // A navigation can re-render everything: force an immediate capture
      // and reset the signature so the new conversation captures cleanly.
      lastSignature = null;
      try { if (scraper && scraper.disconnect) scraper.disconnect(); } catch (_e) {}
      startObserver();
      captureNow('immediate');
    }
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
    navTimer = setInterval(check, 5000);
  }

  // --- Full conversation capture (panel-triggered) ----------------------------

  async function runFullCapture(onProgress) {
    if (fullCaptureRun) return fullCaptureRun.promise;
    if (!scraper) return { captured: 0, reachedTop: false, reason: 'no-scraper' };
    var cancelled = false;
    var promise = RelayFullCapture.run({
      scrape: function () { return scraper.scrapeMessages ? scraper.scrapeMessages() : []; },
      onBatch: function (batch) {
        return send({
          type: 'CAPTURE_BATCH',
          platformId: platform.id,
          url: window.location.href,
          title: document.title || '',
          messages: batch,
          fullScan: true,
          reachedTop: true, // updated on the final batch below if not reached
        }).then(function (resp) {
          lastSaveResult = resp && resp.ok ? resp : lastSaveResult;
        });
      },
      onProgress: onProgress || function () {},
      isCancelled: function () { return cancelled; },
    });
    fullCaptureRun = { promise: promise, cancel: function () { cancelled = true; } };
    var result;
    try {
      result = await promise;
      // Final integrity pass with the honest reachedTop verdict.
      var finalBatch = scraper.scrapeMessages ? scraper.scrapeMessages() : [];
      if (finalBatch.length) {
        await send({
          type: 'CAPTURE_BATCH',
          platformId: platform.id,
          url: window.location.href,
          title: document.title || '',
          messages: finalBatch,
          fullScan: true,
          reachedTop: !!result.reachedTop,
        });
      }
    } finally {
      fullCaptureRun = null;
    }
    lastSignature = null; // allow the next incremental capture to run
    return result;
  }

  // --- Boot ---------------------------------------------------------------------

  async function boot() {
    var settings = await RelayStorage.getSettings();
    try { window.__RELAY_DEBUG = !!settings.debug; } catch (_e) {}
    if (typeof FloatingUI !== 'undefined') {
      try { await FloatingUI.init(); } catch (_e2) {}
    }
    if (typeof InjectorManager !== 'undefined') {
      try { scraper = InjectorManager.getScraper(platform.id); } catch (_e3) { scraper = null; }
    }
    if (settings.autoCapture && !settings.pausePlatforms.includes(platform.id) && scraper) {
      startObserver();
      watchSpaNav();
      window.addEventListener('beforeunload', teardown);
      window.addEventListener('pagehide', teardown);
      setTimeout(function () { captureNow('immediate'); }, 800);
    }
    if (typeof InjectorManager !== 'undefined' && InjectorManager.checkAndInject) {
      try {
        var pickup = await InjectorManager.checkAndInject();
        if (typeof FloatingUI !== 'undefined') {
          try { FloatingUI.onTransferPickup(pickup); } catch (_e5) {}
        }
      } catch (_e4) {}
    }
    if (api().runtime && api().runtime.onMessage) {
      api().runtime.onMessage.addListener(function (message, _sender, sendResponse) {
        try {
          if (!message || typeof message.type !== 'string') return false;
          if (message.type === 'OPEN_PANEL') {
            if (typeof FloatingUI !== 'undefined') FloatingUI.openPanel();
            sendResponse({ success: true });
          } else if (message.type === 'TOGGLE_PANEL') {
            if (typeof FloatingUI !== 'undefined') FloatingUI.togglePanel();
            sendResponse({ success: true });
          } else if (message.type === 'GET_SESSION') {
            // Legacy name kept for compatibility: returns current capture state.
            send({ type: 'GET_CAPTURE_STATE', url: window.location.href, platformId: platform.id })
              .then(function (resp) { sendResponse(resp); })
              .catch(function () { sendResponse({ ok: false }); });
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
          } else if (message.type === 'RUN_FULL_CAPTURE') {
            runFullCapture(null).then(
              function (r) { sendResponse({ success: true, result: r }); },
              function (e) { sendResponse({ success: false, error: String(e) }); }
            );
            return true;
          } else if (message.type === 'CANCEL_FULL_CAPTURE') {
            if (fullCaptureRun && fullCaptureRun.cancel) fullCaptureRun.cancel();
            sendResponse({ success: true });
          } else if (message.type === 'PING') {
            sendResponse({ success: true, platform: platform.id });
          }
        } catch (err) {
          try { sendResponse({ success: false, error: String(err) }); } catch (_e6) {}
        }
        return false;
      });
    }
  }

  function teardown() {
    try { if (navTimer) clearInterval(navTimer); } catch (_e) {}
    try { if (captureTimer) clearTimeout(captureTimer); } catch (_e0) {}
    try { if (scraper && scraper.disconnect) scraper.disconnect(); } catch (_e2) {}
  }

  // Expose for the floating panel (same isolated world).
  window.RelayContent = {
    platform: platform,
    runFullCapture: runFullCapture,
    cancelFullCapture: function () { if (fullCaptureRun && fullCaptureRun.cancel) fullCaptureRun.cancel(); },
    isFullCaptureRunning: function () { return !!fullCaptureRun; },
    captureNow: captureNow,
    getLastSaveResult: function () { return lastSaveResult; },
  };

  boot();
})();
