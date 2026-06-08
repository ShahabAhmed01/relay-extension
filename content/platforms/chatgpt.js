// SELECTOR_VERSION: 2026-Q2
// Relay — ChatGPT Platform Scraper & Injector

const ChatGPTScraper = (() => {
  let _observer = null;
  let _callback = null;

  function scrapeMessages() {
    const messages = [];
    let index = 0;

    const allTurns = document.querySelectorAll('[data-message-author-role]');
    if (allTurns.length > 0) {
      allTurns.forEach((turn) => {
        const role = turn.getAttribute('data-message-author-role');
        const contentEl = turn.querySelector('.whitespace-pre-wrap') ||
                          turn.querySelector('.markdown') ||
                          turn.querySelector('[class*="markdown"]') ||
                          turn;
        const text = contentEl ? contentEl.textContent.trim() : '';
        if (text && (role === 'user' || role === 'assistant')) {
          messages.push({ role, content: text, index: index++ });
        }
      });
    }

    if (messages.length === 0) {
      const fallbackTurns = document.querySelectorAll('article[data-testid*="conversation-turn"]');
      fallbackTurns.forEach((turn) => {
        const isUser = turn.querySelector('[data-message-author-role="user"]') !== null;
        const contentEl = turn.querySelector('.whitespace-pre-wrap') ||
                          turn.querySelector('.markdown') ||
                          turn;
        const text = contentEl ? contentEl.textContent.trim() : '';
        if (text) {
          messages.push({ role: isUser ? 'user' : 'assistant', content: text, index: index++ });
        }
      });
    }

    if (messages.length === 0 && typeof GenericScraper !== 'undefined') {
      return GenericScraper.scrapeMessages();
    }
    return messages;
  }

  function hasConversation() {
    return document.querySelectorAll('[data-message-author-role]').length > 0;
  }

  function observe(callback) {
    if (_observer) { _observer.disconnect(); _observer = null; }
    _callback = callback;
    const container = document.querySelector('main') || document.body;
    _observer = new MutationObserver(() => {
      if (_callback) {
        const msgs = scrapeMessages();
        if (msgs.length > 0) _callback(msgs);
      }
    });
    _observer.observe(container, { childList: true, subtree: true });
  }

  function disconnect() {
    if (_observer) { _observer.disconnect(); _observer = null; }
    _callback = null;
  }

  return { scrapeMessages, hasConversation, observe, disconnect };
})();

const ChatGPTInjector = (() => {
  function _getInput() {
    return document.querySelector('#prompt-textarea') ||
           document.querySelector('div[contenteditable="true"][data-id="root"]') ||
           document.querySelector('div[contenteditable="true"]') ||
           document.querySelector('textarea');
  }

  function _getSubmitBtn() {
    return document.querySelector('[data-testid="send-button"]') ||
           document.querySelector('button[aria-label="Send prompt"]') ||
           document.querySelector('button[aria-label="Send"]');
  }

  async function injectText(text) {
    const el = _getInput();
    if (!el) return false;

    if (el.tagName === 'TEXTAREA') {
      try {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, text);
      } catch (e) {
        el.value = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
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
  window.ChatGPTScraper = ChatGPTScraper;
  window.ChatGPTInjector = ChatGPTInjector;
}
