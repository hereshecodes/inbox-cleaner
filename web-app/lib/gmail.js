/**
 * Server-side Gmail API utilities
 */

const GMAIL_BASE_URL = 'https://www.googleapis.com/gmail/v1/users/me';

export async function gmailFetch(endpoint, accessToken, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${GMAIL_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gmail API error: ${response.status} - ${error}`);
  }

  // Handle empty responses (like DELETE)
  const text = await response.text();
  return text ? JSON.parse(text) : { success: true };
}

export async function getProfile(accessToken) {
  return gmailFetch('/profile', accessToken);
}

export async function listMessages(accessToken, query = '', maxResults = 100, pageToken = null) {
  let url = `/messages?maxResults=${maxResults}`;
  if (query) url += `&q=${encodeURIComponent(query)}`;
  if (pageToken) url += `&pageToken=${pageToken}`;
  return gmailFetch(url, accessToken);
}

export async function getMessage(accessToken, messageId, format = 'metadata') {
  const url = `/messages/${messageId}?format=${format}&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Unsubscribe-Post`;
  return gmailFetch(url, accessToken);
}

export async function trashMessage(accessToken, messageId) {
  return gmailFetch(`/messages/${messageId}/trash`, accessToken, {
    method: 'POST',
  });
}

export async function batchModify(accessToken, messageIds, addLabelIds = [], removeLabelIds = []) {
  return gmailFetch('/messages/batchModify', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      ids: messageIds,
      addLabelIds,
      removeLabelIds,
    }),
  });
}

export async function batchDelete(accessToken, messageIds) {
  return gmailFetch('/messages/batchDelete', accessToken, {
    method: 'POST',
    body: JSON.stringify({ ids: messageIds }),
  });
}

export async function batchTrash(accessToken, messageIds) {
  return batchModify(accessToken, messageIds, ['TRASH'], ['INBOX']);
}

export async function listLabels(accessToken) {
  return gmailFetch('/labels', accessToken);
}

export async function createLabel(accessToken, name) {
  return gmailFetch('/labels', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    }),
  });
}

export async function deleteLabel(accessToken, labelId) {
  return gmailFetch(`/labels/${labelId}`, accessToken, {
    method: 'DELETE',
  });
}
