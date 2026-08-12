import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { notifyRoleChange, type MeetingRow } from '@/lib/email/notifications';
import { waNotifyRoleChange } from '@/lib/whatsapp/notifications';
import type { RoleKey } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { meetingId, targetMemberId, roleKey, slotIndex, action, actorId, actorIsAdmin } = await req.json() as {
      meetingId: string;
      targetMemberId: string;
      roleKey: RoleKey;
      slotIndex?: number;
      action: 'claimed' | 'released' | 'assigned' | 'removed';
      actorId?: string | null;
      actorIsAdmin?: boolean;
    };

    if (!meetingId || !targetMemberId || !roleKey || !action) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const [{ data: meeting }, { data: target }] = await Promise.all([
      supabase.from('meetings')
        .select('id, number, date, start_time, end_time, theme, meeting_link')
        .eq('id', meetingId).single(),
      supabase.from('members')
        .select('id, name, display_name, email, phone, active, whatsapp_notifications')
        .eq('id', targetMemberId).single(),
    ]);

    if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    let actor: { id: string; display_name: string } | null = null;
    if (actorId) {
      const { data } = await supabase.from('members').select('id, display_name').eq('id', actorId).single();
      actor = data ?? null;
    }

    // Email and WhatsApp are configured separately, so a member with only one of
    // the two must still hear about it. The old code bailed out on a missing
    // email address before either could run.
    const result = target.email
      ? await notifyRoleChange({
          target, actor, actorIsAdmin: !!actorIsAdmin,
          meeting: meeting as MeetingRow, roleKey, action,
        })
      : { skipped: 'no email' as const };

    // Never fails the request: the email has already gone by this point, and a
    // WhatsApp problem shouldn't read to the member as "your role didn't save".
    let whatsapp: unknown;
    try {
      whatsapp = await waNotifyRoleChange({
        target, actor, actorIsAdmin: !!actorIsAdmin,
        meeting: meeting as MeetingRow, roleKey, slotIndex, action,
      });
    } catch (err) {
      console.error('[notify-role] WhatsApp send failed:', err);
      whatsapp = { error: 'whatsapp send failed' };
    }

    if ('error' in result) return NextResponse.json({ ...result, whatsapp }, { status: 500 });
    return NextResponse.json({ ...result, whatsapp });
  } catch (err) {
    console.error('[notify-role] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
