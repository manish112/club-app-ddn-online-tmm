'use client';
import {
  INTEREST_GROUPS, QUALITY_CHARACTERISTICS, OVERALL_EXPERIENCE,
  interestLevelLabel, satisfactionLabel,
  type MemberInterestResponses, type ClubSurveyResponses,
} from '@/lib/surveys';

const sectionTitle = 'text-[11px] font-black uppercase tracking-widest text-maroon-600 dark:text-maroon-400 mb-2';
const rowCls = 'flex items-start justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-sm';

function Answer({ label }: { label: string }) {
  return <span className="shrink-0 text-slate-800 dark:text-slate-200 font-semibold text-right">{label}</span>;
}

export function MemberInterestResponseView({ r }: { r: MemberInterestResponses }) {
  return (
    <div className="space-y-5">
      <section>
        <p className={sectionTitle}>Goals</p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-slate-700 dark:text-slate-300">
          {(r.goals ?? []).map((g, i) => <li key={i}>{g || <span className="text-slate-400 italic">—</span>}</li>)}
        </ol>
        <p className="text-xs text-slate-400 mt-2 mb-1">Objectives</p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-slate-700 dark:text-slate-300">
          {(r.objectives ?? []).map((o, i) => <li key={i}>{o || <span className="text-slate-400 italic">—</span>}</li>)}
        </ol>
      </section>

      {INTEREST_GROUPS.map((group) => (
        <section key={group.title}>
          <p className={sectionTitle}>{group.title}</p>
          {group.items.map((item) => {
            const level = r.interests?.[item.key];
            const text = r.texts?.[item.key];
            return (
              <div key={item.key} className={rowCls}>
                <span className="text-slate-600 dark:text-slate-400">
                  {item.label}
                  {text ? <span className="text-slate-400"> — {text}</span> : null}
                </span>
                <Answer label={level ? interestLevelLabel(level) : '—'} />
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export function ClubSurveyResponseView({ r }: { r: ClubSurveyResponses }) {
  return (
    <div className="space-y-5">
      <section>
        <p className={sectionTitle}>Club Quality Characteristics</p>
        {QUALITY_CHARACTERISTICS.map((c) => (
          <div key={c.key} className={rowCls}>
            <span className="text-slate-600 dark:text-slate-400">{c.label}</span>
            <Answer label={r.quality?.[c.key] ? satisfactionLabel(r.quality[c.key]) : '—'} />
          </div>
        ))}
      </section>
      <section>
        <p className={sectionTitle}>Overall Experience</p>
        <div className="space-y-3">
          {OVERALL_EXPERIENCE.map((q) => (
            <div key={q.key}>
              <p className="text-xs text-slate-500 dark:text-slate-400">{q.label}</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap mt-0.5">
                {(r as unknown as Record<string, string>)[q.key] || <span className="text-slate-400 italic">—</span>}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
