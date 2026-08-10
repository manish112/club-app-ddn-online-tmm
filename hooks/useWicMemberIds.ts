'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

// Which members belong to the visiting WIC India club, for the places that list
// "our club members" and must leave them out.
//
// Read on its own rather than off the shared members list, which deliberately
// doesn't select participation_mode so a not-yet-migrated column can't break
// sign-in (see hooks/useMeetings). Same reasoning here: if the read fails, the
// set stays empty and every list simply shows everyone, as it did before.
export function useWicMemberIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    createClient()
      .from('members').select('id').eq('participation_mode', 'offline')
      .then(({ data, error }) => {
        if (error || !data) return;
        setIds(new Set(data.map((m) => m.id as string)));
      });
  }, []);

  return ids;
}
