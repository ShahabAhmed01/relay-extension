// SELECTOR_VERSION: 2026-Q4
// Relay v2 — Claude adapter. Element-identity collection, structured text,
// attachment discovery, verified injection.

(function () {
  'use strict';

  var MSG_SELECTOR = '[data-testid="human-message"], [data-testid="assistant-message"], [data-is-streaming], .human-turn, .assistant-turn, [class*="ChatMessage"]';

  function classify(el) {
    var t = el.getAttribute('data-testid') || '';
    if (t === 'human-message') return 'user';
    if (t === 'assistant-message') return 'assistant';
    if (el.classList.contains('human-turn')) return 'user';
    if (el.classList.contains('assistant-turn')) return 'assistant';
    var c = (typeof el.className === 'string' ? el.className : '').toLowerCase();
    if (/human|user|you-said/.test(c)) return 'user';
    if (/assistant|ai-|claude|response/.test(c)) return 'assistant';
    return null;
  }

  function scrape() {
    var D = (typeof RelayDOM !== 'undefined') ? RelayDOM : null;
    if (!D) return [];
    return D.collectMessages(MSG_SELECTOR, classify, {
      contentIn: function (el) {
        return el.querySelector('.text, .prose, [class*="markdown"], [class*="content"]') || el;
      },
      minLen: 1,
    });
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
