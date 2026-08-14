'use client';
import { useState, useEffect, useRef } from 'react';
import { useMeetings } from '@/hooks/useMeetings';
import { useIdentity } from '@/hooks/useIdentity';
import { MeetingCard } from '@/components/MeetingCard';
import { MemberPicker } from '@/components/MemberPicker';
import { TmodReminderModal } from '@/components/TmodReminderModal';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { MeetingWithClaims, Member, ParticipationMode } from '@/lib/types';
import { isClubOfficer, hasLeadershipRole, participationMode as readParticipationMode, WIC_CLUB_NAME } from '@/lib/types';
import { MemberDashboard } from '@/components/MemberDashboard';
import { SiteFooter } from '@/components/SiteFooter';
import { isMeetingPast, getAdjacentMemberRoles, DEFAULT_AGENDA_CONFIG, DEFAULT_RESERVATION_DAYS_BEFORE, DEFAULT_OFFLINE_RESERVATION_DAYS_BEFORE } from '@/lib/utils';
import { useCapture } from '@/lib/capture';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import Image from 'next/image';

type Tab = 'next' | 'past' | 'profile';

const DISMISS_KEY = (id: string) => `tm_announcement_${id}`;

// Shown on the Next Meeting tab when nothing is on the calendar yet. Names the
// President and VP Education so a member with a role in mind knows exactly who
// to ask, rather than being left at a dead end.
function NoNextMeeting({ members, isAdmin }: { members: Member[]; isAdmin: boolean }) {
  const president = members.find((m) => hasLeadershipRole(m, 'president'));
  const vpEd      = members.find((m) => hasLeadershipRole(m, 'vp_education'));

  const officer = (m: Member | undefined, role: string) =>
    m ? <><strong className="text-slate-700 dark:text-slate-200">TM {m.display_name}</strong> ({role})</> : null;
  const names = [officer(president, 'Club President'), officer(vpEd, 'VP Education')].filter(Boolean);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900
                    shadow-card-light dark:shadow-card-dark px-6 py-10 text-center space-y-4">
      <div className="text-4xl">🗓️</div>
      <p className="text-base font-semibold text-slate-800 dark:text-slate-100 font-serif">
        Our next meeting will be scheduled soon.
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
        If you&apos;ve added your email address to this app and left notifications switched on,
        we&apos;ll let you know the moment the next meeting is created.
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
        {names.length > 0 ? (
          <>
            Think it should have been created by now, or want to reserve a role in advance? Do reach
            out to {names[0]}{names.length > 1 && <> or {names[1]}</>} — they&apos;ll be glad to help.
          </>
        ) : (
          <>
            Think it should have been created by now, or want to reserve a role in advance? Do reach
            out to your Club President or VP Education — they&apos;ll be glad to help.
          </>
        )}
      </p>
      {isAdmin && (
        <Link href="/amiadmin"
          className="inline-block text-sm font-semibold text-maroon-600 dark:text-maroon-400 hover:underline pt-1">
          Schedule one in Admin →
        </Link>
      )}
    </div>
  );
}

