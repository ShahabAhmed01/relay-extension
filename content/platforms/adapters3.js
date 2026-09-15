/**
 * Relay v1.1.0 — adapters part 3: Mistral / HuggingChat / Poe / Qwen / AIStudio.
 * SELECTOR_VERSION: 2026-Q3
 */
(function () {
  'use strict';
  var H = window.__relayAdapterHelpers || {};
  if (!H.reg) return;
  H.reg({
    scraper: 'MistralScraper', injector: 'MistralInjector',
    scrape: function () {
      return H.collect('[class*="UserMessage"], [data-role="user"], [class*="AssistantMessage"], [data-role="assistant"]', H.byClass(/User/));
    },
    has: '[class*="UserMessage"], [data-role="user"]',
    container: function () { return document.querySelector('main [class*="Chat"], main') || document.body; },
    inputs: ['textarea[name="message"]', '[contenteditable="true"]', 'textarea'],
    submits: ['button[type="submit"]'],
  });
  H.reg({
    scraper: 'HuggingChatScraper', injector: 'HuggingChatInjector',
    scrape: function () {
      return H.collect('[class*="message"][class*="user"], [data-role="user"], [class*="message"][class*="bot"], [class*="message"][class*="assistant"]', H.byClass(/user/));
    },
    has: '[class*="message"][class*="user"], [data-role="user"]',
    container: function () { return document.querySelector('.overflow-y-auto main, main') || document.body; },
    inputs: ['[contenteditable="true"]', 'form textarea', 'textarea'],
    submits: ['button[type="submit"]'],
  });
  H.reg({
    scraper: 'PoeScraper', injector: 'PoeInjector',
    scrape: function () {
      return H.collect('[class*="humanMessage"], [class*="Message_humanMessage"], [class*="botMessage"], [class*="Message_botMessage"]',
        function (el) { return typeof el.className === 'string' && el.className.includes('human'); }, 3);
    },
    has: '[class*="humanMessage"], [class*="Message_humanMessage"]',
    container: function () { return document.querySelector('[class*="ChatMessagesView"], main') || document.body; },
    inputs: ['[class*="GrowingTextArea"] textarea', 'textarea', '[contenteditable="true"]'],
    submits: ['button[class*="sendButton"]', 'button[type="submit"]'],
  });
  H.reg({
    scraper: 'QwenScraper', injector: 'QwenInjector',
    scrape: function () {
      return H.collect('[class*="user-message"], [class*="assistant-message"], [class*="human"], [class*="robot"]', H.byClass(/user|human/));
    },
    has: '[class*="user-message"], [class*="human"]',
    container: function () { return document.querySelector('[class*="chat-list"], main') || document.body; },
    inputs: ['[contenteditable="true"]', 'textarea#search-input', 'textarea'],
    submits: ['button[type="submit"]', '.send-btn'],
  });
  H.reg({
    scraper: 'AIStudioScraper', injector: 'AIStudioInjector',
    scrape: function () {
      return H.collect('ms-prompt-turn, ms-candidate-turn, [class*="prompt-turn"], [class*="candidate-turn"]',
        function (el) {
          var tag = (el.tagName || '').toLowerCase();
          if (tag.indexOf('prompt') !== -1) return true;
          if (tag.indexOf('candidate') !== -1) return false;
          return H.byClass(/prompt|user|human/)(el);
        }, 3);
    },
    has: 'ms-prompt-turn, ms-candidate-turn',
    container: function () { return document.querySelector('main, ms-chat-window') || document.body; },
    inputs: ['ms-prompt-input textarea', 'textarea', '[contenteditable="true"]'],
    submits: ['button[aria-label="Send"]', 'button[type="submit"]'],
  });
})();
