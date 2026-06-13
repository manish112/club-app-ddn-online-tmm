'use client';
import { useState, useEffect, useRef } from 'react';
import { useMeetings } from '@/hooks/useMeetings';
import { useIdentity } from '@/hooks/useIdentity';
import { MeetingCard } from '@/components/MeetingCard';
import { MemberPicker } from '@/components/MemberPicker';
import { ThemeReminderModal } from '@/components/ThemeReminderModal';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { MeetingWithClaims } from '@/lib/types';
import { MemberDashboard } from '@/components/MemberDashboard';
import { SiteFooter } from '@/components/SiteFooter';
import { isMeetingPast, getAdjacentMemberRoles, DEFAULT_AGENDA_CONFIG } from '@/lib/utils';
import { useCapture } from '@/lib/capture';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import Image from 'next/image';

type Tab = 'next' | 'upcoming' | 'past' | 'profile';

const DISMISS_KEY = (id: string) => `tm_announcement_${id}`;

export default function Home() {
  const { meetings, members, ballots, announcement, loading, refetch } = useMeetings();
  const { memberId, deviceId, loaded, identify, clearIdentity } = useIdentity();

  // App-usage tracking: record device/IP/browser once identity has loaded.
  useCapture(memberId, loaded);
  const [activeTab, setActiveTab] = useState<Tab>('next');
  const [lockBeforeMins, setLockBeforeMins] = useState(DEFAULT_AGENDA_CONFIG.lockBeforeMins);

  useEffect(() => {
    createClient()
      .from('agenda_config')
      .select('lock_before_mins')
      .single()
      .then(({ data }) => {
        if (data?.lock_before_mins) setLockBeforeMins(data.lock_before_mins);
      });
  }, []);
  const [announceDismissed, setAnnounceDismissed] = useState(true);
  const [themeReminderMeeting, setThemeReminderMeeting] = useState<MeetingWithClaims | null>(null);
  const themeReminderShown = useRef(false);

  useEffect(() => {
    if (!announcement) { setAnnounceDismissed(true); return; }
    setAnnounceDismissed(localStorage.getItem(DISMISS_KEY(announcement.id)) === '1');
  }, [announcement?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function dismissAnnouncement() {
    if (!announcement) return;
    localStorage.setItem(DISMISS_KEY(announcement.id), '1');
    setAnnounceDismissed(true);
  }

  const isGuest = memberId === 'guest';
  const currentMember = isGuest ? null : members.find((m) => m.id === memberId);

  useEffect(() => {
    if (!loaded || loading || !currentMember || meetings.length === 0) return;
    if (themeReminderShown.current) return;
    const needsTheme = meetings
      .filter((m) => !isMeetingPast(m))
      .sort((a, b) => a.number - b.number)
      .find((m) => {
        const isTMoD = m.role_claims.some(
          (c) => c.role_key === 'tmod' && c.member_id === currentMember.id
        );
        if (!isTMoD) return false;
        const t = (m.theme ?? '').trim().toLowerCase();
        return !t || t === 'tbd';
      });
    if (!needsTheme) return;
    themeReminderShown.current = true;
    setThemeReminderMeeting(needsTheme);
  }, [loaded, loading, currentMember?.id, meetings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentMember) {
      setActiveTab('profile');
    } else {
      setActiveTab('next');
    }
  }, [currentMember?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync theme from DB when member signs in
  useEffect(() => {
    if (!currentMember?.theme_preference) return;
    const isDark = document.documentElement.classList.contains('dark');
    const preferred = currentMember.theme_preference === 'dark';
    if (preferred !== isDark) {
      document.documentElement.classList.toggle('dark', preferred);
      localStorage.setItem('theme', currentMember.theme_preference);
    }
  }, [currentMember?.id, currentMember?.theme_preference]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect(id: string) {
    themeReminderShown.current = false;
    identify(id);
  }

  const future = meetings.filter((m) => !isMeetingPast(m)).sort((a, b) => a.number - b.number);
  const past   = meetings.filter((m) =>  isMeetingPast(m)).sort((a, b) => b.number - a.number);

  const nextMeeting      = future[0] ?? null;
  const upcomingMeetings = future.slice(1, 3);
  const nextBallotStatus = nextMeeting ? (ballots.get(nextMeeting.id)?.status ?? null) : null;
  const nextTabLabel     = nextBallotStatus === 'open' ? 'Current Meeting' : 'Next Meeting';

  const meetingTabContent: Record<'next' | 'upcoming' | 'past', typeof meetings> = {
    next:     nextMeeting ? [nextMeeting] : [],
    upcoming: upcomingMeetings,
    past,
  };

  const emptyState: Record<'next' | 'upcoming' | 'past', { text: string; cta?: string }> = {
    next:     { text: 'No upcoming meeting scheduled.', cta: 'Schedule one in Admin →' },
    upcoming: { text: 'No future meetings scheduled yet.', cta: 'Add meetings in Admin →' },
    past:     { text: 'No past meetings yet.' },
  };

  const showPicker = loaded && !memberId && members.length > 0;
  function handleGuest() { identify('guest'); }

  const tabs = [
    ...(currentMember ? [{ id: 'profile' as Tab, label: 'My Profile' }] : []),
    { id: 'next' as Tab, label: nextTabLabel },
    { id: 'upcoming' as Tab, label: 'Future Meetings' },
    { id: 'past' as Tab, label: 'Past Meetings' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">

      {/* ── Header ── */}
      <header className="sticky top-9 z-40"
        style={{
          background: 'linear-gradient(160deg, #6b0c1e 0%, #9d1530 40%, #0E2D6A 100%)',
          boxShadow: '0 4px 32px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.07) inset',
        }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Left: logo + club info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-white rounded-lg px-2 py-1 shadow-sm shrink-0">
              <Image src="/logo.png" alt="Toastmasters International" width={88} height={22} className="h-[22px] w-auto" priority />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-white leading-tight truncate">
                Dehradun Online Toastmasters
              </p>
              {currentMember ? (
                <p className="text-[11px] font-semibold text-gold-300 leading-tight truncate">
                  Welcome, TM {currentMember.display_name} 👋
                </p>
              ) : (
                <p className="text-[9px] text-white/50 leading-tight truncate">
                  Club 03295206 · District 41
                </p>
              )}
            </div>
          </div>

          {/* Right: auth + theme */}
          <div className="flex items-center gap-1 shrink-0">
            {isGuest && (
              <span className="text-[10px] text-white/40 mr-1">Guest</span>
            )}
            {currentMember && (currentMember.can_manage_guests || currentMember.is_admin || currentMember.leadership_role === 'president' || currentMember.leadership_role === 'vp_education') && (
              <Link href="/guestmgr"
                className="text-[11px] font-semibold text-white/70 hover:text-white
                           bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg
                           transition-all min-h-[34px] flex items-center">
                Guests
              </Link>
            )}
            {currentMember && (currentMember.is_admin || currentMember.leadership_role === 'president' || currentMember.leadership_role === 'vp_education') && (
              <Link href="/amiadmin"
                className="text-[11px] font-semibold text-gold-300 hover:text-gold-200
                           bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg
                           transition-all min-h-[34px] flex items-center">
                Admin
              </Link>
            )}
            {loaded && (
              <button
                onClick={clearIdentity}
                className="text-[11px] font-semibold text-white/70 hover:text-white
                           bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg
                           transition-all min-h-[34px]"
              >
                {memberId ? 'Switch' : 'Sign in'}
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Announcement banner ── */}
      {announcement && !announceDismissed && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/40">
          <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-start gap-3">
            <span className="text-stone-800 dark:text-amber-200 text-sm leading-relaxed flex-1">
              {announcement.message}
            </span>
            <button
              onClick={dismissAnnouncement}
              className="shrink-0 text-stone-500 dark:text-amber-400 hover:text-stone-800 dark:hover:text-amber-200 text-lg leading-none min-h-[36px] min-w-[36px] flex items-center justify-center"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="sticky top-[88px] z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`relative flex-1 py-3 text-xs font-bold tracking-wide transition-all ${
                  activeTab === id
                    ? 'text-maroon-700 dark:text-maroon-400'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {label}
                {activeTab === id && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-maroon-600 dark:bg-maroon-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {(() => {
          const meetingTab: 'next' | 'upcoming' | 'past' =
            activeTab === 'profile' ? 'next' : activeTab;

          if (activeTab === 'profile' && currentMember) {
            return (
              <div className="card-enter">
                <MemberDashboard
                  member={currentMember}
                  allMembers={members}
                  meetings={meetings}
                  onUpdated={refetch}
                />
              </div>
            );
          }

          if (loading) {
            return (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-slate-200 dark:bg-slate-800 rounded-2xl h-64 animate-pulse" />
                ))}
              </div>
            );
          }

          if (meetingTabContent[meetingTab].length === 0) {
            return (
              <div className="text-center py-16 space-y-2">
                <p className="text-slate-400 dark:text-slate-500">{emptyState[meetingTab].text}</p>
                {emptyState[meetingTab].cta && (
                  <Link href="/amiadmin" className="text-sm text-maroon-600 dark:text-maroon-400 inline-block">
                    {emptyState[meetingTab].cta}
                  </Link>
                )}
              </div>
            );
          }

          return (
            <div className="space-y-4">
              {meetingTabContent[meetingTab].map((m, i) => (
                <div
                  key={m.id}
                  className="card-enter"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <MeetingCard
                    meeting={m}
                    allMembers={members}
                    memberId={memberId}
                    memberAdjacentRoles={
                      currentMember ? getAdjacentMemberRoles(meetings, m.id, currentMember.id) : []
                    }
                    deviceId={deviceId}
                    ballot={ballots.get(m.id)}
                    isAdmin={false}
                    hideWhatsApp={meetingTab !== 'next'}
                    lockBeforeMins={lockBeforeMins}
                    onChanged={refetch}
                  />
                </div>
              ))}
            </div>
          );
        })()}
      </main>

      <SiteFooter members={members} />

      {showPicker && (
        <MemberPicker
          members={members}
          meetingId={nextMeeting?.id ?? null}
          upcomingMeetings={future}
          onSelect={handleSelect}
          onGuest={handleGuest}
        />
      )}



      {themeReminderMeeting && (
        <ThemeReminderModal
          meeting={themeReminderMeeting}
          onSaved={() => { setThemeReminderMeeting(null); refetch(); }}
          onLater={() => setThemeReminderMeeting(null)}
        />
      )}
    </div>
  );
}
