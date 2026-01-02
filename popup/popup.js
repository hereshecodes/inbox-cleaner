/**
 * Inbox Cleaner - Popup Script
 */

// Initialize API and utilities
const gmailApi = new GmailAPI();
const emailParser = new EmailParser();
const categorizer = new EmailCategorizer();

// State
let state = {
  isScanning: false,
  emails: [],
  subscriptions: [],
  stats: null,
  cancelScan: false
};

// DOM Elements
const screens = {
  auth: document.getElementById('auth-screen'),
  main: document.getElementById('main-screen'),
  scanning: document.getElementById('scanning-screen'),
  settings: document.getElementById('settings-screen')
};

const elements = {
  connectBtn: document.getElementById('connect-btn'),
  scanBtn: document.getElementById('scan-btn'),
  unsubscribeBtn: document.getElementById('unsubscribe-btn'),
  cleanupBtn: document.getElementById('cleanup-btn'),
  dashboardBtn: document.getElementById('dashboard-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  backBtn: document.getElementById('back-btn'),
  disconnectBtn: document.getElementById('disconnect-btn'),
  cancelScanBtn: document.getElementById('cancel-scan-btn'),
  userEmail: document.getElementById('user-email'),
  settingsEmail: document.getElementById('settings-email'),
  statSubscriptions: document.getElementById('stat-subscriptions'),
  statOld: document.getElementById('stat-old'),
  statSize: document.getElementById('stat-size'),
  unsubCount: document.getElementById('unsub-count'),
  subscriptionsList: document.getElementById('subscriptions-list'),
  subscriptionsSection: document.getElementById('subscriptions-section'),
  scanProgress: document.getElementById('scan-progress'),
  scanCount: document.getElementById('scan-count'),
  scanPercent: document.getElementById('scan-percent'),
  scanningStatus: document.getElementById('scanning-status')
};

// Screen management
function showScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

// Initialize
async function init() {
  try {
    const isAuth = await gmailApi.isAuthenticated();
    if (isAuth) {
      await loadUserProfile();
      await loadCachedData();
      showScreen('main');
    } else {
      showScreen('auth');
    }
  } catch (error) {
    console.error('Init error:', error);
    showScreen('auth');
  }
}

// Load user profile
async function loadUserProfile() {
  try {
    const profile = await gmailApi.getProfile();
    elements.userEmail.textContent = profile.emailAddress;
    elements.settingsEmail.textContent = profile.emailAddress;
  } catch (error) {
    console.error('Failed to load profile:', error);
  }
}

// Load cached data from storage
async function loadCachedData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['emails', 'subscriptions', 'stats', 'lastScan'], (data) => {
      if (data.emails) {
        state.emails = data.emails;
        state.subscriptions = data.subscriptions || [];
        state.stats = data.stats;
        updateUI();
      }
      resolve();
    });
  });
}

// Save data to storage
function saveData() {
  chrome.storage.local.set({
    emails: state.emails,
    subscriptions: state.subscriptions,
    stats: state.stats,
    lastScan: Date.now()
  });
}

// Update UI with current state
function updateUI() {
  if (state.stats) {
    elements.statSubscriptions.textContent = state.stats.totalSubscriptions;
    elements.statOld.textContent = state.stats.oldEmails;
    elements.statSize.textContent = state.stats.totalSizeMB;
  }

  // Update unsubscribe button
  const subCount = state.subscriptions.length;
  elements.unsubCount.textContent = subCount;
  elements.unsubscribeBtn.disabled = subCount === 0;
  elements.cleanupBtn.disabled = state.emails.length === 0;

  // Show subscriptions
  if (state.subscriptions.length > 0) {
    elements.subscriptionsSection.style.display = 'block';
    renderSubscriptions();
  } else {
    elements.subscriptionsSection.style.display = 'none';
  }
}

// Render subscription list
function renderSubscriptions() {
  const top5 = state.subscriptions.slice(0, 5);

  elements.subscriptionsList.innerHTML = top5.map(sub => `
    <div class="subscription-item">
      <div class="subscription-icon">${sub.senderName.charAt(0)}</div>
      <div class="subscription-info">
        <div class="subscription-name">${escapeHtml(sub.senderName)}</div>
        <div class="subscription-count">${sub.emailCount} emails</div>
      </div>
      <button class="btn btn-sm btn-amber subscription-action" data-email="${escapeHtml(sub.senderEmail)}">
        UNSUB
      </button>
    </div>
  `).join('');

  // Add click handlers
  elements.subscriptionsList.querySelectorAll('.subscription-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const email = e.target.dataset.email;
      handleUnsubscribe(email);
    });
  });
}

