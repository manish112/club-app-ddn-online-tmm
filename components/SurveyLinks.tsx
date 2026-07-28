'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import type { ClubSurvey } from '@/lib/types';

const cardCls = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-card-light dark:shadow-card-dark p-5';
const linkCls = 'flex items-center gap-2 px-3 py-3 rounded-xl border border-slate-200 dark:border-slate-700/60 hover:border-maroon-300 dark:hover:border-maroon-700 hover:bg-maroon-50/50 dark:hover:bg-maroon-950/10 active:scale-[0.98] transition-all';

function fmt(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function SurveyLinks({ memberId }: { memberId: string }) {
  const supabase = createClient();
  const [interestDone, setInterestDone] = useState(false);
  const [openSurvey, setOpenSurvey] = useState<ClubSurvey | null>(null);
  const [respondedIds, setRespondedIds] = useState<string[]>([]);
  const [pastSurveys, setPastSurveys] = useState<ClubSurvey[]>([]);

  const load = useCallback(async () => {
    const [{ data: interest }, { data: open }, { data: myResp }] = await Promise.all([
      supabase.from('member_interest_surveys').select('id').eq('member_id', memberId).maybeSingle(),
      supabase.from('club_surveys').select('*').eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('club_survey_responses').select('survey_id').eq('member_id', memberId),
    ]);
    setInterestDone(!!interest);
    setOpenSurvey((open as ClubSurvey) ?? null);
    const ids = (myResp ?? []).map((r) => r.survey_id as string);
    setRespondedIds(ids);
    if (ids.length) {
      const { data: surveys } = await supabase.from('club_surveys').select('*').in('id', ids).order('created_at', { ascending: false });
      setPastSurveys((surveys as ClubSurvey[]) ?? []);
    } else setPastSurveys([]);
  }, [memberId, supabase]);

  useEffect(() => { load(); }, [load]);

  const respondedToOpen = !!openSurvey && respondedIds.includes(openSurvey.id);
  // Past responses to show as "view" links — exclude the currently-open one (shown above).
  const past = pastSurveys.filter((s) => !openSurvey || s.id !== openSurvey.id);

  return (
    <div className={cardCls}>
      <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Surveys</p>
      <div className="space-y-2">
        {/* Member Interest — always available */}
        <Link href="/surveys/interest" className={linkCls}>
          <span className="text-lg">📝</span>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Membership Interest Survey</span>
          {interestDone && <span className="ml-auto text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Submitted</span>}
        </Link>

        {/* Club Survey — button only shown when one is open */}
        {openSurvey && (
          <Link href="/surveys/club" className={`${linkCls} border-maroon-200 dark:border-maroon-800/50`}>
            <span className="text-lg">📊</span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Club Survey #{openSurvey.survey_number}{openSurvey.title ? ` — ${openSurvey.title}` : ''}
              </span>
              <span className="block text-[11px] text-slate-400">
                {respondedToOpen
                  ? '✓ You responded — view your answers'
                  : openSurvey.closes_at ? `Open until ${fmt(openSurvey.closes_at)}` : 'Open now'}
              </span>
            </span>
          </Link>
        )}

        {/* Past club surveys the member filled */}
        {past.length > 0 && (
          <div className="pt-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 px-0.5">Your past club surveys</p>
            <div className="space-y-1.5">
              {past.map((s) => (
                <Link key={s.id} href={`/surveys/club?id=${s.id}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Club Survey #{s.survey_number}{s.title ? ` — ${s.title}` : ''}</span>
                  <span className="ml-auto text-[11px] text-maroon-600 dark:text-maroon-400">View response →</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
