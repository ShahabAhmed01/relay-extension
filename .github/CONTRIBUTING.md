# Contributing to Relay

Thank you for considering a contribution to Relay. Relay is a browser extension that captures AI conversations into a local, lossless archive and hands context off between AI platforms. It is intentionally small, dependency-free at runtime, and privacy-first.

## How to contribute

1. **Find or file an issue.** Check the open issues first. If you want to work on something, comment on the issue so others know it is taken.
2. **Fork the repo** and create a branch from `master`.
3. **Make your change.** Follow the existing code style. All JavaScript is syntax-checked by `scripts/lint.js`.
4. **Run validation.** `npm run validate` must pass (lint + 67 unit tests).
5. **Open a draft pull request.** Describe what changed, why, and how you tested it. A maintainer will review.

## Development setup

Prerequisites:
- Node.js >= 18
- A Chromium-based browser (Chrome/Edge) or Firefox for manual testing

```bash
# Clone your fork
git clone https://github.com/<your-username>/relay-extension.git
cd relay-extension

# Install dev tooling only (the extension has zero runtime dependencies)
npm install

# Run lint + unit tests
npm run validate

# Build a Chrome package
npm run pack:chrome

# Load the extension
# Chromium: chrome://extensions -> Developer mode -> Load unpacked -> select this folder
# Firefox: about:debugging -> This Firefox -> Load Temporary Add-on -> select manifest.json
```

## Available scripts

| Script | Purpose |
|--------|---------|
| `npm install` | Install dev tooling (puppeteer, fake-indexeddb, sharp) |
| `npm run lint` | Syntax + manifest + privacy + innerHTML + template + parity audits |
| `npm run test:unit` | 67 unit tests (reconcile, archive, handoff, storage, scrapers) |
| `npm run validate` | lint + unit tests |
| `npm run pack:chrome` | Build + validate dist/chrome (checksummed zip) |
| `npm run pack:firefox` | Gecko-compatible build |
| `npm run pack:source` | Clean source archive |
| `npm run test:e2e` | Full browser flow on mock platforms (needs dist/chrome + Chrome) |

## What we look for

- **Privacy first.** Relay must never make network calls except the one audited, annotated, opt-in same-origin fetch for attachment capture. `scripts/lint.js` enforces this and will fail the build on violations.
- **No silent failures.** Capture, storage, and transfer errors are reported honestly, never swallowed.
- **Lossless.** Repeated identical messages are kept as separate turns; edits are revisions, not overwrites.
- **Platform adapters are degradable.** If a site's selectors change, the generic fallback captures what it can and warns.

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml). Include:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Browser and extension version
- Redacted logs only — never paste conversation content

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
