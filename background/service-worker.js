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

  // Handle AI classification requests (bypass CORS from service worker)
  if (request.action === 'classifyWithAI') {
    (async () => {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': request.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            messages: [{
              role: 'user',
              content: request.prompt
            }]
          })
        });

        if (!response.ok) {
          const error = await response.json();
          sendResponse({ error: error.error?.message || 'API request failed' });
          return;
        }

        const data = await response.json();
        sendResponse({ data });
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })();
    return true; // Keep channel open for async response
  }
});

// Handle alarms for scheduled tasks (future feature)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoClean') {
    // Future: Auto-clean based on rules
    console.log('Auto-clean triggered');
  }
});
