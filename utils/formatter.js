/**
 * Relay — Formatter Utility
 * Formats captured conversation context for injection into another AI.
 */

const RelayFormatter = (() => {
  function format(session, settings) {
    if (!session || !session.messages || session.messages.length === 0) {
      return '';
    }

    const maxMessages = (settings && settings.maxMessages) || 30;
    const includeFullHistory = settings && settings.includeFullHistory === true;
    const totalCount = session.messages.length;
    const messages = includeFullHistory ? session.messages : session.messages.slice(-maxMessages);
    const platformName = session.platformName || session.platformId || 'an AI';

    let output = '';

    output += 'You are continuing a conversation that was started on ' + platformName + '.\n';
    output += 'The previous AI hit its usage limit. Here is the full conversation history.\n';
    output += 'Please continue naturally from where it left off.\n\n';

    output += '[CONVERSATION HISTORY — ' + messages.length + ' messages from ' + platformName + ']\n';
    output += '─────────────────────────────────────────────────\n\n';

    if (totalCount > messages.length) {
      output += 'Note: Showing last ' + messages.length + ' of ' + totalCount + ' messages.\n\n';
    }

    messages.forEach((m) => {
      const label = m.role === 'user' ? '👤 You' : '🤖 AI';
      output += label + ': ' + (m.content || '') + '\n\n';
    });

    output += '─────────────────────────────────────────────────\n';
    output += '[END OF HISTORY — Please continue from here]\n';

    return output;
  }

  function formatSummary(session) {
    if (!session || !session.messages || session.messages.length === 0) {
      return 'No messages captured yet.';
    }

    const last3 = session.messages.slice(-3);
    return last3.map((m) => {
      const label = m.role === 'user' ? 'You' : 'AI';
      const preview = (m.content || '').substring(0, 80);
      return label + ': ' + preview + (m.content && m.content.length > 80 ? '...' : '');
    }).join('\n');
  }

  function timeAgo(timestamp) {
    if (!timestamp) return 'unknown';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    return days + 'd ago';
  }

  return {
    format,
    formatSummary,
    timeAgo,
  };
})();

if (typeof window !== 'undefined') {
  window.RelayFormatter = RelayFormatter;
}
