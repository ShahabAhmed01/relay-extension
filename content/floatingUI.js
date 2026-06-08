/**
 * Relay — Floating UI
 * Creates the FAB button and floating panel with Shadow DOM isolation.
 */

const RelayToast = (() => {
  let _container = null;

  function _ensureContainer() {
    if (_container) return _container;
    _container = document.createElement('div');
    _container.id = 'relay-toast-container';
    _container.style.cssText = 'position:fixed;bottom:82px;right:22px;z-index:2147483645;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none;';
    document.body.appendChild(_container);
    return _container;
  }

  function _isDarkMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function show(message, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    const container = _ensureContainer();

    const isDark = _isDarkMode();
    const bgColor = isDark ? 'rgba(14, 14, 18, 0.96)' : 'rgba(255, 255, 255, 0.96)';
    const textColor = isDark ? '#f8f8ff' : '#0d0d14';
    const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

    const toast = document.createElement('div');
    toast.style.cssText = `
      pointer-events:auto;padding:10px 16px;border-radius:10px;
      font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI Variable',system-ui,sans-serif;
      font-size:13px;font-weight:500;color:${textColor};
      backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
      background:${bgColor};border:1px solid ${borderColor};
      box-shadow:0 8px 24px rgba(0,0,0,${isDark ? '0.5' : '0.12'});
      opacity:0;transform:translateY(12px);
      transition:opacity 200ms ease,transform 200ms ease;max-width:280px;
    `;

    const colors = { success: '#10b981', warning: '#f59e0b', error: '#ef4444', info: '#7c3aed' };
    toast.style.borderLeft = '3px solid ' + (colors[type] || colors.info);
    toast.textContent = message;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    const toasts = container.children;
    while (toasts.length > 3) {
      container.removeChild(toasts[0]);
    }

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, duration);
  }

  return { show };
})();

