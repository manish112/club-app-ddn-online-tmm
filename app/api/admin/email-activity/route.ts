import { NextRequest, NextResponse } from 'next/server';
import { isAdminMember } from '@/lib/admin-auth';
import { resolveTemplate, getVpEducationName } from '@/lib/email/mailer';
import { buildActivityEmail, previewActivityRun, sendMemberActivityReport, sendActivityReportToAll } from '@/lib/email/notifications';
import { fillTemplate } from '@/lib/email/render';
import { decodeEntities } from '@/lib/email/format';

// Activity report, on request from an officer.
//
//   scope 'one'           — one member. `preview: true` renders it, no send.
//   scope 'all'           — every active member with an email; those with
//                           nothing on record get the encouragement version.
//   scope 'without_roles' — only the members who took nothing on in the period.
//                           Everyone else is left alone entirely.
//
// `month` is 'YYYY-MM' for a single month, or omitted/null for everything since
// the member joined.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { adminId, memberId, month, scope, preview } = body as {
    adminId?: string; memberId?: string; month?: string | null;
    scope?: 'one' | 'all' | 'without_roles'; preview?: boolean;
  };

  if (!(await isAdminMember(adminId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: 'Month must look like 2026-08.' }, { status: 400 });
  }
  const period = month || null;

  if (scope === 'all' || scope === 'without_roles') {
    const onlyWithoutRoles = scope === 'without_roles';

    // Dry run: who would get something, plus a real sample rendered from the
    // first of them, so the audience and the wording can both be checked.
    if (preview) {
      const { recipients, passedOver, skipped } = await previewActivityRun(period, { onlyWithoutRoles });
      const first = recipients[0];
      const built = first ? await buildActivityEmail(first.id, period) : null;
      const sample = built && !('skipped' in built)
        ? await renderSample(built)
        : null;
      return NextResponse.json({ recipients, passedOver, skipped, sample });
    }

    const res = await sendActivityReportToAll(period, { onlyWithoutRoles });
    return NextResponse.json(res);
  }

  if (!memberId) {
    return NextResponse.json({ error: 'Pick a member first.' }, { status: 400 });
  }

  // Render-only: same builder as the send path, so the preview can't drift.
  if (preview) {
    const built = await buildActivityEmail(memberId, period);
    if ('skipped' in built) {
      return NextResponse.json({ error: explain(built.skipped) }, { status: 409 });
    }
    return NextResponse.json(await renderSample(built));
  }

  const res = await sendMemberActivityReport({ memberId, month: period });
  if ('skipped' in res) {
    return NextResponse.json({ error: explain(res.skipped) }, { status: 409 });
  }
  if ('error' in res) {
    return NextResponse.json({ error: res.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, template: res.template });
}

// Fill a built email for on-screen display without sending it. sendOne injects
// the signature name at send time; this path bypasses it, so add it here or the
// preview shows a blank line above "VP Education".
type BuiltEmail = Exclude<Awaited<ReturnType<typeof buildActivityEmail>>, { skipped: string }>;
async function renderSample(built: BuiltEmail) {
  const tpl = await resolveTemplate(built.templateKey);
  const vars = { vp_education_name: await getVpEducationName(), ...built.vars };
  return {
    template: built.templateKey,
    to: built.email,
    subject: decodeEntities(fillTemplate(tpl.subject, vars)),
    html: fillTemplate(tpl.body_html, vars),
  };
}

function explain(reason: string): string {
  if (reason === 'no email') return 'That member has no email address on file.';
  if (reason === 'member not found') return 'That member no longer exists.';
  return reason;
}
