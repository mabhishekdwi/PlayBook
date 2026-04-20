/* drive-sync.js – Google Drive backend for Playbook */
'use strict';

const DriveSync = (() => {
  const FILE_NAME   = 'playbook_data.json';
  const FOLDER_NAME = 'Playbook';
  const API         = 'https://www.googleapis.com/drive/v3';
  const UPLOAD      = 'https://www.googleapis.com/upload/drive/v3';

  let _token    = null;
  let _fileId   = null;
  let _folderId = null;

  // ── Token ──────────────────────────────────────────────────────────────────
  function getToken(interactive = false) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(new Error(chrome.runtime.lastError?.message || 'auth_failed'));
        } else {
          _token = token;
          resolve(token);
        }
      });
    });
  }

  function clearToken() {
    return new Promise((resolve) => {
      if (!_token) { resolve(); return; }
      chrome.identity.removeCachedAuthToken({ token: _token }, () => {
        _token = null;
        resolve();
      });
    });
  }

  // ── Fetch with auto-retry on 401 ───────────────────────────────────────────
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

  // ── Find or create "Playbook" folder in Drive ──────────────────────────────
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
    // Create the folder
    const create = await apiFetch(`${API}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!create.ok) throw new Error(`Folder create failed ${create.status}`);
    _folderId = (await create.json()).id;
    return _folderId;
  }

  // ── Find playbook_data.json inside the Playbook folder ────────────────────
  async function findFileId() {
    if (_fileId) return _fileId;
    const folderId = await findOrCreateFolder();
    const q = encodeURIComponent(
      `name='${FILE_NAME}' and '${folderId}' in parents and trashed=false`
    );
    const res = await apiFetch(`${API}/files?q=${q}&fields=files(id)&spaces=drive`);
    if (!res.ok) return null;
    const data = await res.json();
    _fileId = data.files?.[0]?.id ?? null;
    return _fileId;
  }

  // ── Load data from Drive ───────────────────────────────────────────────────
  async function load(interactive = false) {
    await getToken(interactive);
    const id = await findFileId();
    if (!id) return null;
    const res = await apiFetch(`${API}/files/${id}?alt=media`);
    if (!res.ok) return null;
    return res.json();
  }

  // ── Save data to Drive ─────────────────────────────────────────────────────
  async function save(data) {
    const t    = _token || await getToken(false);
    const body = JSON.stringify(data);
    let id = await findFileId();

    if (!id) {
      // Create new file inside the Playbook folder
      const folderId = await findOrCreateFolder();
      const form = new FormData();
      form.append('metadata', new Blob(
        [JSON.stringify({ name: FILE_NAME, mimeType: 'application/json', parents: [folderId] })],
        { type: 'application/json' }
      ));
      form.append('file', new Blob([body], { type: 'application/json' }));
      const res = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
        body: form,
      });
      if (!res.ok) throw new Error(`Create failed ${res.status}`);
      _fileId = (await res.json()).id;
    } else {
      // Update existing file
      const res = await fetch(`${UPLOAD}/files/${id}?uploadType=media`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) throw new Error(`Update failed ${res.status}`);
    }
  }

  return { load, save, getToken, clearToken };
})();
