/**
 * Inbox Cleaner - Background Service Worker
 */

// Handle extension install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Inbox Cleaner installed');
  } else if (details.reason === 'update') {
    console.log('Inbox Cleaner updated to version', chrome.runtime.getManifest().version);
  }
});

// Handle messages from popup/dashboard
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getAuthToken') {
    chrome.identity.getAuthToken({ interactive: request.interactive }, (token) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ token });
      }
    });
    return true; // Keep channel open for async response
  }

  if (request.action === 'revokeToken') {
    chrome.identity.removeCachedAuthToken({ token: request.token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'openDashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    sendResponse({ success: true });
    return true;
  }
});

// Handle alarms for scheduled tasks (future feature)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoClean') {
    // Future: Auto-clean based on rules
    console.log('Auto-clean triggered');
  }
});
