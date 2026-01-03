import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getProfile } from '@/lib/gmail';

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const profile = await getProfile(accessToken);
    return NextResponse.json(profile);
  } catch (err) {
    console.error('Gmail profile error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
