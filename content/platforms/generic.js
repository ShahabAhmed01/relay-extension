// SELECTOR_VERSION: 2026-Q2
// Relay — Generic Fallback Scraper & Injector

const GenericScraper = (() => {
  let _observer = null;
  let _callback = null;
  let _debounceTimer = null;

  function _findChatContainer() {
    const candidates = document.querySelectorAll('main, [role="main"], [class*="chat"], [class*="conversation"], [class*="message"]');
    let best = null;
    let bestScore = 0;
    candidates.forEach((el) => {
      const text = el.textContent || '';
      const score = text.length + (el.scrollHeight > el.clientHeight ? 100 : 0);
      if (score > bestScore) { bestScore = score; best = el; }
    });
    return best || document.body;
  }

  function _classifyElement(el) {
    const classes = (typeof el.className === 'string' ? el.className : '').toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const dataRole = (el.getAttribute('data-role') || '').toLowerCase();
    const combined = classes + ' ' + ariaLabel + ' ' + dataRole;

    const userKeywords = ['user', 'human', 'you', 'question', 'prompt', 'sender'];
    const aiKeywords = ['assistant', 'ai', 'bot', 'answer', 'response', 'model', 'agent'];

    for (const kw of userKeywords) {
      if (combined.includes(kw)) return 'user';
    }
    for (const kw of aiKeywords) {
      if (combined.includes(kw)) return 'assistant';
    }
    return null;
  }

  function scrapeMessages() {
    const messages = [];
    let index = 0;
    const container = _findChatContainer();
    if (!container) return messages;

    const allDivs = container.querySelectorAll('[class*="message"], [class*="turn"], [class*="chat"], [role="article"], article');
    const seen = new Set();

    allDivs.forEach((div) => {
      const text = div.textContent.trim();
      if (!text || text.length < 3 || seen.has(text)) return;
      seen.add(text);

      const role = _classifyElement(div);
      if (role) {
        messages.push({ role, content: text, index: index++ });
      }
    });

    if (messages.length === 0) {
      const children = Array.from(container.children);
      children.forEach((child, i) => {
        const text = child.textContent.trim();
        if (!text || text.length < 5) return;
        const role = i % 2 === 0 ? 'user' : 'assistant';
        messages.push({ role, content: text, index: index++ });
      });
    }

    return messages;
  }

  function hasConversation() {
    const msgs = scrapeMessages();
    return msgs.length > 0;
  }

  function observe(callback) {
    if (_observer) { _observer.disconnect(); _observer = null; }
    _callback = callback;
    const container = _findChatContainer();
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

const GenericInjector = (() => {
  function _getInput() {
    return document.querySelector('textarea') ||
           document.querySelector('[contenteditable="true"]') ||
           document.querySelector('input[type="text"]');
  }

  function _getSubmitBtn() {
    return document.querySelector('button[type="submit"]') ||
           document.querySelector('[aria-label="Send"]') ||
           document.querySelector('[aria-label="Submit"]');
  }

  async function injectText(text) {
    const el = _getInput();
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
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
  window.GenericScraper = GenericScraper;
  window.GenericInjector = GenericInjector;
}
