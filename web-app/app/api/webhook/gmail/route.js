import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getMessage, listLabels, createLabel, batchModify } from '@/lib/gmail';
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

// In-memory store for user tokens (in production, use a database)
// For now, we'll use a simple approach with stored refresh tokens
const userTokens = new Map();

// Store user token for auto-sort (called when user enables auto-sort)
export function storeUserToken(userId, accessToken, refreshToken) {
  userTokens.set(userId, { accessToken, refreshToken, updatedAt: Date.now() });
}

export function getUserToken(userId) {
  return userTokens.get(userId);
}

// Get all enrolled users for hourly cron job
export function getAllUserTokens() {
  return userTokens;
}

// Remove user from auto-sort
export function removeUserToken(userId) {
  userTokens.delete(userId);
}

// POST - Receive push notifications from Google Pub/Sub
export async function POST(request) {
  try {
    const body = await request.json();

    // Pub/Sub sends data in a specific format
    const message = body.message;
    if (!message || !message.data) {
      console.log('Invalid Pub/Sub message format');
      return NextResponse.json({ status: 'ignored' });
    }

    // Decode the base64 data
    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    console.log('Gmail notification received:', data);

    const { emailAddress, historyId } = data;
    if (!emailAddress || !historyId) {
      console.log('Missing emailAddress or historyId');
      return NextResponse.json({ status: 'ignored' });
    }

    // Get stored token for this user
    const userToken = getUserToken(emailAddress);
    if (!userToken) {
      console.log(`No stored token for ${emailAddress}`);
      return NextResponse.json({ status: 'no_token' });
    }

    // Process the new emails
    await processNewEmails(emailAddress, userToken.accessToken, historyId);

    return NextResponse.json({ status: 'processed' });
  } catch (error) {
    console.error('Webhook error:', error);
    // Always return 200 to acknowledge receipt (prevents retries)
    return NextResponse.json({ status: 'error', message: error.message });
  }
}

// Process new emails and apply labels
async function processNewEmails(emailAddress, accessToken, historyId) {
  try {
    // Get history of changes since last historyId
    const historyUrl = `https://www.googleapis.com/gmail/v1/users/me/history?startHistoryId=${historyId}&historyTypes=messageAdded`;

    const historyResponse = await fetch(historyUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!historyResponse.ok) {
      const error = await historyResponse.text();
      console.error('History API error:', error);
      return;
    }

    const historyData = await historyResponse.json();
    const history = historyData.history || [];

    // Collect all new message IDs
    const newMessageIds = new Set();
    for (const record of history) {
      if (record.messagesAdded) {
        for (const msg of record.messagesAdded) {
          // Only process inbox messages
          if (msg.message.labelIds?.includes('INBOX')) {
            newMessageIds.add(msg.message.id);
          }
        }
      }
    }

    if (newMessageIds.size === 0) {
      console.log('No new inbox messages to process');
      return;
    }

    console.log(`Processing ${newMessageIds.size} new messages`);

    // Get or create category labels
    const labelMap = await getOrCreateLabels(accessToken);

    // Process each new message
    for (const messageId of newMessageIds) {
      try {
        await classifyAndLabelMessage(accessToken, messageId, labelMap);
      } catch (err) {
        console.error(`Failed to process message ${messageId}:`, err);
      }
    }
  } catch (error) {
    console.error('processNewEmails error:', error);
  }
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

// Classify a message and apply the appropriate label
async function classifyAndLabelMessage(accessToken, messageId, labelMap) {
  // Get message metadata
  const msgResponse = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!msgResponse.ok) {
    throw new Error('Failed to fetch message');
  }

  const message = await msgResponse.json();

  // Skip sent messages
  if (message.labelIds?.includes('SENT')) {
    return;
  }

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
  if (!labelId) {
    console.log(`No label found for category: ${category}`);
    return;
  }

  // Apply the label
  const modifyResponse = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
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
    console.log(`Labeled message from ${senderEmail} as ${category}`);
  } else {
    const error = await modifyResponse.text();
    console.error(`Failed to label message: ${error}`);
  }
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
