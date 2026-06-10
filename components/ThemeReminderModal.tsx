'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { MeetingWithClaims } from '@/lib/types';
import { formatMeetingDate } from '@/lib/utils';

interface Props {
  meeting: MeetingWithClaims;
  onSaved: () => void;
  onLater: () => void;
}

export function ThemeReminderModal({ meeting, onSaved, onLater }: Props) {
  const supabase = createClient();
  const [theme, setTheme] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!theme.trim()) return;
    setSaving(true);
    await supabase.from('meetings').update({ theme: theme.trim() }).eq('id', meeting.id);
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-modal-dark p-6">
        <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-5 sm:hidden" />

        <p className="text-xs font-semibold text-maroon-600 dark:text-maroon-400 uppercase tracking-widest mb-1">
          You&apos;re TMoD
        </p>
        <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-1">
          Set the meeting theme
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          Meeting #{meeting.number} · {formatMeetingDate(meeting.date)} doesn&apos;t have a theme yet.
          As TMoD, you can set it now.
        </p>

        <input
          type="text"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder="e.g. Embrace Change, Rise Together…"
          autoFocus
          className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3
                     text-slate-800 dark:text-slate-100 text-sm bg-white dark:bg-slate-800
                     focus:outline-none focus:ring-2 focus:ring-maroon-600 dark:focus:ring-maroon-500
                     placeholder:text-slate-300 dark:placeholder:text-slate-600 mb-3"
        />

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !theme.trim()}
            className="flex-1 bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700
                       text-white rounded-xl py-3 text-sm font-semibold
                       min-h-[44px] disabled:opacity-40 active:scale-95 transition-all shadow-sm"
          >
            {saving ? 'Saving…' : 'Set Theme'}
          </button>
          <button
            onClick={onLater}
            className="px-5 py-3 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[44px]"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
