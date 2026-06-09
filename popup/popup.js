/**
 * Relay — Popup Script
 * Handles the toolbar popup UI logic.
 */

(async function() {
  const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

  // Apply saved theme
  try {
    const settings = await RelayStorage.getSettings();
    const theme = settings.theme || 'system';
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  } catch (_e) { /* theme is cosmetic */ }

  // Display version from manifest
  const versionEl = document.querySelector('.logo-version');
  if (versionEl && api.runtime && api.runtime.getManifest) {
    versionEl.textContent = 'v' + api.runtime.getManifest().version;
  }

  const stateEmpty = document.getElementById('state-empty');
  const stateActive = document.getElementById('state-active');
  const popupPlatform = document.getElementById('popup-platform');
  const popupCount = document.getElementById('popup-count');
  const popupTime = document.getElementById('popup-time');
  const popupPreview = document.getElementById('popup-preview');
  const btnOpenPanel = document.getElementById('btn-open-panel');
  const btnCopy = document.getElementById('btn-copy');
  const btnClear = document.getElementById('btn-clear');
  const btnSettings = document.getElementById('btn-settings');
  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');

  const PLATFORM_COLORS = {
    chatgpt: '#10a37f', claude: '#d97706', gemini: '#4285f4', perplexity: '#20808d',
    deepseek: '#4D6BFE', grok: '#1d9bf0', copilot: '#0078d4', metaai: '#0081fb',
    mistral: '#ff7000', huggingchat: '#ff9d00', poe: '#5f2eea', qwen: '#615ced',
  };

  function timeAgo(timestamp) {
    if (!timestamp) return 'unknown';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    return days + 'd ago';
  }

  let currentSession = null;

  try {
    currentSession = await RelayStorage.getSession();
  } catch (e) {
    currentSession = null;
  }

  if (currentSession && currentSession.messages && currentSession.messages.length > 0) {
    stateEmpty.classList.add('hidden');
    stateActive.classList.remove('hidden');
    popupPlatform.textContent = currentSession.platformName || currentSession.platformId;
    popupCount.textContent = currentSession.messageCount + ' msgs';
    popupTime.textContent = timeAgo(currentSession.updatedAt);

    const lastMsg = currentSession.messages[currentSession.messages.length - 1];
    if (lastMsg && popupPreview) {
      const preview = (lastMsg.content || '').substring(0, 120);
      popupPreview.textContent = preview + (lastMsg.content && lastMsg.content.length > 120 ? '...' : '');
    }
  } else {
    stateEmpty.classList.remove('hidden');
    stateActive.classList.add('hidden');
  }

  try {
    const history = await RelayStorage.getHistory();
    if (history && history.length > 0) {
      historyEmpty.style.display = 'none';
      const recent = history.slice(0, 3);
      recent.forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'history-item';

        const dot = document.createElement('div');
        dot.className = 'history-dot';
        const color = PLATFORM_COLORS[entry.platformId] || '#4a5568';
        dot.style.background = color;

        const info = document.createElement('div');
        info.className = 'history-info';

        const platform = document.createElement('span');
        platform.className = 'history-platform';
        platform.textContent = entry.platformName || entry.platformId;

        const meta = document.createElement('span');
        meta.className = 'history-meta';
        meta.textContent = entry.messageCount + ' msgs · ' + timeAgo(entry.updatedAt);

        info.appendChild(platform);
        info.appendChild(meta);

        item.appendChild(dot);
        item.appendChild(info);
        historyList.appendChild(item);
      });
    }
  } catch (e) {
    // Silently handle history load errors
  }

  if (btnOpenPanel) {
    btnOpenPanel.addEventListener('click', async () => {
      try {
        const tabs = await api.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0) {
          await api.tabs.sendMessage(tabs[0].id, { type: 'OPEN_PANEL' });
        }
      } catch (e) {
        // Content script may not be loaded
      }
      window.close();
    });
  }

  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      if (!currentSession) return;
      const settings = await RelayStorage.getSettings();
      const formatted = RelayFormatter.format(currentSession, settings);
      try {
        await navigator.clipboard.writeText(formatted);
        btnCopy.textContent = 'Copied ✓';
        setTimeout(() => { btnCopy.textContent = 'Copy'; }, 1500);
      } catch (e) {
        btnCopy.textContent = 'Failed';
        setTimeout(() => { btnCopy.textContent = 'Copy'; }, 1500);
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', async () => {
      if (confirm('Clear current session?')) {
        await RelayStorage.clearSession();
        stateEmpty.classList.remove('hidden');
        stateActive.classList.add('hidden');
      }
    });
  }

  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      if (api.runtime && api.runtime.openOptionsPage) {
        api.runtime.openOptionsPage();
      }
      window.close();
    });
  }
})();
