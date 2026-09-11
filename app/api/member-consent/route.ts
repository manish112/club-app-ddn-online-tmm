import { NextRequest, NextResponse } from 'next/server';
import { recordConsent, type ConsentChannel, type ConsentDecision } from '@/lib/member-consent';

export async function POST(req: NextRequest) {
  try {
    const { memberId, channel, decision, retroactive } = await req.json() as {
      memberId: string;
      channel: ConsentChannel;
      decision: ConsentDecision;
      /** True when an existing member ticked the "I was aware of this feature
       *  since it started" box alongside granting — see ConsentGateModal. */
      retroactive?: boolean;
    };

    if (!memberId || (channel !== 'email' && channel !== 'whatsapp') || (decision !== 'granted' && decision !== 'declined')) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
    }

    const result = await recordConsent(memberId, channel, decision, !!retroactive);
    if ('error' in result) return NextResponse.json(result, { status: 500 });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[member-consent] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
