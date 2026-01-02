/**
 * Email categorization rules engine
 */

const CATEGORIES = {
  NEWSLETTERS: {
    name: 'Newsletters',
    icon: 'mail',
    color: '#14f06e',
    rules: [
      { type: 'hasUnsubscribe', value: true },
      { type: 'fromPattern', value: /newsletter@|digest@|updates@|weekly@/i },
      { type: 'subjectPattern', value: /newsletter|weekly|digest|roundup|bulletin/i }
    ]
  },
  MARKETING: {
    name: 'Marketing & Promos',
    icon: 'tag',
    color: '#f0a830',
    rules: [
      { type: 'fromPattern', value: /promo@|marketing@|offers@|deals@|sales@/i },
      { type: 'subjectPattern', value: /% off|sale|discount|limited time|exclusive|deal|save \$/i },
      { type: 'fromPattern', value: /@(mailchimp|sendgrid|constantcontact|klaviyo)\./i }
    ]
  },
  SOCIAL: {
    name: 'Social Media',
    icon: 'users',
    color: '#3b82f6',
    rules: [
      { type: 'domainPattern', value: /(facebook|twitter|x|linkedin|instagram|tiktok|youtube|pinterest|reddit)\.com$/i },
      { type: 'subjectPattern', value: /followed you|liked your|commented on|new connection|friend request|tagged you/i }
    ]
  },
  RECEIPTS: {
    name: 'Receipts & Orders',
    icon: 'receipt',
    color: '#10b981',
    rules: [
      { type: 'subjectPattern', value: /order confirm|receipt|invoice|payment|shipped|delivered|tracking|your order/i },
      { type: 'fromPattern', value: /orders@|receipts@|billing@|payments@|noreply.*order/i }
    ]
  },
  NOTIFICATIONS: {
    name: 'App Notifications',
    icon: 'bell',
    color: '#8b5cf6',
    rules: [
      { type: 'fromPattern', value: /notification@|notify@|alerts@|no-?reply@/i },
      { type: 'subjectPattern', value: /notification|alert|reminder|update from/i }
    ]
  },
  FINANCE: {
    name: 'Finance & Banking',
    icon: 'credit-card',
    color: '#06b6d4',
    rules: [
      { type: 'domainPattern', value: /(chase|bankofamerica|wellsfargo|citi|capitalone|amex|discover|paypal|venmo|cashapp)\.com$/i },
      { type: 'subjectPattern', value: /statement|transaction|balance|credit score|account alert|payment due/i }
    ]
  },
  OLD_EMAILS: {
    name: 'Old Emails (1yr+)',
    icon: 'clock',
    color: '#64748b',
    rules: [
      { type: 'olderThan', value: 365 } // days
    ]
  },
  LARGE_ATTACHMENTS: {
    name: 'Large Emails (5MB+)',
    icon: 'paperclip',
    color: '#ef4444',
    rules: [
      { type: 'sizeGreaterThan', value: 5 * 1024 * 1024 } // 5MB in bytes
    ]
  }
};

class EmailCategorizer {
  constructor() {
    this.categories = CATEGORIES;
  }

  /**
   * Categorize a single email
   */
  categorize(email) {
    const matches = [];

    for (const [key, category] of Object.entries(this.categories)) {
      if (this.matchesCategory(email, category.rules)) {
        matches.push({
          id: key,
          name: category.name,
          icon: category.icon,
          color: category.color
        });
      }
    }

    return matches;
  }

  /**
   * Check if email matches any rule in a category
   */
  matchesCategory(email, rules) {
    return rules.some(rule => this.matchesRule(email, rule));
  }

  /**
   * Check if email matches a specific rule
   */
  matchesRule(email, rule) {
    switch (rule.type) {
      case 'hasUnsubscribe':
        return email.hasUnsubscribe === rule.value;

      case 'fromPattern':
        return rule.value.test(email.from || '');

      case 'domainPattern':
        return rule.value.test(email.senderDomain || '');

      case 'subjectPattern':
        return rule.value.test(email.subject || '');

      case 'olderThan':
        const daysOld = (Date.now() - new Date(email.date).getTime()) / (1000 * 60 * 60 * 24);
        return daysOld > rule.value;

      case 'sizeGreaterThan':
        return (email.sizeEstimate || 0) > rule.value;

      default:
        return false;
    }
  }

  /**
   * Group emails by sender
   */
  groupBySender(emails) {
    const groups = new Map();

    for (const email of emails) {
      const key = email.senderEmail;

      if (!groups.has(key)) {
        groups.set(key, {
          senderEmail: email.senderEmail,
          senderName: email.senderName,
          senderDomain: email.senderDomain,
          emails: [],
          totalSize: 0,
          hasUnsubscribe: false,
          unsubscribeInfo: null,
          categories: new Set()
        });
      }

      const group = groups.get(key);
      group.emails.push(email);
      group.totalSize += email.sizeEstimate || 0;

      if (email.hasUnsubscribe) {
        group.hasUnsubscribe = true;
        group.unsubscribeInfo = email.unsubscribeInfo;
      }

      email.categories?.forEach(cat => group.categories.add(cat.id));
    }

    // Convert to array and sort by email count
    return Array.from(groups.values())
      .map(g => ({
        ...g,
        categories: Array.from(g.categories),
        emailCount: g.emails.length
      }))
      .sort((a, b) => b.emailCount - a.emailCount);
  }

  /**
   * Group emails by category
   */
  groupByCategory(emails) {
    const groups = {};

    for (const [key, category] of Object.entries(this.categories)) {
      groups[key] = {
        id: key,
        ...category,
        emails: [],
        totalSize: 0
      };
    }

    groups.UNCATEGORIZED = {
      id: 'UNCATEGORIZED',
      name: 'Other',
      icon: 'inbox',
      color: '#9ca3af',
      emails: [],
      totalSize: 0
    };

    for (const email of emails) {
      const categories = this.categorize(email);

      if (categories.length === 0) {
        groups.UNCATEGORIZED.emails.push(email);
        groups.UNCATEGORIZED.totalSize += email.sizeEstimate || 0;
      } else {
        // Add to first matching category (primary)
        const primaryCat = categories[0].id;
        groups[primaryCat].emails.push(email);
        groups[primaryCat].totalSize += email.sizeEstimate || 0;
      }
    }

    // Filter out empty categories and convert to array
    return Object.values(groups)
      .filter(g => g.emails.length > 0)
      .sort((a, b) => b.emails.length - a.emails.length);
  }

  /**
   * Get subscriptions (emails with unsubscribe)
   */
  getSubscriptions(emails) {
    const withUnsubscribe = emails.filter(e => e.hasUnsubscribe);
    return this.groupBySender(withUnsubscribe);
  }

  /**
   * Get summary stats
   */
  getStats(emails) {
    const subscriptions = emails.filter(e => e.hasUnsubscribe);
    const senderGroups = this.groupBySender(subscriptions);
    const totalSize = emails.reduce((sum, e) => sum + (e.sizeEstimate || 0), 0);

    return {
      totalEmails: emails.length,
      totalSubscriptions: senderGroups.length,
      totalSizeMB: Math.round(totalSize / (1024 * 1024) * 10) / 10,
      oldEmails: emails.filter(e => {
        const daysOld = (Date.now() - new Date(e.date).getTime()) / (1000 * 60 * 60 * 24);
        return daysOld > 365;
      }).length,
      largeEmails: emails.filter(e => (e.sizeEstimate || 0) > 5 * 1024 * 1024).length
    };
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EmailCategorizer, CATEGORIES };
}
