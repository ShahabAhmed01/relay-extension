// SELECTOR_VERSION: 2026-Q2
// Relay — Gemini Platform Scraper & Injector

const GeminiScraper = (() => {
  let _observer = null;
  let _callback = null;
  let _debounceTimer = null;

  function scrapeMessages() {
    const messages = [];
    let index = 0;

    const allTurns = document.querySelectorAll(
      'user-query, model-response, .query-container, .response-container, [class*="conversation-turn"]'
    );

    allTurns.forEach((el) => {
      const classes = typeof el.className === 'string' ? el.className : '';
      const isUser = el.tagName === 'USER-QUERY' ||
                     classes.includes('query') ||
                     classes.includes('human');
      const contentEl = el.querySelector('.query-text, .query-content, .response-content, .markdown') || el;
      const text = contentEl.textContent.trim();
      if (text && text.length > 2) {
        messages.push({ role: isUser ? 'user' : 'assistant', content: text, index: index++ });
      }
    });

    if (messages.length === 0) {
      const container = document.querySelector('chat-window, .conversation-container, main');
      if (container) {
        const allDivs = container.querySelectorAll('[class*="message"], [class*="turn"]');
        allDivs.forEach((div) => {
          const isUser = div.className.includes('user') || div.className.includes('human') || div.className.includes('query');
          const text = div.textContent.trim();
          if (text && text.length > 2) {
            messages.push({ role: isUser ? 'user' : 'assistant', content: text, index: index++ });
          }
        });
      }
    }

    if (messages.length === 0 && typeof GenericScraper !== 'undefined') {
      return GenericScraper.scrapeMessages();
    }
    return messages;
  }

  function hasConversation() {
    return document.querySelectorAll('user-query, model-response, .query-text, .response-content').length > 0;
  }

  function observe(callback) {
    if (_observer) { _observer.disconnect(); _observer = null; }
    _callback = callback;
    const container = document.querySelector('chat-window, .conversation-container, main') || document.body;
    _observer = new MutationObserver(() => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => {
        if (_callback) {
          const msgs = scrapeMessages();
          if (msgs.length > 0) _callback(msgs);
        }
      }, 300);
    });
    _observer.observe(container, { childList: true, subtree: true });
  }

  function disconnect() {
    clearTimeout(_debounceTimer);
    if (_observer) { _observer.disconnect(); _observer = null; }
    _callback = null;
  }

  return { scrapeMessages, hasConversation, observe, disconnect };
})();

const GeminiInjector = (() => {
  function _getInput() {
    return document.querySelector('.ql-editor[contenteditable]') ||
           document.querySelector('rich-textarea .ql-editor') ||
           document.querySelector('[contenteditable="true"]');
  }

  function _getSubmitBtn() {
    return document.querySelector('button.send-button') ||
           document.querySelector('[aria-label="Send message"]') ||
           document.querySelector('button[aria-label="Send"]');
  }

  async function injectText(text) {
    const el = _getInput();
    if (!el) return false;
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  async function submit() {
    const btn = _getSubmitBtn();
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  }

  function isReady() {
    return _getInput() !== null;
  }

  return { injectText, submit, isReady };
})();

if (typeof window !== 'undefined') {
  window.GeminiScraper = GeminiScraper;
  window.GeminiInjector = GeminiInjector;
}
