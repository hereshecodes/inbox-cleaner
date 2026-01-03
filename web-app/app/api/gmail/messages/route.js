import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { listMessages, getMessage } from '@/lib/gmail';

export async function GET(request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';
  const maxResults = parseInt(url.searchParams.get('maxResults') || '100');
  const pageToken = url.searchParams.get('pageToken');
  const messageId = url.searchParams.get('id');

  try {
    if (messageId) {
      // Get single message
      const format = url.searchParams.get('format') || 'metadata';
      const message = await getMessage(accessToken, messageId, format);
      return NextResponse.json(message);
    }

    // List messages
    const result = await listMessages(accessToken, query, maxResults, pageToken);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Gmail API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
