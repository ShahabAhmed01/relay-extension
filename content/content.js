/**
 * Relay — Main Content Script Orchestrator
 * Initializes platform detection, scraping, and UI injection.
 */

(async function RelayContentInit() {
  if (typeof RelayStorage === 'undefined' || typeof RelayPlatforms === 'undefined') {
    console.warn('[Relay] Required modules not loaded.');
    return;
  }

  const hostname = window.location.hostname;
  const platform = RelayPlatforms.detectPlatform(hostname);

  if (!platform) {
    console.log('[Relay] Not on a supported AI platform.');
    return;
  }

  console.log('[Relay] Detected platform:', platform.name);

  const settings = await RelayStorage.getSettings();
  if (!settings.autoCapture) {
    console.log('[Relay] Auto-capture disabled.');
    if (typeof FloatingUI !== 'undefined') {
      await FloatingUI.init();
    }
    return;
  }

  const scraper = typeof InjectorManager !== 'undefined'
    ? InjectorManager.getScraper(platform.id)
    : null;

  if (scraper) {
    let lastSaveTime = 0;
    const SAVE_DEBOUNCE = 1500;

    scraper.observe(async (messages) => {
      const now = Date.now();
      if (now - lastSaveTime < SAVE_DEBOUNCE) return;
      lastSaveTime = now;

      const cleaned = typeof RelaySanitize !== 'undefined'
        ? RelaySanitize.sanitizeForStorage(messages)
        : messages;

      await RelayStorage.saveSession(platform.id, platform.name, cleaned);

      if (typeof FloatingUI !== 'undefined') {
        FloatingUI.setFABPulse(true);
      }
    });

    window.addEventListener('beforeunload', () => {
      if (scraper.disconnect) scraper.disconnect();
    });
  }

  if (typeof FloatingUI !== 'undefined') {
    await FloatingUI.init();
  }

  if (typeof InjectorManager !== 'undefined') {
    await InjectorManager.checkAndInject();
  }

  const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  if (api && api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'OPEN_PANEL') {
        if (typeof FloatingUI !== 'undefined') {
          FloatingUI.openPanel();
        }
        sendResponse({ success: true });
      } else if (message.type === 'GET_SESSION') {
        RelayStorage.getSession().then(session => {
          sendResponse({ session });
        });
        return true;
      }
    });
  }
})();
