/**
 * Relay v2 — shared DOM helpers for scrapers/injectors.
 *
 * Capture philosophy changes vs v1:
 *  - Text is NEVER used as a dedup key. Two messages with identical text
 *    are two messages. Only element identity and containment prune
 *    duplicates (a selector matching both a wrapper and its child).
 *  - structuredTextOf() removes page UI chrome (copy buttons, avatars,
 *    action bars) while preserving paragraphs, lists, tables, headings
 *    and fenced code blocks.
 *  - attachmentsOf() discovers images/files the message actually
 *    references, with honest reference-only status.
 */

var RelayDOM = (function () {
  'use strict';

  function textOf(el) {
    if (!el) return '';
    var t = el.innerText != null ? el.innerText : el.textContent;
    return String(t || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
  }

  /**
   * High-fidelity text extraction: clone the node, drop interactive
   * chrome, then convert structure to readable text with fenced code.
   */
  function structuredTextOf(el) {
    if (!el) return '';
    try {
      var clone = el.cloneNode(true);
      // UI chrome that leaks into textContent on real platforms.
      clone.querySelectorAll(
        'button, [role="button"], svg, script, style, noscript, input, select, textarea, nav, [aria-hidden="true"]'
      ).forEach(function (n) { n.remove(); });
      // Fenced code blocks, preserved verbatim.
      clone.querySelectorAll('pre').forEach(function (p) {
        var code = p.querySelector('code');
        var raw = code ? code.textContent : p.textContent;
        p.textContent = '\n```\n' + String(raw || '').replace(/\n$/, '') + '\n```\n';
      });
      clone.querySelectorAll('br').forEach(function (b) { b.replaceWith(document.createTextNode('\n')); });
      clone.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote, tr').forEach(function (b) {
        b.prepend(document.createTextNode('\n'));
        b.append(document.createTextNode('\n'));
      });
      var t = clone.innerText != null ? clone.innerText : clone.textContent;
      var out = String(t || '');
      out = out.replace(/\u00a0/g, ' ');
      out = out.replace(/[ \t]+\n/g, '\n');
      out = out.replace(/\n{4,}/g, '\n\n\n');
      return out.trim();
    } catch (_e) {
      return textOf(el);
    }
  }

  /**
   * Prune a NodeList to distinct, outermost message elements: an element
   * that merely CONTAINS another matched element is a wrapper, not an
   * extra message. Element identity only — never text.
   */
  function pruneContained(nodes) {
    var list = Array.prototype.slice.call(nodes || []);
    return list.filter(function (el) {
      for (var i = 0; i < list.length; i++) {
        var other = list[i];
        if (other !== el && other.contains(el)) return false;
      }
      return true;
    });
  }

  /**
   * Collect messages from matched elements. roleOf(element) -> 'user' |
   * 'assistant' | null (skip). Dedup is element-based only.
   */
  function collectMessages(selector, roleOf, opts) {
    opts = opts || {};
    var out = [];
    var seenEls = new Set();
    var nodes;
    try { nodes = document.querySelectorAll(selector); } catch (_e) { return out; }
    pruneContained(nodes).forEach(function (el) {
      if (seenEls.has(el)) return;
      seenEls.add(el);
      var role = roleOf(el);
      if (role !== 'user' && role !== 'assistant') return;
      var contentEl = (opts.contentIn && opts.contentIn(el)) || el;
      var text = opts.structured === false ? textOf(contentEl) : structuredTextOf(contentEl);
      if (!text || text.length < (opts.minLen || 2)) return;
      var msg = { role: role, content: text };
      var atts = attachmentsOf(el);
      if (atts.length) msg.attachments = atts;
      var sourceId = el.getAttribute('data-id') || el.id || null;
      if (sourceId) msg.sourceMessageId = String(sourceId).slice(0, 200);
      out.push(msg);
    });
    return out;
  }

  /**
   * Discover attachments actually referenced by a message: images with
   * meaningful dimensions and file links. Status is honest: 'reference'
   * means we stored the URL/metadata, NOT the file contents.
   */
  function attachmentsOf(el) {
    var out = [];
    if (!el) return out;
    try {
      el.querySelectorAll('img').forEach(function (img) {
        var src = img.getAttribute('src') || '';
        if (!src || src.indexOf('data:image/svg') === 0) return;
        var w = img.naturalWidth || parseInt(img.getAttribute('width'), 10) || 0;
        var h = img.naturalHeight || parseInt(img.getAttribute('height'), 10) || 0;
        // Skip tiny icons, avatars and chrome glyphs.
        if (w > 0 && w < 64 && h > 0 && h < 64) return;
        if (/avatar|profile|logo|icon/i.test(img.className + ' ' + (img.getAttribute('alt') || ''))) return;
        out.push({
          filename: guessName(src, img.getAttribute('alt'), 'image'),
          mime: 'image/*',
          size: null,
          url: src.slice(0, 2000),
          alt: (img.getAttribute('alt') || '').slice(0, 500) || null,
          status: 'reference',
        });
      });
      el.querySelectorAll('a[download], a[href]').forEach(function (a) {
        var href = a.getAttribute('href') || '';
        var isFile = a.hasAttribute('download') || /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|tar|gz|json|md|py|js|ts)$/i.test(href.split('?')[0]);
        if (!isFile || !href) return;
        if (href.charAt(0) === '#') return;
        out.push({
          filename: guessName(href, a.textContent, 'file'),
          mime: null,
          size: null,
          url: href.slice(0, 2000),
          caption: textOf(a).slice(0, 200) || null,
          status: 'reference',
        });
      });
    } catch (_e) { /* attachments are best-effort metadata */ }
    // One entry per URL.
    var seen = new Set();
    return out.filter(function (a) {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });
  }

  function guessName(url, fallback, kind) {
    var name = String(fallback || '').trim();
    if (name && name.length < 200) return name;
    try {
      var p = new URL(url, location.href);
      var base = p.pathname.split('/').filter(Boolean).pop();
      if (base) return decodeURIComponent(base).slice(0, 200);
    } catch (_e) { /* keep fallback */ }
    return (kind === 'image' ? 'image' : 'attachment') + (url ? '-' + url.length : '');
  }

  // --- Editor injection + verification ---------------------------------------

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

  function setNativeValue(el, value) {
    try {
      var proto = null;
      if (el.tagName === 'TEXTAREA') proto = window.HTMLTextAreaElement.prototype;
      else if (el.tagName === 'INPUT') proto = window.HTMLInputElement.prototype;
      if (proto) {
        var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        if (setter) setter.call(el, value);
        else el.value = value;
      } else {
        el.value = value;
      }
    } catch (_e) {
      try { el.value = value; } catch (_e2) {}
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
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
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      return insertIntoEditable(el, value);
    }
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      setNativeValue(el, value);
      return true;
    }
    return insertIntoEditable(el, value);
  }

  /**
   * Read back what the editor currently holds, so injection can be
   * VERIFIED instead of assumed. Framework editors normalize text
   * (blank lines, trailing spaces), so the check is containment-based.
   */
  function readEditorValue(el) {
    if (!el) return '';
    try {
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return String(el.value || '');
      return String(el.innerText != null ? el.innerText : el.textContent || '');
    } catch (_e) {
      return '';
    }
  }

  function normalizeForVerify(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Verify the editor accepted the payload: normalized containment of a
   * distinctive slice plus a length floor (editors may trim whitespace
   * but never drop most of the text).
   */
  function verifyInjected(el, payload) {
    if (!el || !payload) return false;
    var current = normalizeForVerify(readEditorValue(el));
    if (!current) return false;
    var wanted = normalizeForVerify(payload);
    var probe = wanted.slice(0, Math.min(80, wanted.length));
    if (probe && current.indexOf(probe) === -1) return false;
    return current.length >= Math.floor(wanted.length * 0.6);
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

  return {
    textOf: textOf,
    structuredTextOf: structuredTextOf,
    pruneContained: pruneContained,
    collectMessages: collectMessages,
    attachmentsOf: attachmentsOf,
    queryFirst: queryFirst,
    setNativeValue: setNativeValue,
    insertIntoEditable: insertIntoEditable,
    injectValue: injectValue,
    readEditorValue: readEditorValue,
    verifyInjected: verifyInjected,
    observeContainer: observeContainer,
  };
})();

if (typeof window !== 'undefined') window.RelayDOM = RelayDOM;
if (typeof module !== 'undefined' && module.exports) module.exports = RelayDOM;
