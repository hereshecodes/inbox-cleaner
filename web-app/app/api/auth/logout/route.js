import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request) {
  const cookieStore = await cookies();

  // Clear all auth cookies
  cookieStore.delete('access_token');
  cookieStore.delete('refresh_token');
  cookieStore.delete('user_email');

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  return NextResponse.redirect(baseUrl);
}

export async function GET(request) {
  // Allow GET for easy logout via link
  return POST(request);
}
