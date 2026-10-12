/**
 * Relay v2 — Settings page.
 * Every control here is wired to real v2 settings; saved-state feedback
 * is explicit. Archive operations go through the background service
 * worker, which owns the IndexedDB archive.
 */

(async function () {
  'use strict';

  const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const send = (msg) => api.runtime.sendMessage(msg);
  const $ = (id) => document.getElementById(id);

  function toast(text, kind) {
    const el = $('toast');
    el.textContent = text;
    el.className = 'toast ' + (kind || '');
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, kind === 'err' ? 6000 : 2800);
  }

  // Version.
  const versionEl = document.querySelector('[data-version]');
  if (versionEl && api.runtime.getManifest) {
    versionEl.textContent = 'Relay v' + api.runtime.getManifest().version;
  }

  // --- Settings access via storage (settings are small and local-only) ----
  async function getSettings() {
    const stored = await api.storage.local.get('relay_settings');
    const raw = stored.relay_settings || {};
    const defaults = {
      autoCapture: true, pausePlatforms: [], captureAttachments: false,
      handoffMode: 'full', partBudget: 15000, continuationCount: 30,
      autoInsert: true, confirmBeforeSwitch: false, includeBrief: false, copyMarkdown: true,
      showFAB: true, fabPosition: 'bottom-right', fabSize: 'normal', theme: 'system', debug: false,
    };
    const s = Object.assign({}, defaults, raw);
    if (!['full', 'multipart', 'continuation'].includes(s.handoffMode)) s.handoffMode = 'full';
    if (!Array.isArray(s.pausePlatforms)) s.pausePlatforms = [];
    return s;
  }

  async function saveSettings(patch) {
    const current = await getSettings();
    const merged = Object.assign({}, current, patch);
    await api.storage.local.set({ relay_settings: merged });
    return merged;
  }

  let settings = await getSettings();

  // --- Navigation -----------------------------------------------------------
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.options-section');
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      navItems.forEach((n) => n.classList.remove('active'));
      sections.forEach((s) => s.classList.remove('active'));
      item.classList.add('active');
      const section = document.getElementById('section-' + item.dataset.section);
      if (section) section.classList.add('active');
    });
  });

  // --- Theme ----------------------------------------------------------------
  function applyTheme(themeValue) {
    if (themeValue === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else if (themeValue === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  }
  applyTheme(settings.theme);

  // --- Bind controls ----------------------------------------------------------
  const autoCapture = $('setting-autocapture');
  const partBudget = $('setting-partbudget');
  const partBudgetLabel = $('partbudget-label');
  const continuationCount = $('setting-continuationcount');
  const continuationLabel = $('continuationcount-label');
  const autoInsert = $('setting-autoinsert');
  const confirmSwitch = $('setting-confirm');
  const includeBrief = $('setting-brief');
  const attachments = $('setting-attachments');
  const theme = $('setting-theme');
  const fabPosition = $('setting-fabposition');
  const fabSize = $('setting-fabsize');
  const showFAB = $('setting-showfab');
  const debug = $('setting-debug');

  function render() {
    autoCapture.checked = settings.autoCapture !== false;
    partBudget.value = settings.partBudget;
    partBudgetLabel.textContent = Math.round(settings.partBudget / 1000) + 'K characters per part';
    continuationCount.value = settings.continuationCount;
    continuationLabel.textContent = settings.continuationCount + ' most recent messages';
    document.querySelectorAll('input[name="handoffmode"]').forEach((r) => {
      r.checked = r.value === settings.handoffMode;
    });
    autoInsert.checked = settings.autoInsert !== false;
    confirmSwitch.checked = settings.confirmBeforeSwitch === true;
    includeBrief.checked = settings.includeBrief === true;
    attachments.checked = settings.captureAttachments === true;
    theme.value = settings.theme;
    fabPosition.value = settings.fabPosition;
    fabSize.value = settings.fabSize;
    showFAB.checked = settings.showFAB !== false;
    debug.checked = settings.debug === true;
    renderPauseList();
  }

  function renderPauseList() {
    const wrap = $('pause-list');
    wrap.textContent = '';
    const platforms = [
      ['chatgpt', 'ChatGPT'], ['claude', 'Claude'], ['gemini', 'Gemini'], ['aistudio', 'AI Studio'],
      ['perplexity', 'Perplexity'], ['deepseek', 'DeepSeek'], ['grok', 'Grok'], ['copilot', 'Copilot'],
      ['metaai', 'Meta AI'], ['mistral', 'Mistral'], ['huggingchat', 'HuggingChat'], ['poe', 'Poe'], ['qwen', 'Qwen'],
    ];
    platforms.forEach(([id, name]) => {
      const chip = document.createElement('label');
      chip.className = 'pause-chip' + (settings.pausePlatforms.includes(id) ? ' paused' : '');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = settings.pausePlatforms.includes(id);
      input.setAttribute('aria-label', 'Pause capture on ' + name);
      input.addEventListener('change', async () => {
        const list = new Set(settings.pausePlatforms);
        if (input.checked) list.add(id); else list.delete(id);
        settings = await saveSettings({ pausePlatforms: Array.from(list) });
        renderPauseList();
        toast(input.checked ? 'Capture paused on ' + name : 'Capture resumed on ' + name);
      });
      const label = document.createElement('span');
      label.textContent = name;
      chip.appendChild(input);
      chip.appendChild(label);
      wrap.appendChild(chip);
    });
  }

  let saveTimer = null;
  function debouncedSave(patch, after) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        settings = await saveSettings(patch);
        if (after) after();
        toast('Saved');
      } catch (e) {
        toast('Could not save settings: ' + e.message, 'err');
      }
    }, 250);
  }

  autoCapture.addEventListener('change', () => debouncedSave({ autoCapture: autoCapture.checked }));
  partBudget.addEventListener('input', () => {
    partBudgetLabel.textContent = Math.round(partBudget.value / 1000) + 'K characters per part';
    debouncedSave({ partBudget: parseInt(partBudget.value, 10) });
  });
  continuationCount.addEventListener('input', () => {
    continuationLabel.textContent = continuationCount.value + ' most recent messages';
    debouncedSave({ continuationCount: parseInt(continuationCount.value, 10) });
  });
  document.querySelectorAll('input[name="handoffmode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) debouncedSave({ handoffMode: radio.value });
    });
  });
  autoInsert.addEventListener('change', () => debouncedSave({ autoInsert: autoInsert.checked }));
  confirmSwitch.addEventListener('change', () => debouncedSave({ confirmBeforeSwitch: confirmSwitch.checked }));
  includeBrief.addEventListener('change', () => debouncedSave({ includeBrief: includeBrief.checked }));
  attachments.addEventListener('change', () => {
    debouncedSave({ captureAttachments: attachments.checked }, () => {
      toast(attachments.checked
        ? 'Attachment files will now be stored locally when the site allows it.'
        : 'Only attachment references will be kept from now on.');
    });
  });
  theme.addEventListener('change', () => {
    applyTheme(theme.value);
    debouncedSave({ theme: theme.value });
  });
  fabPosition.addEventListener('change', () => debouncedSave({ fabPosition: fabPosition.value }));
  fabSize.addEventListener('change', () => debouncedSave({ fabSize: fabSize.value }));
  showFAB.addEventListener('change', () => debouncedSave({ showFAB: showFAB.checked }));
  debug.addEventListener('change', () => debouncedSave({ debug: debug.checked }));

  render();

  // --- Storage snapshot ---------------------------------------------------------
  async function updateStorage() {
    const usageEl = $('storage-usage');
    const fill = $('storage-fill');
    const detail = $('storage-detail');
    try {
      const resp = await send({ type: 'GET_CAPTURE_STATE', url: 'https://chatgpt.com/', platformId: 'chatgpt' });
      const storage = resp && resp.ok ? resp.state.storage : null;
      if (storage && storage.quota) {
        const pct = Math.min(100, Math.round((storage.usage / storage.quota) * 100));
        usageEl.textContent = Math.round(storage.usage / 1024) + ' KB used';
        fill.style.width = pct + '%';
        fill.className = 'storage-fill' + (pct > 90 ? ' err' : pct > 75 ? ' warn' : '');
        detail.textContent = 'Approximately ' + pct + '% of the storage this browser grants extensions (' +
          Math.round(storage.quota / 1024 / 1024) + ' MB). Relay stays functional under pressure; if saves ever fail, the panel tells you instead of silently dropping messages.';
      } else {
        usageEl.textContent = 'This browser does not report storage usage.';
        detail.textContent = '';
      }
    } catch (_e) {
      usageEl.textContent = 'unknown';
    }
  }
  updateStorage();

  // --- Data actions ---------------------------------------------------------------
  $('btn-export-all').addEventListener('click', async () => {
    try {
      const resp = await send({ type: 'EXPORT_ARCHIVE' });
      if (!resp || !resp.ok) throw new Error((resp && (resp.error || resp.detail)) || 'export failed');
      const blob = new Blob([JSON.stringify(resp.export, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = resp.filename || 'relay-archive.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);
      toast('Archive exported.', 'ok');
    } catch (e) {
      toast('Export failed: ' + e.message, 'err');
    }
  });

  $('btn-import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const resp = await send({ type: 'IMPORT_ARCHIVE', payload });
      if (!resp || !resp.ok) throw new Error((resp && (resp.error || resp.detail)) || 'invalid archive');
      const r = resp.report;
      toast('Imported ' + r.conversations + ' conversation(s): +' + r.messagesAdded + ' messages.', 'ok');
    } catch (err) {
      toast('Import failed: ' + err.message, 'err');
    } finally {
      e.target.value = '';
    }
  });

  $('btn-delete-all').addEventListener('click', async () => {
    if (!confirm('Delete EVERY archived conversation?\n\nThis clears all captured messages and attachment records. Settings are kept. It cannot be undone. Export a backup first if unsure.')) return;
    if (!confirm('Final confirmation — delete all archives?')) return;
    const resp = await send({ type: 'DELETE_ALL_CONVERSATIONS' });
    if (resp && resp.ok) {
      toast('All archives deleted.', 'ok');
      updateStorage();
    } else {
      toast('Delete failed.', 'err');
    }
  });
})();
