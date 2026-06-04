'use client';
import { useState, useEffect, useRef } from 'react';
import { useMeetings } from '@/hooks/useMeetings';
import { useIdentity } from '@/hooks/useIdentity';
import { MeetingCard } from '@/components/MeetingCard';
import { MemberPicker } from '@/components/MemberPicker';
import { MemberAdviceModal } from '@/components/MemberAdviceModal';
import { ThemeReminderModal } from '@/components/ThemeReminderModal';
import type { MeetingWithClaims } from '@/lib/types';
import { MemberDashboard } from '@/components/MemberDashboard';
import { SiteFooter } from '@/components/SiteFooter';
import { isMeetingPast, getAdjacentMemberRoles } from '@/lib/utils';
import Link from 'next/link';
import Image from 'next/image';

type Tab = 'next' | 'upcoming' | 'past' | 'profile';

const DISMISS_KEY = (id: string) => `tm_announcement_${id}`;
const ADVICE_KEY  = (id: string) => `tm_advice_${id}`;

export default function Home() {
  const { meetings, members, ballots, announcement, loading, refetch } = useMeetings();
  const { memberId, deviceId, loaded, identify, clearIdentity } = useIdentity();
  const [activeTab, setActiveTab] = useState<Tab>('next');
  const [announceDismissed, setAnnounceDismissed] = useState(true);
  const [showAdvice, setShowAdvice] = useState(false);
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

  // Show rotation-advice modal once per browser session on sign-in.
  useEffect(() => {
    if (!loaded || loading || !currentMember) return;
    if (sessionStorage.getItem(ADVICE_KEY(currentMember.id)) === '1') return;
    setShowAdvice(true);
    sessionStorage.setItem(ADVICE_KEY(currentMember.id), '1');
  }, [loaded, loading, currentMember?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remind TMoD to set a theme if it's missing or still "TBD".
  // Uses a ref (not sessionStorage) so it fires on every page load/refresh.
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

  // When a member signs in, switch to their profile tab so the dashboard is
  // the first thing they see. Reset to 'next' when they sign out.
  useEffect(() => {
    if (currentMember) {
      setActiveTab('profile');
    } else {
      setActiveTab('next');
    }
  }, [currentMember?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect(id: string) {
    if (id !== 'guest') sessionStorage.removeItem(ADVICE_KEY(id));
    themeReminderShown.current = false;
    identify(id);
  }

  const future = meetings.filter((m) => !isMeetingPast(m)).sort((a, b) => a.number - b.number);
  const past   = meetings.filter((m) =>  isMeetingPast(m)).sort((a, b) => b.number - a.number);

  const nextMeeting      = future[0] ?? null;
  const upcomingMeetings = future.slice(1);
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

  return (
    <div className="min-h-screen bg-navy-600">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-maroon-700 shadow-md">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex flex-col items-start justify-center gap-0.5 flex-1 min-w-0 overflow-hidden">
            <div className="bg-white rounded-md px-1.5 py-0.5 shadow-sm shrink-0">
              <Image src="/logo.png" alt="Toastmasters International" width={100} height={24} className="h-6 w-auto" priority />
            </div>
            <p className="text-[10px] font-bold text-white leading-tight w-full truncate">Dehradun Online Toastmasters Club</p>
            <p className="text-[8px] text-white/55 leading-none w-full truncate">No. 03295206 · Area 03 · Division I · District 41</p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {currentMember && (
              <span className="text-xs font-semibold text-yellow-200 truncate max-w-[80px]">
                {currentMember.display_name}
              </span>
            )}
            {isGuest && (
              <span className="text-xs text-white/40 truncate max-w-[60px]">Guest</span>
            )}
            {loaded && (
              <button
                onClick={clearIdentity}
                className="text-xs text-white/60 hover:text-white tap-target px-2 py-1 transition-colors"
              >
                {memberId ? 'Switch' : 'Sign in'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Announcement banner ── */}
      {announcement && !announceDismissed && (
        <div style={{ backgroundColor: '#A9B2B1', borderBottom: '1px solid #96a09f' }}>
          <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-start gap-3">
            <span className="text-stone-900 text-sm leading-relaxed flex-1">{announcement.message}</span>
            <button
              onClick={dismissAnnouncement}
              className="shrink-0 text-stone-600 hover:text-stone-900 text-lg leading-none tap-target px-1"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="sticky top-16 z-30 bg-navy-700 border-b border-white/5 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-2">
          <div className="flex gap-1 bg-white/10 rounded-xl p-1">
            {currentMember && (
              <button
                onClick={() => setActiveTab('profile')}
                className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'profile'
                    ? 'bg-white text-navy-700 shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                My Profile
              </button>
            )}
            {(['next', 'upcoming', 'past'] as const).map((id) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === id
                    ? 'bg-white text-navy-700 shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {id === 'next' ? nextTabLabel : id === 'upcoming' ? 'Future' : 'Past'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {(() => {
          // 'profile' tab is only valid while a member is signed in.
          // Fall back to 'next' during the sign-out transition to avoid
          // meetingTabContent['profile'] being undefined.
          const meetingTab: 'next' | 'upcoming' | 'past' =
            activeTab === 'profile' ? 'next' : activeTab;

          if (activeTab === 'profile' && currentMember) {
            return (
              <MemberDashboard
                member={currentMember}
                allMembers={members}
                meetings={meetings}
                onUpdated={refetch}
              />
            );
          }

          if (loading) {
            return (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white/10 rounded-2xl h-64 animate-pulse" />
                ))}
              </div>
            );
          }

          if (meetingTabContent[meetingTab].length === 0) {
            return (
              <div className="text-center py-16 space-y-2">
                <p className="text-white/40">{emptyState[meetingTab].text}</p>
                {emptyState[meetingTab].cta && (
                  <Link href="/amiadmin" className="text-sm text-yellow-200 inline-block">
                    {emptyState[meetingTab].cta}
                  </Link>
                )}
              </div>
            );
          }

          return (
            <div className="space-y-4">
              {meetingTabContent[meetingTab].map((m) => (
                <MeetingCard
                  key={m.id}
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
                  onChanged={refetch}
                />
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
          onSelect={handleSelect}
          onGuest={handleGuest}
        />
      )}

      {showAdvice && currentMember && (
        <MemberAdviceModal
          member={currentMember}
          meetings={meetings}
          onClose={() => setShowAdvice(false)}
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
