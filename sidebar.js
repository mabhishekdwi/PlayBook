/* sidebar.js –  Playbook  (contenteditable edition) */
'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let pages        = [];
let folders      = [];      // [{ id, title, collapsed }]
let activePageId = null;
let saveTimer    = null;
let sortables    = [];      // all Sortable instances (for cleanup)
let isDirty      = false;
let editor       = null;    // the contenteditable div
let sidebarResizing  = false;
let sidebarResizeX0  = 0;
let sidebarResizeW0  = 0;

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  editor = document.getElementById('editor');
  initEditor();
  loadFromStorage();
  bindGlobalEvents();
  initSidebarResize();
});

// ─── Editor ───────────────────────────────────────────────────────────────────
function initEditor() {
  // Track changes for auto-save
  editor.addEventListener('input', () => {
    if (activePageId) { isDirty = true; scheduleSave(); }
  });

  setupToolbar();
  setupPasteHandler();
}

function setContent(html) {
  editor.innerHTML = html || '<p><br></p>';
  isDirty = false;
}

function getContent() {
  return editor.innerHTML;
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────
function setupToolbar() {
  // All plain execCommand buttons (Bold, Italic, lists, indent…)
  document.querySelectorAll('.tb-btn[data-cmd]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep editor focus
      document.execCommand(btn.dataset.cmd, false, null);
      updateToolbarState();
      isDirty = true; scheduleSave();
    });
  });

  // Format-block dropdown
  document.getElementById('fmt-block').addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
  document.getElementById('fmt-block').addEventListener('change', (e) => {
    document.execCommand('formatBlock', false, e.target.value);
    editor.focus();
    updateToolbarState();
  });

  // Code block
  document.getElementById('btn-tb-code').addEventListener('mousedown', (e) => {
    e.preventDefault();
    insertCodeBlock();
  });

  // Blockquote
  document.getElementById('btn-tb-quote').addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.execCommand('formatBlock', false, 'blockquote');
    editor.focus();
    isDirty = true; scheduleSave();
  });

  // Link
  document.getElementById('btn-tb-link').addEventListener('mousedown', (e) => {
    e.preventDefault();
    const url = prompt('Enter URL (e.g. https://example.com):');
    if (url && url.trim()) {
      document.execCommand('createLink', false, url.trim());
      isDirty = true; scheduleSave();
    }
    editor.focus();
  });

  // Keep toolbar state in sync with cursor position
  document.addEventListener('selectionchange', () => {
    if (editor.contains(document.activeElement) || document.activeElement === editor) {
      updateToolbarState();
    }
  });
  editor.addEventListener('keyup',   updateToolbarState);
  editor.addEventListener('mouseup', updateToolbarState);
}

function updateToolbarState() {
  // Toggle active state on format buttons
  ['bold', 'italic', 'underline', 'strikeThrough'].forEach((cmd) => {
    const btn = document.querySelector(`.tb-btn[data-cmd="${cmd}"]`);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });

  // Sync heading selector
  const tag  = (document.queryCommandValue('formatBlock') || 'p').toLowerCase().replace(/[^a-z0-9]/g, '');
  const sel  = document.getElementById('fmt-block');
  const norm = ['h1','h2','h3'].includes(tag) ? tag : 'p';
  if (sel.value !== norm) sel.value = norm;
}

function insertCodeBlock() {
  const sel  = window.getSelection();
  const text = sel ? sel.toString() : '';

  const pre = document.createElement('pre');
  pre.className = 'code-block';
  pre.textContent = text || 'code here';

  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    range.deleteContents();

    // Walk up to find the direct child of the editor so we insert at block boundary
    let anchor = range.startContainer;
    if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
    while (anchor && anchor.parentNode !== editor) anchor = anchor.parentNode;

    if (anchor && anchor !== editor) {
      anchor.insertAdjacentElement('afterend', pre);
    } else {
      editor.appendChild(pre);
    }
  } else {
    editor.appendChild(pre);
  }

  // Place cursor at end of code block
  const r = document.createRange();
  r.selectNodeContents(pre);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
  editor.focus();
  isDirty = true; scheduleSave();
}

