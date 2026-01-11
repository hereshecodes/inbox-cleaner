import { NextResponse } from 'next/server';
import { getUserToken } from '../../webhook/gmail/route.js';
import { classifySender } from '@/lib/classifier';

// Category label mapping with emojis
const CATEGORY_LABELS = {
  People: '👤 People',
  Newsletters: '📰 Newsletters',
  Shopping: '🛒 Shopping',
  'Social Media': '👥 Social Media',
  Finance: '💰 Finance',
  Travel: '✈️ Travel',
  Food: '🍔 Food',
  Entertainment: '🎬 Entertainment',
  Work: '💼 Work',
  Notifications: '🔔 Notifications',
  Other: '📁 Other',
};

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // If no CRON_SECRET is set, allow the request (for development)
  if (!cronSecret) {
    return true;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

// GET - Called by Vercel Cron every hour
export async function GET(request) {
  // Verify this is a legitimate cron request
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('Hourly auto-sort cron job started');

  try {
    // Import the userTokens map from the webhook route
    const { getAllUserTokens } = await import('../../webhook/gmail/route.js');
    const userTokens = getAllUserTokens();

    if (!userTokens || userTokens.size === 0) {
      console.log('No users enrolled in auto-sort');
      return NextResponse.json({
        status: 'ok',
        message: 'No users enrolled in auto-sort',
        processedUsers: 0
      });
    }

    let processedUsers = 0;
    let totalEmails = 0;

    // Process each enrolled user
    for (const [emailAddress, tokenData] of userTokens.entries()) {
      try {
        const result = await processUserEmails(emailAddress, tokenData.accessToken);
        processedUsers++;
        totalEmails += result.processed;
        console.log(`Processed ${result.processed} emails for ${emailAddress}`);
      } catch (err) {
        console.error(`Failed to process emails for ${emailAddress}:`, err.message);
      }
    }

    console.log(`Hourly auto-sort completed. Users: ${processedUsers}, Emails: ${totalEmails}`);

    return NextResponse.json({
      status: 'ok',
      processedUsers,
      totalEmails,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Hourly auto-sort cron error:', error);
    return NextResponse.json({
      status: 'error',
      message: error.message
    }, { status: 500 });
  }
}

// Process emails for a single user
async function processUserEmails(emailAddress, accessToken) {
  // Get emails from the last hour that are in inbox
  const oneHourAgo = Math.floor((Date.now() - 60 * 60 * 1000) / 1000);
  const query = `in:inbox after:${oneHourAgo}`;

  // List recent inbox messages
  const listUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100`;

  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listResponse.ok) {
    const error = await listResponse.text();
    throw new Error(`Failed to list messages: ${error}`);
  }

  const listData = await listResponse.json();
  const messages = listData.messages || [];

  if (messages.length === 0) {
    return { processed: 0 };
  }

  // Get or create category labels
  const labelMap = await getOrCreateLabels(accessToken);
  const categoryLabelIds = new Set(labelMap.values());

  let processed = 0;

  // Process each message
  for (const msg of messages) {
    try {
      // Get message metadata to check existing labels
      const msgResponse = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!msgResponse.ok) continue;

      const message = await msgResponse.json();

      // Skip if already has a category label
      const hasCategory = message.labelIds?.some(id => categoryLabelIds.has(id));
      if (hasCategory) continue;

      // Skip sent messages
      if (message.labelIds?.includes('SENT')) continue;

      // Extract sender info
      const headers = {};
      for (const h of message.payload?.headers || []) {
        headers[h.name.toLowerCase()] = h.value;
      }

      const from = headers.from || '';
      const senderEmail = extractEmail(from);
      const senderName = extractName(from);

      // Classify the sender
      const category = await classifySender(senderEmail, senderName);

      // Get the label ID for this category
      const labelId = labelMap.get(category);
      if (!labelId) continue;

      // Apply the label
      const modifyResponse = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            addLabelIds: [labelId],
          }),
        }
      );

      if (modifyResponse.ok) {
        processed++;
      }
    } catch (err) {
      console.error(`Failed to process message ${msg.id}:`, err.message);
    }
  }

  return { processed };
}

// Get existing labels or create new ones
async function getOrCreateLabels(accessToken) {
  const labelMap = new Map();

  // Get existing labels
  const labelsResponse = await fetch(
    'https://www.googleapis.com/gmail/v1/users/me/labels',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!labelsResponse.ok) {
    throw new Error('Failed to fetch labels');
  }

  const labelsData = await labelsResponse.json();
  const existingLabels = labelsData.labels || [];

  // Map existing labels
  for (const label of existingLabels) {
    for (const [category, labelName] of Object.entries(CATEGORY_LABELS)) {
      if (label.name === labelName) {
        labelMap.set(category, label.id);
      }
    }
  }

  // Create missing labels
  for (const [category, labelName] of Object.entries(CATEGORY_LABELS)) {
    if (!labelMap.has(category)) {
      try {
        const createResponse = await fetch(
          'https://www.googleapis.com/gmail/v1/users/me/labels',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: labelName,
              labelListVisibility: 'labelShow',
              messageListVisibility: 'show',
            }),
          }
        );

        if (createResponse.ok) {
          const newLabel = await createResponse.json();
          labelMap.set(category, newLabel.id);
          console.log(`Created label: ${labelName}`);
        }
      } catch (err) {
        console.error(`Failed to create label ${labelName}:`, err);
      }
    }
  }

  return labelMap;
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