const FloatingUI = (() => {
  let _fab = null;
  let _tooltip = null;
  let _panelHost = null;
  let _shadow = null;
  let _isOpen = false;
  let _currentPlatform = null;
  let _eventsAttached = false;
  let _tooltipTimer = null;

  const RELAY_LOGO_SVG = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7C4 7 7 3 11 3C15 3 17 6 17 6" stroke="white" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M15 4L17 6L14 7" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M18 15C18 15 15 19 11 19C7 19 5 16 5 16" stroke="white" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M7 18L5 16L8 15" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="11" cy="11" r="1.5" fill="white"/></svg>';

  const GEAR_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  const CLOSE_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  const COPY_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

  const TRASH_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function _createFAB(settings) {
    if (!document.getElementById('relay-fab-keyframes')) {
      const kfStyle = document.createElement('style');
      kfStyle.id = 'relay-fab-keyframes';
      kfStyle.textContent = `
        @keyframes relay-pulse-ring {
          0% { box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 0 rgba(124,58,237,0.5); }
          70% { box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 12px rgba(124,58,237,0); }
          100% { box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 0 rgba(124,58,237,0); }
        }
      `;
      document.head.appendChild(kfStyle);
    }

    const pos = (settings && settings.fabPosition) || 'bottom-right';
    const isLeft = pos === 'bottom-left';
    const posStyles = isLeft
      ? 'bottom:22px;left:22px;right:auto;'
      : 'bottom:22px;right:22px;left:auto;';

    const size = (settings && settings.fabSize === 'large') ? 60 : 52;

    _fab = document.createElement('div');
    _fab.id = 'relay-fab';
    _fab.innerHTML = RELAY_LOGO_SVG;
    _fab.setAttribute('role', 'button');
    _fab.setAttribute('aria-label', 'Relay — AI Context Bridge');
    _fab.setAttribute('tabindex', '0');

    _fab.style.cssText = `
      position:fixed;${posStyles}width:${size}px;height:${size}px;border-radius:50%;
      background:#7c3aed;border:1px solid rgba(255,255,255,0.15);
      display:flex;align-items:center;justify-content:center;cursor:pointer;
      z-index:2147483640;
      box-shadow:0 4px 20px rgba(0,0,0,0.4),0 0 0 1px rgba(124,58,237,0.3);
      transition:transform 150ms cubic-bezier(0.16,1,0.3,1),box-shadow 150ms ease;
      user-select:none;-webkit-user-select:none;
    `;

    _fab.addEventListener('mouseenter', () => {
      _fab.style.transform = 'scale(1.06)';
      _fab.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4),0 0 24px rgba(124,58,237,0.6)';
      _tooltipTimer = setTimeout(() => {
        if (_tooltip) {
          _tooltip.style.opacity = '1';
          _tooltip.style.transform = 'translateX(0)';
        }
      }, 300);
    });
    _fab.addEventListener('mouseleave', () => {
      _fab.style.transform = 'scale(1)';
      _fab.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4),0 0 0 1px rgba(124,58,237,0.3)';
      clearTimeout(_tooltipTimer);
      if (_tooltip) {
        _tooltip.style.opacity = '0';
        _tooltip.style.transform = isLeft ? 'translateX(-6px)' : 'translateX(6px)';
      }
    });
    _fab.addEventListener('mousedown', () => { _fab.style.transform = 'scale(0.92)'; });
    _fab.addEventListener('mouseup', () => { _fab.style.transform = 'scale(1.06)'; });

    _fab.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (_tooltip) _tooltip.style.opacity = '0';
      _togglePanel();
    });

    _fab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _togglePanel(); }
    });

    document.body.appendChild(_fab);

    _tooltip = document.createElement('div');
    _tooltip.id = 'relay-fab-tooltip';
    _tooltip.textContent = 'Relay';
    const tooltipRight = isLeft ? 'auto' : '82px';
    const tooltipLeft = isLeft ? '82px' : 'auto';
    const tooltipTransform = isLeft ? 'translateX(-6px)' : 'translateX(6px)';
    _tooltip.style.cssText = `
      position:fixed;${isLeft ? 'left' : 'right'}:82px;bottom:${Math.round(size / 2) + 10}px;z-index:2147483639;
      background:rgba(14,14,18,0.95);color:#f8f8ff;
      font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif;
      font-size:12px;font-weight:500;
      padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);
      backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
      white-space:nowrap;pointer-events:none;
      opacity:0;transform:${tooltipTransform};
      transition:opacity 150ms ease,transform 150ms ease;
    `;
    document.body.appendChild(_tooltip);
  }

  function _createPanel() {
    _panelHost = document.createElement('relay-widget');
    _panelHost.style.cssText = 'position:fixed;bottom:82px;right:22px;z-index:2147483641;display:none;';
    _shadow = _panelHost.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = _getPanelCSS();
    _shadow.appendChild(style);

    const panelContent = document.createElement('div');
    panelContent.id = 'relay-panel-root';
    panelContent.innerHTML = _getPanelHTML();
    _shadow.appendChild(panelContent);

    document.body.appendChild(_panelHost);
  }

  function _getPanelCSS() {
    return `
      :host { all: initial; }
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      #relay-panel {
        --relay-bg-primary: #070709;
        --relay-bg-secondary: #0e0e12;
        --relay-bg-tertiary: #161620;
        --relay-surface: rgba(14, 14, 18, 0.97);
        --relay-accent-from: #6d28d9;
        --relay-accent-to: #0891b2;
        --relay-accent-mid: #7c3aed;
        --relay-accent-soft: rgba(124,58,237,0.12);
        --relay-success: #10b981;
        --relay-warning: #f59e0b;
        --relay-danger: #ef4444;
        --relay-info: #3b82f6;
        --relay-text-primary: #f8f8ff;
        --relay-text-secondary: #94a3b8;
        --relay-text-muted: #4a5568;
        --relay-text-accent: #c4b5fd;
        --relay-border: rgba(255, 255, 255, 0.07);
        --relay-border-accent: rgba(124, 58, 237, 0.35);
        --relay-shadow-lg: 0 25px 60px rgba(0,0,0,0.7), 0 0 80px rgba(124,58,237,0.08);
        --relay-radius-sm: 8px;
        --relay-radius-md: 12px;
        --relay-radius-lg: 16px;
        --relay-ease: cubic-bezier(0.16, 1, 0.3, 1);
        --relay-ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
        --relay-t-fast: 150ms;
        --relay-t-base: 200ms;
        --relay-t-panel: 320ms;
        --relay-font: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI Variable', system-ui, sans-serif;

        width: 340px;
        max-width: calc(100vw - 44px);
        max-height: 560px;
        overflow-y: auto;
        background: var(--relay-surface);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        backdrop-filter: blur(24px) saturate(180%);
        border: 1px solid var(--relay-border);
        border-radius: var(--relay-radius-lg);
        box-shadow: var(--relay-shadow-lg);
        font-family: var(--relay-font);
        color: var(--relay-text-primary);
        padding: 18px;
        animation: relay-panel-in var(--relay-t-panel) var(--relay-ease) forwards;
        -webkit-font-smoothing: antialiased;
      }

      #relay-panel[data-theme="light"] {
        --relay-bg-primary: #f8f9fc;
        --relay-bg-secondary: #ffffff;
        --relay-bg-tertiary: #f1f3f8;
        --relay-surface: rgba(255, 255, 255, 0.97);
        --relay-accent-from: #6d28d9;
        --relay-accent-to: #0891b2;
        --relay-accent-mid: #7c3aed;
        --relay-accent-soft: rgba(109,40,217,0.08);
        --relay-success: #059669;
        --relay-warning: #d97706;
        --relay-danger: #dc2626;
        --relay-info: #2563eb;
        --relay-text-primary: #0d0d14;
        --relay-text-secondary: #4a5568;
        --relay-text-muted: #94a3b8;
        --relay-text-accent: #6d28d9;
        --relay-border: rgba(0, 0, 0, 0.08);
        --relay-border-accent: rgba(109, 40, 217, 0.25);
        --relay-shadow-lg: 0 25px 60px rgba(0,0,0,0.12), 0 0 80px rgba(109,40,217,0.06);
      }

      @media (prefers-color-scheme: light) {
        #relay-panel:not([data-theme="dark"]) {
          --relay-bg-primary: #f8f9fc;
          --relay-bg-secondary: #ffffff;
          --relay-bg-tertiary: #f1f3f8;
          --relay-surface: rgba(255, 255, 255, 0.97);
          --relay-accent-soft: rgba(109,40,217,0.08);
          --relay-success: #059669;
          --relay-warning: #d97706;
          --relay-danger: #dc2626;
          --relay-info: #2563eb;
          --relay-text-primary: #0d0d14;
          --relay-text-secondary: #4a5568;
          --relay-text-muted: #94a3b8;
          --relay-text-accent: #6d28d9;
          --relay-border: rgba(0, 0, 0, 0.08);
          --relay-border-accent: rgba(109, 40, 217, 0.25);
          --relay-shadow-lg: 0 25px 60px rgba(0,0,0,0.12), 0 0 80px rgba(109,40,217,0.06);
        }
      }

      #relay-panel.closing {
        animation: relay-panel-out var(--relay-t-base) var(--relay-ease-smooth) forwards;
      }

      #relay-panel::-webkit-scrollbar { width: 3px; }
      #relay-panel::-webkit-scrollbar-track { background: transparent; }
      #relay-panel::-webkit-scrollbar-thumb { background: var(--relay-accent-mid); border-radius: 3px; }

      .relay-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--relay-border);
      }

      .relay-logo {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: -0.03em;
        color: var(--relay-text-primary);
      }

      .relay-logo-icon {
        width: 26px;
        height: 26px;
        background: var(--relay-accent-mid);
        border-radius: 7px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .relay-logo-icon svg { width: 16px; height: 16px; }

      .relay-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .relay-platform-badge {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 6px;
        background: var(--relay-accent-mid);
        color: white;
      }

      .relay-btn-icon {
        width: 28px;
        height: 28px;
        border-radius: var(--relay-radius-sm);
        border: 1px solid var(--relay-border);
        background: transparent;
        color: var(--relay-text-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all var(--relay-t-fast) ease;
      }

      .relay-btn-icon:hover {
        background: var(--relay-bg-tertiary);
        color: var(--relay-text-primary);
        border-color: var(--relay-border-accent);
      }

      .relay-section { margin-bottom: 16px; }

      .relay-empty-state {
        text-align: center;
        padding: 32px 20px;
        border: 1px dashed var(--relay-border);
        border-radius: var(--relay-radius-md);
      }

      .relay-empty-icon {
        width: 36px;
        height: 36px;
        margin: 0 auto 12px;
        background: var(--relay-bg-tertiary);
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .relay-empty-icon svg { width: 18px; height: 18px; opacity: 0.5; }

      .relay-empty-state p {
        font-size: 13px;
        line-height: 1.5;
        color: var(--relay-text-secondary);
        margin-bottom: 4px;
      }

      .relay-hint {
        font-size: 11px;
        color: var(--relay-text-muted);
      }

      .relay-context-card {
        background: var(--relay-bg-secondary);
        border: 1px solid var(--relay-border);
        border-radius: var(--relay-radius-md);
        padding: 14px;
        position: relative;
        overflow: hidden;
      }

      .relay-context-card::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 2px;
        background: linear-gradient(90deg, var(--relay-accent-from), var(--relay-accent-to));
        opacity: 0.7;
      }

      .relay-context-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 10px;
        flex-wrap: wrap;
      }

      .relay-meta-dot {
        color: var(--relay-text-muted);
        font-size: 10px;
      }

      .relay-msg-count, .relay-time {
        font-size: 11px;
        color: var(--relay-text-secondary);
      }

      .relay-preview-text {
        font-size: 12px;
        color: var(--relay-text-secondary);
        line-height: 1.5;
        margin-bottom: 12px;
        max-height: 54px;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
      }

      .relay-context-actions {
        display: flex;
        gap: 8px;
      }

      .relay-btn-ghost {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        border-radius: var(--relay-radius-sm);
        border: 1px solid var(--relay-border);
        background: transparent;
        color: var(--relay-text-secondary);
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--relay-t-fast) ease;
        font-family: var(--relay-font);
      }

      .relay-btn-ghost:hover {
        background: var(--relay-bg-tertiary);
        color: var(--relay-text-primary);
        border-color: var(--relay-border-accent);
      }

      .relay-btn-ghost.relay-danger:hover {
        border-color: var(--relay-danger);
        color: var(--relay-danger);
      }

      .relay-divider {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 16px 0;
      }

      .relay-divider::before, .relay-divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--relay-border);
      }

      .relay-divider span {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--relay-text-muted);
        white-space: nowrap;
      }

      .relay-platform-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        max-height: 260px;
        overflow-y: auto;
        padding-right: 2px;
      }

      .relay-platform-grid::-webkit-scrollbar { width: 2px; }
      .relay-platform-grid::-webkit-scrollbar-track { background: transparent; }
      .relay-platform-grid::-webkit-scrollbar-thumb { background: var(--relay-accent-mid); border-radius: 2px; }

      .relay-platform-card {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 44px;
        padding: 0 12px 0 0;
        background: var(--relay-bg-secondary);
        border: 1px solid var(--relay-border);
        border-radius: var(--relay-radius-md);
        cursor: pointer;
        transition: all var(--relay-t-fast) var(--relay-ease);
        font-family: var(--relay-font);
        color: var(--relay-text-primary);
        width: 100%;
        text-align: left;
        overflow: hidden;
        position: relative;
      }

      .relay-platform-card::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: var(--platform-color, var(--relay-accent-mid));
        opacity: 0.5;
        transition: opacity var(--relay-t-fast) ease;
      }

      .relay-platform-card:hover {
        border-color: var(--relay-border-accent);
        background: var(--relay-bg-tertiary);
        transform: translateX(2px);
      }

      .relay-platform-card:hover::before {
        opacity: 1;
      }

      .relay-platform-card.current {
        border-color: var(--relay-accent-mid);
        background: var(--relay-accent-soft);
      }

      .relay-platform-card.current::before {
        background: var(--relay-accent-mid);
        opacity: 1;
      }

      .relay-platform-icon {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        margin-left: 10px;
      }

      .relay-platform-icon svg { width: 20px; height: 20px; }

      .relay-platform-name {
        font-size: 12px;
        font-weight: 600;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .relay-switch-arrow {
        font-size: 13px;
        color: var(--relay-text-muted);
        transition: transform var(--relay-t-fast) var(--relay-ease), color var(--relay-t-fast) ease;
      }

      .relay-platform-card:hover .relay-switch-arrow {
        transform: translateX(3px);
        color: var(--relay-text-accent);
      }

      .relay-footer {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid var(--relay-border);
      }

      .relay-storage-bar {
        height: 3px;
        background: var(--relay-bg-tertiary);
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 8px;
      }

      .relay-storage-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--relay-accent-from), var(--relay-accent-to));
        border-radius: 3px;
        transition: width var(--relay-t-base) var(--relay-ease-smooth);
      }

      .relay-footer-text {
        font-size: 10px;
        color: var(--relay-text-muted);
      }

      @keyframes relay-panel-in {
        from { opacity: 0; transform: translateY(10px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes relay-panel-out {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to { opacity: 0; transform: translateY(10px) scale(0.97); }
      }
    `;
  }

  function _getPanelHTML() {
    return `
      <div id="relay-panel">
        <div class="relay-header">
          <div class="relay-logo">
            <div class="relay-logo-icon">
              ${RELAY_LOGO_SVG.replace('width="22"', 'width="16"').replace('height="22"', 'height="16"')}
            </div>
            <span>Relay</span>
          </div>
          <div class="relay-header-actions">
            <span class="relay-platform-badge" id="relay-current-platform">—</span>
            <button class="relay-btn-icon" id="relay-settings-btn" title="Settings">${GEAR_SVG}</button>
            <button class="relay-btn-icon" id="relay-close-btn" title="Close">${CLOSE_SVG}</button>
          </div>
        </div>

        <div class="relay-section" id="relay-status-section">
          <div id="relay-empty-state">
            <div class="relay-empty-icon">
              ${RELAY_LOGO_SVG.replace('width="22"', 'width="18"').replace('height="22"', 'height="18"')}
            </div>
            <p>Chat on any AI site to begin<br>capturing context.</p>
            <p class="relay-hint">Relay runs silently in the background.</p>
          </div>

          <div id="relay-active-state" style="display:none">
            <div class="relay-context-card">
              <div class="relay-context-meta">
                <span class="relay-platform-badge" id="relay-session-platform">—</span>
                <span class="relay-meta-dot">·</span>
                <span class="relay-msg-count" id="relay-session-count">0 msgs</span>
                <span class="relay-meta-dot">·</span>
                <span class="relay-time" id="relay-session-time">—</span>
              </div>
              <div class="relay-preview-text" id="relay-preview-text">No preview available.</div>
              <div class="relay-context-actions">
                <button class="relay-btn-ghost" id="relay-copy-btn">${COPY_SVG} Copy Context</button>
                <button class="relay-btn-ghost relay-danger" id="relay-clear-btn">${TRASH_SVG} Clear</button>
              </div>
            </div>
          </div>
        </div>

        <div class="relay-divider"><span>Continue on</span></div>

        <div class="relay-section">
          <div class="relay-platform-grid" id="relay-platform-grid"></div>
        </div>

        <div class="relay-footer">
          <div class="relay-storage-bar">
            <div class="relay-storage-fill" id="relay-storage-fill" style="width:0%"></div>
          </div>
          <span class="relay-footer-text" id="relay-footer-text">0 KB · 0 messages stored</span>
        </div>
      </div>
    `;
  }

  function _attachPanelEvents() {
    if (_eventsAttached || !_shadow) return;
    _eventsAttached = true;

    const closeBtn = _shadow.getElementById('relay-close-btn');
    const settingsBtn = _shadow.getElementById('relay-settings-btn');
    const copyBtn = _shadow.getElementById('relay-copy-btn');
    const clearBtn = _shadow.getElementById('relay-clear-btn');
    const grid = _shadow.getElementById('relay-platform-grid');

    if (closeBtn) closeBtn.addEventListener('click', () => _closePanel());
    if (settingsBtn) settingsBtn.addEventListener('click', () => {
      const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
      if (api && api.runtime && api.runtime.sendMessage) {
        api.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
      }
    });

    if (copyBtn) copyBtn.addEventListener('click', async () => {
      const session = await RelayStorage.getSession();
      if (!session) return;
      const settings = await RelayStorage.getSettings();
      const formatted = RelayFormatter.format(session, settings);
      try {
        await navigator.clipboard.writeText(formatted);
        RelayToast.show('Copied to clipboard', 'info');
      } catch (e) {
        RelayToast.show('Failed to copy', 'error');
      }
    });

    if (clearBtn) clearBtn.addEventListener('click', async () => {
      await RelayStorage.clearSession();
      _updatePanelContent();
      RelayToast.show('Session cleared', 'info');
    });

    if (grid) {
      grid.addEventListener('click', async (e) => {
        const card = e.target.closest('.relay-platform-card');
        if (!card) return;
        const platformId = card.getAttribute('data-platform-id');
        if (!platformId) return;

        const platform = RelayPlatforms.getPlatformById(platformId);
        if (!platform) return;

        const session = await RelayStorage.getSession();
        if (!session || session.messages.length === 0) {
          RelayToast.show('No context captured yet', 'warning');
          return;
        }

        const settings = await RelayStorage.getSettings();
        
        if (settings && settings.confirmBeforeSwitch) {
          if (!confirm('Switch to ' + platform.name + ' and bring your conversation context?')) {
            return;
          }
        }

        const formatted = RelayFormatter.format(session, settings);

        await RelayStorage.setPendingInjection({
          targetPlatformId: platformId,
          formattedContext: formatted,
        });

        const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
        if (api && api.runtime && api.runtime.sendMessage) {
          api.runtime.sendMessage({ type: 'OPEN_PLATFORM', platformId: platform.id }, async (response) => {
            if (!response || !response.success) {
              await RelayStorage.clearPendingInjection();
              if (typeof RelayToast !== 'undefined') RelayToast.show('Failed to open platform: ' + (response?.error || 'Unknown error'), 'error');
            }
          });
        } else {
          window.open(platform.url, '_blank');
        }

        RelayToast.show('Switching to ' + platform.name, 'success');
        setTimeout(() => _closePanel(), 500);
      });
    }

    document.addEventListener('click', (e) => {
      if (_isOpen && _panelHost) {
        const path = e.composedPath();
        if (!path.includes(_panelHost) && (!_fab || !path.includes(_fab))) {
          _closePanel();
        }
      }
    });
  }

  async function _updatePanelContent() {
    if (!_shadow) return;

    const session = await RelayStorage.getSession();
    const platform = typeof RelayPlatforms !== 'undefined'
      ? RelayPlatforms.detectPlatform(window.location.hostname)
      : null;

    _currentPlatform = platform;

    const currentBadge = _shadow.getElementById('relay-current-platform');
    if (currentBadge) {
      currentBadge.textContent = platform ? platform.name : 'Ready';
    }

    const emptyState = _shadow.getElementById('relay-empty-state');
    const activeState = _shadow.getElementById('relay-active-state');

    if (session && session.messages && session.messages.length > 0) {
      if (emptyState) emptyState.style.display = 'none';
      if (activeState) activeState.style.display = 'block';

      const sessionPlatform = _shadow.getElementById('relay-session-platform');
      const sessionCount = _shadow.getElementById('relay-session-count');
      const sessionTime = _shadow.getElementById('relay-session-time');
      const previewText = _shadow.getElementById('relay-preview-text');

      if (sessionPlatform) sessionPlatform.textContent = session.platformName || session.platformId;
      if (sessionCount) sessionCount.textContent = session.messageCount + ' msgs';
      if (sessionTime) sessionTime.textContent = RelayFormatter.timeAgo(session.updatedAt);
      if (previewText) previewText.textContent = RelayFormatter.formatSummary(session);
    } else {
      if (emptyState) emptyState.style.display = 'block';
      if (activeState) activeState.style.display = 'none';
    }

    const grid = _shadow.getElementById('relay-platform-grid');
    if (grid) {
      grid.textContent = '';
      const platforms = RelayPlatforms.getAllPlatforms();
      platforms.forEach((p) => {
        const card = document.createElement('button');
        card.className = 'relay-platform-card';
        if (platform && platform.id === p.id) card.classList.add('current');
        card.setAttribute('data-platform-id', p.id);
        card.style.setProperty('--platform-color', p.color);

        const icon = document.createElement('span');
        icon.className = 'relay-platform-icon';
        icon.innerHTML = p.logoSvg;

        const name = document.createElement('span');
        name.className = 'relay-platform-name';
        name.textContent = p.name;

        const arrow = document.createElement('span');
        arrow.className = 'relay-switch-arrow';
        arrow.textContent = '→';

        card.appendChild(icon);
        card.appendChild(name);
        card.appendChild(arrow);
        grid.appendChild(card);
      });
    }

    const usage = await RelayStorage.getStorageUsage();
    const fill = _shadow.getElementById('relay-storage-fill');
    const footerText = _shadow.getElementById('relay-footer-text');
    const pct = Math.min((usage.kb / 7000) * 100, 100);
    if (fill) fill.style.width = pct + '%';
    if (footerText) footerText.textContent = usage.kb + ' KB · ' + (session ? session.messageCount : 0) + ' messages stored';
  }

  function _togglePanel() {
    if (_isOpen) {
      _closePanel();
    } else {
      _openPanel();
    }
  }

  async function _openPanel() {
    if (!_panelHost) return;
    _panelHost.style.display = 'block';
    _isOpen = true;
    await _applyTheme();
    await _updatePanelContent();
  }

  function _closePanel() {
    if (!_panelHost || !_shadow) return;
    const panel = _shadow.getElementById('relay-panel');
    if (panel) {
      panel.classList.add('closing');
      setTimeout(() => {
        _panelHost.style.display = 'none';
        panel.classList.remove('closing');
        _isOpen = false;
      }, 200);
    } else {
      _panelHost.style.display = 'none';
      _isOpen = false;
    }
  }

  function setFABPulse(active) {
    if (!_fab) return;
    if (active) {
      _fab.style.animation = 'relay-pulse-ring 2s infinite';
    } else {
      _fab.style.animation = 'none';
    }
  }

  async function _applyTheme() {
    if (!_shadow) return;
    const settings = await RelayStorage.getSettings();
    const theme = settings.theme || 'system';

    const panel = _shadow.getElementById('relay-panel');
    if (!panel) return;

    if (theme === 'dark') {
      panel.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      panel.setAttribute('data-theme', 'light');
    } else {
      panel.removeAttribute('data-theme');
    }
  }

  async function init() {
    const settings = await RelayStorage.getSettings();
    if (!settings.showFAB) return;

    _createFAB(settings);
    _createPanel();
    _attachPanelEvents();
    await _applyTheme();

    const session = await RelayStorage.getSession();
    if (session && session.messages && session.messages.length > 0) {
      setFABPulse(true);
    }
  }

  return { init, setFABPulse, openPanel: _openPanel, closePanel: _closePanel };
})();

if (typeof window !== 'undefined') {
  window.FloatingUI = FloatingUI;
  window.RelayToast = RelayToast;
}
