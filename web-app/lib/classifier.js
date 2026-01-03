/**
 * Email sender classifier
 * Uses pattern matching for fast classification, with optional AI enhancement
 */

// Pattern-based classification (fast, no API calls)
export function classifyByPatterns(email, name = '') {
  const emailLower = email.toLowerCase();
  const nameLower = name.toLowerCase();

  // Social Media
  if (/@(facebook|linkedin|twitter|instagram|tiktok|pinterest|snapchat|youtube|reddit|x\.com|threads)\./i.test(emailLower)) {
    return 'Social Media';
  }

  // Shopping
  if (/@(amazon|ebay|etsy|walmart|target|bestbuy|costco|wayfair|zappos|shein|aliexpress|wish|nordstrom|macys|kohls|gap|oldnavy|hm|zara)\./i.test(emailLower) ||
      /orders?@|receipt@|shipping@|confirmation@|store@|shop@/i.test(emailLower)) {
    return 'Shopping';
  }

  // Food & Delivery
  if (/@(doordash|grubhub|ubereats|postmates|instacart|starbucks|chipotle|dominos|pizzahut|mcdonalds|chilis|panera)\./i.test(emailLower)) {
    return 'Food';
  }

  // Finance
  if (/@(paypal|venmo|cashapp|chase|bankofamerica|wellsfargo|citi|amex|discover|capitalone|usbank|ally|sofi|robinhood|coinbase|fidelity|schwab|vanguard)\./i.test(emailLower) ||
      /statement@|alerts?@.*bank|billing@|invoice@|payment@/i.test(emailLower)) {
    return 'Finance';
  }

  // Travel
  if (/@(airbnb|booking|expedia|kayak|hotels|tripadvisor|southwest|united|delta|american|jetblue|spirit|frontier|hilton|marriott|hyatt|uber|lyft)\./i.test(emailLower)) {
    return 'Travel';
  }

  // Entertainment
  if (/@(spotify|netflix|hulu|disney|hbo|peacock|twitch|steam|xbox|playstation|nintendo|apple|primevideo|paramount|showtime|audible|kindle)\./i.test(emailLower)) {
    return 'Entertainment';
  }

  // Work / Productivity
  if (/@(slack|zoom|notion|figma|asana|trello|jira|github|gitlab|bitbucket|atlassian|salesforce|hubspot|zendesk|intercom|dropbox|box|monday|clickup)\./i.test(emailLower)) {
    return 'Work';
  }

  // Newsletters - check patterns that suggest newsletter/marketing
  if (/newsletter@|digest@|updates?@|weekly@|daily@|news@|blog@|marketing@|promo@|offers?@/i.test(emailLower) ||
      /@(substack|mailchimp|constantcontact|sendgrid|mailgun|sendinblue|convertkit|beehiiv)\./i.test(emailLower)) {
    return 'Newsletters';
  }

  // Notifications - automated/system emails
  if (/noreply@|no-reply@|donotreply@|notifications?@|alerts?@|mailer@|automated@|system@|info@|support@|help@/i.test(emailLower)) {
    return 'Notifications';
  }

  // If it looks like a personal email (simple format, common domains)
  if (/@(gmail|yahoo|hotmail|outlook|icloud|aol|proton|hey)\./i.test(emailLower) &&
      !/noreply|no-reply|newsletter|support|help|info|admin|notifications/i.test(emailLower)) {
    return 'People';
  }

  // Default to Other
  return 'Other';
}

// Main classifier function - uses patterns by default, can enhance with AI
export async function classifySender(email, name = '', useAI = false) {
  // Always start with pattern matching (fast)
  const patternResult = classifyByPatterns(email, name);

  // If AI is enabled and pattern result is uncertain, use AI
  if (useAI && (patternResult === 'Other' || patternResult === 'Notifications')) {
    try {
      const aiResult = await classifyWithAI(email, name);
      if (aiResult) {
        return aiResult;
      }
    } catch (error) {
      console.error('AI classification failed, using pattern result:', error);
    }
  }

  return patternResult;
}

// AI classification using Claude (optional enhancement)
async function classifyWithAI(email, name) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: `Classify this email sender into ONE category. Reply with ONLY the category name.

Categories: People, Newsletters, Shopping, Social Media, Finance, Travel, Food, Entertainment, Work, Notifications, Other

Sender: ${name} <${email}>

Category:`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const category = data.content[0]?.text?.trim();

    // Validate it's a known category
    const validCategories = [
      'People', 'Newsletters', 'Shopping', 'Social Media', 'Finance',
      'Travel', 'Food', 'Entertainment', 'Work', 'Notifications', 'Other'
    ];

    if (validCategories.includes(category)) {
      return category;
    }

    return null;
  } catch (error) {
    console.error('AI classification error:', error);
    return null;
  }
}

export default { classifySender, classifyByPatterns };
