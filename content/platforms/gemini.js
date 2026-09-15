// SELECTOR_VERSION: 2026-Q3
// Relay v1.1.0 — Gemini scraper & injector (Base factory).
(function () {
  'use strict';
  function scrape() {
    var D = (typeof RelayDOM !== 'undefined') ? RelayDOM : null;
    var get = D ? D.textOf : function (el) { return (el.textContent || '').trim(); };
    var out = []; var seen = new Set();
    document.querySelectorAll('user-query, model-response, .query-container, .response-container, [class*="conversation-turn"], [class*="message-content"]').forEach(function (el) {
      var tag = el.tagName || '';
      var c = (typeof el.className === 'string' ? el.className : '').toLowerCase();
      var isUser = tag === 'USER-QUERY' || /query|human|user/.test(c);
      var inner = el.querySelector('.query-text, .query-content, .response-content, .markdown, [class*="markdown"]') || el;
      var text = get(inner);
      if (!text || text.length < 3 || seen.has(text)) return;
      seen.add(text);
      out.push({ role: isUser ? 'user' : 'assistant', content: text, index: out.length });
    });
    return out;
  }
  function has() {
    return document.querySelectorAll('user-query, model-response, .query-text, .response-content').length > 0;
  }
  function container() { return document.querySelector('chat-window, .conversation-container, main') || document.body; }
  if (typeof RelayBase !== 'undefined') {
    RelayBase.makeScraper({ scrape: scrape, hasConversation: has, container: container }, 'GeminiScraper');
    RelayBase.makeInjector({
      inputs: ['.ql-editor[contenteditable]', 'rich-textarea .ql-editor', '[contenteditable="true"]', 'textarea'],
      submits: ['button.send-button', '[aria-label="Send message"]', 'button[aria-label="Send"]'],
    }, 'GeminiInjector');
  }
})();

