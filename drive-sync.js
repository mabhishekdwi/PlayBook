/* drive-sync.js – Google Drive backend for Playbook */
'use strict';

const DriveSync = (() => {
  const DOC_NAME    = 'Playbook';
  const SYNC_NAME   = 'playbook_sync.json';
  const FOLDER_NAME = 'Playbook';
  const API         = 'https://www.googleapis.com/drive/v3';
  const UPLOAD      = 'https://www.googleapis.com/upload/drive/v3';
  const MIME_GDOC   = 'application/vnd.google-apps.document';

  let _token      = null;
  let _docId      = null;  // Google Doc (for viewing)
  let _syncId     = null;  // JSON file (for sync/restore)
  let _folderId   = null;

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

  // ── Build human-readable HTML (used to create/update the Google Doc) ──────
  function buildDocHtml(data) {
    const pages   = data.pb_pages   || [];
    const folders = data.pb_folders || [];
    const updated = data.lastModified
      ? new Date(data.lastModified).toLocaleString()
      : new Date().toLocaleString();

    const folderMap = Object.fromEntries(folders.map(f => [f.id, f.title]));

    const pagesHtml = pages.map(p => {
      const folder = p.folderId ? folderMap[p.folderId] : null;
      return `
      <hr>
      <h2>${esc(p.title || 'Untitled')}</h2>
      ${folder ? `<p><em>Folder: ${esc(folder)}</em></p>` : ''}
      <p><small>Last updated: ${p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '—'}</small></p>
      ${p.content || ''}`;
    }).join('\n');

    return `<h1>Playbook</h1>
<p><em>Last synced: ${updated} &nbsp;·&nbsp; ${pages.length} page${pages.length !== 1 ? 's' : ''}</em></p>
${pagesHtml}`;
  }

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Save both the Google Doc and the sync JSON ────────────────────────────
  async function save(data) {
    const t = _token || await getToken(false);
    await Promise.all([saveDoc(t, data), saveSyncFile(t, data)]);
  }

  async function saveDoc(t, data) {
    const html = buildDocHtml(data);
    _docId = _docId || await findFile(DOC_NAME);

    if (!_docId) {
      const folderId = await findOrCreateFolder();
      const form = new FormData();
      form.append('metadata', new Blob(
        [JSON.stringify({ name: DOC_NAME, mimeType: MIME_GDOC, parents: [folderId] })],
        { type: 'application/json' }
      ));
      form.append('file', new Blob([html], { type: 'text/html' }));
      const res = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
        body: form,
      });
      if (!res.ok) throw new Error(`Doc create failed ${res.status}`);
      _docId = (await res.json()).id;
    } else {
      const res = await fetch(`${UPLOAD}/files/${_docId}?uploadType=media`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'text/html' },
        body: html,
      });
      if (!res.ok) throw new Error(`Doc update failed ${res.status}`);
    }
  }

  async function saveSyncFile(t, data) {
    const body = JSON.stringify(data);
    _syncId = _syncId || await findFile(SYNC_NAME);

    if (!_syncId) {
      const folderId = await findOrCreateFolder();
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
      const res = await fetch(`${UPLOAD}/files/${_syncId}?uploadType=media`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) throw new Error(`Sync file update failed ${res.status}`);
    }
  }

  // ── Load sync data from the JSON file ────────────────────────────────────
  async function load(interactive = false) {
    await getToken(interactive);
    _syncId = _syncId || await findFile(SYNC_NAME);
    if (!_syncId) return null;
    const res = await apiFetch(`${API}/files/${_syncId}?alt=media`);
    if (!res.ok) return null;
    return res.json();
  }

  function getFolderUrl() {
    return _folderId ? `https://drive.google.com/drive/folders/${_folderId}` : null;
  }

  return { load, save, getToken, clearToken, getFolderUrl };
})();
