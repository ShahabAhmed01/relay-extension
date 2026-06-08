/**
 * Relay — Platform Registry
 * Detects which AI platform the user is on and provides the correct scraper/injector.
 */

const RelayPlatforms = (() => {
  const PLATFORMS = [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      url: 'https://chatgpt.com',
      matches: ['chat.openai.com', 'chatgpt.com'],
      color: '#10a37f',
      logoSvg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" fill="#10a37f"/></svg>',
    },
    {
      id: 'claude',
      name: 'Claude',
      url: 'https://claude.ai',
      matches: ['claude.ai'],
      color: '#d97706',
      logoSvg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.714 11.563l1.967 4.88 1.837-4.52.023-.058.507-1.248-2.347-5.82-2.01 6.766h.023zm-.596 1.694L2.37 18.024h2.54l1.063-2.89-1.855-4.877zm9.025-3.291l1.967 4.88 1.837-4.52.023-.058.507-1.248-2.347-5.82-2.01 6.766h.023zm-.596 1.694l-1.748 4.767h2.54l1.063-2.89-1.855-4.877zm-4.046-1.694l1.967 4.88 1.837-4.52.023-.058.507-1.248-2.347-5.82-2.01 6.766h.023zm-.596 1.694L6.157 16.427h2.54l1.063-2.89-1.855-4.877z" fill="#d97706"/></svg>',
    },
    {
      id: 'gemini',
      name: 'Gemini',
      url: 'https://gemini.google.com',
      matches: ['gemini.google.com'],
      color: '#4285f4',
      logoSvg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 24C12 20.8174 10.7357 17.7652 8.48528 15.5147C6.23484 13.2643 3.18261 12 0 12C3.18261 12 6.23484 10.7357 8.48528 8.48528C10.7357 6.23484 12 3.18261 12 0C12 3.18261 13.2643 6.23484 15.5147 8.48528C17.7652 10.7357 20.8174 12 24 12C20.8174 12 17.7652 13.2643 15.5147 15.5147C13.2643 17.7652 12 20.8174 12 24Z" fill="url(#gemini-grad)"/><defs><linearGradient id="gemini-grad" x1="0" y1="0" x2="24" y2="24"><stop stop-color="#4285f4"/><stop offset="0.5" stop-color="#9b72f1"/><stop offset="1" stop-color="#d96570"/></linearGradient></defs></svg>',
    },
    {
      id: 'perplexity',
      name: 'Perplexity',
      url: 'https://www.perplexity.ai',
      matches: ['www.perplexity.ai', 'perplexity.ai'],
      color: '#20808d',
      logoSvg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 1L2 6.5V17.5L12 23L22 17.5V6.5L12 1ZM12 3.311L19.09 7.26L12 11.21L4.91 7.26L12 3.311ZM4 9.066L11 12.98V20.43L4 16.514V9.066ZM13 20.43V12.98L20 9.066V16.514L13 20.43Z" fill="#20808d"/></svg>',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      url: 'https://chat.deepseek.com',
      matches: ['chat.deepseek.com'],
      color: '#4D6BFE',
      logoSvg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5zm4 4h-2v-2h2v2zm0-4h-2V7h2v5z" fill="#4D6BFE"/></svg>',
    },
    {
      id: 'grok',
      name: 'Grok',
      url: 'https://grok.com',
      matches: ['grok.com', 'grok.x.ai', 'x.com'],
      color: '#1d9bf0',
      logoSvg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2L12.77 14.57L8.5 20H11.5L14.27 16.35L18.5 22H22L14.97 12.43L19 7H16L13.47 10.35L9.5 5H6L12.73 13.57L9 20" stroke="#1d9bf0" stroke-width="1.5" fill="none"/></svg>',
    },
    {
      id: 'copilot',
      name: 'Copilot',
      url: 'https://copilot.microsoft.com',
      matches: ['copilot.microsoft.com'],
      color: '#0078d4',
      logoSvg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#0078d4"/></svg>',
    },
    {
      id: 'metaai',
      name: 'Meta AI',
      url: 'https://www.meta.ai',
      matches: ['www.meta.ai', 'meta.ai'],
      color: '#0081fb',
      logoSvg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 3a3 3 0 110 6 3 3 0 010-6zm0 14.2a7.2 7.2 0 01-6-3.22c.03-1.99 4-3.08 6-3.08s5.97 1.09 6 3.08a7.2 7.2 0 01-6 3.22z" fill="#0081fb"/></svg>',
    },
    {
      id: 'mistral',
      name: 'Mistral',
      url: 'https://chat.mistral.ai',
      matches: ['chat.mistral.ai'],
      color: '#ff7000',
      logoSvg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 3h4v4H3V3zm7 0h4v4h-4V3zm7 0h4v4h-4V3zM3 10h4v4H3v-4zm7 0h4v4h-4v-4zm7 0h4v4h-4v-4zM3 17h4v4H3v-4zm7 0h4v4h-4v-4zm7 0h4v4h-4v-4z" fill="#ff7000"/></svg>',
    },
    {
      id: 'huggingchat',
      name: 'HuggingChat',
      url: 'https://huggingface.co/chat',
      matches: ['huggingface.co'],
      color: '#ff9d00',
      logoSvg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#ff9d00"/></svg>',
    },
    {
      id: 'poe',
      name: 'Poe',
      url: 'https://poe.com',
      matches: ['poe.com'],
      color: '#5f2eea',
      logoSvg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L19 8l-7 3.5L5 8l7-3.5zM4 9.5l7 3.5v7l-7-3.5v-7zm9 10.5v-7l7-3.5v7l-7 3.5z" fill="#5f2eea"/></svg>',
    },
    {
      id: 'qwen',
      name: 'Qwen',
      url: 'https://chat.qwen.ai',
      matches: ['chat.qwen.ai', 'tongyi.aliyun.com'],
      color: '#615ced',
      logoSvg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="#615ced"/></svg>',
    },
  ];

  function detectPlatform(hostname) {
    if (!hostname) return null;
    const host = hostname.toLowerCase().replace(/^www\./, '');
    for (const platform of PLATFORMS) {
      for (const match of platform.matches) {
        const m = match.toLowerCase().replace(/^www\./, '');
        if (host === m || host.endsWith('.' + m)) {
          return platform;
        }
      }
    }
    return null;
  }

  function getPlatformById(id) {
    return PLATFORMS.find(p => p.id === id) || null;
  }

  function getAllPlatforms() {
    return PLATFORMS;
  }

  return {
    PLATFORMS,
    detectPlatform,
    getPlatformById,
    getAllPlatforms,
  };
})();

if (typeof window !== 'undefined') {
  window.RelayPlatforms = RelayPlatforms;
}
