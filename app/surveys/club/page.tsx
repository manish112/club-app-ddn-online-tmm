'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/utils/supabase/client';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ClubSurveyForm } from '@/components/ClubSurveyForm';
import { ClubSurveyResponseView } from '@/components/SurveyResponseView';
import type { ClubSurveyResponses } from '@/lib/surveys';
import type { ClubSurvey, ClubSurveyResponse } from '@/lib/types';

const MEMBER_KEY = 'tm_member_id';

function SurveyShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617]">
      <header style={{ background: 'linear-gradient(160deg, #6b0c1e 0%, #9d1530 40%, #0E2D6A 100%)', boxShadow: '0 4px 32px rgba(0,0,0,0.4)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="bg-white rounded-lg px-2 py-1 shadow-sm">
            <Image src="/logo.png" alt="Toastmasters" width={88} height={22} className="h-[22px] w-auto" priority />
          </div>
          <p className="text-[13px] font-bold text-white flex-1">{title}</p>
          <Link href="/" className="text-[11px] font-semibold text-white/70 hover:text-white bg-white/10 px-3 py-1.5 rounded-lg">← App</Link>
          <ThemeToggle />
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-6">{children}</div>
    </div>
  );
}

function Notice({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-8 text-center space-y-3">
      <div className="text-4xl">{icon}</div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>
    </div>
  );
}

export default function ClubSurveyPage() {
  const supabase = createClient();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [survey, setSurvey] = useState<ClubSurvey | null>(null);
  const [response, setResponse] = useState<ClubSurveyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(MEMBER_KEY) : null;
    setMemberId(id && id !== 'guest' ? id : null);
    setLoaded(true);
  }, []);

  const fetchAll = useCallback(async () => {
    if (!memberId) { setLoading(false); return; }
    // ?id=<surveyId> → view a specific (past) survey; otherwise the current open one.
    const viewId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null;
    const { data: surveyRow } = viewId
      ? await supabase.from('club_surveys').select('*').eq('id', viewId).maybeSingle()
      : await supabase.from('club_surveys').select('*').eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle();
    setSurvey((surveyRow as ClubSurvey) ?? null);
    if (surveyRow) {
      const { data: resp } = await supabase.from('club_survey_responses')
        .select('*').eq('survey_id', surveyRow.id).eq('member_id', memberId).maybeSingle();
      setResponse((resp as ClubSurveyResponse) ?? null);
    } else {
      setResponse(null);
    }
    setLoading(false);
  }, [memberId, supabase]);

  useEffect(() => { if (loaded) fetchAll(); }, [loaded, fetchAll]);

  if (loaded && !memberId) {
    return <SurveyShell title="Club Survey"><Notice icon="🔒" text="Please sign in from the app to fill this survey." /></SurveyShell>;
  }

  const heading = survey
    ? `Club Survey #${survey.survey_number}${survey.title ? ` — ${survey.title}` : ''}`
    : 'Club Survey';

  return (
    <SurveyShell title="Club Survey">
      {loading ? (
        <div className="h-40 bg-slate-200 dark:bg-slate-900/60 rounded-2xl animate-pulse" />
      ) : !survey ? (
        <Notice icon="📭" text="No club survey is open right now. Please check back when your club officers open one." />
      ) : !response && survey.status !== 'open' ? (
        <Notice icon="🔒" text={`${heading} is closed.`} />
      ) : response ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5 space-y-4">
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">✓ Thanks — you&apos;ve responded to {heading}</p>
          </div>
          <ClubSurveyResponseView r={response.responses as unknown as ClubSurveyResponses} />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-maroon-600 dark:text-maroon-400 mb-1">{heading}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Your feedback helps us keep improving the club. Thank you!</p>
          <ClubSurveyForm surveyId={survey.id} memberId={memberId!} onSubmitted={fetchAll} />
        </div>
      )}
    </SurveyShell>
  );
}
