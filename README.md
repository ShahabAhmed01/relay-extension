# Relay: The AI Context Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

**Never lose your thread.**

Relay is an open-source browser extension that acts as a bridge between all your favorite AI chatbots. It automatically captures your conversation history and lets you seamlessly jump to another AI model in one click, bringing your full context with you.

---

### The Problem
When using free AI models, hitting a usage limit means your workflow stops. Switching to a different AI platform usually means starting over and painstakingly re-explaining all the context and progress from your previous chat.

### The Solution
Relay runs silently in the background of your browser, capturing your active conversation in real-time. When you hit a limit, click the floating Relay button (or press `Alt+R`), choose your backup AI platform, and your conversation history is injected into the new chat.

Pick up exactly where you left off.

---

### Key Features

* **Real-time Auto-capture:** Conversations are captured dynamically as you chat (with change detection so nothing is saved twice).
* **One-click Switch:** Move to a different AI platform instantly — or press `Alt+R` anywhere on a supported site.
* **Seamless Injection:** Your history is automatically pasted into the new AI's input box, with framework-aware handling for React, ProseMirror and Quill editors.
* **Keyboard-first Panel:** `Alt+R` toggles, search box + arrow keys to navigate, `Esc` to close. Fully usable without a mouse.
* **Draggable FAB:** Drag the Relay button to any corner — it snaps and remembers its position.
* **Degraded-capture warning:** If a platform changes its DOM and Relay falls back to its generic parser, it tells you instead of silently transferring garbled context.
* **Privacy First:** 100% local. No servers, no analytics, no telemetry — enforced by an automated audit (`node scripts/lint.js`).
* **Smart Compression:** LZ compression plus quota-aware truncation stores extensive histories efficiently.
* **Session Memory:** Retains your last **25 sessions** for quick recovery.

---

### How It Works

**Important Note:** You must be logged into the AI platforms (ChatGPT, Meta AI, Grok, etc.) for Relay to function. The extension cannot capture or inject context on logged-out or welcome screens.

1. **Chat normally:** Go to your preferred AI and start a conversation.
2. **Switch platforms:** Click the floating Relay button (or press `Alt+R`) and pick a destination.
3. **Continue your work:** A new tab opens with your context pre-loaded into the text box. Hit send and continue.


---

### Context Sharing & Settings

By default, Relay is optimized to avoid hitting input character limits when transferring long conversations.

* **Default behavior:** the **last 30 messages**, plain text (files, images, and backend system prompts are not transferred).
* **Options page** lets you tune: auto-capture, message limit (5–200), full-history mode, context character budget (with a live "estimated transfer size" readout), auto-inject, copy-as-Markdown, confirmation before switching, theme, FAB position/size/visibility, and debug logging.
* **Copy buttons:** the panel and popup can copy either the plain continuation prompt or a structured Markdown transcript.

---

### Supported Platforms

| Platform | Website | | Platform | Website |
|----------|---------|-|----------|---------|
| ChatGPT | chatgpt.com | | Copilot | copilot.microsoft.com |
| Claude | claude.ai | | Meta AI | meta.ai |
| Gemini | gemini.google.com | | Mistral | chat.mistral.ai |
| AI Studio | aistudio.google.com | | HuggingChat | huggingface.co/chat |
| Perplexity | perplexity.ai | | Poe | poe.com |
| DeepSeek | chat.deepseek.com | | Qwen/Tongyi | chat.qwen.ai |
| Grok | grok.com | | | |

---

### Installation (Developer Mode)

1. Navigate to `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository folder.

---

### Development & Validation

The whole pipeline runs on the Node standard library — no heavyweight toolchain:

```bash
node scripts/lint.js        # syntax, manifest, privacy & registry-parity audits
node --test tests/unit/     # unit tests (sanitize, storage, formatter, platforms, scrapers)
npm run pack:chrome         # build + validate dist/chrome and produce a checksummed zip
npm run pack:firefox        # Gecko-compatible build (event-page manifest)
npm run pack:source         # clean source archive
npm run test:e2e            # full browser flow (needs `npm install` for puppeteer)
```

E2E uses headless Chrome with mock pages served from `tests/e2e/mocks/`, verifying capture → panel → switch → injection end to end. CI runs lint + unit tests on every push and PR.

---

### Project Structure

```
relay-extension/
├── manifest.json              # Extension configuration (Manifest V3)
├── background.js              # Service worker: badges, navigation, retry watchdog
├── browser-polyfill.js        # Cross-browser API compatibility layer
├── content/
│   ├── content.js             # Orchestrator: capture, SPA navigation, messaging
│   ├── floatingUI.js          # Shadow-DOM FAB + panel (drag, search, keyboard nav)
│   ├── injector.js            # Retry-safe injection manager
│   └── platforms/
│       ├── index.js           # Platform registry — single source of truth
│       ├── base.js            # Scraper/injector factory with fallback detection
│       ├── generic.js         # Best-effort fallback parser (warns when used)
│       ├── chatgpt.js / claude.js / gemini.js   # First-class adapters
│       └── adapters.js        # Config-driven adapters for the remaining platforms
├── popup/                     # Toolbar popup UI
├── options/                   # Settings page
├── utils/                     # storage, sanitize, formatter, compress, dom helpers
├── scripts/lint.js            # Integrity & privacy audits
├── tests/                     # unit/ (node:test) and e2e/ (puppeteer + mocks)
└── assets/                    # Icons and branding
```

---

### Contributing

Contributions, issues, and feature requests are always welcome.

1. Fork the repository.
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Make sure `node scripts/lint.js && node --test tests/unit/` pass.
4. Commit your changes and open a Pull Request.

---

### License

This project is licensed under the MIT License - see the LICENSE file for details.
