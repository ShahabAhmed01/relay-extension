/**
 * Relay v1.1.0 — Platform adapters part 1 (thin configs over RelayBase).
 * SELECTOR_VERSION: 2026-Q3
 */
(function () {
  'use strict';
  function text(el) {
    try { if (typeof RelayDOM !== 'undefined') return RelayDOM.textOf(el); } catch (_e) {}
    return (el.textContent || '').trim();
  }
  function collect(selector, isUserFn, minLen) {
    var out = []; var seen = new Set();
    document.querySelectorAll(selector).forEach(function (el) {
      var t = text(el);
      if (!t || t.length < (minLen || 2) || seen.has(t)) return;
      seen.add(t);
      out.push({ role: isUserFn(el) ? 'user' : 'assistant', content: t, index: out.length });
    });
    return out;
  }
  function hasAny(selector) {
    try { return document.querySelectorAll(selector).length > 0; } catch (_e) { return false; }
  }
  function cls(el) { return (typeof el.className === 'string' ? el.className : ''); }
  function byClass(re) {
    return function (el) { return re.test(cls(el)) || el.getAttribute('data-role') === 'user'; };
  }
  function reg(a, b) {
    if (typeof RelayBase === 'undefined') return;
    RelayBase.makeScraper({ scrape: a.scrape, hasConversation: function () { return hasAny(a.has); }, container: a.container }, a.scraper);
    RelayBase.makeInjector({ inputs: a.inputs, submits: a.submits }, a.injector);
  }
  window.__relayAdapterHelpers = { collect: collect, hasAny: hasAny, cls: cls, byClass: byClass, reg: reg, text: text };
})();
