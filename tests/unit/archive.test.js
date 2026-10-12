/**
 * Relay v2 unit tests — conversation archive (IndexedDB via fake-indexeddb).
 *
 * These are the data-integrity guarantees from the product requirements:
 * lossless persistence, order preservation, unicode survival, repeated
 * identical messages as separate turns, streaming without duplication,
 * quota failures that never silently replace the archive, scoped deletion,
 * export/import round trips, and legacy migration.
 */
const test = require('node:test');
const assert = require('node:assert');

// Fresh fake IndexedDB per test -> full isolation.
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

function freshDB() {
  const RelayIDB = require('../../utils/idb.js');
  global.RelayIDB = RelayIDB; // sibling script in the extension; global in tests
  RelayIDB._resetForTests();
  global.indexedDB = new IDBFactory();
  global.IDBKeyRange = IDBKeyRange;
  global.RelayReconcile = require('../../utils/reconcile.js');
  return require('../../utils/archive.js');
}

function msgs(spec) {
  return spec.map(([role, content]) => ({ role, content }));
}
function readback(Archive, id) {
  return Archive.getConversation(id).then((conv) =>
    Archive.getMessages(id).then((messages) => ({ conv, messages })));
}

test('captureBatch: first capture preserves every message, in order, with roles intact', async () => {
  const Archive = freshDB();
  const incoming = msgs([
    ['user', 'Build me a dashboard'],
    ['assistant', 'Sure — which stack?'],
    ['user', 'React + D3'],
    ['assistant', 'Here is the plan:\n\n1. components\n2. charts\n3. state'],
  ]);
  const res = await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key: 'chatgpt|/c/abc', url: 'https://chatgpt.com/c/abc', title: '' }, incoming);
  assert.strictEqual(res.conversationId, 'chatgpt|/c/abc');
  assert.strictEqual(res.stats.added, 4);
  const back = await readback(Archive, 'chatgpt|/c/abc');
  assert.strictEqual(back.messages.length, 4);
  assert.strictEqual(back.conv.messageCount, 4);
  for (let i = 0; i < 4; i++) {
    assert.strictEqual(back.messages[i].role, incoming[i].role);
    assert.strictEqual(back.messages[i].content, incoming[i].content);
  }
  assert.ok(back.messages[0].seq < back.messages[1].seq, 'seq order');
});

test('captureBatch: unicode, emoji and long code blocks survive round trips', async () => {
  const Archive = freshDB();
  const code = 'function 例(a, b) {\n  return "🚀 ünïcode — " + (a ** b);\n}\n'.repeat(50);
  const incoming = msgs([
    ['user', '日本語のテスト 😀 émojis — résumé'],
    ['assistant', code],
  ]);
  await Archive.captureBatch({ platformId: 'claude', platformName: 'Claude', key: 'claude|/chat/x', url: 'https://claude.ai/chat/x', title: '' }, incoming);
  const back = await readback(Archive, 'claude|/chat/x');
  assert.strictEqual(back.messages[0].content, '日本語のテスト 😀 émojis — résumé');
  assert.strictEqual(back.messages[1].content, code);
});

test('captureBatch: repeated identical messages persist as separate turns', async () => {
  const Archive = freshDB();
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key: 'k', url: '', title: '' },
    msgs([['user', 'test'], ['assistant', 'ok'], ['user', 'test']]));
  let back = await readback(Archive, 'k');
  assert.strictEqual(back.messages.length, 3, 'both identical user turns must exist');
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key: 'k', url: '', title: '' },
    msgs([['user', 'test'], ['assistant', 'ok'], ['user', 'test'], ['assistant', 'done'], ['user', 'test']]));
  back = await readback(Archive, 'k');
  assert.strictEqual(back.messages.length, 5, 'third identical turn also persists');
  const userTurns = back.messages.filter((m) => m.role === 'user');
  assert.strictEqual(userTurns.length, 3);
});

