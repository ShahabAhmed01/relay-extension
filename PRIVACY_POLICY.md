# Privacy Policy for Relay — AI Context Bridge

**Effective Date:** October 12, 2026

Relay ("the extension") is a local-only browser extension. This policy explains precisely what data Relay handles, where it is stored, and what is never collected. Relay has no servers, no accounts, no analytics, and no telemetry — this is enforced by an automated audit (`scripts/lint.js`) that runs in CI and fails the build on any network call.

## 1. What Relay accesses

While you use a supported AI website (ChatGPT, Claude, Gemini, and others listed in the README), Relay's content scripts read the **visible conversation content of that page** — the same text you can see:

- Your messages and the AI's responses, in order.
- Formatting of that text (paragraphs, lists, code blocks, tables as rendered).
- Metadata about attachments the conversation references (filename, type, size, alt text, and the file's URL), and — only if you explicitly enable the setting — the file bytes themselves, downloaded from the same site the conversation is on.
- The page's title and URL, used to identify which conversation is which.

Relay does **not** capture: passwords or credentials, cookies or authentication tokens, browser history, content from unrelated pages or sites, hidden system/developer prompts, invisible backend data, or anything beyond the visible page content you already have access to. Relay never bypasses access controls.

## 2. Where the data lives

**Entirely on your device:**

- **Conversation archive** (all captured messages, attachment records, transfer state) is stored in **IndexedDB** inside the extension's own browser-profile storage. Only this extension can read it.
- **Settings** (preferences, per-platform pause flags) are stored in `chrome.storage.local`.

The archive is **not encrypted at rest**. It is isolated by the browser from other extensions and websites, but anyone with access to your unlocked browser profile can read it — exactly like your browser history. Relay never claims otherwise.

## 3. What Relay does with the data

The archive is used to build **transfer packages**: formatted transcripts that you choose to insert into a destination AI platform's composer. That is the only outbound path for your data, and you initiate it:

- Relay inserts the text into the destination site's chat box; **you** press send. Relay never submits a message on its own.
- Before any transfer, a preview shows exactly what will be included.
- Exported files (JSON/Markdown) are generated locally and downloaded only when you click Export.

Relay makes **no network requests** anywhere, with one audited exception: if you enable *Store attachment files locally*, the content script fetches attachment bytes **from the same site the conversation is on**, for files the conversation itself references. Cross-site downloads are not performed.

## 4. What Relay never does

- No data transmission to servers, databases, or third parties — there is nothing to transmit to.
- No analytics, telemetry, crash reporting, or usage tracking.
- No advertising or data sale.
- No remote code execution; all code ships with the extension.
- No use of private or hidden platform APIs.

## 5. Your control and deletion

You can, at any time, from Relay's UI:

- **Pause capture** globally or per platform.
- **Review** every archived message on the Archive page.
- **Export** a lossless backup (JSON) or a readable transcript (Markdown) of any conversation or everything.
- **Import** a previous export with lossless merge.
- **Delete** a single conversation, or all archives — each with explicit, scoped confirmations. Deletion removes the conversation's messages and attachment records. It never touches the live conversations on the AI platforms, and your settings are kept.

Uninstalling the extension deletes the archive and settings with the extension's profile storage.

## 6. Permissions and why

- `storage` — settings and the archive.
- `tabs` — open a destination platform when you confirm a switch, and show per-tab badge counts.
- Host permissions for the supported AI sites — reading the visible conversation on those sites and inserting text into their composers. Nothing else.

The permission list is audited by CI against an allowlist; any addition requires a documented justification.

## 7. Security measures

- All runtime messages are type-, shape-, and sender-validated in the background router.
- Scraped content is rendered as text (`textContent`) throughout; `innerHTML` assignments are restricted by lint to static templates.
- Debug logging is opt-in, off by default, and logs counters and identifiers — never conversation content.
- Capture batches are atomic: a failed write never corrupts or partially replaces the archive.

## 8. Children's privacy

Relay does not knowingly collect any personal information from anyone, of any age, beyond the conversation content described above — which is stored only on the user's own device.

## 9. Changes to this policy

Updates will be posted in this repository. Material changes to what is accessed will also be reflected in the extension's permission prompts.

## 10. Contact

Questions or concerns: please open an issue in the GitHub repository.

---

*Summary: Relay reads your visible AI conversations, stores them on your device, and puts them where you tell it to. It has no servers, no analytics, and no way to see anything you don't already see yourself.*
