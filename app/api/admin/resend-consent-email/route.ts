import { NextRequest, NextResponse } from 'next/server';
import { isAdminMember } from '@/lib/admin-auth';
import { resendConsentReceipt, type ConsentChannel } from '@/lib/member-consent';

// Admin-triggered re-send of a consent receipt already on file — see
// resendConsentReceipt in lib/member-consent.ts for why this exists (the
// original send can silently fail to land, and this is the manual fallback).
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!(await isAdminMember(body.adminId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { memberId, channel } = body as { memberId?: string; channel?: ConsentChannel };
  if (!memberId || (channel !== 'email' && channel !== 'whatsapp')) {
    return NextResponse.json({ error: 'memberId and a valid channel are required' }, { status: 400 });
  }

  const result = await resendConsentReceipt(memberId, channel);
  if ('error' in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
