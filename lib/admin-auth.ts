import { createServiceClient } from '@/utils/supabase/server';

// Verify a caller-supplied member id belongs to an admin. Mirrors isAdminMember
// in app/amiadmin/page.tsx. Note: member ids are client-supplied (spoofable) —
// this matches the app's existing client-trust model, but keeps SMTP secrets in
// a service-role-only table that anon clients cannot read at all.
export async function isAdminMember(memberId?: string | null): Promise<boolean> {
  if (!memberId) return false;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('members').select('is_admin, leadership_roles').eq('id', memberId).single();
  if (!data) return false;
  const roles: string[] = data.leadership_roles ?? [];
  return !!data.is_admin || roles.includes('president') || roles.includes('vp_education');
}
