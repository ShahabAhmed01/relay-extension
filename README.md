# Relay — AI Context Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Pending-orange.svg)](#)

**Never lose your thread.**

Relay is an open-source browser extension that automatically captures your AI conversations and lets you continue them on any other AI in one click — with full context injected.

## 🚀 The Problem

When a free AI model hits its usage limit, you lose all conversation context when switching to another AI. You have to re-explain everything from scratch.

## 💡 The Solution

Relay runs silently in the background, capturing your conversation history. When you hit a limit, click the Relay button, choose another AI platform, and your full context is pre-loaded into the new conversation.

---

## Installation (Developer Mode)

### Chrome / Edge / Brave

1. Go to `chrome://extensions` (or `edge://extensions` / `brave://extensions`)
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `relay/` folder from this repository



---

## How to Use

1. **Visit any supported AI** — ChatGPT, Claude, Gemini, Perplexity, DeepSeek, Grok, Copilot, Meta AI, Mistral, HuggingChat, Poe, or Qwen
2. **Chat normally** — Relay captures your conversation automatically in the background
3. **Hit a limit?** — Click the **Relay button** (bottom-right corner of the page)
4. **Choose a platform** — Click any platform in the "Continue on" grid
5. **Continue seamlessly** — A new tab opens with your full conversation history pre-loaded into the input field
6. **Review and send** — The new AI knows exactly where you left off

---

## Supported Platforms

| Platform | URL |
|----------|-----|
| ChatGPT | chatgpt.com |
| Claude | claude.ai |
| Gemini | gemini.google.com |
| Perplexity | perplexity.ai |
| DeepSeek | chat.deepseek.com |
| Grok | grok.x.ai |
| Copilot | copilot.microsoft.com |
| Meta AI | meta.ai |
| Mistral | chat.mistral.ai |
| HuggingChat | huggingface.co/chat |
| Poe | poe.com |
| Qwen | chat.qwen.ai |

---

## Features

- **Auto-capture** — Conversations are captured in real-time as you chat
- **One-click switch** — Continue on any other AI platform instantly
- **Context injection** — Full conversation history is formatted and injected into the new AI's input
- **Cross-platform** — Works on Chrome, Edge, and Brave
- **100% local** — All data stays on your device, never sent anywhere
- **Shadow DOM isolation** — Relay's UI doesn't interfere with AI websites
- **LZ compression** — Efficient storage using LZString compression
- **Session history** — Last 10 sessions are saved for quick access
- **Customizable** — Adjust capture settings, FAB position, and more

---

## Privacy

**100% local. No servers, no accounts, no data leaves your device. Ever.**

- All data is stored locally in your browser profile (`chrome.storage.local`)
- No network requests are made by the extension
- No analytics, telemetry, or crash reporting
- No unique identifiers or fingerprinting
- All fonts and icons are inlined (no external requests)

---

## Building Icons

To generate PNG icons from the SVG source:

```bash
npm install
npm run build
```

This requires the `sharp` npm package and generates 16x16, 32x32, 48x48, and 128x128 PNG icons.

---

## Project Structure

```
relay/
├── manifest.json              # Chrome/Edge/Brave (Manifest V3)
├── background.js              # Service worker
├── browser-polyfill.js        # Cross-browser compatibility
├── content/
│   ├── content.js             # Main orchestrator
│   ├── floatingUI.js          # FAB + floating panel
│   ├── injector.js            # Context injection manager
│   └── platforms/             # Per-platform scrapers & injectors
├── panel/                     # Floating panel markup & styles
├── popup/                     # Toolbar popup
├── options/                   # Settings page
├── utils/                     # Storage, sanitize, format, compress
└── assets/                    # Icons & logo
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](../../issues).
If you want to contribute:
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