export default function Home() {
  const { meetings, members, ballots, announcement, loading, refetch } = useMeetings();
  const { memberId, deviceId, loaded, identify, clearIdentity } = useIdentity();

  // App-usage tracking: record device/IP/browser once identity has loaded.
  useCapture(memberId, loaded);
  const [activeTab, setActiveTab] = useState<Tab>('next');
  const [lockBeforeMins, setLockBeforeMins] = useState(DEFAULT_AGENDA_CONFIG.lockBeforeMins);
  const [maxSpeakerSlots, setMaxSpeakerSlots] = useState(DEFAULT_AGENDA_CONFIG.maxSpeakerSlots);

  const [reservation, setReservation] = useState({ enabled: false, daysBefore: DEFAULT_RESERVATION_DAYS_BEFORE });
  const [offlineReservation, setOfflineReservation] = useState({ enabled: false, daysBefore: DEFAULT_OFFLINE_RESERVATION_DAYS_BEFORE });
  const [participationMode, setParticipationMode] = useState<ParticipationMode>('online');

  useEffect(() => {
    createClient()
      .from('agenda_config')
      .select('lock_before_mins, max_speaker_slots')
      .single()
      .then(({ data }) => {
        if (data?.lock_before_mins) setLockBeforeMins(data.lock_before_mins);
        if (data?.max_speaker_slots) setMaxSpeakerSlots(data.max_speaker_slots);
      });
    // Reservation settings are read on their own so a not-yet-migrated column
    // can't take the lock/slot settings down with it (feature stays off).
    createClient()
      .from('agenda_config')
      .select('online_reservation_enabled, online_reservation_days_before')
      .single()
      .then(({ data }) => {
        if (!data) return;
        setReservation({
          enabled: data.online_reservation_enabled === true,
          daysBefore: data.online_reservation_days_before ?? DEFAULT_RESERVATION_DAYS_BEFORE,
        });
      });
    // Likewise for the WIC India window — its own read, so a club that hasn't
    // run migration 052 yet simply sees the gate switched off.
    createClient()
      .from('agenda_config')
      .select('offline_reservation_enabled, offline_reservation_days_before')
      .single()
      .then(({ data }) => {
        if (!data) return;
        setOfflineReservation({
          enabled: data.offline_reservation_enabled === true,
          daysBefore: data.offline_reservation_days_before ?? DEFAULT_OFFLINE_RESERVATION_DAYS_BEFORE,
        });
      });
  }, []);
  const [announceDismissed, setAnnounceDismissed] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tmodReminder, setTmodReminder] = useState<
    { meeting: MeetingWithClaims; needs: { theme: boolean; link: boolean } } | null
  >(null);
  const tmodReminderShown = useRef(false);

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

  // Read separately from the members list (which doesn't select this column) so
  // a missing migration degrades to the default rather than breaking sign-in.
  useEffect(() => {
    if (!currentMember) { setParticipationMode('online'); return; }
    createClient()
      .from('members').select('participation_mode').eq('id', currentMember.id).maybeSingle()
      .then(({ data }) => setParticipationMode(readParticipationMode(data ?? {})));
  }, [currentMember?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // What a TMoD still owes the club on their earliest upcoming meeting: the
  // theme, the join link, or both. Shown once per sign-in — `handleSelect`
  // clears the ref, so signing in again asks again until it's done.
  //
  // Runs off `meetings`, which refetches after every claim, so claiming TMoD
  // pops the same prompt immediately rather than waiting for the next login.
  useEffect(() => {
    if (!loaded || loading || !currentMember || meetings.length === 0) return;
    if (tmodReminderShown.current) return;
    const upcoming = meetings
      .filter((m) => !isMeetingPast(m))
      .sort((a, b) => a.number - b.number);
    for (const meeting of upcoming) {
      const isTMoD = meeting.role_claims.some(
        (c) => c.role_key === 'tmod' && c.member_id === currentMember.id
      );
      if (!isTMoD) continue;
      const theme = (meeting.theme ?? '').trim().toLowerCase();
      const needs = { theme: !theme || theme === 'tbd', link: !meeting.meeting_link?.trim() };
      if (!needs.theme && !needs.link) continue;
      tmodReminderShown.current = true;
      setTmodReminder({ meeting, needs });
      return;
    }
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
    tmodReminderShown.current = false;
    identify(id);
  }

  const future = meetings.filter((m) => !isMeetingPast(m)).sort((a, b) => a.number - b.number);
  const past   = meetings.filter((m) =>  isMeetingPast(m)).sort((a, b) => b.number - a.number);

  const nextMeeting      = future[0] ?? null;
  const nextBallotStatus = nextMeeting ? (ballots.get(nextMeeting.id)?.status ?? null) : null;
  const nextTabLabel     = nextBallotStatus === 'open' ? 'Current Meeting' : 'Next Meeting';

  const meetingTabContent: Record<'next' | 'past', typeof meetings> = {
    next:     nextMeeting ? [nextMeeting] : [],
    past,
  };

  const emptyState: Record<'next' | 'past', { text: string; cta?: string }> = {
    next:     { text: 'No upcoming meeting scheduled.', cta: 'Schedule one in Admin →' },
    past:     { text: 'No past meetings yet.' },
  };

  const showPicker = loaded && !memberId && members.length > 0;
  function handleGuest() { identify('guest'); }

  const tabs = [
    ...(currentMember ? [{ id: 'profile' as Tab, label: 'My Profile' }] : []),
    { id: 'next' as Tab, label: nextTabLabel },
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
                  Club number: 28680307 · District 224
                </p>
              )}
            </div>
          </div>

          {/* Right: auth + theme. Signed-in members get a single labelled
              account menu so the buttons don't crowd out the welcome line and
              every action reads clearly (title tooltips don't show on touch). */}
          <div className="flex items-center gap-1 shrink-0">
            {isGuest && (
              <span className="text-[10px] text-white/40 mr-0.5">Guest</span>
            )}

            {currentMember ? (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="Account menu"
                  aria-expanded={menuOpen}
                  className="flex items-center gap-1 bg-white/10 hover:bg-white/20
                             rounded-lg pl-1 pr-1.5 py-1 transition-all min-h-[34px]"
                >
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/25 text-white text-[11px] font-bold">
                    {currentMember.display_name.trim().charAt(0).toUpperCase()}
                  </span>
                  <svg viewBox="0 0 20 20" className={`w-3.5 h-3.5 fill-white/70 transition-transform ${menuOpen ? 'rotate-180' : ''}`}>
                    <path d="M5.5 7.5L10 12l4.5-4.5z" />
                  </svg>
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 w-52 rounded-xl overflow-hidden
                                    bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700
                                    shadow-xl text-slate-700 dark:text-slate-200">
                      <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Signed in as</p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          TM {currentMember.display_name}
                        </p>
                      </div>
                      <Link href="/timer" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <span aria-hidden>⏱️</span> Speech Timer
                      </Link>
                      {(currentMember.can_manage_guests || currentMember.is_admin || isClubOfficer(currentMember)) && (
                        <Link href="/guestmgr" onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                          <span aria-hidden>👥</span> Manage Guests
                        </Link>
                      )}
                      {(currentMember.is_admin || isClubOfficer(currentMember)) && (
                        <Link href="/amiadmin" onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                          <span aria-hidden>⚙️</span> Admin Panel
                        </Link>
                      )}
                      <button
                        onClick={() => { setMenuOpen(false); clearIdentity(); }}
                        className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 text-sm
                                   border-t border-slate-100 dark:border-slate-800
                                   hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <span aria-hidden>⇄</span> Switch user
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              loaded && (
                <button
                  onClick={clearIdentity}
                  className="text-[11px] font-semibold text-white/70 hover:text-white
                             bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg
                             transition-all min-h-[34px]"
                >
                  {memberId ? 'Switch' : 'Sign in'}
                </button>
              )
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Visiting-club banner ── */}
      {/* WIC India members share this app with the home club, so say plainly
          which club they're signed in as — everything else looks identical. */}
      {currentMember && participationMode === 'offline' && (
        <div className="bg-violet-50 dark:bg-violet-950/40 border-b border-violet-200 dark:border-violet-800/40">
          <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-2.5">
            <span className="text-base leading-none shrink-0">🤝</span>
            <p className="text-xs text-violet-800 dark:text-violet-300 leading-relaxed">
              You&apos;re signed in as a member of <strong>{WIC_CLUB_NAME}</strong>.
            </p>
          </div>
        </div>
      )}

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
        {/* Speech Timer — open to everyone, handy during meetings */}
        <Link href="/timer"
          className="group flex items-center gap-3 mb-4 rounded-2xl border border-maroon-200 dark:border-maroon-800/50
                     bg-gradient-to-r from-maroon-50 to-white dark:from-maroon-950/40 dark:to-slate-900
                     px-4 py-3 shadow-card-light dark:shadow-card-dark active:scale-[0.99] transition-all">
          <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl bg-maroon-600 text-white text-xl">⏱️</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Speech Timer</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">Green/yellow/red timing for speeches, Table Topics &amp; evaluations</span>
          </span>
          <svg viewBox="0 0 20 20" className="w-4 h-4 shrink-0 fill-maroon-500 group-hover:translate-x-0.5 transition-transform">
            <path d="M7.5 5.5L12 10l-4.5 4.5z" />
          </svg>
        </Link>
        {(() => {
          const meetingTab: 'next' | 'past' =
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

          // Nothing on the calendar yet: say so warmly, and point at the two
          // officers who can actually do something about it.
          if (meetingTab === 'next' && meetingTabContent.next.length === 0) {
            return <NoNextMeeting members={members} isAdmin={currentMember?.is_admin === true} />;
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
                    isAdmin={currentMember?.is_admin === true}
                    hideWhatsApp={meetingTab !== 'next'}
                    lockBeforeMins={lockBeforeMins}
                    maxSpeakerSlots={maxSpeakerSlots}
                    reservationEnabled={reservation.enabled}
                    reservationDaysBefore={reservation.daysBefore}
                    offlineReservationEnabled={offlineReservation.enabled}
                    offlineReservationDaysBefore={offlineReservation.daysBefore}
                    participationMode={participationMode}
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



      {tmodReminder && (
        <TmodReminderModal
          meeting={tmodReminder.meeting}
          needs={tmodReminder.needs}
          onSaved={() => { setTmodReminder(null); refetch(); }}
          onLater={() => setTmodReminder(null)}
        />
      )}
    </div>
  );
}
