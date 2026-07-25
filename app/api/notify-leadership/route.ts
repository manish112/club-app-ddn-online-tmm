import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { sendOne, getAppUrl } from '@/lib/email/mailer';
import { escapeHtml } from '@/lib/email/format';
import { leadershipRoleLabel, type LeadershipRole } from '@/lib/types';

const CLUB_NAME = 'Dehradun Online Toastmasters';

// Email a member when they're appointed to a leadership role.
export async function POST(req: NextRequest) {
  try {
    const { targetMemberId, role, actorId } = await req.json() as {
      targetMemberId: string; role: LeadershipRole; actorId?: string;
    };
    if (!targetMemberId || !role) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: target } = await supabase
      .from('members').select('id, name, display_name, email, leadership_roles')
      .eq('id', targetMemberId).single();
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (!target.email) return NextResponse.json({ skipped: 'no email' });

    let actor: { id: string; display_name: string } | null = null;
    if (actorId) {
      const { data } = await supabase.from('members').select('id, display_name').eq('id', actorId).single();
      actor = data ?? null;
    }

    const roles: LeadershipRole[] = target.leadership_roles ?? [];
    const vars = {
      club_name: CLUB_NAME,
      app_url: await getAppUrl(),
      full_name: target.name || target.display_name,
      leadership_role: leadershipRoleLabel(role),
      roles_list: roles.map(leadershipRoleLabel).join(', ') || leadershipRoleLabel(role),
      actor_line: actor && actor.id !== target.id ? ` This was done by Admin TM ${escapeHtml(actor.display_name)}.` : '',
    };

    const result = await sendOne('leadership_assigned', target.email, vars);
    if ('error' in result) return NextResponse.json(result, { status: 500 });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[notify-leadership] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
