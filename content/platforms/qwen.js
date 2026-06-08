// SELECTOR_VERSION: 2026-Q2
// Relay — Qwen Platform Scraper & Injector

const QwenScraper = (() => {
  let _observer = null;
  let _callback = null;

  function scrapeMessages() {
    const messages = [];
    const seen = new Set();
    let index = 0;
    const allTurns = document.querySelectorAll('[class*="user-message"], [class*="assistant-message"], [class*="human"], [class*="robot"]');
    allTurns.forEach((el) => {
      const text = el.textContent.trim();
      if (!text || text.length < 2 || seen.has(text)) return;
      seen.add(text);
      const cn = el.className || '';
      const isUser = cn.includes('user') || cn.includes('human');
      messages.push({ role: isUser ? 'user' : 'assistant', content: text, index: index++ });
    });
    if (messages.length === 0 && typeof GenericScraper !== 'undefined') {
      return GenericScraper.scrapeMessages();
    }
    return messages;
  }

  function hasConversation() {
    return document.querySelectorAll('[class*="user-message"], [class*="human"]').length > 0;
  }

  function observe(callback) {
    if (_observer) { _observer.disconnect(); _observer = null; }
    _callback = callback;
    const container = document.querySelector('[class*="chat-list"], main') || document.body;
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

const QwenInjector = (() => {
  function _getInput() {
    return document.querySelector('[contenteditable="true"]') ||
           document.querySelector('textarea#search-input') ||
           document.querySelector('textarea');
  }

  function _getSubmitBtn() {
    return document.querySelector('button[type="submit"]') ||
           document.querySelector('.send-btn');
  }

  async function injectText(text) {
    const el = _getInput();
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') {
      try {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, text);
      } catch (_e) {
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
  window.QwenScraper = QwenScraper;
  window.QwenInjector = QwenInjector;
}