// Connect Gmail
async function handleConnect() {
  try {
    elements.connectBtn.disabled = true;
    elements.connectBtn.textContent = 'CONNECTING...';

    await gmailApi.getToken(true);
    await loadUserProfile();
    showScreen('main');
  } catch (error) {
    console.error('Connect error:', error);
    alert('Failed to connect: ' + error.message);
  } finally {
    elements.connectBtn.disabled = false;
    elements.connectBtn.textContent = 'CONNECT GMAIL';
  }
}

// Scan inbox
async function handleScan() {
  if (state.isScanning) return;

  state.isScanning = true;
  state.cancelScan = false;
  state.emails = [];

  showScreen('scanning');
  updateScanProgress(0, 0, 'Starting scan...');

  try {
    let pageToken = null;
    let totalFetched = 0;
    const allMessages = [];

    // Fetch message IDs
    do {
      if (state.cancelScan) break;

      updateScanProgress(0, totalFetched, 'Fetching email list...');

      const response = await gmailApi.listMessages('', 500, pageToken);
      const messages = response.messages || [];
      allMessages.push(...messages);
      totalFetched = allMessages.length;
      pageToken = response.nextPageToken;

      // Limit to 2000 for now
      if (totalFetched >= 2000) break;

    } while (pageToken && !state.cancelScan);

    if (state.cancelScan) {
      showScreen('main');
      return;
    }

    // Fetch message details
    const total = allMessages.length;
    updateScanProgress(0, total, 'Analyzing emails...');

    const chunks = chunkArray(allMessages, 50);
    let processed = 0;

    for (const chunk of chunks) {
      if (state.cancelScan) break;

      const details = await Promise.all(
        chunk.map(m => gmailApi.getMessage(m.id, 'metadata'))
      );

      for (const msg of details) {
        const parsed = emailParser.parseMessage(msg);
        parsed.categories = categorizer.categorize(parsed);
        state.emails.push(parsed);
      }

      processed += chunk.length;
      const percent = Math.round((processed / total) * 100);
      updateScanProgress(percent, processed, `Analyzed ${processed} of ${total}...`);
    }

    if (!state.cancelScan) {
      // Calculate stats and subscriptions
      state.stats = categorizer.getStats(state.emails);
      state.subscriptions = categorizer.getSubscriptions(state.emails);

      saveData();
      updateUI();
    }

  } catch (error) {
    console.error('Scan error:', error);
    alert('Scan failed: ' + error.message);
  } finally {
    state.isScanning = false;
    showScreen('main');
  }
}

// Update scan progress UI
function updateScanProgress(percent, count, status) {
  elements.scanProgress.style.width = `${percent}%`;
  elements.scanCount.textContent = `${count} emails`;
  elements.scanPercent.textContent = `${percent}%`;
  elements.scanningStatus.textContent = status;
}

// Handle unsubscribe
async function handleUnsubscribe(senderEmail) {
  const subscription = state.subscriptions.find(s => s.senderEmail === senderEmail);
  if (!subscription || !subscription.unsubscribeInfo) {
    alert('No unsubscribe method found for this sender.');
    return;
  }

  const info = subscription.unsubscribeInfo;

  try {
    // Try one-click first
    if (info.oneClick && info.httpUrl) {
      await fetch(info.httpUrl, {
        method: 'POST',
        body: 'List-Unsubscribe=One-Click',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      alert(`Unsubscribed from ${subscription.senderName}!`);
      return;
    }

    // Try HTTP URL
    if (info.httpUrl) {
      chrome.tabs.create({ url: info.httpUrl, active: true });
      return;
    }

    // Try mailto
    if (info.mailto) {
      const [address, params] = info.mailto.split('?');
      const subject = new URLSearchParams(params).get('subject') || 'Unsubscribe';
      await gmailApi.sendEmail(address, subject, 'Please unsubscribe me from this mailing list.');
      alert(`Unsubscribe email sent to ${address}!`);
      return;
    }

  } catch (error) {
    console.error('Unsubscribe error:', error);
    alert('Failed to unsubscribe: ' + error.message);
  }
}

// Handle disconnect
async function handleDisconnect() {
  if (!confirm('Disconnect from Gmail? Your cached data will be cleared.')) return;

  await gmailApi.revokeToken();
  chrome.storage.local.clear();
  state = { isScanning: false, emails: [], subscriptions: [], stats: null, cancelScan: false };
  showScreen('auth');
}

// Open dashboard
function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
}

// Utility functions
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Event listeners
elements.connectBtn.addEventListener('click', handleConnect);
elements.scanBtn.addEventListener('click', handleScan);
elements.unsubscribeBtn.addEventListener('click', () => openDashboard());
elements.cleanupBtn.addEventListener('click', () => openDashboard());
elements.dashboardBtn.addEventListener('click', openDashboard);
elements.settingsBtn.addEventListener('click', () => showScreen('settings'));
elements.backBtn.addEventListener('click', () => showScreen('main'));
elements.disconnectBtn.addEventListener('click', handleDisconnect);
elements.cancelScanBtn.addEventListener('click', () => { state.cancelScan = true; });

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
