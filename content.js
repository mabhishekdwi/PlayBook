/* content.js – injected into every page */
(function () {
  'use strict';
  if (document.getElementById('__pb_container__')) return;

  const MIN_W = 320, MIN_H = 220;
  const DEFAULT_W = 520, DEFAULT_H = 680;

  let isOpen      = false;
  let isMinimized = false;
  let isMaximized = false;
  let savedRect   = null; // rect saved before maximize

  /* ── Styles injected into the HOST page ───────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    /* ── Re-open toggle (shown only when window is closed) ── */
    #__pb_toggle__ {
      position: fixed;
      right: 0; top: 50%;
      transform: translateY(-50%);
      z-index: 2147483646;
      background: #2563eb; color: #fff;
      border: none; border-radius: 10px 0 0 10px;
      padding: 18px 7px; cursor: pointer;
      writing-mode: vertical-lr; text-orientation: mixed;
      font-size: 11px; font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      letter-spacing: 3px; text-transform: uppercase;
      box-shadow: -3px 0 14px rgba(37,99,235,0.45);
      line-height: 1; user-select: none;
      transition: background 0.2s;
    }
    #__pb_toggle__:hover { background: #1d4ed8; }

    /* ── Floating window container ── */
    #__pb_container__ {
      position: fixed;
      top: 60px; right: 60px;
      width: ${DEFAULT_W}px; height: ${DEFAULT_H}px;
      min-width: ${MIN_W}px; min-height: ${MIN_H}px;
      z-index: 2147483647;
      border-radius: 10px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.36), 0 2px 8px rgba(0,0,0,0.14);
      display: none; flex-direction: column;
      border: 1px solid rgba(255,255,255,0.06);
      background: #fff; overflow: hidden;
    }
    #__pb_container__.pb-open { display: flex; }

    /* ── Title bar (drag handle + window controls) ── */
    #__pb_titlebar__ {
      height: 40px; flex-shrink: 0;
      background: #0f172a;
      display: flex; align-items: center;
      padding: 0 0 0 12px;
      cursor: grab; user-select: none;
      border-radius: 10px 10px 0 0;
    }
    #__pb_titlebar__:active { cursor: grabbing; }

    /* Windows-style title bar buttons (right side) */
    .pb-win-btns { display: flex; flex-shrink: 0; margin-right: -12px; }
    .pb-win-btn {
      width: 46px; height: 40px; border-radius: 0;
      border: none; cursor: pointer; padding: 0; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: transparent; color: #94a3b8;
      font-size: 12px; font-family: 'Segoe UI', sans-serif;
      transition: background 0.1s, color 0.1s;
    }
    .pb-win-btn:hover        { background: rgba(255,255,255,0.12); color: #fff; }
    #pb-btn-close:hover      { background: #e81123; color: #fff; }
    #pb-btn-maximize:hover   { background: rgba(255,255,255,0.12); color: #fff; }

    .pb-title-text {
      flex: 1;
      font-size: 12px; font-weight: 600; color: #94a3b8;
      pointer-events: none; letter-spacing: 0.3px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding-left: 8px;
    }

    /* ── Iframe fills remainder of container ── */
    #__pb_frame__ {
      flex: 1; border: none; width: 100%; min-height: 0; display: block;
    }

    /* ── 8-direction resize handles ── */
    .pb-rz { position: absolute; z-index: 10; }
    .pb-rz-n  { top:-3px;    left:8px;    right:8px;   height:6px;  cursor:n-resize;  }
    .pb-rz-s  { bottom:-3px; left:8px;    right:8px;   height:6px;  cursor:s-resize;  }
    .pb-rz-w  { left:-3px;   top:8px;     bottom:8px;  width:6px;   cursor:w-resize;  }
    .pb-rz-e  { right:-3px;  top:8px;     bottom:8px;  width:6px;   cursor:e-resize;  }
    .pb-rz-nw { top:-3px;    left:-3px;   width:12px;  height:12px; cursor:nw-resize; }
    .pb-rz-ne { top:-3px;    right:-3px;  width:12px;  height:12px; cursor:ne-resize; }
    .pb-rz-sw { bottom:-3px; left:-3px;   width:12px;  height:12px; cursor:sw-resize; }
    .pb-rz-se { bottom:-3px; right:-3px;  width:12px;  height:12px; cursor:se-resize; }

    /* ── Minimized: collapse to just the titlebar ── */
    #__pb_container__.pb-minimized { height: 40px !important; min-height: 40px; border-radius: 10px; }
    #__pb_container__.pb-minimized #__pb_frame__ { display: none; }
    #__pb_container__.pb-minimized .pb-rz { display: none; }
    #__pb_container__.pb-minimized #__pb_titlebar__ { border-radius: 10px; }

    /* ── Maximized: fill viewport ── */
    #__pb_container__.pb-maximized {
      top: 0 !important; left: 0 !important;
      width: 100vw !important; height: 100vh !important;
      border-radius: 0 !important;
    }
    #__pb_container__.pb-maximized .pb-rz { display: none; }
    #__pb_container__.pb-maximized #__pb_titlebar__ { border-radius: 0; }
  `;
  document.head.appendChild(style);

  /* ── Re-open toggle button ─────────────────────────────────────────────────── */
  const toggle = document.createElement('button');
  toggle.id = '__pb_toggle__';
  toggle.textContent = 'Playbook';
  toggle.title = 'Open Interview Playbook';
  document.body.appendChild(toggle);

  /* ── Floating container ────────────────────────────────────────────────────── */
  const container = document.createElement('div');
  container.id = '__pb_container__';

  // 8 resize handles
  ['n','s','e','w','nw','ne','sw','se'].forEach(dir => {
    const h = document.createElement('div');
    h.className = `pb-rz pb-rz-${dir}`;
    h.dataset.dir = dir;
    container.appendChild(h);
  });

  // Title bar
  const titlebar = document.createElement('div');
  titlebar.id = '__pb_titlebar__';
  titlebar.innerHTML = `
    <span class="pb-title-text">Interview Playbook</span>
    <div class="pb-win-btns">
      <button class="pb-win-btn" id="pb-btn-minimize" title="Minimize">&#x2212;</button>
      <button class="pb-win-btn" id="pb-btn-maximize" title="Maximize / Restore">&#x25A1;</button>
      <button class="pb-win-btn" id="pb-btn-close"    title="Close">&#x2715;</button>
    </div>
  `;
  container.appendChild(titlebar);

  // iframe
  const frame = document.createElement('iframe');
  frame.id = '__pb_frame__';
  frame.src = chrome.runtime.getURL('sidebar.html');
  frame.allow = 'clipboard-write';
  container.appendChild(frame);

  document.body.appendChild(container);

  /* ── Window state helpers ──────────────────────────────────────────────────── */
  function openWindow() {
    isOpen = true;
    container.classList.add('pb-open');
    toggle.style.display = 'none';
  }

  function closeWindow() {
    isOpen = false;
    isMinimized = false;
    isMaximized = false;
    container.classList.remove('pb-open', 'pb-minimized', 'pb-maximized');
    toggle.style.display = '';
  }

  function minimizeWindow() {
    if (isMaximized) restoreMaximize();
    isMinimized = !isMinimized;
    container.classList.toggle('pb-minimized', isMinimized);
  }

  function toggleMaximize() {
    if (isMinimized) {
      isMinimized = false;
      container.classList.remove('pb-minimized');
    }
    if (!isMaximized) {
      // Save current geometry for restore
      const r = container.getBoundingClientRect();
      savedRect = {
        top:    r.top    + 'px',
        left:   r.left   + 'px',
        width:  r.width  + 'px',
        height: r.height + 'px',
      };
      // Pin by left/top before maximize so restore works cleanly
      container.style.top    = savedRect.top;
      container.style.left   = savedRect.left;
      container.style.right  = 'auto';
      container.style.width  = savedRect.width;
      container.style.height = savedRect.height;
      container.classList.add('pb-maximized');
      isMaximized = true;
    } else {
      restoreMaximize();
    }
  }

  function restoreMaximize() {
    container.classList.remove('pb-maximized');
    isMaximized = false;
    if (savedRect) {
      container.style.top    = savedRect.top;
      container.style.left   = savedRect.left;
      container.style.right  = 'auto';
      container.style.width  = savedRect.width;
      container.style.height = savedRect.height;
    }
  }

  toggle.addEventListener('click', openWindow);
  document.getElementById('pb-btn-close').addEventListener('click', closeWindow);
  document.getElementById('pb-btn-minimize').addEventListener('click', minimizeWindow);
  document.getElementById('pb-btn-maximize').addEventListener('click', toggleMaximize);
  titlebar.addEventListener('dblclick', (e) => {
    if (!e.target.closest('.pb-win-btn')) toggleMaximize();
  });

  /* ── Drag (move) ───────────────────────────────────────────────────────────── */
  let dragging = false;
  let dragStartX = 0, dragStartY = 0, dragOrigLeft = 0, dragOrigTop = 0;

  titlebar.addEventListener('mousedown', (e) => {
    if (e.target.closest('.pb-win-btn')) return;
    if (isMaximized) return;
    dragging = true;
    const r = container.getBoundingClientRect();
    dragOrigLeft = r.left;
    dragOrigTop  = r.top;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    // Switch to left/top positioning so drag math is straightforward
    container.style.left  = dragOrigLeft + 'px';
    container.style.right = 'auto';
    container.style.top   = dragOrigTop  + 'px';
    frame.style.pointerEvents = 'none';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    container.style.left = (dragOrigLeft + e.clientX - dragStartX) + 'px';
    container.style.top  = (dragOrigTop  + e.clientY - dragStartY) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    frame.style.pointerEvents = '';
    document.body.style.userSelect = '';
  });

  /* ── Resize (8 directions) ─────────────────────────────────────────────────── */
  let resizing = false, resDir = '';
  let rsX = 0, rsY = 0, rsL = 0, rsT = 0, rsW = 0, rsH = 0;

  container.querySelectorAll('.pb-rz').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      if (isMaximized || isMinimized) return;
      resizing = true;
      resDir = handle.dataset.dir;
      rsX = e.clientX;
      rsY = e.clientY;
      const r = container.getBoundingClientRect();
      rsL = r.left; rsT = r.top; rsW = r.width; rsH = r.height;
      // Fix to left/top so resize math works in all directions
      container.style.left  = rsL + 'px';
      container.style.right = 'auto';
      container.style.top   = rsT + 'px';
      frame.style.pointerEvents = 'none';
      document.body.style.userSelect = 'none';
      e.preventDefault();
      e.stopPropagation();
    });
  });

  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const dx = e.clientX - rsX;
    const dy = e.clientY - rsY;
    let l = rsL, t = rsT, w = rsW, h = rsH;

    if (resDir.includes('e')) w = Math.max(MIN_W, rsW + dx);
    if (resDir.includes('s')) h = Math.max(MIN_H, rsH + dy);
    if (resDir.includes('w')) { w = Math.max(MIN_W, rsW - dx); l = rsL + (rsW - w); }
    if (resDir.includes('n')) { h = Math.max(MIN_H, rsH - dy); t = rsT + (rsH - h); }

    container.style.left   = l + 'px';
    container.style.top    = t + 'px';
    container.style.width  = w + 'px';
    container.style.height = h + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    frame.style.pointerEvents = '';
    document.body.style.userSelect = '';
  });
})();
