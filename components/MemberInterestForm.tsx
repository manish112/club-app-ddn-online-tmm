'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { INTEREST_GROUPS, INTEREST_LEVELS, type MemberInterestResponses } from '@/lib/surveys';

const inputCls = 'w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-maroon-600';
const primaryBtn = 'bg-gradient-to-r from-maroon-700 to-maroon-600 text-white rounded-xl px-5 py-3 text-sm font-semibold active:scale-95 transition-all disabled:opacity-40';
const sectionTitle = 'text-[11px] font-black uppercase tracking-widest text-maroon-600 dark:text-maroon-400 mb-2';

export function MemberInterestForm({ memberId, onSubmitted }: { memberId: string; onSubmitted: () => void }) {
  const supabase = createClient();
  const [goals, setGoals] = useState(['', '']);
  const [objectives, setObjectives] = useState(['', '']);
  const [interests, setInterests] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setRating(key: string, value: string) {
    setInterests((prev) => ({ ...prev, [key]: prev[key] === value ? '' : value }));
  }

  async function submit() {
    setBusy(true); setErr(null);
    const responses: MemberInterestResponses = { goals, objectives, interests, texts };
    const { error } = await supabase.from('member_interest_surveys').insert({ member_id: memberId, responses });
    setBusy(false);
    if (error) { setErr('Could not submit — you may have already filled this survey.'); return; }
    onSubmitted();
  }

  return (
    <div className="space-y-6">
      {/* Goals */}
      <section>
        <p className={sectionTitle}>Goals</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Two goals you wish to accomplish this year as a Toastmaster:</p>
        <div className="space-y-2">
          {goals.map((g, i) => (
            <input key={i} value={g} onChange={(e) => setGoals((p) => p.map((v, j) => j === i ? e.target.value : v))}
              placeholder={`Goal ${i + 1}`} className={inputCls} maxLength={300} />
          ))}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 mb-2">Two objectives in the next few months in support of those goals:</p>
        <div className="space-y-2">
          {objectives.map((o, i) => (
            <input key={i} value={o} onChange={(e) => setObjectives((p) => p.map((v, j) => j === i ? e.target.value : v))}
              placeholder={`Objective ${i + 1}`} className={inputCls} maxLength={300} />
          ))}
        </div>
      </section>

      {/* Interests */}
      {INTEREST_GROUPS.map((group) => (
        <section key={group.title}>
          <p className={sectionTitle}>{group.title}</p>
          <div className="space-y-3">
            {group.items.map((item) => (
              <div key={item.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 min-w-[140px]">{item.label}</span>
                  <div className="flex gap-1 shrink-0">
                    {INTEREST_LEVELS.map((lvl) => {
                      const active = interests[item.key] === lvl.value;
                      return (
                        <button key={lvl.value} type="button" onClick={() => setRating(item.key, lvl.value)}
                          className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all active:scale-95 ${
                            active
                              ? 'bg-maroon-600 border-maroon-600 text-white'
                              : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-maroon-400'
                          }`}>
                          {lvl.label.replace(' Interest', '')}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {item.textField && (
                  <input value={texts[item.key] ?? ''} onChange={(e) => setTexts((p) => ({ ...p, [item.key]: e.target.value }))}
                    placeholder={item.textField} className={`${inputCls} text-xs`} maxLength={200} />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {err && <p className="text-sm text-red-500">{err}</p>}
      <button onClick={submit} disabled={busy} className={primaryBtn}>{busy ? 'Submitting…' : 'Submit survey'}</button>
    </div>
  );
}