// ─── Paste Interceptor ────────────────────────────────────────────────────────
// Without Quill/Parchment there is NO normalisation layer — pasted HTML goes
// straight into the contenteditable DOM exactly as we leave it after sanitising.
function setupPasteHandler() {
  editor.addEventListener('paste', (e) => {
    const html = e.clipboardData.getData('text/html');
    if (!html) return; // no HTML → let the browser insert plain text normally

    e.preventDefault();

    const clean = sanitizePastedHtml(html);

    // Insert at cursor's block boundary (never inside a paragraph)
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();

      // Find direct-child-of-editor ancestor so we paste AFTER a whole block
      let anchor = sel.anchorNode;
      if (anchor && anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
      while (anchor && anchor.parentNode !== editor) anchor = anchor.parentNode;

      if (anchor && anchor !== editor) {
        anchor.insertAdjacentHTML('afterend', clean);
      } else {
        editor.insertAdjacentHTML('beforeend', clean);
      }
    } else {
      editor.insertAdjacentHTML('beforeend', clean);
    }

    isDirty = true;
    scheduleSave();
  });
}

// ─── HTML Sanitiser ───────────────────────────────────────────────────────────
function sanitizePastedHtml(rawHtml) {
  const doc  = new DOMParser().parseFromString(rawHtml, 'text/html');
  const body = doc.body;

  // ① Drop noise
  body.querySelectorAll(
    'script,style,link,meta,noscript,button,input,select,textarea,' +
    'svg,canvas,video,audio,iframe,form,nav,footer,header'
  ).forEach((el) => el.remove());

  // ② Fix code blocks (ChatGPT, GitHub, etc.) before any div-unwrapping
  body.querySelectorAll('pre').forEach((pre) => {
    const codeEl  = pre.querySelector('code');
    const rawText = (codeEl ?? pre).innerText ?? (codeEl ?? pre).textContent ?? '';
    const newPre  = doc.createElement('pre');
    newPre.className = 'code-block';
    newPre.textContent = rawText.replace(/^\n+|\n+$/g, '');
    pre.replaceWith(newPre);
  });

  // ③ Unwrap presentational divs/spans (Tailwind wrappers, ChatGPT chrome, etc.)
  //    Never unwrap inside table cells or our <pre> blocks.
  const TABLE_TAGS = new Set(['TABLE','THEAD','TBODY','TFOOT','TR','TD','TH']);

  function unwrap(el) {
    if (!el.parentNode) return;
    let a = el.parentNode;
    while (a && a !== body) {
      if (TABLE_TAGS.has(a.tagName) || a.tagName === 'PRE') return;
      a = a.parentNode;
    }
    const p = el.parentNode;
    while (el.firstChild) p.insertBefore(el.firstChild, el);
    p.removeChild(el);
  }

  for (let pass = 0; pass < 10; pass++) {
    const els = Array.from(body.querySelectorAll('div,span'));
    if (!els.length) break;
    els.forEach(unwrap);
  }

  // ④ Strip non-semantic attributes; keep only what matters
  const KEEP = {
    a:        ['href','target','title'],
    img:      ['src','alt','width','height'],
    td:       ['colspan','rowspan','align','valign','width'],
    th:       ['colspan','rowspan','align','valign','scope','width'],
    col:      ['span','width'],
    colgroup: ['span'],
    pre:      ['class'],
    ol:       ['start','type'],
    li:       ['value'],
  };
  body.querySelectorAll('*').forEach((el) => {
    const ok = KEEP[el.tagName.toLowerCase()] || [];
    Array.from(el.attributes).forEach((attr) => {
      if (!ok.includes(attr.name)) { try { el.removeAttribute(attr.name); } catch(_) {} }
    });
  });

  // ⑤ Ensure tables have thead/tbody for CSS striping to work
  body.querySelectorAll('table').forEach((tbl) => {
    const orphanRows = Array.from(tbl.querySelectorAll(':scope > tr'));
    if (orphanRows.length) {
      const tbody = doc.createElement('tbody');
      orphanRows.forEach((r) => tbody.appendChild(r));
      tbl.appendChild(tbody);
    }
  });

  // ⑥ Remove empty block elements that create blank lines
  body.querySelectorAll('p,h1,h2,h3,h4,h5,h6').forEach((el) => {
    if (!el.textContent.trim() && !el.querySelector('img,br')) el.remove();
  });

  return body.innerHTML;
}

