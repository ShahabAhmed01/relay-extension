// SELECTOR_VERSION: 2026-Q4
// Relay v2 — Generic fallback. No text dedup (identical repeats are real
// turns); role classification with a conservative alternation heuristic.
// The orchestrator surfaces usedGeneric so the UI can warn that capture
// fell back and should be verified.
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
    if (!D) return [];
    var container = findContainer();
    var out = D.collectMessages('[class*="message"], [class*="turn"], [role="article"], article', classify, {});
    if (!out.length) {
      // Last-resort alternation heuristic: only substantial top-level
      // blocks, so nav chrome never becomes a "message".
      var kids = Array.from(container.children).filter(function (k) {
        return D.textOf(k).length > 40;
      });
      kids.forEach(function (child, i) {
        out.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: D.structuredTextOf(child) });
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
