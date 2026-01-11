import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Simple in-memory store for auto-sort state (in production, use a database)
const autoSortState = new Map();

// POST - Enable hourly auto-sort
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

    // Store auto-sort state
    autoSortState.set(emailAddress, {
      enabled: true,
      enabledAt: Date.now(),
    });

    // Store the access token for hourly cron job
    // In production, store refresh token in database
    const { storeUserToken } = await import('../webhook/gmail/route.js');
    const refreshToken = cookieStore.get('refresh_token')?.value;
    storeUserToken(emailAddress, accessToken, refreshToken);

    console.log(`Hourly auto-sort enabled for ${emailAddress}`);

    return NextResponse.json({
      success: true,
      message: 'Hourly auto-sort enabled! New emails will be sorted every hour.',
    });
  } catch (error) {
    console.error('Enable auto-sort error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Disable hourly auto-sort
export async function DELETE(request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // Get user email and clear state
    const profileRes = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/profile',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (profileRes.ok) {
      const profile = await profileRes.json();
      autoSortState.delete(profile.emailAddress);

      // Remove user token from cron job list
      const { removeUserToken } = await import('../webhook/gmail/route.js');
      removeUserToken(profile.emailAddress);

      console.log(`Hourly auto-sort disabled for ${profile.emailAddress}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Hourly auto-sort disabled',
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
    const state = autoSortState.get(profile.emailAddress);

    return NextResponse.json({
      enabled: state?.enabled || false,
      schedule: 'hourly',
    });
  } catch (error) {
    console.error('Get auto-sort status error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
