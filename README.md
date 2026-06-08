# Relay: The AI Context Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

**Never lose your thread.**

Relay is an open-source browser extension that acts as a bridge between all your favorite AI chatbots. It automatically captures your conversation history and lets you seamlessly jump to another AI model in one click, bringing your full context with you.

---

### The Problem
When using free AI models, hitting a usage limit means your workflow stops. Switching to a different AI platform usually means starting over and painstakingly re-explaining all the context and progress from your previous chat.

### The Solution
Relay runs silently in the background of your browser, capturing your active conversation in real-time. When you hit a limit, simply click the Relay button, choose your backup AI platform, and your entire conversation history is instantly injected into the new chat. 

Pick up exactly where you left off.

---

### Key Features

* **Real-time Auto-capture:** Conversations are captured dynamically as you chat.
* **One-click Switch:** Move to a different AI platform instantly.
* **Seamless Injection:** Your full history is automatically pasted into the new AI's input box.
* **Cross-platform Compatibility:** Works across Chrome, Edge, and Brave.
* **Privacy First:** 100% local. Your data is stored on your device and never sent to external servers.
* **Smart Compression:** Uses LZ compression to store extensive chat histories efficiently.
* **Session Memory:** Retains your last 10 sessions for quick recovery.

---

### How It Works

**Important Note:** You must be logged into the AI platforms (ChatGPT, Meta AI, Grok, etc.) for Relay to function. The extension cannot capture or inject context on logged-out or welcome screens.

1. **Chat normally:** Go to your preferred AI and start a conversation. 
2. **Switch platforms:** When you need to switch, click the floating Relay button in the corner of your screen.
3. **Select your destination:** Choose your desired AI from the menu.
4. **Continue your work:** A new tab will open with your entire context pre-loaded into the text box. Hit send and continue your workflow.

---

### Supported Platforms

| Platform | Website |
|----------|---------|
| ChatGPT | chatgpt.com |
| Claude | claude.ai |
| Gemini | gemini.google.com |
| Perplexity | perplexity.ai |
| DeepSeek | chat.deepseek.com |
| Grok | grok.com |
| Copilot | copilot.microsoft.com |
| Meta AI | meta.ai |
| Mistral | chat.mistral.ai |
| HuggingChat | huggingface.co/chat |
| Poe | poe.com |
| Qwen | chat.qwen.ai |

---

### Installation (Developer Mode)

1. Navigate to `chrome://extensions` (or `edge://extensions` / `brave://extensions` depending on your browser).
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the `relay/` folder from this repository.

---

### Project Structure

```
relay/
├── manifest.json              # Extension Configuration (Manifest V3)
├── background.js              # Service worker
├── browser-polyfill.js        # Cross-browser compatibility layer
├── content/
│   ├── content.js             # Main orchestrator
│   ├── floatingUI.js          # User Interface controls
│   ├── injector.js            # Context injection manager
│   └── platforms/             # Platform-specific parsers
├── panel/                     # Floating panel markup
├── popup/                     # Toolbar popup UI
├── options/                   # Settings page
├── utils/                     # Storage, sanitization, and compression
└── assets/                    # Icons and branding
```

---

### Contributing

Contributions, issues, and feature requests are always welcome.

1. Fork the repository.
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add some amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request.

---

### License

This project is licensed under the MIT License - see the LICENSE file for details.