test('captureBatch: appends keep earlier records untouched (stable ids)', async () => {
  const Archive = freshDB();
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key: 'k', url: '' },
    msgs([['user', 'q1'], ['assistant', 'a1']]));
  const first = (await readback(Archive, 'k')).messages;
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key: 'k', url: '' },
    msgs([['user', 'q1'], ['assistant', 'a1'], ['user', 'q2'], ['assistant', 'a2']]));
  const second = (await readback(Archive, 'k')).messages;
  assert.strictEqual(second.length, 4);
  assert.strictEqual(second[0].id, first[0].id, 'existing message id must be stable');
  assert.strictEqual(second[1].id, first[1].id);
  assert.strictEqual(second[0].revision, 1);
  assert.strictEqual(second[2].content, 'q2');
});

test('captureBatch: streaming growth updates one record, coalescing deltas', async () => {
  const Archive = freshDB();
  const key = 'k';
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key, url: '' },
    msgs([['user', 'q1'], ['assistant', 'Hel']]));
  for (const grown of ['Hello', 'Hello world', 'Hello world, here is the full answer.']) {
    await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key, url: '' },
      msgs([['user', 'q1'], ['assistant', grown]]));
  }
  const back = await readback(Archive, key);
  assert.strictEqual(back.messages.length, 2, 'no duplicates from streaming');
  assert.strictEqual(back.messages[1].content, 'Hello world, here is the full answer.');
  assert.ok(back.messages[1].previousRevisions.length <= 2, 'deltas coalesce instead of stacking');
  assert.strictEqual(back.messages[1].revision, 4);
});

test('captureBatch: mid-conversation edit updates the right record and keeps history', async () => {
  const Archive = freshDB();
  const key = 'k';
  const spec = [['user', 'q1'], ['user', 'fix this'], ['assistant', 'a1'], ['user', 'q2']];
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key, url: '' }, msgs(spec));
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key, url: '' },
    msgs([['user', 'q1'], ['user', 'fix that please'], ['assistant', 'a1'], ['user', 'q2']]));
  const back = await readback(Archive, key);
  assert.strictEqual(back.messages.length, 4, 'edit must not add a record');
  assert.strictEqual(back.messages[1].content, 'fix that please');
  assert.strictEqual(back.messages[1].previousRevisions.length, 1);
  assert.strictEqual(back.messages[1].previousRevisions[0].content, 'fix this');
  assert.strictEqual(back.messages[3].content, 'q2', 'later messages untouched');
});

test('captureBatch: virtualized window keeps offscreen archive; full scan marks complete', async () => {
  const Archive = freshDB();
  const key = 'k';
  await Archive.captureBatch({ platformId: 'claude', platformName: 'Claude', key, url: '' },
    msgs([['user', 'old1'], ['assistant', 'old2'], ['user', 'q1'], ['assistant', 'a1']]));
  // Only the tail is rendered now.
  const partial = await Archive.captureBatch({ platformId: 'claude', platformName: 'Claude', key, url: '' },
    msgs([['user', 'q1'], ['assistant', 'a1']]));
  assert.strictEqual(partial.conversation.completeness.status, 'partial');
  let back = await readback(Archive, key);
  assert.strictEqual(back.messages.length, 4, 'older messages are never dropped');
  // Full capture scrolls to the top and verifies the whole thread.
  const full = await Archive.captureBatch(
    { platformId: 'claude', platformName: 'Claude', key, url: '', fullScan: true, reachedTop: true },
    msgs([['user', 'old1'], ['assistant', 'old2'], ['user', 'q1'], ['assistant', 'a1']]));
  assert.strictEqual(full.conversation.completeness.status, 'complete');
  back = await readback(Archive, key);
  assert.strictEqual(back.messages.length, 4);
});

