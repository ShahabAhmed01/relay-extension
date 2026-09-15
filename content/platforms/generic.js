// SELECTOR_VERSION: 2026-Q3
// Relay v1.1.0 — Generic fallback (improved: dedupe, order-preserving, role alternation fix).
(function () {
  'use strict';
  function findContainer() {
    var best = null; var bestScore = 0;
    document.querySelectorAll('main, [role="main"], [class*="chat"], [class*="conversation"]').forEach(function (el) {
      var t = (el.textContent || '').length;
      var score = t + (el.scrollHeight > el.clientHeight ? 200 : 0);
      if (score > bestScore) { bestScore = score; best = el; }
    });
    return best || document.body;
  }
  function classify(el) {
    var c = ((typeof el.className === 'string' ? el.className : '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('data-role') || '')).toLowerCase();
    if (/\b(user|human|you-said|question|prompt)\b/.test(c)) return 'user';
    if (/\b(assistant|ai-|bot|answer|response|model|copilot|claude|gemini)\b/.test(c)) return 'assistant';
    return null;
  }
  function scrape() {
    var D = (typeof RelayDOM !== 'undefined') ? RelayDOM : null;
    var get = D ? D.textOf : function (el) { return (el.textContent || '').trim(); };
    var container = findContainer();
    var out = []; var seen = new Set();
    container.querySelectorAll('[class*="message"], [class*="turn"], [class*="chat"], [role="article"], article').forEach(function (div) {
      if (div.querySelector('[class*="message"], [class*="turn"]')) return; // leaf nodes only
      var text = get(div);
      if (!text || text.length < 3 || seen.has(text)) return;
      seen.add(text);
      var role = classify(div);
      if (role) out.push({ role: role, content: text, index: out.length });
    });
    if (!out.length) {
      var kids = Array.from(container.children).filter(function (k) { return get(k).length > 5; });
      kids.forEach(function (child, i) {
        out.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: get(child), index: out.length });
      });
    }
    return out;
  }
  function has() { try { return scrape().length > 0; } catch (_e) { return false; } }
  if (typeof RelayBase !== 'undefined') {
    RelayBase.makeScraper({ scrape: scrape, hasConversation: has, container: findContainer }, 'GenericScraper');
    RelayBase.makeInjector({
      inputs: ['textarea', '[contenteditable="true"]', 'input[type="text"]'],
      submits: ['button[type="submit"]', '[aria-label="Send"]', '[aria-label="Submit"]'],
    }, 'GenericInjector');
  }
})();

