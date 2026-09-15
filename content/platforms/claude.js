// SELECTOR_VERSION: 2026-Q3
// Relay v1.1.0 — Claude scraper & injector (Base factory).
(function () {
  'use strict';
  function scrape() {
    var D = (typeof RelayDOM !== 'undefined') ? RelayDOM : null;
    var get = D ? D.textOf : function (el) { return (el.textContent || '').trim(); };
    var out = []; var seen = new Set();
    var nodes = document.querySelectorAll('[data-testid="human-message"], [data-testid="assistant-message"], [data-is-streaming], .human-turn, .assistant-turn, [class*="ChatMessage"]');
    nodes.forEach(function (el) {
      var t = el.getAttribute('data-testid') || '';
      var isHuman = t === 'human-message' || el.classList.contains('human-turn');
      var isAI = t === 'assistant-message' || el.classList.contains('assistant-turn');
      if (!isHuman && !isAI) {
        var c = (typeof el.className === 'string' ? el.className : '').toLowerCase();
        if (/human|user|you-said/.test(c)) isHuman = true;
        else if (/assistant|ai-|claude|response/.test(c)) isAI = true;
        else return;
      }
      var inner = el.querySelector('.text, .prose, [class*="markdown"], [class*="content"]') || el;
      var text = get(inner);
      if (!text || seen.has(text)) return;
      seen.add(text);
      out.push({ role: isHuman ? 'user' : 'assistant', content: text, index: out.length });
    });
    return out;
  }
  function has() {
    return document.querySelectorAll('[data-testid="human-message"], [data-testid="assistant-message"], .human-turn, .assistant-turn').length > 0;
  }
  function container() { return document.querySelector('main, [class*="conversation"]') || document.body; }
  if (typeof RelayBase !== 'undefined') {
    RelayBase.makeScraper({ scrape: scrape, hasConversation: has, container: container }, 'ClaudeScraper');
    RelayBase.makeInjector({
      inputs: ['[contenteditable="true"][enterkeyhint="enter"]', '.ProseMirror', 'div[contenteditable="true"]', 'textarea'],
      submits: ['[aria-label="Send Message"]', 'button[type="button"][data-state]', 'button[aria-label="Send"]'],
    }, 'ClaudeInjector');
  }
})();

