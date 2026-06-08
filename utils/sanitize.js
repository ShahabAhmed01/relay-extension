/**
 * Relay — Sanitize Utility
 * Cleans and sanitizes text content before storage and injection.
 */

const RelaySanitize = (() => {
  const MAX_LENGTH = 50000;

  function sanitizeText(text) {
    if (typeof text !== 'string') return '';

    let clean = text;

    clean = clean.replace(/<[^>]*>/g, '');

    const entities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&nbsp;': ' ',
      '&#x27;': "'",
      '&#x2F;': '/',
      '&hellip;': '...',
      '&mdash;': '—',
      '&ndash;': '–',
      '&laquo;': '«',
      '&raquo;': '»',
      '&copy;': '©',
      '&reg;': '®',
      '&trade;': '™',
    };
    for (const [entity, char] of Object.entries(entities)) {
      clean = clean.split(entity).join(char);
    }
    clean = clean.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
    clean = clean.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

    clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    clean = clean.replace(/\n{4,}/g, '\n\n\n');

    clean = clean.trim();

    if (clean.length > MAX_LENGTH) {
      clean = clean.substring(0, MAX_LENGTH) + '\n\n[... content truncated at 50,000 characters]';
    }

    return clean;
  }

  function sanitizeForStorage(messages) {
    if (!Array.isArray(messages)) return [];
    return messages.map((msg, index) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: sanitizeText(msg.content || ''),
      index: msg.index !== undefined ? msg.index : index,
      timestamp: msg.timestamp || Date.now(),
    }));
  }

  function stripMarkdown(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`{3}[\s\S]*?`{3}/g, '')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/^>\s+/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .trim();
  }

  return {
    sanitizeText,
    sanitizeForStorage,
    stripMarkdown,
    MAX_LENGTH,
  };
})();

if (typeof window !== 'undefined') {
  window.RelaySanitize = RelaySanitize;
}
