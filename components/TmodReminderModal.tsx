'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { MeetingWithClaims } from '@/lib/types';
import { formatMeetingDate, normalizeMeetingLink } from '@/lib/utils';

interface Props {
  meeting: MeetingWithClaims;
  /** Which fields are still missing — only these are asked for. */
  needs: { theme: boolean; link: boolean };
  onSaved: () => void;
  onLater: () => void;
}

// What the TMoD owes the club before the meeting: a theme, and a link everyone
// can join on. Both live in one modal rather than two, because a TMoD who has
// just claimed the role is usually missing both, and two popups in a row reads
// as the app malfunctioning.
export function TmodReminderModal({ meeting, needs, onSaved, onLater }: Props) {
  const supabase = createClient();
  const [theme, setTheme] = useState('');
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const both = needs.theme && needs.link;
  const heading = both ? 'Set the theme and meeting link'
    : needs.theme ? 'Set the meeting theme'
    : 'Set the meeting link';

  // Saving one of the two is progress worth keeping — a TMoD who knows the
  // theme but hasn't made the call link yet shouldn't be held at the door.
  const canSave = (needs.theme && !!theme.trim()) || (needs.link && !!link.trim());

  async function handleSave() {
    if (!canSave || saving) return;

    const update: { theme?: string; meeting_link?: string } = {};
    if (needs.theme && theme.trim()) update.theme = theme.trim();
    if (needs.link && link.trim()) {
      const normalized = normalizeMeetingLink(link);
      if (!normalized) { setLinkError("That doesn't look like a link."); return; }
      update.meeting_link = normalized;
    }

    setSaving(true);
    const { error } = await supabase.from('meetings').update(update).eq('id', meeting.id);
    setSaving(false);
    if (error) { setLinkError('Could not save — please try again.'); return; }
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
          {heading}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          Meeting #{meeting.number} · {formatMeetingDate(meeting.date)} doesn&apos;t have{' '}
          {both ? 'a theme or a join link' : needs.theme ? 'a theme' : 'a join link'} yet.
          As TMoD, you can set {both ? 'them' : 'it'} now.
        </p>

        {needs.theme && (
          <input
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !both) handleSave(); }}
            placeholder="Theme — e.g. Embrace Change, Rise Together…"
            autoFocus
            className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3
                       text-slate-800 dark:text-slate-100 text-sm bg-white dark:bg-slate-800
                       focus:outline-none focus:ring-2 focus:ring-maroon-600 dark:focus:ring-maroon-500
                       placeholder:text-slate-300 dark:placeholder:text-slate-600 mb-3"
          />
        )}

        {needs.link && (
          <>
            <input
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => { setLink(e.target.value); setLinkError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="Meeting link — e.g. meet.google.com/abc-defg-hij"
              autoFocus={!needs.theme}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3
                         text-slate-800 dark:text-slate-100 text-sm bg-white dark:bg-slate-800
                         focus:outline-none focus:ring-2 focus:ring-maroon-600 dark:focus:ring-maroon-500
                         placeholder:text-slate-300 dark:placeholder:text-slate-600 mb-1"
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
              This is what members tap to join, and what the reminders link to.
            </p>
          </>
        )}

        {linkError && (
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-3">{linkError}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="flex-1 bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700
                       text-white rounded-xl py-3 text-sm font-semibold
                       min-h-[44px] disabled:opacity-40 active:scale-95 transition-all shadow-sm"
          >
            {saving ? 'Saving…' : 'Save'}
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
