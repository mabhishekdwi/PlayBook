/* background.js – service worker */
'use strict';

// Inject content.js only when the user explicitly clicks the toolbar icon.
// This uses activeTab (no broad host permissions needed).
chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js'],
  });
});

// ── Google Drive auth relay ────────────────────────────────────────────────────
// chrome.identity.getAuthToken must run in the service worker, not in iframes.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_AUTH_TOKEN') {
    chrome.identity.getAuthToken({ interactive: msg.interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        sendResponse({ error: chrome.runtime.lastError?.message || 'auth_failed' });
      } else {
        sendResponse({ token });
      }
    });
    return true; // keep channel open for async response
  }

  if (msg.type === 'CLEAR_AUTH_TOKEN') {
    chrome.identity.removeCachedAuthToken({ token: msg.token }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});
