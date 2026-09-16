/**
 * Relay unit tests — formatter utility (budgets, markdown export, time).
 */
const test = require('node:test');
const assert = require('node:assert');
const RelayFormatter = require('../../utils/formatter.js');

function makeSession(n) {
  const messages = [];
  for (let i = 0; i < n; i++) {
    messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: 'msg ' + i, index: i });
  }
  return { platformId: 'chatgpt', platformName: 'ChatGPT', messages, messageCount: n };
}

test('pickMessages: keeps the most recent N messages', () => {
  const picked = RelayFormatter.pickMessages(makeSession(50), { maxMessages: 10 });
  assert.strictEqual(picked.messages.length, 10);
  assert.strictEqual(picked.messages[0].content, 'msg 40');
  assert.strictEqual(picked.truncated, true);
  assert.strictEqual(picked.totalCount, 50);
});

test('pickMessages: includeFullHistory keeps everything', () => {
  const picked = RelayFormatter.pickMessages(makeSession(50), { maxMessages: 10, includeFullHistory: true });
  assert.strictEqual(picked.messages.length, 50);
  assert.strictEqual(picked.truncated, false);
});

test('pickMessages: enforces the char budget from the front', () => {
  const session = makeSession(10);
  session.messages = session.messages.map((m) => ({ ...m, content: 'x'.repeat(1000) }));
  const picked = RelayFormatter.pickMessages(session, { maxMessages: 200, maxChars: 3000 });
  assert.ok(picked.messages.length <= 3);
  assert.strictEqual(picked.truncated, true);
});

test('pickMessages: never truncates down below one message', () => {
  const session = { messages: [{ role: 'user', content: 'x'.repeat(5000) }] };
  const picked = RelayFormatter.pickMessages(session, { maxChars: 10 });
  assert.strictEqual(picked.messages.length, 1);
});

test('format: includes header, labels and end marker', () => {
  const out = RelayFormatter.format(makeSession(4), {});
  assert.ok(out.includes('ChatGPT'));
  assert.ok(out.includes('👤 You: msg 0'));
  assert.ok(out.includes('🤖 AI: msg 3'));
  assert.ok(out.includes('[END OF HISTORY'));
});

test('format: empty session returns empty string', () => {
  assert.strictEqual(RelayFormatter.format(null, {}), '');
  assert.strictEqual(RelayFormatter.format({ messages: [] }, {}), '');
});

test('formatMarkdown: structured export with roles and metadata', () => {
  const session = makeSession(2);
  session.updatedAt = Date.now();
  const out = RelayFormatter.formatMarkdown(session, {});
  assert.ok(out.startsWith('# Relay export — ChatGPT'));
  assert.ok(out.includes('## User (1)'));
  assert.ok(out.includes('## Assistant (2)'));
});

test('formatSummary: previews the last 3 messages', () => {
  const out = RelayFormatter.formatSummary(makeSession(5));
  assert.ok(out.includes('msg 4'));
  assert.ok(!out.includes('msg 0'));
});

test('timeAgo: buckets correctly', () => {
  assert.strictEqual(RelayFormatter.timeAgo(Date.now() - 10 * 1000), 'just now');
  assert.strictEqual(RelayFormatter.timeAgo(Date.now() - 5 * 60 * 1000), '5m ago');
  assert.strictEqual(RelayFormatter.timeAgo(Date.now() - 3 * 3600 * 1000), '3h ago');
  assert.strictEqual(RelayFormatter.timeAgo(Date.now() - 2 * 86400 * 1000), '2d ago');
  assert.strictEqual(RelayFormatter.timeAgo(null), 'unknown');
});

test('estimateTokens: ~4 chars per token', () => {
  assert.strictEqual(RelayFormatter.estimateTokens('abcdefgh'), 2);
});