test('captureBatch: scroll-up reveal prepends older messages in correct order', async () => {
  const Archive = freshDB();
  const key = 'k';
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key, url: '' },
    msgs([['user', 'q1'], ['assistant', 'a1']]));
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key, url: '', fullScan: true, reachedTop: true },
    msgs([['user', 'old1'], ['assistant', 'old2'], ['user', 'q1'], ['assistant', 'a1']]));
  const back = await readback(Archive, key);
  assert.strictEqual(back.messages.length, 4);
  assert.deepStrictEqual(back.messages.map((m) => m.content), ['old1', 'old2', 'q1', 'a1']);
});

test('captureBatch: quota failure never replaces the archive and is reported', async () => {
  const Archive = freshDB();
  const RelayIDB = require('../../utils/idb.js');
  const key = 'k';
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key, url: '' },
    msgs([['user', 'q1'], ['assistant', 'a1'], ['user', 'q2'], ['assistant', 'a2']]));
  const before = await readback(Archive, key);

  // Make every put fail with a quota error, like a real exhausted disk.
  const db = await RelayIDB.open();
  const origTransaction = db.transaction.bind(db);
  db.transaction = function (names, mode) {
    const t = origTransaction(names, mode);
    const origStore = t.objectStore.bind(t);
    t.objectStore = function (name) {
      const store = origStore(name);
      if (mode === 'readwrite') {
        return new Proxy(store, {
          get(target, prop) {
            if (prop === 'put' || prop === 'add') {
              return function () {
                const err = new Error('The quota has been exceeded');
                err.name = 'QuotaExceededError';
                throw err;
              };
            }
            const v = target[prop];
            return typeof v === 'function' ? v.bind(target) : v;
          },
        });
      }
      return store;
    };
    return t;
  };

  await assert.rejects(
    Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key, url: '' },
      msgs([['user', 'q1'], ['assistant', 'a1'], ['user', 'q2'], ['assistant', 'a2'], ['user', 'q3']])),
    (err) => {
      assert.ok(Archive.isQuotaError(err) || /quota/i.test(String(err.message)), 'must reject with quota error, got: ' + err.message);
      return true;
    }
  );

  // THE guarantee: the archive is byte-for-byte what it was before the
  // failed save — not a smaller "successfully saved" version.
  const after = await readback(Archive, key);
  assert.strictEqual(after.messages.length, before.messages.length);
  assert.deepStrictEqual(after.messages.map((m) => m.content), before.messages.map((m) => m.content));
  assert.strictEqual(after.messages.length, 4, 'no partial replacement');
  assert.strictEqual(after.conv.lastSaveOk, true, 'previous save state untouched');
});

test('captureBatch: same-platform different chat does not merge (no-URL platforms)', async () => {
  const Archive = freshDB();
  // Chat A on a platform whose URL never changes.
  await Archive.captureBatch({ platformId: 'metaai', platformName: 'Meta AI', key: 'metaai|~default', url: 'https://www.meta.ai/' },
    msgs([['user', 'topic A 1'], ['assistant', 'answer A 1'], ['user', 'topic A 2'], ['assistant', 'answer A 2']]));
  // Chat B: shares nothing with chat A.
  const res = await Archive.captureBatch({ platformId: 'metaai', platformName: 'Meta AI', key: 'metaai|~default', url: 'https://www.meta.ai/' },
    msgs([['user', 'completely different topic'], ['assistant', 'different answer']]));
  assert.notStrictEqual(res.conversationId, 'metaai|~default', 'a disjoint chat must get its own conversation');
  const list = await Archive.listConversations();
  assert.strictEqual(list.length, 2);
  const originals = await readback(Archive, 'metaai|~default');
  assert.strictEqual(originals.messages.length, 4, 'chat A untouched by chat B');
});

test('captureBatch: same chat continuation merges into the same conversation', async () => {
  const Archive = freshDB();
  const key = 'metaai|~default';
  await Archive.captureBatch({ platformId: 'metaai', platformName: 'Meta AI', key, url: '' },
    msgs([['user', 'q1'], ['assistant', 'a1'], ['user', 'q2'], ['assistant', 'a2']]));
  const res = await Archive.captureBatch({ platformId: 'metaai', platformName: 'Meta AI', key, url: '' },
    msgs([['user', 'q1'], ['assistant', 'a1'], ['user', 'q2'], ['assistant', 'a2'], ['user', 'q3']]));
  assert.strictEqual(res.conversationId, key);
  const list = await Archive.listConversations();
  assert.strictEqual(list.length, 1);
});

