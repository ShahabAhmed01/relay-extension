# Security policy

## Supported versions

The current release of Relay is maintained. Older versions (v1.x) receive security fixes only as time permits.

| Version | Supported |
|---------|-----------|
| 2.x     | Yes       |
| 1.x     | No        |

## Reporting a vulnerability

If you discover a security issue in Relay, please report it responsibly.

**Do not** open a public GitHub issue for security vulnerabilities.

Send details to the repository owner through GitHub's private vulnerability reporting (the "Report a vulnerability" button on the Security tab), or open a private advisory if you have access.

Include:
- A clear description of the vulnerability
- Steps to reproduce
- The affected component and version
- Any mitigations you are aware of

## Scope

Relay is a client-side browser extension with no backend, no accounts, and no network calls (except one audited, opt-in same-origin fetch for attachment capture). The archive is stored in the browser's per-extension-profile IndexedDB and is **not encrypted at rest**.

Please do not test against live AI platforms or real user conversations.

## Disclosure

We will acknowledge your report and work with you to understand and address the issue. Fixes are released as a new version; there is no fixed timeline.

## Thank you

Thank you for helping keep Relay and its users safe.
