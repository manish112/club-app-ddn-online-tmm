import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { sendOne, getAppUrl } from '@/lib/email/mailer';
import { formatDate, formatTime, escapeHtml } from '@/lib/email/format';
import type { TemplateKey } from '@/lib/email/defaults';

const CLUB_NAME = 'Dehradun Online Toastmasters';

type Kind = 'speaker_slot' | 'evaluator';
type ReqEvent = 'submitted' | 'approved' | 'denied';

// Each request state has its own editable template.
function templateKeyFor(kind: Kind, event: ReqEvent): TemplateKey {
  if (kind === 'speaker_slot') {
    return event === 'approved' ? 'speaker_slot_approved'
      : event === 'denied' ? 'speaker_slot_declined'
      : 'speaker_slot_received';
  }
  return event === 'approved' ? 'evaluator_request_approved'
    : event === 'denied' ? 'evaluator_request_declined'
    : 'evaluator_request_received';
}

function commentBlock(comment: string | null, officerName: string | null): string {
  if (!comment) return '';
  const heading = officerName ? `Note from TM ${escapeHtml(officerName)}` : 'Note from the officer';
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;"><tr><td style="padding:16px 20px;">
    <p style="margin:0 0 4px;color:#9d1530;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">${heading}</p>
    <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">${escapeHtml(comment)}</p>
  </td></tr></table>`;
}

export async function POST(req: NextRequest) {
  try {
    const { kind, event, requestId, skipRequester } = await req.json() as {
      kind: Kind; event: ReqEvent; requestId: string; skipRequester?: boolean;
    };
    if (!kind || !event || !requestId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const supabase = createServiceClient();

    let memberId: string; let meetingId: string; let comment: string | null;
    let evaluatorId: string | null = null; let reviewerId: string | null = null;
    if (kind === 'speaker_slot') {
      const { data } = await supabase.from('speaker_slot_requests')
        .select('member_id, meeting_id, review_comment, reviewer_id').eq('id', requestId).single();
      if (!data) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      memberId = data.member_id; meetingId = data.meeting_id; comment = data.review_comment; reviewerId = data.reviewer_id;
    } else {
      const { data } = await supabase.from('evaluator_requests')
        .select('speaker_id, meeting_id, review_comment, preferred_evaluator_id, reviewer_id').eq('id', requestId).single();
      if (!data) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      memberId = data.speaker_id; meetingId = data.meeting_id; comment = data.review_comment;
      evaluatorId = data.preferred_evaluator_id; reviewerId = data.reviewer_id;
    }

    const [{ data: meeting }, { data: member }] = await Promise.all([
      supabase.from('meetings').select('number, date, start_time, end_time').eq('id', meetingId).single(),
      supabase.from('members').select('id, name, display_name, email').eq('id', memberId).single(),
    ]);
    if (!meeting || !member) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const evaluator = evaluatorId
      ? (await supabase.from('members').select('name, display_name, email').eq('id', evaluatorId).single()).data
      : null;
    const reviewer = reviewerId
      ? (await supabase.from('members').select('display_name').eq('id', reviewerId).single()).data
      : null;

    const appUrl = await getAppUrl();
    const meetingVars = {
      club_name: CLUB_NAME,
      app_url: appUrl,
      meeting_number: String(meeting.number),
      meeting_date: formatDate(meeting.date),
      meeting_time: `${formatTime(meeting.start_time)}–${formatTime(meeting.end_time)}`,
    };

    // 1) Notify the requester (speaker) about the status change.
    if (member.email && !skipRequester) {
      await sendOne(templateKeyFor(kind, event), member.email, {
        ...meetingVars,
        full_name: member.name || member.display_name,
        evaluator_name: evaluator?.display_name ?? '',
        review_comment_block: event === 'submitted' ? '' : commentBlock(comment, reviewer?.display_name ?? null),
      }, meetingId);
    }

    // 2) On a NEW evaluator nomination, tell the requested evaluator too.
    if (kind === 'evaluator' && event === 'submitted' && evaluator?.email) {
      await sendOne('evaluator_nominated', evaluator.email, {
        ...meetingVars,
        full_name: evaluator.name || evaluator.display_name,
        speaker_name: member.display_name,
      }, meetingId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notify-request] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
