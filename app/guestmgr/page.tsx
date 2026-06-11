'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { Member, GuestRegistration, Meeting } from '@/lib/types';
import Link from 'next/link';
import Image from 'next/image';

const MEMBER_KEY = 'tm_member_id';

function canManage(m: Member): boolean {
  return m.can_manage_guests || m.is_admin || m.leadership_role === 'president' || m.leadership_role === 'vp_education';
}

function formatDate(dateStr: string) {
  return new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ─── Excel export ─────────────────────────────────────────────────────────────

async function exportToExcel(rows: GuestRegistration[], meetingMap: Map<string, Meeting>, filename: string) {
  const XLSX = await import('xlsx');
  const data = rows.map(g => {
    const meeting = g.meeting_id ? meetingMap.get(g.meeting_id) : null;
    return {
      'Name':              g.name ?? '—',
      'Phone':             g.phone,
      'Email':             g.email,
      'Interest':          g.registration_type === 'inquiry' ? 'General Inquiry' : 'Attend Meeting',
      'Meeting #':         meeting ? String(meeting.number) : '—',
      'Meeting Date':      meeting ? formatDate(meeting.date) : '—',
      'Status':            g.converted_to_member ? 'Converted to TM' : 'Prospect',
      'Converted On':      g.converted_at ? formatDate(g.converted_at) : '—',
      'Registered On':     formatDate(g.created_at),
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Guests');
  // Auto-size columns
  const colWidths = Object.keys(data[0] ?? {}).map(key => ({
    wch: Math.max(key.length, ...data.map(r => String(r[key as keyof typeof r] ?? '').length)) + 2,
  }));
  ws['!cols'] = colWidths;
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ─── Gate screens ──────────────────────────────────────────────────────────────

function GateScreen({ icon, title, body, cta, href, onCta }: {
  icon: string; title: string; body: string; cta: string; href?: string; onCta?: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#020617]">
      <header style={{ background: 'linear-gradient(160deg, #6b0c1e 0%, #9d1530 40%, #0E2D6A 100%)', boxShadow: '0 4px 32px rgba(0,0,0,0.4)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="bg-white rounded-lg px-2 py-1 shadow-sm">
            <Image src="/logo.png" alt="Toastmasters" width={88} height={22} className="h-[22px] w-auto" priority />
          </div>
          <p className="text-[11px] font-bold text-white">Guest Manager</p>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl shadow-card-light dark:shadow-card-dark p-8 w-full max-w-sm text-center space-y-4">
          <div className="text-5xl">{icon}</div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{body}</p>
          {onCta ? (
            <button onClick={onCta} className="block w-full mt-2 bg-gradient-to-r from-maroon-700 to-maroon-600 text-white rounded-xl px-6 py-3 text-sm font-semibold text-center">
              {cta}
            </button>
          ) : (
            <Link href={href!} className="block mt-2 bg-gradient-to-r from-maroon-700 to-maroon-600 text-white rounded-xl px-6 py-3 text-sm font-semibold text-center">
              {cta}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function Stat({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex flex-col items-center py-3 px-2 rounded-xl transition-all border ${
        active
          ? 'bg-maroon-50 dark:bg-maroon-950/30 border-maroon-200 dark:border-maroon-800/60'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
      }`}>
      <span className={`text-xl font-black ${active ? 'text-maroon-700 dark:text-maroon-400' : 'text-slate-700 dark:text-slate-300'}`}>{value}</span>
      <span className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${active ? 'text-maroon-600 dark:text-maroon-500' : 'text-slate-400 dark:text-slate-500'}`}>{label}</span>
    </button>
  );
}

// ─── Guest card ───────────────────────────────────────────────────────────────

function GuestCard({ guest, meeting, onDelete, onToggleConverted }: {
  guest: GuestRegistration;
  meeting: Meeting | null;
  onDelete: () => void;
  onToggleConverted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 transition-all ${
      guest.converted_to_member
        ? 'border-emerald-200 dark:border-emerald-900/50'
        : 'border-slate-200 dark:border-slate-700/60'
    }`}>
      <div className="flex items-start gap-3">
        {/* Avatar placeholder */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
          guest.converted_to_member
            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
            : guest.registration_type === 'inquiry'
            ? 'bg-navy-100 dark:bg-navy-900/40 text-navy-700 dark:text-navy-400'
            : 'bg-maroon-100 dark:bg-maroon-900/40 text-maroon-700 dark:text-maroon-400'
        }`}>
          {guest.name ? guest.name[0].toUpperCase() : '?'}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{guest.name || 'Anonymous'}</p>
            {guest.converted_to_member && (
              <span className="text-[9px] font-black uppercase tracking-wide bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">✓ Joined TM</span>
            )}
            <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
              guest.registration_type === 'inquiry'
                ? 'bg-navy-100 dark:bg-navy-900/40 text-navy-700 dark:text-navy-400'
                : 'bg-maroon-100 dark:bg-maroon-900/40 text-maroon-700 dark:text-maroon-400'
            }`}>
              {guest.registration_type === 'inquiry' ? '💬 Inquiry' : '🎤 Attending'}
            </span>
          </div>

          {/* Contact */}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{guest.phone}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{guest.email}</p>

          {/* Meeting */}
          {meeting && (
            <p className="text-xs text-maroon-600 dark:text-maroon-400 mt-1 font-medium">
              Meeting #{meeting.number} · {formatDate(meeting.date)}
            </p>
          )}

          {/* Dates */}
          <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-1">
            Registered {formatDate(guest.created_at)}
            {guest.converted_at && ` · Converted ${formatDate(guest.converted_at)}`}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        <button
          onClick={onToggleConverted}
          className={`flex-1 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors ${
            guest.converted_to_member
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-950/50'
          }`}>
          {guest.converted_to_member ? 'Undo conversion' : '✓ Mark as joined TM'}
        </button>

        {confirming ? (
          <div className="flex gap-1">
            <button onClick={onDelete} className="text-xs font-semibold bg-red-600 text-white px-3 py-1.5 rounded-lg">Delete</button>
            <button onClick={() => setConfirming(false)} className="text-xs text-slate-400 dark:text-slate-500 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function GuestManagerPanel({ currentMember }: { currentMember: Member }) {
  const supabase = createClient();
  const [guests, setGuests] = useState<GuestRegistration[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'inquiry' | 'converted'>('all');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedExportMeeting, setSelectedExportMeeting] = useState('');

  const fetchAll = useCallback(async () => {
    const [{ data: g }, { data: m }] = await Promise.all([
      supabase.from('guest_registrations').select('*').order('created_at', { ascending: false }),
      supabase.from('meetings').select('id, number, date, theme, meeting_type').order('date'),
    ]);
    if (g) setGuests(g as GuestRegistration[]);
    if (m) setMeetings(m as Meeting[]);
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const meetingMap = new Map(meetings.map(m => [m.id, m]));
  const today = new Date().toISOString().slice(0, 10);
  const upcomingMeetings = meetings.filter(m => m.date >= today);

  async function deleteGuest(id: string) {
    await supabase.from('guest_registrations').delete().eq('id', id);
    setGuests(prev => prev.filter(g => g.id !== id));
  }

  async function toggleConverted(guest: GuestRegistration) {
    const next = !guest.converted_to_member;
    await supabase.from('guest_registrations').update({
      converted_to_member: next,
      converted_at: next ? new Date().toISOString() : null,
    }).eq('id', guest.id);
    setGuests(prev => prev.map(g => g.id === guest.id
      ? { ...g, converted_to_member: next, converted_at: next ? new Date().toISOString() : null }
      : g
    ));
  }

  // Filter logic
  const filtered = guests.filter(g => {
    const meetingDate = g.meeting_id ? meetingMap.get(g.meeting_id)?.date : null;
    if (filter === 'upcoming' && (g.registration_type !== 'attendance' || !meetingDate || meetingDate < today)) return false;
    if (filter === 'inquiry' && g.registration_type !== 'inquiry') return false;
    if (filter === 'converted' && !g.converted_to_member) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (g.name ?? '').toLowerCase().includes(q) || g.phone.includes(q) || g.email.toLowerCase().includes(q);
    }
    return true;
  });

  // Stats
  const totalCount    = guests.length;
  const upcomingCount = guests.filter(g => {
    const d = g.meeting_id ? meetingMap.get(g.meeting_id)?.date : null;
    return g.registration_type === 'attendance' && d && d >= today;
  }).length;
  const inquiryCount   = guests.filter(g => g.registration_type === 'inquiry').length;
  const convertedCount = guests.filter(g => g.converted_to_member).length;

  async function handleExport(type: 'upcoming-meeting' | 'inquiry' | 'all') {
    setExporting(true);
    try {
      let rows: GuestRegistration[];
      let filename: string;
      if (type === 'upcoming-meeting') {
        rows = selectedExportMeeting
          ? guests.filter(g => g.meeting_id === selectedExportMeeting)
          : guests.filter(g => {
              const d = g.meeting_id ? meetingMap.get(g.meeting_id)?.date : null;
              return g.registration_type === 'attendance' && d && d >= today;
            });
        const m = selectedExportMeeting ? meetingMap.get(selectedExportMeeting) : null;
        filename = m ? `guests-meeting-${m.number}` : 'guests-upcoming-meetings';
      } else if (type === 'inquiry') {
        rows = guests.filter(g => g.registration_type === 'inquiry');
        filename = 'guests-inquiries';
      } else {
        rows = guests;
        filename = 'guest-master';
      }
      await exportToExcel(rows, meetingMap, filename);
    } finally {
      setExporting(false);
    }
  }

  const tabs: { id: typeof filter; label: string; count: number }[] = [
    { id: 'all',       label: 'All',      count: totalCount },
    { id: 'upcoming',  label: 'Upcoming', count: upcomingCount },
    { id: 'inquiry',   label: 'Inquiries',count: inquiryCount },
    { id: 'converted', label: 'Joined TM',count: convertedCount },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617]"
      style={{ backgroundImage: 'radial-gradient(ellipse 80% 40% at 50% -5%, rgba(196,30,58,0.06) 0%, transparent 70%)' }}>

      {/* Header */}
      {/* top-9 clears the anthem banner (sticky top-0 z-50 h-9 in layout.tsx) */}
      <header className="sticky top-9 z-40"
        style={{ background: 'linear-gradient(160deg, #6b0c1e 0%, #9d1530 40%, #0E2D6A 100%)', boxShadow: '0 4px 32px rgba(0,0,0,0.4)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="bg-white rounded-lg px-2 py-1 shadow-sm shrink-0">
              <Image src="/logo.png" alt="Toastmasters" width={88} height={22} className="h-[22px] w-auto" priority />
            </Link>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-white leading-tight">Guest Manager</p>
              <p className="text-[11px] font-semibold text-gold-300 leading-tight truncate">TM {currentMember.display_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link href="/" className="text-[11px] font-semibold text-white/60 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-all min-h-[34px] flex items-center">← App</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-12">

        {/* Stats */}
        <div className="flex gap-2">
          {tabs.map(t => (
            <Stat key={t.id} label={t.label} value={t.count} active={filter === t.id} onClick={() => setFilter(t.id)} />
          ))}
        </div>

        {/* Search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone or email…"
          className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm
                     bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100
                     placeholder:text-slate-400 dark:placeholder:text-slate-500
                     focus:outline-none focus:ring-2 focus:ring-maroon-600"
        />

        {/* Export card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">📥 Export to Excel</p>
          <div className="grid grid-cols-1 gap-2">

            {/* Upcoming meeting export */}
            <div className="flex gap-2 items-center">
              <select
                value={selectedExportMeeting}
                onChange={e => setSelectedExportMeeting(e.target.value)}
                className="flex-1 min-w-0 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-maroon-600"
              >
                <option value="">All upcoming meetings</option>
                {upcomingMeetings.map(m => (
                  <option key={m.id} value={m.id}>Meeting #{m.number} · {formatDate(m.date)}</option>
                ))}
              </select>
              <button onClick={() => handleExport('upcoming-meeting')} disabled={exporting}
                className="shrink-0 text-xs font-semibold bg-maroon-50 dark:bg-maroon-950/30 text-maroon-700 dark:text-maroon-400 border border-maroon-200 dark:border-maroon-800/60 px-3 py-2 rounded-lg hover:bg-maroon-100 dark:hover:bg-maroon-950/50 disabled:opacity-40 transition-colors whitespace-nowrap">
                🎤 Attending
              </button>
            </div>

            <div className="flex gap-2">
              <button onClick={() => handleExport('inquiry')} disabled={exporting}
                className="flex-1 text-xs font-semibold bg-navy-50 dark:bg-navy-950/30 text-navy-700 dark:text-navy-400 border border-navy-200 dark:border-navy-800/60 px-3 py-2 rounded-lg hover:bg-navy-100 dark:hover:bg-navy-950/50 disabled:opacity-40 transition-colors">
                💬 Export Inquiries
              </button>
              <button onClick={() => handleExport('all')} disabled={exporting}
                className="flex-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors">
                📋 Complete Master
              </button>
            </div>
          </div>
          {exporting && <p className="text-xs text-slate-400 dark:text-slate-500 text-center">Preparing export…</p>}
        </div>

        {/* Guest list */}
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-slate-200 dark:bg-slate-900/60 rounded-2xl h-28 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-400 dark:text-slate-600 text-sm">No guests found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 dark:text-slate-500">{filtered.length} guest{filtered.length !== 1 ? 's' : ''}</p>
            {filtered.map(g => (
              <GuestCard
                key={g.id}
                guest={g}
                meeting={g.meeting_id ? (meetingMap.get(g.meeting_id) ?? null) : null}
                onDelete={() => deleteGuest(g.id)}
                onToggleConverted={() => toggleConverted(g)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Entry ─────────────────────────────────────────────────────────────────────

export default function GuestManagerPage() {
  const supabase = createClient();
  const [state, setState] = useState<'loading' | 'no-identity' | 'no-access' | 'granted' | 'error'>('loading');
  const [currentMember, setCurrentMember] = useState<Member | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const memberId = localStorage.getItem(MEMBER_KEY);
    if (!memberId || memberId === 'guest') { setState('no-identity'); return; }
    supabase.from('members').select('*').eq('id', memberId).single().then(({ data, error }) => {
      // PGRST116 = no matching row (stale local id) → treat as signed out
      if (error) { setState(error.code === 'PGRST116' ? 'no-identity' : 'error'); return; }
      const m = data as Member;
      setCurrentMember(m);
      setState(canManage(m) ? 'granted' : 'no-access');
    }, () => setState('error'));
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#020617]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-maroon-600 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400 dark:text-slate-500">Opening guest manager…</p>
      </div>
    </div>
  );

  if (state === 'error') return (
    <GateScreen icon="📡" title="Connection problem" body="Couldn't verify your access. Check your internet connection and try again." cta="↻ Try again" onCta={() => { setState('loading'); setAttempt(a => a + 1); }} />
  );

  if (state === 'no-identity') return (
    <GateScreen icon="👤" title="Sign in first" body="Open the main app, sign in to your TM profile, then return here." cta="← Go to main app" href="/" />
  );

  if (state === 'no-access') return (
    <GateScreen icon="🔒" title="Access required" body={`You're signed in as TM ${currentMember?.display_name ?? ''}. Contact an admin to get guest management rights.`} cta="← Back to meetings" href="/" />
  );

  return <GuestManagerPanel currentMember={currentMember!} />;
}
