/**
 * Relay v1.1.0 — Base factory: every platform gets consistent
 * scrape/observe/inject behaviour with zero duplication.
 * SELECTOR_VERSION: 2026-Q3
 */
var RelayBase = (function () {
  'use strict';

  function makeScraper(opts, globalName) {
    var handle = null;
    function scrape() {
      api.usedGeneric = false;
      try {
        var out = opts.scrape();
        if (out && out.length) return out;
      } catch (_e) { /* fall through to generic */ }
      try {
        if (typeof GenericScraper !== 'undefined') {
          api.usedGeneric = true; // native selectors failed — caller can warn
          return GenericScraper.scrapeMessages();
        }
      } catch (_e2) {}
      return [];
    }
    function has() {
      try {
        if (opts.hasConversation) return !!opts.hasConversation();
      } catch (_e) {}
      try { return scrape().length > 0; } catch (_e2) { return false; }
    }
    function observe(cb) {
      disconnect();
      var pick = (opts.container && opts.container()) || document.querySelector('main') || document.body;
      var D = (typeof RelayDOM !== 'undefined') ? RelayDOM : null;
      var fire = function () {
        try {
          var msgs = scrape();
          if (msgs && msgs.length) cb(msgs);
        } catch (_e) {}
      };
      if (D) handle = D.observeContainer(pick, fire, opts.debounceMs || 350);
      else {
        var t = null;
        var mo = new MutationObserver(function () { clearTimeout(t); t = setTimeout(fire, opts.debounceMs || 350); });
        try { mo.observe(pick, { childList: true, subtree: true }); } catch (_e2) {}
        handle = { disconnect: function () { clearTimeout(t); try { mo.disconnect(); } catch (_e3) {} } };
      }
    }
    function disconnect() {
      if (handle) { try { handle.disconnect(); } catch (_e) {} handle = null; }
    }
    var api = { scrapeMessages: scrape, hasConversation: has, observe: observe, disconnect: disconnect };
    if (globalName && typeof window !== 'undefined') window[globalName] = api;
    return api;
  }

  function makeInjector(selectors, globalName) {
    function getInput() {
      var D = (typeof RelayDOM !== 'undefined') ? RelayDOM : null;
      if (D) return D.queryFirst(selectors.inputs || []);
      for (var i = 0; i < (selectors.inputs || []).length; i++) {
        var el = document.querySelector(selectors.inputs[i]);
        if (el) return el;
      }
      return null;
    }
    function getSubmit() {
      var list = selectors.submits || [];
      for (var i = 0; i < list.length; i++) {
        try { var el = document.querySelector(list[i]); if (el) return el; } catch (_e) {}
      }
      return null;
    }
    async function injectText(text) {
      var el = getInput();
      if (!el) return false;
      try {
        var D = (typeof RelayDOM !== 'undefined') ? RelayDOM : null;
        if (D) return D.injectValue(el, text);
        el.focus();
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.value = text;
        else el.textContent = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      } catch (_e) { return false; }
    }
    async function submit() {
      var b = getSubmit();
      if (b && !b.disabled) { b.click(); return true; }
      return false;
    }
    function isReady() { return !!getInput(); }
    var api = { injectText: injectText, submit: submit, isReady: isReady, _getInput: getInput };
    if (globalName && typeof window !== 'undefined') window[globalName] = api;
    return api;
  }

  return { makeScraper: makeScraper, makeInjector: makeInjector };
})();

if (typeof window !== 'undefined') window.RelayBase = RelayBase;
if (typeof module !== 'undefined' && module.exports) module.exports = RelayBase;
