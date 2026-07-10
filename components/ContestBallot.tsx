'use client';
import { useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { JuryScore, Member, RoleClaim } from '@/lib/types';
import { CONTEST_RUBRIC, RUBRIC_CATEGORIES, RUBRIC_TOTAL, scoreTotal } from '@/lib/contest';

interface Props {
  meetingId: string;
  judgeMemberId: string;
  contestant: Member;
  claim?: RoleClaim | null;   // speaker's speech details (title, path, level, project)
  existing: JuryScore | null;
  locked?: boolean;           // admin has locked scoring — read-only
  onSaved: () => void;
}

const inputCls = 'w-16 text-center text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-maroon-600 dark:focus:ring-maroon-500';

export function ContestBallot({ meetingId, judgeMemberId, contestant, claim, existing, locked, onSaved }: Props) {
  const supabase = createClient();
  const [scores, setScores] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const item of CONTEST_RUBRIC) {
      const v = existing?.scores?.[item.key];
      init[item.key] = v === undefined || v === null ? '' : String(v);
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const numericScores = useMemo(() => {
    const out: Record<string, number> = {};
    for (const item of CONTEST_RUBRIC) out[item.key] = Number(scores[item.key]) || 0;
    return out;
  }, [scores]);

  const total = scoreTotal(numericScores);

  function setItem(key: string, value: string) {
    setSaved(false);
    setErr(null);
    setScores((s) => ({ ...s, [key]: value }));
  }

  function validate(): string | null {
    for (const item of CONTEST_RUBRIC) {
      const raw = scores[item.key];
      if (raw === '') return `Enter a score for “${item.label}”.`;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > item.max) return `“${item.label}” must be a whole number between 0 and ${item.max}.`;
    }
    return null;
  }

  async function save() {
    if (locked) return;
    const v = validate();
    if (v) { setErr(v); return; }
    setSaving(true);
    setErr(null);
    const { error } = await supabase.from('jury_scores').upsert({
      meeting_id: meetingId,
      judge_member_id: judgeMemberId,
      contestant_member_id: contestant.id,
      scores: numericScores,
      total,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'meeting_id,judge_member_id,contestant_member_id' });
    setSaving(false);
    if (error) { setErr('Could not save — please retry.'); return; }
    setSaved(true);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-maroon-50 dark:bg-maroon-950/20 border border-maroon-100 dark:border-maroon-900/40 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-maroon-500 dark:text-maroon-400">Judging</p>
        <p className="text-lg font-bold text-slate-900 dark:text-white">TM {contestant.display_name}</p>
        {claim?.speech_title && (
          <p className="text-sm font-semibold text-maroon-800 dark:text-maroon-300 mt-0.5">“{claim.speech_title}”</p>
        )}
        {claim && (claim.path || claim.speech_level || claim.project) && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {[claim.path, claim.speech_level ? `Level ${claim.speech_level}` : null, claim.project].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {RUBRIC_CATEGORIES.map((cat) => (
        <div key={cat.name} className="rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{cat.name}</span>
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">{cat.max}%</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {CONTEST_RUBRIC.filter((i) => i.category === cat.name).map((item) => (
              <div key={item.key} className="flex items-start gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{item.label}</p>
                  <p className="text-xs text-slate-700 dark:text-slate-300">{item.desc}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    Excellent {item.bands.excellent} · Very good {item.bands.veryGood} · Good {item.bands.good} · Fair {item.bands.fair}
                  </p>
                </div>
                <div className="shrink-0 text-center">
                  <input
                    type="number" inputMode="numeric" min={0} max={item.max}
                    value={scores[item.key]}
                    onChange={(e) => setItem(item.key, e.target.value)}
                    disabled={locked}
                    aria-label={`${item.label} score, max ${item.max}`}
                    className={`${inputCls} disabled:opacity-60 disabled:cursor-not-allowed`}
                  />
                  <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mt-0.5">/ {item.max}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between rounded-xl bg-slate-900 dark:bg-slate-800 text-white px-4 py-3">
        <span className="text-sm font-semibold uppercase tracking-wide">Total score</span>
        <span className="text-2xl font-black tabular-nums">{total}<span className="text-sm font-medium text-white/60"> / {RUBRIC_TOTAL}</span></span>
      </div>

      {err && <p className="text-sm text-red-500">{err}</p>}
      {saved && !err && <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Saved ✓</p>}

      {locked ? (
        <p className="text-sm text-center font-semibold text-slate-500 dark:text-slate-400 py-3">🔒 Scoring is locked by the admin.</p>
      ) : (
        <button
          onClick={save} disabled={saving}
          className="w-full bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700
                     text-white rounded-xl py-3 text-sm font-semibold min-h-[48px] disabled:opacity-40 active:scale-95 transition-all shadow-sm"
        >
          {saving ? 'Saving…' : existing ? 'Update score' : 'Submit score'}
        </button>
      )}
    </div>
  );
}
