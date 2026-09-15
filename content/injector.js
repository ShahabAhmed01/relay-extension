/**
 * Relay v1.1.0 — Injector Manager
 * Retry-safe injection: pending is kept until success / attempts exhausted.
 */

var InjectorManager = (function () {
  'use strict';

  var MAX_ATTEMPTS = 6;

  function pick(map, id, generic) {
    if (map[id]) return map[id];
    return generic || null;
  }
  function g(n) { try { return typeof window !== 'undefined' ? window[n] : null; } catch (_e) { return null; } }

  function getScraper(platformId) {
    var map = {
      chatgpt: g('ChatGPTScraper'), claude: g('ClaudeScraper'), gemini: g('GeminiScraper'),
      aistudio: g('AIStudioScraper'), perplexity: g('PerplexityScraper'), deepseek: g('DeepSeekScraper'),
      grok: g('GrokScraper'), copilot: g('CopilotScraper'), metaai: g('MetaAIScraper'),
      mistral: g('MistralScraper'), huggingchat: g('HuggingChatScraper'),
      poe: g('PoeScraper'), qwen: g('QwenScraper'),
    };
    return pick(map, platformId, g('GenericScraper'));
  }

  function getInjector(platformId) {
    var map = {
      chatgpt: g('ChatGPTInjector'), claude: g('ClaudeInjector'), gemini: g('GeminiInjector'),
      aistudio: g('AIStudioInjector'), perplexity: g('PerplexityInjector'), deepseek: g('DeepSeekInjector'),
      grok: g('GrokInjector'), copilot: g('CopilotInjector'), metaai: g('MetaAIInjector'),
      mistral: g('MistralInjector'), huggingchat: g('HuggingChatInjector'),
      poe: g('PoeInjector'), qwen: g('QwenInjector'),
    };

    return pick(map, platformId, g('GenericInjector'));
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function checkAndInject() {
    if (typeof RelayStorage === 'undefined') return { injected: false, reason: 'no-storage' };
    var settings = null;
    try { settings = await RelayStorage.getSettings(); } catch (_e) {}
    if (settings && settings.autoInject === false) return { injected: false, reason: 'disabled' };
    var pending = await RelayStorage.getPendingInjection();
    if (!pending || !pending.formattedContext) return { injected: false, reason: 'empty' };

    var platform = (typeof RelayPlatforms !== 'undefined')
      ? RelayPlatforms.detectPlatform(window.location.hostname) : null;
    var platformId = platform ? platform.id : 'generic';
    var injector = getInjector(platformId);
    if (!injector) return { injected: false, reason: 'no-injector' };
    if (pending.targetPlatformId && pending.targetPlatformId !== platformId) {
      return { injected: false, reason: 'wrong-target' };
    }
    var intervals = [400, 800, 1500, 2500, 4000];
    var injected = false;
    for (var i = 0; i < intervals.length; i++) {
      await sleep(intervals[i]);
      try {
        if (injector.isReady && injector.isReady()) {
          injected = await injector.injectText(pending.formattedContext);
          if (injected) break;
        }
      } catch (_e) {}
    }
    if (injected) {
      await RelayStorage.clearPendingInjection();
      if (typeof RelayToast !== 'undefined') {
        try { RelayToast.show('Context loaded — ready to continue', 'success'); } catch (_e2) {}
      }
      return { injected: true };
    }
    // Keep pending for the retry alarm; count attempts so we eventually expire.
    try {
      var p = await RelayStorage.bumpPendingAttempts();
      if (p && (p.attempts || 0) >= MAX_ATTEMPTS) {
        await RelayStorage.clearPendingInjection();
        if (typeof RelayToast !== 'undefined') {
          try { RelayToast.show('Relay: could not find the chat box — click Copy in the popup instead.', 'warning', 6000); } catch (_e3) {}
        }
        return { injected: false, reason: 'exhausted' };
      }
    } catch (_e4) {}
    return { injected: false, reason: 'not-ready' };
  }

  function injectIntoContentEditable(element, text) {
    if (!element) return false;
    try {
      if (typeof RelayDOM !== 'undefined') return RelayDOM.insertIntoEditable(element, text);
    } catch (_e) {}
    try {
      element.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch (_e2) { return false; }
  }

  function injectIntoTextarea(element, text) {
    if (!element) return false;
    try {
      if (typeof RelayDOM !== 'undefined') { RelayDOM.setNativeValue(element, text); return true; }
    } catch (_e) {}
    try {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch (_e2) { return false; }
  }

  return {
    getScraper: getScraper, getInjector: getInjector,
    checkAndInject: checkAndInject,
    injectIntoContentEditable: injectIntoContentEditable,
    injectIntoTextarea: injectIntoTextarea,
  };
})();

if (typeof window !== 'undefined') window.InjectorManager = InjectorManager;
if (typeof module !== 'undefined' && module.exports) module.exports = InjectorManager;
