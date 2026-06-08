/**
 * Relay — Options Page Script
 * Handles settings management and data operations.
 */

(async function() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.options-section');

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      const sectionId = 'section-' + item.getAttribute('data-section');
      const section = document.getElementById(sectionId);
      if (section) section.classList.add('active');
    });
  });

  const autoCapture = document.getElementById('setting-autocapture');
  const maxMessages = document.getElementById('setting-maxmessages');
  const maxMessagesValue = document.getElementById('maxmessages-value');
  const fullHistory = document.getElementById('setting-fullhistory');
  const confirmSwitch = document.getElementById('setting-confirm');
  const theme = document.getElementById('setting-theme');
  const fabPosition = document.getElementById('setting-fabposition');
  const fabSize = document.getElementById('setting-fabsize');
  const showFAB = document.getElementById('setting-showfab');

  const storageUsage = document.getElementById('storage-usage');
  const storageFill = document.getElementById('storage-fill');

  const btnExport = document.getElementById('btn-export');
  const btnClearSession = document.getElementById('btn-clear-session');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const btnReset = document.getElementById('btn-reset');

  function applyThemeToPage(themeValue) {
    const root = document.documentElement;
    if (themeValue === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else if (themeValue === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
  }

  let settings = await RelayStorage.getSettings();
  applyThemeToPage(settings.theme);

  autoCapture.checked = settings.autoCapture;
  maxMessages.value = settings.maxMessages;
  maxMessagesValue.textContent = settings.maxMessages;
  fullHistory.checked = settings.includeFullHistory;
  confirmSwitch.checked = settings.confirmBeforeSwitch;
  theme.value = settings.theme;
  fabPosition.value = settings.fabPosition;
  if (fabSize) fabSize.value = settings.fabSize || 'normal';
  showFAB.checked = settings.showFAB;

  let saveTimeout = null;
  function debouncedSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      settings = {
        autoCapture: autoCapture.checked,
        maxMessages: parseInt(maxMessages.value, 10),
        includeFullHistory: fullHistory.checked,
        confirmBeforeSwitch: confirmSwitch.checked,
        theme: theme.value,
        fabPosition: fabPosition.value,
        fabSize: fabSize ? fabSize.value : 'normal',
        showFAB: showFAB.checked,
      };
      await RelayStorage.saveSettings(settings);
    }, 300);
  }

  autoCapture.addEventListener('change', debouncedSave);
  maxMessages.addEventListener('input', () => {
    maxMessagesValue.textContent = maxMessages.value;
    debouncedSave();
  });
  fullHistory.addEventListener('change', debouncedSave);
  confirmSwitch.addEventListener('change', debouncedSave);
  theme.addEventListener('change', () => {
    applyThemeToPage(theme.value);
    debouncedSave();
  });
  fabPosition.addEventListener('change', debouncedSave);
  if (fabSize) fabSize.addEventListener('change', debouncedSave);
  showFAB.addEventListener('change', debouncedSave);

  async function updateStorageInfo() {
    const usage = await RelayStorage.getStorageUsage();
    storageUsage.textContent = usage.kb + ' KB';
    const pct = Math.min((usage.kb / 7000) * 100, 100);
    storageFill.style.width = pct + '%';
    if (usage.kb > 7000) {
      storageFill.style.background = 'linear-gradient(90deg, #ef4444, #f59e0b)';
    }
  }

  await updateStorageInfo();

  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      const data = await RelayStorage.exportAll();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'relay-export-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  if (btnClearSession) {
    btnClearSession.addEventListener('click', async () => {
      if (confirm('Clear current session? This cannot be undone.')) {
        await RelayStorage.clearSession();
        await updateStorageInfo();
      }
    });
  }

  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', async () => {
      if (confirm('Clear all session history? This cannot be undone.')) {
        await RelayStorage.clearHistory();
        await updateStorageInfo();
      }
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      if (confirm('Reset all settings to defaults? This cannot be undone.')) {
        await RelayStorage.saveSettings(RelayStorage.DEFAULT_SETTINGS);
        settings = await RelayStorage.getSettings();
        applyThemeToPage(settings.theme);
        autoCapture.checked = settings.autoCapture;
        maxMessages.value = settings.maxMessages;
        maxMessagesValue.textContent = settings.maxMessages;
        fullHistory.checked = settings.includeFullHistory;
        confirmSwitch.checked = settings.confirmBeforeSwitch;
        theme.value = settings.theme;
        fabPosition.value = settings.fabPosition;
        if (fabSize) fabSize.value = settings.fabSize || 'normal';
        showFAB.checked = settings.showFAB;
      }
    });
  }
})();
