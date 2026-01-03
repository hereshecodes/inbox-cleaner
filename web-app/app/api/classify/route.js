import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

export async function POST(request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!CLAUDE_API_KEY) {
    return NextResponse.json({ error: 'AI classification not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { senders } = body;

    if (!senders || !Array.isArray(senders) || senders.length === 0) {
      return NextResponse.json({ error: 'Senders array required' }, { status: 400 });
    }

    // Build the prompt
    const senderList = senders.map((s, i) =>
      `${i + 1}. "${s.name}" <${s.email}>`
    ).join('\n');

    const prompt = `Classify email senders into EXACTLY these categories. Use ONLY these exact names:

ALLOWED CATEGORIES (use exactly as written):
- "People" - Real individual humans only (friends, family, coworkers with personal names)
- "Newsletters" - Newsletters, digests, subscriptions, mailing lists
- "Shopping" - Stores, e-commerce, order confirmations, shipping
- "Social Media" - Facebook, Twitter, LinkedIn, Instagram, TikTok, etc.
- "Finance" - Banks, payments, investments, billing
- "Travel" - Airlines, hotels, booking sites
- "Food" - Restaurants, delivery apps, food services
- "Entertainment" - Streaming, gaming, music, media
- "Work" - Professional tools, SaaS, productivity apps
- "Notifications" - Automated alerts, system emails, no-reply addresses
- "Other" - Anything that doesn't fit above

RULES:
1. Use EXACT category names from the list - no variations
2. "People" = individual humans with real names (John Smith, Sarah Jones)
3. Companies/brands are NEVER "People" even if friendly-sounding
4. When unsure, use "Notifications" for automated or "Other" for unclear

Senders:
${senderList}

Return ONLY valid JSON: {"1": "Category", "2": "Category", ...}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2048,
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${error}`);
    }

    const data = await response.json();
    const text = data.content[0].text;

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse classification response');
    }

    const classifications = JSON.parse(jsonMatch[0]);

    // Convert numbered results back to email keys
    const result = {};
    senders.forEach((sender, i) => {
      const key = String(i + 1);
      result[sender.email] = classifications[key] || 'Other';
    });

    return NextResponse.json({ classifications: result });
  } catch (err) {
    console.error('Classification error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
