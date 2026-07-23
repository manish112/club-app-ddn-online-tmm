import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/utils/supabase/server';

const FROM = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const APP_NAME = 'Dehradun Online Toastmasters';

function formatDate(dateStr: string) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

export async function POST(req: NextRequest) {
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.startsWith('re_placeholder')) {
    return NextResponse.json({ skipped: 'email not configured' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { meetingNumber, meetingDate, speakerId, preferredEvaluatorId } = await req.json() as {
      meetingNumber: number;
      meetingDate: string;
      speakerId: string;
      preferredEvaluatorId: string;
    };

    if (!meetingNumber || !meetingDate || !speakerId || !preferredEvaluatorId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Look up the speaker, the requested evaluator, and the officers to notify
    // (President + VP Education) in one round-trip.
    const { data: members } = await supabase
      .from('members')
      .select('id, display_name, email, leadership_role');

    const byId = new Map((members ?? []).map((m) => [m.id, m]));
    const speaker = byId.get(speakerId);
    const evaluator = byId.get(preferredEvaluatorId);

    const officers = (members ?? []).filter(
      (m) => m.leadership_role === 'president' || m.leadership_role === 'vp_education',
    );
    const recipients = officers.map((o) => o.email).filter((e): e is string => !!e);

    if (recipients.length === 0) {
      return NextResponse.json({ skipped: 'no officer emails' });
    }

    const speakerName = speaker?.display_name ?? 'A member';
    const evaluatorName = evaluator?.display_name ?? 'someone';
    const displayDate = formatDate(meetingDate);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6b0c1e 0%,#9d1530 50%,#0E2D6A 100%);padding:28px 32px;">
            <p style="margin:0;color:rgba(255,255,255,0.6);font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${APP_NAME}</p>
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800;">Evaluator Approval Needed ⚖️</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
              <strong style="color:#1e293b;">TM ${speakerName}</strong> has requested a preferred
              evaluator for their upcoming speech and needs your approval.
            </p>

            <!-- Request card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f4;border:1.5px solid #f0c5cc;border-radius:12px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 4px;color:#9d1530;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Speaker</p>
                  <p style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:800;">🎙️ TM ${speakerName}</p>
                  <p style="margin:0 0 4px;color:#9d1530;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Requested Evaluator</p>
                  <p style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:800;">⚖️ TM ${evaluatorName}</p>
                  <p style="margin:0 0 4px;color:#9d1530;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Meeting</p>
                  <p style="margin:0;color:#1e293b;font-size:16px;font-weight:700;">Meeting #${meetingNumber}</p>
                  <p style="margin:4px 0 0;color:#64748b;font-size:14px;">${displayDate}</p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
              Open the admin panel to approve or decline this request. Until it's approved, the
              evaluator slot is held as &ldquo;assignment in progress&rdquo;.
            </p>

            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://ddn.toastmasters.in'}/amiadmin"
               style="display:inline-block;background:linear-gradient(135deg,#9d1530,#6b0c1e);color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:700;">
              Review Request →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
              ${APP_NAME} · Club 03295206 · District 41<br>
              You received this because you are a club officer (President / VP Education).
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const { error } = await resend.emails.send({
      from: FROM,
      to: recipients,
      subject: `⚖️ Evaluator approval needed — ${speakerName}, Meeting #${meetingNumber}`,
      html,
    });

    if (error) {
      console.error('[notify-evaluator-request] Resend error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notify-evaluator-request] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
