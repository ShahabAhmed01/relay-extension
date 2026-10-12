/**
 * Relay v2 — MV3 background service worker.
 *
 * Owns the IndexedDB archive: content scripts and extension pages talk to
 * it through validated runtime messages. Also handles legacy-data
 * migration, tab badges, platform navigation, and the transfer lifecycle.
 * No network access, no analytics — audited by scripts/lint.js.
 */

importScripts(
  'utils/compress.js',
  'utils/storage.js',
  'utils/idb.js',
  'utils/reconcile.js',
  'utils/archive.js',
  'utils/handoff.js',
  'content/platforms/index.js'
);

(function () {
  'use strict';

  var AI_HOSTS = RelayPlatforms.PLATFORMS.reduce(function (arr, p) {
    p.matches.forEach(function (m) { if (arr.indexOf(m) < 0) arr.push(m); });
    return arr;
  }, []);

  var LINEAGE_WINDOW_MS = 30 * 60 * 1000; // transfer -> new chat on destination

  function norm(h) { return String(h || '').toLowerCase().replace(/^www\./, ''); }

  function isAIHost(hostname) {
    if (!hostname) return false;
    var host = norm(hostname);
    return AI_HOSTS.some(function (c) {
      var n = norm(c);
      return host === n || host.endsWith('.' + n);
    });
  }

  function isSupportedUrl(url) {
    try {
      var parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;
      if (parsed.hostname === 'x.com') return parsed.pathname.indexOf('/i/grok') === 0;
      return isAIHost(parsed.hostname);
    } catch (_e) { return false; }
  }

  // --- Sender validation -------------------------------------------------------

  function trustedSender(sender) {
    // Every Relay context (content script, popup, options, archive page)
    // carries this extension's id. Anything else is rejected.
    if (!sender || !sender.id || sender.id !== chrome.runtime.id) return false;
    return true;
  }

  function str(v, max) {
    return (typeof v === 'string' && v.length <= (max || 2000)) ? v : null;
  }

  function validMessages(list) {
    if (!Array.isArray(list) || list.length > 5000) return null;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || typeof m !== 'object') return null;
      if (m.role !== 'user' && m.role !== 'assistant') return null;
      if (typeof m.content !== 'string' || !m.content.length || m.content.length > 500000) return null;
      if (m.attachments !== undefined && !Array.isArray(m.attachments)) return null;
    }
    return list;
  }

  // --- Badges -------------------------------------------------------------------

  async function setBadge(tabId, text) {
    if (!chrome.action || tabId == null) return;
    try {
      await chrome.action.setBadgeText({ text: String(text || ''), tabId: tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#6d5efc', tabId: tabId });
    } catch (_e) {}
  }

  async function updateBadge(tabId, tabUrl) {
    try {
      if (tabUrl == null || !isSupportedUrl(tabUrl)) { await setBadge(tabId, ''); return; }
      var platform = RelayPlatforms.detectPlatform(new URL(tabUrl).hostname, new URL(tabUrl).pathname);
      if (!platform) { await setBadge(tabId, ''); return; }
      var key = RelayArchive.conversationKeyFromUrl(platform.id, tabUrl);
      var conv = await RelayArchive.getConversation(key);
      if (!conv) {
        // No-URL platforms may live under ~altN keys — show the newest for the platform.
        var list = await RelayArchive.listConversations();
        conv = list.find(function (c) { return c.platformId === platform.id && c.id.indexOf(platform.id + '|~default') === 0; }) || null;
      }
      var n = conv ? (conv.messageCount || 0) : 0;
      await setBadge(tabId, n > 0 ? String(Math.min(n, 99)) : '');
    } catch (_e) {
      try { await setBadge(tabId, ''); } catch (_e2) {}
    }
  }

  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if ((changeInfo.status === 'complete' || changeInfo.url) && (tab.url || changeInfo.url)) {
      updateBadge(tabId, tab.url || changeInfo.url);
    }
  });

  chrome.tabs.onActivated.addListener(function (activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function (tab) {
      if (chrome.runtime.lastError) return;
      updateBadge(activeInfo.tabId, tab && tab.url);
    });
  });

  if (chrome.commands && chrome.commands.onCommand) {
    chrome.commands.onCommand.addListener(function (cmd) {
      if (cmd !== 'toggle-panel') return;
      chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
        var tab = tabs && tabs[0];
        if (!tab || tab.id == null || !isSupportedUrl(tab.url || '')) return;
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' }).catch(function () {});
      }).catch(function () {});
    });
  }

  // --- Capture pipeline -----------------------------------------------------------

  /**
   * Serialize capture batches per conversation so concurrent mutation
   * showers never interleave reconciliation.
   */
  var captureQueues = new Map();
  function enqueueCapture(key, job) {
    var prev = captureQueues.get(key) || Promise.resolve();
    var next = prev.then(job, job);
    captureQueues.set(key, next.finally ? next.finally(function () {
      if (captureQueues.get(key) === next) captureQueues.delete(key);
    }) : next.then(function () {
      if (captureQueues.get(key) === next) captureQueues.delete(key);
    }));
    return captureQueues.get(key);
  }

  async function handleCaptureBatch(message, sender) {
    var platformId = str(message.platformId, 64);
    var url = str(message.url, 2000);
    var messages = validMessages(message.messages);
    if (!platformId || !url || !messages) {
      return { ok: false, error: 'invalid-capture-payload' };
    }
    var platform = RelayPlatforms.getPlatformById(platformId);
    if (!platform) return { ok: false, error: 'unknown-platform' };

    var settings = await RelayStorage.getSettings();
    if (!settings.autoCapture) return { ok: false, skipped: 'paused-global' };
    if (settings.pausePlatforms.indexOf(platformId) !== -1) return { ok: false, skipped: 'paused-platform' };

    var key = RelayArchive.conversationKeyFromUrl(platformId, url);

    // Provenance: if a transfer to this platform was prepared recently, a
    // brand-new conversation here continues that lineage.
    var lineageSource = null;
    try {
      var transfer = await RelayArchive.getActiveTransferForPlatform(platformId);
      if (transfer && transfer.sourceConversationId &&
          Date.now() - (transfer.updatedAt || 0) < LINEAGE_WINDOW_MS) {
        lineageSource = transfer.sourceConversationId;
      }
    } catch (_e) { /* provenance is best-effort */ }

    var result = await enqueueCapture(key, function () {
      return RelayArchive.captureBatch({
        platformId: platformId,
        platformName: platform.name,
        key: key,
        url: url,
        title: str(message.title, 300) || '',
        fullScan: message.fullScan === true,
        reachedTop: message.reachedTop !== false,
        lineageSource: lineageSource,
      }, messages).then(function (r) {
        return { ok: true, result: r };
      }).catch(function (err) {
        var quota = RelayArchive.isQuotaError(err);
        return {
          ok: false,
          error: quota ? 'quota' : 'capture-failed',
          detail: String((err && err.message) || err).slice(0, 200),
        };
      });
    });
    // Keep the tab badge in sync with the archived conversation size.
    if (sender && sender.tab && sender.tab.id != null) {
      updateBadge(sender.tab.id, sender.tab.url || url);
    }
    return result;
  }

  async function captureStateFor(url, platformId) {
    var platform = null;
    try {
      platform = (platformId && RelayPlatforms.getPlatformById(platformId)) ||
        RelayPlatforms.detectPlatform(new URL(url).hostname, new URL(url).pathname);
    } catch (_e) { platform = null; }
    if (!platform) return { supported: false, conversation: null, paused: { paused: false }, storage: null };
    var key = RelayArchive.conversationKeyFromUrl(platform.id, url);
    var conv = await RelayArchive.getConversation(key);
    if (!conv) {
      var list = await RelayArchive.listConversations();
      var candidates = list.filter(function (c) {
        return c.platformId === platform.id && c.id.indexOf(platform.id + '|') === 0;
      });
      conv = candidates[0] || null;
    }
    var paused = await RelayStorage.isCapturePaused(platform.id);
    var storage = await RelayArchive.storageSnapshot();
    return { supported: true, conversation: conv, paused: paused, storage: storage };
  }

  // --- Handoff / transfers ---------------------------------------------------------

  async function loadConversationWithAttachments(conversationId) {
    var conv = await RelayArchive.getConversation(conversationId);
    if (!conv) throw new Error('Conversation not found: ' + conversationId);
    var messages = await RelayArchive.getMessages(conversationId);
    var attachments = await RelayIDB.queryIndex(RelayArchive.S.ATT, 'byConversation', conversationId);
    var byId = new Map(attachments.map(function (a) { return [a.id, a]; }));
    messages.forEach(function (m) {
      m.attachmentDetails = (m.attachments || []).map(function (id) { return byId.get(id); }).filter(Boolean);
    });
    return { conv: conv, messages: messages };
  }

  async function handlePrepareHandoff(message) {
    var conversationId = str(message.conversationId, 300);
    var targetPlatformId = str(message.targetPlatformId, 64);
    if (!conversationId || !targetPlatformId) return { ok: false, error: 'invalid-handoff-request' };
    var target = RelayPlatforms.getPlatformById(targetPlatformId);
    if (!target) return { ok: false, error: 'unknown-platform' };

    var loaded = await loadConversationWithAttachments(conversationId);
    if (!loaded.messages.length) return { ok: false, error: 'empty-conversation' };

    var settings = await RelayStorage.getSettings();
    var mode = ['full', 'multipart', 'continuation'].indexOf(message.mode) >= 0 ? message.mode : settings.handoffMode;

    // Lineage chain: include earlier conversations this one continues.
    var lineageMessages = [];
    if (Array.isArray(loaded.conv.lineage)) {
      for (var i = 0; i < loaded.conv.lineage.length; i++) {
        try {
          var src = await loadConversationWithAttachments(loaded.conv.lineage[i]);
          src.messages.forEach(function (m) {
            lineageMessages.push(Object.assign({}, m, {
              originPlatform: (src.conv && src.conv.platformName) || src.conv.platformId,
              originTitle: src.conv && src.conv.title,
            }));
          });
        } catch (_e) { /* missing lineage conversation: skip */ }
      }
    }

    var pkg;
    try {
      pkg = RelayHandoff.buildPackage({
        conversation: loaded.conv,
        messages: loaded.messages,
        lineageMessages: lineageMessages,
        mode: mode,
        partBudget: typeof message.partBudget === 'number' ? message.partBudget : settings.partBudget,
        continuationCount: typeof message.continuationCount === 'number' ? message.continuationCount : settings.continuationCount,
        includeBrief: message.includeBrief === true,
      });
    } catch (err) {
      return { ok: false, error: 'handoff-build-failed', detail: String((err && err.message) || err).slice(0, 200) };
    }

    var transfer = await RelayArchive.createTransfer({
      sourceConversationId: conversationId,
      sourcePlatformId: loaded.conv.platformId,
      targetPlatformId: targetPlatformId,
      mode: pkg.mode,
      manifest: pkg.manifest,
      parts: pkg.parts,
    });

    return {
      ok: true,
      transfer: {
        id: transfer.id,
        mode: transfer.mode,
        status: transfer.status,
        parts: transfer.parts.map(function (p) {
          return { index: p.index, total: p.total, bytes: p.bytes, messageCount: p.messageCount, status: p.status };
        }),
      },
      manifest: pkg.manifest,
      fits: pkg.fits,
      brief: pkg.brief,
    };
  }

  async function handleConfirmSwitch(message) {
    var transferId = str(message.transferId, 100);
    if (!transferId) return { ok: false, error: 'invalid-request' };
    var transfer = await RelayArchive.getTransfer(transferId);
    if (!transfer) return { ok: false, error: 'transfer-not-found' };
    var platform = RelayPlatforms.getPlatformById(transfer.targetPlatformId);
    if (!platform) return { ok: false, error: 'unknown-platform' };
    await RelayStorage.setActiveTransferPointer(transferId);
    var url = platform.newChatUrl || platform.url;
    return new Promise(function (resolve) {
      chrome.tabs.create({ url: url }, function (tab) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve({ ok: true, tabId: tab && tab.id });
      });
    });
  }

  function stripPartTexts(transfer) {
    return {
      id: transfer.id,
      sourceConversationId: transfer.sourceConversationId,
      targetPlatformId: transfer.targetPlatformId,
      mode: transfer.mode,
      status: transfer.status,
      manifest: transfer.manifest,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
      parts: transfer.parts.map(function (p) {
        return {
          index: p.index, total: p.total, bytes: p.bytes,
          messageCount: p.messageCount, messageRange: p.messageRange,
          status: p.status,
        };
      }),
    };
  }

  // --- Message router ----------------------------------------------------------------

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || typeof message.type !== 'string') {
      sendResponse({ ok: false, error: 'Invalid message' });
      return false;
    }
    if (!trustedSender(sender)) {
      sendResponse({ ok: false, error: 'Untrusted sender' });
      return false;
    }

    (async function () {
      try {
        switch (message.type) {
          case 'PING':
            return { ok: true, version: chrome.runtime.getManifest().version };

          case 'GET_PLATFORM': {
            var hostname = null;
            if (sender.tab && sender.tab.url) {
              try { hostname = new URL(sender.tab.url).hostname; } catch (_e) { hostname = null; }
            }
            return { hostname: hostname };
          }

          case 'CAPTURE_BATCH':
            return handleCaptureBatch(message, sender);

          case 'GET_CAPTURE_STATE': {
            var url2 = str(message.url, 2000);
            if (!url2) return { ok: false, error: 'invalid-request' };
            var state = await captureStateFor(url2, str(message.platformId, 64));
            return { ok: true, state: state };
          }

          case 'LIST_CONVERSATIONS': {
            var convs = await RelayArchive.listConversations();
            return { ok: true, conversations: convs };
          }

          case 'SEARCH_CONVERSATIONS': {
            var results = await RelayArchive.searchConversations(str(message.query, 200) || '');
            return { ok: true, conversations: results.slice(0, 100) };
          }

          case 'GET_CONVERSATION': {
            var id3 = str(message.conversationId, 300);
            if (!id3) return { ok: false, error: 'invalid-request' };
            var conv3 = await RelayArchive.getConversation(id3);
            return { ok: !!conv3, conversation: conv3 };
          }

          case 'GET_CONVERSATION_MESSAGES': {
            var id4 = str(message.conversationId, 300);
            if (!id4) return { ok: false, error: 'invalid-request' };
            var loaded4 = await loadConversationWithAttachments(id4);
            return {
              ok: true,
              conversation: {
                id: loaded4.conv.id, platformId: loaded4.conv.platformId,
                platformName: loaded4.conv.platformName, title: loaded4.conv.title,
                url: loaded4.conv.url, updatedAt: loaded4.conv.updatedAt,
                completeness: loaded4.conv.completeness, lineage: loaded4.conv.lineage,
                legacy: loaded4.conv.legacy, messageCount: loaded4.conv.messageCount,
              },
              messages: loaded4.messages.map(function (m) {
                return {
                  id: m.id, seq: m.seq, role: m.role, content: m.content,
                  revision: m.revision, previousRevisions: m.previousRevisions,
                  capturedAt: m.capturedAt, updatedAt: m.updatedAt,
                  attachmentDetails: m.attachmentDetails,
                };
              }),
            };
          }

          case 'DELETE_CONVERSATION': {
            var id5 = str(message.conversationId, 300);
            if (!id5) return { ok: false, error: 'invalid-request' };
            await RelayArchive.deleteConversation(id5);
            return { ok: true };
          }

          case 'DELETE_ALL_CONVERSATIONS': {
            await RelayArchive.deleteAll();
            return { ok: true };
          }

          case 'EXPORT_ARCHIVE': {
            var idOpt = str(message.conversationId, 300);
            if (idOpt) {
              var exported1 = await RelayArchive.exportConversation(idOpt, { includeAttachmentData: message.includeAttachmentData === true });
              return { ok: true, export: exported1, filename: 'relay-conversation-' + Date.now() + '.json' };
            }
            var exportedAll = await RelayArchive.exportAll({ includeAttachmentData: message.includeAttachmentData === true });
            return { ok: true, export: exportedAll, filename: 'relay-archive-' + Date.now() + '.json' };
          }

          case 'EXPORT_MARKDOWN': {
            var idM = str(message.conversationId, 300);
            if (!idM) return { ok: false, error: 'invalid-request' };
            var loadedM = await loadConversationWithAttachments(idM);
            if (!loadedM.messages.length) return { ok: false, error: 'empty-conversation' };
            var md = RelayHandoff.toMarkdown(loadedM.conv, loadedM.messages);
            return { ok: true, markdown: md, filename: 'relay-' + String(loadedM.conv.title || 'conversation').replace(/[^a-z0-9]+/gi, '-').slice(0, 40).toLowerCase() + '.md' };
          }

          case 'IMPORT_ARCHIVE': {
            var payload = message.payload;
            if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid-import' };
            var invalid = RelayArchive.validateImport(payload);
            if (invalid) return { ok: false, error: 'invalid-import', detail: invalid };
            var report = await RelayArchive.importArchive(payload);
            return { ok: true, report: report };
          }

          case 'PREPARE_HANDOFF':
            return handlePrepareHandoff(message);

          case 'CONFIRM_SWITCH':
            return handleConfirmSwitch(message);

          case 'GET_ACTIVE_TRANSFER': {
            var platformId6 = str(message.platformId, 64);
            if (!platformId6) return { ok: false, error: 'invalid-request' };
            var active = await RelayArchive.getActiveTransferForPlatform(platformId6);
            return { ok: true, transfer: active ? stripPartTexts(active) : null };
          }

          case 'GET_TRANSFER': {
            var tid = str(message.transferId, 100);
            if (!tid) return { ok: false, error: 'invalid-request' };
            var t = await RelayArchive.getTransfer(tid);
            return { ok: !!t, transfer: t ? stripPartTexts(t) : null };
          }

          case 'GET_TRANSFER_PART': {
            var tid2 = str(message.transferId, 100);
            var idx = Number(message.partIndex);
            if (!tid2 || !Number.isInteger(idx) || idx < 0 || idx > 200) {
              return { ok: false, error: 'invalid-request' };
            }
            var t2 = await RelayArchive.getTransfer(tid2);
            if (!t2 || !t2.parts[idx]) return { ok: false, error: 'part-not-found' };
            return {
              ok: true,
              part: {
                index: t2.parts[idx].index, total: t2.parts[idx].total,
                text: t2.parts[idx].text, status: t2.parts[idx].status,
                messageCount: t2.parts[idx].messageCount,
              },
            };
          }

          case 'MARK_TRANSFER_PART': {
            var tid3 = str(message.transferId, 100);
            var idx3 = Number(message.partIndex);
            var status3 = str(message.status, 32);
            if (!tid3 || !Number.isInteger(idx3) || ['pending', 'inserted', 'sent'].indexOf(status3) < 0) {
              return { ok: false, error: 'invalid-request' };
            }
            await RelayArchive.updateTransferPart(tid3, idx3, {
              status: status3,
              insertedAt: status3 === 'pending' ? null : Date.now(),
            });
            var t3 = await RelayArchive.getTransfer(tid3);
            return { ok: true, transfer: t3 ? stripPartTexts(t3) : null };
          }

          case 'ABANDON_TRANSFER': {
            var tid4 = str(message.transferId, 100);
            if (!tid4) return { ok: false, error: 'invalid-request' };
            await RelayArchive.deleteTransfer(tid4);
            return { ok: true };
          }

          case 'OPEN_OPTIONS':
            chrome.runtime.openOptionsPage();
            return { ok: true };

          default:
            return { ok: false, error: 'Unknown message type' };
        }
      } catch (err) {
        return {
          ok: false,
          error: 'internal',
          detail: String((err && err.message) || err).slice(0, 300),
          quota: RelayArchive.isQuotaError(err),
        };
      }
    })().then(sendResponse, function (err) {
      sendResponse({ ok: false, error: 'internal', detail: String((err && err.message) || err).slice(0, 300) });
    });
    return true; // async response
  });

  // --- Legacy migration ------------------------------------------------------------

  async function runMigrationIfNeeded() {
    try {
      var flag = await new Promise(function (resolve) {
        chrome.storage.local.get(RelayStorage.KEYS.MIGRATION, function (r) {
          resolve(r && r[RelayStorage.KEYS.MIGRATION]);
        });
      });
      if (flag && flag.done) return;

      var stored = await new Promise(function (resolve) {
        chrome.storage.local.get([RelayStorage.KEYS.SETTINGS, RelayStorage.KEYS.LEGACY_SESSION, RelayStorage.KEYS.LEGACY_HISTORY], resolve);
      });

      // Normalize + persist settings (v1 keys map onto v2 semantics).
      var settings = RelayStorage.normalizeSettings(stored[RelayStorage.KEYS.SETTINGS] || {});
      await new Promise(function (resolve) {
        var o = {}; o[RelayStorage.KEYS.SETTINGS] = settings;
        chrome.storage.local.set(o, resolve);
      });

      // Migrate v1 session + history into the archive (content preserved).
      var sessionRaw = stored[RelayStorage.KEYS.LEGACY_SESSION];
      var historyRaw = stored[RelayStorage.KEYS.LEGACY_HISTORY];
      // v1 compressed its session; unpack when possible.
      if (sessionRaw && sessionRaw.__compressed && sessionRaw.data && typeof RelayCompress !== 'undefined') {
        try {
          sessionRaw = JSON.parse(RelayCompress.decompress(sessionRaw.data));
        } catch (_e) { /* keep raw */ }
      }
      var report = { done: false };
      try {
        var result = await RelayArchive.migrateLegacyData(sessionRaw || null, historyRaw || null);
        report = { done: true, at: Date.now(), migratedConversations: result.migratedConversations, migratedMessages: result.migratedMessages };
      } catch (err) {
        // Migration failed — DO NOT flag as done; the legacy data stays in
        // chrome.storage.local so nothing is lost. Retry on next startup.
        report = { done: false, error: String((err && err.message) || err).slice(0, 200) };
      }
      var o2 = {}; o2[RelayStorage.KEYS.MIGRATION] = report;
      await new Promise(function (resolve) { chrome.storage.local.set(o2, resolve); });
    } catch (_e) { /* never block startup on migration bookkeeping */ }
  }

  chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason !== 'install' && details.reason !== 'update') return;
    runMigrationIfNeeded();
  });

  // Opportunistic maintenance (no alarms: least privilege; the service worker
  // runs on browser start and whenever a message arrives).
  runMigrationIfNeeded();
  RelayArchive.pruneOldTransfers().catch(function () {});
})();
