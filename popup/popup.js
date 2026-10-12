/**
 * Relay v2 — toolbar popup.
 * Shows the active tab's captured context with honest status, plus
 * shortcuts into the archive. Archive reads go through the background.
 */

(async function () {
  'use strict';

  const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const send = (msg) => api.runtime.sendMessage(msg);
  const $ = (id) => document.getElementById(id);

  function timeAgo(ts) {
    if (!ts) return 'unknown';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  const COMPLETENESS = {
    complete: ['ok', 'Full conversation captured'],
    partial: ['warn', 'Partial — some messages not visible'],
    live: ['warn', 'Live capture — older messages unverified'],
    unverified: ['warn', 'Capture status unverified'],
  };

  function platformColor(id) {
    const colors = {
      chatgpt: '#10a37f', claude: '#d97706', gemini: '#4285f4', aistudio: '#1a73e8',
      perplexity: '#20808d', deepseek: '#4D6BFE', grok: '#1d9bf0', copilot: '#0078d4',
      metaai: '#0081fb', mistral: '#ff7000', huggingchat: '#ff9d00', poe: '#5f2eea',
      qwen: '#615ced',
    };
    return colors[id] || '#8a90a5';
  }

  // Theme + version.
  try {
    const stored = await api.storage.local.get('relay_settings');
    const theme = (stored.relay_settings && stored.relay_settings.theme) || 'system';
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  } catch (_e) { /* system default */ }
  const versionEl = document.querySelector('[data-version]');
  if (versionEl && api.runtime.getManifest) versionEl.textContent = 'v' + api.runtime.getManifest().version;

  // Active tab state.
  let tab = null;
  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    tab = tabs && tabs[0];
  } catch (_e) { /* no tabs access */ }

  let conversation = null;
  let paused = null;
  let supported = false;

  if (tab && tab.url && tab.url.startsWith('https://')) {
    try {
      const resp = await send({ type: 'GET_CAPTURE_STATE', url: tab.url, platformId: '' });
      if (resp && resp.ok) {
        conversation = resp.state.conversation;
        paused = resp.state.paused;
        supported = !!resp.state.supported;
      }
    } catch (_e) { /* background unavailable */ }
  }

  function show(which) {
    $('state-unsupported').hidden = which !== 'unsupported';
    $('state-empty').hidden = which !== 'empty';
    $('state-paused').hidden = which !== 'paused';
    $('state-active').hidden = which !== 'active';
  }

  if (!supported) {
    show('unsupported');
  } else if (paused && paused.paused) {
    show('paused');
    $('paused-hint').textContent = paused.scope === 'global'
      ? 'Capture is paused for all sites — re-enable it in Settings.'
      : 'Capture is paused for this platform — re-enable it in Settings.';
  } else if (conversation && conversation.messageCount > 0) {
    show('active');
    $('p-title').textContent = conversation.title || 'Untitled conversation';
    $('p-title').title = conversation.title || '';
    $('p-platform').textContent = conversation.platformName || conversation.platformId;
    $('p-count').textContent = conversation.messageCount + ' messages captured';
    $('p-updated').textContent = 'updated ' + timeAgo(conversation.updatedAt);
    const [cls, label] = COMPLETENESS[(conversation.completeness && conversation.completeness.status)] || COMPLETENESS.unverified;
    const badge = $('p-completeness');
    badge.className = 'badge ' + cls;
    badge.textContent = label;
  } else {
    show('empty');
  }

  // Recent archives (clickable -> opens the archive page at that conversation).
  try {
    const resp = await send({ type: 'LIST_CONVERSATIONS' });
    const convs = (resp && resp.ok && resp.conversations) || [];
    const list = $('recent-list');
    $('recent-empty').hidden = convs.length > 0;
    convs.slice(0, 4).forEach((conv) => {
      const item = document.createElement('button');
      item.className = 'recent-item';
      const dot = document.createElement('span');
      dot.className = 'recent-dot';
      dot.style.background = platformColor(conv.platformId);
      const info = document.createElement('span');
      info.className = 'recent-info';
      const title = document.createElement('span');
      title.className = 'recent-title';
      title.textContent = conv.title || 'Untitled conversation';
      const meta = document.createElement('span');
      meta.className = 'recent-meta';
      meta.textContent = (conv.platformName || conv.platformId) + ' · ' + (conv.messageCount || 0) + ' msgs · ' + timeAgo(conv.updatedAt);
      info.appendChild(title);
      info.appendChild(meta);
      item.appendChild(dot);
      item.appendChild(info);
      item.addEventListener('click', () => {
        api.tabs.create({ url: api.runtime.getURL('archive/archive.html#' + encodeURIComponent(conv.id)) });
        window.close();
      });
      list.appendChild(item);
    });
  } catch (_e) { /* history optional */ }

  // Actions.
  $('btn-open-panel').addEventListener('click', async () => {
    if (!tab || tab.id == null) return;
    try {
      await api.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' });
    } catch (_e) {
      // Content script not loaded (page still loading or unsupported).
      try {
        await api.tabs.create({ url: api.runtime.getURL('archive/archive.html') });
      } catch (_e2) { /* nothing else we can do */ }
    }
    window.close();
  });

  $('btn-copy').addEventListener('click', async (e) => {
    if (!conversation) return;
    const btn = e.target;
    try {
      const resp = await send({ type: 'EXPORT_MARKDOWN', conversationId: conversation.id });
      if (!resp || !resp.ok) throw new Error((resp && resp.error) || 'nothing to copy');
      await navigator.clipboard.writeText(resp.markdown);
      btn.textContent = 'Copied ✓';
    } catch (err) {
      btn.textContent = 'Failed';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1400);
      return;
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1400);
  });

  $('btn-export').addEventListener('click', async () => {
    if (!conversation) return;
    try {
      const resp = await send({ type: 'EXPORT_ARCHIVE', conversationId: conversation.id });
      if (!resp || !resp.ok) throw new Error('export failed');
      const blob = new Blob([JSON.stringify(resp.export, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = resp.filename || 'relay-conversation.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);
    } catch (_e) { /* clipboard/download errors surfaced by the browser */ }
  });

  $('btn-archive').addEventListener('click', () => {
    api.tabs.create({ url: api.runtime.getURL('archive/archive.html') });
    window.close();
  });

  $('btn-settings').addEventListener('click', () => {
    if (api.runtime.openOptionsPage) api.runtime.openOptionsPage();
    window.close();
  });
})();