test('deleteConversation: deletes exactly one archive', async () => {
  const Archive = freshDB();
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key: 'a', url: '' }, msgs([['user', 'one']]));
  await Archive.captureBatch({ platformId: 'claude', platformName: 'Claude', key: 'b', url: '' }, msgs([['user', 'two']]));
  await Archive.deleteConversation('a');
  const list = await Archive.listConversations();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].id, 'b');
  const remaining = await readback(Archive, 'b');
  assert.strictEqual(remaining.messages.length, 1);
  assert.strictEqual(await Archive.getConversation('a'), null);
});

test('export/import: lossless round trip through JSON', async () => {
  const Archive = freshDB();
  const incoming = msgs([
    ['user', 'q1 😀'], ['assistant', 'a1\n```\ncode <block> & stuff\n```'],
    ['user', 'q2'], ['assistant', 'a2 — dash'],
  ]);
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key: 'k', url: '', title: 'My Project' }, incoming);
  const export1 = await Archive.exportAll();

  const json = JSON.parse(JSON.stringify(export1)); // structured-clone sim
  await Archive.deleteAll();
  const report = await Archive.importArchive(json);
  assert.strictEqual(report.conversations, 1);
  assert.strictEqual(report.messagesAdded, 4);

  const back = await readback(Archive, 'k');
  assert.strictEqual(back.conv.title, 'My Project');
  assert.deepStrictEqual(back.messages.map((m) => m.content), incoming.map((m) => m.content));
  assert.deepStrictEqual(back.messages.map((m) => m.role), incoming.map((m) => m.role));
});

test('import: merge into existing conversation keeps everything', async () => {
  const Archive = freshDB();
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key: 'k', url: '' },
    msgs([['user', 'q1'], ['assistant', 'a1']]));
  const payload = {
    relayArchive: true, version: 2, conversations: [{
      id: 'k', platformId: 'chatgpt', platformName: 'ChatGPT', title: 'imported',
      messages: msgs([['user', 'q1'], ['assistant', 'a1'], ['user', 'imported new']]),
      attachments: [],
    }],
  };
  const report = await Archive.importArchive(payload);
  assert.strictEqual(report.messagesAdded, 1);
  assert.strictEqual(report.messagesKept, 2);
  const back = await readback(Archive, 'k');
  assert.strictEqual(back.messages.length, 3, 'import never deletes existing content');
  assert.strictEqual(back.messages[2].content, 'imported new');
});

test('import: invalid archives are rejected without writing', async () => {
  const Archive = freshDB();
  await assert.rejects(Archive.importArchive({ foo: 1 }), /relayArchive/);
  await assert.rejects(
    Archive.importArchive({ relayArchive: true, version: 99, conversations: [] }),
    /newer/
  );
  await assert.rejects(
    Archive.importArchive({ relayArchive: true, version: 2, conversations: [{ id: 'x', messages: [{ nope: true }] }] }),
    /invalid/
  );
  const list = await Archive.listConversations();
  assert.strictEqual(list.length, 0, 'nothing written on rejection');
});

test('migrateLegacyData: v1 session preserved, truncation noted honestly', async () => {
  const Archive = freshDB();
  const legacySession = {
    platformId: 'chatgpt', platformName: 'ChatGPT', capturedAt: 1000, updatedAt: 2000,
    messageCount: 30, originalMessageCount: 120, truncated: true,
    messages: msgs([['user', 'legacy q'], ['assistant', 'legacy a']]),
  };
  const legacyHistory = [{ platformId: 'claude', platformName: 'Claude', messageCount: 5, capturedAt: 500, updatedAt: 600 }];
  const report = await Archive.migrateLegacyData(legacySession, legacyHistory);
  assert.strictEqual(report.migratedConversations, 2);
  assert.strictEqual(report.migratedMessages, 2);
  const list = await Archive.listConversations();
  const session = list.find((c) => c.id.indexOf('legacy|chatgpt') === 0);
  assert.ok(session, 'legacy session conversation exists');
  assert.strictEqual(session.completeness.note, 'Imported from Relay v1, which capped stored history');
  const messages = await Archive.getMessages(session.id);
  assert.strictEqual(messages.length, 2);
  assert.strictEqual(messages[0].content, 'legacy q');
});

