/**
 * Relay - Chrome MV3 background service worker.
 * Handles badge updates, safe platform navigation, alarms, and defaults.
 */

(function() {
  'use strict';

  const PLATFORM_URLS = Object.freeze({
    chatgpt: 'https://chatgpt.com',
    claude: 'https://claude.ai',
    gemini: 'https://gemini.google.com',
    perplexity: 'https://www.perplexity.ai',
    deepseek: 'https://chat.deepseek.com',
    grok: 'https://grok.com',
    copilot: 'https://copilot.microsoft.com',
    metaai: 'https://www.meta.ai',
    mistral: 'https://chat.mistral.ai',
    huggingchat: 'https://huggingface.co/chat',
    poe: 'https://poe.com',
    qwen: 'https://chat.qwen.ai',
  });

  const AI_HOSTS = [
    'chat.openai.com',
    'chatgpt.com',
    'claude.ai',
    'gemini.google.com',
    'www.perplexity.ai',
    'chat.deepseek.com',
    'grok.com',
    'grok.x.ai',
    'copilot.microsoft.com',
    'www.meta.ai',
    'chat.mistral.ai',
    'huggingface.co',
    'poe.com',
    'chat.qwen.ai',
    'tongyi.aliyun.com',
  ];

  const DEFAULT_SETTINGS = Object.freeze({
    maxMessages: 30,
    autoCapture: true,
    showFAB: true,
    fabPosition: 'bottom-right',
    fabSize: 'normal',
    theme: 'system',
    includeFullHistory: false,
    confirmBeforeSwitch: false,
  });

  function storageGet(keys) {
    return chrome.storage.local.get(keys);
  }

  function storageSet(items) {
    return chrome.storage.local.set(items);
  }

  function isAIHost(hostname) {
    if (!hostname) return false;
    const host = hostname.toLowerCase().replace(/^www\./, '');
    return AI_HOSTS.some((candidate) => {
      const normalized = candidate.toLowerCase().replace(/^www\./, '');
      return host === normalized || host.endsWith('.' + normalized);
    });
  }

  function isSupportedUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;
      // x.com is only supported for the Grok path
      if (parsed.hostname === 'x.com') {
        return parsed.pathname.startsWith('/i/grok');
      }
      return isAIHost(parsed.hostname);
    } catch (_e) {
      return false;
    }
  }

  async function setBadge(tabId, text) {
    if (!chrome.action || !tabId) return;
    await chrome.action.setBadgeText({ text, tabId });
    await chrome.action.setBadgeBackgroundColor({ color: '#7c3aed', tabId });
  }

  async function updateBadge(tabId, tabUrl) {
    try {
      if (tabUrl && !isSupportedUrl(tabUrl)) {
        await setBadge(tabId, '');
        return;
      }

      const result = await storageGet('relay_session');
      const raw = result.relay_session;
      const count = raw ? (raw.messageCount || 0) : 0;
      await setBadge(tabId, count > 0 ? String(count) : '');
    } catch (_e) {
      // Badge updates are cosmetic and should never interrupt extension work.
    }
  }

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      updateBadge(tabId, tab.url);
    }
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      updateBadge(activeInfo.tabId, tab && tab.url);
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
      const platformId = typeof message.platformId === 'string' ? message.platformId : '';
      const url = PLATFORM_URLS[platformId];
      if (!url) {
        sendResponse({ success: false, error: 'Unknown platform' });
        return false;
      }

      chrome.tabs.create({ url }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ success: true });
      });
      return true;
    }

    if (message.type === 'CLEAR_BADGE') {
      const tabId = sender.tab ? sender.tab.id : undefined;
      if (tabId) updateBadge(tabId, sender.tab && sender.tab.url);
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'OPEN_OPTIONS') {
      chrome.runtime.openOptionsPage();
      sendResponse({ success: true });
      return false;
    }

    sendResponse({ success: false, error: 'Unknown message type' });
    return false;
  });

  chrome.alarms.create('relay-backup', { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'relay-backup') return;

    try {
      const result = await storageGet(['relay_session', 'relay_history']);
      const raw = result.relay_session;
      if (!raw || !raw.platformId || !raw.messageCount) return;

      const history = Array.isArray(result.relay_history) ? result.relay_history : [];
      const entry = {
        platformId: raw.platformId,
        platformName: raw.platformName,
        messageCount: raw.messageCount,
        capturedAt: raw.capturedAt || null,
        updatedAt: raw.updatedAt || null,
      };

      const existing = history.findIndex((item) => {
        return item.capturedAt === entry.capturedAt && item.platformId === entry.platformId;
      });

      if (existing >= 0) {
        history[existing] = entry;
      } else {
        history.unshift(entry);
      }

      await storageSet({ relay_history: history.slice(0, 10) });
    } catch (_e) {
      // Backup should be best-effort.
    }
  });

  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason !== 'install' && details.reason !== 'update') return;
    const result = await storageGet('relay_settings');
    if (!result.relay_settings) {
      await storageSet({ relay_settings: DEFAULT_SETTINGS });
    }
  });
})();
