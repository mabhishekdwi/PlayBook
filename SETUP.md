# Playbook — Project Structure & Setup Guide

## Project Structure

```
playbookBar/
│
├── manifest.json          # Chrome Extension config (MV3) — permissions, OAuth, icons
├── background.js          # Service worker — handles toolbar click & Google auth relay
├── content.js             # Injected into every tab — adds the toggle button + iframe
│
├── sidebar.html           # The sidebar UI (runs inside the iframe)
├── sidebar.css            # All sidebar styles
├── sidebar.js             # All sidebar logic — pages, folders, editor, PDF, import
├── drive-sync.js          # Google Drive API calls — save/load/delete docs
│
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
│
└── lib/                   # Bundled third-party libraries (no CDN — works offline)
    ├── Sortable.min.js        # Drag-and-drop page reordering
    └── html2pdf.bundle.min.js # PDF export
```

### How the pieces connect

```
User clicks toolbar icon
        ↓
  background.js injects content.js into the tab
        ↓
  content.js creates an <iframe> pointing to sidebar.html
        ↓
  sidebar.html loads sidebar.js + drive-sync.js
        ↓
  sidebar.js talks to background.js (via chrome.runtime.sendMessage)
  for Google auth — because chrome.identity only works in service workers
        ↓
  drive-sync.js uses the token from background.js to call Google Drive REST API
```

---

## Google Cloud Console Setup

### Step 1 — Create a project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project → New Project**
3. Name it `Playbook` (or anything you like)

---

### Step 2 — Enable the Google Drive API

1. Go to **APIs & Services → Library**
2. Search for **Google Drive API**
3. Click it → **Enable**

---

### Step 3 — Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** → **Create**
3. Fill in:
   - **App name**: `Playbook`
   - **User support email**: your email
   - **Developer contact email**: your email
4. Click **Save and Continue**
5. On the **Scopes** page → **Add or Remove Scopes** → search for:
   ```
   https://www.googleapis.com/auth/drive.file
   ```
   Add it → **Update** → **Save and Continue**
6. Skip **Test users** → **Save and Continue**
7. Back on the consent screen summary, click **Publish App**
   > ⚠️ Must be **Published** (not Testing). In Testing mode, only accounts you manually add can sign in — Chrome Web Store reviewers will be blocked.

---

### Step 4 — Create OAuth 2.0 Clients

You need **two** clients — one for the published extension, one for local dev.

Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**

#### Client 1 — Production (Chrome Web Store)

| Field | Value |
|---|---|
| Application type | **Chrome Extension** |
| Name | `Playbook (production)` |
| Application ID | `eehmkjgekijfnimgemppldkonbbijpdd` ← your Chrome Web Store extension ID |

Copy the **Client ID** it generates. Put it in `manifest.json`:

```json
"oauth2": {
  "client_id": "YOUR_PRODUCTION_CLIENT_ID.apps.googleusercontent.com",
  "scopes": ["https://www.googleapis.com/auth/drive.file"]
}
```

#### Client 2 — Dev (local unpacked)

| Field | Value |
|---|---|
| Application type | **Chrome Extension** |
| Name | `Playbook (dev)` |
| Application ID | your local extension ID — find it at `chrome://extensions` with Developer mode on |

> Your local ID changes if you move the folder. The Web Store ID is permanent.
>
> When testing locally, temporarily swap the `client_id` in `manifest.json` to the dev client ID. **Never commit the dev client ID as the production value.**

---

### Step 5 — Where to find your extension IDs

| Where | How to find the ID |
|---|---|
| **Chrome Web Store (production)** | Check your Chrome Web Store developer dashboard, or look at the rejection/approval email — listed as **Item ID** |
| **Local unpacked (dev)** | Open `chrome://extensions` → enable **Developer mode** → the ID appears under the extension name |

---

## manifest.json — Key fields explained

```json
{
  "permissions": ["storage", "activeTab", "scripting", "identity"],
```

| Permission | Why it's needed |
|---|---|
| `storage` | Saves pages/folders to `chrome.storage.local` |
| `activeTab` | Injects the sidebar into the current tab when the icon is clicked |
| `scripting` | Needed to run `executeScript` to inject `content.js` |
| `identity` | Lets `background.js` call `chrome.identity.getAuthToken` for Google OAuth |

```json
  "oauth2": {
    "client_id": "...",
    "scopes": ["https://www.googleapis.com/auth/drive.file"]
  }
```

- `client_id` — must match the **Production** OAuth client from Cloud Console
- `drive.file` scope — allows the extension to read/write only files it creates (not the user's whole Drive)

---

## Checklist before submitting to Chrome Web Store

- [ ] OAuth consent screen is **Published** (not Testing)
- [ ] Production OAuth client Application ID matches the Chrome Web Store extension ID
- [ ] `manifest.json` `client_id` matches the production OAuth client
- [ ] All library files are local in `lib/` (no CDN URLs)
- [ ] Icons exist at all four sizes: 16, 32, 48, 128
- [ ] Test Drive connect/sync with a non-developer Google account
