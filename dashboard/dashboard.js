/**
 * Inbox Cleaner - Dashboard
 * Tabs: Marketing, People, Old, All
 * AI-powered sender classification
 */

const gmailApi = new GmailAPI();
const aiClassifier = new AIClassifier();

let state = {
  senders: [],
  classifications: {}, // email -> category name (dynamic, e.g., "Newsletters", "Shopping", "People")
  categories: [], // Array of unique category names discovered
  aiClassified: new Set(), // emails that were classified by AI (not regex fallback)
  selectedEmails: new Set(),
  currentTab: 'all', // Start with "all" since categories are dynamic
  isScanning: false,
  cancelScan: false,
  lastSummaryData: null // Store data for re-opening summary modal
};

// Category icons - matches the fixed categories from AI classifier
const CATEGORY_ICONS = {
  'People': '👤',
  'Newsletters': '📰',
  'Shopping': '🛒',
  'Social Media': '👥',
  'Finance': '💰',
  'Travel': '✈️',
  'Food': '🍔',
  'Entertainment': '🎬',
  'Work': '💼',
  'Notifications': '🔔',
  'Other': '📁',
  // Special tabs
  'old': '🕐',
  'all': '📋'
};

// DOM Elements
const elements = {
  userEmail: document.getElementById('user-email'),
  scanBtn: document.getElementById('scan-btn'),
  showSummaryBtn: document.getElementById('show-summary-btn'),
  aiSettingsBtn: document.getElementById('ai-settings-btn'),
  cancelBtn: document.getElementById('cancel-btn'),
  scanProgress: document.getElementById('scan-progress'),
  progressBar: document.getElementById('progress-bar'),
  progressStatus: document.getElementById('progress-status'),
  progressPercent: document.getElementById('progress-percent'),
  sendersList: document.getElementById('senders-list'),
  searchSenders: document.getElementById('search-senders'),
  selectAll: document.getElementById('select-all'),
  deleteSelectedBtn: document.getElementById('delete-selected-btn'),
  selectedCount: document.getElementById('selected-count'),
  tabTitle: document.getElementById('tab-title'),
  tabDescription: document.getElementById('tab-description'),
  totalEmails: document.getElementById('total-emails'),
  lastScan: document.getElementById('last-scan'),
  marketingCount: document.getElementById('marketing-count'),
  peopleCount: document.getElementById('people-count'),
  oldCount: document.getElementById('old-count'),
  allCount: document.getElementById('all-count'),
  // Modal
  apiKeyModal: document.getElementById('api-key-modal'),
  apiKeyInput: document.getElementById('api-key-input'),
  saveApiKeyBtn: document.getElementById('save-api-key'),
  cancelApiKeyBtn: document.getElementById('cancel-api-key'),
  // Scan scope
  scanScope: document.getElementById('scan-scope'),
  // Cleanup
  cleanupLabelsBtn: document.getElementById('cleanup-labels-btn')
};

// Initialize
async function init() {
  try {
    const isAuth = await gmailApi.isAuthenticated();
    if (!isAuth) {
      await gmailApi.getToken(true);
    }
    await loadUserProfile();
    await aiClassifier.loadApiKey();
    loadCachedData();
    setupEventListeners();
    updateAiButtonState();
  } catch (error) {
    console.error('Init error:', error);
    alert('Please connect Gmail from the extension popup first.');
  }
}

function setupEventListeners() {
  elements.scanBtn.addEventListener('click', handleScan);
  elements.showSummaryBtn.addEventListener('click', () => showClassificationSummary());
  elements.aiSettingsBtn.addEventListener('click', showApiKeyModal);
  elements.cancelBtn.addEventListener('click', () => { state.cancelScan = true; });
  elements.searchSenders.addEventListener('input', () => renderSenders());
  elements.selectAll.addEventListener('change', handleSelectAll);
  elements.deleteSelectedBtn.addEventListener('click', handleDeleteSelected);

  // API Key modal
  elements.saveApiKeyBtn.addEventListener('click', saveApiKey);
  elements.cancelApiKeyBtn.addEventListener('click', hideApiKeyModal);

  // Cleanup labels
  elements.cleanupLabelsBtn.addEventListener('click', handleCleanupLabels);

  // Note: Tab navigation is set up dynamically in renderCategoryTabs()
}

function updateAiButtonState() {
  if (aiClassifier.hasApiKey()) {
    elements.aiSettingsBtn.textContent = '🤖 AI ON';
    elements.aiSettingsBtn.style.borderColor = '#8a2be2';
  } else {
    elements.aiSettingsBtn.textContent = '🤖';
    elements.aiSettingsBtn.style.borderColor = '';
  }
}

function showApiKeyModal() {
  elements.apiKeyModal.classList.remove('hidden');
  if (aiClassifier.apiKey) {
    elements.apiKeyInput.value = aiClassifier.apiKey;
  }
}

function hideApiKeyModal() {
  elements.apiKeyModal.classList.add('hidden');
  elements.apiKeyInput.value = '';
}

