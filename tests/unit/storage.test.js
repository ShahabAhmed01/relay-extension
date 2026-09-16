/**
 * Relay unit tests — storage utility with a mocked chrome.storage.local.
 */
const test = require('node:test');
const assert = require('node:assert');

function makeMockStorage() {
  const data = new Map();
  return { storage: { local: {
    async get(key) {
      if (key === null || key === undefined) return Object.fromEntries(data);
      if (Array.isArray(key)) {
        const o = {};
        for (const k of key) if (data.has(k)) o[k] = data.get(k);
        return o;
      }
      const o = {};
      if (data.has(key)) o[key] = data.get(key);
      return o;
    },
    async set(obj) { for (const [k, v] of Object.entries(obj)) data.set(k, v); },
    async remove(key) { (Array.isArray(key) ? key : [key]).forEach((k) => data.delete(k)); },
    async getBytesInUse() { return 0; },
  } } };
}

global.chrome = makeMockStorage();
const compress = require('../../utils/compress.js');
global.RelayCompress = compress;
const RelayStorage = require('../../utils/storage.js');

function msgs(n) {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant', content: 'message ' + i, index: i,
  }));
}

test('getSettings: returns defaults when nothing stored', async () => {
  const s = await RelayStorage.getSettings();
  assert.strictEqual(s.maxMessages, 30);
  assert.strictEqual(s.autoCapture, true);
  assert.strictEqual(s.theme, 'system');
  assert.strictEqual(s.maxChars, 120000);
});

test('normalizeSettings: clamps out-of-range values', async () => {
  assert.strictEqual(RelayStorage.normalizeMaxMessages(1), 5);
  assert.strictEqual(RelayStorage.normalizeMaxMessages(9999), 200);
  assert.strictEqual(RelayStorage.normalizeMaxMessages('garbage'), 30);
  const s = RelayStorage.normalizeSettings({ theme: 'solarized', fabPosition: 'middle', maxChars: 1 });
  assert.strictEqual(s.theme, 'system');
  assert.strictEqual(s.fabPosition, 'bottom-right');
  assert.strictEqual(s.maxChars, 20000); // min clamp
});

test('saveSession + getSession round-trips with compression and count', async () => {
  const session = await RelayStorage.saveSession('chatgpt', 'ChatGPT', msgs(12));
  assert.strictEqual(session.messageCount, 12);
  assert.strictEqual(session.platformId, 'chatgpt');
  const back = await RelayStorage.getSession();
  assert.strictEqual(back.messageCount, 12);
  assert.strictEqual(back.messages.length, 12);
  assert.strictEqual(back.messages[0].content, 'message 0');
});

test('saveSession: trims to maxMessages and keeps the most recent', async () => {
  await RelayStorage.saveSettings({ maxMessages: 5 });
  const session = await RelayStorage.saveSession('claude', 'Claude', msgs(20));
  assert.strictEqual(session.messages.length, 5);
  assert.strictEqual(session.messages[4].content, 'message 19');
  assert.strictEqual(session.truncated, true);
  assert.strictEqual(session.originalMessageCount, 20);
});

test('history: dedupes per capture and is bounded by HISTORY_LIMIT', async () => {
  await RelayStorage.saveSession('poe', 'Poe', msgs(3));
  await RelayStorage.saveSession('poe', 'Poe', msgs(4)); // same platform, updated capture
  let history = await RelayStorage.getHistory();
  assert.strictEqual(history.filter((h) => h.platformId === 'poe').length, 1);
  for (let i = 0; i < 30; i++) {
    await RelayStorage.saveSession('poe' + i, 'Poe' + i, msgs(2));
  }
  history = await RelayStorage.getHistory();
  assert.ok(history.length <= RelayStorage.HISTORY_LIMIT);
});

test('pending injection: set/get/clear and attempts bumping', async () => {
  assert.strictEqual(await RelayStorage.getPendingInjection(), null);
  await RelayStorage.setPendingInjection({ targetPlatformId: 'claude', formattedContext: 'ctx' });
  const p = await RelayStorage.getPendingInjection();
  assert.strictEqual(p.targetPlatformId, 'claude');
  assert.strictEqual(p.attempts, 0);
  await RelayStorage.bumpPendingAttempts();
  await RelayStorage.bumpPendingAttempts();
  assert.strictEqual((await RelayStorage.getPendingInjection()).attempts, 2);
  await RelayStorage.clearPendingInjection();
  assert.strictEqual(await RelayStorage.getPendingInjection(), null);
});

test('pending injection: rejects incomplete payloads', async () => {
  assert.strictEqual(await RelayStorage.setPendingInjection({ targetPlatformId: 'x' }), false);
  assert.strictEqual(await RelayStorage.setPendingInjection(null), false);
});

test('pending injection: expires after the 30-minute TTL', async () => {
  const realNow = Date.now;
  Date.now = () => realNow() - 31 * 60 * 1000; // travel 31 minutes into the past
  await RelayStorage.setPendingInjection({ targetPlatformId: 'gemini', formattedContext: 'old ctx' });
  Date.now = realNow;
  assert.strictEqual(await RelayStorage.getPendingInjection(), null);
});

test('pending injection: wrong-target pending is still returned (caller filters)', async () => {
  await RelayStorage.setPendingInjection({ targetPlatformId: 'deepseek', formattedContext: 'ctx' });
  const p = await RelayStorage.getPendingInjection();
  assert.strictEqual(p.targetPlatformId, 'deepseek');
  await RelayStorage.clearPendingInjection();
});

test('clearSession empties the current session', async () => {
  await RelayStorage.saveSession('qwen', 'Qwen', msgs(3));
  await RelayStorage.clearSession();
  assert.strictEqual(await RelayStorage.getSession(), null);
});

test('getStorageUsage: reports kb and warn flag', async () => {
  const usage = await RelayStorage.getStorageUsage();
  assert.strictEqual(typeof usage.kb, 'number');
  assert.strictEqual(usage.warn, false);
});

test('exportAll: valid JSON with version marker', async () => {
  const exported = JSON.parse(await RelayStorage.exportAll());
  assert.strictEqual(exported.version, 2);
  assert.ok(exported.exportedAt);
});