test('search: finds conversations by title and by message content', async () => {
  const Archive = freshDB();
  await Archive.captureBatch({ platformId: 'chatgpt', platformName: 'ChatGPT', key: 'k1', url: '', title: 'Kubernetes debugging' },
    msgs([['user', 'why does the pod crash'], ['assistant', 'check the liveness probe']]));
  await Archive.captureBatch({ platformId: 'claude', platformName: 'Claude', key: 'k2', url: '', title: 'Recipe ideas' },
    msgs([['user', 'pasta carbonara steps']]));
  const byTitle = await Archive.searchConversations('kubernetes');
  assert.strictEqual(byTitle.length, 1);
  assert.strictEqual(byTitle[0].id, 'k1');
  const byContent = await Archive.searchConversations('liveness');
  assert.strictEqual(byContent.length, 1);
  assert.strictEqual(byContent[0].id, 'k1');
  const byNone = await Archive.searchConversations('xyzzy-nothing');
  assert.strictEqual(byNone.length, 0);
});

test('transfers: multi-part lifecycle — create, advance, complete, prune', async () => {
  const Archive = freshDB();
  const t = await Archive.createTransfer({
    sourceConversationId: 'k', targetPlatformId: 'claude', mode: 'full',
    parts: [
      { text: 'part 1 text', messageRange: [1024, 4096] },
      { text: 'part 2 text', messageRange: [5120, 8192] },
    ],
    manifest: { messagesIncluded: 4 },
  });
  assert.strictEqual(t.parts.length, 2);
  assert.strictEqual(t.status, 'multipart');
  const active = await Archive.getActiveTransferForPlatform('claude');
  assert.strictEqual(active.id, t.id);
  assert.strictEqual((await Archive.getActiveTransferForPlatform('gemini')), null);

  await Archive.updateTransferPart(t.id, 0, { status: 'sent', insertedAt: Date.now() });
  let cur = await Archive.getTransfer(t.id);
  assert.strictEqual(cur.parts[0].status, 'sent');
  assert.strictEqual(cur.status, 'multipart');
  await Archive.updateTransferPart(t.id, 1, { status: 'sent', insertedAt: Date.now() });
  cur = await Archive.getTransfer(t.id);
  assert.strictEqual(cur.status, 'complete');
  assert.strictEqual((await Archive.getActiveTransferForPlatform('claude')), null, 'completed transfers are inactive');

  await Archive.pruneOldTransfers(0); // prune everything older than now
  assert.strictEqual((await Archive.listTransfers()).length, 0);
});

test('conversationKeyFromUrl: path ids and defaults', () => {
  const Archive = freshDB();
  assert.strictEqual(Archive.conversationKeyFromUrl('chatgpt', 'https://chatgpt.com/c/abc-123'), 'chatgpt|/c/abc-123');
  assert.strictEqual(Archive.conversationKeyFromUrl('claude', 'https://claude.ai/chat/xyz'), 'claude|/chat/xyz');
  assert.strictEqual(Archive.conversationKeyFromUrl('metaai', 'https://www.meta.ai/'), 'metaai|~default');
  assert.strictEqual(Archive.conversationKeyFromUrl('grok', 'https://grok.com/new'), 'grok|~default');
  assert.strictEqual(Archive.conversationKeyFromUrl('gemini', 'https://gemini.google.com/app/abc'), 'gemini|/app/abc');
});
