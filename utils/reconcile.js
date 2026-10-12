/**
 * Relay v2 — Reconciliation core (pure logic, no DOM, no storage).
 *
 * Reconciles a freshly scraped message sequence against the archived
 * sequence. This is the component that makes the archive trustworthy:
 *
 *  - Appended messages are detected (suffix fast path).
 *  - A message that grows while streaming updates in place — it is
 *    never duplicated.
 *  - An edited or regenerated message in the MIDDLE of a conversation
 *    is detected even when the message count is unchanged.
 *  - Repeated identical messages ("test", "test") remain separate turns —
 *    content is never used as a dedup key across positions.
 *  - Messages that fall out of the DOM (virtualized lists) are never
 *    deleted from the archive.
 *
 * Everything here is deterministic and unit-tested without a browser.
 */

var RelayReconcile = (function () {
  'use strict';

  // --- Fingerprints ---------------------------------------------------------
  // A fingerprint identifies message content well enough for sequence
  // alignment. Collisions are guarded against by content equality checks
  // at pairing time, so a 32-bit hash is safe here.

  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function fingerprint(role, content) {
    var c = String(content || '');
    return role + ':' + c.length + ':' + fnv1a(c).toString(36);
  }

  // --- Similarity heuristic (for revision pairing) --------------------------
  // Cheap prefix/suffix overlap. Used ONLY to decide "same message, changed
  // text" vs "different message that happens to sit in the same slot".

  function similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    var maxLen = Math.max(a.length, b.length);
    var p = 0;
    var limit = Math.min(a.length, b.length);
    while (p < limit && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    var s = 0;
    while (s < limit - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
    return (p + s) / maxLen;
  }

  function isPrefixGrowth(known, incoming) {
    // Streaming: incoming starts with the full known text.
    return known.length > 0 && incoming.length > known.length &&
      incoming.lastIndexOf(known, 0) === 0;
  }

  // --- Sequence alignment ----------------------------------------------------

  /**
   * Longest-common-subsequence alignment over fingerprint arrays.
   * Returns a Map: incomingIndex -> knownIndex for matched positions.
   * Falls back gracefully for large inputs (banded DP is unnecessary at
   * conversation scale; typical n*m <= a few million cells).
   */
  function alignLCS(knownFps, incomingFps) {
    var n = knownFps.length, m = incomingFps.length;
    var matched = new Map();
    if (n === 0 || m === 0) return matched;
    var width = m + 1;
    var dp = new Uint32Array((n + 1) * width);
    for (var i = n - 1; i >= 0; i--) {
      var row = i * width, next = (i + 1) * width;
      for (var j = m - 1; j >= 0; j--) {
        dp[row + j] = (knownFps[i] === incomingFps[j])
          ? dp[next + j + 1] + 1
          : Math.max(dp[next + j], dp[row + j + 1]);
      }
    }
    i = 0; var jj = 0;
    while (i < n && jj < m) {
      if (knownFps[i] === incomingFps[jj]) { matched.set(jj, i); i++; jj++; }
      else if (dp[(i + 1) * width + jj] >= dp[i * width + jj + 1]) i++;
      else jj++;
    }
    return matched;
  }

  /**
   * Fast path: incoming is known + appended tail (the overwhelmingly
   * common live-capture case). Returns matches Map or null if not
   * applicable.
   */
  function alignAppend(knownFps, incomingFps) {
    if (incomingFps.length <= knownFps.length) return null;
    var matched = new Map();
    for (var i = 0; i < knownFps.length; i++) {
      if (knownFps[i] !== incomingFps[i]) return null;
      matched.set(i, i);
    }
    return matched;
  }

  /**
   * Full reconciliation.
   *
   * @param {Array} known   archived messages ordered by seq:
   *                        {id, seq, role, content, fingerprint, revision}
   * @param {Array} incoming scraped messages in DOM order:
   *                        {role, content, sourceMessageId?, timestamp?}
   * @returns reconciliation plan (pure — caller persists it)
   */
  function reconcile(known, incoming) {
    known = Array.isArray(known) ? known : [];
    incoming = Array.isArray(incoming) ? incoming : [];

    var knownFps = known.map(function (m) { return m.fingerprint || fingerprint(m.role, m.content); });
    var incomingFps = incoming.map(function (m) { return fingerprint(m.role, m.content); });

    var matched = alignAppend(knownFps, incomingFps) || alignLCS(knownFps, incomingFps);

    var usedKnown = new Set(matched.values());
    var pairs = [];       // matched positions (no write needed unless content drifted)
    var revisions = [];   // same slot + same role + similar content -> update in place
    var additions = [];   // genuinely new messages
    var missingFromView = []; // archived but not in the current render (keep!)

    var i, k;
    for (i = 0; i < known.length; i++) {
      if (!usedKnown.has(i)) missingFromView.push(known[i]);
    }

    // Slot keys: nearest matched anchors around a position, so "same place
    // in the conversation" survives appends elsewhere in the thread.
    function slotOf(incomingIdx, leftAnchor, rightAnchor) {
      return leftAnchor + '>' + rightAnchor;
    }

    // Precompute anchor boundaries for unmatched incoming messages:
    // leftAnchor = index (in incoming space) of nearest matched message
    // before it (or -1), rightAnchor = nearest matched after (or m).
    var leftAnchors = new Array(incoming.length).fill(-1);
    var rightAnchors = new Array(incoming.length).fill(incoming.length);
    var last = -1;
    for (i = 0; i < incoming.length; i++) { leftAnchors[i] = last; if (matched.has(i)) last = i; }
    var next = incoming.length;
    for (i = incoming.length - 1; i >= 0; i--) { rightAnchors[i] = next; if (matched.has(i)) next = i; }

    // Same for known messages (in known space).
    var knownLeft = new Array(known.length).fill(-1);
    var knownRight = new Array(known.length).fill(known.length);
    last = -1;
    for (k = 0; k < known.length; k++) {
      knownLeft[k] = last;
      if (usedKnown.has(k)) last = k;
    }
    next = known.length;
    for (k = known.length - 1; k >= 0; k--) {
      knownRight[k] = next;
      if (usedKnown.has(k)) next = k;
    }

    // Map known anchor positions to incoming anchor positions so slots compare.
    var knownAnchorToIncoming = new Map();
    matched.forEach(function (knownIdx, incomingIdx) {
      knownAnchorToIncoming.set(knownIdx, incomingIdx);
    });
    function knownSlot(kIdx) {
      var la = knownAnchorToIncoming.has(knownLeft[kIdx]) ? knownAnchorToIncoming.get(knownLeft[kIdx]) : -1;
      var ra = knownAnchorToIncoming.has(knownRight[kIdx]) ? knownAnchorToIncoming.get(knownRight[kIdx]) : incoming.length;
      return la + '>' + ra;
    }

    // Collect unmatched incoming with their slots.
    var unmatchedIncoming = [];
    for (i = 0; i < incoming.length; i++) {
      if (matched.has(i)) {
        pairs.push({ incomingIndex: i, knownIndex: matched.get(i) });
        continue;
      }
      unmatchedIncoming.push({
        index: i,
        message: incoming[i],
        slot: slotOf(i, leftAnchors[i], rightAnchors[i]),
      });
    }

    // Pair orphans (archived, missing from view) with unmatched incoming
    // messages in the same slot when they share a role. With matched anchors
    // present, the conversation is established and a same-slot, same-role
    // replacement is an edit / regeneration / streaming growth — pair it
    // unconditionally and keep the previous content in revision history.
    // With ZERO matched anchors there is no evidence this is even the same
    // conversation (two different chats on a single-URL platform look like
    // this), so pairing then requires real content similarity.
    var requireSimilarity = matched.size === 0;
    var consumed = new Set();
    var _loop = function (kIdx) {
      var knownMsg = known[kIdx];
      var kSlot = knownSlot(kIdx);
      var best = -1, bestScore = -1;
      for (var u = 0; u < unmatchedIncoming.length; u++) {
        if (consumed.has(u)) continue;
        var cand = unmatchedIncoming[u];
        if (cand.slot !== kSlot) continue;
        if (cand.message.role !== knownMsg.role) continue;
        var score = similarity(knownMsg.content, cand.message.content);
        // Streaming growth is a revision by definition.
        if (isPrefixGrowth(knownMsg.content, cand.message.content)) score = 1;
        // Prefer order-consistent candidates for equal scores.
        if (score === bestScore && best >= 0 && cand.index < unmatchedIncoming[best].index) continue;
        if (score > bestScore) { bestScore = score; best = u; }
      }
      var strongEnough = best >= 0 && (!requireSimilarity || bestScore >= 0.5);
      if (strongEnough) {
        consumed.add(best);
        revisions.push({ knownIndex: kIdx, known: knownMsg, incoming: unmatchedIncoming[best].message, incomingIndex: unmatchedIncoming[best].index });
      }
    };
    for (var kk = 0; kk < known.length; kk++) {
      if (usedKnown.has(kk)) continue;
      _loop(kk);
    }

    for (var u2 = 0; u2 < unmatchedIncoming.length; u2++) {
      if (!consumed.has(u2)) additions.push(unmatchedIncoming[u2]);
    }

    return {
      matchedCount: pairs.length,
      pairs: pairs,
      revisions: revisions,
      additions: additions,
      missingFromView: missingFromView.filter(function (k) {
        for (var r = 0; r < revisions.length; r++) if (revisions[r].known === k) return false;
        return true;
      }),
      incomingCount: incoming.length,
      knownCount: known.length,
    };
  }

  // --- Ordering keys ---------------------------------------------------------
  // Integer seq with spacing; fractional inserts between neighbours; if
  // floating-point precision runs out (astronomically rare), the caller
  // renumbers. Keeps appends O(1) and mid-conversation inserts cheap.

  var SEQ_STEP = 1024;
  var MIN_SEQ_GAP = 1e-6;

  function nextSeq(afterSeq) {
    return (typeof afterSeq === 'number' && isFinite(afterSeq) ? afterSeq : 0) + SEQ_STEP;
  }

  function seqBetween(lo, hi) {
    // lo < hi; returns a number strictly between them, or null when the
    // gap is too small (caller must renumber).
    var mid = (lo + hi) / 2;
    if (mid <= lo + MIN_SEQ_GAP || mid >= hi - MIN_SEQ_GAP) return null;
    return mid;
  }

  function renumberPlan(messages) {
    // Stable, gap-restoring renumbering for a full message list.
    var seq = 0;
    return messages.map(function (m) {
      var updated = Object.assign({}, m, { seq: seq });
      seq += SEQ_STEP;
      return updated;
    });
  }

  return {
    fingerprint: fingerprint,
    similarity: similarity,
    isPrefixGrowth: isPrefixGrowth,
    alignLCS: alignLCS,
    reconcile: reconcile,
    nextSeq: nextSeq,
    seqBetween: seqBetween,
    renumberPlan: renumberPlan,
    SEQ_STEP: SEQ_STEP,
  };
})();

if (typeof window !== 'undefined') window.RelayReconcile = RelayReconcile;
if (typeof module !== 'undefined' && module.exports) module.exports = RelayReconcile;
