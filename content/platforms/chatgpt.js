// SELECTOR_VERSION: 2026-Q3
// Relay v1.1.0 — ChatGPT scraper & injector (Base factory, no duplication).

(function () {
  'use strict';

  function scrape() {
    var D = (typeof RelayDOM !== 'undefined') ? RelayDOM : null;
    var get = D ? D.textOf : function (el) { return (el.textContent || '').trim(); };
    var nodes = document.querySelectorAll('[data-message-author-role]');
    var out = [];
    var seen = new Set();
    nodes.forEach(function (turn) {
      var role = turn.getAttribute('data-message-author-role');
      if (role !== 'user' && role !== 'assistant' && role !== 'system') return;
      if (role === 'system') return;
      var contentEl = turn.querySelector('.whitespace-pre-wrap') ||
        turn.querySelector('.markdown') ||
        turn.querySelector('[class*="markdown"]') || turn;
      var text = get(contentEl);
      // Skip empty + UI chrome (e.g. "Copy code" buttons leak into textContent).
      if (!text || seen.has(role + '|' + text)) return;
      seen.add(role + '|' + text);
      out.push({ role: role, content: text, index: out.length });
    });
    if (!out.length) {
      var articles = document.querySelectorAll('article[data-testid*="conversation-turn"]');
      articles.forEach(function (turn) {
        var isUser = turn.querySelector('[data-message-author-role="user"]') !== null;
        var el = turn.querySelector('.whitespace-pre-wrap') || turn.querySelector('.markdown') || turn;
        var text = get(el);
        if (!text || seen.has(text)) return;
        seen.add(text);
        out.push({ role: isUser ? 'user' : 'assistant', content: text, index: out.length });
      });
    }
    return out;
  }

  function has() {
    return document.querySelectorAll('[data-message-author-role]').length > 0;
  }

  function container() { return document.querySelector('main') || document.body; }

  if (typeof RelayBase !== 'undefined') {
    RelayBase.makeScraper({ scrape: scrape, hasConversation: has, container: container }, 'ChatGPTScraper');
    RelayBase.makeInjector({
      inputs: ['#prompt-textarea', 'div[contenteditable="true"][data-id="root"]', 'div[contenteditable="true"]', 'textarea'],
      submits: ['[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'button[aria-label="Send"]'],
    }, 'ChatGPTInjector');
  }
})();

