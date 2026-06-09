// SELECTOR_VERSION: 2026-Q2
// Relay — Copilot Platform Scraper & Injector

const CopilotScraper = (() => {
  let _observer = null;
  let _callback = null;
  let _debounceTimer = null;

  function scrapeMessages() {
    const messages = [];
    const seen = new Set();
    let index = 0;

    const allNodes = document.querySelectorAll(
      '[data-content="user-message"], [class*="user-message"], [data-role="user"], [data-content="ai-message"], [class*="ai-message"], [data-role="assistant"]'
    );
    allNodes.forEach((node) => {
      const isUser = node.getAttribute('data-content') === 'user-message' ||
                     (node.className && node.className.includes('user')) ||
                     node.getAttribute('data-role') === 'user';
      const role = isUser ? 'user' : 'assistant';
      const text = node.textContent.trim();
      if (text && (role === 'user' || text.length > 3) && !seen.has(text)) {
        seen.add(text);
        messages.push({ role, content: text, index: index++ });
      }
    });

    if (messages.length === 0 && typeof GenericScraper !== 'undefined') {
      return GenericScraper.scrapeMessages();
    }
    return messages;
  }

  function hasConversation() {
    return document.querySelectorAll('[data-content="user-message"], [class*="user-message"], [data-role="user"]').length > 0;
  }

  function observe(callback) {
    if (_observer) { _observer.disconnect(); _observer = null; }
    _callback = callback;
    const container = document.querySelector('[class*="conversation"], main') || document.body;
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

const CopilotInjector = (() => {
  function _getInput() {
    return document.querySelector('textarea[name]') ||
           document.querySelector('#userInput') ||
           document.querySelector('textarea');
  }

  function _getSubmitBtn() {
    return document.querySelector('button[aria-label="Submit"]') ||
           document.querySelector('button[type="submit"]');
  }

  async function injectText(text) {
    const el = _getInput();
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      try {
        const proto = el.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
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
  window.CopilotScraper = CopilotScraper;
  window.CopilotInjector = CopilotInjector;
}
