/**
 * Relay v2 — Archive browser page.
 * Browse, search, review, export, import and delete archived
 * conversations. All archive access goes through the background service
 * worker; nothing here touches storage directly.
 */

(async function () {
  'use strict';

  const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const send = (msg) => api.runtime.sendMessage(msg);

  const $ = (id) => document.getElementById(id);

  function toast(text, kind) {
    const el = $('toast');
    el.textContent = text;
    el.className = 'toast ' + (kind || '');
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, kind === 'err' ? 6000 : 3200);
  }

  function timeAgo(ts) {
    if (!ts) return 'unknown';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24);
    if (d < 30) return d + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  function completenessBadge(conv) {
    const status = (conv.completeness && conv.completeness.status) || 'unverified';
    const map = {
      complete: ['ok', 'Complete capture'],
      partial: ['warn', 'Partial — some messages were not visible'],
      live: ['warn', 'Live capture — older messages unverified'],
      unverified: ['warn', 'Unverified'],
    };
    const [cls, label] = map[status] || map.unverified;
    const el = document.createElement('span');
    el.className = 'badge ' + cls;
    el.textContent = label;
    return el;
  }

  let conversations = [];
  let selectedId = null;

  // Deep-link: archive.html#<conversationId>
  const deepLink = decodeURIComponent((location.hash || '').slice(1)) || null;

  async function loadList(query) {
    const resp = await send(query
      ? { type: 'SEARCH_CONVERSATIONS', query }
      : { type: 'LIST_CONVERSATIONS' });
    if (!resp || !resp.ok) {
      toast('Could not load the archive: ' + ((resp && (resp.error || resp.detail)) || 'unknown error'), 'err');
      conversations = [];
    } else {
      conversations = resp.conversations || [];
    }
    renderList();
    renderUsage();
  }

  function renderList() {
    const list = $('conv-list');
    list.textContent = '';
    $('conv-empty').hidden = conversations.length > 0;
    $('conv-search-empty').hidden = true;

    conversations.forEach((conv) => {
      const item = document.createElement('button');
      item.className = 'conv-item' + (conv.id === selectedId ? ' selected' : '');
      item.setAttribute('role', 'listitem');
      item.dataset.id = conv.id;

      const title = document.createElement('div');
      title.className = 'ci-title';
      title.textContent = conv.title || 'Untitled conversation';

      const meta = document.createElement('div');
      meta.className = 'ci-meta';
      const dot = document.createElement('span');
      dot.className = 'ci-dot';
      dot.style.background = platformColor(conv.platformId);
      meta.appendChild(dot);
      const name = document.createElement('span');
      name.textContent = conv.platformName || conv.platformId;
      const count = document.createElement('span');
      count.textContent = (conv.messageCount || 0) + ' messages';
      const when = document.createElement('span');
      when.textContent = timeAgo(conv.updatedAt);
      meta.appendChild(name);
      meta.appendChild(count);
      meta.appendChild(when);
      if (conv.legacy) {
        const legacy = document.createElement('span');
        legacy.textContent = 'imported from v1';
        meta.appendChild(legacy);
      }

      item.appendChild(title);
      item.appendChild(meta);
      if (conv.matchExcerpt) {
        const ex = document.createElement('div');
        ex.className = 'ci-excerpt';
        ex.textContent = '…' + conv.matchExcerpt;
        item.appendChild(ex);
      }
      item.addEventListener('click', () => selectConversation(conv.id));
      list.appendChild(item);
    });
  }

  function platformColor(platformId) {
    // Best-effort color mapping (registry ids are stable).
    const colors = {
      chatgpt: '#10a37f', claude: '#d97706', gemini: '#4285f4', aistudio: '#1a73e8',
      perplexity: '#20808d', deepseek: '#4D6BFE', grok: '#1d9bf0', copilot: '#0078d4',
      metaai: '#0081fb', mistral: '#ff7000', huggingchat: '#ff9d00', poe: '#5f2eea',
      qwen: '#615ced',
    };
    return colors[platformId] || '#8a90a5';
  }

  async function selectConversation(id) {
    selectedId = id;
    history.replaceState(null, '', '#' + encodeURIComponent(id));
    renderList();
    const resp = await send({ type: 'GET_CONVERSATION_MESSAGES', conversationId: id });
    if (!resp || !resp.ok) {
      toast('Could not load this conversation.', 'err');
      return;
    }
    renderDetail(resp.conversation, resp.messages);
  }

  function renderDetail(conv, messages) {
    $('detail-empty').hidden = true;
    $('detail').hidden = false;

    $('d-title').textContent = conv.title || 'Untitled conversation';
    $('d-platform').textContent = conv.platformName || conv.platformId;
    $('d-updated').textContent = 'updated ' + timeAgo(conv.updatedAt);
    $('d-count').textContent = messages.length + ' captured messages';
    const urlEl = $('d-url');
    urlEl.textContent = conv.url || '';
    urlEl.hidden = !conv.url;

    const comp = $('d-completeness');
    const compBadge = completenessBadge(conv);
    compBadge.id = 'd-completeness';
    comp.replaceWith(compBadge);

    const attBadge = $('d-attachments');
    const totalAtts = messages.reduce((n, m) => n + ((m.attachmentDetails && m.attachmentDetails.length) || 0), 0);
    attBadge.hidden = totalAtts === 0;
    if (totalAtts) {
      attBadge.className = 'badge';
      const captured = messages.reduce((n, m) =>
        n + ((m.attachmentDetails || []).filter((a) => a.status === 'captured').length), 0);
      attBadge.textContent = totalAtts + ' attachment' + (totalAtts > 1 ? 's' : '') +
        (captured ? ' (' + captured + ' stored locally)' : ' — references only');
    }

    const linBadge = $('d-lineage');
    linBadge.hidden = !(Array.isArray(conv.lineage) && conv.lineage.length);
    if (!linBadge.hidden) linBadge.textContent = 'Continues ' + conv.lineage.length + ' earlier conversation(s)';

    const wrap = $('messages');
    wrap.textContent = '';
    messages.forEach((m, i) => {
      const item = document.createElement('article');
      item.className = 'msg ' + m.role;

      const head = document.createElement('div');
      head.className = 'msg-head';
      const role = document.createElement('span');
      role.className = 'msg-role';
      role.textContent = m.role === 'user' ? 'User' : 'Assistant';
      const meta = document.createElement('span');
      meta.className = 'msg-meta';
      meta.textContent = 'message ' + (i + 1) + ' · captured ' + timeAgo(m.capturedAt);
      head.appendChild(role);
      head.appendChild(meta);
      if (m.revision > 1) {
        const rev = document.createElement('span');
        rev.className = 'msg-rev';
        rev.textContent = '· revised ' + (m.revision - 1) + '× (earlier text kept)';
        head.appendChild(rev);
      }
      item.appendChild(head);

      const body = document.createElement('div');
      body.className = 'msg-body';
      body.textContent = m.content || '';
      item.appendChild(body);

      if (m.attachmentDetails && m.attachmentDetails.length) {
        const atts = document.createElement('div');
        atts.className = 'msg-attachments';
        m.attachmentDetails.forEach((a) => {
          const row = document.createElement('div');
          row.className = 'att-row';
          const name = document.createElement('span');
          name.className = 'att-name';
          name.textContent = a.filename || 'attachment';
          const status = document.createElement('span');
          const statusMap = {
            captured: ['ok', 'stored locally'],
            reference: ['warn', 'reference only — file contents not captured'],
            unsupported: ['warn', 'unsupported type'],
            missing: ['err', 'missing'],
            'transfer-failed': ['err', 'transfer failed'],
          };
          const [cls, label] = statusMap[a.status] || statusMap.reference;
          status.className = 'badge ' + cls;
          status.textContent = label;
          row.appendChild(name);
          row.appendChild(status);
          atts.appendChild(row);
        });
        item.appendChild(atts);
      }

      // Collapsible revision history (lossless: previous text kept).
      if (Array.isArray(m.previousRevisions) && m.previousRevisions.length) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = m.previousRevisions.length + ' earlier revision(s)';
        summary.className = 'muted-2';
        details.appendChild(summary);
        m.previousRevisions.forEach((r) => {
          const prev = document.createElement('div');
          prev.className = 'msg-body';
          prev.style.opacity = '0.7';
          prev.style.marginTop = '6px';
          prev.textContent = r.content || '';
          details.appendChild(prev);
        });
        item.appendChild(details);
      }

      wrap.appendChild(item);
    });
  }

  async function renderUsage() {
    const el = $('usage-line');
    try {
      const resp = await send({ type: 'GET_CAPTURE_STATE', url: 'https://chatgpt.com/', platformId: 'chatgpt' });
      if (resp && resp.ok && resp.state.storage && resp.state.storage.usage != null) {
        el.textContent = 'Archive storage: ~' + Math.round(resp.state.storage.usage / 1024) + ' KB of ~' +
          Math.round(resp.state.storage.quota / 1024 / 1024) + ' MB available to this browser';
        return;
      }
    } catch (_e) { /* fall through */ }
    el.textContent = '';
  }

  function download(text, filename, mime) {
    const blob = new Blob([text], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  // --- Events ---------------------------------------------------------------

  let searchTimer = null;
  $('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    searchTimer = setTimeout(() => {
      if (!q) {
        loadList(null).then(() => {
          if (!conversations.length) $('conv-empty').hidden = false;
        });
      } else {
        loadList(q).then(() => {
          $('conv-empty').hidden = true;
          $('conv-search-empty').hidden = conversations.length > 0;
        });
      }
    }, 200);
  });

  $('btn-export-all').addEventListener('click', async () => {
    try {
      const resp = await send({ type: 'EXPORT_ARCHIVE' });
      if (!resp || !resp.ok) throw new Error((resp && (resp.error || resp.detail)) || 'export failed');
      download(JSON.stringify(resp.export, null, 2), resp.filename || 'relay-archive.json');
      toast('Archive exported.', 'ok');
    } catch (e) {
      toast('Export failed: ' + e.message, 'err');
    }
  });

  $('btn-export-json').addEventListener('click', async () => {
    if (!selectedId) return;
    try {
      const resp = await send({ type: 'EXPORT_ARCHIVE', conversationId: selectedId });
      if (!resp || !resp.ok) throw new Error('export failed');
      download(JSON.stringify(resp.export, null, 2), resp.filename || 'relay-conversation.json');
      toast('Conversation exported.', 'ok');
    } catch (e) {
      toast('Export failed: ' + e.message, 'err');
    }
  });

  $('btn-copy-md').addEventListener('click', async () => {
    if (!selectedId) return;
    try {
      const resp = await send({ type: 'EXPORT_MARKDOWN', conversationId: selectedId });
      if (!resp || !resp.ok) throw new Error((resp && resp.error) || 'nothing to copy');
      await navigator.clipboard.writeText(resp.markdown);
      toast('Markdown transcript copied to clipboard.', 'ok');
    } catch (e) {
      toast('Copy failed: ' + e.message, 'err');
    }
  });

  $('btn-delete').addEventListener('click', async () => {
    if (!selectedId) return;
    const conv = conversations.find((c) => c.id === selectedId);
    const name = (conv && conv.title) || 'this conversation';
    if (!confirm('Delete "' + name + '" from the local archive?\n\nThis removes its captured messages and attachment records. It does not affect the live conversation on the platform.')) return;
    const resp = await send({ type: 'DELETE_CONVERSATION', conversationId: selectedId });
    if (resp && resp.ok) {
      toast('Conversation deleted from the archive.', 'ok');
      selectedId = null;
      $('detail').hidden = true;
      $('detail-empty').hidden = false;
      await loadList($('search').value.trim() || null);
    } else {
      toast('Delete failed.', 'err');
    }
  });

  $('btn-delete-all').addEventListener('click', async () => {
    if (!confirm('Delete EVERY archived conversation?\n\nThis clears the entire local archive — every captured conversation, message and attachment record. It cannot be undone. Your settings are kept.\n\nConsider exporting a backup first.')) return;
    if (!confirm('Really delete all archives? This is the final confirmation.')) return;
    const resp = await send({ type: 'DELETE_ALL_CONVERSATIONS' });
    if (resp && resp.ok) {
      toast('All archives deleted.', 'ok');
      selectedId = null;
      $('detail').hidden = true;
      $('detail-empty').hidden = false;
      await loadList(null);
    } else {
      toast('Delete failed.', 'err');
    }
  });

  $('btn-import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const resp = await send({ type: 'IMPORT_ARCHIVE', payload });
      if (!resp || !resp.ok) throw new Error((resp && (resp.error || resp.detail)) || 'invalid archive file');
      const r = resp.report;
      toast('Imported ' + r.conversations + ' conversation(s): +' + r.messagesAdded +
        ' messages added, ' + r.messagesKept + ' already present' +
        (r.skipped.length ? ', ' + r.skipped.length + ' skipped' : '') + '.', 'ok');
      await loadList(null);
    } catch (err) {
      toast('Import failed: ' + err.message, 'err');
    } finally {
      e.target.value = '';
    }
  });

  // --- Boot -------------------------------------------------------------------

  // Theme follows saved settings.
  try {
    const stored = await new Promise((res) => api.storage.local.get('relay_settings', res));
    const theme = (stored.relay_settings && stored.relay_settings.theme) || 'system';
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  } catch (_e) { /* system default */ }

  await loadList(null);
  if (deepLink) await selectConversation(deepLink);
})();
