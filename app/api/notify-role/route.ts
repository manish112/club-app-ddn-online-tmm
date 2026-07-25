import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { notifyRoleChange, type MeetingRow } from '@/lib/email/notifications';
import type { RoleKey } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { meetingId, targetMemberId, roleKey, action, actorId, actorIsAdmin } = await req.json() as {
      meetingId: string;
      targetMemberId: string;
      roleKey: RoleKey;
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
        .select('id, name, display_name, email, active')
        .eq('id', targetMemberId).single(),
    ]);

    if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (!target.email) return NextResponse.json({ skipped: 'no email' });

    let actor: { id: string; display_name: string } | null = null;
    if (actorId) {
      const { data } = await supabase.from('members').select('id, display_name').eq('id', actorId).single();
      actor = data ?? null;
    }

    const result = await notifyRoleChange({
      target,
      actor,
      actorIsAdmin: !!actorIsAdmin,
      meeting: meeting as MeetingRow,
      roleKey,
      action,
    });

    if ('error' in result) return NextResponse.json(result, { status: 500 });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[notify-role] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
