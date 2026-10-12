/**
 * Relay v2 — Conversation Archive (IndexedDB, extension origin).
 *
 * The canonical, lossless record of everything Relay has captured.
 * chrome.storage.local keeps only settings and small transient state.
 *
 * Guarantees implemented here:
 *  - Every captured message survives persistence, in order, with role,
 *    content, timestamps and provenance.
 *  - Capture batches are atomic: a failed write (quota, corruption)
 *    aborts the whole transaction and the previous archive stays intact.
 *    A failed save is reported as failed — never as a smaller "success".
 *  - Messages that leave the viewport (virtualized lists) are never
 *    deleted from the archive.
 *  - Edits/regenerations become revisions; previous content is retained
 *    (streaming deltas coalesce so one streamed answer stays one record).
 *  - Repeated identical messages stay separate turns (reconcile never
 *    dedupes by content).
 *  - Same-platform conversations without URL ids get disambiguated by
 *    reconciliation scoring instead of being blindly merged.
 *  - Deletion is scoped exactly to what the user asked for.
 *
 * All methods return structured-cloneable results so the background
 * service worker can forward them over runtime messaging.
 */

var RelayArchive = (function () {
  'use strict';

  var SCHEMA_VERSION = 2;
  var STREAM_COALESCE_MS = 45 * 1000; // collapse rapid streaming deltas
  var MAX_REVISIONS_PER_MESSAGE = 50;
  var MAX_CANDIDATES = 8; // alt-conversation probing cap

  var S = { CONV: 'conversations', MSG: 'messages', ATT: 'attachments', XFER: 'transfers' };

  function now() { return Date.now(); }

  function rid(prefix) {
    return prefix + '_' + now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function isQuotaError(err) {
    if (!err) return false;
    var name = String((err && err.name) || '');
    var msg = String((err && err.message) || err);
    return name === 'QuotaExceededError' || /quota/i.test(msg);
  }

  function R() {
    if (typeof RelayReconcile === 'undefined') throw new Error('RelayReconcile unavailable');
    return RelayReconcile;
  }

  // --- Conversation identity ------------------------------------------------

  /**
   * Stable conversation key from platform id + page URL. Path-based chat
   * ids (/c/<uuid>, /chat/<uuid>, /a/chat/s/<uuid>, …) work generically.
   * Platforms whose UI keeps a single URL fall back to one '~default'
   * conversation per platform; captureBatch's candidate scoring keeps two
   * genuinely different chats on such platforms from merging.
   */
  function conversationKeyFromUrl(platformId, url) {
    var path = '~default';
    try {
      var parsed = new URL(url);
      var p = parsed.pathname.replace(/\/+$/, '');
      if (p && p !== '/' && !/^\/(new|app|chat)$/i.test(p)) path = p;
    } catch (_e) { /* keep default */ }
    return platformId + '|' + path;
  }

  function altKey(baseKey, n) { return baseKey + '~alt' + n; }

  function chooseTitle(existingTitle, pageTitle, messages) {
    if (pageTitle && String(pageTitle).trim()) return String(pageTitle).trim().slice(0, 140);
    if (existingTitle && String(existingTitle).trim()) return existingTitle;
    for (var i = 0; i < (messages || []).length; i++) {
      if (messages[i] && messages[i].role === 'user' && messages[i].content) {
        return String(messages[i].content).replace(/\s+/g, ' ').slice(0, 80);
      }
    }
    return 'Untitled conversation';
  }

  function isValidRole(role) { return role === 'assistant' ? 'assistant' : 'user'; }

  // --- Reads used by candidate scoring ---------------------------------------

  function getMessagesInTx(msgStore, conversationId) {
    var range = IDBKeyRange.bound([conversationId, -Infinity], [conversationId, Infinity]);
    return RelayIDB.req(msgStore.index('byConversationSeq').getAll(range)).then(function (msgs) {
      msgs.sort(function (a, b) { return a.seq - b.seq; });
      return msgs;
    });
  }

  function getMessages(conversationId) {
    return RelayIDB.runTx([S.MSG], 'readonly', function (tx) {
      return getMessagesInTx(tx.objectStore(S.MSG), conversationId);
    });
  }

  function listConversations() {
    return RelayIDB.getAll(S.CONV).then(function (convs) {
      convs.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      return convs;
    });
  }

  function getConversation(id) {
    return RelayIDB.get(S.CONV, id).then(function (conv) {
      return conv === undefined ? null : conv;
    });
  }

  /**
   * Candidate conversations for a capture: the exact key plus '~altN'
   * siblings (same platform, default-URL chats), newest first.
   */
  function candidateKeys(baseKey) {
    var prefix = baseKey + '~alt';
    return listConversations().then(function (convs) {
      var keys = convs.filter(function (c) { return c.id.indexOf(prefix) === 0; })
        .map(function (c) { return c.id; });
      return [baseKey].concat(keys.slice(0, MAX_CANDIDATES));
    });
  }

  // --- Core: atomic capture batch ---------------------------------------------

  /**
   * Reconcile `messages` (freshly scraped, DOM order) into the right
   * conversation, inside a single IndexedDB transaction.
   *
   * meta: {platformId, platformName, key, url, title, fullScan?, reachedTop?}
   * messages: [{role, content, timestamp?, sourceMessageId?, attachments?}]
   *
   * Returns {conversationId, conversation, stats, created, storage} or
   * throws (quota/IO) with the archive untouched.
   */
  function captureBatch(meta, messages) {
    messages = Array.isArray(messages) ? messages : [];
    var Rec = R();

    return candidateKeys(meta.key).then(function (candidates) {
      // --- Phase 1 (readonly): score candidates so two different chats on
      // a single-URL platform never interleave into one archive record.
      var scored = [];
      var chain = Promise.resolve();
      candidates.forEach(function (key) {
        chain = chain.then(function () {
          return RelayIDB.runTx([S.CONV, S.MSG], 'readonly', function (tx) {
            var convStore = tx.objectStore(S.CONV);
            var msgStore = tx.objectStore(S.MSG);
            return RelayIDB.req(convStore.get(key)).then(function (conv) {
              return getMessagesInTx(msgStore, key).then(function (known) {
                var plan = Rec.reconcile(known, messages);
                scored.push({
                  key: key,
                  conv: conv,
                  known: known,
                  score: plan.matchedCount + plan.revisions.length,
                  additions: plan.additions.length,
                });
              });
            });
          });
        });
      });
      return chain.then(function () {
        scored.sort(function (a, b) {
          var byScore = b.score - a.score;
          if (byScore !== 0) return byScore;
          return ((b.conv && b.conv.updatedAt) || 0) - ((a.conv && a.conv.updatedAt) || 0);
        });

        var target = null;
        var created = false;
        var best = scored[0];
        if (best && best.score > 0) {
          target = best.key; // same conversation — matches or evidenced revisions
        } else if (best && best.known.length === 0) {
          target = best.key; // nothing archived there yet
        } else {
          // No shared messages with any candidate: on platforms whose URL
          // never changes this is a genuinely different chat — never merge.
          var n = 1;
          var taken = new Set(scored.map(function (s) { return s.key; }));
          while (taken.has(altKey(meta.key, n)) && n <= 99) n++;
          target = altKey(meta.key, n);
        }
        if (!scored.some(function (s) { return s.key === target && s.conv; })) created = true;

        // --- Phase 2 (readwrite): re-read inside the write transaction and
        // apply the plan. Atomic: any failure aborts everything.
        var convId = target;
        var stamp = now();
        return RelayIDB.runTx([S.CONV, S.MSG, S.ATT], 'readwrite', function (tx) {
          var convStore = tx.objectStore(S.CONV);
          var msgStore = tx.objectStore(S.MSG);
          var attStore = tx.objectStore(S.ATT);

          return RelayIDB.req(convStore.get(convId)).then(function (conv) {
            return getMessagesInTx(msgStore, convId).then(function (known) {
              var plan = Rec.reconcile(known, messages);
              var stats = {
                added: 0, revised: 0, matched: plan.matchedCount,
                missingFromView: plan.missingFromView.length,
                incomingCount: messages.length,
              };

              // Precompute attachment records per incoming message so both
              // the ATT store and the message record reference the same ids.
              var attRecordsByIncoming = messages.map(function (m) {
                if (!m || !Array.isArray(m.attachments) || !m.attachments.length) return [];
                return m.attachments.map(function (a) {
                  var rec = {
                    id: rid('att'),
                    conversationId: convId,
                    messageId: null,
                    filename: String((a && a.filename) || 'attachment').slice(0, 300),
                    mime: (a && a.mime) || null,
                    size: Number(a && a.size) || null,
                    url: (a && a.url) || null,
                    caption: (a && a.caption) || null,
                    alt: (a && a.alt) || null,
                    status: validAttachmentStatus(a && a.status),
                    data: a && a.data ? a.data : null,
                    capturedAt: stamp,
                    updatedAt: stamp,
                  };
                  attStore.put(rec);
                  return rec;
                });
              });

              // --- seq assignment: group additions by slot, in DOM order ---
              var lastSeq = known.length ? known[known.length - 1].seq : 0;
              var groups = [];
              var groupBySlot = new Map();
              for (var ai = 0; ai < plan.additions.length; ai++) {
                var add = plan.additions[ai];
                if (!groupBySlot.has(add.slot)) {
                  groupBySlot.set(add.slot, { slot: add.slot, items: [] });
                  groups.push(groupBySlot.get(add.slot));
                }
                groupBySlot.get(add.slot).items.push(add);
              }

              var needsRenumber = false;
              var newRecords = [];

              function anchorSeq(slotStr, side) {
                // slot format "leftIdx>rightIdx" in incoming index space.
                var parts = String(slotStr).split('>');
                var idx = parseInt(side === 'left' ? parts[0] : parts[1], 10);
                if (side === 'left' && idx < 0) return null;
                if (side === 'right' && idx >= plan.incomingCount) return null;
                for (var p = 0; p < plan.pairs.length; p++) {
                  if (plan.pairs[p].incomingIndex === idx) return known[plan.pairs[p].knownIndex].seq;
                }
                return null;
              }

              for (var g = 0; g < groups.length; g++) {
                var group = groups[g];
                var leftSeq = anchorSeq(group.slot, 'left');
                var rightSeq = anchorSeq(group.slot, 'right');
                var count = group.items.length;
                for (var gi = 0; gi < count; gi++) {
                  var addMsg = group.items[gi].message;
                  var incomingIdx = group.items[gi].index;
                  var seq;
                  if (known.length === 0 && newRecords.length === 0) {
                    seq = Rec.SEQ_STEP;
                  } else if (leftSeq === null && rightSeq !== null) {
                    // Prepend region: reserve space below the right anchor.
                    seq = rightSeq - Rec.SEQ_STEP * (count - gi);
                  } else if (rightSeq === null) {
                    // Append region.
                    var lo = Math.max(leftSeq !== null ? leftSeq : 0, newRecords.length ? newRecords[newRecords.length - 1].seq : (leftSeq !== null ? leftSeq : lastSeq));
                    seq = lo + Rec.SEQ_STEP * (gi + 1);
                  } else {
                    // Middle region: distribute fractions between anchors.
                    var loM = leftSeq;
                    var hiM = rightSeq;
                    if (newRecords.length) {
                      var prev = newRecords[newRecords.length - 1].seq;
                      if (prev > loM && prev < hiM) loM = prev;
                    }
                    var gap = (hiM - loM) / (count + 1);
                    seq = loM + gap * (gi + 1);
                    if (seq <= loM || seq >= hiM) { seq = null; }
                  }
                  if (seq === null) {
                    needsRenumber = true;
                    seq = (leftSeq !== null ? leftSeq : 0) + 0.5 + gi; // provisional; renumbered below
                  }
                  var record = {
                    id: rid('m'),
                    conversationId: convId,
                    seq: seq,
                    role: isValidRole(addMsg.role),
                    content: String(addMsg.content || ''),
                    fingerprint: Rec.fingerprint(addMsg.role, addMsg.content),
                    sourceMessageId: addMsg.sourceMessageId || null,
                    revision: 1,
                    previousRevisions: [],
                    capturedAt: addMsg.timestamp || stamp,
                    updatedAt: stamp,
                    platformId: meta.platformId,
                    attachments: attRecordsByIncoming[incomingIdx].map(function (a) { return a.id; }),
                  };
                  newRecords.push(record);
                  msgStore.put(record);
                  stats.added++;
                }
              }

              // --- revisions (edits / regenerations / streaming growth) ---
              var revisedById = new Map();
              for (var ri = 0; ri < plan.revisions.length; ri++) {
                var rev = plan.revisions[ri];
                var updated = Object.assign({}, rev.known);
                updated.content = String(rev.incoming.content || '');
                updated.fingerprint = Rec.fingerprint(updated.role, updated.content);
                updated.revision = (rev.known.revision || 1) + 1;
                updated.sourceMessageId = rev.incoming.sourceMessageId || updated.sourceMessageId;
                updated.updatedAt = stamp;
                // Merge any newly-detected attachment ids.
                var revAttIds = (attRecordsByIncoming[rev.incomingIndex] || []).map(function (a) { return a.id; });
                var merged = (updated.attachments || []).slice();
                for (var ma = 0; ma < revAttIds.length; ma++) if (merged.indexOf(revAttIds[ma]) < 0) merged.push(revAttIds[ma]);
                updated.attachments = merged;
                // Coalesce rapid streaming deltas; keep genuine edit lineage.
                var prevs = updated.previousRevisions || [];
                var lastRev = prevs.length ? prevs[prevs.length - 1] : null;
                if (lastRev && (stamp - lastRev.at) < STREAM_COALESCE_MS) {
                  lastRev.content = rev.known.content;
                  lastRev.at = stamp;
                } else {
                  prevs = prevs.concat([{ content: rev.known.content, at: stamp }]);
                  if (prevs.length > MAX_REVISIONS_PER_MESSAGE) prevs = prevs.slice(-MAX_REVISIONS_PER_MESSAGE);
                }
                updated.previousRevisions = prevs;
                revisedById.set(updated.id, updated);
                msgStore.put(updated);
                stats.revised++;
              }

              // Link attachment records that arrived on matched (unchanged)
              // messages — content did not change, only their attachment set.
              plan.pairs.forEach(function (pair) {
                var attIds = (attRecordsByIncoming[pair.incomingIndex] || []).map(function (a) { return a.id; });
                if (!attIds.length) return;
                var knownMsg = known[pair.knownIndex];
                var merged2 = (knownMsg.attachments || []).slice();
                for (var i2 = 0; i2 < attIds.length; i2++) if (merged2.indexOf(attIds[i2]) < 0) merged2.push(attIds[i2]);
                if (merged2.length !== (knownMsg.attachments || []).length) {
                  var touched = Object.assign({}, knownMsg, { attachments: merged2, updatedAt: stamp });
                  if (!revisedById.has(touched.id)) msgStore.put(touched);
                }
              });

              // --- precision fallback: renumber the whole conversation ---
              if (needsRenumber) {
                var combined = known.map(function (m) { return revisedById.get(m.id) || m; }).concat(newRecords);
                var renumbered = Rec.renumberPlan(combined);
                for (var ni = 0; ni < renumbered.length; ni++) msgStore.put(renumbered[ni]);
              }

              // --- conversation record ---
              var totalCount = known.length - plan.revisions.length + stats.added;
              var status = 'live';
              if (meta.fullScan) status = meta.reachedTop ? 'complete' : 'partial';
              else if (plan.missingFromView.length > 0) status = 'partial';

              var convRecord = conv || {
                id: convId,
                platformId: meta.platformId,
                platformName: meta.platformName || meta.platformId,
                url: meta.url || '',
                nativeId: null,
                createdAt: stamp,
                schemaVersion: SCHEMA_VERSION,
                lineage: [],
                legacy: false,
              };
              // Provenance: a conversation created on a destination platform
              // right after a transfer links back to its source archive.
              if (!conv && meta.lineageSource && Array.isArray(convRecord.lineage) &&
                  convRecord.lineage.indexOf(meta.lineageSource) < 0) {
                convRecord.lineage = [meta.lineageSource];
              }
              convRecord.title = chooseTitle(convRecord.title, meta.title, messages);
              convRecord.url = meta.url || convRecord.url || '';
              convRecord.updatedAt = stamp;
              convRecord.lastCaptureAt = stamp;
              convRecord.messageCount = totalCount;
              convRecord.viewCount = messages.length;
              convRecord.completeness = {
                status: status,
                knownCount: totalCount,
                capturedInView: messages.length,
                missingFromView: plan.missingFromView.length,
                lastFullScanAt: meta.fullScan ? stamp : ((conv && conv.completeness && conv.completeness.lastFullScanAt) || null),
              };
              convRecord.lastSaveOk = true;
              convRecord.lastSaveError = null;
              convStore.put(convRecord);

              return { conversationId: convId, stats: stats, conversation: convRecord, created: created };
            });
          });
        }).then(function (result) {
          return storageSnapshot().then(function (storage) {
            result.storage = storage;
            return result;
          });
        });
      });
    });
  }

  function validAttachmentStatus(status) {
    var allowed = ['reference', 'captured', 'unsupported', 'missing', 'transfer-failed'];
    return allowed.indexOf(status) >= 0 ? status : 'reference';
  }

  // --- Storage pressure (honest reporting) -----------------------------------

  function storageSnapshot() {
    var p = (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate)
      ? navigator.storage.estimate().catch(function () { return null; })
      : Promise.resolve(null);
    return p.then(function (est) {
      var snap = { usage: null, quota: null, ratio: null, level: 'unknown' };
      if (est && typeof est.usage === 'number' && typeof est.quota === 'number' && est.quota > 0) {
        snap.usage = est.usage;
        snap.quota = est.quota;
        snap.ratio = est.usage / est.quota;
        snap.level = snap.ratio > 0.95 ? 'critical' : (snap.ratio > 0.8 ? 'warn' : 'ok');
      }
      return snap;
    });
  }

  // --- Search ------------------------------------------------------------------

  function searchConversations(query) {
    var q = String(query || '').toLowerCase().trim();
    return listConversations().then(function (convs) {
      if (!q) return convs;
      var titleMatches = convs.filter(function (c) {
        return (c.title || '').toLowerCase().indexOf(q) !== -1 ||
          (c.platformName || '').toLowerCase().indexOf(q) !== -1;
      });
      // Content search: full scan of the message store (IndexedDB cannot do
      // substring queries); still fast at extension-archive scale.
      return RelayIDB.getAll(S.MSG).then(function (allMsgs) {
        var byConv = new Map();
        for (var i = 0; i < allMsgs.length; i++) {
          var m = allMsgs[i];
          if ((m.content || '').toLowerCase().indexOf(q) !== -1) {
            if (!byConv.has(m.conversationId)) byConv.set(m.conversationId, m);
          }
        }
        var results = titleMatches.slice();
        byConv.forEach(function (hit, convId) {
          if (!results.some(function (c) { return c.id === convId; })) {
            var conv = convs.find(function (c) { return c.id === convId; });
            if (conv) results.push(Object.assign({}, conv, {
              matchExcerpt: String(hit.content).slice(0, 140),
            }));
          }
        });
        return results;
      });
    });
  }

  // --- Deletion (scoped, explicit) ---------------------------------------------

  function deleteConversation(id) {
    return RelayIDB.runTx([S.CONV, S.MSG, S.ATT, S.XFER], 'readwrite', function (tx) {
      // byConversation is a plain string-keyed index.
      var msgIdx = tx.objectStore(S.MSG).index('byConversation');
      var attIdx = tx.objectStore(S.ATT).index('byConversation');
      return RelayIDB.req(msgIdx.getAllKeys(IDBKeyRange.only(id))).then(function (keys) {
        for (var i = 0; i < keys.length; i++) tx.objectStore(S.MSG).delete(keys[i]);
        return RelayIDB.req(attIdx.getAllKeys(IDBKeyRange.only(id)));
      }).then(function (attKeys) {
        for (var j = 0; j < attKeys.length; j++) tx.objectStore(S.ATT).delete(attKeys[j]);
        tx.objectStore(S.CONV).delete(id);
      });
    }).then(function () { return { deleted: id }; });
  }

  function deleteAll() {
    return RelayIDB.runTx([S.CONV, S.MSG, S.ATT, S.XFER], 'readwrite', function (tx) {
      tx.objectStore(S.CONV).clear();
      tx.objectStore(S.MSG).clear();
      tx.objectStore(S.ATT).clear();
      tx.objectStore(S.XFER).clear();
    }).then(function () { return { deletedAll: true }; });
  }

  // --- Export / import (lossless, validated) --------------------------------------

  function serializeConversation(conv, messages, attachments, opts) {
    opts = opts || {};
    return {
      id: conv.id,
      platformId: conv.platformId,
      platformName: conv.platformName,
      url: conv.url,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      completeness: conv.completeness || null,
      lineage: conv.lineage || [],
      legacy: !!conv.legacy,
      schemaVersion: SCHEMA_VERSION,
      messages: messages.map(function (m) {
        var out = {
          id: m.id, seq: m.seq, role: m.role, content: m.content,
          revision: m.revision || 1, capturedAt: m.capturedAt, updatedAt: m.updatedAt,
          previousRevisions: (m.previousRevisions || []).slice(),
          platformId: m.platformId || conv.platformId,
        };
        if (m.sourceMessageId) out.sourceMessageId = m.sourceMessageId;
        if (Array.isArray(m.attachments) && m.attachments.length) out.attachments = m.attachments.slice();
        return out;
      }),
      attachments: attachments.map(function (a) {
        var out = {
          id: a.id, filename: a.filename, mime: a.mime, size: a.size, url: a.url,
          caption: a.caption, alt: a.alt, status: a.status, capturedAt: a.capturedAt,
        };
        if (a.data && opts.includeAttachmentData) out.dataBase64 = arrayBufferToBase64(a.data);
        return out;
      }),
    };
  }

  function exportConversation(id, opts) {
    return Promise.all([
      RelayIDB.get(S.CONV, id),
      getMessages(id),
      RelayIDB.queryIndex(S.ATT, 'byConversation', id),
    ]).then(function (r) {
      if (!r[0]) throw new Error('Conversation not found: ' + id);
      return serializeConversation(r[0], r[1], r[2] || [], opts);
    });
  }

  function exportAll(opts) {
    return listConversations().then(function (convs) {
      var work = convs.map(function (c) { return exportConversation(c.id, opts); });
      return Promise.all(work).then(function (serialized) {
        return {
          relayArchive: true,
          version: SCHEMA_VERSION,
          exportedAt: new Date().toISOString(),
          conversations: serialized,
        };
      });
    });
  }

  function validateImport(payload) {
    if (!payload || typeof payload !== 'object') return 'Import is not a JSON object';
    if (payload.relayArchive !== true) return 'Not a Relay archive export (missing relayArchive marker)';
    if (!Array.isArray(payload.conversations)) return 'Missing conversations array';
    if (typeof payload.version === 'number' && payload.version > SCHEMA_VERSION) {
      return 'Archive version ' + payload.version + ' is newer than this extension supports';
    }
    for (var i = 0; i < payload.conversations.length; i++) {
      var c = payload.conversations[i];
      if (!c || typeof c !== 'object' || typeof c.id !== 'string') return 'Conversation entry ' + i + ' is invalid';
      if (!Array.isArray(c.messages)) return 'Conversation ' + c.id + ' has no messages array';
      for (var j = 0; j < c.messages.length; j++) {
        var m = c.messages[j];
        if (!m || typeof m !== 'object' || typeof m.content !== 'string') {
          return 'Message ' + j + ' of conversation ' + c.id + ' is invalid';
        }
      }
    }
    return null;
  }

  /**
   * Import an archive export with lossless merge semantics: existing
   * conversations keep everything; imported messages reconcile in;
   * nothing existing is ever deleted by an import.
   */
  function importArchive(payload) {
    var invalid = validateImport(payload);
    if (invalid) return Promise.reject(new Error(invalid));
    var report = { conversations: 0, messagesAdded: 0, messagesRevised: 0, messagesKept: 0, attachments: 0, skipped: [] };

    var chain = Promise.resolve();
    payload.conversations.forEach(function (imported) {
      chain = chain.then(function () {
        return RelayIDB.get(S.CONV, imported.id).then(function (existing) {
          if (!existing) {
            return RelayIDB.runTx([S.CONV, S.MSG, S.ATT], 'readwrite', function (tx) {
              var stamp = now();
              var convRec = {
                id: imported.id,
                platformId: imported.platformId || 'unknown',
                platformName: imported.platformName || imported.platformId || 'Unknown',
                url: imported.url || '',
                title: imported.title || 'Imported conversation',
                createdAt: imported.createdAt || stamp,
                updatedAt: imported.updatedAt || stamp,
                completeness: imported.completeness || { status: 'unverified' },
                lineage: imported.lineage || [],
                legacy: !!imported.legacy,
                imported: true,
                schemaVersion: SCHEMA_VERSION,
                messageCount: imported.messages.length,
                viewCount: imported.messages.length,
                lastSaveOk: true,
              };
              tx.objectStore(S.CONV).put(convRec);
              imported.messages.forEach(function (m, i) {
                tx.objectStore(S.MSG).put({
                  id: m.id || rid('m'),
                  conversationId: imported.id,
                  seq: typeof m.seq === 'number' ? m.seq : (i + 1) * R().SEQ_STEP,
                  role: isValidRole(m.role),
                  content: String(m.content || ''),
                  fingerprint: R().fingerprint(m.role, m.content),
                  revision: m.revision || 1,
                  previousRevisions: Array.isArray(m.previousRevisions) ? m.previousRevisions.slice() : [],
                  capturedAt: m.capturedAt || stamp,
                  updatedAt: m.updatedAt || stamp,
                  platformId: convRec.platformId,
                  attachments: Array.isArray(m.attachments) ? m.attachments.slice() : [],
                  imported: true,
                });
                report.messagesAdded++;
              });
              (imported.attachments || []).forEach(function (a) {
                var rec = Object.assign({}, a);
                delete rec.dataBase64;
                rec.conversationId = imported.id;
                rec.status = validAttachmentStatus(rec.status);
                if (a.dataBase64) { rec.data = base64ToArrayBuffer(a.dataBase64); rec.status = 'captured'; }
                rec.updatedAt = stamp;
                tx.objectStore(S.ATT).put(rec);
                report.attachments++;
              });
              report.conversations++;
            });
          }
          // Existing conversation: merge imported messages in.
          return getMessages(imported.id).then(function (known) {
            return RelayIDB.runTx([S.CONV, S.MSG], 'readwrite', function (tx) {
              var msgStore = tx.objectStore(S.MSG);
              var plan = R().reconcile(known, imported.messages.map(function (m) {
                return { role: m.role, content: m.content };
              }));
              var stamp = now();
              var lastSeq = known.length ? known[known.length - 1].seq : 0;
              plan.additions.forEach(function (add, i) {
                msgStore.put({
                  id: rid('m'),
                  conversationId: imported.id,
                  seq: lastSeq + (i + 1) * R().SEQ_STEP,
                  role: isValidRole(add.message.role),
                  content: String(add.message.content || ''),
                  fingerprint: R().fingerprint(add.message.role, add.message.content),
                  revision: 1,
                  previousRevisions: [],
                  capturedAt: stamp,
                  updatedAt: stamp,
                  platformId: existing.platformId,
                  attachments: [],
                  imported: true,
                });
                report.messagesAdded++;
              });
              plan.revisions.forEach(function (rev) {
                var updated = Object.assign({}, rev.known);
                updated.content = String(rev.incoming.content || '');
                updated.fingerprint = R().fingerprint(updated.role, updated.content);
                updated.revision = (updated.revision || 1) + 1;
                updated.updatedAt = stamp;
                updated.previousRevisions = (updated.previousRevisions || []).concat([{ content: rev.known.content, at: stamp }]);
                msgStore.put(updated);
                report.messagesRevised++;
              });
              report.messagesKept += plan.matchedCount;
              var convRec = Object.assign({}, existing, {
                updatedAt: Math.max(existing.updatedAt || 0, imported.updatedAt || 0),
                messageCount: known.length - plan.revisions.length + plan.additions.length,
              });
              if (imported.completeness && imported.completeness.status === 'complete' &&
                  (!convRec.completeness || convRec.completeness.status !== 'complete')) {
                convRec.completeness = imported.completeness;
              }
              tx.objectStore(S.CONV).put(convRec);
            });
          });
        });
      }).catch(function (err) {
        report.skipped.push({ id: imported.id, error: String((err && err.message) || err) });
      });
    });
    return chain.then(function () { return report; });
  }

  function arrayBufferToBase64(buf) {
    var bytes = new Uint8Array(buf);
    if (typeof btoa !== 'undefined') {
      var bin = '';
      var step = 0x8000;
      for (var i = 0; i < bytes.length; i += step) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
      }
      return btoa(bin);
    }
    return Buffer.from(bytes).toString('base64');
  }

  function base64ToArrayBuffer(b64) {
    if (typeof atob !== 'undefined') {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
    }
    return new Uint8Array(Buffer.from(b64, 'base64')).buffer;
  }

  // --- Transfers (multi-part handoff state) -------------------------------------

  function createTransfer(spec) {
    var stamp = now();
    var record = {
      id: rid('x'),
      sourceConversationId: spec.sourceConversationId,
      sourcePlatformId: spec.sourcePlatformId || null,
      targetPlatformId: spec.targetPlatformId,
      mode: spec.mode || 'full',
      manifest: spec.manifest || null,
      parts: (spec.parts || []).map(function (p, i) {
        return {
          index: i,
          total: spec.parts.length,
          text: p.text,
          messageRange: p.messageRange || null,
          bytes: (p.text || '').length,
          status: 'pending',
          insertedAt: null,
        };
      }),
      status: (spec.parts && spec.parts.length > 1) ? 'multipart' : 'ready',
      createdAt: stamp,
      updatedAt: stamp,
    };
    return RelayIDB.put(S.XFER, record).then(function () { return record; });
  }

  function getTransfer(id) { return RelayIDB.get(S.XFER, id); }

  function listTransfers() {
    return RelayIDB.getAll(S.XFER).then(function (list) {
      list.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      return list;
    });
  }

  function getActiveTransferForPlatform(platformId) {
    return listTransfers().then(function (list) {
      var cutoff = now() - 7 * 24 * 60 * 60 * 1000;
      var active = list.filter(function (t) {
        return t.targetPlatformId === platformId &&
          t.status !== 'complete' && t.status !== 'abandoned' &&
          (t.updatedAt || t.createdAt) > cutoff;
      });
      return active.length ? active[0] : null;
    });
  }

  function updateTransferPart(transferId, partIndex, patch) {
    return RelayIDB.get(S.XFER, transferId).then(function (t) {
      if (!t) throw new Error('Transfer not found');
      var part = t.parts[partIndex];
      if (!part) throw new Error('Part ' + partIndex + ' not found');
      if (patch) Object.assign(part, patch);
      t.updatedAt = now();
      var allDelivered = t.parts.every(function (p) { return p.status === 'sent' || p.status === 'inserted'; });
      var allSent = t.parts.every(function (p) { return p.status === 'sent'; });
      t.status = allSent ? 'complete' : (allDelivered ? 'delivered' : t.status);
      return RelayIDB.put(S.XFER, t).then(function () { return t; });
    });
  }

  function deleteTransfer(id) { return RelayIDB.delete(S.XFER, id); }

  function pruneOldTransfers(maxAgeMs) {
    var age = typeof maxAgeMs === 'number' ? maxAgeMs : 30 * 24 * 60 * 60 * 1000;
    var cutoff = now() - age;
    return listTransfers().then(function (list) {
      var stale = list.filter(function (t) { return (t.updatedAt || 0) <= cutoff; });
      var chain = Promise.resolve();
      stale.forEach(function (t) { chain = chain.then(function () { return RelayIDB.delete(S.XFER, t.id); }); });
      return chain.then(function () { return { pruned: stale.length }; });
    });
  }

  // --- Legacy migration (v1 chrome.storage data -> archive) -----------------------

  /**
   * Preserve the legacy single-session store and the metadata-only
   * history list. v1 capped stored history; record that honestly in the
   * conversation's completeness note instead of pretending it was whole.
   */
  function migrateLegacyData(sessionRaw, historyRaw) {
    var jobs = [];
    var stamp = now();
    if (sessionRaw && Array.isArray(sessionRaw.messages) && sessionRaw.messages.length) {
      var convId = 'legacy|' + (sessionRaw.platformId || 'unknown') + '|' + (sessionRaw.capturedAt || stamp);
      var wasTruncated = sessionRaw.truncated === true ||
        (sessionRaw.originalMessageCount && sessionRaw.originalMessageCount > sessionRaw.messages.length);
      jobs.push({
        conv: {
          id: convId,
          platformId: sessionRaw.platformId || 'unknown',
          platformName: sessionRaw.platformName || sessionRaw.platformId || 'Unknown',
          url: '',
          title: chooseTitle(null, null, sessionRaw.messages),
          createdAt: sessionRaw.capturedAt || stamp,
          updatedAt: sessionRaw.updatedAt || stamp,
          completeness: {
            status: 'unverified',
            knownCount: sessionRaw.messages.length,
            capturedInView: sessionRaw.messages.length,
            missingFromView: 0,
            note: wasTruncated ? 'Imported from Relay v1, which capped stored history' : null,
          },
          lineage: [],
          legacy: true,
          schemaVersion: SCHEMA_VERSION,
          messageCount: sessionRaw.messages.length,
          viewCount: sessionRaw.messages.length,
          lastSaveOk: true,
        },
        messages: sessionRaw.messages,
      });
    }
    (Array.isArray(historyRaw) ? historyRaw : []).forEach(function (h, i) {
      if (!h || !h.platformId) return;
      jobs.push({
        conv: {
          id: 'legacy-history|' + h.platformId + '|' + (h.capturedAt || i),
          platformId: h.platformId,
          platformName: h.platformName || h.platformId,
          url: '',
          title: 'v1 history entry (' + (h.messageCount || 0) + ' messages — content was not retained by v1)',
          createdAt: h.capturedAt || stamp,
          updatedAt: h.updatedAt || h.capturedAt || stamp,
          completeness: { status: 'unverified', knownCount: 0, note: 'v1 stored history metadata only' },
          lineage: [],
          legacy: true,
          historyPlaceholder: true,
          schemaVersion: SCHEMA_VERSION,
          messageCount: 0,
          viewCount: 0,
          lastSaveOk: true,
        },
        messages: [],
      });
    });

    var chain = Promise.resolve();
    jobs.forEach(function (job) {
      chain = chain.then(function () {
        return RelayIDB.runTx([S.CONV, S.MSG], 'readwrite', function (tx) {
          tx.objectStore(S.CONV).put(job.conv);
          job.messages.forEach(function (m, i) {
            tx.objectStore(S.MSG).put({
              id: rid('m'),
              conversationId: job.conv.id,
              seq: (i + 1) * R().SEQ_STEP,
              role: isValidRole(m.role),
              content: String(m.content || ''),
              fingerprint: R().fingerprint(m.role, m.content),
              revision: 1,
              previousRevisions: [],
              capturedAt: m.timestamp || job.conv.createdAt,
              updatedAt: m.timestamp || job.conv.updatedAt,
              platformId: job.conv.platformId,
              attachments: [],
              legacy: true,
            });
          });
        });
      });
    });
    return chain.then(function () {
      return {
        migratedConversations: jobs.length,
        migratedMessages: jobs.reduce(function (n, j) { return n + j.messages.length; }, 0),
      };
    });
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    S: S,
    conversationKeyFromUrl: conversationKeyFromUrl,
    chooseTitle: chooseTitle,
    isQuotaError: isQuotaError,
    captureBatch: captureBatch,
    storageSnapshot: storageSnapshot,
    listConversations: listConversations,
    getConversation: getConversation,
    getMessages: getMessages,
    searchConversations: searchConversations,
    deleteConversation: deleteConversation,
    deleteAll: deleteAll,
    exportConversation: exportConversation,
    exportAll: exportAll,
    serializeConversation: serializeConversation,
    validateImport: validateImport,
    importArchive: importArchive,
    createTransfer: createTransfer,
    getTransfer: getTransfer,
    listTransfers: listTransfers,
    getActiveTransferForPlatform: getActiveTransferForPlatform,
    updateTransferPart: updateTransferPart,
    deleteTransfer: deleteTransfer,
    pruneOldTransfers: pruneOldTransfers,
    migrateLegacyData: migrateLegacyData,
    _rid: rid,
  };
})();

if (typeof window !== 'undefined') window.RelayArchive = RelayArchive;
if (typeof module !== 'undefined' && module.exports) module.exports = RelayArchive;
