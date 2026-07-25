import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { sendOne, getAppUrl } from '@/lib/email/mailer';
import { bioBlock } from '@/lib/email/format';

const CLUB_NAME = 'Dehradun Online Toastmasters';

// Notify both the mentee and their newly assigned mentor, each with the other's bio.
export async function POST(req: NextRequest) {
  try {
    const { menteeId, mentorId } = await req.json() as { menteeId: string; mentorId: string };
    if (!menteeId || !mentorId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: members } = await supabase
      .from('members').select('id, name, display_name, email, introduction').in('id', [menteeId, mentorId]);
    const byId = new Map((members ?? []).map((m) => [m.id, m]));
    const mentee = byId.get(menteeId);
    const mentor = byId.get(mentorId);
    if (!mentee || !mentor) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    const base = { club_name: CLUB_NAME, app_url: await getAppUrl() };

    if (mentee.email) {
      await sendOne('mentor_assigned_to_mentee', mentee.email, {
        ...base,
        full_name: mentee.name || mentee.display_name,
        mentor_name: mentor.display_name,
        mentor_bio_block: bioBlock(mentor.display_name, mentor.introduction),
      });
    }
    if (mentor.email) {
      await sendOne('mentor_assigned_to_mentor', mentor.email, {
        ...base,
        full_name: mentor.name || mentor.display_name,
        mentee_name: mentee.display_name,
        mentee_bio_block: bioBlock(mentee.display_name, mentee.introduction),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notify-mentor] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
