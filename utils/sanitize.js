/**
 * Relay v1.1.0 — Sanitize Utility
 * Preserves code/math (incl. <div>, generics) while stripping real HTML.
 * Uses DOM parsing when available; regex fallback otherwise.
 */

var RelaySanitize = (function () {
  'use strict';

  var MAX_LENGTH = 20000; // per-message cap; session char budget lives in storage.js
  var TRUNC_NOTE = '\n\n[... truncated: message exceeded 20,000 characters]';

  var ENTITY_MAP = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&#x27;': "'",
    '&#x2F;': '/', '&hellip;': '...', '&mdash;': '—', '&ndash;': '–',
    '&laquo;': '«', '&raquo;': '»', '&copy;': '©', '&reg;': '®', '&trade;': '™',
  };

  function decodeEntities(s) {
    var out = s;
    for (var k in ENTITY_MAP) {
      if (out.indexOf(k) !== -1) out = out.split(k).join(ENTITY_MAP[k]);
    }
    out = out.replace(/&#(\d+);/g, function (_, c) {
      var n = parseInt(c, 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    });
    out = out.replace(/&#x([0-9a-fA-F]+);/g, function (_, c) {
      var n = parseInt(c, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    });
    return out;
  }

  // Extract readable text from an element without destroying <code> content.
  function elementToText(el) {
    try {
      var clone = el.cloneNode(true);
      var drop = clone.querySelectorAll('script,style,noscript,svg,button,input,select,textarea');
      drop.forEach(function (n) { n.remove(); });
      // Keep code blocks on their own lines.
      clone.querySelectorAll('pre').forEach(function (p) {
        p.textContent = '\n```\n' + p.textContent + '\n```\n';
      });
      clone.querySelectorAll('br').forEach(function (b) { b.replaceWith('\n'); });
      clone.querySelectorAll('p,div,li,h1,h2,h3,h4,tr').forEach(function (b) {
        b.prepend(document.createTextNode('\n'));
        b.append(document.createTextNode('\n'));
      });
      var t = clone.innerText != null ? clone.innerText : clone.textContent;
      return String(t || '');
    } catch (_e) {
      return el.textContent || '';
    }
  }

  function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    var clean = text;
    // If input still contains markup, parse it instead of regex-stripping
    // (regex `<[^>]*>` corrupts code like `a<div>b` or `T<X>`).
    if (clean.indexOf('<') !== -1 && clean.indexOf('>') !== -1 && typeof document !== 'undefined') {
      try {
        var tpl = document.createElement('template');
        tpl.innerHTML = clean;
        clean = elementToText(tpl.content);
      } catch (_e) { /* fall through */ }
    }
    clean = decodeEntities(clean);
    clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    clean = clean.replace(/ +\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
    if (clean.length > MAX_LENGTH) {
      clean = clean.substring(0, MAX_LENGTH) + TRUNC_NOTE;
    }
    return clean;
  }

  function sanitizeForStorage(messages) {
    if (!Array.isArray(messages)) return [];
    var now = Date.now();
    return messages.map(function (msg, index) {
      return {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: sanitizeText(msg.content || ''),
        index: msg.index !== undefined ? msg.index : index,
        timestamp: msg.timestamp || now,
      };
    }).filter(function (m) { return m.content.length > 0; });
  }

  function stripMarkdown(text) {
    if (typeof text !== 'string') return '';
    // Preserve fenced code blocks via placeholders (v1.0 deleted them).
    var blocks = [];
    var out = String(text).replace(/```[\s\S]*?(?:```|$)/g, function (b) {
      blocks.push(b);
      return '\u0000' + (blocks.length - 1) + '\u0000';
    });
    out = out
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1$2')
      .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1$2')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      .replace(/^>\s?/gm, '')
      .replace(/^[-*+]\s+\[[ xX]\]\s+/gm, '')
      .replace(/^(\s*)[-*+]\s+/gm, '$1• ');
    out = out.replace(/\u0000(\d+)\u0000/g, function (_, i) { return blocks[Number(i)] || ''; });
    return out.trim();
  }

  return {
    sanitizeText: sanitizeText,
    sanitizeForStorage: sanitizeForStorage,
    stripMarkdown: stripMarkdown,
    elementToText: elementToText,
    MAX_LENGTH: MAX_LENGTH,
  };
})();

if (typeof window !== 'undefined') window.RelaySanitize = RelaySanitize;
if (typeof module !== 'undefined' && module.exports) module.exports = RelaySanitize;