async function saveApiKey() {
  const key = elements.apiKeyInput.value.trim();
  if (!key) {
    alert('Please enter an API key');
    return;
  }

  await aiClassifier.saveApiKey(key);
  updateAiButtonState();
  hideApiKeyModal();

  // If we have senders, offer to re-classify
  if (state.senders.length > 0) {
    if (confirm('Re-classify existing senders with AI?')) {
      await classifySendersWithAI();
    }
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

function loadCachedData() {
  chrome.storage.local.get(['senders', 'classifications', 'categories', 'lastScan'], (data) => {
    if (data.senders && data.senders.length > 0) {
      state.senders = data.senders;
      state.classifications = data.classifications || {};
      state.categories = data.categories || extractCategoriesFromClassifications(data.classifications || {});
      updateStats();
      renderCategoryTabs();
      updateTabCounts();
      renderSenders();

      if (data.lastScan) {
        elements.lastScan.textContent = new Date(data.lastScan).toLocaleDateString();
      }
    }
  });
}

// Extract unique categories from classifications
function extractCategoriesFromClassifications(classifications) {
  const cats = new Set(Object.values(classifications));
  // Sort with People first, then alphabetically
  return Array.from(cats).sort((a, b) => {
    if (a === 'People') return -1;
    if (b === 'People') return 1;
    return a.localeCompare(b);
  });
}

function saveData() {
  chrome.storage.local.set({
    senders: state.senders,
    classifications: state.classifications,
    categories: state.categories,
    lastScan: Date.now()
  });
}

function updateStats() {
  const totalEmails = state.senders.reduce((sum, s) => sum + s.count, 0);
  elements.totalEmails.textContent = totalEmails.toLocaleString();
}

// Render dynamic category tabs in sidebar
function renderCategoryTabs() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  // Build tabs HTML - dynamic categories + special tabs (old, all)
  let tabsHtml = '';

  // Dynamic category tabs
  for (const category of state.categories) {
    const icon = CATEGORY_ICONS[category] || '📁';
    const tabId = category.toLowerCase().replace(/\s+/g, '-');
    const isActive = state.currentTab === category ? 'active' : '';
    tabsHtml += `
      <button class="nav-item ${isActive}" data-tab="${category}">
        <span>${icon}</span> ${category}
        <span class="nav-count" id="count-${tabId}">0</span>
      </button>
    `;
  }

  // Special tabs: Old and All
  tabsHtml += `
    <button class="nav-item ${state.currentTab === 'old' ? 'active' : ''}" data-tab="old">
      <span>🕐</span> Old / Inactive
      <span class="nav-count" id="old-count">0</span>
    </button>
    <button class="nav-item ${state.currentTab === 'all' ? 'active' : ''}" data-tab="all">
      <span>📋</span> All Senders
      <span class="nav-count" id="all-count">0</span>
    </button>
  `;

  nav.innerHTML = tabsHtml;

  // Re-attach click handlers
  nav.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      state.currentTab = item.dataset.tab;
      state.selectedEmails.clear();
      updateSelectedCount();

      nav.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Update title based on tab
      if (state.currentTab === 'old') {
        elements.tabTitle.textContent = 'OLD / INACTIVE';
        elements.tabDescription.textContent = 'Senders with no emails in the last 90 days';
      } else if (state.currentTab === 'all') {
        elements.tabTitle.textContent = 'ALL SENDERS';
        elements.tabDescription.textContent = 'Every sender in your inbox';
      } else {
        elements.tabTitle.textContent = state.currentTab.toUpperCase();
        elements.tabDescription.textContent = `Emails categorized as ${state.currentTab}`;
      }

      elements.searchSenders.value = '';
      elements.selectAll.checked = false;

      renderSenders();
    });
  });
}

function updateTabCounts() {
  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;

  // Count emails per category
  const categoryCounts = {};
  let old = 0, all = 0;

  for (const sender of state.senders) {
    const category = state.classifications[sender.email] || 'Other';
    all += sender.count;

    if (!categoryCounts[category]) {
      categoryCounts[category] = 0;
    }
    categoryCounts[category] += sender.count;

    if (sender.lastEmailDate && (now - sender.lastEmailDate) > ninetyDays) {
      old += sender.count;
    }
  }

  // Update dynamic category counts
  for (const category of state.categories) {
    const tabId = category.toLowerCase().replace(/\s+/g, '-');
    const countEl = document.getElementById(`count-${tabId}`);
    if (countEl) {
      countEl.textContent = (categoryCounts[category] || 0).toLocaleString();
    }
  }

  // Update special tab counts
  const oldCountEl = document.getElementById('old-count');
  const allCountEl = document.getElementById('all-count');
  if (oldCountEl) oldCountEl.textContent = old.toLocaleString();
  if (allCountEl) allCountEl.textContent = all.toLocaleString();
}

function getFilteredSenders() {
  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  const filter = elements.searchSenders.value.toLowerCase();

  let senders = state.senders;

  // Filter by tab
  if (state.currentTab === 'old') {
    senders = senders.filter(s => s.lastEmailDate && (now - s.lastEmailDate) > ninetyDays);
  } else if (state.currentTab === 'all') {
    // Show all senders
  } else {
    // Dynamic category filter
    senders = senders.filter(s => state.classifications[s.email] === state.currentTab);
  }

  // Filter by search
  if (filter) {
    senders = senders.filter(s =>
      s.name.toLowerCase().includes(filter) ||
      s.email.toLowerCase().includes(filter)
    );
  }

  // Sort: old tab by age (oldest first), others by count
  if (state.currentTab === 'old') {
    return senders.sort((a, b) => (a.lastEmailDate || 0) - (b.lastEmailDate || 0));
  }
  return senders.sort((a, b) => b.count - a.count);
}

