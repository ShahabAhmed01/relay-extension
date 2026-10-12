/**
 * Relay v2 unit tests — settings storage (chrome.storage.local wrapper).
 * The v1 session/history API is intentionally GONE (the archive replaced
 * it); these tests pin the new contract: defaults, normalization, v1-key
 * migration, pause state and transfer pointers.
 */
const test = require('node:test');
const assert = require('node:assert');

function freshStorage() {
  const store = new Map();
  global.chrome = { storage: { local: {
    async get(key) {
      const o = {};
      for (const k of (Array.isArray(key) ? key : [key])) if (store.has(k)) o[k] = store.get(k);
      return o;
    },
    async set(obj) { for (const [k, v] of Object.entries(obj)) store.set(k, v); },
    async remove(key) { (Array.isArray(key) ? key : [key]).forEach((k) => store.delete(k)); },
    async getBytesInUse() { return 0; },
  } } };
  delete require.cache[require.resolve('../../utils/storage.js')];
  const RelayStorage = require('../../utils/storage.js');
  global.RelayStorage = RelayStorage;
  return { RelayStorage, store };
}

test('getSettings: returns v2 defaults', async () => {
  const { RelayStorage } = freshStorage();
  const s = await RelayStorage.getSettings();
  assert.strictEqual(s.autoCapture, true);
  assert.strictEqual(s.handoffMode, 'full');
  assert.strictEqual(s.partBudget, 15000);
  assert.strictEqual(s.continuationCount, 30);
  assert.strictEqual(s.autoInsert, true);
  assert.strictEqual(s.captureAttachments, false);
  assert.strictEqual(s.debug, false);
  assert.strictEqual(s.theme, 'system');
  assert.deepStrictEqual(s.pausePlatforms, []);
});

test('normalizeSettings: clamps and rejects invalid values', () => {
  const { RelayStorage } = freshStorage();
  const s = RelayStorage.normalizeSettings({
    handoffMode: 'bogus', partBudget: 10, continuationCount: 99999,
    theme: 'solarized', fabPosition: 'middle', pausePlatforms: ['claude', 42, null],
  });
  assert.strictEqual(s.handoffMode, 'full');
  assert.strictEqual(s.partBudget, 4000); // min clamp
  assert.strictEqual(s.continuationCount, 200); // max clamp
  assert.strictEqual(s.theme, 'system');
  assert.strictEqual(s.fabPosition, 'bottom-right');
  assert.deepStrictEqual(s.pausePlatforms, ['claude'], 'only string platform ids survive');
});

test('v1 settings migration: includeFullHistory/maxMessages/autoInject map onto v2', () => {
  const { RelayStorage } = freshStorage();
  const full = RelayStorage.normalizeSettings({ includeFullHistory: true, maxMessages: 50, autoInject: false });
  assert.strictEqual(full.handoffMode, 'full');
  assert.strictEqual(full.autoInsert, false);

  const capped = RelayStorage.normalizeSettings({ includeFullHistory: false, maxMessages: 12 });
  assert.strictEqual(capped.handoffMode, 'continuation');
  assert.strictEqual(capped.continuationCount, 12);

  // v2 values win when both are present.
  const explicit = RelayStorage.normalizeSettings({ includeFullHistory: false, handoffMode: 'multipart' });
  assert.strictEqual(explicit.handoffMode, 'multipart');
});

test('saveSettings: merges partials and persists', async () => {
  const { RelayStorage, store } = freshStorage();
  await RelayStorage.saveSettings({ handoffMode: 'multipart' });
  const s = await RelayStorage.getSettings();
  assert.strictEqual(s.handoffMode, 'multipart');
  assert.strictEqual(s.autoCapture, true, 'untouched keys keep defaults');
  assert.ok(store.has('relay_settings'));
});

test('isCapturePaused: global and per-platform', async () => {
  const { RelayStorage } = freshStorage();
  let p = await RelayStorage.isCapturePaused('chatgpt');
  assert.strictEqual(p.paused, false);

  await RelayStorage.saveSettings({ pausePlatforms: ['chatgpt'] });
  p = await RelayStorage.isCapturePaused('chatgpt');
  assert.strictEqual(p.paused, true);
  assert.strictEqual(p.scope, 'platform');
  p = await RelayStorage.isCapturePaused('claude');
  assert.strictEqual(p.paused, false);

  await RelayStorage.saveSettings({ autoCapture: false });
  p = await RelayStorage.isCapturePaused('claude');
  assert.strictEqual(p.paused, true);
  assert.strictEqual(p.scope, 'global');
});

test('transfer pointer: set/get round trip', async () => {
  const { RelayStorage } = freshStorage();
  assert.strictEqual(await RelayStorage.getActiveTransferPointer(), null);
  await RelayStorage.setActiveTransferPointer('x_123');
  const p = await RelayStorage.getActiveTransferPointer();
  assert.strictEqual(p.transferId, 'x_123');
  assert.ok(p.at > 0);
});

test('saveSettings: surfaces storage failure instead of pretending', async () => {
  const { RelayStorage } = freshStorage();
  global.chrome.storage.local.set = async () => { throw new Error('QUOTA_BYTES exceeded'); };
  await assert.rejects(RelayStorage.saveSettings({ debug: true }), /Could not save settings/);
});
