/**
 * Relay E2E — loads the built extension (dist/chrome) into headless Chrome and
 * verifies the full flow: capture → panel → platform switch → injection.
 *
 * Prerequisites:
 *   npm install          (provides puppeteer)
 *   npm run pack:chrome  (creates dist/chrome)
 *
 * Mock pages are served from tests/e2e/mocks/ via request interception.
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../../dist/chrome');
const MOCKS = path.join(__dirname, 'mocks');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
  console.error('✖ dist/chrome not found — run `npm run pack:chrome` first.');
  process.exit(1);
}

function serveMock(request) {
  if (request.isInterceptResolutionHandled()) return;
  const url = request.url();
  const file = url.startsWith('https://chatgpt.com')
    ? 'chatgpt.html'
    : url.startsWith('https://claude.ai')
      ? 'claude.html'
      : null;
  if (file) {
    request.respond({
      status: 200,
      contentType: 'text/html',
      body: fs.readFileSync(path.join(MOCKS, file), 'utf8'),
    });
  } else {
    request.continue();
  }
}

const interceptedPages = new WeakSet();

async function interceptTarget(target) {
  try {
    const page = await target.page();
    if (!page || interceptedPages.has(page)) return;
    interceptedPages.add(page);
    await page.setRequestInterception(true);
    page.on('request', serveMock);
  } catch (_e) { /* non-page target */ }
}

function findCachedChrome() {
  // Newest Chrome build in the puppeteer cache (version-pinned downloads can
  // be unavailable in offline/sandboxed environments).
  const cacheDir = path.join(process.env.HOME || '', '.cache', 'puppeteer', 'chrome');
  try {
    const versions = fs.readdirSync(cacheDir)
      .filter((v) => v.startsWith('linux-'))
      .sort()
      .reverse();
    for (const v of versions) {
      const bin = path.join(cacheDir, v, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  } catch (_e) { /* no cache */ }
  return null;
}

(async () => {
  console.log('Launching headless Chrome with the extension...');
  const launchOpts = {
    headless: 'new',
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  };
  if (process.env.CHROME_PATH) launchOpts.executablePath = process.env.CHROME_PATH;
  let browser;
  try {
    browser = await puppeteer.launch(launchOpts);
  } catch (e) {
    const bin = findCachedChrome();
    if (!bin) throw e;
    console.log('Pinned Chrome unavailable — using cached build:', bin);
    browser = await puppeteer.launch({ ...launchOpts, executablePath: bin });
  }

  try {
    // Intercept every page target, including tabs the extension opens later.
    browser.on('targetcreated', interceptTarget);

    const page = await browser.newPage();
    await interceptTarget({ page: async () => page });
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

    console.log('Navigating to ChatGPT mock...');
    await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
    await sleep(1500); // extension init (document_idle + boot)

    // 1. FAB exists inside its shadow host.
    const fab = await page.evaluateHandle(() => {
      const host = document.getElementById('relay-fab-host');
      return host && host.shadowRoot
        ? host.shadowRoot.getElementById('relay-fab')
        : null;
    });
    if (!(await fab.evaluate((el) => !!el))) throw new Error('Relay FAB was not injected');
    console.log('FAB found.');

    // 2. New message triggers capture via the MutationObserver.
    await page.evaluate(() => {
      const msg = document.createElement('div');
      msg.setAttribute('data-message-author-role', 'user');
      msg.innerHTML = '<div class="whitespace-pre-wrap">Another follow-up message</div>';
      document.querySelector('main').appendChild(msg);
    });
    await sleep(2500); // observer debounce (350ms) + capture debounce (1200ms)

    // 3. Clicking the FAB opens the panel (shadow DOM).
    await fab.evaluate((el) => el.click());
    await sleep(800);
    const sessionCount = await page.evaluate(() => {
      const widget = document.querySelector('relay-widget');
      if (!widget || !widget.shadowRoot) return null;
      const el = widget.shadowRoot.querySelector('#relay-session-count');
      return el ? el.textContent : null;
    });
    console.log('Session count in panel:', sessionCount);
    if (!sessionCount || sessionCount.startsWith('0 ')) {
      throw new Error('Session context was not captured / panel did not open');
    }

    // 4. Switch to Claude — the background opens a new tab with a fresh chat.
    console.log('Switching to Claude...');
    const claudePagePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No new tab opened')), 15000);
      browser.on('targetcreated', async (target) => {
        if (target.url().startsWith('https://claude.ai')) {
          clearTimeout(timer);
          const p = await target.page();
          await interceptTarget({ page: async () => p }); // WeakSet-guarded
          // Re-navigate under guaranteed interception — the tab's first load
          // can race ahead of setRequestInterception and hit the real site.
          await p.goto('https://claude.ai/', { waitUntil: 'domcontentloaded' }).catch(() => {});
          resolve(p);
        }
      });
    });
    await page.evaluate(() => {
      const widget = document.querySelector('relay-widget');
      widget.shadowRoot
        .querySelector('.relay-platform-card[data-platform-id="claude"]')
        .click();
    });
    const claudePage = await claudePagePromise;
    await sleep(6000); // injection retry windows (400+800+1500+2500+4000ms)

    const inputValue = await claudePage.evaluate(() => {
      const input = document.querySelector('[contenteditable="true"]');
      return input ? input.textContent : null;
    });
    console.log('Value in Claude composer:', inputValue && inputValue.slice(0, 120) + '...');
    if (!inputValue || !inputValue.includes('The meaning of life is 42')) {
      throw new Error('Context was not injected into Claude');
    }

    console.log('✅ E2E passed: captured on ChatGPT, panel works, injected into Claude.');
  } catch (err) {
    console.error('❌ E2E failed:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();

