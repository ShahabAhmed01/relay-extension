/**
 * Relay v2 — Injection Manager.
 * Picks up active transfers for the current platform and inserts parts
 * into the destination composer. Insertion is VERIFIED; nothing is ever
 * submitted automatically — sending is always the user's action.
 */

var InjectorManager = (function () {
  'use strict';

  var RETRY_DELAYS = [400, 800, 1500, 2500, 4000];

  function g(n) {
    try {
      if (typeof window !== 'undefined' && window[n]) return window[n];
    } catch (_e) { /* ignore */ }
    return null;
  }

  function getScraper(platformId) {
    var map = {
      chatgpt: g('ChatGPTScraper'), claude: g('ClaudeScraper'), gemini: g('GeminiScraper'),
      aistudio: g('AIStudioScraper'), perplexity: g('PerplexityScraper'), deepseek: g('DeepSeekScraper'),
      grok: g('GrokScraper'), copilot: g('CopilotScraper'), metaai: g('MetaAIScraper'),
      mistral: g('MistralScraper'), huggingchat: g('HuggingChatScraper'),
      poe: g('PoeScraper'), qwen: g('QwenScraper'),
    };
    return map[platformId] || g('GenericScraper');
  }

  function getInjector(platformId) {
    var map = {
      chatgpt: g('ChatGPTInjector'), claude: g('ClaudeInjector'), gemini: g('GeminiInjector'),
      aistudio: g('AIStudioInjector'), perplexity: g('PerplexityInjector'), deepseek: g('DeepSeekInjector'),
      grok: g('GrokInjector'), copilot: g('CopilotInjector'), metaai: g('MetaAIInjector'),
      mistral: g('MistralInjector'), huggingchat: g('HuggingChatInjector'),
      poe: g('PoeInjector'), qwen: g('QwenInjector'),
    };
    return map[platformId] || g('GenericInjector');
  }

  function api() {
    return (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  }

  function send(message) {
    return api().runtime.sendMessage(message);
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /**
   * Insert one transfer part into the composer, with retries while the
   * page is still loading. Returns {injected, verified, reason}.
   */
  async function insertPartText(text) {
    var loc = currentLocation();
    var platform = (typeof RelayPlatforms !== 'undefined')
      ? RelayPlatforms.detectPlatform(loc.hostname, loc.pathname) : null;
    var platformId = platform ? platform.id : 'generic';
    var injector = getInjector(platformId);
    if (!injector) return { injected: false, verified: false, reason: 'no-injector' };
    for (var i = 0; i < RETRY_DELAYS.length; i++) {
      await sleep(RETRY_DELAYS[i]);
      try {
        if (injector.isReady && injector.isReady()) {
          await injector.injectText(text);
          var res = injector.lastResult || {};
          if (res.verified) return { injected: true, verified: true, reason: 'ok' };
          if (res.injected) return { injected: true, verified: false, reason: 'unverified' };
        }
      } catch (_e) { /* retry */ }
    }
    return { injected: false, verified: false, reason: 'not-ready' };
  }

  function currentLocation() {
    try {
      if (typeof window !== 'undefined' && window.location) {
        return { hostname: window.location.hostname, pathname: window.location.pathname };
      }
    } catch (_e) { /* non-browser */ }
    return { hostname: '', pathname: '' };
  }

  /**
   * Boot-time pickup: if a transfer is waiting for this platform, insert
   * the next pending part (when auto-insert is enabled) and report state
   * so the panel can offer the rest of the flow.
   */
  async function checkAndInject() {
    if (typeof RelayStorage === 'undefined') return { pickedUp: false, reason: 'no-storage' };
    var loc = currentLocation();
    var platform = (typeof RelayPlatforms !== 'undefined')
      ? RelayPlatforms.detectPlatform(loc.hostname, loc.pathname) : null;
    if (!platform) return { pickedUp: false, reason: 'unsupported' };

    var resp;
    try {
      resp = await send({ type: 'GET_ACTIVE_TRANSFER', platformId: platform.id });
    } catch (_e) {
      return { pickedUp: false, reason: 'background-unavailable' };
    }
    var transfer = resp && resp.ok ? resp.transfer : null;
    if (!transfer) return { pickedUp: false, reason: 'none' };

    var nextIndex = -1;
    for (var i = 0; i < transfer.parts.length; i++) {
      if (transfer.parts[i].status === 'pending') { nextIndex = i; break; }
    }
    if (nextIndex < 0) return { pickedUp: true, transfer: transfer, reason: 'all-parts-delivered' };

    var settings = await RelayStorage.getSettings();
    if (!settings.autoInsert) {
      return { pickedUp: true, transfer: transfer, reason: 'auto-insert-disabled', nextPart: nextIndex };
    }

    var partResp = await send({ type: 'GET_TRANSFER_PART', transferId: transfer.id, partIndex: nextIndex });
    if (!partResp || !partResp.ok) return { pickedUp: true, transfer: transfer, reason: 'part-unavailable' };

    var result = await insertPartText(partResp.part.text);
    if (result.injected) {
      await send({ type: 'MARK_TRANSFER_PART', transferId: transfer.id, partIndex: nextIndex, status: 'inserted' });
      return {
        pickedUp: true, transfer: transfer, insertedPart: nextIndex,
        verified: result.verified, reason: result.verified ? 'inserted' : 'inserted-unverified',
      };
    }
    return { pickedUp: true, transfer: transfer, reason: 'insert-failed', nextPart: nextIndex };
  }

  return {
    getScraper: getScraper,
    getInjector: getInjector,
    checkAndInject: checkAndInject,
    insertPartText: insertPartText,
  };
})();

if (typeof window !== 'undefined') window.InjectorManager = InjectorManager;
if (typeof module !== 'undefined' && module.exports) module.exports = InjectorManager;
