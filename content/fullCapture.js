/**
 * Relay v2 — Full-conversation capture for virtualized chats.
 *
 * Many platforms render only the visible portion of a long conversation.
 * This module walks the scroll container upward, letting the platform
 * load older messages, reconciling each rendered window into the archive.
 *
 * Safety rules:
 *  - Only scrolls the conversation container. Never clicks, never
 *    submits, never navigates.
 *  - Preserves and restores the user's scroll position.
 *  - Cancellable at any point; everything captured so far is kept.
 *  - Reports honestly whether the top of the conversation was reached.
 */

var RelayFullCapture = (function () {
  'use strict';

  var ITERATION_LIMIT = 400;
  var SETTLE_MS = 350;
  var MAX_STALLS = 4;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /**
   * Find the scrollable container for the conversation: the adapter's
   * hint first, then the nearest ancestor of a message node that
   * actually scrolls.
   */
  function findScrollContainer(hint) {
    if (hint) {
      try {
        var el = (typeof hint === 'string') ? document.querySelector(hint) : hint();
        if (el && el.scrollHeight > el.clientHeight) return el;
      } catch (_e) { /* fall through */ }
    }
    var probe = document.querySelector('[data-message-author-role], [data-testid="human-message"], user-query, model-response, [class*="message"], article');
    var node = probe;
    while (node && node !== document.body) {
      if (node.scrollHeight > node.clientHeight + 8) {
        var style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY)) return node;
      }
      node = node.parentElement;
    }
    // Some platforms scroll the window itself.
    if (document.documentElement.scrollHeight > window.innerHeight + 8) return document.scrollingElement || document.documentElement;
    return null;
  }

  /**
   * Run a full capture.
   *
   * opts: {
   *   scrape: function () -> messages          (adapter scrape)
   *   onBatch(messages) -> Promise             (persist one window)
   *   onProgress({captured, iterations, done, reachedTop})
   *   isCancelled() -> bool
   *   scrollHint                                (adapter container hint)
   * }
   * Returns {captured, reachedTop, iterations, reason}.
   */
  async function run(opts) {
    var scrape = opts.scrape || function () { return []; };
    var onBatch = opts.onBatch || function () { return Promise.resolve(); };
    var isCancelled = opts.isCancelled || function () { return false; };
    var onProgress = opts.onProgress || function () {};

    var container = findScrollContainer(opts.scrollHint);
    if (!container) {
      // No scrollable region: the DOM holds whatever it holds. Capture the
      // current window once and report that we could not traverse upward.
      var current = scrape() || [];
      if (current.length) await onBatch(current);
      onProgress({ captured: current.length, iterations: 1, done: true, reachedTop: false });
      return { captured: current.length, reachedTop: false, iterations: 1, reason: 'no-scroll-container' };
    }

    var restoreX = window.scrollX, restoreY = window.scrollY;
    var innerTop = container.scrollTop;
    var iterations = 0;
    var stalls = 0;
    var lastCount = -1;
    var reachedTop = false;
    var reason = 'completed';
    var capturedTotal = 0;

    try {
      // Start from wherever the user is; capture the current window first.
      var first = scrape() || [];
      if (first.length) {
        await onBatch(first);
        capturedTotal = first.length;
      }

      while (iterations < ITERATION_LIMIT) {
        if (isCancelled()) { reason = 'cancelled'; break; }
        iterations++;

        // Scroll to the top of the container in measured steps so the
        // platform keeps loading older turns.
        container.scrollTop = 0;
        await sleep(SETTLE_MS);
        var scrollTopNow = container.scrollTop;
        var batch = scrape() || [];
        if (batch.length) {
          await onBatch(batch);
          capturedTotal = Math.max(capturedTotal, batch.length);
        }
        onProgress({ captured: capturedTotal, iterations: iterations, done: false, reachedTop: false });

        if (scrollTopNow <= 0) {
          // Physically at the top; give the platform a moment to load more.
          var grown = scrape() || [];
          if (grown.length !== lastCount) {
            lastCount = grown.length;
            if (grown.length) {
              await onBatch(grown);
              capturedTotal = Math.max(capturedTotal, grown.length);
            }
            await sleep(SETTLE_MS);
            if (container.scrollTop > 0) continue; // content pushed down = more loaded
            stalls = 0;
          }
          stalls++;
          if (stalls >= MAX_STALLS) {
            reachedTop = true;
            reason = 'completed';
            break;
          }
          await sleep(SETTLE_MS);
        } else {
          // Platform reset our scroll (some do); retry via keyboard-free
          // scrollTop steps from the current offset.
          container.scrollTop = Math.max(0, container.scrollTop - container.clientHeight * 0.9);
          await sleep(SETTLE_MS);
        }
      }
      if (iterations >= ITERATION_LIMIT && reason === 'completed') reason = 'iteration-limit';
    } finally {
      // Restore the user's position.
      try {
        container.scrollTop = innerTop;
        window.scrollTo(restoreX, restoreY);
      } catch (_e) { /* best effort */ }
      onProgress({ captured: capturedTotal, iterations: iterations, done: true, reachedTop: reachedTop });
    }

    return { captured: capturedTotal, reachedTop: reachedTop, iterations: iterations, reason: reason };
  }

  return { run: run, findScrollContainer: findScrollContainer };
})();

if (typeof window !== 'undefined') window.RelayFullCapture = RelayFullCapture;
