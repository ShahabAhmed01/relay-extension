/**
 * Relay v1.1.0 — adapters part 2: Perplexity / DeepSeek / Grok / Copilot / MetaAI.
 * SELECTOR_VERSION: 2026-Q3
 */
(function () {
  'use strict';
  var H = window.__relayAdapterHelpers || {};
  if (!H.reg) return;
  H.reg({
    scraper: 'PerplexityScraper', injector: 'PerplexityInjector',
    scrape: function () {
      return H.collect('[class*="UserMessage"], [data-testid="user-message"], [class*="AnswerLayout"], [class*="answer-text"]',
        function (el) { return el.matches('[class*="UserMessage"]') || el.matches('[data-testid="user-message"]'); });
    },
    has: '[class*="UserMessage"], [data-testid="user-message"]',
    container: function () { return document.querySelector('main [class*="ConversationPage"], main') || document.body; },
    inputs: ['textarea[placeholder]', '[contenteditable="true"]', 'textarea'],
    submits: ['[aria-label="Submit"]', 'button[type="submit"]'],
  });
  H.reg({
    scraper: 'DeepSeekScraper', injector: 'DeepSeekInjector',
    scrape: function () {
      return H.collect('[class*="user-message"], [class*="humanMessage"], [class*="assistant-message"], [class*="ds-markdown"]', H.byClass(/user|human/i));
    },
    has: '[class*="user-message"], [class*="humanMessage"]',
    container: function () { return document.querySelector('#chat-container, main') || document.body; },
    inputs: ['#chat-input', 'textarea', '[contenteditable="true"]'],
    submits: ['button[type="submit"]', '.input-send-button'],
  });
  H.reg({
    scraper: 'GrokScraper', injector: 'GrokInjector',
    scrape: function () {
      return H.collect('[class*="UserMessage"], [data-role="user"], [class*="AssistantMessage"], [data-role="assistant"]',
        function (el) { return H.cls(el).includes('User') || el.getAttribute('data-role') === 'user'; });
    },
    has: '[class*="UserMessage"], [data-role="user"]',
    container: function () { return document.querySelector('main [class*="conversation"], main') || document.body; },
    inputs: ['textarea', '[contenteditable="true"]'],
    submits: ['button[aria-label="Submit"]', '[data-testid="send-button"]', 'button[aria-label="Send"]'],
  });
  H.reg({
    scraper: 'CopilotScraper', injector: 'CopilotInjector',
    scrape: function () {
      return H.collect('[data-content="user-message"], [class*="user-message"], [data-role="user"], [data-content="ai-message"], [class*="ai-message"], [data-role="assistant"]',
        function (el) { return el.getAttribute('data-content') === 'user-message' || H.cls(el).includes('user') || el.getAttribute('data-role') === 'user'; }, 3);
    },
    has: '[data-content="user-message"], [class*="user-message"], [data-role="user"]',
    container: function () { return document.querySelector('[class*="conversation"], main') || document.body; },
    inputs: ['textarea[name]', '#userInput', 'textarea', '[contenteditable="true"]'],
    submits: ['button[aria-label="Submit"]', 'button[type="submit"]'],
  });
  H.reg({
    scraper: 'MetaAIScraper', injector: 'MetaAIInjector',
    scrape: function () {
      return H.collect('[aria-label*="You said"], [data-role="user"], [class*="user-message"], [aria-label*="Meta AI"], [data-role="assistant"], [class*="assistant-message"]',
        function (el) { return (el.getAttribute('aria-label') || '').includes('You said') || el.getAttribute('data-role') === 'user' || H.cls(el).includes('user'); }, 3);
    },
    has: '[aria-label*="You said"], [data-role="user"], [class*="user-message"]',
    container: function () { return document.querySelector('[role="main"]') || document.body; },
    inputs: ['[contenteditable="true"][role="textbox"]', '[contenteditable="true"]', 'textarea'],
    submits: ['[aria-label="Send"]', 'button[type="submit"]'],
  });
})();
