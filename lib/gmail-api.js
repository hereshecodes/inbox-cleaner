/**
 * Gmail API wrapper with OAuth and rate limiting
 */

class GmailAPI {
  constructor() {
    this.token = null;
    this.baseUrl = 'https://www.googleapis.com/gmail/v1/users/me';
    this.requestQueue = [];
    this.processing = false;
    this.requestsPerSecond = 25;
    this.lastRequestTime = 0;
  }

  /**
   * Get OAuth token, prompting user if needed
   */
  async getToken(interactive = false) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        this.token = token;
        resolve(token);
      });
    });
  }

  /**
   * Revoke current token
   */
  async revokeToken() {
    if (!this.token) return;

    return new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token: this.token }, () => {
        this.token = null;
        resolve();
      });
    });
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated() {
    try {
      await this.getToken(false);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Make authenticated API request with retry on 401
   */
  async fetchWithAuth(endpoint, options = {}) {
    const token = await this.getToken();
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Handle token expiration
    if (response.status === 401) {
      await this.revokeToken();
      const newToken = await this.getToken(true);
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${newToken}`,
          'Content-Type': 'application/json'
        }
      });
    }

    return response;
  }

  /**
   * Rate-limited API call
   */
  async rateLimitedFetch(endpoint, options = {}) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / this.requestsPerSecond;

    if (timeSinceLastRequest < minInterval) {
      await this.sleep(minInterval - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
    return this.fetchWithAuth(endpoint, options);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get user profile info
   */
  async getProfile() {
    const response = await this.fetchWithAuth('/profile');
    return response.json();
  }

  /**
   * List messages with query
   */
  async listMessages(query = '', maxResults = 100, pageToken = null) {
    let url = `/messages?maxResults=${maxResults}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const response = await this.rateLimitedFetch(url);
    return response.json();
  }

  /**
   * Get full message details including headers
   */
  async getMessage(messageId, format = 'metadata') {
    const response = await this.rateLimitedFetch(
      `/messages/${messageId}?format=${format}&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Unsubscribe-Post`
    );
    return response.json();
  }

  /**
   * Get multiple messages in batch
   */
  async getMessagesBatch(messageIds, format = 'metadata') {
    const messages = [];

    // Process in chunks of 100 (Gmail batch limit)
    const chunks = this.chunkArray(messageIds, 100);

    for (const chunk of chunks) {
      const promises = chunk.map(id => this.getMessage(id, format));
      const results = await Promise.all(promises);
      messages.push(...results);
    }

    return messages;
  }

  /**
   * Trash a message
   */
  async trashMessage(messageId) {
    const response = await this.rateLimitedFetch(`/messages/${messageId}/trash`, {
      method: 'POST'
    });
    return response.json();
  }

  /**
   * Permanently delete a message
   */
  async deleteMessage(messageId) {
    const response = await this.rateLimitedFetch(`/messages/${messageId}`, {
      method: 'DELETE'
    });
    return response.ok;
  }

  /**
   * Modify message labels
   */
  async modifyMessage(messageId, addLabelIds = [], removeLabelIds = []) {
    const response = await this.rateLimitedFetch(`/messages/${messageId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ addLabelIds, removeLabelIds })
    });
    return response.json();
  }

  /**
   * Archive message (remove from inbox)
   */
  async archiveMessage(messageId) {
    return this.modifyMessage(messageId, [], ['INBOX']);
  }

  /**
   * List all labels
   */
  async listLabels() {
    const response = await this.fetchWithAuth('/labels');
    return response.json();
  }

  /**
   * Create a new label
   */
  async createLabel(name, options = {}) {
    const response = await this.fetchWithAuth('/labels', {
      method: 'POST',
      body: JSON.stringify({
        name,
        labelListVisibility: options.visibility || 'labelShow',
        messageListVisibility: options.messageVisibility || 'show'
      })
    });
    return response.json();
  }

  /**
   * Get or create a label by name
   */
  async getOrCreateLabel(name) {
    const labelsResponse = await this.listLabels();
    const labels = labelsResponse.labels || [];

    const existing = labels.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      return existing;
    }

    return this.createLabel(name);
  }

  /**
   * Delete a label by ID
   */
  async deleteLabel(labelId) {
    const response = await this.fetchWithAuth(`/labels/${labelId}`, {
      method: 'DELETE'
    });
    return response.ok;
  }

  /**
   * Get all messages with a specific label
   */
  async getMessagesByLabel(labelId, maxResults = 500) {
    const allMessages = [];
    let pageToken = null;

    do {
      let url = `/messages?labelIds=${labelId}&maxResults=${maxResults}`;
      if (pageToken) url += `&pageToken=${pageToken}`;

      const response = await this.rateLimitedFetch(url);
      const data = await response.json();
      const messages = data.messages || [];
      allMessages.push(...messages);
      pageToken = data.nextPageToken;
    } while (pageToken);

    return allMessages;
  }

  /**
   * Apply label to multiple messages
   */
  async batchApplyLabel(messageIds, labelId, progressCallback = null) {
    const total = messageIds.length;
    let processed = 0;
    const results = { success: 0, failed: 0 };

    const chunks = this.chunkArray(messageIds, 100);

    for (const chunk of chunks) {
      try {
        const response = await this.rateLimitedFetch('/messages/batchModify', {
          method: 'POST',
          body: JSON.stringify({
            ids: chunk,
            addLabelIds: [labelId]
          })
        });

        if (response.ok) {
          processed += chunk.length;
          results.success += chunk.length;
        } else {
          results.failed += chunk.length;
        }

        if (progressCallback) {
          progressCallback({
            processed,
            total,
            percentage: Math.round((processed / total) * 100)
          });
        }
      } catch (error) {
        results.failed += chunk.length;
      }
    }

    return results;
  }

  /**
   * Send an email (for mailto: unsubscribe)
   */
  async sendEmail(to, subject, body) {
    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\r\n');

    const encodedEmail = btoa(unescape(encodeURIComponent(email)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await this.rateLimitedFetch('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ raw: encodedEmail })
    });
    return response.json();
  }

  /**
   * Batch delete/trash messages
   */
  async batchModify(messageIds, action, progressCallback = null) {
    const total = messageIds.length;
    let processed = 0;
    const results = { success: 0, failed: 0, errors: [] };

    const chunks = this.chunkArray(messageIds, 100);

    for (const chunk of chunks) {
      try {
        if (action === 'trash') {
          await this.batchTrash(chunk);
        } else if (action === 'delete') {
          await this.batchDelete(chunk);
        } else if (action === 'archive') {
          await this.batchArchive(chunk);
        }

        processed += chunk.length;
        results.success += chunk.length;

        if (progressCallback) {
          progressCallback({
            processed,
            total,
            percentage: Math.round((processed / total) * 100)
          });
        }
      } catch (error) {
        results.failed += chunk.length;
        results.errors.push({ chunk, error: error.message });
      }
    }

    return results;
  }

  async batchTrash(messageIds) {
    const response = await this.rateLimitedFetch('/messages/batchModify', {
      method: 'POST',
      body: JSON.stringify({
        ids: messageIds,
        addLabelIds: ['TRASH'],
        removeLabelIds: ['INBOX']
      })
    });
    return response.ok;
  }

  async batchDelete(messageIds) {
    const response = await this.rateLimitedFetch('/messages/batchDelete', {
      method: 'POST',
      body: JSON.stringify({ ids: messageIds })
    });
    return response.ok;
  }

  async batchArchive(messageIds) {
    const response = await this.rateLimitedFetch('/messages/batchModify', {
      method: 'POST',
      body: JSON.stringify({
        ids: messageIds,
        removeLabelIds: ['INBOX']
      })
    });
    return response.ok;
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GmailAPI;
}
