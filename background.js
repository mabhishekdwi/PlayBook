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
