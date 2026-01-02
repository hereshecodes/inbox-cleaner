/**
 * Email parser for unsubscribe detection and categorization
 */

class EmailParser {
  /**
   * Parse message headers into a usable object
   */
  parseHeaders(message) {
    const headers = {};
    const headerList = message.payload?.headers || [];

    for (const header of headerList) {
      const name = header.name.toLowerCase();
      headers[name] = header.value;
    }

    return {
      from: headers.from || '',
      subject: headers.subject || '',
      date: headers.date || '',
      listUnsubscribe: headers['list-unsubscribe'] || null,
      listUnsubscribePost: headers['list-unsubscribe-post'] || null
    };
  }

  /**
   * Extract unsubscribe information from headers
   */
  parseUnsubscribeHeader(listUnsubscribe) {
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

    return result;
  }

  /**
   * Check if one-click unsubscribe is supported
   */
  isOneClickSupported(listUnsubscribePost) {
    return listUnsubscribePost &&
           listUnsubscribePost.toLowerCase().includes('list-unsubscribe=one-click');
  }

  /**
   * Extract sender email from From header
   */
  extractSenderEmail(from) {
    const match = from.match(/<([^>]+)>/);
    return match ? match[1].toLowerCase() : from.toLowerCase();
  }

  /**
   * Extract sender name from From header
   */
  extractSenderName(from) {
    const match = from.match(/^([^<]+)/);
    return match ? match[1].trim().replace(/"/g, '') : from;
  }

  /**
   * Extract domain from email address
   */
  extractDomain(email) {
    const emailAddr = this.extractSenderEmail(email);
    return emailAddr.split('@')[1] || '';
  }

  /**
   * Parse full message into structured data
   */
  parseMessage(message) {
    const headers = this.parseHeaders(message);
    const unsubscribeInfo = this.parseUnsubscribeHeader(headers.listUnsubscribe);

    if (unsubscribeInfo && headers.listUnsubscribePost) {
      unsubscribeInfo.oneClick = this.isOneClickSupported(headers.listUnsubscribePost);
    }

    return {
      id: message.id,
      threadId: message.threadId,
      from: headers.from,
      senderEmail: this.extractSenderEmail(headers.from),
      senderName: this.extractSenderName(headers.from),
      senderDomain: this.extractDomain(headers.from),
      subject: headers.subject,
      date: new Date(headers.date),
      snippet: message.snippet || '',
      sizeEstimate: message.sizeEstimate || 0,
      labelIds: message.labelIds || [],
      unsubscribeInfo,
      hasUnsubscribe: !!unsubscribeInfo
    };
  }

  /**
   * Scan email body for unsubscribe links (fallback method)
   */
  findUnsubscribeLinksInBody(htmlBody) {
    if (!htmlBody) return [];

    const patterns = [
      /href=["']([^"']*unsubscribe[^"']*)["']/gi,
      /href=["']([^"']*opt-?out[^"']*)["']/gi,
      /href=["']([^"']*remove[^"']*list[^"']*)["']/gi,
      /href=["']([^"']*manage[^"']*preferences[^"']*)["']/gi,
      /href=["']([^"']*email[^"']*preferences[^"']*)["']/gi
    ];

    const links = [];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(htmlBody)) !== null) {
        // Decode HTML entities
        let url = match[1]
          .replace(/&amp;/g, '&')
          .replace(/&#x3D;/g, '=')
          .replace(/&#61;/g, '=');
        links.push(url);
      }
    }

    return [...new Set(links)]; // Deduplicate
  }

  /**
   * Get message body (decode if needed)
   */
  getMessageBody(message) {
    const payload = message.payload;
    if (!payload) return null;

    // Simple message
    if (payload.body?.data) {
      return this.decodeBase64(payload.body.data);
    }

    // Multipart message - find HTML or text part
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          return this.decodeBase64(part.body.data);
        }
      }
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return this.decodeBase64(part.body.data);
        }
      }
    }

    return null;
  }

  /**
   * Decode base64url encoded content
   */
  decodeBase64(data) {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    try {
      return decodeURIComponent(escape(atob(base64)));
    } catch {
      return atob(base64);
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmailParser;
}