// Scan inbox
async function handleScan() {
  if (state.isScanning) return;

  state.isScanning = true;
  state.cancelScan = false;
  state.senders = [];
  state.classifications = {};
  state.selectedEmails.clear();

  elements.scanProgress.classList.remove('hidden');
  elements.scanBtn.disabled = true;
  updateProgress('Fetching emails...', 0);

  try {
    const allMessages = [];
    let pageToken = null;
    let page = 0;

    do {
      if (state.cancelScan) break;
      page++;
      updateProgress(`Fetching email list (page ${page})...`, 0);

      // Build query based on selected scope
      const scope = elements.scanScope.value;
      const query = scope === 'inbox' ? 'in:inbox' : '-in:trash -in:spam';
      const response = await gmailApi.listMessages(query, 500, pageToken);
      console.log(`[Inbox Cleaner] Page ${page} (${scope}): Gmail returned ${response.messages?.length || 0} messages, resultSizeEstimate: ${response.resultSizeEstimate}`);
      const messages = response.messages || [];
      allMessages.push(...messages);
      pageToken = response.nextPageToken;
    } while (pageToken && !state.cancelScan);

    if (state.cancelScan) {
      finishScan();
      return;
    }

    const total = allMessages.length;
    const scope = elements.scanScope.value;
    console.log(`[Inbox Cleaner] Total messages from '${scope}' query: ${total}`);
    updateProgress(`Found ${total} emails. Analyzing...`, 0);

    const senderMap = new Map();
    const chunkSize = 50;
    let skippedSent = 0;
    let skippedLabeled = 0;
    let included = 0;

    for (let i = 0; i < allMessages.length; i += chunkSize) {
      if (state.cancelScan) break;

      const chunk = allMessages.slice(i, i + chunkSize);
      const percent = Math.round(((i + chunk.length) / total) * 100);
      updateProgress(`Analyzing ${i + chunk.length} of ${total}... (${included} included)`, percent);

      const details = await Promise.all(
        chunk.map(m => gmailApi.getMessage(m.id, 'metadata'))
      );

      for (const msg of details) {
        if (!msg || !msg.payload) continue;

        const labelIds = msg.labelIds || [];

        // Skip sent emails (we'll handle them separately or ignore)
        if (labelIds.includes('SENT')) {
          skippedSent++;
          continue;
        }

        // For inbox-only scan, skip emails with user labels
        // For all-mail scan, include everything
        if (scope === 'inbox') {
          const hasUserLabel = labelIds.some(id => id.startsWith('Label_'));
          if (hasUserLabel) {
            skippedLabeled++;
            continue;
          }
        }

        included++;

        const headers = {};
        for (const h of msg.payload.headers || []) {
          headers[h.name.toLowerCase()] = h.value;
        }

        const from = headers.from || '';
        const senderEmail = extractEmail(from);
        const senderName = extractName(from);
        const emailDate = headers.date ? new Date(headers.date).getTime() : 0;

        // Parse unsubscribe header
        const listUnsubscribe = headers['list-unsubscribe'] || null;
        const listUnsubscribePost = headers['list-unsubscribe-post'] || null;

        if (!senderMap.has(senderEmail)) {
          senderMap.set(senderEmail, {
            email: senderEmail,
            name: senderName,
            count: 0,
            messageIds: [],
            lastEmailDate: 0,
            unsubscribe: null
          });
        }

        const sender = senderMap.get(senderEmail);
        sender.count++;
        sender.messageIds.push(msg.id);
        if (emailDate > sender.lastEmailDate) {
          sender.lastEmailDate = emailDate;
        }

        // Store unsubscribe info if we don't have it yet
        if (!sender.unsubscribe && listUnsubscribe) {
          sender.unsubscribe = parseUnsubscribeHeader(listUnsubscribe, listUnsubscribePost);
        }
      }
    }

    console.log(`[Inbox Cleaner] Scan complete: ${included} included, ${skippedSent} sent skipped, ${skippedLabeled} labeled skipped`);

    if (!state.cancelScan) {
      state.senders = Array.from(senderMap.values()).sort((a, b) => b.count - a.count);

      // Classify with AI if API key is set
      if (aiClassifier.hasApiKey()) {
        await classifySendersWithAI();
      } else {
        // Fallback to basic heuristic classification
        classifySendersBasic();
      }

      saveData();
      updateStats();
      updateTabCounts();
      renderSenders();
      elements.lastScan.textContent = new Date().toLocaleDateString();
    }

  } catch (error) {
    console.error('Scan error:', error);
    alert('Scan failed: ' + error.message);
  } finally {
    finishScan();
  }
}

// AI Classification - classify ALL senders with Claude for dynamic categories
async function classifySendersWithAI() {
  // Show progress panel during AI work
  elements.scanProgress.classList.remove('hidden');
  updateProgress(`Sending ${state.senders.length} senders to Claude for classification...`, 10);

  try {
    const sendersToClassify = state.senders.map(s => ({
      email: s.email,
      name: s.name
    }));

    const aiResults = await aiClassifier.classifyAll(sendersToClassify, (progress) => {
      const pct = 10 + Math.round((progress.processed / progress.total) * 85);
      updateProgress(`Claude classifying... ${progress.processed}/${progress.total}`, pct);
    });

    // Store AI results as classifications
    state.classifications = aiResults;

    // Mark all as AI-classified
    state.aiClassified = new Set(Object.keys(aiResults));

    // Extract unique categories and sort them
    state.categories = extractCategoriesFromClassifications(aiResults);

    updateProgress(`Done! Found ${state.categories.length} categories`, 100);

    saveData();
    renderCategoryTabs();
    updateTabCounts();

    // Switch to first category tab
    if (state.categories.length > 0) {
      state.currentTab = state.categories[0];
      elements.tabTitle.textContent = state.currentTab.toUpperCase();
      elements.tabDescription.textContent = `Emails categorized as ${state.currentTab}`;
    }

    renderSenders();

    // Show summary
    showClassificationSummary();
    elements.showSummaryBtn.classList.remove('hidden');

  } catch (error) {
    console.error('AI classification failed:', error);
    alert('AI classification failed: ' + error.message + '\n\nFalling back to basic classification.');

    // Fallback to basic classification
    classifySendersBasic();
    state.categories = extractCategoriesFromClassifications(state.classifications);
    saveData();
    renderCategoryTabs();
    updateTabCounts();
    renderSenders();
  }
}