// ─── Storage ──────────────────────────────────────────────────────────────────
function loadFromStorage() {
  chrome.storage.local.get(['pb_pages','pb_active','pb_folders'], (result) => {
    pages        = (result.pb_pages   || []).map((p) => ({ folderId: null, ...p }));
    folders      = result.pb_folders  || [];
    activePageId = result.pb_active   || null;

    if (pages.length === 0) {
      createPage('Getting Started', buildWelcomeContent(), false);
    } else {
      renderPagesList();
      const target = pages.find((p) => p.id === activePageId) || pages[0];
      activatePage(target.id);
    }
  });
}

function persist() {
  chrome.storage.local.set({ pb_pages: pages, pb_active: activePageId, pb_folders: folders });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushCurrentPage, 600);
}

function flushCurrentPage() {
  if (!activePageId || !isDirty) return;
  const page = findPage(activePageId);
  if (!page) return;
  page.content = getContent();
  page.title   = titleVal();
  syncListTitle(page.id, page.title);
  persist();
  isDirty = false;
}

// ─── Page CRUD ────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function findPage(id) { return pages.find((p) => p.id === id); }
function titleVal() { return document.getElementById('page-title-input').value.trim() || 'Untitled'; }

function createPage(title = 'New Page', content = '', doFlush = true, folderId = null) {
  if (doFlush) flushCurrentPage();
  const page = { id: uid(), title, content, folderId };
  pages.push(page);
  renderPagesList();
  activatePage(page.id);
  persist();
  setTimeout(() => {
    const inp = document.getElementById('page-title-input');
    inp.focus(); inp.select();
  }, 80);
}

function deletePage(id) {
  if (pages.length <= 1) { showToast('At least one page must remain'); return; }
  const idx = pages.findIndex((p) => p.id === id);
  if (idx === -1) return;
  pages.splice(idx, 1);
  if (activePageId === id) activatePage(pages[Math.min(idx, pages.length - 1)].id);
  renderPagesList();
  persist();
}

// ─── Folder CRUD ──────────────────────────────────────────────────────────────
function createFolder(title = 'New Folder') {
  flushCurrentPage();
  const folder = { id: uid(), title, collapsed: false };
  folders.push(folder);
  renderPagesList();
  persist();
  // Immediately start rename
  const folderEl = document.querySelector(`.folder-item[data-folder-id="${folder.id}"]`);
  if (folderEl) startFolderRename(folder.id, folderEl.querySelector('.folder-name'));
}

function deleteFolder(id) {
  pages.forEach((p) => { if (p.folderId === id) p.folderId = null; });
  folders = folders.filter((f) => f.id !== id);
  renderPagesList();
  persist();
}

function toggleFolderCollapse(id) {
  const folder = folders.find((f) => f.id === id);
  if (!folder) return;
  folder.collapsed = !folder.collapsed;
  persist();
  const folderEl = document.querySelector(`.folder-item[data-folder-id="${id}"]`);
  if (folderEl) {
    folderEl.classList.toggle('pb-folder-collapsed', folder.collapsed);
    const chevron = folderEl.querySelector('.folder-chevron');
    if (chevron) chevron.innerHTML = folder.collapsed ? '&#9654;' : '&#9660;';
  }
}

function startFolderRename(id, nameEl) {
  const folder = folders.find((f) => f.id === id);
  if (!folder || !nameEl) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = folder.title;
  input.className = 'page-rename-input';
  nameEl.replaceWith(input);
  input.focus(); input.select();
  let committed = false;
  function commit() {
    if (committed) return; committed = true;
    folder.title = input.value.trim() || 'Untitled Folder';
    persist(); renderPagesList();
  }
  function cancel() {
    if (committed) return; committed = true; renderPagesList();
  }
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.removeEventListener('blur', commit); cancel(); }
  });
}

// ─── Sidebar Collapse / Expand ────────────────────────────────────────────────
const ICON_COLLAPSE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
const ICON_EXPAND   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

