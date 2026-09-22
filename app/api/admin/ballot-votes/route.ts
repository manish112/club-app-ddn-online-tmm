import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';

// Individual vote records for a ballot — voter identity included. The `votes`
// table has no select policy at all (see supabase/schema.sql), by design: the
// only path the app itself uses is get_ballot_results(), an aggregate RPC that
// never returns voter_member_id. This route is the one deliberate exception,
// gated to admins only, for a club that wants to audit who voted for whom.
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!(await isAdminMember(memberId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ballotId = req.nextUrl.searchParams.get('ballotId');
  if (!ballotId) {
    return NextResponse.json({ error: 'ballotId is required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from('votes')
    .select('id, category, voter_member_id, voted_for_member_id, voted_for_name, submitted_at')
    .eq('ballot_id', ballotId)
    .order('category')
    .order('submitted_at');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const memberIds = new Set<string>();
  for (const r of rows ?? []) {
    if (r.voter_member_id) memberIds.add(r.voter_member_id as string);
    if (r.voted_for_member_id) memberIds.add(r.voted_for_member_id as string);
  }
  const nameById = new Map<string, string>();
  if (memberIds.size > 0) {
    const { data: members } = await supabase
      .from('members').select('id, display_name').in('id', [...memberIds]);
    for (const m of members ?? []) nameById.set(m.id as string, m.display_name as string);
  }

  const entries = (rows ?? []).map((r) => ({
    id: r.id as string,
    category: r.category as string,
    // No member id at all means a guest (device-only) voter — the votes table
    // never has a name for them, by design (voting is anonymous for guests).
    voterName: r.voter_member_id ? (nameById.get(r.voter_member_id as string) ?? 'Member') : 'Guest',
    votedForName: r.voted_for_member_id
      ? (nameById.get(r.voted_for_member_id as string) ?? 'Member')
      : ((r.voted_for_name as string | null) ?? 'Unknown'),
    submittedAt: r.submitted_at as string,
  }));

  return NextResponse.json({ entries });
}
