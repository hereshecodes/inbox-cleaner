'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { WebGmailAPI, WebAIClassifier, storage } from '@/lib/client-api';

// Category icons - matches the fixed categories from AI classifier
const CATEGORY_ICONS = {
  People: '👤',
  Newsletters: '📰',
  Shopping: '🛒',
  'Social Media': '👥',
  Finance: '💰',
  Travel: '✈️',
  Food: '🍔',
  Entertainment: '🎬',
  Work: '💼',
  Notifications: '🔔',
  Other: '📁',
  old: '🕐',
  all: '📋',
};

export default function Dashboard() {
  const router = useRouter();
  const gmailApi = useRef(new WebGmailAPI());
  const aiClassifier = useRef(new WebAIClassifier());

  const [userEmail, setUserEmail] = useState('Loading...');
  const [state, setState] = useState({
    senders: [],
    classifications: {},
    categories: [],
    aiClassified: new Set(),
    selectedEmails: new Set(),
    currentTab: 'all',
    isScanning: false,
    cancelScan: false,
  });
  const [progress, setProgress] = useState({ status: '', percent: 0 });
  const [showProgress, setShowProgress] = useState(false);
  const [scanScope, setScanScope] = useState('inbox');
  const [searchFilter, setSearchFilter] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [hasAiKey, setHasAiKey] = useState(false);
  const [lastScan, setLastScan] = useState('Never');
  const [loading, setLoading] = useState(true);

  // Check auth and load data on mount
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/auth/session');
        const session = await res.json();

        if (!session.authenticated) {
          router.push('/');
          return;
        }

        // Load profile
        const profile = await gmailApi.current.getProfile();
        setUserEmail(profile.emailAddress);

        // Check AI key
        const hasKey = await aiClassifier.current.checkApiKey();
        setHasAiKey(hasKey);

        // Load cached data
        const cached = storage.get(['senders', 'classifications', 'categories', 'lastScan']);
        if (cached.senders && cached.senders.length > 0) {
          setState((prev) => ({
            ...prev,
            senders: cached.senders,
            classifications: cached.classifications || {},
            categories: cached.categories || extractCategoriesFromClassifications(cached.classifications || {}),
          }));
          if (cached.lastScan) {
            setLastScan(new Date(cached.lastScan).toLocaleDateString());
          }
        }
      } catch (err) {
        console.error('Init error:', err);
        router.push('/');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  // Extract unique categories from classifications
  function extractCategoriesFromClassifications(classifications) {
    const cats = new Set(Object.values(classifications));
    return Array.from(cats).sort((a, b) => {
      if (a === 'People') return -1;
      if (b === 'People') return 1;
      return a.localeCompare(b);
    });
  }

  // Save data to localStorage
  const saveData = useCallback(() => {
    storage.set({
      senders: state.senders,
      classifications: state.classifications,
      categories: state.categories,
      lastScan: Date.now(),
    });
  }, [state.senders, state.classifications, state.categories]);

  // Get filtered senders based on current tab and search
  const getFilteredSenders = useCallback(() => {
    const now = Date.now();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    const filter = searchFilter.toLowerCase();

    let senders = state.senders;

    // Filter by tab
    if (state.currentTab === 'old') {
      senders = senders.filter((s) => s.lastEmailDate && now - s.lastEmailDate > ninetyDays);
    } else if (state.currentTab !== 'all') {
      senders = senders.filter((s) => state.classifications[s.email] === state.currentTab);
    }

    // Filter by search
    if (filter) {
      senders = senders.filter(
        (s) => s.name.toLowerCase().includes(filter) || s.email.toLowerCase().includes(filter)
      );
    }

    // Sort
    if (state.currentTab === 'old') {
      return senders.sort((a, b) => (a.lastEmailDate || 0) - (b.lastEmailDate || 0));
    }
    return senders.sort((a, b) => b.count - a.count);
  }, [state.senders, state.classifications, state.currentTab, searchFilter]);

  // Calculate tab counts
  const getTabCounts = useCallback(() => {
    const now = Date.now();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    const counts = {};
    let old = 0;
    let all = 0;

    for (const sender of state.senders) {
      const category = state.classifications[sender.email] || 'Other';
      all += sender.count;
      counts[category] = (counts[category] || 0) + sender.count;

      if (sender.lastEmailDate && now - sender.lastEmailDate > ninetyDays) {
        old += sender.count;
      }
    }

    return { ...counts, old, all };
  }, [state.senders, state.classifications]);

  // Pattern-based classification (fallback when no AI)
  function classifyByPatterns(sender) {
    const email = sender.email.toLowerCase();

    if (/@(facebook|linkedin|twitter|instagram|tiktok|pinterest|snapchat|youtube|reddit|x\.com)\./i.test(email)) {
      return 'Social Media';
    }
    if (/@(amazon|ebay|etsy|walmart|target|bestbuy|costco|wayfair|zappos)\./i.test(email) ||
        /orders?@|receipt@|shipping@|confirmation@|store@/i.test(email)) {
      return 'Shopping';
    }
    if (/@(doordash|grubhub|ubereats|postmates|instacart|starbucks|chipotle)\./i.test(email)) {
      return 'Food';
    }
    if (/@(paypal|venmo|cashapp|chase|bankofamerica|wellsfargo|citi|amex)\./i.test(email) ||
        /statement@|alerts?@.*bank|billing@|invoice@/i.test(email)) {
      return 'Finance';
    }
    if (/@(airbnb|booking|expedia|kayak|hotels|tripadvisor|southwest|united|delta)\./i.test(email)) {
      return 'Travel';
    }
    if (/@(spotify|netflix|hulu|disney|hbo|peacock|twitch|steam)\./i.test(email)) {
      return 'Entertainment';
    }
    if (/@(slack|zoom|notion|figma|asana|trello|jira|github|gitlab)\./i.test(email)) {
      return 'Work';
    }
    if (sender.unsubscribe ||
        /newsletter@|digest@|updates?@|weekly@|daily@|news@/i.test(email) ||
        /@(substack|mailchimp|constantcontact|sendgrid)\./i.test(email)) {
      return 'Newsletters';
    }
    if (/noreply@|no-reply@|donotreply@|notifications?@|alerts?@|mailer@/i.test(email)) {
      return 'Notifications';
    }
    return 'People';
  }

  // Handle scan
  async function handleScan() {
    if (state.isScanning) return;

    setState((prev) => ({
      ...prev,
      isScanning: true,
      cancelScan: false,
      senders: [],
      classifications: {},
      selectedEmails: new Set(),
    }));

    setShowProgress(true);
    setProgress({ status: 'Fetching emails...', percent: 0 });

    try {
      const allMessages = [];
      let pageToken = null;
      let page = 0;

      do {
        if (state.cancelScan) break;
        page++;
        setProgress({ status: `Fetching email list (page ${page})...`, percent: 0 });

        const query = scanScope === 'inbox' ? 'in:inbox' : '-in:trash -in:spam';
        const response = await gmailApi.current.listMessages(query, 500, pageToken);
        const messages = response.messages || [];
        allMessages.push(...messages);
        pageToken = response.nextPageToken;
      } while (pageToken && !state.cancelScan);

      if (state.cancelScan) {
        setShowProgress(false);
        setState((prev) => ({ ...prev, isScanning: false }));
        return;
      }

      const total = allMessages.length;
      setProgress({ status: `Found ${total} emails. Analyzing...`, percent: 0 });

      const senderMap = new Map();
      const chunkSize = 50;

      for (let i = 0; i < allMessages.length; i += chunkSize) {
        if (state.cancelScan) break;

        const chunk = allMessages.slice(i, i + chunkSize);
        const percent = Math.round(((i + chunk.length) / total) * 100);
        setProgress({ status: `Analyzing ${i + chunk.length} of ${total}...`, percent });

        // Fetch sequentially with rate limiting to avoid 429 errors
        const details = await gmailApi.current.getMessagesBatch(chunk.map(m => m.id), 'metadata');

        for (const msg of details) {
          if (!msg || !msg.payload) continue;

          const labelIds = msg.labelIds || [];
          if (labelIds.includes('SENT')) continue;

          if (scanScope === 'inbox') {
            const hasUserLabel = labelIds.some((id) => id.startsWith('Label_'));
            if (hasUserLabel) continue;
          }

          const headers = {};
          for (const h of msg.payload.headers || []) {
            headers[h.name.toLowerCase()] = h.value;
          }

          const from = headers.from || '';
          const senderEmail = extractEmail(from);
          const senderName = extractName(from);
          const emailDate = headers.date ? new Date(headers.date).getTime() : 0;
          const listUnsubscribe = headers['list-unsubscribe'] || null;

          if (!senderMap.has(senderEmail)) {
            senderMap.set(senderEmail, {
              email: senderEmail,
              name: senderName,
              count: 0,
              messageIds: [],
              lastEmailDate: 0,
              unsubscribe: listUnsubscribe ? true : null,
            });
          }

          const sender = senderMap.get(senderEmail);
          sender.count++;
          sender.messageIds.push(msg.id);
          if (emailDate > sender.lastEmailDate) {
            sender.lastEmailDate = emailDate;
          }
        }
      }

      if (!state.cancelScan) {
        const senders = Array.from(senderMap.values()).sort((a, b) => b.count - a.count);
        let classifications = {};
        let categories = [];
        let aiClassifiedSet = new Set();

        // Classify with AI if available
        if (hasAiKey) {
          setProgress({ status: `Classifying ${senders.length} senders with AI...`, percent: 10 });

          try {
            const sendersToClassify = senders.map((s) => ({ email: s.email, name: s.name }));
            const aiResults = await aiClassifier.current.classifyAll(sendersToClassify, (p) => {
              const pct = 10 + Math.round((p.processed / p.total) * 85);
              setProgress({ status: `Claude classifying... ${p.processed}/${p.total}`, percent: pct });
            });

            classifications = aiResults;
            aiClassifiedSet = new Set(Object.keys(aiResults));
            categories = extractCategoriesFromClassifications(aiResults);
          } catch (err) {
            console.error('AI classification failed:', err);
            // Fallback to pattern matching
            for (const sender of senders) {
              classifications[sender.email] = classifyByPatterns(sender);
            }
            categories = extractCategoriesFromClassifications(classifications);
          }
        } else {
          // Pattern-based classification
          for (const sender of senders) {
            classifications[sender.email] = classifyByPatterns(sender);
          }
          categories = extractCategoriesFromClassifications(classifications);
        }

        setState((prev) => ({
          ...prev,
          senders,
          classifications,
          categories,
          aiClassified: aiClassifiedSet,
          currentTab: categories[0] || 'all',
        }));

        storage.set({ senders, classifications, categories, lastScan: Date.now() });
        setLastScan(new Date().toLocaleDateString());
        setShowSummary(true);
      }
    } catch (error) {
      console.error('Scan error:', error);
      alert('Scan failed: ' + error.message);
    } finally {
      setShowProgress(false);
      setState((prev) => ({ ...prev, isScanning: false }));
    }
  }

  // Delete emails from selected senders
  async function handleDeleteSelected() {
    const selectedSenders = state.senders.filter((s) => state.selectedEmails.has(s.email));
    const totalEmails = selectedSenders.reduce((sum, s) => sum + s.count, 0);
    const allMessageIds = selectedSenders.flatMap((s) => s.messageIds);

    if (!confirm(`DELETE ${totalEmails} emails from ${selectedSenders.length} senders?\n\nThis will move them to trash.`)) {
      return;
    }

    setShowProgress(true);
    setProgress({ status: 'Deleting emails...', percent: 50 });

    try {
      await gmailApi.current.batchModify(allMessageIds, 'trash');

      setState((prev) => {
        const newSenders = prev.senders.filter((s) => !prev.selectedEmails.has(s.email));
        const newClassifications = { ...prev.classifications };
        const newAiClassified = new Set(prev.aiClassified);

        for (const email of prev.selectedEmails) {
          delete newClassifications[email];
          newAiClassified.delete(email);
        }

        const newCategories = extractCategoriesFromClassifications(newClassifications);

        storage.set({
          senders: newSenders,
          classifications: newClassifications,
          categories: newCategories,
          lastScan: Date.now(),
        });

        return {
          ...prev,
          senders: newSenders,
          classifications: newClassifications,
          categories: newCategories,
          aiClassified: newAiClassified,
          selectedEmails: new Set(),
        };
      });

      alert(`Deleted ${totalEmails} emails from ${selectedSenders.length} senders.`);
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete: ' + error.message);
    } finally {
      setShowProgress(false);
    }
  }

  // Delete all emails in a category
  async function deleteCategory(category) {
    const categorySenders = state.senders.filter((s) => state.classifications[s.email] === category);
    const totalEmails = categorySenders.reduce((sum, s) => sum + s.count, 0);

    if (!confirm(`DELETE ${totalEmails.toLocaleString()} emails from ${categorySenders.length} "${category}" senders?`)) {
      return;
    }

    setShowProgress(true);
    setShowSummary(false);

    let deletedCount = 0;
    for (let i = 0; i < categorySenders.length; i++) {
      const sender = categorySenders[i];
      setProgress({
        status: `Deleting emails from ${sender.name}... (${i + 1}/${categorySenders.length})`,
        percent: Math.round((i / categorySenders.length) * 100),
      });

      try {
        const result = await gmailApi.current.batchModify(sender.messageIds, 'trash');
        deletedCount += result.success;
      } catch (err) {
        console.error(`Failed to delete from ${sender.email}:`, err);
      }
    }

    setState((prev) => {
      const newSenders = prev.senders.filter((s) => prev.classifications[s.email] !== category);
      const newClassifications = { ...prev.classifications };
      const newAiClassified = new Set(prev.aiClassified);

      for (const sender of categorySenders) {
        delete newClassifications[sender.email];
        newAiClassified.delete(sender.email);
      }

      const newCategories = extractCategoriesFromClassifications(newClassifications);

      storage.set({
        senders: newSenders,
        classifications: newClassifications,
        categories: newCategories,
        lastScan: Date.now(),
      });

      return {
        ...prev,
        senders: newSenders,
        classifications: newClassifications,
        categories: newCategories,
        aiClassified: newAiClassified,
      };
    });

    setShowProgress(false);
    alert(`Deleted ${deletedCount.toLocaleString()} emails from "${category}"!`);
  }

  // Toggle sender selection
  function toggleSenderSelection(email) {
    setState((prev) => {
      const newSelected = new Set(prev.selectedEmails);
      if (newSelected.has(email)) {
        newSelected.delete(email);
      } else {
        newSelected.add(email);
      }
      return { ...prev, selectedEmails: newSelected };
    });
  }

  // Select all visible senders
  function handleSelectAll(checked) {
    const filtered = getFilteredSenders();
    setState((prev) => {
      const newSelected = new Set(prev.selectedEmails);
      for (const sender of filtered) {
        if (checked) {
          newSelected.add(sender.email);
        } else {
          newSelected.delete(sender.email);
        }
      }
      return { ...prev, selectedEmails: newSelected };
    });
  }

  // Utility functions
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

  function formatAge(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));

    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }

  if (loading) {
    return (
      <div className="login-container">
        <div className="loading">
          <div className="spinner"></div>
          <div className="loading-text">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  const filteredSenders = getFilteredSenders();
  const tabCounts = getTabCounts();
  const totalEmails = state.senders.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">📧</span>
            <h1>INBOX CLEANER</h1>
          </div>
          <div className="header-actions">
            <select
              className="select-input"
              value={scanScope}
              onChange={(e) => setScanScope(e.target.value)}
            >
              <option value="inbox">Inbox Only</option>
              <option value="all">All Mail</option>
            </select>
            <button className="btn" onClick={handleScan} disabled={state.isScanning}>
              🔄 SCAN
            </button>
            {state.senders.length > 0 && (
              <button className="btn" onClick={() => setShowSummary(true)}>
                📊 SUMMARY
              </button>
            )}
            <div className="status">
              <span className="status-dot"></span>
              <span>{userEmail}</span>
            </div>
            <a href="/api/auth/logout" className="btn btn-sm">
              LOGOUT
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="nav">
            {state.categories.map((category) => (
              <button
                key={category}
                className={`nav-item ${state.currentTab === category ? 'active' : ''}`}
                onClick={() => setState((prev) => ({ ...prev, currentTab: category, selectedEmails: new Set() }))}
              >
                <span>{CATEGORY_ICONS[category] || '📁'}</span> {category}
                <span className="nav-count">{(tabCounts[category] || 0).toLocaleString()}</span>
              </button>
            ))}
            <button
              className={`nav-item ${state.currentTab === 'old' ? 'active' : ''}`}
              onClick={() => setState((prev) => ({ ...prev, currentTab: 'old', selectedEmails: new Set() }))}
            >
              <span>🕐</span> Old / Inactive
              <span className="nav-count">{tabCounts.old.toLocaleString()}</span>
            </button>
            <button
              className={`nav-item ${state.currentTab === 'all' ? 'active' : ''}`}
              onClick={() => setState((prev) => ({ ...prev, currentTab: 'all', selectedEmails: new Set() }))}
            >
              <span>📋</span> All Senders
              <span className="nav-count">{tabCounts.all.toLocaleString()}</span>
            </button>
          </nav>

          <div className="sidebar-stats">
            <div className="stat-row">
              <span>Emails Scanned</span>
              <span>{totalEmails.toLocaleString()}</span>
            </div>
            <div className="stat-row">
              <span>Last Scan</span>
              <span>{lastScan}</span>
            </div>
          </div>

          <div className="sidebar-help">
            <p className="text-dim">Select senders, then delete all their emails at once.</p>
          </div>
        </aside>

        {/* Content Area */}
        <div className="content">
          {/* Progress */}
          {showProgress && (
            <div className="scan-progress">
              <h2>SCANNING...</h2>
              <div className="progress-container">
                <div className="progress-bar-bg">
                  <div className="progress-bar" style={{ width: `${progress.percent}%` }}></div>
                </div>
                <div className="progress-text">
                  <span>{progress.status}</span>
                  <span>{progress.percent}%</span>
                </div>
              </div>
              <button
                className="btn btn-danger"
                onClick={() => setState((prev) => ({ ...prev, cancelScan: true }))}
              >
                CANCEL
              </button>
            </div>
          )}

          {/* Senders View */}
          {!showProgress && (
            <div id="senders-view">
              <div className="view-header">
                <h2>
                  {state.currentTab === 'old'
                    ? 'OLD / INACTIVE'
                    : state.currentTab === 'all'
                    ? 'ALL SENDERS'
                    : state.currentTab.toUpperCase()}
                </h2>
                <p className="text-dim">
                  {state.currentTab === 'old'
                    ? 'Senders with no emails in the last 90 days'
                    : state.currentTab === 'all'
                    ? 'Every sender in your inbox'
                    : `Emails categorized as ${state.currentTab}`}
                </p>
              </div>

              {/* Toolbar */}
              <div className="toolbar">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={
                      filteredSenders.length > 0 &&
                      filteredSenders.every((s) => state.selectedEmails.has(s.email))
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                  <span>Select All</span>
                </label>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search senders..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
                <button
                  className="btn btn-danger"
                  disabled={state.selectedEmails.size === 0}
                  onClick={handleDeleteSelected}
                >
                  🗑️ DELETE SELECTED ({state.selectedEmails.size})
                </button>
              </div>

              {/* Senders List */}
              <div className="list">
                {filteredSenders.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <div className="empty-state-text">
                      {state.senders.length === 0
                        ? 'Click "SCAN" to analyze your emails.'
                        : 'No senders match this filter.'}
                    </div>
                  </div>
                ) : (
                  filteredSenders.map((sender) => (
                    <div
                      key={sender.email}
                      className={`list-item ${state.selectedEmails.has(sender.email) ? 'selected' : ''}`}
                      onClick={() => toggleSenderSelection(sender.email)}
                    >
                      <label className="checkbox list-item-checkbox" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={state.selectedEmails.has(sender.email)}
                          onChange={() => toggleSenderSelection(sender.email)}
                        />
                      </label>
                      <div className="list-item-icon">{getInitial(sender.name)}</div>
                      <div className="list-item-content">
                        <div className="list-item-title">
                          {sender.name}
                          {state.aiClassified.has(sender.email) && (
                            <span className="ai-badge">AI</span>
                          )}
                        </div>
                        <div className="list-item-subtitle">{sender.email}</div>
                      </div>
                      <div className="list-item-meta">
                        {state.currentTab === 'old' && sender.lastEmailDate && (
                          <span className="age-badge">{formatAge(sender.lastEmailDate)}</span>
                        )}
                        <span className="count-badge">{sender.count} emails</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Summary Modal */}
      {showSummary && (
        <div className="modal" onClick={() => setShowSummary(false)}>
          <div className="modal-content modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="classification-summary">
              <h3>SCAN COMPLETE</h3>
              <p className="summary-subtitle">
                {totalEmails.toLocaleString()} emails in {state.categories.length} categories
              </p>

              <div className="category-pills-container">
                <p className="text-dim" style={{ fontSize: '10px', marginBottom: '8px' }}>
                  Click a category to delete all its emails (except People)
                </p>
                <div className="category-pills">
                  {state.categories.map((category) => {
                    const emailCount = state.senders
                      .filter((s) => state.classifications[s.email] === category)
                      .reduce((sum, s) => sum + s.count, 0);
                    const senderCount = state.senders.filter(
                      (s) => state.classifications[s.email] === category
                    ).length;
                    const isPeople = category === 'People';

                    return (
                      <div
                        key={category}
                        className={`category-pill ${isPeople ? 'people-pill' : 'deletable'}`}
                        onClick={() => !isPeople && deleteCategory(category)}
                        title={isPeople ? 'Protected - real people' : 'Click to delete all'}
                      >
                        <span className="category-pill-icon">
                          {CATEGORY_ICONS[category] || '📁'}
                        </span>
                        <span className="category-pill-count">{emailCount.toLocaleString()}</span>
                        <span className="category-pill-name">{category}</span>
                        <span className="category-pill-label">{senderCount} senders</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn" onClick={() => setShowSummary(false)}>
                  REVIEW MANUALLY
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
