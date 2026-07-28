'use client';
import { QUALITY_CHARACTERISTICS, OVERALL_EXPERIENCE, SATISFACTION_LEVELS, satisfactionLabel, type ClubSurveyResponses } from '@/lib/surveys';

// Satisfaction value → 1–5 score for averaging.
const SCORE: Record<string, number> = { extremely: 5, very: 4, moderately: 3, slightly: 2, not: 1 };

export function ClubSurveyReport({ responses }: { responses: { responses: unknown }[] }) {
  const rows = responses.map((r) => r.responses as ClubSurveyResponses);
  const n = rows.length;

  const perChar = QUALITY_CHARACTERISTICS.map((c) => {
    const vals = rows.map((r) => r.quality?.[c.key]).filter((v): v is string => !!v);
    const counts = SATISFACTION_LEVELS.map((l) => ({ level: l, count: vals.filter((v) => v === l.value).length }));
    const scored = vals.map((v) => SCORE[v]).filter((s) => !!s);
    const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0;
    return { c, counts, avg, answered: vals.length };
  });

  const overallAvg = (() => {
    const avgs = perChar.map((p) => p.avg).filter((a) => a > 0);
    return avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
  })();

  const barColor = (avg: number) =>
    avg >= 4 ? 'bg-emerald-500' : avg >= 3 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{n}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Responses</p>
        </div>
        <div>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{overallAvg ? overallAvg.toFixed(1) : '—'}<span className="text-sm text-slate-400"> / 5</span></p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Overall satisfaction</p>
        </div>
      </div>

      {/* Quality characteristics */}
      <section>
        <p className="text-[11px] font-black uppercase tracking-widest text-maroon-600 dark:text-maroon-400 mb-2">Quality Characteristics</p>
        <div className="space-y-2.5">
          {perChar.map(({ c, counts, avg, answered }) => (
            <div key={c.key}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-700 dark:text-slate-300">{c.label}</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 shrink-0">{avg ? avg.toFixed(1) : '—'}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden my-1">
                <div className={`h-full rounded-full ${barColor(avg)}`} style={{ width: `${(avg / 5) * 100}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                {counts.filter((x) => x.count > 0).map((x) => (
                  <span key={x.level.value}>{satisfactionLabel(x.level.value)}: <strong className="text-slate-500 dark:text-slate-400">{x.count}</strong></span>
                ))}
                {answered === 0 && <span className="italic">No ratings</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Overall experience — all free-text answers */}
      <section>
        <p className="text-[11px] font-black uppercase tracking-widest text-maroon-600 dark:text-maroon-400 mb-2">Overall Experience</p>
        <div className="space-y-4">
          {OVERALL_EXPERIENCE.map((q) => {
            const answers = rows
              .map((r) => (r as unknown as Record<string, string>)[q.key])
              .filter((a) => a && a.trim());
            return (
              <div key={q.key}>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">{q.label}</p>
                {answers.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No answers</p>
                ) : (
                  <ul className="space-y-1.5">
                    {answers.map((a, i) => (
                      <li key={i} className="text-sm text-slate-600 dark:text-slate-400 border-l-2 border-slate-200 dark:border-slate-700 pl-3 whitespace-pre-wrap">{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
