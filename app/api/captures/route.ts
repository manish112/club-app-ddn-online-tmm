import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';

// Admin-only read of the usage log. The app has no server auth, so we soft-gate
// by verifying the caller's member id resolves to an admin via the service role
// (same trust model as the /amiadmin page, but keeps raw IPs off the anon key).
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId || memberId === 'guest') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: member } = await supabase
    .from('members')
    .select('is_admin, leadership_roles')
    .eq('id', memberId)
    .single();

  const memberRoles: string[] = member?.leadership_roles ?? [];
  const isAdmin = !!member && (member.is_admin || memberRoles.includes('president') || memberRoles.includes('vp_education'));
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('device_captures')
    .select('*, member:members(display_name)')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('[captures] read error:', error.message);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }

  return NextResponse.json({ captures: data ?? [] });
}
