/**
 * Relay v1.1.0 — shared DOM helpers for scrapers/injectors.
 * No dependencies. Safe to load before platform files.
 */
var RelayDOM = (function () {
  'use strict';

  function textOf(el) {
    if (!el) return '';
    var t = el.innerText != null ? el.innerText : el.textContent;
    return String(t || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
  }

  function queryFirst(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);
        if (el && el.offsetParent !== null) return el;
      } catch (_e) { /* bad selector */ }
    }
    for (var j = 0; j < selectors.length; j++) {
      try {
        var any = document.querySelector(selectors[j]);
        if (any) return any;
      } catch (_e2) { /* ignore */ }
    }
    return null;
  }

  function dedupe(messages) {
    var seen = new Set();
    var out = [];
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      var key = m.role + '|' + (m.content || '');
      if (seen.has(key)) continue;
      seen.add(key);
      m.index = out.length;
      out.push(m);
    }
    return out;
  }

  function fromNodes(nodes, roleOf, minLen) {
    var messages = [];
    var seen = new Set();
    (nodes || []).forEach(function (el) {
      var text = textOf(el);
      if (!text || text.length < (minLen || 2) || seen.has(text)) return;
      seen.add(text);
      messages.push({ role: roleOf(el), content: text, index: messages.length });
    });
    return dedupe(messages);
  }

  function observeContainer(container, onChange, delay) {
    var timer = null;
    var obs = new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(onChange, delay || 350);
    });
    try {
      obs.observe(container || document.body, { childList: true, subtree: true, characterData: true });
    } catch (_e) { /* ignore */ }
    return {
      disconnect: function () { clearTimeout(timer); try { obs.disconnect(); } catch (_e2) {} },
    };
  }

  // Framework-aware value setter: works with React / ProseMirror / Quill.
  function setNativeValue(el, value) {
    try {
      var proto = null;
      if (el.tagName === 'TEXTAREA') proto = window.HTMLTextAreaElement.prototype;
      else if (el.tagName === 'INPUT') proto = window.HTMLInputElement.prototype;
      if (proto) {
        var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        var eventSetter = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'value');
        if (setter) setter.call(el, value);
        else el.value = value;
        if (eventSetter && eventSetter.set && eventSetter.set !== setter) {
          try { eventSetter.set.call(el, value); } catch (_e) {}
        }
      } else {
        el.value = value;
      }
    } catch (_e) {
      try { el.value = value; } catch (_e2) {}
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    // Nudge React 18+ listeners that watch native setters.
    try {
      var tracker = el._valueTracker;
      if (tracker) tracker.setValue('');
    } catch (_e3) {}
  }

  function insertIntoEditable(el, value) {
    el.focus({ preventScroll: true });
    var ok = false;
    try {
      if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
        document.execCommand('selectAll', false, null);
        ok = document.execCommand('insertText', false, value);
      }
    } catch (_e) { ok = false; }
    if (!ok) {
      try {
        var sel = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        var data = new DataTransfer();
        data.setData('text/plain', value);
        var evt = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
        ok = el.dispatchEvent(evt);
        if (!ok) el.textContent = value;
      } catch (_e2) {
        try { el.textContent = value; } catch (_e3) {}
      }
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function injectValue(el, value) {
    if (!el) return false;
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.tagName === 'DIV' || el.tagName === 'P') {
      // Quill / ProseMirror / Lexical editors
      var quill = el.classList && el.classList.contains('ql-editor');
      if (quill || el.isContentEditable) return insertIntoEditable(el, value);
    }
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      setNativeValue(el, value);
      return true;
    }
    return insertIntoEditable(el, value);
  }

  return {
    textOf: textOf,
    queryFirst: queryFirst,
    dedupe: dedupe,
    fromNodes: fromNodes,
    observeContainer: observeContainer,
    setNativeValue: setNativeValue,
    insertIntoEditable: insertIntoEditable,
    injectValue: injectValue,
  };
})();

if (typeof window !== 'undefined') window.RelayDOM = RelayDOM;
if (typeof module !== 'undefined' && module.exports) module.exports = RelayDOM;