function showClassificationSummary() {
  // Calculate emails per category
  const categoryCounts = {};
  const categorySenderCounts = {};

  for (const sender of state.senders) {
    const category = state.classifications[sender.email] || 'Other';
    if (!categoryCounts[category]) {
      categoryCounts[category] = 0;
      categorySenderCounts[category] = 0;
    }
    categoryCounts[category] += sender.count;
    categorySenderCounts[category]++;
  }

  // Get top senders overall (excluding People)
  const topOffenders = [...state.senders]
    .filter(s => state.classifications[s.email] !== 'People')
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Get old/inactive senders
  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  const oldSenders = state.senders.filter(s => s.lastEmailDate && (now - s.lastEmailDate) > ninetyDays);
  const oldEmails = oldSenders.reduce((sum, s) => sum + s.count, 0);

  // Sort categories by email count (highest first), but People always first
  const sortedCategories = [...state.categories].sort((a, b) => {
    if (a === 'People') return -1;
    if (b === 'People') return 1;
    return (categoryCounts[b] || 0) - (categoryCounts[a] || 0);
  });

  // Build horizontal scrolling category pills
  const categoryPillsHtml = sortedCategories.map(category => {
    const icon = CATEGORY_ICONS[category] || '📁';
    const emailCount = categoryCounts[category] || 0;
    const senderCount = categorySenderCounts[category] || 0;
    const isPeople = category === 'People';

    return `
      <div class="category-pill ${isPeople ? 'people-pill' : 'deletable'}"
           ${!isPeople ? `data-category="${escapeHtml(category)}"` : ''}
           title="${isPeople ? 'Protected - real people' : 'Click to delete all'}">
        <span class="category-pill-icon">${icon}</span>
        <span class="category-pill-count">${emailCount.toLocaleString()}</span>
        <span class="category-pill-name">${category}</span>
        <span class="category-pill-label">${senderCount} senders</span>
      </div>
    `;
  }).join('');

  const topOffendersHtml = topOffenders.map((sender, i) => {
    const category = state.classifications[sender.email] || 'Other';
    return `
      <div class="offender-row">
        <span class="offender-rank">${i + 1}</span>
        <div class="offender-info">
          <div class="offender-name">${escapeHtml(sender.name)}</div>
          <div class="offender-email">${escapeHtml(sender.email)} • ${category}</div>
        </div>
        <span class="offender-count">${sender.count}</span>
        <button class="btn btn-sm btn-danger offender-delete" data-email="${escapeHtml(sender.email)}">🗑️</button>
      </div>
    `;
  }).join('');

  // Total non-People emails
  const nonPeopleEmails = Object.entries(categoryCounts)
    .filter(([cat]) => cat !== 'People')
    .reduce((sum, [, count]) => sum + count, 0);
  const peopleEmails = categoryCounts['People'] || 0;
  const totalEmails = nonPeopleEmails + peopleEmails;

  const summaryHtml = `
    <div class="classification-summary">
      <h3>SCAN COMPLETE</h3>
      <p class="summary-subtitle">${totalEmails.toLocaleString()} emails in ${state.categories.length} categories</p>

      <div class="category-pills-container">
        <p class="text-dim" style="font-size: 10px; margin: 0 0 8px 0;">Click a category to delete all its emails (except People)</p>
        <div class="category-pills">
          ${categoryPillsHtml}
        </div>
      </div>

      ${topOffenders.length > 0 ? `
        <div class="top-offenders">
          <div class="offenders-header">
            <span>🎯 TOP SENDERS</span>
          </div>
          ${topOffendersHtml}
        </div>
      ` : ''}

      <div class="ai-recommendations">
        <div class="recommendations-header">
          <span class="ai-badge">AI</span>
          <span>RECOMMENDATIONS</span>
        </div>
        <div class="recommendations-list">
          ${getRecommendations(nonPeopleEmails, peopleEmails, topOffenders, oldSenders, oldEmails)
            .map(rec => `
              <div class="recommendation-item priority-${rec.priority}">
                <span class="recommendation-icon">${rec.icon}</span>
                <span class="recommendation-text">${rec.text}</span>
              </div>
            `).join('')}
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn" id="dismiss-summary">REVIEW MANUALLY</button>
      </div>
    </div>
  `;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.id = 'summary-modal';
  overlay.innerHTML = `<div class="modal-content modal-wide">${summaryHtml}</div>`;
  document.body.appendChild(overlay);

  document.getElementById('dismiss-summary').addEventListener('click', () => {
    overlay.remove();
  });

  // Add handlers for clickable category pills
  overlay.querySelectorAll('.category-pill.deletable').forEach(pill => {
    pill.addEventListener('click', async () => {
      const category = pill.dataset.category;
      if (category) {
        overlay.remove();
        await deleteCategory(category);
      }
    });
  });

  // Add handlers for individual offender delete buttons
  overlay.querySelectorAll('.offender-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const email = e.target.dataset.email;
      const sender = state.senders.find(s => s.email === email);
      if (sender && confirm(`Delete all ${sender.count} emails from ${sender.name}?`)) {
        overlay.remove();
        await deleteSingleSender(sender);
      }
    });
  });
}

