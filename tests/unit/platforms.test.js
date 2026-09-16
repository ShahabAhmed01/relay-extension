/**
 * Relay unit tests — platform registry & manifest parity.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const RelayPlatforms = require('../../content/platforms/index.js');

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../manifest.json'), 'utf8')
);

test('registry: 13 platforms with unique ids', () => {
  const ids = RelayPlatforms.getAllPlatforms().map((p) => p.id);
  assert.strictEqual(ids.length, 13);
  assert.strictEqual(new Set(ids).size, 13);
  for (const id of ['chatgpt', 'claude', 'gemini', 'aistudio', 'perplexity', 'deepseek',
    'grok', 'copilot', 'metaai', 'mistral', 'huggingchat', 'poe', 'qwen']) {
    assert.ok(ids.includes(id), 'missing platform ' + id);
  }
});

test('detectPlatform: exact and subdomain matching', () => {
  assert.strictEqual(RelayPlatforms.detectPlatform('chatgpt.com').id, 'chatgpt');
  assert.strictEqual(RelayPlatforms.detectPlatform('chat.openai.com').id, 'chatgpt');
  assert.strictEqual(RelayPlatforms.detectPlatform('www.claude.ai').id, 'claude');
  assert.strictEqual(RelayPlatforms.detectPlatform('tongyi.aliyun.com').id, 'qwen');
  assert.strictEqual(RelayPlatforms.detectPlatform('example.com'), null);
  assert.strictEqual(RelayPlatforms.detectPlatform(''), null);
  assert.strictEqual(RelayPlatforms.detectPlatform(null), null);
});

test('detectPlatform: x.com only matches the Grok embed path', () => {
  assert.strictEqual(RelayPlatforms.detectPlatform('x.com', '/i/grok').id, 'grok');
  assert.strictEqual(RelayPlatforms.detectPlatform('x.com', '/home'), null);
});

test('getPlatformById: round-trips and returns null for unknown', () => {
  assert.strictEqual(RelayPlatforms.getPlatformById('gemini').name, 'Gemini');
  assert.strictEqual(RelayPlatforms.getPlatformById('nope'), null);
});

test('every platform has a name, https url, matches and a color', () => {
  for (const p of RelayPlatforms.getAllPlatforms()) {
    assert.ok(p.name && p.name.length > 0, p.id + ' missing name');
    assert.ok(/^https:\/\//.test(p.url), p.id + ' url must be https');
    assert.ok(Array.isArray(p.matches) && p.matches.length > 0, p.id + ' missing matches');
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(p.color), p.id + ' color must be a hex triplet');
    assert.ok(typeof p.logoSvg === 'string' && p.logoSvg.includes('<svg'), p.id + ' missing logo');
  }
});

test('manifest parity: every registry match is covered by host_permissions', () => {
  const hosts = new Set(
    manifest.host_permissions.map((h) => h.replace(/^https?:\/\//, '').split('/')[0])
  );
  for (const p of RelayPlatforms.getAllPlatforms()) {
    for (const match of p.matches) {
      const covered = [...hosts].some((h) => match === h || match.endsWith('.' + h));
      assert.ok(covered, `${p.id} match "${match}" not in host_permissions`);
    }
  }
});

test('manifest parity: content_scripts matches match host_permissions', () => {
  const csMatches = new Set(manifest.content_scripts.flatMap((cs) => cs.matches));
  assert.deepStrictEqual(
    [...csMatches].sort(),
    [...manifest.host_permissions].sort()
  );
});

test('background platform URLs can be derived from the registry', () => {
  const urls = RelayPlatforms.PLATFORMS.reduce((m, p) => {
    m[p.id] = p.newChatUrl || p.url;
    return m;
  }, {});
  assert.strictEqual(urls.claude, 'https://claude.ai/new');
  assert.strictEqual(urls.gemini, 'https://gemini.google.com/app');
  assert.strictEqual(urls.chatgpt, 'https://chatgpt.com');
});
