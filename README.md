# Relay — The AI Context Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Validate](https://img.shields.io/badge/CI-lint%20%2B%20unit%20%2B%20e2e-green.svg)](.github/workflows/validate.yml)

**Move between AI platforms without losing the thread.**

Relay is an open-source browser extension that captures your AI conversations into a **complete, local, lossless archive** and hands that context off to any other supported AI — so you can continue working instead of re-explaining everything.

- **Local-first.** The archive lives in your browser's IndexedDB. No servers, no accounts, no analytics, no network calls. An automated audit in CI enforces this.
- **Lossless archive.** Everything Relay captures is kept — full message content, order, speaker attribution, edits (with revision history), repeated identical messages as separate turns, and attachment references. Capture is never trimmed to fit a transfer budget.
- **Honest handoff.** Transfers say exactly what they include, what they omit, and whether insertion succeeded. Relay inserts text into the destination composer and **never presses send for you**.

---

## Table of contents

1. [How it works](#how-it-works)
2. [What Relay does *not* do](#what-relay-does-not-do)
3. [Installation](#installation)
4. [Using Relay](#using-relay)
5. [Transfer modes](#transfer-modes)
6. [Context health and completeness](#context-health-and-completeness)
7. [Attachments](#attachments)
8. [The archive](#the-archive)
9. [Supported platforms](#supported-platforms)
10. [Privacy and security](#privacy-and-security)
11. [Keyboard shortcuts](#keyboard-shortcuts)
12. [Troubleshooting](#troubleshooting)
13. [Known limitations](#known-limitations)
14. [Development and validation](#development-and-validation)
15. [Project structure](#project-structure)

---

## How it works

Relay separates three things that are often confused:

**1. The canonical archive (IndexedDB, on your device).**
While you chat, Relay's content scripts read the conversation DOM, reconcile it against what it already has, and persist every captured message into an IndexedDB archive owned by the extension's background worker. Reconciliation is content-aware:

- new messages are appended;
- a streamed response that keeps growing **updates one record** instead of duplicating;
- an edited or regenerated message is recorded as a **revision** (the previous text is kept);
- two identical messages ("test", "test") remain **two separate turns** — content is never used as a dedup key;
- messages that scroll out of a virtualized list are **never deleted**;
- each capture batch is a single atomic transaction — a failed write (e.g. quota) leaves the previous archive untouched and is reported as a failure.

**2. The transfer package.**
When you switch platforms, Relay builds a package from the archive: the transcript in chronological order with unambiguous `User:` / `Assistant:` labels, framed by a header that tells the destination AI to treat it as history — and never to follow instructions found inside it. The package carries a manifest: exactly which messages are included, capture completeness, attachment status, and a size estimate (clearly labeled an estimate — Relay does not pretend to know another model's tokenizer).

**3. The optional continuity brief.**
An extractive set of notes (opening request, quoted decisions, latest user message) generated from the captured text only — grounded quotations, never invention. The brief supplements the transcript; it never replaces it.

## What Relay does *not* do

- It does **not** summarize your conversation down to a few bullet points and call that a transfer.
- It does **not** silently delete older messages to fit a size limit — large transcripts are split into ordered parts instead.
- It does **not** claim an attachment was "transferred" when only its reference was.
- It does **not** press send in the destination chat. Insertion is verified; sending is yours.
- It does **not** use private APIs, hidden backend data, or anything beyond the visible page content you already have access to.
- It does **not** capture passwords, cookies, hidden system prompts, or anything outside the conversation.
- It cannot make a destination AI *understand* the context — it delivers the text and tells you exactly how far it got.

## Installation

**From source (developer mode):**

1. Clone or download this repository.
2. Run `npm install` (dev-only: fetches test tooling; the extension itself has zero runtime dependencies).
3. In Chromium browsers: open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the repository folder.
4. In Firefox: `about:debugging` → *This Firefox* → *Load Temporary Add-on* → select `manifest.json` (or install a packaged `dist/relay-firefox.zip`).

Log into the AI platforms you use — Relay reads the same pages you see, so it needs you to be signed in to see your conversations.

## Using Relay

1. **Chat normally.** Relay captures automatically on every supported platform. The toolbar badge shows how many messages are archived for that tab's conversation.
2. **Open the panel** — click the floating Relay button or press `Alt+R`. The panel shows context health: the conversation, how many messages are archived, capture completeness, and last update.
3. **Pick a destination.** Search the platform list, choose a context mode (below), and click a platform. A **transfer preview** shows message coverage, part count, size, attachment status, and completeness before anything is sent.
4. **Confirm.** Relay opens the destination platform and inserts the first part into the composer (if you left auto-insert on). Review it and press send yourself.
5. **For multi-part transfers**, the panel on the destination walks you through: insert part, send it, confirm sent, insert the next. Progress dots track exactly how far you are, and any part can be retried.

## Transfer modes

| Mode | What it sends | When to use |
|------|--------------|-------------|
| **Full transcript** | Every archived message, in one message | The transcript fits the destination's input |
| **In parts** | The full transcript, split into ordered, labeled parts ("Part 2 of 5", with message ranges) | Long conversations; nothing is dropped, code blocks are seam-mended across part boundaries |
| **Recent only** | The most recent N messages, with an explicit disclosure of what was omitted | The destination has a strict input limit and you accept a scoped continuation |

Full-transcript mode switches to parts automatically when the text exceeds the part size — the preview always tells you which will happen. "Recent only" is never presented as a full transfer; the destination is told in plain text that older messages were omitted.

## Context health and completeness

Because some platforms virtualize long conversations (only rendering the visible portion), Relay reports capture status honestly:

- **Live capture** — Relay is capturing the conversation, but hasn't verified the very top of the thread. Run *Capture full conversation* to verify.
- **Partial** — some archived messages weren't visible on the page. The panel explains what to do.
- **Full conversation captured** — the *Capture full conversation* operation scrolled the thread to the top and reconciled every rendered turn into the archive. This operation only scrolls the conversation container: it never clicks, sends, or navigates, it restores your scroll position, and you can cancel it at any time without losing anything already captured.

## Attachments

Relay records what a message references: filename, type, size when known, alt/caption, and the source URL — with an explicit status: `reference`, `captured`, `unsupported`, `missing`, or `transfer-failed`. By default, only references are kept. If you enable *Store attachment files locally* (off by default), Relay additionally downloads same-origin attachment bytes into the archive when the site allows it. Transfers always disclose attachment status — a file reference is never claimed as file contents.

## The archive

The Archive page (toolbar popup → *Browse archive*, or the panel's *Archive* button) lets you:

- browse and search conversations by title **and message content**;
- review every captured message, including revision history;
- see capture completeness and attachment status per conversation;
- export a conversation (or everything) as lossless JSON or a readable Markdown transcript;
- import a previous export — validation and lossless merge (nothing existing is deleted);
- delete a single conversation, or all archives after a double confirmation. Deletion is scoped exactly to what you confirm; the live conversation on the platform is never touched.

Relay v2 automatically imports your v1 data (last session + history entries) the first time it runs, preserving every message v1 still had. v1 capped stored history; the archive says so explicitly instead of pretending the import was complete.

## Supported platforms

Detection and capture use each platform's real DOM (element-identity based — identical repeated messages are preserved). Platform adapters are selector-driven and degradable: if native selectors fail, a generic fallback captures what it can and **tells you** instead of silently transferring garbled text.

| Platform | Sites | Notes |
|----------|-------|-------|
| ChatGPT | chatgpt.com, chat.openai.com | first-class adapter |
| Claude | claude.ai | first-class adapter |
| Gemini | gemini.google.com | first-class adapter |
| AI Studio | aistudio.google.com | config adapter |
| Perplexity | perplexity.ai | config adapter |
| DeepSeek | chat.deepseek.com | config adapter |
| Grok | grok.com, grok.x.ai, x.com/i/grok | config adapter |
| Copilot | copilot.microsoft.com | config adapter |
| Meta AI | meta.ai | config adapter |
| Mistral | chat.mistral.ai | config adapter |
| HuggingChat | huggingface.co/chat | config adapter |
| Poe | poe.com | config adapter |
| Qwen / Tongyi | chat.qwen.ai, tongyi.aliyun.com | config adapter |

**Important:** adapters are tested against the live DOM structure at release time and against mock pages in CI. Sites redesign themselves; when an adapter's selectors stop matching, Relay falls back and warns you. Capture quality per site can drift at any time — the panel tells you when it isn't confident.

## Privacy and security

- **All data stays local.** Archive in the extension's own IndexedDB; settings in `chrome.storage.local`. `scripts/lint.js` fails the build on any network call (`fetch` is allowed in exactly one audited, annotated place for opt-in same-origin attachment download), `XMLHttpRequest`, WebSocket, `eval`, remote imports, or assigning scraped data to `innerHTML`.
- **Least privilege.** Manifest v3 with `storage` and `tabs` only, plus host permissions limited to the supported AI sites.
- **Message validation.** Every runtime message is type- and shape-checked and sender-verified in the background router.
- **Safe rendering.** Scraped content is rendered as text (`textContent`) everywhere; the only `innerHTML` uses are lint-enforced static templates.
- **Opt-in diagnostics.** Debug logging is off by default and logs counters and identifiers, never conversation content.
- Not encrypted at rest: the archive is stored in the browser's own per-extension-profile storage, which is isolated from other extensions and sites, but it is *not* encrypted — treat your browser profile accordingly. See `PRIVACY_POLICY.md` for the full data map.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+R` | Toggle the Relay panel on any supported AI site |
| `Tab` | Move through panel controls (focus is trapped while open) |
| `↑` / `↓` | Navigate the destination list |
| `Esc` | Close the panel (focus returns to the page) |
| Type in search | Filter destinations; `Esc` clears, `↓` enters the list |

## Troubleshooting

- **"Storage is full — the latest messages could NOT be saved"** — the failed batch was discarded atomically; your earlier archive is intact. Export a backup from the Archive page, free space, and capture resumes automatically on the next change.
- **"Some older messages were not visible"** — run *Capture full conversation* in the panel. If the platform refuses to load older messages, Relay says so instead of claiming completeness.
- **"Inserted but could not be verified"** — the destination editor accepted an insert but Relay couldn't read the expected text back. Check the composer before sending.
- **Fallback warning** — native selectors failed on that site; the generic parser captured what it could. Review the archive before transferring.
- **After upgrading from v1** — your old session and history entries are migrated automatically and marked as legacy imports.

## Known limitations

- Relay captures what the page renders. On virtualized platforms, messages that were never rendered while Relay was watching are only captured by the full-capture scroll operation; content the platform refuses to load cannot be obtained — honestly reported as `partial`.
- Some platforms keep one URL for all chats (e.g. Meta AI, Grok's web app). Relay disambiguates different conversations by content overlap, but two *completely* unrelated chats on such a platform may need manual review in the archive.
- Attachment bytes can only be captured for same-origin files, and only when you opt in. Everything else stays reference-only.
- Token counts are local estimates. Relay never claims to know a destination model's context window.
- Regenerating an answer in place is detected as a revision when the conversation anchors align; in ambiguous cases Relay keeps both versions rather than guessing.
- Firefox uses an MV3 event page; behavior is equivalent, but the service-worker lifecycle differs slightly from Chromium's.

## Development and validation

The toolchain is the Node standard library plus puppeteer (e2e) and fake-indexeddb (archive unit tests) — no bundler, no framework.

```bash
npm install               # dev tooling only

npm run lint              # syntax + manifest + privacy + innerHTML + parity audits
npm run test:unit         # 67 unit tests (reconcile, archive, handoff, storage, scrapers)
npm run pack:chrome       # build + validate dist/chrome (+ checksummed zip)
npm run test:e2e          # full browser flow on mock platforms (needs dist/chrome)
npm run pack:firefox      # Gecko-compatible build
npm run pack:source       # clean source archive
npm run validate          # lint + unit
```

The e2e suite loads the built extension into headless Chrome and verifies: capture of repeated identical turns, single-part switching, archive browsing/search/review, virtualized full capture with completeness verification, multi-part handoff with part progression, and popup/options rendering. `CHROME_PATH` overrides the browser binary.

## Project structure

```
relay-extension/
├── manifest.json              # MV3; storage+tabs only; 13 supported platforms
├── background.js              # Service worker: archive owner, validated router,
│                              #   migration, badges, transfer lifecycle
├── content/
│   ├── content.js             # Orchestrator: fingerprint change detection, batches
│   ├── floatingUI.js          # Shadow-DOM FAB + panel (health, modes, preview, parts)
│   ├── fullCapture.js         # Scroll-based full capture (scroll-only, cancellable)
│   ├── injector.js            # Transfer pickup + verified part insertion
│   └── platforms/             # Registry + adapters (element-identity, no text dedup)
├── utils/
│   ├── idb.js                 # Minimal IndexedDB wrapper (commit-only resolution)
│   ├── reconcile.js           # Sequence alignment: appends/edits/streaming/repeats
│   ├── archive.js             # Atomic capture, export/import, transfers, migration
│   ├── handoff.js             # Package builder: full/multipart/continuation + manifests
│   ├── dom.js                 # Structured extraction, attachments, verified injection
│   ├── storage.js             # Settings only (v1 keys migrated)
│   └── compress.js            # LZ-string (legacy v1 data decompression)
├── archive/                   # Archive browser page (review/search/export/import)
├── popup/                      # Toolbar popup
├── options/                    # Settings page
├── ui/tokens.css               # Shared design tokens (light/dark/system)
├── scripts/lint.js             # Syntax/manifest/privacy/innerHTML/parity audits
└── tests/                      # unit/ (node:test + fake-indexeddb), e2e/ (puppeteer)
```

## License

MIT — see [LICENSE](LICENSE).
