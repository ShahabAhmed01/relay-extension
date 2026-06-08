const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../../dist/chrome');

(async () => {
  console.log('Launching Puppeteer with extension...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ]
  });

  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Enable request interception to serve mock pages
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    if (url === 'https://chatgpt.com/') {
      request.respond({
        status: 200,
        contentType: 'text/html',
        body: fs.readFileSync(path.join(__dirname, 'mocks', 'chatgpt.html'))
      });
    } else if (url === 'https://claude.ai/') {
      request.respond({
        status: 200,
        contentType: 'text/html',
        body: fs.readFileSync(path.join(__dirname, 'mocks', 'claude.html'))
      });
    } else {
      request.continue();
    }
  });

  try {
    console.log('Navigating to ChatGPT mock...');
    await page.goto('https://chatgpt.com/');

    // Wait for extension to initialize and set up observers
    await new Promise(r => setTimeout(r, 1000));

    console.log('Triggering DOM mutation to activate scraper...');
    await page.evaluate(() => {
      const msg = document.createElement('div');
      msg.setAttribute('data-message-author-role', 'user');
      msg.innerHTML = '<div class="whitespace-pre-wrap">Another message to trigger observer</div>';
      document.querySelector('main').appendChild(msg);
    });

    // Wait for scraper debounce and storage
    await new Promise(r => setTimeout(r, 2500));

    // Check if the FAB was injected
    const fab = await page.$('#relay-fab');
    if (!fab) throw new Error('Relay FAB not injected into ChatGPT');
    console.log('FAB found.');

    // Click FAB to open panel
    await fab.click();
    await new Promise(r => setTimeout(r, 500));

    // Verify session was captured in panel
    const sessionCount = await page.evaluate(() => {
      const widget = document.querySelector('relay-widget');
      if (!widget || !widget.shadowRoot) return null;
      const countEl = widget.shadowRoot.querySelector('#relay-session-count');
      return countEl ? countEl.textContent : null;
    });

    console.log('Session count in panel:', sessionCount);
    if (!sessionCount || sessionCount.indexOf('0') !== -1) {
      throw new Error('Session context was not captured by the extension');
    }

    // Set up a listener for the new target/tab that the extension opens
    const targetPromise = new Promise(resolve => browser.once('targetcreated', resolve));

    // Click the Claude platform button in the grid
    console.log('Switching to Claude...');
    await page.evaluate(() => {
      const widget = document.querySelector('relay-widget');
      const claudeBtn = widget.shadowRoot.querySelector('.relay-platform-card[data-platform-id="claude"]');
      claudeBtn.click();
    });

    // Wait for the new tab
    const newTarget = await targetPromise;
    const newPage = await newTarget.page();

    // Enable interception on the new page too
    await newPage.setRequestInterception(true);
    newPage.on('request', (request) => {
      const url = request.url();
      if (url === 'https://claude.ai/') {
        request.respond({
          status: 200,
          contentType: 'text/html',
          body: fs.readFileSync(path.join(__dirname, 'mocks', 'claude.html'))
        });
      } else {
        request.continue();
      }
    });

    // Wait for the new page to load completely and extension to inject
    console.log('Waiting for context injection in Claude...');
    await newPage.goto('https://claude.ai/');
    await new Promise(r => setTimeout(r, 3000));

    // Verify injection
    const inputValue = await newPage.evaluate(() => {
      const input = document.querySelector('[contenteditable="true"]');
      return input ? input.textContent : null;
    });

    console.log('Value in Claude input box:', inputValue);

    if (!inputValue || !inputValue.includes('The meaning of life is 42')) {
      throw new Error('Context was not properly injected into Claude');
    }

    console.log('✅ End-to-End Test Passed: Context correctly captured and relayed.');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
