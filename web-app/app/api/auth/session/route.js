import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshAccessToken, getUserInfo } from '@/lib/auth';

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;
  const refreshToken = cookieStore.get('refresh_token')?.value;
  const userEmail = cookieStore.get('user_email')?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ authenticated: false });
  }

  // If we have an access token, validate it
  if (accessToken) {
    try {
      const userInfo = await getUserInfo(accessToken);
      return NextResponse.json({
        authenticated: true,
        email: userInfo.email,
      });
    } catch (err) {
      // Token might be expired, try refresh
    }
  }

  // Try to refresh if we have a refresh token
  if (refreshToken) {
    try {
      const tokens = await refreshAccessToken(refreshToken);

      // Update the access token cookie
      const response = NextResponse.json({
        authenticated: true,
        email: userEmail,
      });

      response.cookies.set('access_token', tokens.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: tokens.expires_in,
        path: '/',
      });

      return response;
    } catch (err) {
      // Refresh failed, user needs to log in again
      const response = NextResponse.json({ authenticated: false });
      response.cookies.delete('access_token');
      response.cookies.delete('refresh_token');
      response.cookies.delete('user_email');
      return response;
    }
  }

  return NextResponse.json({ authenticated: false });
}
