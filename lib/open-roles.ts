// Which roles at a meeting nobody has taken, and who already has one.
// Channel-agnostic on purpose: the email builds an HTML table from this and
// WhatsApp builds a one-line list, but "what counts as open" must not drift
// between the two — a member told by email that Timer is free and by WhatsApp
// that it isn't would rightly stop trusting both.
import { createServiceClient } from '@/utils/supabase/server';
import { ASSIGN_ONLY_ROLES, getMeetingRoles, type Meeting, type RoleKey } from '@/lib/types';

export interface OpenRoleSlots {
  /** Unclaimed slots a member could actually act on. */
  roles: { roleKey: RoleKey; slot: number }[];
  /** Members already holding a role at this meeting. */
  claimedBy: Set<string>;
}

export async function openRoleSlots(meetingId: string): Promise<OpenRoleSlots> {
  const supabase = createServiceClient();
  // getMeetingRoles needs the slot counts and disabled categories, which the
  // lighter meeting rows used elsewhere don't carry.
  const [{ data: full }, { data: claims }] = await Promise.all([
    supabase.from('meetings')
      .select('id, speaker_slots, evaluator_slots, jury_slots, disabled_roles, meeting_type')
      .eq('id', meetingId).single(),
    supabase.from('role_claims').select('role_key, slot_index, member_id').eq('meeting_id', meetingId),
  ]);

  const claimedBy = new Set(
    (claims ?? []).map((c) => c.member_id).filter((id): id is string => !!id));
  if (!full) return { roles: [], claimedBy };

  const taken = new Set((claims ?? []).map((c) => `${c.role_key}:${c.slot_index}`));

  const roles = getMeetingRoles(full as unknown as Meeting).filter(({ roleKey, slot }) => {
    if (taken.has(`${roleKey}:${slot}`)) return false;
    // An admin assigns these, so a member can't act on the invitation.
    if (ASSIGN_ONLY_ROLES.includes(roleKey)) return false;
    // The app holds an evaluator slot closed until its speaker claims and names
    // a preference — offering one now would be a dead end.
    if (roleKey === 'evaluator' && !taken.has(`speaker:${slot}`)) return false;
    return true;
  });

  return { roles, claimedBy };
}
