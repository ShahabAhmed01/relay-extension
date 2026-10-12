/**
 * Relay v2 unit tests — reconciliation core.
 * The integrity-critical scenarios from the product requirements:
 * appends, mid-conversation edits, streaming growth, repeated identical
 * messages, insertions, virtualized (partial) renders, empty DOM.
 */
const test = require('node:test');
const assert = require('node:assert');
const R = require('../../utils/reconcile.js');

function knownList(spec) {
  // spec: [['user','a'], ['assistant','b'], ...]
  return spec.map(([role, content], i) => ({
    id: 'k' + i, seq: (i + 1) * R.SEQ_STEP, role,
    content, fingerprint: R.fingerprint(role, content), revision: 1,
  }));
}
function incoming(spec) {
  return spec.map(([role, content]) => ({ role, content }));
}

test('fingerprint: stable for identical input, differs across role/content', () => {
  assert.strictEqual(R.fingerprint('user', 'hello'), R.fingerprint('user', 'hello'));
  assert.notStrictEqual(R.fingerprint('user', 'hello'), R.fingerprint('assistant', 'hello'));
  assert.notStrictEqual(R.fingerprint('user', 'hello'), R.fingerprint('user', 'hellp'));
});

test('similarity: identical=1, disjoint~0, prefix growth detected', () => {
  assert.strictEqual(R.similarity('abc', 'abc'), 1);
  assert.ok(R.similarity('abcdef', 'uvwxyz') < 0.35);
  assert.strictEqual(R.isPrefixGrowth('Hel', 'Hello'), true);
  assert.strictEqual(R.isPrefixGrowth('Hello', 'Hel'), false);
  assert.strictEqual(R.isPrefixGrowth('', 'Hello'), false);
});

test('reconcile: appended messages become additions, nothing lost', () => {
  const known = knownList([['user', 'q1'], ['assistant', 'a1']]);
  const inc = incoming([['user', 'q1'], ['assistant', 'a1'], ['user', 'q2']]);
  const plan = R.reconcile(known, inc);
  assert.strictEqual(plan.additions.length, 1);
  assert.strictEqual(plan.additions[0].message.content, 'q2');
  assert.strictEqual(plan.revisions.length, 0);
  assert.strictEqual(plan.missingFromView.length, 0);
  assert.strictEqual(plan.matchedCount, 2);
});

test('reconcile: streaming growth updates in place, never duplicates', () => {
  const known = knownList([['user', 'q1'], ['assistant', 'Hel']]);
  const inc = incoming([['user', 'q1'], ['assistant', 'Hello world, long answer']]);
  const plan = R.reconcile(known, inc);
  assert.strictEqual(plan.additions.length, 0, 'growth must not be a new message');
  assert.strictEqual(plan.revisions.length, 1);
  assert.strictEqual(plan.revisions[0].known.content, 'Hel');
  assert.strictEqual(plan.revisions[0].incoming.content, 'Hello world, long answer');
});

test('reconcile: mid-conversation edit detected when count unchanged', () => {
  const spec = [['user', 'q1'], ['user', 'fix this'], ['assistant', 'a1'], ['user', 'q2']];
  const edited = [['user', 'q1'], ['user', 'fix that please'], ['assistant', 'a1'], ['user', 'q2']];
  const plan = R.reconcile(knownList(spec), incoming(edited));
  assert.strictEqual(plan.additions.length, 0);
  assert.strictEqual(plan.revisions.length, 1);
  assert.strictEqual(plan.revisions[0].incoming.content, 'fix that please');
  assert.strictEqual(plan.missingFromView.length, 0);
});

test('reconcile: repeated identical messages stay separate turns', () => {
  const known = knownList([['user', 'test'], ['assistant', 'ok'], ['user', 'test']]);
  const inc = incoming([['user', 'test'], ['assistant', 'ok'], ['user', 'test'], ['assistant', 'ok2']]);
  const plan = R.reconcile(known, inc);
  assert.strictEqual(plan.matchedCount, 3, 'both duplicate turns must match');
  assert.strictEqual(plan.additions.length, 1);
  assert.strictEqual(plan.additions[0].message.content, 'ok2');
  assert.strictEqual(plan.missingFromView.length, 0);
});

test('reconcile: virtualized render keeps offscreen archive entries', () => {
  const known = knownList([['user', 'old1'], ['assistant', 'old2'], ['user', 'q1'], ['assistant', 'a1']]);
  // Only the tail is rendered on screen.
  const inc = incoming([['user', 'q1'], ['assistant', 'a1']]);
  const plan = R.reconcile(known, inc);
  assert.strictEqual(plan.additions.length, 0);
  assert.strictEqual(plan.missingFromView.length, 2);
  assert.strictEqual(plan.missingFromView[0].content, 'old1');
});

