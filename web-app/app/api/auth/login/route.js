import { NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/auth';

export async function GET(request) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const redirectUri = `${baseUrl}/api/auth/callback`;

  const authUrl = getGoogleAuthUrl(redirectUri);

  return NextResponse.redirect(authUrl);
}