function toggleSidebar() {
  const panel  = document.getElementById('pages-panel');
  const handle = document.getElementById('sidebar-resize-handle');
  const btn    = document.getElementById('btn-collapse-sidebar');
  const collapsed = panel.classList.toggle('pb-collapsed');
  if (handle) handle.style.pointerEvents = collapsed ? 'none' : '';
  btn.innerHTML  = collapsed ? ICON_EXPAND : ICON_COLLAPSE;
  btn.title      = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  btn.setAttribute('aria-label', btn.title);
}

// ─── Sidebar Resize ───────────────────────────────────────────────────────────
function initSidebarResize() {
  const handle = document.getElementById('sidebar-resize-handle');
  if (!handle) return;
  handle.addEventListener('mousedown', (e) => {
    if (document.getElementById('pages-panel').classList.contains('pb-collapsed')) return;
    sidebarResizing = true;
    sidebarResizeX0 = e.clientX;
    sidebarResizeW0 = document.getElementById('pages-panel').offsetWidth;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!sidebarResizing) return;
    const w = Math.max(110, Math.min(320, sidebarResizeW0 + e.clientX - sidebarResizeX0));
    document.getElementById('pages-panel').style.width = w + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!sidebarResizing) return;
    sidebarResizing = false;
    document.getElementById('sidebar-resize-handle').classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
}

function activatePage(id) {
  const page = findPage(id);
  if (!page) return;
  flushCurrentPage();
  activePageId = id;
  document.getElementById('page-title-input').value = page.title;
  setContent(page.content);
  highlightActive();
  persist();
}

// ─── Render Pages List ────────────────────────────────────────────────────────
function renderPagesList() {
  const container = document.getElementById('pages-list');
  container.innerHTML = '';
  sortables.forEach((s) => { try { s.destroy(); } catch (_) {} });
  sortables = [];

  // Render folders
  folders.forEach((folder) => container.appendChild(createFolderEl(folder)));

  // Render ungrouped pages
  const rootList = document.createElement('ul');
  rootList.className = 'pages-group';
  rootList.id = 'pages-root';
  pages.filter((p) => !p.folderId).forEach((p) => rootList.appendChild(createPageItemEl(p)));
  container.appendChild(rootList);

  // Init sortables on every pages-group (root + each folder)
  initPageSortables();
}

function createFolderEl(folder) {
  const div = document.createElement('div');
  div.className = 'folder-item' + (folder.collapsed ? ' pb-folder-collapsed' : '');
  div.dataset.folderId = folder.id;

  const header = document.createElement('div');
  header.className = 'folder-header';
  header.innerHTML = `
    <span class="folder-drag-handle" title="Drag to reorder folder">&#10783;</span>
    <span class="folder-chevron">${folder.collapsed ? '&#9654;' : '&#9660;'}</span>
    <span class="folder-icon">&#128193;</span>
    <span class="folder-name">${esc(folder.title)}</span>
    <button class="folder-delete" title="Delete folder (pages moved to root)">&#10005;</button>`;

  const pageList = document.createElement('ul');
  pageList.className = 'pages-group folder-pages';
  pageList.dataset.folderId = folder.id;
  pages.filter((p) => p.folderId === folder.id).forEach((p) => pageList.appendChild(createPageItemEl(p)));

  // Toggle on header click except delete button and drag handle
  header.addEventListener('click', (e) => {
    if (!e.target.closest('.folder-delete') && !e.target.closest('.folder-drag-handle')) {
      toggleFolderCollapse(folder.id);
    }
  });
  header.querySelector('.folder-name').addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startFolderRename(folder.id, header.querySelector('.folder-name'));
  });
  header.querySelector('.folder-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteFolder(folder.id);
  });

  div.appendChild(header);
  div.appendChild(pageList);
  return div;
}

