// SELECTOR_VERSION: 2026-Q4
// Relay v2 — ChatGPT adapter. Element-identity collection (identical
// repeated messages are preserved as separate turns), structured text
// extraction, attachment discovery, verified injection.

(function () {
  'use strict';

  var MSG_SELECTOR = '[data-message-author-role]';
  var FALLBACK_SELECTOR = 'article[data-testid*="conversation-turn"]';

  function scrape() {
    var D = (typeof RelayDOM !== 'undefined') ? RelayDOM : null;
    if (!D) return [];
    var out = D.collectMessages(MSG_SELECTOR, function (el) {
      var role = el.getAttribute('data-message-author-role');
      return role === 'user' || role === 'assistant' ? role : null;
    }, {
      contentIn: function (el) {
        return el.querySelector('.whitespace-pre-wrap, .markdown, [class*="markdown"]') || el;
      },
    });
    if (!out.length) {
      out = D.collectMessages(FALLBACK_SELECTOR, function (el) {
        return el.querySelector('[data-message-author-role="user"]') ? 'user' : 'assistant';
      }, {
        contentIn: function (el) {
          return el.querySelector('.whitespace-pre-wrap, .markdown') || el;
        },
      });
    }
    return out;
  }

  function has() {
    return document.querySelectorAll(MSG_SELECTOR + ', ' + FALLBACK_SELECTOR).length > 0;
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
