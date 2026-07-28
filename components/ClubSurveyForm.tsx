'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { QUALITY_CHARACTERISTICS, OVERALL_EXPERIENCE, SATISFACTION_LEVELS, type ClubSurveyResponses } from '@/lib/surveys';

const inputCls = 'w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-maroon-600';
const primaryBtn = 'bg-gradient-to-r from-maroon-700 to-maroon-600 text-white rounded-xl px-5 py-3 text-sm font-semibold active:scale-95 transition-all disabled:opacity-40';
const sectionTitle = 'text-[11px] font-black uppercase tracking-widest text-maroon-600 dark:text-maroon-400 mb-2';

// Short labels for the compact rating buttons; full labels used on wider screens.
const SHORT: Record<string, string> = {
  extremely: 'Extremely', very: 'Very', moderately: 'Moderately', slightly: 'Slightly', not: 'Not',
};

export function ClubSurveyForm({ surveyId, memberId, onSubmitted }: {
  surveyId: string; memberId: string; onSubmitted: () => void;
}) {
  const supabase = createClient();
  const [quality, setQuality] = useState<Record<string, string>>({});
  const [overall, setOverall] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setRating(key: string, value: string) {
    setQuality((prev) => ({ ...prev, [key]: prev[key] === value ? '' : value }));
  }

  async function submit() {
    setBusy(true); setErr(null);
    const responses: ClubSurveyResponses = {
      quality,
      like_most: overall.like_most ?? '',
      like_least: overall.like_least ?? '',
      recommendations: overall.recommendations ?? '',
      learn_more: overall.learn_more ?? '',
    };
    const { error } = await supabase.from('club_survey_responses').insert({ survey_id: surveyId, member_id: memberId, responses });
    setBusy(false);
    if (error) { setErr('Could not submit — you may have already responded to this survey.'); return; }
    onSubmitted();
  }

  return (
    <div className="space-y-6">
      <section>
        <p className={sectionTitle}>Club Quality Characteristics</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Rate your satisfaction on each characteristic.</p>
        <div className="space-y-3">
          {QUALITY_CHARACTERISTICS.map((c) => (
            <div key={c.key} className="space-y-1.5">
              <span className="text-sm text-slate-700 dark:text-slate-300">{c.label}</span>
              <div className="flex gap-1 flex-wrap">
                {SATISFACTION_LEVELS.map((lvl) => {
                  const active = quality[c.key] === lvl.value;
                  return (
                    <button key={lvl.value} type="button" onClick={() => setRating(c.key, lvl.value)}
                      title={lvl.label}
                      className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all active:scale-95 ${
                        active
                          ? 'bg-maroon-600 border-maroon-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-maroon-400'
                      }`}>
                      {SHORT[lvl.value]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className={sectionTitle}>Overall Experience</p>
        <div className="space-y-3">
          {OVERALL_EXPERIENCE.map((q) => (
            <div key={q.key}>
              <label className="text-sm text-slate-600 dark:text-slate-400 block mb-1">{q.label}</label>
              <textarea value={overall[q.key] ?? ''} onChange={(e) => setOverall((p) => ({ ...p, [q.key]: e.target.value }))}
                rows={3} className={`${inputCls} resize-none`} maxLength={1000} />
            </div>
          ))}
        </div>
      </section>

      {err && <p className="text-sm text-red-500">{err}</p>}
      <button onClick={submit} disabled={busy} className={primaryBtn}>{busy ? 'Submitting…' : 'Submit survey'}</button>
    </div>
  );
}
