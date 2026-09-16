/**
 * Relay unit tests — scraper base factory (fallback detection) and injector manager.
 */
const test = require('node:test');
const assert = require('node:assert');

// --- base.js: the usedGeneric fallback flag -------------------------------
global.window = global; // base.js registers factories on window
const RelayBase = require('../../content/platforms/base.js');

test('makeScraper: native scrape result sets usedGeneric=false', () => {
  const s = RelayBase.makeScraper({
    scrape: () => [{ role: 'user', content: 'hi', index: 0 }],
    hasConversation: () => true,
    container: () => null,
  }, 'TestScraperNative');
  const out = s.scrapeMessages();
  assert.strictEqual(out.length, 1);
  assert.strictEqual(s.usedGeneric, false);
});

test('makeScraper: empty native result falls back and flags usedGeneric=true', () => {
  global.GenericScraper = { scrapeMessages: () => [{ role: 'user', content: 'generic', index: 0 }] };
  const s = RelayBase.makeScraper({
    scrape: () => [],
    hasConversation: () => false,
    container: () => null,
  }, 'TestScraperFallback');
  const out = s.scrapeMessages();
  assert.strictEqual(out[0].content, 'generic');
  assert.strictEqual(s.usedGeneric, true);
  delete global.GenericScraper;
});

test('makeScraper: native selectors are re-checked on every scrape', () => {
  global.GenericScraper = { scrapeMessages: () => [{ role: 'user', content: 'generic', index: 0 }] };
  let nativeHasData = false;
  const s = RelayBase.makeScraper({
    scrape: () => (nativeHasData ? [{ role: 'user', content: 'native', index: 0 }] : []),
    container: () => null,
  }, 'TestScraperRecheck');
  s.scrapeMessages();
  assert.strictEqual(s.usedGeneric, true);
  nativeHasData = true;
  s.scrapeMessages();
  assert.strictEqual(s.usedGeneric, false);
  delete global.GenericScraper;
});

test('makeInjector: injectText targets the first available input', async () => {
  global.RelayDOM = {
    queryFirst: (sels) => (sels.includes('#real') ? 'found' : null),
    injectValue: async (el, text) => el + ':' + text,
  };
  const inj = RelayBase.makeInjector({ inputs: ['#fake', '#real'], submits: [] }, 'TestInjector');
  assert.strictEqual(await inj.injectText('hello'), 'found:hello');
  delete global.RelayDOM;
});

// --- injector.js: manager maps -------------------------------------------
const InjectorManager = require('../../content/injector.js');

test('getScraper/getInjector: resolve registered globals', () => {
  global.window = global;
  global.window.ChatGPTScraper = { scrapeMessages: () => [] };
  global.window.ClaudeInjector = { injectText: async () => true };
  assert.strictEqual(InjectorManager.getScraper('chatgpt'), global.window.ChatGPTScraper);
  assert.strictEqual(InjectorManager.getInjector('claude'), global.window.ClaudeInjector);
  assert.strictEqual(InjectorManager.getScraper('unknown-platform'), null);
  delete global.window.ChatGPTScraper;
  delete global.window.ClaudeInjector;
});

test('checkAndInject: no pending injection is a no-op', async () => {
  const store = new Map();
  global.chrome = { storage: { local: {
    async get(k) { const o = {}; if (store.has(k)) o[k] = store.get(k); return o; },
    async set(o) { for (const [k, v] of Object.entries(o)) store.set(k, v); },
    async remove(k) { store.delete(k); },
  } } };
  const compress = require('../../utils/compress.js');
  global.RelayCompress = compress;
  delete require.cache[require.resolve('../../utils/storage.js')];
  const RelayStorage = require('../../utils/storage.js');
  global.RelayStorage = RelayStorage;
  const result = await InjectorManager.checkAndInject();
  assert.strictEqual(result.injected, false);
  assert.strictEqual(result.reason, 'empty');
});
