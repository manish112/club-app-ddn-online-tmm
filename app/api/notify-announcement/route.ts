import { NextRequest, NextResponse } from 'next/server';
import { notifyAnnouncement } from '@/lib/email/notifications';
import { escapeHtml } from '@/lib/email/format';

const nl2br = (s: string) => escapeHtml(s).replace(/\n/g, '<br>');

// Email all members about a newly posted announcement.
export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json() as { message: string };
    if (!message?.trim()) return NextResponse.json({ error: 'Missing message' }, { status: 400 });

    const result = await notifyAnnouncement(nl2br(message.trim()));
    if ('skipped' in result) return NextResponse.json(result);
    return NextResponse.json({ ok: true, recipients: result.sent });
  } catch (err) {
    console.error('[notify-announcement] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