test('reconcile: scroll-up reveal of older messages becomes additions before existing', () => {
  const known = knownList([['user', 'q1'], ['assistant', 'a1']]);
  const inc = incoming([['user', 'old1'], ['assistant', 'old2'], ['user', 'q1'], ['assistant', 'a1']]);
  const plan = R.reconcile(known, inc);
  assert.strictEqual(plan.additions.length, 2);
  assert.strictEqual(plan.additions[0].message.content, 'old1');
  assert.strictEqual(plan.additions[0].slot, '-1>2', 'slot anchors between conversation start and first match');
  assert.strictEqual(plan.missingFromView.length, 0);
});

test('reconcile: regeneration replaces last assistant answer as revision', () => {
  const known = knownList([['user', 'q1'], ['assistant', 'boring answer']]);
  const inc = incoming([['user', 'q1'], ['assistant', 'a much better regenerated answer']]);
  const plan = R.reconcile(known, inc);
  assert.strictEqual(plan.revisions.length, 1, 'same-slot same-role high-dissimilarity text is still one message');
  assert.strictEqual(plan.additions.length, 0);
});

test('reconcile: total replacement of last turn AND a new user message keeps old text as a revision', () => {
  const known = knownList([['user', 'q1'], ['assistant', 'answer v1']]);
  const inc = incoming([['user', 'q1'], ['assistant', 'completely unrelated text'], ['user', 'q2']]);
  // The assistant slot after q1 was regenerated in place, then the user
  // continued. v1 is preserved in revision history; the archive mirrors
  // what the platform actually shows.
  const plan = R.reconcile(known, inc);
  assert.strictEqual(plan.revisions.length, 1);
  assert.strictEqual(plan.revisions[0].known.content, 'answer v1');
  assert.strictEqual(plan.revisions[0].incoming.content, 'completely unrelated text');
  assert.strictEqual(plan.additions.length, 1);
  assert.strictEqual(plan.additions[0].message.content, 'q2');
});

test('reconcile: empty incoming keeps everything (navigation guard)', () => {
  const known = knownList([['user', 'q1'], ['assistant', 'a1']]);
  const plan = R.reconcile(known, []);
  assert.strictEqual(plan.additions.length, 0);
  assert.strictEqual(plan.revisions.length, 0);
  assert.strictEqual(plan.missingFromView.length, 2);
});

test('reconcile: first capture of an empty archive is all additions', () => {
  const plan = R.reconcile([], incoming([['user', 'hi']]));
  assert.strictEqual(plan.additions.length, 1);
});

test('reconcile: message inserted between existing turns gets a between-slot', () => {
  const known = knownList([['user', 'q1'], ['assistant', 'a1'], ['user', 'q3']]);
  // A previously-hidden message appears between a1 and q3.
  const inc = incoming([['user', 'q1'], ['assistant', 'a1'], ['user', 'q2-revealed'], ['user', 'q3']]);
  const plan = R.reconcile(known, inc);
  assert.strictEqual(plan.additions.length, 1);
  assert.strictEqual(plan.additions[0].slot, '1>3');
});

test('alignLCS: pure function matches sequences with reorder-tolerant monotonicity', () => {
  const known = ['a', 'b', 'c', 'd'];
  const inc = ['a', 'x', 'c', 'd', 'e'];
  const m = R.alignLCS(known, inc);
  assert.strictEqual(m.size, 3); // a, c, d
  assert.strictEqual(m.get(0), 0);
  assert.strictEqual(m.get(2), 2);
  assert.strictEqual(m.get(3), 3);
});

test('seq helpers: append, between, renumber', () => {
  assert.strictEqual(R.nextSeq(0), R.SEQ_STEP);
  const mid = R.seqBetween(R.SEQ_STEP, 2 * R.SEQ_STEP);
  assert.ok(mid > R.SEQ_STEP && mid < 2 * R.SEQ_STEP);
  assert.strictEqual(R.seqBetween(1, 1 + 1e-9), null, 'precision exhaustion signals renumber');
  const plan = R.renumberPlan([{ seq: 1.5 }, { seq: 1.5000001 }, { seq: 9000 }]);
  assert.deepStrictEqual(plan.map((m) => m.seq), [0, R.SEQ_STEP, 2 * R.SEQ_STEP]);
});
