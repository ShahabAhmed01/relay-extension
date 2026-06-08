// SELECTOR_VERSION: 2026-Q2
// Relay — Mistral Platform Scraper & Injector

const MistralScraper = (() => {
  let _observer = null;
  let _callback = null;

  function scrapeMessages() {
    const messages = [];
    const seen = new Set();
    let index = 0;
    const allTurns = document.querySelectorAll('[class*="UserMessage"], [data-role="user"], [class*="AssistantMessage"], [data-role="assistant"]');
    allTurns.forEach((el) => {
      const text = el.textContent.trim();
      if (!text || text.length < 2 || seen.has(text)) return;
      seen.add(text);
      const isUser = (el.className || '').includes('User') || el.getAttribute('data-role') === 'user';
      messages.push({ role: isUser ? 'user' : 'assistant', content: text, index: index++ });
    });
    if (messages.length === 0 && typeof GenericScraper !== 'undefined') {
      return GenericScraper.scrapeMessages();
    }
    return messages;
  }

  function hasConversation() {
    return document.querySelectorAll('[class*="UserMessage"], [data-role="user"]').length > 0;
  }

  function observe(callback) {
    if (_observer) { _observer.disconnect(); _observer = null; }
    _callback = callback;
    const container = document.querySelector('main [class*="Chat"], main') || document.body;
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

const MistralInjector = (() => {
  function _getInput() {
    return document.querySelector('textarea[name="message"]') ||
           document.querySelector('[contenteditable="true"]') ||
           document.querySelector('textarea');
  }

  function _getSubmitBtn() {
    return document.querySelector('button[type="submit"]');
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
  window.MistralScraper = MistralScraper;
  window.MistralInjector = MistralInjector;
}
