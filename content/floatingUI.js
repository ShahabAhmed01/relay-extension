/**
 * Relay v2 — Floating UI: draggable FAB + shadow-DOM panel.
 *
 * Panel sections:
 *   1. Header      — identity, platform, capture status, settings/close.
 *   2. Health      — conversation, captured count, completeness (plain
 *                    language), last update, warnings with actions.
 *   3. Switch      — destination picker with search + context mode
 *                    (full / multi-part / recent) + transfer preview.
 *   4. Transfer    — part-by-part progression on the destination side.
 *   5. Secondary   — review transcript, copy markdown, export, archive.
 *
 * Every status shown here corresponds to real program state. Nothing
 * turns green unless the operation actually succeeded.
 */

var RelayToast = (function () {
  'use strict';
  var host = null;
  var shadow = null;

  function ensure() {
    if (host && shadow) return shadow;
    host = document.createElement('div');
    host.id = 'relay-toast-host';
    host.style.cssText = 'position:fixed;inset:auto 22px 82px auto;z-index:2147483645;pointer-events:none;';
    shadow = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = '.t{pointer-events:auto;padding:10px 14px;border-radius:10px;font:500 13px system-ui,sans-serif;max-width:320px;margin-top:8px;opacity:0;transform:translateY(12px);transition:opacity .2s,transform .2s;border:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.97);color:#1a1a24;box-shadow:0 8px 24px rgba(0,0,0,.14);border-left:3px solid #6d5efc}.t.show{opacity:1;transform:none}.t.success{border-left-color:#0e9f6e}.t.warning{border-left-color:#d97706}.t.error{border-left-color:#dc2626}@media(prefers-color-scheme:dark){.t{background:rgba(18,18,24,.97);color:#f4f4f8;border-color:rgba(255,255,255,.1)}}@media(prefers-reduced-motion:reduce){.t{transition:none!important}}';
    shadow.appendChild(style);
    document.documentElement.appendChild(host);
    return shadow;
  }

  function show(message, type, duration) {
    type = type || 'info';
    duration = duration || 3200;
    var root = ensure();
    var el = document.createElement('div');
    el.className = 't ' + type;
    el.setAttribute('role', 'status');
    el.textContent = String(message == null ? '' : message);
    root.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    while (root.querySelectorAll('.t').length > 3) root.querySelector('.t').remove();
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
    }, duration);
  }

  return { show: show };
})();