function getRecommendations(nonPeopleEmails, peopleEmails, topOffenders, oldSenders, oldEmails) {
  const totalEmails = nonPeopleEmails + peopleEmails;
  const nonPeoplePercent = totalEmails > 0 ? Math.round((nonPeopleEmails / totalEmails) * 100) : 0;
  const recommendations = [];

  // Priority 1: Major cleanup opportunity
  if (nonPeoplePercent > 80) {
    recommendations.push({
      priority: 'high',
      icon: '🚨',
      text: `${nonPeoplePercent}% of your inbox is automated emails. Delete by category to remove ${nonPeopleEmails.toLocaleString()} emails.`
    });
  } else if (nonPeoplePercent > 50) {
    recommendations.push({
      priority: 'high',
      icon: '⚡',
      text: `Over half your inbox is automated (${nonPeoplePercent}%). Start with the largest categories for quick impact.`
    });
  }

  // Priority 2: Top offenders
  if (topOffenders.length > 0 && topOffenders[0].count > 50) {
    const topCount = topOffenders.slice(0, 3).reduce((s, o) => s + o.count, 0);
    recommendations.push({
      priority: 'medium',
      icon: '🎯',
      text: `Your top 3 senders account for ${topCount.toLocaleString()} emails. Delete these first for quick wins.`
    });
  }

  // Priority 3: Old emails
  if (oldSenders.length > 0 && oldEmails > 100) {
    const oldestSender = oldSenders.sort((a, b) => (a.lastEmailDate || 0) - (b.lastEmailDate || 0))[0];
    const ageText = formatAge(oldestSender.lastEmailDate);
    recommendations.push({
      priority: 'medium',
      icon: '🕐',
      text: `You have ${oldEmails.toLocaleString()} emails from ${oldSenders.length} inactive senders. Oldest: ${oldestSender.name} (${ageText}).`
    });
  }

  // Priority 4: Specific sender callouts
  if (topOffenders.length > 0 && topOffenders[0].count > 200) {
    recommendations.push({
      priority: 'low',
      icon: '📧',
      text: `${topOffenders[0].name} alone has ${topOffenders[0].count} emails - consider unsubscribing and deleting.`
    });
  }

  // Default if nothing else
  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'low',
      icon: '✨',
      text: `Your inbox looks manageable! Review each category and delete what you don't need.`
    });
  }

  return recommendations;
}

async function deleteSingleSender(sender) {
  elements.scanProgress.classList.remove('hidden');
  updateProgress(`Deleting emails from ${sender.name}...`, 50);

  try {
    const result = await deleteEmailsFromSender(sender.email);

    // Remove from state
    state.senders = state.senders.filter(s => s.email !== sender.email);
    delete state.classifications[sender.email];
    state.aiClassified.delete(sender.email);

    saveData();
    updateTabCounts();
    renderSenders();

    alert(`Deleted ${result.success} emails from ${sender.name}!`);
  } catch (error) {
    console.error('Delete failed:', error);
    alert('Delete failed: ' + error.message);
  } finally {
    elements.scanProgress.classList.add('hidden');
  }
}

async function deleteCategory(category) {
  // Get all senders in this category
  const categorySenders = state.senders.filter(s =>
    state.classifications[s.email] === category
  );

  if (categorySenders.length === 0) {
    alert(`No senders in "${category}" to delete.`);
    return;
  }

  // Calculate total emails
  const totalEmails = categorySenders.reduce((sum, s) => sum + s.count, 0);

  if (!confirm(`DELETE ${totalEmails.toLocaleString()} emails from ${categorySenders.length} "${category}" senders?\n\nThis will move them to trash (recoverable for 30 days).`)) {
    return;
  }

  elements.scanProgress.classList.remove('hidden');
  updateProgress(`Deleting ${category} emails...`, 0);

  let deletedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < categorySenders.length; i++) {
    const sender = categorySenders[i];
    updateProgress(`Deleting emails from ${sender.name}... (${i + 1}/${categorySenders.length})`,
      Math.round((i / categorySenders.length) * 100));

    try {
      const result = await deleteEmailsFromSender(sender.email);
      deletedCount += result.success;
      errorCount += result.failed;
    } catch (error) {
      console.error(`Failed to delete from ${sender.email}:`, error);
      errorCount += sender.count;
    }
  }

  elements.scanProgress.classList.add('hidden');

  // Remove deleted senders from state
  state.senders = state.senders.filter(s =>
    state.classifications[s.email] !== category
  );

  // Clear classifications for deleted senders
  for (const sender of categorySenders) {
    delete state.classifications[sender.email];
    state.aiClassified.delete(sender.email);
  }

  // Update categories list
  state.categories = extractCategoriesFromClassifications(state.classifications);

  saveData();
  renderCategoryTabs();
  updateTabCounts();
  renderSenders();

  alert(`Deleted ${deletedCount.toLocaleString()} emails from "${category}"!\n${errorCount > 0 ? `${errorCount} failed.` : ''}`);
}

async function deleteEmailsFromSender(senderEmail) {
  // Use the message IDs we already collected during scan
  // These are already filtered to exclude labeled emails
  const sender = state.senders.find(s => s.email === senderEmail);

  if (!sender || !sender.messageIds || sender.messageIds.length === 0) {
    return { success: 0, failed: 0 };
  }

  // Batch delete using stored message IDs
  const result = await gmailApi.batchModify(sender.messageIds, 'trash');
  return result;
}

