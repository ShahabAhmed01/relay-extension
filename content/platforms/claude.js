// SELECTOR_VERSION: 2026-Q2
// Relay — Claude Platform Scraper & Injector

const ClaudeScraper = (() => {
  let _observer = null;
  let _callback = null;

  function scrapeMessages() {
    const messages = [];
    let index = 0;

    const humanMsgs = document.querySelectorAll('[data-testid="human-message"], .human-turn .text');
    const assistantMsgs = document.querySelectorAll('[data-testid="assistant-message"], .assistant-turn .prose');

    const allMsgs = document.querySelectorAll('[data-testid="human-message"], [data-testid="assistant-message"]');
    if (allMsgs.length > 0) {
      allMsgs.forEach((msg) => {
        const isHuman = msg.getAttribute('data-testid') === 'human-message';
        const text = msg.textContent.trim();
        if (text) {
          messages.push({ role: isHuman ? 'user' : 'assistant', content: text, index: index++ });
        }
      });
    }

    if (messages.length === 0) {
      const turns = document.querySelectorAll('.human-turn, .assistant-turn');
      turns.forEach((turn) => {
        const isHuman = turn.classList.contains('human-turn');
        const contentEl = turn.querySelector('.text, .prose') || turn;
        const text = contentEl.textContent.trim();
        if (text) {
          messages.push({ role: isHuman ? 'user' : 'assistant', content: text, index: index++ });
        }
      });
    }

    return messages;
  }

  function hasConversation() {
    return document.querySelectorAll('[data-testid="human-message"], [data-testid="assistant-message"], .human-turn, .assistant-turn').length > 0;
  }

  function observe(callback) {
    if (_observer) { _observer.disconnect(); _observer = null; }
    _callback = callback;
    const container = document.querySelector('.flex-1 main, [class*="conversation"]') || document.body;
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

const ClaudeInjector = (() => {
  function _getInput() {
    return document.querySelector('[contenteditable="true"][enterkeyhint="enter"]') ||
           document.querySelector('.ProseMirror') ||
           document.querySelector('[contenteditable="true"]');
  }

  function _getSubmitBtn() {
    return document.querySelector('[aria-label="Send Message"]') ||
           document.querySelector('button[type="button"][data-state]');
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
  window.ClaudeScraper = ClaudeScraper;
  window.ClaudeInjector = ClaudeInjector;
}
