// SELECTOR_VERSION: 2026-Q4
// Relay v2 — Gemini adapter. Element-identity collection, structured text,
// attachment discovery, verified injection.

(function () {
  'use strict';

  var MSG_SELECTOR = 'user-query, model-response, .query-container, .response-container, [class*="conversation-turn"], [class*="message-content"]';

  function scrape() {
    var D = (typeof RelayDOM !== 'undefined') ? RelayDOM : null;
    if (!D) return [];
    return D.collectMessages(MSG_SELECTOR, function (el) {
      var tag = el.tagName || '';
      if (tag === 'USER-QUERY') return 'user';
      if (tag === 'MODEL-RESPONSE') return 'assistant';
      var c = (typeof el.className === 'string' ? el.className : '').toLowerCase();
      if (/query|human|user/.test(c)) return 'user';
      if (/response|answer|model/.test(c)) return 'assistant';
      return null;
    }, {
      contentIn: function (el) {
        return el.querySelector('.query-text, .query-content, .response-content, .markdown, [class*="markdown"]') || el;
      },
      minLen: 3,
    });
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