function createPageItemEl(page) {
  const li = document.createElement('li');
  li.className = 'page-item' + (page.id === activePageId ? ' active' : '');
  li.dataset.id = page.id;
  li.innerHTML = `
    <span class="drag-handle" title="Drag to reorder">&#10783;</span>
    <span class="page-name" title="Double-click to rename">${esc(page.title)}</span>
    <button class="page-delete" title="Delete page">&#10005;</button>`;

  li.addEventListener('click', (e) => {
    if (e.target.closest('.page-delete') || e.target.closest('.page-rename-input')) return;
    activatePage(li.dataset.id);
  });
  li.querySelector('.page-name').addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startRename(li.dataset.id, li.querySelector('.page-name'));
  });
  li.querySelector('.page-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    deletePage(li.dataset.id);
  });
  return li;
}

function initPageSortables() {
  if (!window.Sortable) return;

  // ── Folder reorder: drag folders within #pages-list ──
  const pagesList = document.getElementById('pages-list');
  if (pagesList) {
    const fs = Sortable.create(pagesList, {
      animation: 150,
      handle: '.folder-drag-handle',
      draggable: '.folder-item',
      ghostClass: 'sortable-ghost',
      onEnd(evt) {
        // Rebuild folders array to match DOM order
        const newFolders = [];
        pagesList.querySelectorAll('.folder-item[data-folder-id]').forEach((el) => {
          const f = folders.find((fd) => fd.id === el.dataset.folderId);
          if (f) newFolders.push(f);
        });
        folders = newFolders;
        persist();
      },
    });
    sortables.push(fs);
  }

  // ── Page reorder + cross-folder drag ──
  document.querySelectorAll('.pages-group').forEach((list) => {
    const s = Sortable.create(list, {
      group: { name: 'pb-pages', pull: true, put: true },
      animation: 150,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      onEnd(evt) {
        const movedId     = evt.item.dataset.id;
        const newFolderId = evt.to.dataset.folderId || null;
        const pg = pages.find((p) => p.id === movedId);
        if (pg) pg.folderId = newFolderId;
        rebuildPagesOrder();
        persist();
        highlightActive();
      },
    });
    sortables.push(s);
  });
}

function rebuildPagesOrder() {
  const pageMap = new Map(pages.map((p) => [p.id, p]));
  const ordered = [];
  document.querySelectorAll('.page-item[data-id]').forEach((item) => {
    const pg = pageMap.get(item.dataset.id);
    if (!pg) return;
    const parentList = item.closest('.pages-group');
    pg.folderId = parentList ? (parentList.dataset.folderId || null) : null;
    ordered.push(pg);
  });
  // Safety net — keep any pages missing from DOM
  pageMap.forEach((pg) => { if (!ordered.find((p) => p.id === pg.id)) ordered.push(pg); });
  pages = ordered;
}

// ─── Inline Rename ────────────────────────────────────────────────────────────
function startRename(id, nameEl) {
  const page = findPage(id);
  if (!page) return;

  const input = document.createElement('input');
  input.type      = 'text';
  input.value     = page.title;
  input.className = 'page-rename-input';
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;

  function commit() {
    if (committed) return;
    committed = true;
    const newTitle = input.value.trim() || 'Untitled';
    page.title = newTitle;
    // Sync the title input at the top of the editor if this is the active page
    if (activePageId === id) {
      document.getElementById('page-title-input').value = newTitle;
    }
    persist();
    renderPagesList();
  }

  function cancel() {
    if (committed) return;
    committed = true;
    renderPagesList(); // restore without saving
  }

  input.addEventListener('blur',    commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.removeEventListener('blur', commit); cancel(); }
  });
}

function highlightActive() {
  document.querySelectorAll('.page-item').forEach((el) =>
    el.classList.toggle('active', el.dataset.id === activePageId));
}

function syncListTitle(id, title) {
  const el = document.querySelector(`.page-item[data-id="${id}"] .page-name`);
  if (el) el.textContent = title;
}

