# Playbook — Dev & Publishing Workflow

---

## The core rule

| Situation | client_id to use in manifest.json |
|---|---|
| Testing locally (unpacked) | **Dev** client ID |
| Submitting to Chrome Web Store | **Production** client ID |

**Never submit with the dev client ID. Never test locally with the prod client ID.**

---

## Your two OAuth client IDs

| Name in Cloud Console | client_id | Extension ID it's linked to |
|---|---|---|
| Playbook (dev) | `539583220061-56kf….apps.googleusercontent.com` | Your local unpacked ID |
| Playbook (production) | `539583220061-4goq….apps.googleusercontent.com` | `eehmkjgekijfnimgemppldkonbbijpdd` (Web Store) |

---

## ⚠️ When your local extension ID changes

Your local extension ID changes when you:
- Delete and re-load the unpacked extension
- Move the folder to a different path
- Load it from a fresh machine

**When it changes you must:**
1. Go to `chrome://extensions` → find your local Playbook → copy the new ID
2. Go to **Google Cloud Console → Credentials → Playbook (dev)** → edit → update **Application ID** to the new ID
3. Update `manifest.json` with the dev client ID (see workflow below)

> 💡 **Tip — pin your local ID:** Create a `key` field in manifest.json to lock the local extension ID so it never changes (see bottom of this doc).

---

## Daily dev workflow (local testing)

### Step 1 — switch to dev client ID
Edit `manifest.json`:
```json
"oauth2": {
  "client_id": "539583220061-56kf….apps.googleusercontent.com",
  "scopes": ["https://www.googleapis.com/auth/drive.file"]
}
```

### Step 2 — make your changes
Edit `sidebar.js`, `sidebar.css`, `sidebar.html`, etc.

### Step 3 — reload the extension
Go to `chrome://extensions` → find Playbook → click the **reload (↺) icon**

> Do NOT delete and re-add unless necessary — reloading keeps the same local ID.

### Step 4 — test
Open any tab → click the Playbook toolbar icon → test your changes.

---

## Before submitting to Chrome Web Store

### Step 1 — switch back to production client ID
Edit `manifest.json`:
```json
"oauth2": {
  "client_id": "539583220061-4goq43dqh1lg4ro6hi377e4396de9tvg.apps.googleusercontent.com",
  "scopes": ["https://www.googleapis.com/auth/drive.file"]
}
```

### Step 2 — bump the version number
```json
"version": "1.5"
```
The Web Store requires a higher version number on every upload.

### Step 3 — zip and upload
Zip the entire folder (excluding `.git`, `.history`, `.claude`):
- Select all files in the folder
- Right-click → **Send to → Compressed (zip)**
- Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- Upload the zip

### Step 4 — switch back to dev client ID
After uploading, immediately switch `manifest.json` back to the dev client ID so you don't accidentally test with the prod one.

---

## Fix for the "bad client id" error you're seeing right now

You are seeing this error because `manifest.json` currently has the **production** client ID but you are running locally.

**Fix:**
1. Open `manifest.json`
2. Change the `client_id` to your dev one:
   ```
   539583220061-56kf….apps.googleusercontent.com
   ```
3. Go to `chrome://extensions` → reload the extension
4. Also check: go to **Cloud Console → Playbook (dev)** and confirm the Application ID matches your current local ID (`chrome://extensions` → Developer mode → ID under the extension name)

---

## How to lock your local extension ID (recommended)

This prevents the ID from changing every time you reload from scratch.

1. Go to `chrome://extensions` → enable **Developer mode**
2. Find your local Playbook → click **Details** → copy the full ID
3. Go to **Cloud Console → Playbook (dev) OAuth client** → note the ID there
4. In the extension folder, create a **key** by running:
   - Load the extension once normally
   - Chrome stores a generated key in the profile — but the easiest way is to use the same folder path always and **never delete the extension** — just use the reload button

> The simplest protection: **bookmark** `chrome://extensions` and always use the **↺ reload** button instead of deleting and re-adding.

---

## Quick reference cheatsheet

```
Making changes locally?
  → Use DEV client ID in manifest.json
  → Click ↺ reload at chrome://extensions (don't delete!)

Submitting to Web Store?
  → Switch to PROD client ID in manifest.json
  → Bump version number
  → Zip and upload
  → Switch back to DEV client ID after uploading

Getting "bad client id" error?
  → Wrong client ID in manifest.json for your current environment
  → Check which extension ID Chrome assigned (chrome://extensions)
  → Match it to the right OAuth client in Cloud Console
```
