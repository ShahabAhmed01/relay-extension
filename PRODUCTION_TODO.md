# Relay Chrome Web Store Production TODO

Current state after implementation started:
- `manifest.json` has been converted to Chrome Manifest V3.
- `background.js` has been replaced with a Chrome MV3 service worker that allowlists platform IDs before opening tabs.
- `utils/storage.js` is currently being replaced and must be restored before testing or packaging.

## Must Finish Before Chrome Web Store Upload

1. Restore and harden `utils/storage.js`.
   - Preserve `RelayStorage` public API used by content, popup, and options scripts.
   - Keep `KEYS`, `DEFAULT_SETTINGS`, `saveSession`, `getSession`, `clearSession`, `setPendingInjection`, `getPendingInjection`, `clearPendingInjection`, `getSettings`, `saveSettings`, `addToHistory`, `getHistory`, `clearHistory`, `getStorageUsage`, and `exportAll`.
   - Normalize `maxMessages` to a safe integer between 5 and 100.
   - Apply `maxMessages` to stored sessions unless `includeFullHistory` is enabled.
   - Cap session payload size safely below Chrome storage quota.
   - Store `targetPlatformId`, `formattedContext`, and `timestamp` for pending injection.
   - Expire stale pending injection after 5 minutes.

2. Fix formatting behavior in `utils/formatter.js`.
   - Honor `includeFullHistory`.
   - Honor normalized `maxMessages`.
   - Keep output safe plain text.

3. Fix pending injection in `content/injector.js`.
   - Detect current platform.
   - Inject only when current platform ID matches `pending.targetPlatformId`.
   - Clear stale pending context.
   - Do not clear wrong-target pending context.
   - Clear pending context after successful target injection.

4. Fix switching behavior in `content/floatingUI.js`.
   - Honor `confirmBeforeSwitch`.
   - Send `{ type: 'OPEN_PLATFORM', platformId }` instead of a raw URL.
   - Handle a failed background response by clearing pending injection and showing an error.

5. Update Chrome-only release docs.
   - Remove or defer Firefox publishing claims from README.
   - Correct the privacy claim that `chrome.storage.local` is OS-encrypted.
   - State that data is local to the browser profile and not sent by extension code.

6. Add clean Chrome packaging.
   - Replace broad ZIP scripts in `package.json`.
   - Add a package builder that creates `dist/chrome` and `dist/relay-chrome.zip`.
   - Include only publishable files used by `manifest.json`.
   - Exclude `manifest.firefox.json`, `node_modules`, backup files, build scripts if not needed, `panel/`, and this TODO file from the release ZIP.

7. Validate production build.
   - Parse `manifest.json` and `package.json`.
   - Run JS syntax checks for all scripts included in the Chrome package.
   - Test compression round-trip.
   - Test sanitization.
   - Test formatter full-history and max-message behavior.
   - Test pending injection target and expiry behavior.
   - Test background platform ID allowlist behavior through static or simulated checks.
   - Validate PNG icon dimensions.
   - Build and inspect final ZIP contents.

8. Manual browser checks still required if Chrome cannot be launched here.
   - Load `dist/chrome` unpacked in Chrome.
   - Confirm no manifest or service-worker errors.
   - Test capture, panel open, copy, clear, switch, and injection on the supported AI platforms.
   - Chrome Web Store approval itself remains dependent on Google's review.
