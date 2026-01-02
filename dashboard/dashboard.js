/**
 * Inbox Cleaner - Dashboard Script
 */

// Initialize API and utilities
const gmailApi = new GmailAPI();
const emailParser = new EmailParser();
const categorizer = new EmailCategorizer();

// State
let state = {
  emails: [],
  subscriptions: [],
  senderGroups: [],
  categoryGroups: [],
  stats: null,
  selectedIds: new Set(),
  currentView: 'subscriptions',
  isProcessing: false,
  cancelProcess: false
};

// DOM Elements
const views = {
  subscriptions: document.getElementById('subscriptions-view'),
  categories: document.getElementById('categories-view'),
  senders: document.getElementById('senders-view'),
  cleanup: document.getElementById('cleanup-view')
};

const elements = {
  userEmail: document.getElementById('user-email'),
  refreshBtn: document.getElementById('refresh-btn'),
  totalEmails: document.getElementById('total-emails'),
  totalSubs: document.getElementById('total-subs'),
  totalSize: document.getElementById('total-size'),
  subscriptionsList: document.getElementById('subscriptions-list'),
  categoriesList: document.getElementById('categories-list'),
  sendersList: document.getElementById('senders-list'),
  searchSubs: document.getElementById('search-subs'),
  searchSenders: document.getElementById('search-senders'),
  unsubscribeSelected: document.getElementById('unsubscribe-selected'),
  cleanupProgress: document.getElementById('cleanup-progress'),
  cleanupBar: document.getElementById('cleanup-bar'),
  cleanupCount: document.getElementById('cleanup-count'),
  cleanupPercent: document.getElementById('cleanup-percent'),
  cancelCleanup: document.getElementById('cancel-cleanup'),
  oldCount: document.getElementById('old-count'),
  largeCount: document.getElementById('large-count'),
  promoCount: document.getElementById('promo-count'),
  socialCount: document.getElementById('social-count')
};

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const view = item.dataset.view;
    switchView(view);
  });
});

function switchView(viewName) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Update views
  Object.entries(views).forEach(([name, el]) => {
    el.classList.toggle('hidden', name !== viewName);
  });

  state.currentView = viewName;
}

// Initialize
async function init() {
  try {
    const isAuth = await gmailApi.isAuthenticated();
    if (!isAuth) {
      await gmailApi.getToken(true);
    }

    await loadUserProfile();
    await loadCachedData();

    if (state.emails.length === 0) {
      showEmptyState();
    } else {
      renderAll();
    }
  } catch (error) {
    console.error('Init error:', error);
    alert('Please connect Gmail from the extension popup first.');
  }
}

async function loadUserProfile() {
  try {
    const profile = await gmailApi.getProfile();
    elements.userEmail.textContent = profile.emailAddress;
  } catch (error) {
    console.error('Failed to load profile:', error);
  }
}

async function loadCachedData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['emails', 'subscriptions', 'stats'], (data) => {
      if (data.emails) {
        state.emails = data.emails;
        state.subscriptions = data.subscriptions || [];
        state.stats = data.stats;

        // Generate groupings
        state.senderGroups = categorizer.groupBySender(state.emails);
        state.categoryGroups = categorizer.groupByCategory(state.emails);
      }
      resolve();
    });
  });
}

