# Changelog

All notable changes to Relay are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Repository contribution and issue templates (`.github/CONTRIBUTING.md`, pull request template, bug report and feature request forms)
- `SECURITY.md` vulnerability reporting policy
- `Dependabot` configuration for npm and GitHub Actions (monthly, non-breaking by default)
- Custom repository description and topics

## [2.0.0] — Lossless IndexedDB archive, verified multi-part handoff, privacy audit

### Added
- Local, lossless IndexedDB archive of AI conversations (full message content, order, speaker attribution, edits with revision history, repeated identical messages preserved as separate turns)
- Transfer package builder with full transcript, multi-part, and "recent only" modes, each with coverage/size/attachment manifests
- Optional continuity brief (extractive quotations only, no invention)
- 13 platform adapters: ChatGPT, Claude, Gemini, AI Studio, Perplexity, DeepSeek, Grok, Copilot, Meta AI, Mistral, HuggingChat, Poe, Qwen/Tongyi
- Generic fallback scraper that degrades gracefully and warns when native selectors fail
- Virtualized-conversation full-capture scroll operation (scroll-only, cancellable, restores scroll position)
- Archive browser page: search by title and content, review revision history, export JSON/Markdown, import with lossless merge, delete with double confirmation
- v1 → v2 automatic legacy data import with truncation disclosed honestly
- Toolbar badge showing archived message count per conversation
- Keyboard shortcuts (Alt+R toggle panel, focus trapping, Esc close)
- Custom lint audit: syntax, manifest structure, privacy (no network except audited same-origin fetch), innerHTML safety, template constants, manifest/registry parity
- Cross-platform builds: Chrome (MV3 service worker), Firefox (event page), source archive, each with SHA-256 checksum
- Unit tests (67) and end-to-end tests (puppeteer, mock platforms)
- GitHub Actions CI: lint + unit + e2e + packaging
- Privacy Policy (`PRIVACY_POLICY.md`)
- MIT License

### Changed
- Rewrote capture/reconciliation layer as content-aware sequence alignment (append, stream, edit-as-revision, repeat-preserve)
- Rebuilt transfer handoff with verified insertion and part-by-part progression
- Hardened privacy: `fetch` allowed only in one audited, annotated location; all scraped content rendered as `textContent`
- Manifest v3 with `storage` and `tabs` permissions only; host permissions limited to supported AI sites

### Fixed
- Broken panel / floating action button
- `web_accessible_resources` match pattern error
- Grok platform URL (`grok.x.ai` → `grok.com`)

## [1.1.0] — Major refactor: deduplication, robustness, UX, build & tests

### Added
- Deduplication robustness (content never used as a dedup key; identical messages remain separate turns)
- Build tooling (`build-icons.js`, `build-package.js`)
- Unit test suite

### Changed
- Major refactor of capture and archive layers
- UX hardening across panel, popup, and options

## [1.0.0] — Initial open-source release

### Added
- Initial public release of Relay
