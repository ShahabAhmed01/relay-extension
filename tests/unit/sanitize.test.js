/**
 * Relay unit tests — sanitize utility regression matrix.
 * Node-safe subset: the HTML-parse path requires a real DOM and is covered by e2e.
 */
const test = require('node:test');
const assert = require('node:assert');
const RelaySanitize = require('../../utils/sanitize.js');

test('sanitizeText: non-string input returns empty string', () => {
  assert.strictEqual(RelaySanitize.sanitizeText(null), '');
  assert.strictEqual(RelaySanitize.sanitizeText(undefined), '');
  assert.strictEqual(RelaySanitize.sanitizeText(42), '');
  assert.strictEqual(RelaySanitize.sanitizeText({ a: 1 }), '');
});

test('sanitizeText: decodes named and numeric HTML entities', () => {
  assert.strictEqual(RelaySanitize.sanitizeText('a &amp; b'), 'a & b');
  assert.strictEqual(RelaySanitize.sanitizeText('&lt;tag&gt;'), '<tag>');
  assert.strictEqual(RelaySanitize.sanitizeText('&#39;quoted&#x27;'), "'quoted'");
  assert.strictEqual(RelaySanitize.sanitizeText('&mdash;'), '—');
  assert.strictEqual(RelaySanitize.sanitizeText('&#128512;'), '😀');
});

test('sanitizeText: strips control characters but keeps text and newlines', () => {
  const out = RelaySanitize.sanitizeText('a\u0000b\u0007c\nd');
  assert.strictEqual(out, 'abc\nd');
});

test('sanitizeText: collapses excessive blank lines', () => {
  assert.strictEqual(RelaySanitize.sanitizeText('a\n\n\n\n\n\nb'), 'a\n\n\nb');
});

test('sanitizeText: truncates over-long messages with a note', () => {
  const long = 'x'.repeat(RelaySanitize.MAX_LENGTH + 500);
  const out = RelaySanitize.sanitizeText(long);
  assert.ok(out.length < RelaySanitize.MAX_LENGTH + 100);
  assert.ok(out.includes('[... truncated'));
});

test('sanitizeText: preserves code-looking angle brackets in Node (no DOM path)', () => {
  // Without a DOM the sanitizer must not corrupt plain text.
  assert.strictEqual(RelaySanitize.sanitizeText('use Array<T> here'), 'use Array<T> here');
});

test('sanitizeForStorage: normalizes roles, reindexes, keeps non-empty', () => {
  const out = RelaySanitize.sanitizeForStorage([
    { role: 'user', content: 'hello' },
    { role: 'system', content: 'kept as user' }, // non-assistant roles map to user
    { role: 'assistant', content: '' }, // empty content is dropped
    { role: 'weird', content: 'also user' },
  ]);
  assert.strictEqual(out.length, 3);
  assert.strictEqual(out[0].role, 'user');
  assert.strictEqual(out[0].index, 0);
  assert.strictEqual(out[1].index, 1);
  assert.strictEqual(out[2].role, 'user');
  assert.strictEqual(out[2].index, 3); // original indices are preserved, gaps allowed
});

test('sanitizeForStorage: non-array input returns empty array', () => {
  assert.deepStrictEqual(RelaySanitize.sanitizeForStorage(null), []);
  assert.deepStrictEqual(RelaySanitize.sanitizeForStorage('nope'), []);
});

test('stripMarkdown: removes emphasis but preserves fenced code blocks', () => {
  const md = '# Title\n**bold** and _it_ and `code`\n```js\nconst a = 1;\n```\n> quote\n- item';
  const out = RelaySanitize.stripMarkdown(md);
  assert.ok(!out.includes('# Title'));
  assert.ok(!out.includes('**bold**'));
  assert.ok(out.includes('```js\nconst a = 1;\n```'));
  assert.ok(out.includes('• item'));
});

test('stripMarkdown: handles unterminated fenced code without deleting content', () => {
  const out = RelaySanitize.stripMarkdown('text\n```js\nconst a = 1;');
  assert.ok(out.includes('const a = 1;'));
});

test('stripMarkdown: converts links to text + url', () => {
  const out = RelaySanitize.stripMarkdown('[example](https://example.com)');
  assert.strictEqual(out, 'example (https://example.com)');
});