function showEmptyState() {
  elements.subscriptionsList.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">📭</div>
      <div class="empty-state-text">
        No data yet. Click "Scan Inbox" in the extension popup first.
      </div>
    </div>
  `;
}

// Render all views
function renderAll() {
  updateStats();
  renderSubscriptions();
  renderCategories();
  renderSenders();
  updateCleanupCounts();
}

function updateStats() {
  if (state.stats) {
    elements.totalEmails.textContent = state.stats.totalEmails.toLocaleString();
    elements.totalSubs.textContent = state.stats.totalSubscriptions;
    elements.totalSize.textContent = state.stats.totalSizeMB + ' MB';
  }
}

// Render subscriptions
function renderSubscriptions(filter = '') {
  let subs = state.subscriptions;

  if (filter) {
    const lowerFilter = filter.toLowerCase();
    subs = subs.filter(s =>
      s.senderName.toLowerCase().includes(lowerFilter) ||
      s.senderEmail.toLowerCase().includes(lowerFilter)
    );
  }

  if (subs.length === 0) {
    elements.subscriptionsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✨</div>
        <div class="empty-state-text">No subscriptions found</div>
      </div>
    `;
    return;
  }

  elements.subscriptionsList.innerHTML = subs.map(sub => `
    <div class="list-item" data-email="${escapeHtml(sub.senderEmail)}">
      <label class="checkbox list-item-checkbox">
        <input type="checkbox" data-email="${escapeHtml(sub.senderEmail)}">
      </label>
      <div class="list-item-icon">${sub.senderName.charAt(0)}</div>
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(sub.senderName)}</div>
        <div class="list-item-subtitle">${escapeHtml(sub.senderEmail)}</div>
      </div>
      <div class="list-item-meta">
        <span>${sub.emailCount} emails</span>
        <span>${formatBytes(sub.totalSize)}</span>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-sm btn-amber unsub-btn" data-email="${escapeHtml(sub.senderEmail)}">
          UNSUBSCRIBE
        </button>
      </div>
    </div>
  `).join('');

  // Add event listeners
  elements.subscriptionsList.querySelectorAll('.unsub-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleUnsubscribe(btn.dataset.email);
    });
  });

  elements.subscriptionsList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const email = e.target.dataset.email;
      if (e.target.checked) {
        state.selectedIds.add(email);
      } else {
        state.selectedIds.delete(email);
      }
      updateSelectedCount();
    });
  });
}

// Render categories
function renderCategories() {
  const categories = state.categoryGroups;

  elements.categoriesList.innerHTML = categories.map(cat => `
    <div class="category-card" data-category="${cat.id}">
      <div class="category-header">
        <div class="category-icon" style="color: ${cat.color}">${getCategoryEmoji(cat.id)}</div>
        <div class="category-name">${cat.name}</div>
      </div>
      <div class="category-count">${cat.emails.length}</div>
      <div class="category-stats">
        <span>${formatBytes(cat.totalSize)}</span>
      </div>
    </div>
  `).join('');
}