// Basic heuristic classification (fallback when no AI)
function classifySendersBasic() {
  // Clear AI classification flag since we're using regex fallback
  state.aiClassified = new Set();

  for (const sender of state.senders) {
    state.classifications[sender.email] = classifyByPatterns(sender);
  }

  // Extract categories from classifications
  state.categories = extractCategoriesFromClassifications(state.classifications);
}

// Pattern-based classification into fixed categories (matches AI classifier)
function classifyByPatterns(sender) {
  const email = sender.email.toLowerCase();

  // Social Media
  if (/@(facebook|linkedin|twitter|instagram|tiktok|pinterest|snapchat|youtube|reddit|x\.com)\./i.test(email) ||
      /@(facebookmail|linkedinmail|twittermail)\./i.test(email)) {
    return 'Social Media';
  }

  // Shopping
  if (/@(amazon|ebay|etsy|walmart|target|bestbuy|costco|wayfair|zappos|macys|nordstrom|shopify|aliexpress)\./i.test(email) ||
      /orders?@|receipt@|shipping@|confirmation@|store@/i.test(email)) {
    return 'Shopping';
  }

  // Food (restaurants, delivery)
  if (/@(doordash|grubhub|ubereats|postmates|instacart|seamless|caviar|starbucks|chipotle|mcdonalds)\./i.test(email)) {
    return 'Food';
  }

  // Finance
  if (/@(paypal|venmo|cashapp|chase|bankofamerica|wellsfargo|citi|amex|capitalone|mint|robinhood|coinbase|stripe)\./i.test(email) ||
      /statement@|alerts?@.*bank|billing@|invoice@/i.test(email)) {
    return 'Finance';
  }

  // Travel
  if (/@(airbnb|booking|expedia|kayak|hotels|tripadvisor|southwest|united|delta|american|jetblue|marriott|hilton)\./i.test(email)) {
    return 'Travel';
  }

  // Entertainment
  if (/@(spotify|netflix|hulu|disney|hbo|peacock|paramount|twitch|steam|apple|youtube)\./i.test(email)) {
    return 'Entertainment';
  }

  // Work (professional tools)
  if (/@(slack|zoom|notion|figma|asana|trello|monday|jira|confluence|github|gitlab|atlassian|dropbox|google)\./i.test(email)) {
    return 'Work';
  }

  // Newsletters (has unsubscribe or common newsletter patterns)
  if (sender.unsubscribe ||
      /newsletter@|digest@|updates?@|weekly@|daily@|news@/i.test(email) ||
      /@(substack|mailchimp|constantcontact|sendgrid|hubspot|beehiiv)\./i.test(email)) {
    return 'Newsletters';
  }

  // Notifications (automated system emails)
  if (/noreply@|no-reply@|donotreply@|notifications?@|alerts?@|mailer@|automated@/i.test(email) ||
      /^(info|hello|support|help|team|admin|contact)@/i.test(email)) {
    return 'Notifications';
  }

  // If no patterns match, likely a person
  return 'People';
}

function finishScan() {
  state.isScanning = false;
  elements.scanProgress.classList.add('hidden');
  elements.scanBtn.disabled = false;
}

function updateProgress(status, percent) {
  elements.progressStatus.textContent = status;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressBar.style.width = `${percent}%`;
}

