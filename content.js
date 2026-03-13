/* content.js – injected into every page */
(function () {
  'use strict';
  if (document.getElementById('__pb_frame__')) return; // already injected

  /* ── Styles injected into the HOST page ─────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    #__pb_toggle__ {
      position: fixed;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      z-index: 2147483646;
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 10px 0 0 10px;
      padding: 18px 7px;
      cursor: pointer;
      writing-mode: vertical-lr;
      text-orientation: mixed;
      font-size: 11px;
      font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      letter-spacing: 3px;
      text-transform: uppercase;
      box-shadow: -3px 0 14px rgba(37,99,235,0.45);
      transition: right 0.3s ease, background 0.2s;
      line-height: 1;
      user-select: none;
    }
    #__pb_toggle__:hover { background: #1d4ed8; }

    #__pb_frame__ {
      position: fixed;
      top: 0;
      right: -500px;
      width: 500px;
      height: 100vh;
      border: none;
      z-index: 2147483647;
      box-shadow: -6px 0 32px rgba(0,0,0,0.18);
      transition: right 0.3s ease;
      background: #fff;
      border-radius: 0;
    }
    #__pb_frame__.pb-open { right: 0; }

    #__pb_resize__ {
      position: fixed;
      top: 0;
      right: -500px;
      width: 5px;
      height: 100vh;
      z-index: 2147483648;
      cursor: ew-resize;
      background: transparent;
      transition: right 0.3s ease;
    }
    #__pb_resize__.pb-open { right: 495px; }
    #__pb_resize__:hover, #__pb_resize__.dragging { background: rgba(37,99,235,0.35); }
  `;
  document.head.appendChild(style);

  /* ── Toggle button ───────────────────────────────────────────────────────── */
  const toggle = document.createElement('button');
  toggle.id = '__pb_toggle__';
  toggle.textContent = 'Playbook';
  toggle.title = 'Toggle Interview Playbook';
  document.body.appendChild(toggle);

  /* ── Sidebar iframe ──────────────────────────────────────────────────────── */
  const frame = document.createElement('iframe');
  frame.id = '__pb_frame__';
  frame.src = chrome.runtime.getURL('sidebar.html');
  frame.allow = 'clipboard-write';
  document.body.appendChild(frame);

  /* ── Resize handle ───────────────────────────────────────────────────────── */
  const resizeHandle = document.createElement('div');
  resizeHandle.id = '__pb_resize__';
  document.body.appendChild(resizeHandle);

  let isOpen = false;
  let sidebarWidth = 500;

  function open() {
    isOpen = true;
    // Always use inline style — it beats the CSS class when resize has run
    frame.style.right = '0';
    resizeHandle.style.right = (sidebarWidth - 5) + 'px';
    toggle.style.right = sidebarWidth + 'px';
    toggle.textContent = 'Close';
  }
  function close() {
    isOpen = false;
    // Must set inline right explicitly; removing the class alone is not enough
    // because the resize handler wrote an inline style that overrides CSS classes.
    frame.style.right = '-' + sidebarWidth + 'px';
    resizeHandle.style.right = '-' + sidebarWidth + 'px';
    toggle.style.right = '0';
    toggle.textContent = 'Playbook';
  }

  toggle.addEventListener('click', () => (isOpen ? close() : open()));

  /* ── Resize logic ────────────────────────────────────────────────────────── */
  let resizing = false, startX = 0, startWidth = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    resizing = true;
    startX = e.clientX;
    startWidth = sidebarWidth;
    resizeHandle.classList.add('dragging');
    // Disable pointer events on the iframe so it doesn't capture mousemove/mouseup
    // while the drag is in progress — this is the classic iframe drag-break bug.
    frame.style.pointerEvents = 'none';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const delta = startX - e.clientX;
    const newW = Math.min(800, Math.max(320, startWidth + delta));
    sidebarWidth = newW;
    frame.style.width = newW + 'px';
    frame.style.right = isOpen ? '0' : -newW + 'px';
    resizeHandle.style.right = isOpen ? newW - 5 + 'px' : -newW + 'px';
    toggle.style.right = isOpen ? newW + 'px' : '0';
  });

  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    resizeHandle.classList.remove('dragging');
    frame.style.pointerEvents = ''; // restore iframe interactivity
    document.body.style.userSelect = '';
  });
})();
