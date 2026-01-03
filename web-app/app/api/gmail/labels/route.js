import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { listLabels, createLabel, deleteLabel } from '@/lib/gmail';

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const labels = await listLabels(accessToken);
    return NextResponse.json(labels);
  } catch (err) {
    console.error('Gmail labels error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: 'Label name required' }, { status: 400 });
    }

    const label = await createLabel(accessToken, name);
    return NextResponse.json(label);
  } catch (err) {
    console.error('Create label error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const labelId = url.searchParams.get('id');

    if (!labelId) {
      return NextResponse.json({ error: 'Label ID required' }, { status: 400 });
    }

    await deleteLabel(accessToken, labelId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete label error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
