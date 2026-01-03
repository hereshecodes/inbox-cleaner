import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { batchTrash, batchDelete, batchModify } from '@/lib/gmail';

export async function POST(request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, messageIds, addLabelIds, removeLabelIds } = body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ error: 'messageIds required' }, { status: 400 });
    }

    let result;

    switch (action) {
      case 'trash':
        result = await batchTrash(accessToken, messageIds);
        break;
      case 'delete':
        result = await batchDelete(accessToken, messageIds);
        break;
      case 'modify':
        result = await batchModify(accessToken, messageIds, addLabelIds || [], removeLabelIds || []);
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error('Gmail batch error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
