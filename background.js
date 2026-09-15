/**
 * Relay v1.1.0 — MV3 background service worker.
 * Live badges, safe navigation, injection retry watchdog, history backup.
 */

(function () {
  'use strict';

  var PLATFORM_URLS = Object.freeze({
    chatgpt: 'https://chatgpt.com/',
    claude: 'https://claude.ai/new',
    gemini: 'https://gemini.google.com/app',
    aistudio: 'https://aistudio.google.com/prompts/new_chat',
    perplexity: 'https://www.perplexity.ai/',
    deepseek: 'https://chat.deepseek.com/',
    grok: 'https://grok.com/',
    copilot: 'https://copilot.microsoft.com/',
    metaai: 'https://www.meta.ai/',
    mistral: 'https://chat.mistral.ai/chat',
    huggingchat: 'https://huggingface.co/chat/',
    poe: 'https://poe.com/',
    qwen: 'https://chat.qwen.ai/',
  });

  var AI_HOSTS = [
    'chat.openai.com', 'chatgpt.com', 'claude.ai',
    'gemini.google.com', 'aistudio.google.com',
    'perplexity.ai', 'www.perplexity.ai', 'chat.deepseek.com',
    'grok.com', 'grok.x.ai',
    'copilot.microsoft.com', 'copilot.cloud.microsoft',
    'meta.ai', 'www.meta.ai', 'chat.mistral.ai',
    'huggingface.co', 'poe.com',
    'chat.qwen.ai', 'tongyi.aliyun.com',
  ];

  var DEFAULT_SETTINGS = Object.freeze({
    maxMessages: 30, autoCapture: true, showFAB: true,
    fabPosition: 'bottom-right', fabSize: 'normal', theme: 'system',
    includeFullHistory: false, confirmBeforeSwitch: false,
    autoInject: true, copyMarkdown: true, maxChars: 120000, debug: false,
  });

  var HISTORY_LIMIT = 25;
  var RETRY_ALARM = 'relay-retry';
  var BACKUP_ALARM = 'relay-backup';

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

  function sGet(k) { return chrome.storage.local.get(k); }
  function sSet(o) { return chrome.storage.local.set(o); }
  function countOf(raw) {
    if (!raw) return 0;
    return raw.messageCount || (raw.messages && raw.messages.length) || 0;
  }

  async function setBadge(tabId, text) {
    if (!chrome.action || tabId == null) return;
    try {
      await chrome.action.setBadgeText({ text: String(text || ''), tabId: tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#7c3aed', tabId: tabId });
    } catch (_e) {}
  }

  async function updateBadge(tabId, tabUrl) {
    try {
      if (tabUrl && !isSupportedUrl(tabUrl)) { await setBadge(tabId, ''); return; }
      var r = await sGet('relay_session');
      var n = countOf(r.relay_session);
      await setBadge(tabId, n > 0 ? String(Math.min(n, 99)) : '');
    } catch (_e) {}
  }

  async function refreshAllBadges() {
    try {
      var tabs = await chrome.tabs.query({});
      var r = await sGet('relay_session');
      var n = countOf(r.relay_session);
      var t = n > 0 ? String(Math.min(n, 99)) : '';
      for (var i = 0; i < (tabs || []).length; i++) {
        var tab = tabs[i];
        if (tab.id == null) continue;
        await setBadge(tab.id, (tab.url && !isSupportedUrl(tab.url)) ? '' : t);
      }
    } catch (_e) {}
  }

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local' && changes.relay_session) refreshAllBadges();
    });
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
        if (!tab || !tab.id || !isSupportedUrl(tab.url || '')) return;
        chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' }).catch(function () {});
      }).catch(function () {});
    });
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || typeof message.type !== 'string') {
      sendResponse({ success: false, error: 'Invalid message' });
      return false;
    }
    if (message.type === 'GET_PLATFORM') {
      if (sender.tab && sender.tab.url) {
        try {
          sendResponse({ hostname: new URL(sender.tab.url).hostname });
        } catch (_e) {
          sendResponse({ hostname: null });
        }
      } else {
        sendResponse({ hostname: null });
      }
      return false;
    }

    if (message.type === 'OPEN_PLATFORM') {
      var platformId = typeof message.platformId === 'string' ? message.platformId : '';
      var url = PLATFORM_URLS[platformId];
      if (!url) {
        sendResponse({ success: false, error: 'Unknown platform: ' + platformId });
        return false;
      }
      chrome.tabs.create({ url: url }, function (tab) {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        try { if (chrome.alarms) chrome.alarms.create(RETRY_ALARM, { delayInMinutes: 0.25 }); } catch (_e) {}
        sendResponse({ success: true, tabId: tab && tab.id });
      });
      return true;
    }

    if (message.type === 'UPDATE_BADGE' || message.type === 'CLEAR_BADGE') {
      var tabId = sender.tab ? sender.tab.id : undefined;
      updateBadge(tabId, sender.tab && sender.tab.url).then(function () {
        try { sendResponse({ success: true }); } catch (_e) {}
      });
      return true;
    }

    if (message.type === 'OPEN_OPTIONS') {
      chrome.runtime.openOptionsPage();
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'PING') {
      sendResponse({ success: true, version: chrome.runtime.getManifest().version });
      return false;
    }

    sendResponse({ success: false, error: 'Unknown message type' });
    return false;
  });

  async function ensureAlarms() {
    try {
      if (!chrome.alarms) return;
      var b = await chrome.alarms.get(BACKUP_ALARM);
      if (!b) await chrome.alarms.create(BACKUP_ALARM, { periodInMinutes: 5 });
    } catch (_e) {}
  }

  if (chrome.alarms && chrome.alarms.onAlarm) {
    chrome.alarms.onAlarm.addListener(function (alarm) {
      if (!alarm || !alarm.name) return;
      (async function () {
        if (alarm.name === RETRY_ALARM) {
          try {
            var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            var tab = tabs && tabs[0];
            if (tab && tab.id && isSupportedUrl(tab.url || '')) {
              await chrome.tabs.sendMessage(tab.id, { type: 'RETRY_INJECTION' }).catch(function () {});
            }
          } catch (_e) {}
          return;
        }
        if (alarm.name !== BACKUP_ALARM) return;
        try {
          var result = await sGet(['relay_session', 'relay_history']);
          var raw = result.relay_session;
          if (!raw || !raw.platformId || !countOf(raw)) return;
          var history = Array.isArray(result.relay_history) ? result.relay_history : [];

          var entry = {
            platformId: raw.platformId, platformName: raw.platformName,
            messageCount: countOf(raw), capturedAt: raw.capturedAt || null, updatedAt: raw.updatedAt || null,
          };
          var ix = history.findIndex(function (it) { return it.capturedAt === entry.capturedAt && it.platformId === entry.platformId; });
          if (ix >= 0) history[ix] = entry;
          else history.unshift(entry);
          await sSet({ relay_history: history.slice(0, HISTORY_LIMIT) });
        } catch (_e2) {}
      })();
    });
  }

  ensureAlarms();

  chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason !== 'install' && details.reason !== 'update') return;
    (async function () {
      try {
        var result = await sGet('relay_settings');
        await sSet({ relay_settings: Object.assign({}, DEFAULT_SETTINGS, result.relay_settings || {}) });
        await ensureAlarms();
      } catch (_e) {}
    })();
  });
})();