// Render senders list
function renderSenders() {
  const senders = getFilteredSenders();

  if (senders.length === 0) {
    elements.sendersList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">
          ${state.senders.length === 0
            ? 'Click "SCAN INBOX" to analyze your emails.'
            : 'No senders match this filter.'}
        </div>
      </div>
    `;
    return;
  }

  elements.sendersList.innerHTML = senders.map(sender => {
    const classification = state.classifications[sender.email];
    const isAiClassified = state.aiClassified.has(sender.email);

    // Show how it was classified
    let classificationBadge = '';
    if (isAiClassified) {
      classificationBadge = `<span class="ai-badge" title="Classified by Claude AI">AI</span>`;
    } else if (classification) {
      classificationBadge = `<span class="auto-badge" title="Auto-detected by pattern matching">AUTO</span>`;
    }

    // Show age badge for old tab
    let ageBadge = '';
    if (state.currentTab === 'old' && sender.lastEmailDate) {
      ageBadge = `<span class="age-badge">${formatAge(sender.lastEmailDate)}</span>`;
    }

    // Unsubscribe button if available
    const unsubBtn = sender.unsubscribe
      ? `<button class="btn btn-sm btn-unsub" data-email="${escapeHtml(sender.email)}" title="Unsubscribe">📧</button>`
      : '';

    return `
    <div class="list-item ${state.selectedEmails.has(sender.email) ? 'selected' : ''}" data-email="${escapeHtml(sender.email)}">
      <label class="checkbox list-item-checkbox">
        <input type="checkbox" class="sender-checkbox" data-email="${escapeHtml(sender.email)}"
          ${state.selectedEmails.has(sender.email) ? 'checked' : ''}>
      </label>
      <div class="list-item-icon">${getInitial(sender.name)}</div>
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(sender.name)}${classificationBadge}</div>
        <div class="list-item-subtitle">${escapeHtml(sender.email)}</div>
      </div>
      <div class="list-item-meta">
        ${ageBadge}
        <span class="count-badge">${sender.count} emails</span>
        ${unsubBtn}
      </div>
    </div>
  `}).join('');

  // Add checkbox handlers
  elements.sendersList.querySelectorAll('.sender-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const email = e.target.dataset.email;
      if (e.target.checked) {
        state.selectedEmails.add(email);
      } else {
        state.selectedEmails.delete(email);
      }
      updateSelectedCount();
      updateSelectAllState();

      const row = e.target.closest('.list-item');
      row.classList.toggle('selected', e.target.checked);
    });
  });

  // Click on row to toggle
  elements.sendersList.querySelectorAll('.list-item').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.type === 'checkbox' || e.target.closest('.btn-unsub')) return;
      const cb = row.querySelector('.sender-checkbox');
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    });
  });

  // Unsubscribe button handlers
  elements.sendersList.querySelectorAll('.btn-unsub').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const email = btn.dataset.email;
      const sender = state.senders.find(s => s.email === email);
      if (sender) {
        await handleUnsubscribe(sender);
      }
    });
  });

  updateSelectAllState();
}

function handleSelectAll(e) {
  const checkboxes = elements.sendersList.querySelectorAll('.sender-checkbox');

  checkboxes.forEach(cb => {
    cb.checked = e.target.checked;
    const email = cb.dataset.email;
    if (e.target.checked) {
      state.selectedEmails.add(email);
    } else {
      state.selectedEmails.delete(email);
    }
  });

  updateSelectedCount();
  renderSenders();
}

function updateSelectAllState() {
  const checkboxes = elements.sendersList.querySelectorAll('.sender-checkbox');
  const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
  elements.selectAll.checked = allChecked;
}

function updateSelectedCount() {
  const count = state.selectedEmails.size;
  elements.selectedCount.textContent = count;
  elements.deleteSelectedBtn.disabled = count === 0;
}

// Delete all emails from selected senders
async function handleDeleteSelected() {
  if (state.selectedEmails.size === 0) return;

  const selectedSenders = state.senders.filter(s => state.selectedEmails.has(s.email));
  const totalEmails = selectedSenders.reduce((sum, s) => sum + s.count, 0);
  const allMessageIds = selectedSenders.flatMap(s => s.messageIds);

  const senderNames = selectedSenders.slice(0, 3).map(s => s.name).join(', ');
  const moreCount = selectedSenders.length > 3 ? ` and ${selectedSenders.length - 3} more` : '';

  if (!confirm(
    `DELETE ${totalEmails} emails from ${selectedSenders.length} senders?\n\n` +
    `Senders: ${senderNames}${moreCount}\n\n` +
    `This will move them to trash (recoverable for 30 days).`
  )) {
    return;
  }

  elements.deleteSelectedBtn.disabled = true;
  elements.deleteSelectedBtn.textContent = '🗑️ DELETING...';

  try {
    await gmailApi.batchModify(allMessageIds, 'trash', (progress) => {
      elements.deleteSelectedBtn.textContent = `🗑️ ${progress.percentage}%`;
    });

    state.senders = state.senders.filter(s => !state.selectedEmails.has(s.email));
    state.selectedEmails.clear();

    saveData();
    updateStats();
    updateTabCounts();
    updateSelectedCount();
    renderSenders();

    alert(`Deleted ${totalEmails} emails from ${selectedSenders.length} senders.`);

  } catch (error) {
    console.error('Delete error:', error);
    alert('Failed to delete: ' + error.message);
  } finally {
    elements.deleteSelectedBtn.disabled = false;
    elements.deleteSelectedBtn.innerHTML = '🗑️ DELETE SELECTED (<span id="selected-count">0</span>)';
    elements.selectedCount = document.getElementById('selected-count');
    updateSelectedCount();
  }
}

// Utility functions
function parseUnsubscribeHeader(listUnsubscribe, listUnsubscribePost) {
  if (!listUnsubscribe) return null;

  const result = {
    mailto: null,
    httpUrl: null,
    oneClick: false
  };

  // Parse mailto: links - <mailto:unsubscribe@example.com?subject=Unsubscribe>
  const mailtoMatch = listUnsubscribe.match(/<mailto:([^>]+)>/i);
  if (mailtoMatch) {
    result.mailto = mailtoMatch[1];
  }

  // Parse http/https URLs - <https://example.com/unsubscribe?token=xyz>
  const httpMatch = listUnsubscribe.match(/<(https?:\/\/[^>]+)>/i);
  if (httpMatch) {
    result.httpUrl = httpMatch[1];
  }

  // Check for one-click support
  if (listUnsubscribePost && listUnsubscribePost.toLowerCase().includes('list-unsubscribe=one-click')) {
    result.oneClick = true;
  }

  return (result.mailto || result.httpUrl) ? result : null;
}

async function handleUnsubscribe(sender) {
  if (!sender.unsubscribe) {
    alert('No unsubscribe option available for this sender.');
    return;
  }

  const unsub = sender.unsubscribe;

  // Prefer HTTP URL (easier for user), then mailto
  if (unsub.httpUrl) {
    const confirmed = confirm(
      `Unsubscribe from ${sender.name}?\n\n` +
      `This will open the unsubscribe page in a new tab.\n\n` +
      `After unsubscribing, you can delete their ${sender.count} existing emails.`
    );
    if (confirmed) {
      window.open(unsub.httpUrl, '_blank');
    }
  } else if (unsub.mailto) {
    // Parse mailto for email and subject
    const [email, params] = unsub.mailto.split('?');
    let subject = 'Unsubscribe';
    let body = 'Please unsubscribe me from this mailing list.';

    if (params) {
      const urlParams = new URLSearchParams(params);
      if (urlParams.get('subject')) subject = urlParams.get('subject');
      if (urlParams.get('body')) body = urlParams.get('body');
    }

    const confirmed = confirm(
      `Unsubscribe from ${sender.name}?\n\n` +
      `This will send an unsubscribe email to: ${email}\n\n` +
      `After unsubscribing, you can delete their ${sender.count} existing emails.`
    );

    if (confirmed) {
      try {
        await gmailApi.sendEmail(email, subject, body);
        alert(`Unsubscribe email sent to ${email}!\n\nYou should be removed within a few days.`);
      } catch (error) {
        console.error('Failed to send unsubscribe email:', error);
        alert('Failed to send unsubscribe email: ' + error.message);
      }
    }
  }
}

function extractEmail(from) {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : from.toLowerCase().trim();
}

function extractName(from) {
  const match = from.match(/^([^<]+)/);
  if (match) {
    return match[1].trim().replace(/"/g, '');
  }
  return extractEmail(from);
}

function getInitial(name) {
  return (name.charAt(0) || '?').toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatAge(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (days < 30) return `${days}d ago`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days % 365) / 30);
  if (remainingMonths > 0) {
    return `${years}y ${remainingMonths}mo ago`;
  }
  return `${years}y ago`;
}

// Label cleanup functionality
async function handleCleanupLabels() {
  try {
    // Get all labels first
    const labelsResponse = await gmailApi.listLabels();
    const allLabels = labelsResponse.labels || [];

    // Filter to user labels only (exclude system labels)
    const userLabels = allLabels.filter(l => l.type === 'user');

    if (userLabels.length === 0) {
      alert('No custom labels found.');
      return;
    }

    // Group by prefix
    const prefixes = new Map();
    for (const label of userLabels) {
      const parts = label.name.split('/');
      const prefix = parts.length > 1 ? parts[0] + '/' : '(no prefix)';
      if (!prefixes.has(prefix)) {
        prefixes.set(prefix, []);
      }
      prefixes.get(prefix).push(label);
    }

    // Build modal content
    const modalHtml = `
      <div class="label-cleanup-modal">
        <h2>CLEAN UP LABELS</h2>
        <p class="text-dim">Select labels to delete (emails will be trashed first)</p>

        <div class="label-groups">
          ${Array.from(prefixes.entries()).map(([prefix, labels]) => `
            <div class="label-group">
              <div class="label-group-header">
                <label class="checkbox">
                  <input type="checkbox" class="prefix-checkbox" data-prefix="${escapeHtml(prefix)}">
                  <span>${escapeHtml(prefix)} (${labels.length} labels)</span>
                </label>
              </div>
              <div class="label-group-items">
                ${labels.slice(0, 20).map(l => `
                  <label class="checkbox label-item">
                    <input type="checkbox" class="label-checkbox" data-id="${escapeHtml(l.id)}" data-name="${escapeHtml(l.name)}" data-prefix="${escapeHtml(prefix)}">
                    <span>${escapeHtml(l.name.replace(prefix, ''))}</span>
                  </label>
                `).join('')}
                ${labels.length > 20 ? `<div class="text-dim">...and ${labels.length - 20} more</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="modal-actions">
          <button class="btn" id="cancel-cleanup">CANCEL</button>
          <button class="btn btn-danger" id="confirm-cleanup">DELETE SELECTED</button>
        </div>
      </div>
    `;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.id = 'cleanup-modal';
    overlay.innerHTML = `<div class="modal-content modal-wide">${modalHtml}</div>`;
    document.body.appendChild(overlay);

    // Prefix checkbox toggles all children
    overlay.querySelectorAll('.prefix-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const prefix = e.target.dataset.prefix;
        overlay.querySelectorAll(`.label-checkbox[data-prefix="${prefix}"]`).forEach(child => {
          child.checked = e.target.checked;
        });
      });
    });

    // Cancel button
    document.getElementById('cancel-cleanup').addEventListener('click', () => {
      overlay.remove();
    });

    // Confirm button
    document.getElementById('confirm-cleanup').addEventListener('click', async () => {
      const selectedLabels = [];
      overlay.querySelectorAll('.label-checkbox:checked').forEach(cb => {
        selectedLabels.push({ id: cb.dataset.id, name: cb.dataset.name });
      });

      if (selectedLabels.length === 0) {
        alert('No labels selected');
        return;
      }

      if (!confirm(`Delete ${selectedLabels.length} labels and all their emails?`)) {
        return;
      }

      overlay.remove();
      await deleteLabelsWithEmails(selectedLabels);
    });

  } catch (error) {
    console.error('Failed to load labels:', error);
    alert('Failed to load labels: ' + error.message);
  }
}

async function deleteLabelsWithEmails(labels) {
  elements.scanProgress.classList.remove('hidden');
  let totalEmails = 0;
  let deletedLabels = 0;

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    updateProgress(`Processing "${label.name}" (${i + 1}/${labels.length})...`,
      Math.round((i / labels.length) * 100));

    try {
      // Get all messages with this label
      const messages = await gmailApi.getMessagesByLabel(label.id);

      if (messages.length > 0) {
        // Delete all messages
        const messageIds = messages.map(m => m.id);
        await gmailApi.batchModify(messageIds, 'trash');
        totalEmails += messages.length;
      }

      // Delete the label
      await gmailApi.deleteLabel(label.id);
      deletedLabels++;
    } catch (err) {
      console.error(`Failed to delete label ${label.name}:`, err);
    }
  }

  elements.scanProgress.classList.add('hidden');
  alert(`Done!\n\nTrashed ${totalEmails.toLocaleString()} emails\nDeleted ${deletedLabels} labels`);
}

// Initialize
document.addEventListener('DOMContentLoaded', init);
