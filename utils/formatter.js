/**
 * Relay v1.1.0 — Formatter Utility
 * Char-budget aware, markdown-preserving, token estimate.
 */

var RelayFormatter = (function () {
  'use strict';

  function estimateTokens(text) {
    return Math.ceil(String(text || '').length / 4);
  }

  function pickMessages(session, settings) {
    var all = (session && session.messages) || [];
    var maxMessages = (settings && settings.maxMessages) || 30;
    var full = settings && settings.includeFullHistory === true;
    var maxChars = (settings && settings.maxChars) || 120000;
    var msgs = full ? all.slice() : all.slice(-maxMessages);
    // Enforce char budget from the front (keep most recent).
    var total = msgs.reduce(function (n, m) { return n + String(m.content || '').length; }, 0);
    while (msgs.length > 1 && total > maxChars) {
      total -= String(msgs[0].content || '').length;
      msgs = msgs.slice(1);
    }
    return { messages: msgs, totalCount: all.length, truncated: all.length > msgs.length };
  }
  function format(session, settings) {
    if (!session || !session.messages || session.messages.length === 0) return '';
    var picked = pickMessages(session, settings);
    var messages = picked.messages;
    var platformName = session.platformName || session.platformId || 'an AI';
    var output = '';
    output += 'You are continuing a conversation started on ' + platformName + '.\n';
    output += 'Context below is the prior transcript. Continue naturally from the last message.\n';
    output += 'If anything is ambiguous, ask a brief clarifying question and proceed.\n\n';
    output += '[CONVERSATION HISTORY — ' + messages.length + ' messages from ' + platformName + ']\n';
    output += '─────────────────────────────────────────────────\n\n';
    if (picked.truncated) {
      output += 'Note: showing last ' + messages.length + ' of ' + picked.totalCount + ' (budget-limited).\n\n';
    }
    messages.forEach(function (m) {
      var label = m.role === 'user' ? '👤 You' : '🤖 AI';
      output += label + ': ' + (m.content || '') + '\n\n';
    });

    output += '─────────────────────────────────────────────────\n';
    output += '[END OF HISTORY — continue from here]\n';
    return output;
  }

  function formatMarkdown(session, settings) {
    if (!session || !session.messages || !session.messages.length) return '';
    var picked = pickMessages(session, settings);
    var lines = ['# Relay export — ' + (session.platformName || session.platformId || ''), ''];
    lines.push('- Exported: ' + new Date(session.updatedAt || Date.now()).toISOString());
    lines.push('- Messages: ' + picked.messages.length + (picked.truncated ? ' (truncated from ' + picked.totalCount + ')' : ''));
    lines.push('');
    picked.messages.forEach(function (m, i) {
      lines.push('## ' + (m.role === 'user' ? 'User' : 'Assistant') + ' (' + (i + 1) + ')');
      lines.push('');
      lines.push(m.content || '');
      lines.push('');
    });
    return lines.join('\n');
  }

  function formatSummary(session) {
    if (!session || !session.messages || session.messages.length === 0) return 'No messages captured yet.';
    var last3 = session.messages.slice(-3);
    return last3.map(function (m) {
      var label = m.role === 'user' ? 'You' : 'AI';
      var preview = (m.content || '').substring(0, 80);
      return label + ': ' + preview + (m.content && m.content.length > 80 ? '...' : '');
    }).join('\n');
  }

  function timeAgo(timestamp) {
    if (!timestamp) return 'unknown';
    var seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    if (days < 30) return days + 'd ago';
    var months = Math.floor(days / 30);
    if (months < 12) return months + 'mo ago';
    return Math.floor(months / 12) + 'y ago';
  }

  return {
    format: format,
    formatMarkdown: formatMarkdown,
    pickMessages: pickMessages,
    estimateTokens: estimateTokens,
    formatSummary: formatSummary,
    timeAgo: timeAgo,
  };
})();

if (typeof window !== 'undefined') window.RelayFormatter = RelayFormatter;
if (typeof module !== 'undefined' && module.exports) module.exports = RelayFormatter;