// Render senders
function renderSenders(filter = '') {
  let senders = state.senderGroups;

  if (filter) {
    const lowerFilter = filter.toLowerCase();
    senders = senders.filter(s =>
      s.senderName.toLowerCase().includes(lowerFilter) ||
      s.senderEmail.toLowerCase().includes(lowerFilter)
    );
  }

  if (senders.length === 0) {
    elements.sendersList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👤</div>
        <div class="empty-state-text">No senders found</div>
      </div>
    `;
    return;
  }

  elements.sendersList.innerHTML = senders.slice(0, 100).map(sender => `
    <div class="list-item">
      <div class="list-item-icon">${sender.senderName.charAt(0)}</div>
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(sender.senderName)}</div>
        <div class="list-item-subtitle">${escapeHtml(sender.senderEmail)}</div>
      </div>
      <div class="list-item-meta">
        <span>${sender.emailCount} emails</span>
        <span>${formatBytes(sender.totalSize)}</span>
      </div>
      ${sender.hasUnsubscribe ? `
        <div class="list-item-actions">
          <button class="btn btn-sm btn-amber unsub-btn" data-email="${escapeHtml(sender.senderEmail)}">
            UNSUBSCRIBE
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');

  // Add event listeners
  elements.sendersList.querySelectorAll('.unsub-btn').forEach(btn => {
    btn.addEventListener('click', () => handleUnsubscribe(btn.dataset.email));
  });
}

// Update cleanup counts
function updateCleanupCounts() {
  const emails = state.emails;

  const oldEmails = emails.filter(e => {
    const daysOld = (Date.now() - new Date(e.date).getTime()) / (1000 * 60 * 60 * 24);
    return daysOld > 365;
  });

  const largeEmails = emails.filter(e => (e.sizeEstimate || 0) > 5 * 1024 * 1024);

  const promoEmails = emails.filter(e =>
    e.categories?.some(c => c.id === 'MARKETING')
  );

  const socialEmails = emails.filter(e =>
    e.categories?.some(c => c.id === 'SOCIAL')
  );

  elements.oldCount.textContent = oldEmails.length;
  elements.largeCount.textContent = largeEmails.length;
  elements.promoCount.textContent = promoEmails.length;
  elements.socialCount.textContent = socialEmails.length;
}

// Handle unsubscribe
async function handleUnsubscribe(senderEmail) {
  const subscription = state.subscriptions.find(s => s.senderEmail === senderEmail);
  if (!subscription?.unsubscribeInfo) {
    alert('No unsubscribe method found.');
    return;
  }

  const info = subscription.unsubscribeInfo;

  try {
    if (info.oneClick && info.httpUrl) {
      await fetch(info.httpUrl, {
        method: 'POST',
        body: 'List-Unsubscribe=One-Click',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      alert(`Unsubscribed from ${subscription.senderName}!`);
    } else if (info.httpUrl) {
      chrome.tabs.create({ url: info.httpUrl, active: true });
    } else if (info.mailto) {
      const [address] = info.mailto.split('?');
      await gmailApi.sendEmail(address, 'Unsubscribe', 'Please unsubscribe me.');
      alert('Unsubscribe email sent!');
    }
  } catch (error) {
    alert('Failed to unsubscribe: ' + error.message);
  }
}

// Bulk cleanup
async function handleBulkCleanup(action) {
  let emailsToDelete = [];

  if (action === 'old') {
    emailsToDelete = state.emails.filter(e => {
      const daysOld = (Date.now() - new Date(e.date).getTime()) / (1000 * 60 * 60 * 24);
      return daysOld > 365;
    });
  } else if (action === 'large') {
    emailsToDelete = state.emails.filter(e => (e.sizeEstimate || 0) > 5 * 1024 * 1024);
  } else if (action === 'promotions') {
    emailsToDelete = state.emails.filter(e => e.categories?.some(c => c.id === 'MARKETING'));
  } else if (action === 'social') {
    emailsToDelete = state.emails.filter(e => e.categories?.some(c => c.id === 'SOCIAL'));
  }

  if (emailsToDelete.length === 0) {
    alert('No emails to delete in this category.');
    return;
  }

  if (!confirm(`Delete ${emailsToDelete.length} emails? This will move them to trash.`)) {
    return;
  }

  state.isProcessing = true;
  state.cancelProcess = false;
  elements.cleanupProgress.classList.remove('hidden');

  const ids = emailsToDelete.map(e => e.id);

  try {
    const result = await gmailApi.batchModify(ids, 'trash', (progress) => {
      elements.cleanupBar.style.width = `${progress.percentage}%`;
      elements.cleanupCount.textContent = `${progress.processed} / ${progress.total}`;
      elements.cleanupPercent.textContent = `${progress.percentage}%`;
    });

    alert(`Cleanup complete! ${result.success} emails moved to trash.`);

    // Refresh data
    await loadCachedData();
    renderAll();

  } catch (error) {
    alert('Cleanup failed: ' + error.message);
  } finally {
    state.isProcessing = false;
    elements.cleanupProgress.classList.add('hidden');
  }
}

// Update selected count
function updateSelectedCount() {
  elements.unsubscribeSelected.textContent = `UNSUBSCRIBE SELECTED (${state.selectedIds.size})`;
}

// Utility functions
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getCategoryEmoji(id) {
  const emojis = {
    NEWSLETTERS: '📰',
    MARKETING: '🏷️',
    SOCIAL: '👥',
    RECEIPTS: '🧾',
    NOTIFICATIONS: '🔔',
    FINANCE: '💳',
    OLD_EMAILS: '🕐',
    LARGE_ATTACHMENTS: '📎',
    UNCATEGORIZED: '📧'
  };
  return emojis[id] || '📧';
}

// Event listeners
elements.refreshBtn.addEventListener('click', async () => {
  await loadCachedData();
  renderAll();
});

elements.searchSubs.addEventListener('input', (e) => {
  renderSubscriptions(e.target.value);
});

elements.searchSenders.addEventListener('input', (e) => {
  renderSenders(e.target.value);
});

elements.unsubscribeSelected.addEventListener('click', async () => {
  if (state.selectedIds.size === 0) {
    alert('No subscriptions selected.');
    return;
  }

  for (const email of state.selectedIds) {
    await handleUnsubscribe(email);
  }
});

elements.cancelCleanup.addEventListener('click', () => {
  state.cancelProcess = true;
});

// Cleanup card click handlers
document.querySelectorAll('.cleanup-card').forEach(card => {
  card.querySelector('.btn').addEventListener('click', () => {
    const action = card.dataset.action;
    handleBulkCleanup(action);
  });
});

// Initialize
document.addEventListener('DOMContentLoaded', init);
