/* drive-sync.js – Google Drive backend for Playbook */
'use strict';

const DriveSync = (() => {
  const SYNC_NAME   = 'playbook_sync.json';
  const FOLDER_NAME = 'Playbook';
  const API         = 'https://www.googleapis.com/drive/v3';
  const UPLOAD      = 'https://www.googleapis.com/upload/drive/v3';
  const MIME_GDOC   = 'application/vnd.google-apps.document';

  let _token      = null;
  let _syncId     = null;   // playbook_sync.json file ID
  let _folderId   = null;   // Playbook folder ID
  let _pageDocMap = {};     // { [pageId]: driveDocId }

  // ── Token (relayed via background service worker) ─────────────────────────
  function getToken(interactive = false) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN', interactive }, (resp) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (resp?.error)              { reject(new Error(resp.error)); return; }
        _token = resp.token;
        resolve(resp.token);
      });
    });
  }

  function clearToken() {
    return new Promise((resolve) => {
      if (!_token) { resolve(); return; }
      const t = _token;
      _token = null;
      chrome.runtime.sendMessage({ type: 'CLEAR_AUTH_TOKEN', token: t }, () => resolve());
    });
  }

  // ── Fetch with auto-retry on 401 ──────────────────────────────────────────
  async function apiFetch(url, opts = {}, retried = false) {
    const t = _token || await getToken(false);
    const res = await fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${t}`, ...(opts.headers || {}) },
    });
    if (res.status === 401 && !retried) {
      await clearToken();
      _token = await getToken(false);
      return apiFetch(url, opts, true);
    }
    return res;
  }

  // ── Find or create "Playbook" folder ──────────────────────────────────────
  async function findOrCreateFolder() {
    if (_folderId) return _folderId;
    const q = encodeURIComponent(
      `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const res = await apiFetch(`${API}/files?q=${q}&fields=files(id)&spaces=drive`);
    if (res.ok) {
      const data = await res.json();
      if (data.files?.length > 0) { _folderId = data.files[0].id; return _folderId; }
    }
    const create = await apiFetch(`${API}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!create.ok) throw new Error(`Folder create failed ${create.status}`);
    _folderId = (await create.json()).id;
    return _folderId;
  }

  // ── Find a file by name inside the Playbook folder ────────────────────────
  async function findFile(name) {
    const folderId = await findOrCreateFolder();
    const q = encodeURIComponent(
      `name='${name}' and '${folderId}' in parents and trashed=false`
    );
    const res = await apiFetch(`${API}/files?q=${q}&fields=files(id)&spaces=drive`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.files?.[0]?.id ?? null;
  }

  // ── Build HTML for a single page ──────────────────────────────────────────
  function buildPageHtml(page, folderTitle) {
    return `<h1>${esc(page.title || 'Untitled')}</h1>
${folderTitle ? `<p><em>Folder: ${esc(folderTitle)}</em></p>` : ''}
<p><small>Last updated: ${page.updatedAt ? new Date(page.updatedAt).toLocaleString() : '—'}</small></p>
${page.content || ''}`;
  }

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Create or update a single page's Google Doc ───────────────────────────
  async function savePageDoc(t, folderId, page, folderTitle) {
    const html    = buildPageHtml(page, folderTitle);
    const docName = page.title || 'Untitled';
    const docId   = _pageDocMap[page.id];

    if (!docId) {
      const form = new FormData();
      form.append('metadata', new Blob(
        [JSON.stringify({ name: docName, mimeType: MIME_GDOC, parents: [folderId] })],
        { type: 'application/json' }
      ));
      form.append('file', new Blob([html], { type: 'text/html' }));
      const res = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
        body: form,
      });
      if (!res.ok) throw new Error(`Doc create failed ${res.status}`);
      _pageDocMap[page.id] = (await res.json()).id;
    } else {
      // Update content
      await fetch(`${UPLOAD}/files/${docId}?uploadType=media`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'text/html' },
        body: html,
      });
      // Rename if title changed
      await apiFetch(`${API}/files/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: docName }),
      });
    }
    return _pageDocMap[page.id];
  }

  // ── Save sync JSON ────────────────────────────────────────────────────────
  async function saveSyncFile(t, folderId, data) {
    const body = JSON.stringify({ ...data, pb_page_doc_map: _pageDocMap });
    _syncId = _syncId || await findFile(SYNC_NAME);

    if (!_syncId) {
      const form = new FormData();
      form.append('metadata', new Blob(
        [JSON.stringify({ name: SYNC_NAME, mimeType: 'application/json', parents: [folderId] })],
        { type: 'application/json' }
      ));
      form.append('file', new Blob([body], { type: 'application/json' }));
      const res = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
        body: form,
      });
      if (!res.ok) throw new Error(`Sync file create failed ${res.status}`);
      _syncId = (await res.json()).id;
    } else {
      await fetch(`${UPLOAD}/files/${_syncId}?uploadType=media`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body,
      });
    }
  }

  // ── Public: save one changed page + sync JSON ─────────────────────────────
  async function save(data, changedPageId = null) {
    const t         = _token || await getToken(false);
    const folderId  = await findOrCreateFolder();
    const folderMap = Object.fromEntries((data.pb_folders || []).map(f => [f.id, f.title]));
    const pages     = data.pb_pages || [];

    if (changedPageId) {
      const page = pages.find(p => p.id === changedPageId);
      if (page) await savePageDoc(t, folderId, page, folderMap[page.folderId] || null);
    } else {
      // Initial sync — create docs for all pages
      for (const page of pages) {
        await savePageDoc(t, folderId, page, folderMap[page.folderId] || null);
      }
    }

    await saveSyncFile(t, folderId, data);
  }

  // ── Public: delete a page's Google Doc from Drive ─────────────────────────
  async function deleteDriveDoc(pageId) {
    const docId = _pageDocMap[pageId];
    if (!docId) return;
    await apiFetch(`${API}/files/${docId}`, { method: 'DELETE' });
    delete _pageDocMap[pageId];
  }

  // ── Load sync data ────────────────────────────────────────────────────────
  async function load(interactive = false) {
    await getToken(interactive);
    _syncId = _syncId || await findFile(SYNC_NAME);
    if (!_syncId) return null;
    const res = await apiFetch(`${API}/files/${_syncId}?alt=media`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.pb_page_doc_map) _pageDocMap = data.pb_page_doc_map;
    return data;
  }

  function getPageDocUrl(pageId) {
    const docId = _pageDocMap[pageId];
    return docId ? `https://docs.google.com/document/d/${docId}/edit` : null;
  }

  function getFolderUrl() {
    return _folderId ? `https://drive.google.com/drive/folders/${_folderId}` : null;
  }

  function setPageDocMap(map) {
    if (map && typeof map === 'object') _pageDocMap = map;
  }

  function getPageDocMap() { return _pageDocMap; }

  return { load, save, deleteDriveDoc, getToken, clearToken, getFolderUrl, getPageDocUrl, setPageDocMap, getPageDocMap };
})();
