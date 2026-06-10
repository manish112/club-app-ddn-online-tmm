import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/utils/supabase/server';
import { ROLE_META } from '@/lib/types';
import type { RoleKey } from '@/lib/types';

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
    const { targetMemberId, meetingNumber, meetingDate, roleKey, action } = await req.json() as {
      targetMemberId: string;
      meetingNumber: number;
      meetingDate: string;
      roleKey: RoleKey;
      action: 'claimed' | 'released' | 'assigned' | 'removed';
    };

    if (!targetMemberId || !meetingNumber || !meetingDate || !roleKey || !action) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: member } = await supabase
      .from('members')
      .select('display_name, email')
      .eq('id', targetMemberId)
      .single();

    if (!member?.email) {
      return NextResponse.json({ skipped: 'no email' });
    }

    const role = ROLE_META[roleKey];
    const displayDate = formatDate(meetingDate);
    const isClaimed = action === 'claimed' || action === 'assigned';

    const subject = isClaimed
      ? `${role.emoji} You've been assigned as ${role.label} — Meeting #${meetingNumber}`
      : `Role update: ${role.label} removed — Meeting #${meetingNumber}`;

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
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800;">${isClaimed ? 'Role Assigned 🎉' : 'Role Removed'}</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
              Hi <strong style="color:#1e293b;">TM ${member.display_name}</strong>,
            </p>

            ${isClaimed ? `
            <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
              You have been assigned the following role for the upcoming meeting:
            </p>
            ` : `
            <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
              Your role for the following meeting has been removed:
            </p>
            `}

            <!-- Role card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f4;border:1.5px solid #f0c5cc;border-radius:12px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 4px;color:#9d1530;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Your Role</p>
                  <p style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:800;">${role.emoji} ${role.label}</p>
                  <p style="margin:0 0 4px;color:#9d1530;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Meeting</p>
                  <p style="margin:0;color:#1e293b;font-size:16px;font-weight:700;">Meeting #${meetingNumber}</p>
                  <p style="margin:4px 0 0;color:#64748b;font-size:14px;">${displayDate}</p>
                </td>
              </tr>
            </table>

            ${isClaimed ? `
            <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
              Please prepare accordingly. You can view the full agenda and meeting details in the app.
              <br><br>
              <a href="https://www.toastmasters.org/membership/club-meeting-roles" style="color:#9d1530;font-weight:600;">
                Learn more about your role →
              </a>
            </p>
            ` : `
            <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
              If this was unexpected, please check the app or contact your club officer.
            </p>
            `}

            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://ddn.toastmasters.in'}"
               style="display:inline-block;background:linear-gradient(135deg,#9d1530,#6b0c1e);color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:700;">
              Open the App →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
              ${APP_NAME} · Club 03295206 · District 41<br>
              You received this because you are a registered Toastmasters member.
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
      to: member.email,
      subject,
      html,
    });

    if (error) {
      console.error('[notify-role] Resend error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notify-role] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
