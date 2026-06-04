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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
        <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-5 sm:hidden" />

        <p className="text-xs font-semibold text-maroon-700 uppercase tracking-widest mb-1">
          You&apos;re TMoD
        </p>
        <h2 className="font-serif text-xl font-semibold text-stone-900 mb-1">
          Set the meeting theme
        </h2>
        <p className="text-sm text-stone-500 mb-5">
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
          className="w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-sm
                     focus:outline-none focus:ring-2 focus:ring-maroon-700
                     placeholder:text-stone-300 mb-3"
        />

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !theme.trim()}
            className="flex-1 bg-maroon-700 text-white rounded-xl py-3 text-sm font-semibold
                       tap-target disabled:opacity-40 active:scale-95 transition-transform"
          >
            {saving ? 'Saving…' : 'Set Theme'}
          </button>
          <button
            onClick={onLater}
            className="px-5 py-3 text-sm text-stone-400 hover:text-stone-600 tap-target"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