var FloatingUI = (function () {
  'use strict';

  var LOGO_SVG = '<svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7C4 7 7 3 11 3C15 3 17 6 17 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M15 4L17 6L14 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M18 15C18 15 15 19 11 19C7 19 5 16 5 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M7 18L5 16L8 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="11" cy="11" r="1.5" fill="currentColor"/></svg>';
  var ICONS = {
    close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    gear: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    copy: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    export: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    archive: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 8v13H3V8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
    scan: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>',
  };

  var _fabHost = null, _fab = null;
  var _panelHost = null, _shadow = null;
  var _isOpen = false;
  var _eventsAttached = false;
  var _fabEventsAttached = false;
  var _currentPlatform = null;
  var _state = { conversation: null, paused: null, storage: null };
  var _mode = 'full';
  var _pendingHandoff = null; // {transferId, manifest, parts, targetPlatformId}
  var _activeTransfer = null; // on-destination part progression
  var _lastFocused = null;
  var _fullCaptureBusy = false;
  var _quotaError = false;

  function api() {
    return (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  }
  function send(message) { return api().runtime.sendMessage(message); }

  // ============================= CSS ==================================

  function css() {
    return `
      :host { all: initial; }
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      #relay-panel {
        --bg: #ffffff;
        --bg-2: #f6f7fb;
        --bg-3: #eef0f6;
        --surface: #ffffff;
        --border: rgba(15, 18, 34, 0.10);
        --border-strong: rgba(15, 18, 34, 0.18);
        --text: #171a26;
        --text-2: #4b5265;
        --text-3: #8a90a5;
        --accent: #6d5efc;
        --accent-soft: rgba(109, 94, 252, 0.10);
        --accent-text: #5847e8;
        --ok: #0e9f6e;
        --warn: #b45309;
        --err: #dc2626;
        --radius: 12px;
        --radius-sm: 8px;
        --shadow: 0 16px 48px rgba(10, 12, 30, 0.18);
        --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;

        width: 372px;
        max-width: calc(100vw - 32px);
        max-height: min(600px, calc(100vh - 96px));
        overflow-y: auto;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        font-family: var(--font);
        color: var(--text);
        font-size: 13px;
        line-height: 1.45;
        -webkit-font-smoothing: antialiased;
        animation: relay-in .18s ease;
      }
      #relay-panel[data-theme="dark"] {
        --bg: #101218; --bg-2: #16181f; --bg-3: #1d202a;
        --surface: #14161c; --border: rgba(255,255,255,0.09); --border-strong: rgba(255,255,255,0.2);
        --text: #f0f1f6; --text-2: #a6abbd; --text-3: #6b7080;
        --accent: #7c6dff; --accent-soft: rgba(124, 109, 255, 0.14); --accent-text: #a99cff;
        --ok: #34d399; --warn: #fbbf24; --err: #f87171;
        --shadow: 0 16px 48px rgba(0,0,0,0.55);
      }
      @media (prefers-color-scheme: dark) {
        #relay-panel:not([data-theme="light"]) {
          --bg: #101218; --bg-2: #16181f; --bg-3: #1d202a;
          --surface: #14161c; --border: rgba(255,255,255,0.09); --border-strong: rgba(255,255,255,0.2);
          --text: #f0f1f6; --text-2: #a6abbd; --text-3: #6b7080;
          --accent: #7c6dff; --accent-soft: rgba(124, 109, 255, 0.14); --accent-text: #a99cff;
          --ok: #34d399; --warn: #fbbf24; --err: #f87171;
          --shadow: 0 16px 48px rgba(0,0,0,0.55);
        }
      }
      @keyframes relay-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) {
        #relay-panel, #relay-panel * { animation: none !important; transition: none !important; }
      }

      #relay-panel::-webkit-scrollbar { width: 6px; }
      #relay-panel::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 6px; }

      .hd { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--surface); z-index: 3; }
      .hd-logo { width: 26px; height: 26px; border-radius: 8px; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; flex: none; }
      .hd-logo svg { width: 16px; height: 16px; }
      .hd-name { font-weight: 700; font-size: 14px; letter-spacing: -0.01em; }
      .hd-sub { font-size: 11px; color: var(--text-3); display: flex; align-items: center; gap: 5px; }
      .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-3); flex: none; }
      .dot.ok { background: var(--ok); }
      .dot.warn { background: var(--warn); }
      .dot.err { background: var(--err); }
      .hd-actions { margin-left: auto; display: flex; gap: 4px; }

      .ibtn { width: 28px; height: 28px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--text-2); cursor: pointer; display: flex; align-items: center; justify-content: center; }
      .ibtn:hover { background: var(--bg-2); color: var(--text); border-color: var(--border); }
      .ibtn svg { display: block; }

      .body { padding: 12px 14px 14px; }

      .card { border: 1px solid var(--border); border-radius: 10px; padding: 12px; background: var(--bg-2); margin-bottom: 10px; }
      .card-title { font-weight: 600; font-size: 12px; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
      .conv-name { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .conv-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 4px; color: var(--text-2); font-size: 12px; }
      .conv-meta b { color: var(--text); font-weight: 600; }
      .status-line { display: flex; gap: 6px; margin-top: 8px; font-size: 12px; align-items: flex-start; }
      .status-line.ok { color: var(--ok); }
      .status-line.warn { color: var(--warn); }
      .status-line.err { color: var(--err); }

      /* Author display rules (.row, .card…) must never defeat the hidden
         attribute — the UA [hidden] rule loses to any author display rule. */
      [hidden] { display: none !important; }
      .empty { text-align: center; padding: 18px 8px; border: 1px dashed var(--border-strong); border-radius: 10px; color: var(--text-2); }
      .empty .t1 { font-weight: 600; margin-bottom: 2px; color: var(--text); }
      .empty .t2 { font-size: 12px; color: var(--text-3); }

      .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
      .btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: 600 12px var(--font); cursor: pointer; }
      .btn:hover { background: var(--bg-3); border-color: var(--border-strong); }
      .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
      .btn.primary:hover { filter: brightness(1.06); }
      .btn.danger:hover { border-color: var(--err); color: var(--err); }
      .btn[disabled] { opacity: .5; cursor: not-allowed; }
      .btn svg { flex: none; }

      .divider { display: flex; align-items: center; gap: 10px; margin: 14px 0 10px; color: var(--text-3); font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
      .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }

      .modes { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 8px; background: var(--bg-2); }
      .modes button { flex: 1; padding: 7px 4px; border: 0; background: transparent; color: var(--text-2); font: 600 11.5px var(--font); cursor: pointer; border-right: 1px solid var(--border); }
      .modes button:last-child { border-right: 0; }
      .modes button[aria-pressed="true"] { background: var(--accent); color: #fff; }
      .mode-hint { font-size: 11px; color: var(--text-3); margin-bottom: 10px; min-height: 15px; }

      .search { width: 100%; padding: 8px 10px; margin-bottom: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-2); color: var(--text); font: 500 12.5px var(--font); outline: none; }
      .search:focus { border-color: var(--accent); }

      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; max-height: 236px; overflow-y: auto; padding-right: 2px; }
      .pcard { display: flex; align-items: center; gap: 9px; height: 42px; padding: 0 9px 0 0; background: var(--surface); border: 1px solid var(--border); border-radius: 9px; cursor: pointer; font-family: var(--font); color: var(--text); width: 100%; text-align: left; overflow: hidden; }
      .pcard:hover, .pcard:focus-visible { border-color: var(--accent); background: var(--accent-soft); }
      .pcard.current { border-color: var(--accent); }
      .pcard .picon { width: 19px; height: 19px; margin-left: 8px; flex: none; }
      .pcard .picon svg { width: 19px; height: 19px; }
      .pcard .pname { font-size: 12px; font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pcard .mark { font-size: 9px; font-weight: 700; color: var(--accent-text); border: 1px solid var(--accent); border-radius: 4px; padding: 1px 4px; margin-right: 2px; }
      .pcard[hidden] { display: none; }

      .preview { border: 1px solid var(--accent); border-radius: 10px; padding: 12px; background: var(--bg-2); margin-bottom: 10px; }
      .preview h4 { font-size: 13px; margin-bottom: 6px; }
      .preview ul { list-style: none; margin: 6px 0 10px; }
      .preview li { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; font-size: 12px; color: var(--text-2); border-bottom: 1px solid var(--border); }
      .preview li:last-child { border-bottom: 0; }
      .preview li b { color: var(--text); font-weight: 600; text-align: right; }
      .preview .warnbox { margin: 8px 0 0; padding: 8px 10px; border-radius: 8px; background: rgba(217, 119, 6, .12); color: var(--warn); font-size: 12px; }
      .check { display: flex; gap: 7px; align-items: center; margin: 8px 0 2px; font-size: 12px; color: var(--text-2); }
      .check input { accent-color: var(--accent); }

      .transfer { border: 1px solid var(--accent); border-radius: 10px; padding: 12px; background: var(--bg-2); margin-bottom: 10px; }
      .transfer h4 { font-size: 13px; margin-bottom: 4px; }
      .transfer .sub { font-size: 12px; color: var(--text-2); margin-bottom: 8px; }
      .parts-dots { display: flex; gap: 5px; margin: 6px 0 10px; flex-wrap: wrap; }
      .pdot { width: 10px; height: 10px; border-radius: 3px; background: var(--bg-3); border: 1px solid var(--border-strong); }
      .pdot.inserted { background: var(--accent); border-color: var(--accent); }
      .pdot.sent { background: var(--ok); border-color: var(--ok); }
      .pdot.current { outline: 2px solid var(--accent-text); outline-offset: 1px; }

      .secondary { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
      .secondary .btn { font-weight: 500; }

      .foot { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-3); display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }

      #relay-panel button:focus-visible, #relay-panel input:focus-visible {
        outline: 2px solid var(--accent); outline-offset: 1px;
      }
    `;
  }

  // ============================ HTML ==================================

  function html() {
    return `
      <div id="relay-panel" role="dialog" aria-label="Relay — AI context panel">
        <div class="hd">
          <div class="hd-logo">${LOGO_SVG}</div>
          <div>
            <div class="hd-name">Relay</div>
            <div class="hd-sub"><span class="dot" id="relay-status-dot"></span><span id="relay-platform-name">Not connected</span></div>
          </div>
          <div class="hd-actions">
            <button class="ibtn" id="relay-settings-btn" title="Settings" aria-label="Open settings">${ICONS.gear}</button>
            <button class="ibtn" id="relay-close-btn" title="Close (Esc)" aria-label="Close panel">${ICONS.close}</button>
          </div>
        </div>
        <div class="body">
          <div id="relay-transfer-slot"></div>

          <div id="relay-health-card" class="card" hidden>
            <div class="card-title">Context health</div>
            <div class="conv-name" id="relay-conv-name">—</div>
            <div class="conv-meta">
              <span><b id="relay-conv-count">0</b> messages captured</span>
              <span id="relay-conv-updated"></span>
            </div>
            <div class="status-line" id="relay-conv-status"></div>
            <div class="status-line" id="relay-storage-status"></div>
            <div class="row">
              <button class="btn" id="relay-fullcapture-btn">${ICONS.scan} Capture full conversation</button>
              <button class="btn" id="relay-review-btn">${ICONS.archive} Review transcript</button>
            </div>
            <div class="row" id="relay-fullcapture-progress" hidden>
              <span id="relay-fullcapture-text" style="font-size:12px;color:var(--text-2);flex:1;align-self:center"></span>
              <button class="btn danger" id="relay-fullcapture-cancel">Cancel</button>
            </div>
          </div>

          <div id="relay-empty-state" class="empty" hidden>
            <div class="t1">No conversation captured yet</div>
            <div class="t2">Chat here and Relay saves it locally, automatically.</div>
          </div>

          <div id="relay-paused-state" class="empty" hidden>
            <div class="t1">Capture is paused</div>
            <div class="t2" id="relay-paused-scope"></div>
          </div>

          <div id="relay-switch-section">
            <div class="divider">Continue on</div>
            <div class="modes" role="group" aria-label="Context mode">
              <button type="button" data-mode="full" aria-pressed="true">Full transcript</button>
              <button type="button" data-mode="multipart" aria-pressed="false">In parts</button>
              <button type="button" data-mode="continuation" aria-pressed="false">Recent only</button>
            </div>
            <div class="mode-hint" id="relay-mode-hint"></div>
            <input type="search" id="relay-platform-search" class="search" placeholder="Search platforms…" aria-label="Search platforms" autocomplete="off">
            <div class="grid" id="relay-platform-grid" role="listbox" aria-label="Switch to platform"></div>
            <div id="relay-preview-slot"></div>
          </div>

          <div class="secondary">
            <button class="btn" id="relay-copy-btn">${ICONS.copy} Copy Markdown</button>
            <button class="btn" id="relay-export-btn">${ICONS.export} Export JSON</button>
            <button class="btn" id="relay-archive-btn">${ICONS.archive} Archive</button>
          </div>

          <div class="foot">
            <span>Local only — nothing leaves your browser</span>
            <span id="relay-foot-usage"></span>
          </div>
        </div>
      </div>
    `;
  }

  // ============================ FAB ===================================

  function fabXY(pos) {
    if (pos === 'bottom-left') return { bottom: '20px', left: '20px', right: 'auto', top: 'auto' };
    if (pos === 'top-right') return { top: '20px', right: '20px', bottom: 'auto', left: 'auto' };
    if (pos === 'top-left') return { top: '20px', left: '20px', bottom: 'auto', right: 'auto' };
    return { bottom: '20px', right: '20px', left: 'auto', top: 'auto' };
  }

  function _createFAB(settings) {
    if (_fabHost && document.getElementById('relay-fab-host')) return;
    var pos = (settings && settings.fabPosition) || 'bottom-right';
    var size = (settings && settings.fabSize === 'large') ? 56 : 48;
    _fabHost = document.createElement('div');
    _fabHost.id = 'relay-fab-host';
    var p = fabXY(pos);
    _fabHost.style.cssText = 'position:fixed;top:' + p.top + ';bottom:' + p.bottom + ';left:' + p.left + ';right:' + p.right + ';z-index:2147483640;';
    var sh = _fabHost.attachShadow({ mode: 'open' });
    var st = document.createElement('style');
    st.textContent = '#relay-fab{width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:#6d5efc;color:#fff;border:none;display:flex;align-items:center;justify-content:center;cursor:grab;box-shadow:0 4px 16px rgba(20,16,60,.35);transition:transform .15s;user-select:none}#relay-fab:hover{transform:scale(1.05)}#relay-fab:active{cursor:grabbing;transform:scale(.95)}#relay-fab:focus-visible{outline:2px solid #fff;outline-offset:2px}#relay-fab svg{width:60%;height:60%}@media(prefers-reduced-motion:reduce){#relay-fab{transition:none!important}}';
    sh.appendChild(st);
    _fab = document.createElement('button');
    _fab.id = 'relay-fab';
    _fab.innerHTML = LOGO_SVG;
    _fab.setAttribute('aria-label', 'Relay — AI Context Bridge (Alt+R). Activate to open panel.');
    _fab.setAttribute('title', 'Relay (Alt+R) — drag to move');
    sh.appendChild(_fab);
    document.documentElement.appendChild(_fabHost);
    _attachFABEvents();
  }

  function _positionPanel(pos) {
    if (!_panelHost) return;
    var p = fabXY(pos);
    _panelHost.style.top = p.top === 'auto' ? 'auto' : (p.top === '20px' ? '76px' : '76px');
    _panelHost.style.bottom = p.bottom === 'auto' ? 'auto' : '76px';
    _panelHost.style.left = p.left;
    _panelHost.style.right = p.right;
  }

  function _attachFABEvents() {
    if (!_fab || _fabEventsAttached) return;
    _fabEventsAttached = true;
    var startX = 0, startY = 0, moved = false, activePointer = null;

    function cornerFromPoint(x, y) {
      var w = window.innerWidth || 0, h = window.innerHeight || 0;
      return (y < h / 2 ? 'top' : 'bottom') + '-' + (x < w / 2 ? 'left' : 'right');
    }

    _fab.addEventListener('click', function () {
      if (moved) { moved = false; return; }
      _togglePanel();
    });
    _fab.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _togglePanel(); }
    });
    _fab.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      activePointer = e.pointerId; startX = e.clientX; startY = e.clientY; moved = false;
      try { _fab.setPointerCapture(e.pointerId); } catch (_e) {}
    });
    _fab.addEventListener('pointermove', function (e) {
      if (activePointer === null || e.pointerId !== activePointer) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      if (!moved && Math.sqrt(dx * dx + dy * dy) < 6) return;
      moved = true;
      _fabHost.style.top = Math.max(4, e.clientY - 24) + 'px';
      _fabHost.style.left = Math.max(4, e.clientX - 24) + 'px';
      _fabHost.style.bottom = 'auto';
      _fabHost.style.right = 'auto';
    });
    _fab.addEventListener('pointerup', function (e) {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      if (!moved) return;
      e.preventDefault();
      var corner = cornerFromPoint(e.clientX, e.clientY);
      var p = fabXY(corner);
      _fabHost.style.top = p.top; _fabHost.style.bottom = p.bottom;
      _fabHost.style.left = p.left; _fabHost.style.right = p.right;
      _positionPanel(corner);
      if (typeof RelayStorage !== 'undefined') {
        try { RelayStorage.saveSettings({ fabPosition: corner }); } catch (_e) {}
      }
    });
    _fab.addEventListener('pointercancel', function () {
      activePointer = null;
      setTimeout(function () { moved = false; }, 0);
    });
  }

  // ============================ Panel plumbing ==========================

  function _createPanel(fabPosition) {
    _panelHost = document.createElement('relay-widget');
    _panelHost.style.cssText = 'position:fixed;bottom:76px;right:20px;z-index:2147483641;display:none;';
    _positionPanel(fabPosition || 'bottom-right');
    _shadow = _panelHost.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = css();
    _shadow.appendChild(style);
    var content = document.createElement('div');
    content.innerHTML = html();
    _shadow.appendChild(content);
    document.documentElement.appendChild(_panelHost);
  }

  function el(id) { return _shadow ? _shadow.getElementById(id) : null; }

  // ============================ State & rendering ========================

  function completenessCopy(conv) {
    var c = (conv && conv.completeness) || {};
    switch (c.status) {
      case 'complete': return { cls: 'ok', text: 'Full conversation captured and verified.' };
      case 'partial': return {
        cls: 'warn',
        text: 'Some older messages were not visible on this page. Run “Capture full conversation” to include them.',
      };
      case 'live': return {
        cls: 'warn',
        text: 'Capturing live. Older messages may exist above the visible area — run “Capture full conversation” to verify.',
      };
      default: return { cls: 'warn', text: 'Capture status unverified.' };
    }
  }

  function storageCopy(storage) {
    if (!storage || storage.level === 'unknown') return { cls: '', text: '' };
    if (storage.level === 'critical') {
      return { cls: 'err', text: 'Browser storage is nearly full — saves may fail. Export and free space.' };
    }
    if (storage.level === 'warn') {
      var pct = Math.round((storage.ratio || 0) * 100);
      return { cls: 'warn', text: 'Storage ' + pct + '% used — consider exporting a backup.' };
    }
    return { cls: '', text: '' };
  }

  function timeAgo(ts) {
    if (!ts) return '';
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24);
    return d + 'd ago';
  }

  async function refreshState() {
    if (typeof RelayContent === 'undefined' || !RelayContent.platform) return;
    try {
      var resp = await send({
        type: 'GET_CAPTURE_STATE',
        url: window.location.href,
        platformId: RelayContent.platform.id,
      });
      if (resp && resp.ok) {
        _state = resp.state;
        renderHealth();
      }
    } catch (_e) { /* panel opens with cached state */ }
  }

  function renderHealth() {
    var conv = _state.conversation;
    var paused = _state.paused || {};
    var healthCard = el('relay-health-card');
    var emptyState = el('relay-empty-state');
    var pausedState = el('relay-paused-state');
    var switchSection = el('relay-switch-section');
    if (!healthCard) return;

    _currentPlatform = (typeof RelayContent !== 'undefined' && RelayContent.platform) || null;
    var nameEl = el('relay-platform-name');
    if (nameEl) nameEl.textContent = _currentPlatform ? _currentPlatform.name : 'Ready';

    var dot = el('relay-status-dot');
    if (dot) dot.className = 'dot' + (paused.paused ? ' warn' : (conv ? ' ok' : ''));

    if (paused.paused) {
      healthCard.hidden = true;
      emptyState.hidden = true;
      pausedState.hidden = false;
      switchSection.hidden = !!conv === false; // still allow switching with archive? keep visible
      var scopeEl = el('relay-paused-scope');
      if (scopeEl) scopeEl.textContent = paused.scope === 'global'
        ? 'Capture is paused everywhere. Re-enable it in settings.'
        : 'Capture is paused for ' + (_currentPlatform ? _currentPlatform.name : 'this platform') + '.';
      return;
    }
    pausedState.hidden = true;

    if (!conv || !(conv.messageCount > 0)) {
      healthCard.hidden = true;
      emptyState.hidden = false;
      switchSection.hidden = false;
      return;
    }

    emptyState.hidden = true;
    switchSection.hidden = false;
    healthCard.hidden = false;
    el('relay-conv-name').textContent = conv.title || 'Untitled conversation';
    el('relay-conv-name').title = conv.title || '';
    el('relay-conv-count').textContent = String(conv.messageCount);
    el('relay-conv-updated').textContent = 'updated ' + timeAgo(conv.updatedAt);

    var cc = completenessCopy(conv);
    var statusEl = el('relay-conv-status');
    statusEl.className = 'status-line ' + cc.cls;
    statusEl.textContent = cc.text;

    var sc = storageCopy(_state.storage);
    var storageEl = el('relay-storage-status');
    // A failed save outranks a soft storage warning: it must be visible and red.
    if (_quotaError) {
      storageEl.className = 'status-line err';
      storageEl.textContent = 'Last update could NOT be saved — storage is full. Your earlier messages are safe. Export a backup from the Archive page, free space, and new messages will save automatically.';
    } else {
      storageEl.className = 'status-line ' + sc.cls;
      storageEl.textContent = sc.text;
    }

    var fc = el('relay-fullcapture-btn');
    if (fc) fc.hidden = conv.completeness && conv.completeness.status === 'complete';

    var usage = el('relay-foot-usage');
    if (usage) {
      var kb = _state.storage && _state.storage.usage
        ? Math.round(_state.storage.usage / 1024) + ' KB stored'
        : conv.messageCount + ' messages stored';
      usage.textContent = kb;
    }
    renderGrid();
  }

  function modeHint() {
    if (_mode === 'full') return 'Sends the entire captured transcript in one message. If it is too large, Relay will split it into parts automatically.';
    if (_mode === 'multipart') return 'Splits the full transcript into ordered parts you insert one by one. Nothing is omitted.';
    return 'Recent messages only, clearly labeled as a partial handoff. Your full archive stays intact.';
  }

  function renderModes() {
    if (!_shadow) return;
    _shadow.querySelectorAll('.modes button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === _mode));
    });
    var hint = el('relay-mode-hint');
    if (hint) hint.textContent = modeHint();
  }

  function renderGrid() {
    var grid = el('relay-platform-grid');
    if (!grid) return;
    grid.textContent = '';
    var platforms = (typeof RelayPlatforms !== 'undefined') ? RelayPlatforms.getAllPlatforms() : [];
    platforms.forEach(function (p) {
      var isCurrent = _currentPlatform && _currentPlatform.id === p.id;
      var card = document.createElement('button');
      card.className = 'pcard' + (isCurrent ? ' current' : '');
      card.setAttribute('data-platform-id', p.id);
      card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', 'false');
      card.setAttribute('title', isCurrent ? 'Currently on ' + p.name : 'Switch to ' + p.name);
      var icon = document.createElement('span');
      icon.className = 'picon';
      icon.innerHTML = p.logoSvg;
      var name = document.createElement('span');
      name.className = 'pname';
      name.textContent = p.name;
      card.appendChild(icon);
      card.appendChild(name);
      if (isCurrent) {
        var mark = document.createElement('span');
        mark.className = 'mark';
        mark.textContent = 'HERE';
        card.appendChild(mark);
      }
      grid.appendChild(card);
    });
    filterGrid('');
  }

  function filterGrid(query) {
    if (!_shadow) return;
    var q = String(query || '').toLowerCase();
    _shadow.querySelectorAll('.pcard').forEach(function (card) {
      var name = card.querySelector('.pname');
      card.hidden = q !== '' && (name ? name.textContent : '').toLowerCase().indexOf(q) === -1;
    });
  }

  // ============================ Switching flow ==========================

  async function handlePlatformPick(platformId) {
    var conv = _state.conversation;
    if (!conv || !(conv.messageCount > 0)) {
      RelayToast.show('No captured context to transfer yet.', 'warning');
      return;
    }
    var settings = {};
    try { settings = await RelayStorage.getSettings(); } catch (_e) {}
    if (settings.confirmBeforeSwitch) {
      var ok = await showConfirm('Transfer the captured conversation to ' + platformId + '?');
      if (!ok) return;
    }
    try {
      var resp = await send({
        type: 'PREPARE_HANDOFF',
        conversationId: conv.id,
        targetPlatformId: platformId,
        mode: _mode,
      });
      if (!resp || !resp.ok) {
        RelayToast.show('Could not build the transfer: ' + ((resp && (resp.error || resp.detail)) || 'unknown error'), 'error', 5000);
        return;
      }
      _pendingHandoff = {
        transferId: resp.transfer.id,
        targetPlatformId: platformId,
        manifest: resp.manifest,
        parts: resp.transfer.parts,
        fits: resp.fits,
      };
      renderPreview();
    } catch (e) {
      RelayToast.show('Transfer preparation failed: ' + String((e && e.message) || e), 'error');
    }
  }

  function renderPreview() {
    var slot = el('relay-preview-slot');
    var grid = el('relay-platform-grid');
    if (!slot || !_pendingHandoff) return;
    var m = _pendingHandoff.manifest;
    var platformName = (typeof RelayPlatforms !== 'undefined' && RelayPlatforms.getPlatformById(_pendingHandoff.targetPlatformId) || {}).name || 'destination';
    var box = document.createElement('div');
    box.className = 'preview';

    var h = document.createElement('h4');
    h.textContent = 'Transfer preview — to ' + platformName;
    box.appendChild(h);

    var ul = document.createElement('ul');
    function li(label, value) {
      var item = document.createElement('li');
      var l = document.createElement('span'); l.textContent = label;
      var v = document.createElement('b'); v.textContent = value;
      item.appendChild(l); item.appendChild(v);
      ul.appendChild(item);
    }
    li('Messages included', String(m.included.count) + (m.omitted.count ? ' of ' + m.captured.total + ' archived' : ' (all archived)'));
    li('Parts', String(_pendingHandoff.parts.length));
    var totalBytes = _pendingHandoff.parts.reduce(function (n, p) { return n + p.bytes; }, 0);
    li('Size', Math.max(1, Math.round(totalBytes / 1024)) + ' KB · ~' + (m.estimate.tokens / 1000).toFixed(1) + 'K tokens (est.)');
    if (m.source.lineageSources && m.source.lineageSources.length) {
      li('Merged history', m.source.lineageSources.map(function (s) { return s.platformName; }).join(', '));
    }
    if (m.attachments.length) {
      var capturedCount = m.attachments.filter(function (a) { return a.status === 'captured'; }).length;
      li('Attachments', m.attachments.length + ' referenced' + (capturedCount ? ' (' + capturedCount + ' stored locally)' : ' — file contents not included'));
    }
    li('Capture status', m.captured.completeness || 'unverified');
    box.appendChild(ul);

    if (!_pendingHandoff.fits) {
      var warn = document.createElement('div');
      warn.className = 'warnbox';
      warn.textContent = 'The transcript is larger than one message, so it will be delivered as ' + _pendingHandoff.parts.length + ' ordered parts. Insert each part and send it, then load the next.';
      box.appendChild(warn);
    }
    if (m.omitted.count > 0) {
      var warn2 = document.createElement('div');
      warn2.className = 'warnbox';
      warn2.textContent = 'Scoped continuation: ' + m.omitted.count + ' earlier messages are omitted from this transfer (the archive keeps them).';
      box.appendChild(warn2);
    }

    var checkLabel = document.createElement('label');
    checkLabel.className = 'check';
    var check = document.createElement('input');
    check.type = 'checkbox';
    check.id = 'relay-include-brief';
    var hintSpan = document.createElement('span');
    hintSpan.textContent = 'Include continuity brief (extractive notes from the transcript)';
    checkLabel.appendChild(check);
    checkLabel.appendChild(hintSpan);
    box.appendChild(checkLabel);

    var row = document.createElement('div');
    row.className = 'row';
    var confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn primary';
    confirmBtn.textContent = 'Open ' + platformName + ' with this context';
    var backBtn = document.createElement('button');
    backBtn.className = 'btn';
    backBtn.textContent = 'Back';
    row.appendChild(confirmBtn);
    row.appendChild(backBtn);
    box.appendChild(row);

    confirmBtn.addEventListener('click', confirmSwitch);
    backBtn.addEventListener('click', function () {
      _pendingHandoff = null;
      slot.textContent = '';
      grid.hidden = false;
    });

    slot.textContent = '';
    slot.appendChild(box);
    grid.hidden = true;
    confirmBtn.focus();
  }

  async function confirmSwitch() {
    if (!_pendingHandoff) return;
    var includeBrief = false;
    var check = el('relay-include-brief');
    if (check) includeBrief = check.checked;
    // Rebuild with the brief when the user asked for it.
    var transferId = _pendingHandoff.transferId;
    if (includeBrief) {
      var conv = _state.conversation;
      var resp = await send({
        type: 'PREPARE_HANDOFF',
        conversationId: conv.id,
        targetPlatformId: _pendingHandoff.targetPlatformId,
        mode: _mode,
        includeBrief: true,
      });
      if (resp && resp.ok) {
        // The first (brief-less) record is replaced by this one.
        await send({ type: 'ABANDON_TRANSFER', transferId: transferId });
        transferId = resp.transfer.id;
      }
    }
    var resp2 = await send({ type: 'CONFIRM_SWITCH', transferId: transferId });
    if (!resp2 || !resp2.ok) {
      RelayToast.show('Could not open the destination: ' + ((resp2 && resp2.error) || 'unknown'), 'error');
      return;
    }
    RelayToast.show('Opening ' + ((typeof RelayPlatforms !== 'undefined' && RelayPlatforms.getPlatformById(_pendingHandoff.targetPlatformId) || {}).name || 'destination') + ' — Relay will insert the context there.', 'success', 5000);
    _pendingHandoff = null;
    setTimeout(_closePanel, 400);
  }

  // ============================ Part progression ========================

  function renderTransferProgress() {
    var slot = el('relay-transfer-slot');
    if (!slot) return;
    slot.textContent = '';
    if (!_activeTransfer) return;

    var t = _activeTransfer;
    var platformName = '';
    try {
      var target = (typeof RelayPlatforms !== 'undefined') ? RelayPlatforms.getPlatformById(t.targetPlatformId) : null;
      platformName = target ? target.name : t.targetPlatformId;
    } catch (_e) { platformName = t.targetPlatformId; }

    var nextIndex = -1;
    for (var i = 0; i < t.parts.length; i++) {
      if (t.parts[i].status === 'pending') { nextIndex = i; break; }
    }
    var allSent = t.parts.every(function (p) { return p.status === 'sent'; });

    var box = document.createElement('div');
    box.className = 'transfer';
    var h = document.createElement('h4');
    var sub = document.createElement('div');
    sub.className = 'sub';

    if (allSent) {
      h.textContent = 'Transfer complete';
      sub.textContent = 'All ' + t.parts.length + ' part' + (t.parts.length > 1 ? 's' : '') + ' delivered to ' + platformName + '.';
      var doneRow = document.createElement('div');
      doneRow.className = 'row';
      var dismiss = document.createElement('button');
      dismiss.className = 'btn';
      dismiss.textContent = 'Dismiss';
      dismiss.addEventListener('click', async function () {
        await send({ type: 'ABANDON_TRANSFER', transferId: t.id });
        _activeTransfer = null;
        renderTransferProgress();
      });
      doneRow.appendChild(dismiss);
      box.appendChild(h);
      box.appendChild(sub);
      box.appendChild(doneRow);
      slot.appendChild(box);
      return;
    }

    h.textContent = 'Relay transfer — ' + (t.parts.length > 1 ? 'Part ' + (nextIndex + 1) + ' of ' + t.parts.length : 'context ready');
    if (nextIndex < 0) {
      sub.textContent = 'All parts are inserted. Send the final part in the chat below.';
    } else {
      var insertedBefore = nextIndex;
      sub.textContent = insertedBefore === 0
        ? 'The captured conversation is ready to be placed into this chat.'
        : 'Continue delivering the captured conversation to this chat.';
    }
    box.appendChild(h);
    box.appendChild(sub);

    var dots = document.createElement('div');
    dots.className = 'parts-dots';
    dots.setAttribute('role', 'img');
    dots.setAttribute('aria-label', t.parts.map(function (p) {
      return 'Part ' + (p.index + 1) + ' ' + p.status;
    }).join(', '));
    t.parts.forEach(function (p) {
      var d = document.createElement('span');
      d.className = 'pdot ' + p.status + (p.index === nextIndex ? ' current' : '');
      d.title = 'Part ' + (p.index + 1) + ' — ' + p.status;
      dots.appendChild(d);
    });
    box.appendChild(dots);

    var row = document.createElement('div');
    row.className = 'row';
    if (nextIndex >= 0) {
      var insertBtn = document.createElement('button');
      insertBtn.className = 'btn primary';
      insertBtn.textContent = t.parts.length > 1 ? 'Insert part ' + (nextIndex + 1) : 'Insert context';
      insertBtn.addEventListener('click', function () { insertPart(nextIndex); });
      row.appendChild(insertBtn);
    }
    var sentBtn = document.createElement('button');
    sentBtn.className = 'btn';
    sentBtn.textContent = nextIndex >= 0 && nextIndex < t.parts.length - 1
      ? 'Sent it — load next part'
      : 'Sent it — finish transfer';
    sentBtn.addEventListener('click', async function () {
      // "Sent" refers to the most recent INSERTED part (the one the user
      // just sent in the chat), which is the one before the next pending
      // part — or the final part when everything is already inserted.
      var idx = nextIndex > 0 ? nextIndex - 1 : (nextIndex === -1 ? t.parts.length - 1 : -1);
      if (idx < 0) {
        RelayToast.show('Insert the part first, then confirm you sent it.', 'warning');
        return;
      }
      var resp = await send({ type: 'MARK_TRANSFER_PART', transferId: t.id, partIndex: idx, status: 'sent' });
      if (resp && resp.ok) {
        _activeTransfer = resp.transfer;
        renderTransferProgress();
        RelayToast.show('Marked as sent.', 'success', 2500);
      }
    });
    row.appendChild(sentBtn);

    var cancel = document.createElement('button');
    cancel.className = 'btn danger';
    cancel.textContent = 'Cancel transfer';
    cancel.addEventListener('click', async function () {
      await send({ type: 'ABANDON_TRANSFER', transferId: t.id });
      _activeTransfer = null;
      renderTransferProgress();
      RelayToast.show('Transfer cancelled. The archive is untouched.', 'info');
    });
    row.appendChild(cancel);

    box.appendChild(row);
    var note = document.createElement('div');
    note.className = 'sub';
    note.style.marginTop = '8px';
    note.textContent = 'Relay inserts text only — it never presses send for you.';
    box.appendChild(note);
    slot.appendChild(box);
  }

  async function insertPart(partIndex) {
    var t = _activeTransfer;
    if (!t) return;
    var resp = await send({ type: 'GET_TRANSFER_PART', transferId: t.id, partIndex: partIndex });
    if (!resp || !resp.ok) {
      RelayToast.show('Could not load part ' + (partIndex + 1) + '.', 'error');
      return;
    }
    var result = { injected: false, verified: false };
    if (typeof InjectorManager !== 'undefined') {
      result = await InjectorManager.insertPartText(resp.part.text);
    }
    if (result.injected) {
      await send({ type: 'MARK_TRANSFER_PART', transferId: t.id, partIndex: partIndex, status: 'inserted' });
      var fresh = await send({ type: 'GET_TRANSFER', transferId: t.id });
      if (fresh && fresh.ok) _activeTransfer = fresh.transfer;
      renderTransferProgress();
      if (result.verified) {
        RelayToast.show('Part ' + (partIndex + 1) + ' inserted — review and send it in the chat.', 'success', 4500);
      } else {
        RelayToast.show('Part ' + (partIndex + 1) + ' inserted but could not be verified — check the composer before sending.', 'warning', 6000);
      }
    } else {
      RelayToast.show('Could not find the chat input box. Focus the chat and try again, or copy from the Archive page.', 'error', 6000);
    }
  }

  function showConfirm(message) {
    return new Promise(function (resolve) {
      if (!_shadow) { resolve(false); return; }
      var panel = el('relay-panel');
      if (!panel) { resolve(false); return; }
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;border-radius:12px;z-index:10;';
      var boxEl = document.createElement('div');
      boxEl.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;max-width:280px;text-align:center;';
      var p = document.createElement('p');
      p.textContent = message;
      var actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:12px;';
      var yes = document.createElement('button');
      yes.className = 'btn primary';
      yes.textContent = 'Continue';
      var no = document.createElement('button');
      no.className = 'btn';
      no.textContent = 'Cancel';
      function done(r) { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); resolve(r); }
      yes.addEventListener('click', function () { done(true); });
      no.addEventListener('click', function () { done(false); });
      overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); done(false); } });
      actions.appendChild(no);
      actions.appendChild(yes);
      boxEl.appendChild(p);
      boxEl.appendChild(actions);
      overlay.appendChild(boxEl);
      panel.appendChild(overlay);
      no.focus();
    });
  }

  // ============================ Events ==================================

  function _attachPanelEvents() {
    if (_eventsAttached || !_shadow) return;
    _eventsAttached = true;

    el('relay-close-btn').addEventListener('click', function () { _closePanel(); });
    el('relay-settings-btn').addEventListener('click', function () {
      send({ type: 'OPEN_OPTIONS' }).catch(function () {});
    });

    el('relay-fullcapture-btn').addEventListener('click', async function () {
      if (_fullCaptureBusy || typeof RelayContent === 'undefined') return;
      _fullCaptureBusy = true;
      var progress = el('relay-fullcapture-progress');
      var text = el('relay-fullcapture-text');
      progress.hidden = false;
      text.textContent = 'Scrolling to capture older messages…';
      try {
        var result = await RelayContent.runFullCapture(function (p) {
          text.textContent = 'Captured ' + p.captured + ' messages so far…';
        });
        text.textContent = result.reachedTop
          ? 'Full conversation captured (' + result.captured + ' messages).'
          : 'Captured the visible history (' + result.captured + ' messages). The page did not expose older messages.';
        if (result.reason === 'cancelled') text.textContent = 'Capture cancelled — everything captured so far is saved.';
        RelayToast.show(result.reachedTop ? 'Full conversation captured and verified.' : 'Captured what the page could show — older messages may remain unloaded.', result.reachedTop ? 'success' : 'warning', 5000);
      } catch (e) {
        text.textContent = 'Capture failed: ' + String((e && e.message) || e);
      } finally {
        _fullCaptureBusy = false;
        setTimeout(function () { progress.hidden = true; }, 4000);
        refreshState();
      }
    });
    el('relay-fullcapture-cancel').addEventListener('click', function () {
      if (typeof RelayContent !== 'undefined') RelayContent.cancelFullCapture();
    });

    el('relay-review-btn').addEventListener('click', function () {
      openArchiveFor(_state.conversation && _state.conversation.id);
    });
    el('relay-archive-btn').addEventListener('click', function () {
      openArchiveFor(null);
    });

    el('relay-copy-btn').addEventListener('click', async function () {
      var conv = _state.conversation;
      if (!conv) { RelayToast.show('Nothing captured yet.', 'warning'); return; }
      try {
        var resp = await send({ type: 'EXPORT_MARKDOWN', conversationId: conv.id });
        if (!resp || !resp.ok) throw new Error(resp && (resp.error || resp.detail) || 'export failed');
        await navigator.clipboard.writeText(resp.markdown);
        RelayToast.show('Markdown transcript copied.', 'success');
      } catch (e) {
        RelayToast.show('Copy failed: ' + String((e && e.message) || e), 'error');
      }
    });

    el('relay-export-btn').addEventListener('click', async function () {
      var conv = _state.conversation;
      if (!conv) { RelayToast.show('Nothing captured yet.', 'warning'); return; }
      try {
        var resp = await send({ type: 'EXPORT_ARCHIVE', conversationId: conv.id });
        if (!resp || !resp.ok) throw new Error('export failed');
        downloadText(JSON.stringify(resp.export, null, 2), resp.filename || 'relay-conversation.json', 'application/json');
        RelayToast.show('Archive exported.', 'success');
      } catch (e) {
        RelayToast.show('Export failed: ' + String((e && e.message) || e), 'error');
      }
    });

    var grid = el('relay-platform-grid');
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.pcard');
      if (!card) return;
      var id = card.getAttribute('data-platform-id');
      if (!id) return;
      if (id === (_currentPlatform && _currentPlatform.id)) {
        RelayToast.show('You are already on ' + _currentPlatform.name + '.', 'info');
        return;
      }
      handlePlatformPick(id);
    });
    grid.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var cards = Array.from(_shadow.querySelectorAll('.pcard:not([hidden])'));
      if (!cards.length) return;
      var i = cards.indexOf(_shadow.activeElement);
      var next = e.key === 'ArrowDown' ? cards[i + 1] : cards[i - 1];
      if (next) { e.preventDefault(); next.focus(); }
    });

    var search = el('relay-platform-search');
    search.addEventListener('input', function () { filterGrid(search.value); });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        var first = _shadow.querySelector('.pcard:not([hidden])');
        if (first) first.focus();
      } else if (e.key === 'Escape') {
        search.value = '';
        filterGrid('');
      }
    });

    _shadow.querySelectorAll('.modes button').forEach(function (b) {
      b.addEventListener('click', function () {
        _mode = b.getAttribute('data-mode');
        renderModes();
      });
    });

    _shadow.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); _closePanel(); return; }
      if (e.key !== 'Tab' || !_isOpen) return;
      var focusables = Array.from(_shadow.querySelectorAll('button:not([disabled]):not([hidden]), input:not([hidden])'))
        .filter(function (n) { return n.offsetParent !== null || n.tagName === 'INPUT'; });
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && _shadow.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && _shadow.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    document.addEventListener('pointerdown', function (e) {
      if (_isOpen && _panelHost) {
        var path = e.composedPath ? e.composedPath() : [];
        if (!path.includes(_panelHost) && (!_fab || !path.includes(_fab))) _closePanel();
      }
    }, true);
  }

  function openArchiveFor(conversationId) {
    var url = api().runtime.getURL('archive/archive.html' + (conversationId ? '#' + encodeURIComponent(conversationId) : ''));
    window.open(url, '_blank');
  }

  function downloadText(text, filename, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.documentElement.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1000);
  }

  // ============================ Open/close ===============================

  async function _applyTheme() {
    if (!_shadow) return;
    var settings = {};
    try { settings = await RelayStorage.getSettings(); } catch (_e) {}
    var panel = el('relay-panel');
    if (!panel) return;
    if (settings.theme === 'dark') panel.setAttribute('data-theme', 'dark');
    else if (settings.theme === 'light') panel.setAttribute('data-theme', 'light');
    else panel.removeAttribute('data-theme');
  }

  async function _openPanel() {
    if (!_panelHost || !_shadow) return;
    _lastFocused = document.activeElement;
    _panelHost.style.display = 'block';
    _isOpen = true;
    await _applyTheme();
    renderModes();
    renderHealth();
    await refreshState();
    // Destination side: is there a transfer waiting for this platform?
    try {
      if (typeof RelayContent !== 'undefined' && RelayContent.platform) {
        var resp = await send({ type: 'GET_ACTIVE_TRANSFER', platformId: RelayContent.platform.id });
        _activeTransfer = resp && resp.ok ? resp.transfer : null;
      }
    } catch (_e) { _activeTransfer = null; }
    renderTransferProgress();
    var search = el('relay-platform-search');
    if (search) search.focus();
  }

  function _closePanel() {
    if (!_panelHost) return;
    _panelHost.style.display = 'none';
    _isOpen = false;
    // Always clear in-progress previews: a stale preview must never be
    // confirmable after the panel has been closed and reopened.
    _pendingHandoff = null;
    var slot = el('relay-preview-slot');
    var grid = el('relay-platform-grid');
    if (slot) slot.textContent = '';
    if (grid) grid.hidden = false;
    if (_lastFocused && typeof _lastFocused.focus === 'function') {
      try { _lastFocused.focus({ preventScroll: true }); } catch (_e) {}
    }
  }

  function _togglePanel() {
    if (_isOpen) _closePanel();
    else _openPanel();
  }

  // ============================ Public hooks =============================

  function onCaptureResult(result) {
    // Live update while the panel is open. A successful save clears any
    // previous quota-failure warning.
    if (result && result.conversation) {
      _quotaError = false;
      _state.conversation = result.conversation;
      _state.storage = result.storage || _state.storage;
      if (_isOpen) renderHealth();
    }
  }

  function onCaptureQuotaFailure() {
    _quotaError = true;
    if (_isOpen) renderHealth();
  }

  async function onTransferPickup(pickup) {
    if (!pickup || !pickup.pickedUp) return;
    _activeTransfer = pickup.transfer || null;
    if (_isOpen) renderTransferProgress();
    if (pickup.reason === 'inserted' && pickup.verified) {
      RelayToast.show('Relay inserted the context into the composer — review it, then press send yourself.', 'success', 6000);
    } else if (pickup.reason === 'inserted-unverified') {
      RelayToast.show('Relay inserted the context but could not verify it — check the composer before sending.', 'warning', 7000);
    } else if (pickup.reason === 'auto-insert-disabled') {
      RelayToast.show('A transfer is waiting — open the Relay panel to insert it.', 'info', 5000);
    }
  }

  async function init() {
    var settings = await RelayStorage.getSettings();
    if (!settings.showFAB) return;
    _createFAB(settings);
    _createPanel(settings && settings.fabPosition);
    _attachPanelEvents();
    await _applyTheme();
  }

  return {
    init: init,
    openPanel: _openPanel,
    closePanel: _closePanel,
    togglePanel: _togglePanel,
    onCaptureResult: onCaptureResult,
    onCaptureQuotaFailure: onCaptureQuotaFailure,
    onTransferPickup: onTransferPickup,
  };
})();

if (typeof window !== 'undefined') {
  window.FloatingUI = FloatingUI;
  window.RelayToast = RelayToast;
}
