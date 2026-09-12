import { NextRequest, NextResponse } from 'next/server';
import { recordTermsAcceptance } from '@/lib/member-consent';

export async function POST(req: NextRequest) {
  try {
    const { memberId } = await req.json() as { memberId?: string };
    if (!memberId) return NextResponse.json({ error: 'Missing memberId' }, { status: 400 });

    const result = await recordTermsAcceptance(memberId);
    if ('error' in result) return NextResponse.json(result, { status: 500 });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[terms-consent] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
