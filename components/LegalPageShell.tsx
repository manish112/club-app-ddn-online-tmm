import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from '@/components/ThemeToggle';

// Shared chrome for the two standalone legal pages (app/terms, app/privacy) —
// public, unauthenticated, and linked to from TermsGateModal, ProfileCard,
// and the terms_accepted email, so both need to look like part of the same
// app rather than a bare document dump.
export function LegalPageShell({ title, updated, children }: {
  title: string; updated: string; children: React.ReactNode;
}) {
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
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl shadow-card-light dark:shadow-card-dark p-6 sm:p-8 space-y-5">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Last updated: {updated}</p>
          </div>
          <div className="prose-legal text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-4">
            {children}
          </div>
        </div>
        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mt-4">
          <Link href="/terms" className="hover:text-maroon-600 dark:hover:text-maroon-400 underline underline-offset-2">Terms &amp; Conditions</Link>
          {' · '}
          <Link href="/privacy" className="hover:text-maroon-600 dark:hover:text-maroon-400 underline underline-offset-2">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}

// A section heading + body, kept identical between the two pages so neither
// drifts into a different visual rhythm.
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-base font-semibold text-slate-800 dark:text-slate-100 mb-1.5">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
