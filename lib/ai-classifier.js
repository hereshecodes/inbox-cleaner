/**
 * AI-powered sender classification using Claude API
 * Uses service worker to bypass CORS restrictions
 */

class AIClassifier {
  constructor() {
    this.apiKey = null;
  }

  async loadApiKey() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['claudeApiKey'], (data) => {
        this.apiKey = data.claudeApiKey || null;
        resolve(this.apiKey);
      });
    });
  }

  async saveApiKey(key) {
    this.apiKey = key;
    return new Promise((resolve) => {
      chrome.storage.local.set({ claudeApiKey: key }, resolve);
    });
  }

  hasApiKey() {
    return !!this.apiKey;
  }

  /**
   * Classify a batch of senders into dynamic categories
   * @param {Array} senders - Array of { name, email }
   * @returns {Object} - Map of email -> category name
   */
  async classifySenders(senders) {
    if (!this.apiKey) {
      throw new Error('No API key configured');
    }

    // Build the prompt
    const senderList = senders.map((s, i) =>
      `${i + 1}. "${s.name}" <${s.email}>`
    ).join('\n');

    const prompt = `Classify email senders into EXACTLY these categories. Use ONLY these exact names:

ALLOWED CATEGORIES (use exactly as written):
- "People" - Real individual humans only (friends, family, coworkers with personal names)
- "Newsletters" - Newsletters, digests, subscriptions, mailing lists
- "Shopping" - Stores, e-commerce, order confirmations, shipping
- "Social Media" - Facebook, Twitter, LinkedIn, Instagram, TikTok, etc.
- "Finance" - Banks, payments, investments, billing
- "Travel" - Airlines, hotels, booking sites
- "Food" - Restaurants, delivery apps, food services
- "Entertainment" - Streaming, gaming, music, media
- "Work" - Professional tools, SaaS, productivity apps
- "Notifications" - Automated alerts, system emails, no-reply addresses
- "Other" - Anything that doesn't fit above

RULES:
1. Use EXACT category names from the list - no variations
2. "People" = individual humans with real names (John Smith, Sarah Jones)
3. Companies/brands are NEVER "People" even if friendly-sounding
4. When unsure, use "Notifications" for automated or "Other" for unclear

Senders:
${senderList}

Return ONLY valid JSON: {"1": "Category", "2": "Category", ...}`;

    try {
      // Send to service worker to bypass CORS
      const response = await chrome.runtime.sendMessage({
        action: 'classifyWithAI',
        apiKey: this.apiKey,
        prompt: prompt
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const text = response.data.content[0].text;

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not parse classification response');
      }

      const classifications = JSON.parse(jsonMatch[0]);

      // Convert numbered results back to email keys
      const result = {};
      senders.forEach((sender, i) => {
        const key = String(i + 1);
        result[sender.email] = classifications[key] || 'Other';
      });

      return result;

    } catch (error) {
      console.error('AI classification error:', error);
      throw error;
    }
  }

  /**
   * Classify senders in batches (to handle large lists)
   * @param {Array} senders - All senders to classify
   * @param {Function} progressCallback - Progress updates
   * @returns {Object} - Map of email -> classification
   */
  async classifyAll(senders, progressCallback = null) {
    const batchSize = 50; // Claude can handle ~50 senders per request efficiently
    const results = {};

    for (let i = 0; i < senders.length; i += batchSize) {
      const batch = senders.slice(i, i + batchSize);

      if (progressCallback) {
        progressCallback({
          processed: i,
          total: senders.length,
          percentage: Math.round((i / senders.length) * 100)
        });
      }

      const batchResults = await this.classifySenders(batch);
      Object.assign(results, batchResults);

      // Small delay between batches to avoid rate limits
      if (i + batchSize < senders.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (progressCallback) {
      progressCallback({
        processed: senders.length,
        total: senders.length,
        percentage: 100
      });
    }

    return results;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIClassifier;
}
