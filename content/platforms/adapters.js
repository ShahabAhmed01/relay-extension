/**
 * Relay — Platform adapters (thin configs over RelayBase).
 * One file, one entry per platform: scraper + injector selectors.
 * SELECTOR_VERSION: 2026-Q3
 */
(function () {
  'use strict';

  function text(el) {
    try { if (typeof RelayDOM !== 'undefined') return RelayDOM.textOf(el); } catch (_e) {}
    return (el.textContent || '').trim();
  }
  function collect(selector, isUserFn, minLen) {
    var out = []; var seen = new Set();
    document.querySelectorAll(selector).forEach(function (el) {
      var t = text(el);
      if (!t || t.length < (minLen || 2) || seen.has(t)) return;
      seen.add(t);
      out.push({ role: isUserFn(el) ? 'user' : 'assistant', content: t, index: out.length });
    });
    return out;
  }
  function hasAny(selector) {
    try { return document.querySelectorAll(selector).length > 0; } catch (_e) { return false; }
  }
  function cls(el) { return (typeof el.className === 'string' ? el.className : ''); }
  function byClass(re) {
    return function (el) { return re.test(cls(el)) || el.getAttribute('data-role') === 'user'; };
  }
  function reg(a) {
    if (typeof RelayBase === 'undefined') return;
    RelayBase.makeScraper({ scrape: a.scrape, hasConversation: function () { return hasAny(a.has); }, container: a.container }, a.scraper);
    RelayBase.makeInjector({ inputs: a.inputs, submits: a.submits }, a.injector);
  }

  // --- Perplexity -----------------------------------------------------------
  reg({
    scraper: 'PerplexityScraper', injector: 'PerplexityInjector',
    scrape: function () {
      return collect('[class*="UserMessage"], [data-testid="user-message"], [class*="AnswerLayout"], [class*="answer-text"]',
        function (el) { return el.matches('[class*="UserMessage"]') || el.matches('[data-testid="user-message"]'); });
    },
    has: '[class*="UserMessage"], [data-testid="user-message"]',
    container: function () { return document.querySelector('main [class*="ConversationPage"], main') || document.body; },
    inputs: ['textarea[placeholder]', '[contenteditable="true"]', 'textarea'],
    submits: ['[aria-label="Submit"]', 'button[type="submit"]'],
  });
  // --- DeepSeek -------------------------------------------------------------
  reg({
    scraper: 'DeepSeekScraper', injector: 'DeepSeekInjector',
    scrape: function () {
      return collect('[class*="user-message"], [class*="humanMessage"], [class*="assistant-message"], [class*="ds-markdown"]', byClass(/user|human/i));
    },
    has: '[class*="user-message"], [class*="humanMessage"]',
    container: function () { return document.querySelector('#chat-container, main') || document.body; },
    inputs: ['#chat-input', 'textarea', '[contenteditable="true"]'],
    submits: ['button[type="submit"]', '.input-send-button'],
  });
  // --- Grok -----------------------------------------------------------------
  reg({
    scraper: 'GrokScraper', injector: 'GrokInjector',
    scrape: function () {
      return collect('[class*="UserMessage"], [data-role="user"], [class*="AssistantMessage"], [data-role="assistant"]',
        function (el) { return cls(el).includes('User') || el.getAttribute('data-role') === 'user'; });
    },
    has: '[class*="UserMessage"], [data-role="user"]',
    container: function () { return document.querySelector('main [class*="conversation"], main') || document.body; },
    inputs: ['textarea', '[contenteditable="true"]'],
    submits: ['button[aria-label="Submit"]', '[data-testid="send-button"]', 'button[aria-label="Send"]'],
  });
  // --- Copilot --------------------------------------------------------------
  reg({
    scraper: 'CopilotScraper', injector: 'CopilotInjector',
    scrape: function () {
      return collect('[data-content="user-message"], [class*="user-message"], [data-role="user"], [data-content="ai-message"], [class*="ai-message"], [data-role="assistant"]',
        function (el) { return el.getAttribute('data-content') === 'user-message' || cls(el).includes('user') || el.getAttribute('data-role') === 'user'; }, 3);
    },
    has: '[data-content="user-message"], [class*="user-message"], [data-role="user"]',
    container: function () { return document.querySelector('[class*="conversation"], main') || document.body; },
    inputs: ['textarea[name]', '#userInput', 'textarea', '[contenteditable="true"]'],
    submits: ['button[aria-label="Submit"]', 'button[type="submit"]'],
  });
  // --- Meta AI --------------------------------------------------------------
  reg({
    scraper: 'MetaAIScraper', injector: 'MetaAIInjector',
    scrape: function () {
      return collect('[aria-label*="You said"], [data-role="user"], [class*="user-message"], [aria-label*="Meta AI"], [data-role="assistant"], [class*="assistant-message"]',
        function (el) { return (el.getAttribute('aria-label') || '').includes('You said') || el.getAttribute('data-role') === 'user' || cls(el).includes('user'); }, 3);
    },
    has: '[aria-label*="You said"], [data-role="user"], [class*="user-message"]',
    container: function () { return document.querySelector('[role="main"]') || document.body; },
    inputs: ['[contenteditable="true"][role="textbox"]', '[contenteditable="true"]', 'textarea'],
    submits: ['[aria-label="Send"]', 'button[type="submit"]'],
  });
  // --- Mistral --------------------------------------------------------------
  reg({
    scraper: 'MistralScraper', injector: 'MistralInjector',
    scrape: function () {
      return collect('[class*="UserMessage"], [data-role="user"], [class*="AssistantMessage"], [data-role="assistant"]', byClass(/User/));
    },
    has: '[class*="UserMessage"], [data-role="user"]',
    container: function () { return document.querySelector('main [class*="Chat"], main') || document.body; },
    inputs: ['textarea[name="message"]', '[contenteditable="true"]', 'textarea'],
    submits: ['button[type="submit"]'],
  });
  // --- HuggingChat ----------------------------------------------------------
  reg({
    scraper: 'HuggingChatScraper', injector: 'HuggingChatInjector',
    scrape: function () {
      return collect('[class*="message"][class*="user"], [data-role="user"], [class*="message"][class*="bot"], [class*="message"][class*="assistant"]', byClass(/user/));
    },
    has: '[class*="message"][class*="user"], [data-role="user"]',
    container: function () { return document.querySelector('.overflow-y-auto main, main') || document.body; },
    inputs: ['[contenteditable="true"]', 'form textarea', 'textarea'],
    submits: ['button[type="submit"]'],
  });
  // --- Poe ------------------------------------------------------------------
  reg({
    scraper: 'PoeScraper', injector: 'PoeInjector',
    scrape: function () {
      return collect('[class*="humanMessage"], [class*="Message_humanMessage"], [class*="botMessage"], [class*="Message_botMessage"]',
        function (el) { return typeof el.className === 'string' && el.className.includes('human'); }, 3);
    },
    has: '[class*="humanMessage"], [class*="Message_humanMessage"]',
    container: function () { return document.querySelector('[class*="ChatMessagesView"], main') || document.body; },
    inputs: ['[class*="GrowingTextArea"] textarea', 'textarea', '[contenteditable="true"]'],
    submits: ['button[class*="sendButton"]', 'button[type="submit"]'],
  });
  // --- Qwen -----------------------------------------------------------------
  reg({
    scraper: 'QwenScraper', injector: 'QwenInjector',
    scrape: function () {
      return collect('[class*="user-message"], [class*="assistant-message"], [class*="human"], [class*="robot"]', byClass(/user|human/));
    },
    has: '[class*="user-message"], [class*="human"]',
    container: function () { return document.querySelector('[class*="chat-list"], main') || document.body; },
    inputs: ['[contenteditable="true"]', 'textarea#search-input', 'textarea'],
    submits: ['button[type="submit"]', '.send-btn'],
  });
  // --- AI Studio ------------------------------------------------------------
  reg({
    scraper: 'AIStudioScraper', injector: 'AIStudioInjector',
    scrape: function () {
      return collect('ms-prompt-turn, ms-candidate-turn, [class*="prompt-turn"], [class*="candidate-turn"]',
        function (el) {
          var tag = (el.tagName || '').toLowerCase();
          if (tag.indexOf('prompt') !== -1) return true;
          if (tag.indexOf('candidate') !== -1) return false;
          return byClass(/prompt|user|human/)(el);
        }, 3);
    },
    has: 'ms-prompt-turn, ms-candidate-turn',
    container: function () { return document.querySelector('main, ms-chat-window') || document.body; },
    inputs: ['ms-prompt-input textarea', 'textarea', '[contenteditable="true"]'],
    submits: ['button[aria-label="Send"]', 'button[type="submit"]'],
  });
})();

