'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/utils/supabase/client';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MemberInterestForm } from '@/components/MemberInterestForm';
import { MemberInterestResponseView } from '@/components/SurveyResponseView';
import type { MemberInterestResponses } from '@/lib/surveys';
import type { MemberInterestSurvey } from '@/lib/types';

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

export default function MemberInterestSurveyPage() {
  const supabase = createClient();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [existing, setExisting] = useState<MemberInterestSurvey | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(MEMBER_KEY) : null;
    setMemberId(id && id !== 'guest' ? id : null);
    setLoaded(true);
  }, []);

  const fetchExisting = useCallback(async () => {
    if (!memberId) { setLoading(false); return; }
    const { data } = await supabase.from('member_interest_surveys').select('*').eq('member_id', memberId).maybeSingle();
    setExisting((data as MemberInterestSurvey) ?? null);
    setLoading(false);
  }, [memberId, supabase]);

  useEffect(() => { if (loaded) fetchExisting(); }, [loaded, fetchExisting]);

  if (loaded && !memberId) {
    return (
      <SurveyShell title="Member Interest Survey">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-8 text-center space-y-3">
          <div className="text-4xl">🔒</div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Please sign in from the app to fill this survey.</p>
          <Link href="/" className="inline-block bg-gradient-to-r from-maroon-700 to-maroon-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold">Go to app</Link>
        </div>
      </SurveyShell>
    );
  }

  return (
    <SurveyShell title="Member Interest Survey">
      {loading ? (
        <div className="h-40 bg-slate-200 dark:bg-slate-900/60 rounded-2xl animate-pulse" />
      ) : existing ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5 space-y-4">
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">✓ You submitted this survey</p>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-500/90 mt-0.5">
              on {new Date(existing.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.
              To fill it again, ask an admin to reset your submission.
            </p>
          </div>
          <MemberInterestResponseView r={existing.responses as unknown as MemberInterestResponses} />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            Help us support your Toastmasters journey. You can fill this once — an admin can reset it if you need to update it later.
          </p>
          <MemberInterestForm memberId={memberId!} onSubmitted={fetchExisting} />
        </div>
      )}
    </SurveyShell>
  );
}
