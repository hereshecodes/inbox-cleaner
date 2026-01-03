import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Simple in-memory store for watch state (in production, use a database)
const watchState = new Map();

// POST - Enable auto-sort (subscribe to Gmail push notifications)
export async function POST(request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // Get user's email address
    const profileRes = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/profile',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!profileRes.ok) {
      throw new Error('Failed to get profile');
    }

    const profile = await profileRes.json();
    const emailAddress = profile.emailAddress;

    // Set up Gmail watch
    // Note: You need to create a Pub/Sub topic first in Google Cloud Console
    // Topic format: projects/YOUR_PROJECT_ID/topics/gmail-notifications
    const topicName = process.env.GOOGLE_PUBSUB_TOPIC;

    if (!topicName) {
      return NextResponse.json(
        { error: 'Pub/Sub topic not configured. Set GOOGLE_PUBSUB_TOPIC env var.' },
        { status: 500 }
      );
    }

    const watchRes = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/watch',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topicName,
          labelIds: ['INBOX'],
          labelFilterBehavior: 'INCLUDE',
        }),
      }
    );

    if (!watchRes.ok) {
      const error = await watchRes.text();
      console.error('Watch API error:', error);
      throw new Error(`Failed to set up watch: ${error}`);
    }

    const watchData = await watchRes.json();
    console.log('Watch set up:', watchData);

    // Store watch state
    watchState.set(emailAddress, {
      historyId: watchData.historyId,
      expiration: watchData.expiration,
      enabled: true,
    });

    // Store the access token for webhook use
    // In production, store refresh token in database
    const { storeUserToken } = await import('../webhook/gmail/route.js');
    const refreshToken = cookieStore.get('refresh_token')?.value;
    storeUserToken(emailAddress, accessToken, refreshToken);

    return NextResponse.json({
      success: true,
      message: 'Auto-sort enabled!',
      expiration: watchData.expiration,
    });
  } catch (error) {
    console.error('Enable auto-sort error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Disable auto-sort (stop watching)
export async function DELETE(request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // Stop the watch
    const stopRes = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/stop',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!stopRes.ok) {
      const error = await stopRes.text();
      console.error('Stop watch error:', error);
    }

    // Get user email and clear state
    const profileRes = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/profile',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (profileRes.ok) {
      const profile = await profileRes.json();
      watchState.delete(profile.emailAddress);
    }

    return NextResponse.json({
      success: true,
      message: 'Auto-sort disabled',
    });
  } catch (error) {
    console.error('Disable auto-sort error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET - Check auto-sort status
export async function GET(request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const profileRes = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/profile',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!profileRes.ok) {
      throw new Error('Failed to get profile');
    }

    const profile = await profileRes.json();
    const state = watchState.get(profile.emailAddress);

    return NextResponse.json({
      enabled: state?.enabled || false,
      expiration: state?.expiration || null,
    });
  } catch (error) {
    console.error('Get auto-sort status error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
