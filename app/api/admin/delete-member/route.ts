import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminMember } from '@/lib/admin-auth';

// Permanently remove a member. Runs server-side under the service role because
// `members` has no anon DELETE policy — a client-side delete would silently
// affect zero rows.
//
// Most tables referencing members already cascade or set null on delete. These
// don't, so a member who has taken part in anything is blocked by a foreign key
// until the admin explicitly asks to purge that history too.
const HISTORY_TABLES = [
  { table: 'role_claims',     columns: ['member_id'],                              label: 'role claims' },
  { table: 'votes',           columns: ['voter_member_id', 'voted_for_member_id'], label: 'votes' },
  { table: 'jury_scores',     columns: ['judge_member_id', 'contestant_member_id'], label: 'contest ballots' },
  { table: 'contest_results', columns: ['contestant_member_id'],                   label: 'contest results' },
] as const;

// Reviewer/approver stamps on request rows: the requests themselves cascade via
// their own member_id, but a member who *reviewed* someone else's request is
// still referenced. Those columns are nullable, so blank them rather than
// deleting another member's request.
const REVIEWER_COLUMNS = [
  { table: 'speaker_slot_requests',  column: 'reviewer_id' },
  { table: 'role_interest_requests', column: 'reviewer_id' },
  { table: 'evaluator_requests',     column: 'reviewer_id' },
] as const;

// How much history each table holds for this member. A table that doesn't exist
// yet (migration not applied) reports 0 rather than failing the whole check.
async function countHistory(supabase: ReturnType<typeof createServiceClient>, memberId: string) {
  const counts: { label: string; count: number }[] = [];
  for (const { table, columns, label } of HISTORY_TABLES) {
    let total = 0;
    for (const column of columns) {
      const { count, error } = await supabase
        .from(table).select('*', { count: 'exact', head: true }).eq(column, memberId);
      if (!error) total += count ?? 0;
    }
    if (total > 0) counts.push({ label, count: total });
  }
  return counts;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { adminId, memberId, purgeHistory } = body as {
    adminId?: string; memberId?: string; purgeHistory?: boolean;
  };

  if (!(await isAdminMember(adminId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!memberId) {
    return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
  }
  // Deleting yourself would lock you out mid-action; deactivating is the way.
  if (memberId === adminId) {
    return NextResponse.json({ error: 'You cannot delete your own member record.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: member } = await supabase
    .from('members').select('id, name, display_name').eq('id', memberId).single();
  if (!member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  const history = await countHistory(supabase, memberId);

  // Blocked unless the admin has seen the tally and chosen to purge it too.
  if (history.length > 0 && !purgeHistory) {
    return NextResponse.json({ error: 'has_history', history }, { status: 409 });
  }

  if (purgeHistory) {
    for (const { table, columns } of HISTORY_TABLES) {
      for (const column of columns) {
        const { error } = await supabase.from(table).delete().eq(column, memberId);
        // A missing table is fine (feature never migrated); anything else isn't,
        // and stopping here leaves the member intact rather than half-erased.
        if (error && error.code !== '42P01') {
          return NextResponse.json(
            { error: `Could not clear ${table}: ${error.message}` }, { status: 500 });
        }
      }
    }
  }

  for (const { table, column } of REVIEWER_COLUMNS) {
    const { error } = await supabase.from(table).update({ [column]: null }).eq(column, memberId);
    if (error && error.code !== '42P01') {
      return NextResponse.json(
        { error: `Could not clear ${table}.${column}: ${error.message}` }, { status: 500 });
    }
  }

  const { error } = await supabase.from('members').delete().eq('id', memberId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: member.display_name || member.name });
}
