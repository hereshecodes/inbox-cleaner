/**
 * Client-side API wrapper for web app
 * Replaces Chrome extension APIs with fetch calls to our Next.js API routes
 */

class WebGmailAPI {
  constructor() {
    this.baseUrl = '/api/gmail';
    this.lastRequestTime = 0;
    this.minInterval = 100; // 100ms between requests (10 req/sec)
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async rateLimitedFetch(url, options = {}) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minInterval) {
      await this.sleep(this.minInterval - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
    return this.fetchWithRetry(url, options);
  }

  async fetchWithRetry(url, options = {}, retries = 1) {
    const response = await fetch(url, options);

    if (response.status === 401 && retries > 0) {
      // Token might be expired, try refreshing
      const sessionRes = await fetch('/api/auth/session');
      const session = await sessionRes.json();

      if (session.authenticated) {
        // Token was refreshed, retry the request
        return this.fetchWithRetry(url, options, retries - 1);
      } else {
        // Need to re-login
        window.location.href = '/';
        throw new Error('Session expired');
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  async getProfile() {
    return this.fetchWithRetry(`${this.baseUrl}/profile`);
  }

  async listMessages(query = '', maxResults = 100, pageToken = null) {
    let url = `${this.baseUrl}/messages?maxResults=${maxResults}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    return this.fetchWithRetry(url);
  }

  async getMessage(messageId, format = 'metadata') {
    return this.rateLimitedFetch(
      `${this.baseUrl}/messages?id=${messageId}&format=${format}`
    );
  }

  async getMessagesBatch(messageIds, format = 'metadata') {
    // Process sequentially with rate limiting instead of parallel
    const messages = [];
    for (const id of messageIds) {
      const msg = await this.getMessage(id, format);
      messages.push(msg);
    }
    return messages;
  }

  async batchModify(messageIds, action) {
    // Process in chunks for large batches
    const chunkSize = 100;
    const results = { success: 0, failed: 0 };

    for (let i = 0; i < messageIds.length; i += chunkSize) {
      const chunk = messageIds.slice(i, i + chunkSize);
      try {
        await this.fetchWithRetry(`${this.baseUrl}/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, messageIds: chunk }),
        });
        results.success += chunk.length;
      } catch (err) {
        results.failed += chunk.length;
      }
    }

    return results;
  }

  async listLabels() {
    return this.fetchWithRetry(`${this.baseUrl}/labels`);
  }

  async createLabel(name) {
    return this.fetchWithRetry(`${this.baseUrl}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  async deleteLabel(labelId) {
    return this.fetchWithRetry(`${this.baseUrl}/labels?id=${labelId}`, {
      method: 'DELETE',
    });
  }

  async getMessagesByLabel(labelId, maxResults = 500) {
    return this.listMessages(`label:${labelId}`, maxResults);
  }
}

class WebAIClassifier {
  constructor() {
    this.hasKey = false;
  }

  async checkApiKey() {
    // The API key is stored server-side, so we just check if classification works
    try {
      // Test with a dummy request - server will check if key exists
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senders: [{ email: 'test@test.com', name: 'Test' }] }),
      });
      this.hasKey = res.ok;
      return this.hasKey;
    } catch {
      this.hasKey = false;
      return false;
    }
  }

  hasApiKey() {
    return this.hasKey;
  }

  async classifyAll(senders, progressCallback = null) {
    const batchSize = 50;
    const results = {};

    for (let i = 0; i < senders.length; i += batchSize) {
      const batch = senders.slice(i, i + batchSize);

      if (progressCallback) {
        progressCallback({
          processed: i,
          total: senders.length,
          percentage: Math.round((i / senders.length) * 100),
        });
      }

      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senders: batch }),
      });

      if (!res.ok) {
        throw new Error('Classification failed');
      }

      const data = await res.json();
      Object.assign(results, data.classifications);

      // Small delay between batches
      if (i + batchSize < senders.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (progressCallback) {
      progressCallback({
        processed: senders.length,
        total: senders.length,
        percentage: 100,
      });
    }

    return results;
  }
}

// Browser storage wrapper (uses localStorage instead of chrome.storage)
const storage = {
  get(keys) {
    const result = {};
    for (const key of keys) {
      const value = localStorage.getItem(`inbox-cleaner-${key}`);
      if (value) {
        try {
          result[key] = JSON.parse(value);
        } catch {
          result[key] = value;
        }
      }
    }
    return result;
  },

  set(data) {
    for (const [key, value] of Object.entries(data)) {
      localStorage.setItem(`inbox-cleaner-${key}`, JSON.stringify(value));
    }
  },

  remove(keys) {
    for (const key of keys) {
      localStorage.removeItem(`inbox-cleaner-${key}`);
    }
  },
};

export { WebGmailAPI, WebAIClassifier, storage };
