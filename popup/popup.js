/**
 * Inbox Cleaner - Popup Script
 * Simple actions + dashboard link
 */

const gmailApi = new GmailAPI();

let state = {
  isProcessing: false,
  cancelOperation: false
};

// DOM Elements
const screens = {
  tutorial: document.getElementById('tutorial-screen'),
  auth: document.getElementById('auth-screen'),
  main: document.getElementById('main-screen'),
  settings: document.getElementById('settings-screen')
};

const elements = {
  connectBtn: document.getElementById('connect-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  backBtn: document.getElementById('back-btn'),
  disconnectBtn: document.getElementById('disconnect-btn'),
  userEmail: document.getElementById('user-email'),
  settingsEmail: document.getElementById('settings-email'),
  statusText: document.getElementById('status-text'),
  progressSection: document.getElementById('progress-section'),
  progressBar: document.getElementById('progress-bar'),
  progressCount: document.getElementById('progress-count'),
  progressPercent: document.getElementById('progress-percent'),
  cancelBtn: document.getElementById('cancel-btn'),
  openDashboardBtn: document.getElementById('open-dashboard-btn'),
  archiveOldBtn: document.getElementById('archive-old-btn'),
  archiveUnreadBtn: document.getElementById('archive-unread-btn')
};

function showScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

function setStatus(message) {
  elements.statusText.textContent = '> ' + message;
}

function showProgress(show = true) {
  elements.progressSection.classList.toggle('hidden', !show);
}

function updateProgress(processed, total) {
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
  elements.progressBar.style.width = `${percent}%`;
  elements.progressCount.textContent = `${processed} / ${total}`;
  elements.progressPercent.textContent = `${percent}%`;
}

// Check if first launch
function isFirstLaunch() {
  return !localStorage.getItem('inbox-cleaner-tutorial-seen');
}

function markTutorialSeen() {
  localStorage.setItem('inbox-cleaner-tutorial-seen', 'true');
}

// Initialize
async function init() {
  try {
    // Show tutorial on first launch
    if (isFirstLaunch()) {
      showScreen('tutorial');
      return;
    }

    const isAuth = await gmailApi.isAuthenticated();
    if (isAuth) {
      await loadUserProfile();
      showScreen('main');
    } else {
      showScreen('auth');
    }
  } catch (error) {
    console.error('Init error:', error);
    showScreen('auth');
  }
}

function handleTutorialDone() {
  markTutorialSeen();
  showScreen('auth');
}

async function loadUserProfile() {
  try {
    const profile = await gmailApi.getProfile();
    elements.userEmail.textContent = profile.emailAddress;
    elements.settingsEmail.textContent = profile.emailAddress;
  } catch (error) {
    console.error('Failed to load profile:', error);
  }
}

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

async function handleDisconnect() {
  if (!confirm('Disconnect from Gmail?')) return;
  await gmailApi.revokeToken();
  showScreen('auth');
}

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
}

async function getAllMessageIds(query) {
  const allIds = [];
  let pageToken = null;
  let page = 0;

  do {
    if (state.cancelOperation) break;
    page++;
    setStatus(`Searching... (page ${page})`);

    const response = await gmailApi.listMessages(query, 500, pageToken);
    const messages = response.messages || [];
    messages.forEach(m => allIds.push(m.id));
    pageToken = response.nextPageToken;
  } while (pageToken && !state.cancelOperation);

  return allIds;
}

async function handleArchiveOld() {
  if (state.isProcessing) return;

  state.isProcessing = true;
  state.cancelOperation = false;
  showProgress(true);
  setStatus('Finding old emails...');

  try {
    const ids = await getAllMessageIds('older_than:90d in:inbox');

    if (ids.length === 0) {
      setStatus('No emails older than 90 days in inbox.');
      showProgress(false);
      state.isProcessing = false;
      return;
    }

    if (!confirm(`Archive ${ids.length} emails older than 90 days?\n\nThey stay searchable, just out of inbox.`)) {
      setStatus('Cancelled.');
      showProgress(false);
      state.isProcessing = false;
      return;
    }

    setStatus(`Archiving ${ids.length} emails...`);
    updateProgress(0, ids.length);

    const result = await gmailApi.batchModify(ids, 'archive', (progress) => {
      if (state.cancelOperation) return;
      updateProgress(progress.processed, progress.total);
      setStatus(`Archiving... ${progress.processed}/${progress.total}`);
    });

    setStatus(`Done! Archived ${result.success} emails.`);
  } catch (error) {
    console.error('Archive error:', error);
    setStatus('Error: ' + error.message);
  } finally {
    state.isProcessing = false;
    showProgress(false);
  }
}

async function handleArchiveUnread() {
  if (state.isProcessing) return;

  state.isProcessing = true;
  state.cancelOperation = false;
  showProgress(true);
  setStatus('Finding ignored emails...');

  try {
    // Unread emails older than 30 days = you're ignoring them
    const ids = await getAllMessageIds('is:unread older_than:30d in:inbox');

    if (ids.length === 0) {
      setStatus('No ignored emails found. Nice!');
      showProgress(false);
      state.isProcessing = false;
      return;
    }

    if (!confirm(`Archive ${ids.length} unread emails older than 30 days?\n\nThese are emails you haven't opened in a month.`)) {
      setStatus('Cancelled.');
      showProgress(false);
      state.isProcessing = false;
      return;
    }

    setStatus(`Archiving ${ids.length} emails...`);
    updateProgress(0, ids.length);

    const result = await gmailApi.batchModify(ids, 'archive', (progress) => {
      if (state.cancelOperation) return;
      updateProgress(progress.processed, progress.total);
      setStatus(`Archiving... ${progress.processed}/${progress.total}`);
    });

    setStatus(`Done! Archived ${result.success} ignored emails.`);
  } catch (error) {
    console.error('Archive error:', error);
    setStatus('Error: ' + error.message);
  } finally {
    state.isProcessing = false;
    showProgress(false);
  }
}

function handleCancel() {
  state.cancelOperation = true;
  setStatus('Cancelling...');
}

// Event listeners
document.getElementById('start-btn').addEventListener('click', handleTutorialDone);
elements.connectBtn.addEventListener('click', handleConnect);
elements.settingsBtn.addEventListener('click', () => showScreen('settings'));
elements.backBtn.addEventListener('click', () => showScreen('main'));
elements.disconnectBtn.addEventListener('click', handleDisconnect);
elements.cancelBtn.addEventListener('click', handleCancel);
elements.openDashboardBtn.addEventListener('click', openDashboard);
elements.archiveOldBtn.addEventListener('click', handleArchiveOld);
elements.archiveUnreadBtn.addEventListener('click', handleArchiveUnread);

document.addEventListener('DOMContentLoaded', init);