// ─── Global Events ────────────────────────────────────────────────────────────
function bindGlobalEvents() {
  document.getElementById('btn-add-page').addEventListener('click', () => createPage());
  document.getElementById('btn-add-folder').addEventListener('click', () => createFolder());
  document.getElementById('btn-collapse-sidebar').addEventListener('click', toggleSidebar);
  document.getElementById('btn-delete-page').addEventListener('click', () => {
    if (activePageId) deletePage(activePageId);
  });
  document.getElementById('page-title-input').addEventListener('input', () => {
    isDirty = true; scheduleSave();
  });
  // PDF button opens the selection modal instead of exporting immediately
  document.getElementById('btn-export-pdf').addEventListener('click', openPdfModal);
  document.getElementById('btn-copy-all').addEventListener('click', copyAll);

  // Modal controls
  document.getElementById('modal-close').addEventListener('click',  closePdfModal);
  document.getElementById('modal-cancel').addEventListener('click', closePdfModal);
  document.getElementById('modal-select-all').addEventListener('click', () => {
    document.querySelectorAll('.pdf-cb').forEach((cb) => (cb.checked = true));
  });
  document.getElementById('modal-deselect-all').addEventListener('click', () => {
    document.querySelectorAll('.pdf-cb').forEach((cb) => (cb.checked = false));
  });
  document.getElementById('modal-export').addEventListener('click', () => {
    const selectedIds = new Set(
      Array.from(document.querySelectorAll('.pdf-cb:checked')).map((cb) => cb.dataset.id)
    );
    if (selectedIds.size === 0) { showToast('Select at least one page'); return; }
    const merged = document.getElementById('pdf-merge-cb').checked;
    closePdfModal();
    exportPDF(pages.filter((p) => selectedIds.has(p.id)), merged);
  });
  // Click outside modal to close
  document.getElementById('pdf-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePdfModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePdfModal();
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      flushCurrentPage();
      showToast('Saved ✓');
    }
  });
}

// ─── PDF Modal ────────────────────────────────────────────────────────────────
function openPdfModal() {
  flushCurrentPage();
  const list = document.getElementById('pdf-page-list');
  list.innerHTML = pages.map((p, i) => `
    <li class="pdf-modal-item">
      <label class="pdf-modal-label">
        <input type="checkbox" class="pdf-cb" data-id="${p.id}" checked />
        <span class="pdf-modal-num">${i + 1}</span>
        <span class="pdf-modal-title">${esc(p.title)}</span>
      </label>
    </li>`).join('');
  document.getElementById('pdf-modal').removeAttribute('hidden');
}

function closePdfModal() {
  document.getElementById('pdf-modal').setAttribute('hidden', '');
}

