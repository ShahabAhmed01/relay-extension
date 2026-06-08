/**
 * Relay — Injector Manager
 * Handles injecting captured context into AI input fields on target platforms.
 */

const InjectorManager = (() => {
  const SCRAPERS = {
    chatgpt: typeof ChatGPTScraper !== 'undefined' ? ChatGPTScraper : null,
    claude: typeof ClaudeScraper !== 'undefined' ? ClaudeScraper : null,
    gemini: typeof GeminiScraper !== 'undefined' ? GeminiScraper : null,
    perplexity: typeof PerplexityScraper !== 'undefined' ? PerplexityScraper : null,
    deepseek: typeof DeepSeekScraper !== 'undefined' ? DeepSeekScraper : null,
    grok: typeof GrokScraper !== 'undefined' ? GrokScraper : null,
    copilot: typeof CopilotScraper !== 'undefined' ? CopilotScraper : null,
    metaai: typeof MetaAIScraper !== 'undefined' ? MetaAIScraper : null,
    mistral: typeof MistralScraper !== 'undefined' ? MistralScraper : null,
    huggingchat: typeof HuggingChatScraper !== 'undefined' ? HuggingChatScraper : null,
    poe: typeof PoeScraper !== 'undefined' ? PoeScraper : null,
    qwen: typeof QwenScraper !== 'undefined' ? QwenScraper : null,
  };

  const INJECTORS = {
    chatgpt: typeof ChatGPTInjector !== 'undefined' ? ChatGPTInjector : null,
    claude: typeof ClaudeInjector !== 'undefined' ? ClaudeInjector : null,
    gemini: typeof GeminiInjector !== 'undefined' ? GeminiInjector : null,
    perplexity: typeof PerplexityInjector !== 'undefined' ? PerplexityInjector : null,
    deepseek: typeof DeepSeekInjector !== 'undefined' ? DeepSeekInjector : null,
    grok: typeof GrokInjector !== 'undefined' ? GrokInjector : null,
    copilot: typeof CopilotInjector !== 'undefined' ? CopilotInjector : null,
    metaai: typeof MetaAIInjector !== 'undefined' ? MetaAIInjector : null,
    mistral: typeof MistralInjector !== 'undefined' ? MistralInjector : null,
    huggingchat: typeof HuggingChatInjector !== 'undefined' ? HuggingChatInjector : null,
    poe: typeof PoeInjector !== 'undefined' ? PoeInjector : null,
    qwen: typeof QwenInjector !== 'undefined' ? QwenInjector : null,
  };

  function getScraper(platformId) {
    return SCRAPERS[platformId] || (typeof GenericScraper !== 'undefined' ? GenericScraper : null);
  }

  function getInjector(platformId) {
    return INJECTORS[platformId] || (typeof GenericInjector !== 'undefined' ? GenericInjector : null);
  }

  async function checkAndInject() {
    if (typeof RelayStorage === 'undefined') return;

    const pending = await RelayStorage.getPendingInjection();
    if (!pending || !pending.formattedContext) return;

    const platform = typeof RelayPlatforms !== 'undefined'
      ? RelayPlatforms.detectPlatform(window.location.hostname)
      : null;

    const platformId = platform ? platform.id : 'generic';
    const injector = getInjector(platformId);
    if (!injector) return;

    if (pending.targetPlatformId && pending.targetPlatformId !== platformId) {
      return;
    }

    const maxWait = 8000;
    const intervals = [300, 600, 1200, 2400];
    let waited = 0;
    let injected = false;

    for (const interval of intervals) {
      if (waited >= maxWait) break;
      await new Promise(r => setTimeout(r, interval));
      waited += interval;

      if (injector.isReady()) {
        injected = await injector.injectText(pending.formattedContext);
        if (injected) break;
      }
    }

    if (!injected && injector.isReady()) {
      injected = await injector.injectText(pending.formattedContext);
    }

    await RelayStorage.clearPendingInjection();

    if (injected && typeof RelayToast !== 'undefined') {
      RelayToast.show('Context loaded — ready to continue', 'success');
    }
  }

  function injectIntoContentEditable(element, text) {
    if (!element) return false;
    element.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function injectIntoTextarea(element, text) {
    if (!element) return false;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(element, text);
    element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return true;
  }

  return {
    getScraper,
    getInjector,
    checkAndInject,
    injectIntoContentEditable,
    injectIntoTextarea,
  };
})();

if (typeof window !== 'undefined') {
  window.InjectorManager = InjectorManager;
}