// ─── Export PDF ───────────────────────────────────────────────────────────────
function exportPDF(pagesToExport, merged = false) {
  const pgs = (pagesToExport && pagesToExport.length) ? pagesToExport : pages;
  flushCurrentPage();
  showToast('Generating PDF…');

  // Use page-break-before on every page except the first to avoid blank trailing pages
  const pagesHtml = pgs.map((p, i) => `
    <div class="pb-page${!merged && i > 0 ? ' pb-break' : ''}">
      <h1 class="pb-title">${esc(p.title)}</h1>
      <div class="pb-body">${p.content || '<p><em>Empty page</em></p>'}</div>
    </div>`).join('');

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#111827}
    .pb-page{padding:16px 24px 24px}
    .pb-break{page-break-before:always}
    .pb-title{font-size:20px;font-weight:800;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #e5e7eb;color:#111827}
    .pb-body{line-height:1.7}
    .pb-body h1{font-size:18px;font-weight:800;margin:14px 0 6px;padding-bottom:6px;border-bottom:1px solid #e5e7eb}
    .pb-body h2{font-size:15px;font-weight:700;margin:12px 0 5px}
    .pb-body h3{font-size:13px;font-weight:700;margin:10px 0 4px}
    .pb-body p{margin-bottom:7px}
    .pb-body ul,.pb-body ol{padding-left:22px;margin-bottom:8px}
    .pb-body li{margin-bottom:3px}
    .pb-body .code-block,.pb-body pre{background:#0d1117;color:#c9d1d9;border-radius:6px;padding:12px 14px;font-family:'Courier New',monospace;font-size:11.5px;margin:10px 0;white-space:pre-wrap;word-break:break-all;border:1px solid #30363d}
    .pb-body code{background:#f3f4f6;color:#be185d;padding:1px 4px;border-radius:3px;font-family:'Courier New',monospace;font-size:11px}
    .pb-body blockquote{border-left:4px solid #2563eb;background:#eff6ff;color:#1d4ed8;margin:10px 0;padding:8px 12px;border-radius:0 6px 6px 0}
    .pb-body table{border-collapse:collapse;width:100%;margin:10px 0;font-size:12px}
    .pb-body td,.pb-body th{border:1px solid #e5e7eb;padding:6px 10px}
    .pb-body th{background:#f3f4f6;font-weight:700}
    .pb-body tr:nth-child(even) td{background:#f9fafb}
    .pb-body strong{color:#111827}
  </style>${pagesHtml}`;

  document.body.appendChild(wrapper);
  html2pdf()
    .from(wrapper)
    .set({
      margin: [8, 8, 14, 8], // extra bottom margin for page numbers
      filename: 'playbook.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .toPdf()
    .get('pdf')
    .then((pdf) => {
      const total = pdf.internal.getNumberOfPages();
      const pw    = pdf.internal.pageSize.getWidth();
      const ph    = pdf.internal.pageSize.getHeight();
      for (let i = 1; i <= total; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(160, 160, 160);
        pdf.text(`${i} / ${total}`, pw / 2, ph - 4, { align: 'center' });
      }
    })
    .save()
    .then(() => {
      document.body.removeChild(wrapper);
      showToast('PDF exported!');
    })
    .catch(() => {
      document.body.removeChild(wrapper);
      showToast('PDF export failed');
    });
}

// ─── Copy All ─────────────────────────────────────────────────────────────────
function copyAll() {
  flushCurrentPage();
  const html = pages.map((p) =>
    `<h1 style="font-size:20px;font-weight:800;margin:16px 0 8px">${esc(p.title)}</h1>${p.content || ''}`
  ).join('<hr style="border:none;border-top:2px solid #e5e7eb;margin:20px 0">');

  (async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([html],{type:'text/html'})})]);
      showToast('Copied as rich text!');
    } catch {
      const plain = pages.map((p) => `${p.title}\n${'─'.repeat(40)}\n${stripHtml(p.content)}`).join('\n\n');
      try { await navigator.clipboard.writeText(plain); showToast('Copied as plain text'); }
      catch { showToast('Copy failed — check clipboard permissions'); }
    }
  })();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function stripHtml(html) { const d = document.createElement('div'); d.innerHTML = html||''; return d.innerText; }

function showToast(msg) {
  const t = document.getElementById('__toast__');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), 2800);
}

// ─── Welcome Content ──────────────────────────────────────────────────────────
function buildWelcomeContent() {
  return `<h1>Welcome to Playbook 🎯</h1>
<p>Your personal workspace for organising interview prep. <strong>Paste ChatGPT responses directly</strong> — all formatting is preserved: headings, code blocks, lists, tables, and callouts.</p>
<h2>Quick Start</h2>
<ul>
  <li>Click <strong>+ New</strong> in the left panel to add a page</li>
  <li>Paste any ChatGPT answer — formatting stays intact</li>
  <li>Drag the <strong>⠿</strong> handle to reorder pages</li>
  <li>Press <strong>Ctrl/Cmd + S</strong> to save manually</li>
  <li>Click <strong>PDF</strong> to export the entire playbook</li>
</ul>
<h2>Code Block Demo</h2>
<pre class="code-block">// Two Sum — O(n) Hash Map
function twoSum(nums, target) {
  const map = new Map();
  for (let i = 0; i &lt; nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) return [map.get(complement), i];
    map.set(nums[i], i);
  }
}</pre>
<h2>Callout Demo</h2>
<blockquote>💡 <strong>Tip:</strong> Always clarify constraints before coding. Ask about edge cases, input size, and expected output type.</blockquote>
<h2>Table Demo</h2>
<table>
  <thead><tr><th>Topic</th><th>Status</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td>Arrays &amp; Hashing</td><td>✅ Done</td><td>Review sliding window</td></tr>
    <tr><td>Binary Search</td><td>🔄 In Progress</td><td>Rotated sorted array</td></tr>
    <tr><td>Dynamic Programming</td><td>❌ Todo</td><td>Start with Fibonacci</td></tr>
  </tbody>
</table>`;
}
