'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { MeetingCard } from '@/components/MeetingCard';
import { EmailSettingsPanel } from '@/components/EmailSettingsPanel';
import { WhatsAppSettingsPanel } from '@/components/WhatsAppSettingsPanel';
import { normalizePhone, isEmailAddress } from '@/lib/phone';
import { AdminSurveysPanel } from '@/components/AdminSurveysPanel';
import { SiteFooter } from '@/components/SiteFooter';
import { ThemeToggle } from '@/components/ThemeToggle';
import type {
  Member, MeetingWithClaims, MeetingType, Ballot,
  VoteResult, TTSpeaker, GuestRegistration, Announcement, LeadershipRole, SpeakerSlotRequest,
  EvaluatorRequest, DeviceCapture, RoleKey, SpeakerGroup, ParticipationMode, RoleInterestRequest,
} from '@/lib/types';
import { LEADERSHIP_ROLES, PARTICIPATION_MODES, ROLE_META, HOME_CLUB_NAME, WIC_CLUB_NAME, WIC_CLUB_SHORT, getMeetingRoles, memberLeadershipRoles, hasLeadershipRole, isClubOfficer, participationMode } from '@/lib/types';
import {
  DEFAULT_TIMER_MODES, TIMER_MODE_META, normalizeModes,
  type TimerModes, type TimerModeKey, type TimerThresholds,
} from '@/lib/timer';

// Role categories an admin can switch off for a meeting, in display order.
const TOGGLEABLE_ROLES: { key: RoleKey; label: string }[] = [
  { key: 'speaker',    label: 'Prepared Speeches' },
  { key: 'evaluator',  label: 'Evaluators' },
  { key: 'ttm',        label: 'Table Topics' },
  { key: 'ge',         label: 'General Evaluator' },
  { key: 'tmod',       label: 'TMoD' },
  { key: 'grammarian', label: 'Grammarian' },
  { key: 'ah_counter', label: 'Ah-Counter' },
  { key: 'timer',      label: 'Timer' },
  { key: 'harkmaster', label: 'Harkmaster' },
];
import { isMeetingPast, formatMeetingDate, formatTime, roleClaimBlocked, roleReservation, offlineClaimWindow, DEFAULT_RESERVATION_DAYS_BEFORE, DEFAULT_OFFLINE_RESERVATION_DAYS_BEFORE } from '@/lib/utils';
import Link from 'next/link';
import Image from 'next/image';

const MEMBER_KEY = 'tm_member_id';

function isAdminMember(m: Member): boolean {
  return m.is_admin || isClubOfficer(m);
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const inputCls = 'w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-maroon-600';
const selectCls = 'border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-maroon-600';
const cardCls = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl shadow-card-light dark:shadow-card-dark';
const labelCls = 'text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block';
const primaryBtn = 'bg-gradient-to-r from-maroon-700 to-maroon-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold active:scale-95 transition-all disabled:opacity-40';
const ghostBtn = 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40';

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
          <div>
            <p className="text-[11px] font-bold text-white leading-tight">Admin Panel</p>
            <p className="text-[9px] text-white/50">Dehradun Online Toastmasters</p>
          </div>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className={`${cardCls} p-8 w-full max-w-sm text-center space-y-4`}>
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

// ─── 12-hour time picker ──────────────────────────────────────────────────────

function to12h(t: string) {
  const [h, m] = t.split(':').map(Number);
  return { hour: h % 12 === 0 ? '12' : String(h % 12), minute: String(m).padStart(2, '0'), period: h < 12 ? 'AM' : 'PM' } as const;
}
function from12h(hour: string, minute: string, period: string) {
  let h = parseInt(hour);
  if (period === 'AM' && h === 12) h = 0;
  if (period === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${minute}`;
}
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { hour, minute, period } = to12h(value);
  const u = (h: string, m: string, p: string) => onChange(from12h(h, m, p));
  return (
    <div className="mt-1 flex gap-1">
      <select value={hour}   onChange={e => u(e.target.value, minute, period)} className={selectCls}>{HOURS.map(h => <option key={h} value={h}>{h}</option>)}</select>
      <select value={minute} onChange={e => u(hour, e.target.value, period)}   className={selectCls}>{MINUTES.map(m => <option key={m} value={m}>{m}</option>)}</select>
      <select value={period} onChange={e => u(hour, minute, e.target.value)}   className={selectCls}><option>AM</option><option>PM</option></select>
    </div>
  );
}

// ─── Schedule helpers ─────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function nextWeekdayAfter(from: Date, weekday: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d;
}

// Format a Date as YYYY-MM-DD from its LOCAL components. `nextWeekdayAfter`
// matches the weekday in local time, so we must read the date back in local
// time too — `toISOString()` converts to UTC and, in a timezone ahead of UTC
// (e.g. IST), rolls the date back a day (Jul 29 → Jul 28).
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface ScheduleConfig { weekday: number; startTime: string; endTime: string }

// ─── Meeting form ──────────────────────────────────────────────────────────────

interface MeetingFormData {
  number: string; date: string; start_time: string; end_time: string;
  theme: string; meeting_link: string; meeting_type: MeetingType; speaker_slots: string; evaluator_slots: string;
  disabled_roles: RoleKey[];
  jury_slots: string;
  speaker_groups: SpeakerGroup[];
  pair_groups: Record<string, string>;
  is_special_session: boolean;
  special_session_note: string;
}
const EMPTY_FORM: MeetingFormData = { number: '', date: '', start_time: '19:30', end_time: '21:00', theme: '', meeting_link: '', meeting_type: 'regular', speaker_slots: '1', evaluator_slots: '1', disabled_roles: [], jury_slots: '0', speaker_groups: [], pair_groups: {}, is_special_session: false, special_session_note: '' };

const newGroupId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function MeetingForm({ initial, onSave, onCancel }: { initial?: Partial<MeetingFormData & { id: string }>; onSave: () => void; onCancel: () => void }) {
  const supabase = createClient();
  const [form, setForm] = useState<MeetingFormData>({
    ...EMPTY_FORM, ...initial,
    start_time: initial?.start_time?.slice(0, 5) ?? '19:30',
    end_time: initial?.end_time?.slice(0, 5) ?? '21:00',
    speaker_slots: String(initial?.speaker_slots ?? 1),
    evaluator_slots: String(initial?.evaluator_slots ?? 1),
    disabled_roles: initial?.disabled_roles ?? [],
    jury_slots: String(initial?.jury_slots ?? 0),
    speaker_groups: initial?.speaker_groups ?? [],
    pair_groups: initial?.pair_groups ?? {},
    meeting_link: initial?.meeting_link ?? '',
    is_special_session: initial?.is_special_session ?? false,
    special_session_note: initial?.special_session_note ?? '',
  });
  const [saving, setSaving] = useState(false);

  // For a brand-new meeting, seed the role mix from the club-wide default.
  useEffect(() => {
    if (initial?.id) return;
    supabase.from('agenda_config').select('default_disabled_roles').single().then(({ data }) => {
      const defaults = (data?.default_disabled_roles ?? []) as RoleKey[];
      if (defaults.length) setForm(f => ({ ...f, disabled_roles: defaults }));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function set(field: keyof MeetingFormData, value: string) {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (field === 'speaker_slots') next.evaluator_slots = value;
      return next;
    });
  }

  function toggleRole(key: RoleKey) {
    setForm(f => ({
      ...f,
      disabled_roles: f.disabled_roles.includes(key)
        ? f.disabled_roles.filter(k => k !== key)
        : [...f.disabled_roles, key],
    }));
  }

  // Quick presets that set the disabled-role mix (and sensible slot counts).
  function applyPreset(preset: 'regular' | 'speakathon' | 'table_topics') {
    setForm(f => {
      if (preset === 'speakathon') return {
        ...f, disabled_roles: ['ttm'], speaker_slots: '4', evaluator_slots: '4',
        jury_slots: f.jury_slots === '0' ? '3' : f.jury_slots,
        speaker_groups: f.speaker_groups.length ? f.speaker_groups : [
          { id: newGroupId(), name: 'Group A' },
          { id: newGroupId(), name: 'Group B' },
        ],
      };
      if (preset === 'table_topics') return { ...f, disabled_roles: ['speaker', 'evaluator'], jury_slots: '0', speaker_groups: [], pair_groups: {} };
      return { ...f, disabled_roles: [], jury_slots: '0', speaker_groups: [], pair_groups: {} };
    });
  }

  function addGroup() {
    setForm(f => ({ ...f, speaker_groups: [...f.speaker_groups, { id: newGroupId(), name: `Group ${String.fromCharCode(65 + f.speaker_groups.length)}` }] }));
  }
  function renameGroup(id: string, name: string) {
    setForm(f => ({ ...f, speaker_groups: f.speaker_groups.map(g => g.id === id ? { ...g, name } : g) }));
  }
  function removeGroup(id: string) {
    setForm(f => ({
      ...f,
      speaker_groups: f.speaker_groups.filter(g => g.id !== id),
      // Drop any pair assignments pointing at the removed group.
      pair_groups: Object.fromEntries(Object.entries(f.pair_groups).filter(([, gid]) => gid !== id)),
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const disabled = form.disabled_roles;
    // Keep the legacy meeting_type label in sync: a Speakathon = Table Topics off
    // while prepared speeches stay on.
    const meeting_type: MeetingType = disabled.includes('ttm') && !disabled.includes('speaker') ? 'speakathon' : 'regular';
    const speakerSlots = parseInt(form.speaker_slots);
    // Prune pair→group entries whose group was removed or whose slot no longer exists.
    const validGroupIds = new Set(form.speaker_groups.map(g => g.id));
    const pair_groups = Object.fromEntries(
      Object.entries(form.pair_groups).filter(([slot, gid]) =>
        validGroupIds.has(gid) && Number(slot) >= 1 && Number(slot) <= speakerSlots)
    );
    // The form's slot count is the *base* (admin minimum). Extra slots granted via
    // member requests sit on top and must not be baked into the base here.
    const payload = { number: parseInt(form.number), date: form.date, start_time: form.start_time + ':00', end_time: form.end_time + ':00', theme: form.theme.trim() || 'TBD', meeting_link: form.meeting_link.trim() || null, meeting_type, speaker_slots: speakerSlots, evaluator_slots: parseInt(form.evaluator_slots), base_speaker_slots: speakerSlots, disabled_roles: disabled, jury_slots: parseInt(form.jury_slots) || 0, speaker_groups: form.speaker_groups, pair_groups,
      is_special_session: form.is_special_session,
      // The note only means anything while the flag is on — cleared otherwise so
      // un-ticking the box doesn't leave stale text behind.
      special_session_note: form.is_special_session ? (form.special_session_note.trim() || null) : null,
    };
    if (initial?.id) {
      // Preserve occupied extra slots (from approved requests) that sit above the
      // base — they trim away on their own when the speaker drops. Only truly-empty
      // slots beyond both the base and the occupied range are cleaned up.
      const { data: claims } = await supabase.from('role_claims')
        .select('role_key, slot_index').eq('meeting_id', initial.id).in('role_key', ['speaker', 'evaluator']);
      const maxOcc = (rk: string) => (claims ?? []).filter(c => c.role_key === rk).reduce((m, c) => Math.max(m, c.slot_index), 0);
      const liveSpeaker = Math.max(speakerSlots, maxOcc('speaker'));
      const liveEval = Math.max(parseInt(form.evaluator_slots), maxOcc('evaluator'));
      await supabase.from('meetings')
        .update({ ...payload, speaker_slots: liveSpeaker, evaluator_slots: liveEval })
        .eq('id', initial.id);
      await supabase.from('role_claims').delete()
        .eq('meeting_id', initial.id)
        .in('role_key', ['speaker', 'evaluator'])
        .gt('slot_index', Math.max(liveSpeaker, liveEval));
    } else {
      const { data: created, error } = await supabase.from('meetings').insert(payload).select('id').single();
      if (error || !created?.id) {
        setSaving(false);
        alert(`Meeting not created: ${error?.message ?? 'unknown error'}`);
        return;
      }
      // Announce the new meeting to all members. Awaited (and reported) rather
      // than fire-and-forget: a silent skip here looked like "no email was sent".
      const label = `Meeting #${payload.number} — ${formatMeetingDate(payload.date)}, ${formatTime(payload.start_time)}–${formatTime(payload.end_time)} IST`;
      try {
        const res = await fetch('/api/notify-meeting-created', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingId: created.id }),
        });
        const d = await res.json().catch(() => ({}));
        // WhatsApp rides along with the email but is configured separately, so
        // report it separately too — otherwise a working email hides a WhatsApp
        // that never went out (or vice versa).
        const w = d.whatsapp ?? {};
        const waLine = w.error
          ? `\nWhatsApp: failed — ${w.error}`
          : w.skipped
            ? `\nWhatsApp: nothing sent (${w.skipped})`
            : typeof w.sent === 'number'
              ? `\nWhatsApp: sent to ${w.sent}${w.sent === 0 && w.reason ? ` (${w.reason})` : ''}`
              : '';
        if (!res.ok) alert(`${label}\n\nCreated, but the announcement email failed: ${d.error ?? res.statusText}${waLine}`);
        else if (d.sent > 0) alert(`${label}\n\nAnnouncement emailed to ${d.sent} member(s).${waLine}`);
        else alert(`${label}\n\nCreated, but no announcement email went out (${d.reason ?? d.skipped ?? 'no recipients'}). Check the Email tab.${waLine}`);
      } catch {
        alert(`${label}\n\nCreated, but the announcement email could not be triggered (network error).`);
      }
    }
    setSaving(false); onSave();
  }

  return (
    <form onSubmit={handleSave} className={`${cardCls} p-5 space-y-4`}>
      <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100">{initial?.id ? 'Edit Meeting' : 'New Meeting'}</h3>
      <div className="grid grid-cols-2 gap-3">
        <label><span className={labelCls}>Meeting #</span><input required type="number" value={form.number} onChange={e => set('number', e.target.value)} className={inputCls} /></label>
        <label><span className={labelCls}>Date</span><input required type="date" value={form.date} onChange={e => set('date', e.target.value)} className={inputCls} /></label>
        <div><span className={labelCls}>Start time</span><TimePicker value={form.start_time} onChange={v => set('start_time', v)} /></div>
        <div><span className={labelCls}>End time</span><TimePicker value={form.end_time} onChange={v => set('end_time', v)} /></div>
      </div>
      <label><span className={labelCls}>Theme</span><input type="text" value={form.theme} onChange={e => set('theme', e.target.value)} placeholder="e.g. Mental Wellness" className={inputCls} /></label>
      <label><span className={labelCls}>Meeting link</span><input type="url" value={form.meeting_link} onChange={e => set('meeting_link', e.target.value)} placeholder="Zoom / Google Meet URL" className={inputCls} /></label>

      {/* Special session — a marker on top of the format, not a format itself */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-3 space-y-2">
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={form.is_special_session}
            onChange={e => setForm(f => ({ ...f, is_special_session: e.target.checked }))}
            className="w-4 h-4 mt-0.5 accent-maroon-700 rounded shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">✨ Mark as a special session</span>
            <span className="block text-xs text-slate-500">Shows a badge in the app and highlights it in the WhatsApp agenda.</span>
          </span>
        </label>
        {form.is_special_session && (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              The <strong>Theme</strong> above is used as the session title
              {form.theme.trim() && form.theme.trim().toUpperCase() !== 'TBD'
                ? <> — this one will read <strong>“✨ SPECIAL SESSION: {form.theme.trim()}”</strong>.</>
                : <>, so set one for a named session. Left as TBD it just reads <strong>“✨ SPECIAL SESSION”</strong>.</>}
              {' '}The running order is unchanged: the TMoD still facilitates and the usual roles apply.
            </p>
            <label>
              <span className={labelCls}>What makes it special (optional)</span>
              <textarea value={form.special_session_note} rows={2} maxLength={200}
                onChange={e => set('special_session_note', e.target.value)}
                placeholder="One line for the app & WhatsApp agenda — e.g. Joint meeting with TM Club X, guests most welcome!"
                className={`${inputCls} resize-none`} />
            </label>
          </div>
        )}
      </div>

      <div>
        <span className={labelCls}>Meeting format</span>
        <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
          {([
            { id: 'regular' as const,      label: 'Regular' },
            { id: 'speakathon' as const,   label: 'Speakathon (no Table Topics)' },
            { id: 'table_topics' as const, label: 'Table Topics session (no speeches)' },
          ]).map(p => (
            <button key={p.id} type="button" onClick={() => applyPreset(p.id)}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full border
                         border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300
                         hover:border-maroon-300 dark:hover:border-maroon-700 hover:text-maroon-700 dark:hover:text-maroon-400
                         active:scale-95 transition-all">
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Tap a category to enable/disable it for this meeting. Greyed = disabled.</p>
        <div className="flex flex-wrap gap-1.5">
          {TOGGLEABLE_ROLES.map(({ key, label }) => {
            const enabled = !form.disabled_roles.includes(key);
            return (
              <button key={key} type="button" onClick={() => toggleRole(key)}
                aria-pressed={enabled}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all active:scale-95 ${
                  enabled
                    ? 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-600 line-through'
                }`}>
                {enabled ? '✓' : '✕'} {label}
              </button>
            );
          })}
        </div>
      </div>
      <label>
        <span className={labelCls}>Speaker / Evaluator pairs</span>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Base count — each speaker is paired with one evaluator. Extra slots from member requests are added on top and trim back to this when dropped.</p>
        <input type="number" min={1} max={20} value={form.speaker_slots} onChange={e => set('speaker_slots', e.target.value)} className={`${inputCls} w-24`} />
      </label>
      {!form.disabled_roles.includes('speaker') && (
      <label>
        <span className={labelCls}>Jury seats</span>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Judges are assigned by an admin only (0 = no jury)</p>
        <input type="number" min={0} max={20} value={form.jury_slots} onChange={e => set('jury_slots', e.target.value)} className={`${inputCls} w-24`} />
      </label>
      )}
      {!form.disabled_roles.includes('speaker') && (
      <div>
        <span className={labelCls}>Speaker groups</span>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1.5">Named heats for a speakathon. Assign each speaker+evaluator pair to a group on the meeting card.</p>
        <div className="space-y-1.5">
          {form.speaker_groups.map((g) => (
            <div key={g.id} className="flex items-center gap-2">
              <input type="text" value={g.name} onChange={e => renameGroup(g.id, e.target.value)}
                placeholder="Group name" maxLength={40} className={`${inputCls} flex-1`} />
              <button type="button" onClick={() => removeGroup(g.id)}
                className="shrink-0 text-slate-400 hover:text-red-500 dark:hover:text-red-400 px-2 py-1.5 text-sm"
                aria-label={`Remove ${g.name}`}>✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addGroup}
          className="mt-1.5 text-[11px] font-semibold text-maroon-600 dark:text-maroon-400
                     border border-dashed border-maroon-300 dark:border-maroon-800/60
                     hover:bg-maroon-50 dark:hover:bg-maroon-950/20 rounded-lg px-3 py-1.5 transition-colors">
          + Add group
        </button>
      </div>
      )}
      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={saving} className={`flex-1 ${primaryBtn}`}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onCancel} className={`flex-1 ${ghostBtn}`}>Cancel</button>
      </div>
    </form>
  );
}

// ─── Deactivate / delete confirmation ─────────────────────────────────────────

// One dialog for both destructive member actions, because the useful thing to
// say is how they differ: deactivating is reversible and keeps the record,
// deleting isn't and doesn't. Delete asks the admin to type the name — the
// button sits next to Deactivate, and the two must not be one slip apart.
function MemberActionConfirm({
  member, action, working, history, error, confirmName,
  onConfirmNameChange, onCancel, onDeactivate, onDelete,
}: {
  member: Member;
  action: 'deactivate' | 'delete';
  working: boolean;
  history: { label: string; count: number }[] | null;
  error: string;
  confirmName: string;
  onConfirmNameChange: (v: string) => void;
  onCancel: () => void;
  onDeactivate: () => void;
  onDelete: (purgeHistory: boolean) => void;
}) {
  const name = member.display_name || member.name;
  const nameMatches = confirmName.trim().toLowerCase() === name.toLowerCase();
  const hasHistory = !!history && history.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onCancel}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-modal-dark p-6"
        onClick={(e) => e.stopPropagation()}>
        {action === 'deactivate' ? (
          <>
            <h2 className="font-serif text-lg font-semibold text-slate-900 dark:text-white mb-1">
              Deactivate TM {name}?
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              They&apos;ll drop off the roster, the sign-in list and the role pickers, and stop receiving
              club emails. Roles they already hold stay on their meetings. You can restore them at any
              time — nothing is lost.
            </p>
            <div className="flex gap-2">
              <button onClick={onDeactivate} disabled={working}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-40 active:scale-95 transition-all">
                {working ? 'Deactivating…' : 'Deactivate'}
              </button>
              <button onClick={onCancel} className="px-4 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[44px]">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-serif text-lg font-semibold text-slate-900 dark:text-white mb-1">
              Delete TM {name}?
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
              This removes the member from the database for good. There is no undo. If they&apos;ve just
              left the club, <strong className="text-slate-600 dark:text-slate-300">Deactivate</strong> is
              almost always what you want.
            </p>

            {hasHistory && (
              <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/25 p-3 mb-3">
                <p className="text-xs font-bold text-red-800 dark:text-red-300 mb-1">
                  TM {name} has club history on record
                </p>
                <ul className="text-xs text-red-700 dark:text-red-400/90 leading-relaxed">
                  {history.map((h) => (
                    <li key={h.label}>• {h.count} {h.label}</li>
                  ))}
                </ul>
                <p className="text-xs text-red-700 dark:text-red-400/90 leading-relaxed mt-1.5">
                  Deleting them erases all of it — past agendas and results will no longer show who did what.
                </p>
              </div>
            )}

            {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Type <strong className="text-slate-700 dark:text-slate-200">{name}</strong> to confirm
            </label>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => onConfirmNameChange(e.target.value)}
              autoFocus
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm mb-4
                         bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100
                         focus:outline-none focus:ring-2 focus:ring-red-500"
            />

            <div className="flex gap-2">
              <button
                onClick={() => onDelete(hasHistory)}
                disabled={working || !nameMatches}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-40 active:scale-95 transition-all"
              >
                {working ? 'Deleting…' : hasHistory ? 'Delete member and history' : 'Delete permanently'}
              </button>
              <button onClick={onCancel} className="px-4 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[44px]">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Member row ────────────────────────────────────────────────────────────────

function MemberRow({ member, allMembers, currentAdminId, onUpdated }: {
  member: Member; allMembers: Member[]; currentAdminId: string; onUpdated: () => void;
}) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(member.display_name);
  const [saving, setSaving] = useState(false);
  const [savingMentor, setSavingMentor] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);
  const [togglingAdmin, setTogglingAdmin] = useState(false);
  const [togglingGuest, setTogglingGuest] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  // Contact details, edited in place. Held locally so the row doesn't write on
  // every keystroke; the Save button appears only once something differs.
  const [email, setEmail] = useState(member.email ?? '');
  const [phone, setPhone] = useState(member.phone ?? '');
  const [savingContact, setSavingContact] = useState(false);
  const [contactMsg, setContactMsg] = useState<string | null>(null);
  const [togglingPref, setTogglingPref] = useState<'email' | 'whatsapp' | null>(null);
  // Both destructive actions confirm first; 'delete' also reports what history
  // stands in the way before anything is touched.
  const [confirming, setConfirming] = useState<'deactivate' | 'delete' | null>(null);
  const [working, setWorking] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteHistory, setDeleteHistory] = useState<{ label: string; count: number }[] | null>(null);
  const [confirmName, setConfirmName] = useState('');

  const mode = participationMode(member);

  // Email is opt-OUT: a column that's null, or absent because the migration
  // hasn't run, means the member still receives it.
  const emailPrefOn = member.email_notifications !== false;
  // WhatsApp is not, and this is the whole point of migration 058. It costs the
  // club per message, so it is opt-IN and the admin's to grant: only an explicit
  // true sends anything. `waMuted` is the member's own switch, shown here but
  // not an admin's to flip — a member who asked for silence keeps it.
  const waEnabled = member.whatsapp_enabled === true;
  const waMuted = member.whatsapp_notifications === false;
  const contactDirty = email.trim() !== (member.email ?? '') || phone.trim() !== (member.phone ?? '');
  // The same rule the sender applies, so "on but unreachable" is visible here
  // rather than discovered as silence.
  const phoneUsable = !!normalizePhone(phone, '91');

  const autoAdmin = isClubOfficer(member);
  const hasAdmin = member.is_admin || autoAdmin;
  const autoGuestMgr = isClubOfficer(member);
  const hasGuestMgr = member.can_manage_guests || autoGuestMgr;

  async function save() {
    setSaving(true);
    await supabase.from('members').update({ display_name: displayName }).eq('id', member.id);
    setSaving(false); setEditing(false); onUpdated();
  }

  // Reversible: the member keeps everything, just stops appearing in pickers,
  // sign-in and the roster. Restoring puts them straight back.
  async function toggleActive() {
    setWorking(true);
    const { error } = await supabase.from('members').update({ active: !member.active }).eq('id', member.id);
    setWorking(false);
    if (error) { alert(`Failed: ${error.message}`); return; }
    closeConfirm();
    onUpdated();
  }

  // Irreversible: removes the member row itself. The route refuses (409) while
  // the member still has history, and only proceeds once the admin has seen the
  // tally and asked for it to be purged too.
  async function deleteMember(purgeHistory: boolean) {
    setWorking(true);
    setDeleteError('');
    const res = await fetch('/api/admin/delete-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId: currentAdminId, memberId: member.id, purgeHistory }),
    });
    const data = await res.json().catch(() => ({}));
    setWorking(false);
    if (!res.ok) {
      // Revealing the history is a new fact to weigh — make them re-type the
      // name so the second click can't be a stray double-click on the first.
      if (data.error === 'has_history') {
        setDeleteHistory(data.history ?? []);
        setConfirmName('');
        return;
      }
      setDeleteError(data.error || 'Could not delete this member.');
      return;
    }
    closeConfirm();
    onUpdated();
  }

  function closeConfirm() {
    setConfirming(null);
    setDeleteHistory(null);
    setDeleteError('');
    setConfirmName('');
  }

  async function changeMentor(mentorId: string) {
    setSavingMentor(true);
    await supabase.from('members').update({ mentor_id: mentorId || null }).eq('id', member.id);
    // Notify the mentee and the mentor when a mentor is assigned (best-effort).
    if (mentorId) {
      fetch('/api/notify-mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menteeId: member.id, mentorId }),
      }).catch(() => {});
    }
    setSavingMentor(false); onUpdated();
  }

  async function resetPassword() {
    if (!confirm(`Reset password for TM ${member.display_name}?`)) return;
    setResettingPw(true);
    await supabase.from('members').update({ password_hash: null, password_salt: null }).eq('id', member.id);
    setResettingPw(false); onUpdated();
  }

  async function toggleLeadershipRole(role: LeadershipRole) {
    const current = memberLeadershipRoles(member);
    const has = current.includes(role);
    const next = has ? current.filter(r => r !== role) : [...current, role];
    const { error } = await supabase.from('members').update({ leadership_roles: next }).eq('id', member.id);
    if (error) { alert(`Failed: ${error.message}`); return; }
    // Email the member when a NEW leadership role is granted (best-effort).
    if (!has) {
      fetch('/api/notify-leadership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: currentAdminId, targetMemberId: member.id, role }),
      }).catch(() => {});
    }
    onUpdated();
  }

  async function toggleAdmin() {
    if (autoAdmin) return;
    const next = !member.is_admin;
    if (!next && member.id === currentAdminId) {
      if (!confirm('You are about to remove your own admin rights. Continue?')) return;
    }
    setTogglingAdmin(true);
    await supabase.from('members').update({ is_admin: next }).eq('id', member.id);
    setTogglingAdmin(false); onUpdated();
  }

  // Online-only members get first pick of roles while the reservation window is
  // open (Settings → Role Reservation).
  async function changeParticipationMode(next: ParticipationMode) {
    if (next === mode) return;
    setSavingMode(true);
    const { error } = await supabase.from('members').update({ participation_mode: next }).eq('id', member.id);
    // Moving someone to the visiting club drops what only club members hold, so
    // nothing stale lingers behind the hidden mentor/roles controls — including
    // any mentees who were pointing at them.
    if (!error && next === 'offline') {
      await supabase.from('members')
        .update({ mentor_id: null, leadership_roles: [] }).eq('id', member.id);
      await supabase.from('members').update({ mentor_id: null }).eq('mentor_id', member.id);
    }
    setSavingMode(false);
    if (error) { alert(`Failed: ${error.message}`); return; }
    onUpdated();
  }

  // Contact details drive both notification channels, so an admin fixing a typo
  // here is often the whole reason someone stopped hearing from the club.
  async function saveContact() {
    setSavingContact(true); setContactMsg(null);
    const { error } = await supabase.from('members').update({
      email: email.trim() || null,
      phone: phone.trim() || null,
    }).eq('id', member.id);
    setSavingContact(false);
    setContactMsg(error ? `✗ ${error.message}` : '✓ Saved');
    setTimeout(() => setContactMsg(null), 2500);
    if (!error) onUpdated();
  }

  // Each channel is written on its own: the WhatsApp columns arrived in
  // migrations 055 and 058, so on a database without them the email toggle must
  // still work. The WhatsApp switch writes the admin gate, never the member's own
  // preference — those are two different decisions by two different people.
  async function togglePref(channel: 'email' | 'whatsapp') {
    const column = channel === 'email' ? 'email_notifications' : 'whatsapp_enabled';
    const next = !(channel === 'email' ? emailPrefOn : waEnabled);
    setTogglingPref(channel);
    const { error } = await supabase.from('members').update({ [column]: next }).eq('id', member.id);
    setTogglingPref(null);
    if (error) { alert(`Failed: ${error.message}`); return; }
    onUpdated();
  }

  async function toggleGuestManager() {
    setTogglingGuest(true);
    await supabase.from('members').update({ can_manage_guests: !member.can_manage_guests }).eq('id', member.id);
    setTogglingGuest(false); onUpdated();
  }

  // Mentoring is a club programme: a visiting WIC India member neither mentors
  // nor is mentored, so they're out of the picker and get no mentor row at all.
  const isWic = mode === 'offline';
  const mentorOptions = allMembers.filter(
    m => m.active && m.id !== member.id && participationMode(m) !== 'offline');

  return (
    <div className={`p-3.5 rounded-2xl border space-y-2 transition-opacity ${
      member.active
        ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/60'
        : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800/40 opacity-55'
    }`}>
      {/* Top row: name + badges + actions */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{member.name}</p>
            {hasAdmin && (
              <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                autoAdmin
                  ? 'bg-navy-100 dark:bg-navy-700/60 text-navy-700 dark:text-navy-300'
                  : 'bg-maroon-100 dark:bg-maroon-900/60 text-maroon-700 dark:text-maroon-400'
              }`}>
                {autoAdmin ? '🛡️ Admin (role)' : '🛡️ Admin'}
              </span>
            )}
          </div>
          {editing ? (
            <div className="flex items-center gap-2 mt-1.5">
              <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-maroon-600 w-32"
                placeholder="Display name" />
              <button onClick={save} disabled={saving} className="text-xs text-maroon-600 dark:text-maroon-400 font-semibold">{saving ? '…' : 'Save'}</button>
              <button onClick={() => { setEditing(false); setDisplayName(member.display_name); }} className="text-xs text-slate-400 dark:text-slate-500">Cancel</button>
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-0.5">
              TM {member.display_name}
              <button onClick={() => setEditing(true)} className="ml-1.5 text-maroon-600 dark:text-maroon-500 hover:text-maroon-700 dark:hover:text-maroon-400">Edit</button>
            </p>
          )}
          {/* When this member was added to the app (members.created_at). */}
          {member.created_at && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              Added {new Date(member.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0 flex-wrap justify-end">
          {autoGuestMgr ? (
            <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-700/30 text-emerald-700 dark:text-emerald-400">
              👥 Guests (role)
            </span>
          ) : (
            <button onClick={toggleGuestManager} disabled={togglingGuest}
              className={`text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors min-h-[32px] disabled:opacity-40 ${
                member.can_manage_guests
                  ? 'text-emerald-600 dark:text-emerald-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                  : 'text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
              }`}>
              {togglingGuest ? '…' : hasGuestMgr ? '👥 Guest mgr' : 'Guest mgr'}
            </button>
          )}
          {!autoAdmin && (
            <button onClick={toggleAdmin} disabled={togglingAdmin}
              className={`text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors min-h-[32px] disabled:opacity-40 ${
                member.is_admin
                  ? 'text-maroon-600 dark:text-maroon-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                  : 'text-slate-500 dark:text-slate-400 hover:text-maroon-600 dark:hover:text-maroon-400 hover:bg-maroon-50 dark:hover:bg-maroon-950/30'
              }`}>
              {togglingAdmin ? '…' : member.is_admin ? 'Revoke admin' : 'Grant admin'}
            </button>
          )}
          <button onClick={resetPassword} disabled={resettingPw} title="Reset password"
            className="text-xs px-2 py-1 rounded-lg min-h-[32px] text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-40 transition-colors">
            {resettingPw ? '…' : '🔑'}
          </button>
          {/* Restoring is harmless, so it goes straight through; deactivating
              and deleting both stop for a confirmation. */}
          <button onClick={() => member.active ? setConfirming('deactivate') : toggleActive()}
            disabled={working}
            className={`text-[10px] font-medium px-2 py-1 rounded-lg min-h-[32px] transition-colors disabled:opacity-40 ${
              member.active
                ? 'text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                : 'text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
            }`}>
            {member.active ? 'Deactivate' : 'Restore'}
          </button>
          {member.id !== currentAdminId && (
            <button onClick={() => setConfirming('delete')} disabled={working} title="Delete permanently"
              className="text-xs px-2 py-1 rounded-lg min-h-[32px] text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 transition-colors">
              🗑️
            </button>
          )}
        </div>
      </div>

      {confirming && (
        <MemberActionConfirm
          member={member}
          action={confirming}
          working={working}
          history={deleteHistory}
          error={deleteError}
          confirmName={confirmName}
          onConfirmNameChange={setConfirmName}
          onCancel={closeConfirm}
          onDeactivate={toggleActive}
          onDelete={deleteMember}
        />
      )}

      {/* Contact details + notification preferences. Grouped, because the two
          are inseparable in practice: a channel switched on with nothing to
          send to is the commonest reason a member hears nothing. */}
      <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 w-12">Email</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="none set"
            className="flex-1 min-w-0 text-xs border border-slate-200 dark:border-slate-700/60 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-maroon-600" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 w-12">Phone</span>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="none set"
            className="flex-1 min-w-0 text-xs border border-slate-200 dark:border-slate-700/60 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-maroon-600" />
        </div>

        {contactDirty && (
          <div className="flex items-center gap-2 pl-14">
            <button onClick={saveContact} disabled={savingContact}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-maroon-700 text-white disabled:opacity-40 active:scale-95 transition-all">
              {savingContact ? 'Saving…' : 'Save contact'}
            </button>
            <button onClick={() => { setEmail(member.email ?? ''); setPhone(member.phone ?? ''); }}
              className="text-[11px] text-slate-400 dark:text-slate-500">Cancel</button>
          </div>
        )}
        {contactMsg && <p className="text-[10px] text-slate-500 pl-14">{contactMsg}</p>}

        {/* Notification switches — saved the moment they're clicked. */}
        <div className="flex items-center gap-2 flex-wrap pt-0.5">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 w-12">Notify</span>
          <button onClick={() => togglePref('email')} disabled={togglingPref === 'email'}
            title={emailPrefOn ? 'Receiving emails — click to stop' : 'Not receiving emails — click to resume'}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all active:scale-95 disabled:opacity-40 ${
              emailPrefOn
                ? 'bg-maroon-600 border-maroon-600 text-white'
                : 'border-slate-200 dark:border-slate-700/60 text-slate-400 dark:text-slate-500'
            }`}>
            {togglingPref === 'email' ? '…' : `✉️ Email ${emailPrefOn ? 'on' : 'off'}`}
          </button>
          <button onClick={() => togglePref('whatsapp')} disabled={togglingPref === 'whatsapp'}
            title={waEnabled
              ? 'WhatsApp is enabled for this member — click to stop sending (and stop paying) for them'
              : 'No WhatsApp is sent to this member — click to enable it'}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all active:scale-95 disabled:opacity-40 ${
              waEnabled
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'border-slate-200 dark:border-slate-700/60 text-slate-400 dark:text-slate-500'
            }`}>
            {togglingPref === 'whatsapp' ? '…' : `💬 WhatsApp ${waEnabled ? 'on' : 'off'}`}
          </button>
        </div>

        {/* A channel switched on with nothing to reach them by sends nothing and
            reports nothing. Say so here, where it can actually be fixed. */}
        {emailPrefOn && !isEmailAddress(email) && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 pl-14">
            Email is on, but there&apos;s no valid address — nothing will reach them.
          </p>
        )}
        {waEnabled && !phoneUsable && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 pl-14">
            WhatsApp is on, but the phone number {phone.trim() ? 'is not usable' : 'is missing'} — nothing will reach them.
          </p>
        )}
        {waEnabled && waMuted && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 pl-14">
            They&apos;ve turned WhatsApp off in their own profile, so nothing is sent. That&apos;s their
            choice to reverse, not yours.
          </p>
        )}
        {!waEnabled && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 pl-14">
            No WhatsApp is sent to this member, and they can&apos;t switch it on themselves.
          </p>
        )}
        {/* Sending a one-off message lives on the WhatsApp tab, next to the
            club-wide sends and the message log — the same decision, one
            recipient rather than all of them. */}
        {waEnabled && phoneUsable && !waMuted && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 pl-14">
            To message them on their own, use <strong className="text-slate-500 dark:text-slate-400">Send
            to one member</strong> on the WhatsApp tab.
          </p>
        )}
      </div>

      {/* Participation mode — drives the online-only role reservation window */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 w-12">Attends</span>
        <div className="flex gap-1.5 flex-1">
          {PARTICIPATION_MODES.map(p => {
            const selected = mode === p.value;
            return (
              <button
                key={p.value}
                type="button"
                disabled={savingMode}
                onClick={() => changeParticipationMode(p.value)}
                title={p.hint}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all active:scale-95 disabled:opacity-40 ${
                  selected
                    ? p.value === 'online'
                      ? 'bg-sky-600 border-sky-600 text-white'
                      : p.value === 'offline'
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : 'bg-amber-600 border-amber-600 text-white'
                    : 'border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500'
                }`}
              >
                {p.emoji} {p.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mentor selector — club programme, so not offered to WIC members. */}
      {!isWic && (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 w-12">Mentor</span>
        <select value={member.mentor_id ?? ''} onChange={e => changeMentor(e.target.value)} disabled={savingMentor}
          className="flex-1 text-xs border border-slate-200 dark:border-slate-700/60 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300
                     focus:outline-none focus:ring-1 focus:ring-maroon-600 disabled:opacity-50">
          <option value="">— None —</option>
          {mentorOptions.map(m => <option key={m.id} value={m.id}>TM {m.display_name}</option>)}
        </select>
      </div>
      )}

      {/* Leadership roles (multi-select) — club officer posts, our members only. */}
      {isWic ? (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
          Mentoring and club officer roles are for {HOME_CLUB_NAME} members.
        </p>
      ) : (
      <div className="flex items-start gap-2">
        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 w-12 mt-1.5">Roles</span>
        <div className="flex flex-wrap gap-1.5 flex-1">
          {LEADERSHIP_ROLES.map(r => {
            const selected = hasLeadershipRole(member, r.value);
            const takenBy = allMembers.find(m => m.id !== member.id && hasLeadershipRole(m, r.value));
            const blocked = r.exclusive && !!takenBy && !selected;
            return (
              <button
                key={r.value}
                type="button"
                disabled={blocked}
                onClick={() => toggleLeadershipRole(r.value)}
                title={blocked ? 'Already assigned to another member' : ''}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all active:scale-95 ${
                  selected
                    ? 'bg-maroon-600 border-maroon-600 text-white'
                    : blocked
                      ? 'border-slate-200 dark:border-slate-700/60 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                      : 'border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 hover:border-maroon-400 dark:hover:border-maroon-700 hover:text-maroon-700 dark:hover:text-maroon-400'
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}

// ─── Add member form ──────────────────────────────────────────────────────────

function AddMemberForm({ onAdd }: {
  onAdd: (name: string, email: string, phone: string, whatsappEnabled: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // Off by default, and it stays off unless an admin ticks it: every WhatsApp
  // message costs the club money, so a new member is added silently and is
  // switched on deliberately, one decision at a time.
  const [waEnabled, setWaEnabled] = useState(false);

  // Warn before the member is created, not after: a number typed wrong here is
  // one nobody looks at again until the reminders quietly fail to arrive.
  const phoneBad = !!phone.trim() && !normalizePhone(phone, '91');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), email.trim(), phone.trim(), waEnabled);
    setName(''); setEmail(''); setPhone(''); setWaEnabled(false);
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="New member full name" className={inputCls} />
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (sends a welcome email)" className={inputCls} />
      <div className="flex gap-2">
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="Phone (for WhatsApp, if you enable it below)" className={inputCls} />
        <button type="submit" disabled={!name.trim()} className={`shrink-0 ${primaryBtn}`}>Add</button>
      </div>

      <label className="flex items-start gap-2 cursor-pointer select-none rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/30 px-3 py-2">
        <input type="checkbox" checked={waEnabled} onChange={e => setWaEnabled(e.target.checked)}
          className="w-4 h-4 mt-0.5 accent-emerald-600 rounded shrink-0" />
        <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Send WhatsApp messages to this member
          <span className="block text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            Off by default — WhatsApp costs the club per message. Leave it off and they still get every
            email; nothing is sent to their phone, not even the welcome. You can switch it on later from
            their row.
          </span>
        </span>
      </label>

      {phoneBad && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          That does not look like a usable number — it will be saved, but WhatsApp will not reach them.
        </p>
      )}
      {waEnabled && !phone.trim() && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          WhatsApp is on but there is no phone number, so nothing can be sent until one is added.
        </p>
      )}
    </form>
  );
}

// ─── Guest log ────────────────────────────────────────────────────────────────

function GuestLog({ guestRegs, meetings }: { guestRegs: GuestRegistration[]; meetings: MeetingWithClaims[] }) {
  const meetingMap = new Map(meetings.map(m => [m.id, m]));
  if (guestRegs.length === 0) return <div className="text-center py-16 text-slate-400 dark:text-slate-600 text-sm">No guests registered yet.</div>;
  return (
    <div className="space-y-2 pb-8">
      <p className="text-xs text-slate-400 dark:text-slate-600 mb-3">{guestRegs.length} guest registration{guestRegs.length !== 1 ? 's' : ''}</p>
      {guestRegs.map(g => {
        const meeting = g.meeting_id ? meetingMap.get(g.meeting_id) : undefined;
        return (
          <div key={g.id} className={`${cardCls} p-3`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{g.name || '—'}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{g.phone}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{g.email}</p>
              </div>
              <div className="text-right shrink-0">
                {meeting && <p className="text-xs font-semibold text-maroon-600 dark:text-maroon-400">Meeting #{meeting.number}</p>}
                <p className="text-xs text-slate-400 dark:text-slate-600 mt-0.5">{new Date(g.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Requests panel ───────────────────────────────────────────────────────────

function RequestsPanel({ allMembers, meetings, currentAdminId, onChanged }: {
  allMembers: Member[];
  meetings: MeetingWithClaims[];
  currentAdminId: string;
  onChanged: () => void;
}) {
  const supabase = createClient();
  const [requests, setRequests] = useState<SpeakerSlotRequest[]>([]);
  const [evalRequests, setEvalRequests] = useState<EvaluatorRequest[]>([]);
  const [roleRequests, setRoleRequests] = useState<RoleInterestRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);
  const [maxSpeakerSlots, setMaxSpeakerSlots] = useState(2);

  const meetingMap = new Map(meetings.map(m => [m.id, m]));
  const memberMap  = new Map(allMembers.map(m => [m.id, m]));

  async function fetchRequests() {
    const [{ data }, { data: evalData }, { data: roleData, error: roleErr }] = await Promise.all([
      supabase.from('speaker_slot_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('evaluator_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('role_interest_requests').select('*').order('created_at', { ascending: false }),
    ]);
    setRequests((data ?? []) as SpeakerSlotRequest[]);
    setEvalRequests((evalData ?? []) as EvaluatorRequest[]);
    if (!roleErr) setRoleRequests((roleData ?? []) as RoleInterestRequest[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchRequests();
    supabase.from('agenda_config').select('max_speaker_slots').single()
      .then(({ data }) => { if (data?.max_speaker_slots) setMaxSpeakerSlots(data.max_speaker_slots); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function approve(req: SpeakerSlotRequest) {
    const meeting = meetings.find(m => m.id === req.meeting_id);
    if (!meeting) return;

    // Prefer a speaker slot that's already open — during the reservation window
    // members request a slot precisely because they can't claim a free one. Only
    // grow the meeting (subject to the cap) when every slot is taken.
    const openSlot = Array.from({ length: meeting.speaker_slots }, (_, i) => i + 1)
      .find(s => !meeting.role_claims.some(c => c.role_key === 'speaker' && c.slot_index === s));

    if (openSlot == null && meeting.speaker_slots >= maxSpeakerSlots) {
      alert(`This meeting is already at the maximum of ${maxSpeakerSlots} speaker slots. Raise the cap in Agenda Settings to approve more.`);
      return;
    }
    setActing(req.id);

    const newSpeakerSlots = openSlot ?? meeting.speaker_slots + 1;

    if (openSlot == null) {
      await supabase.from('meetings').update({
        speaker_slots: newSpeakerSlots,
        evaluator_slots: Math.max(meeting.evaluator_slots, newSpeakerSlots),
      }).eq('id', req.meeting_id);
    }

    await supabase.from('role_claims').insert({
      meeting_id: req.meeting_id,
      role_key: 'speaker',
      slot_index: newSpeakerSlots,
      member_id: req.member_id,
      admin_override: true,
    });

    // The evaluator request (created when the extra slot was requested) is still
    // unbound — bind it to the new speaker slot so it can be approved/denied on
    // its own. If none exists (legacy request), create one now.
    if (req.preferred_evaluator_id) {
      const { data: bound } = await supabase.from('evaluator_requests')
        .update({ speaker_slot_index: newSpeakerSlots })
        .eq('speaker_slot_request_id', req.id)
        .eq('status', 'pending')
        .select('id');
      if (!bound || bound.length === 0) {
        // Legacy request with no tied row — retire any earlier pending nomination
        // by this speaker, then create the bound one.
        await supabase.from('evaluator_requests')
          .update({ status: 'cancelled' })
          .eq('meeting_id', req.meeting_id).eq('speaker_id', req.member_id).eq('status', 'pending');
        await supabase.from('evaluator_requests').insert({
          meeting_id: req.meeting_id,
          speaker_slot_index: newSpeakerSlots,
          speaker_id: req.member_id,
          preferred_evaluator_id: req.preferred_evaluator_id,
          status: 'pending',
          speaker_slot_request_id: req.id,
        });
        fetch('/api/notify-evaluator-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingNumber: meeting.number,
            meetingDate: meeting.date,
            speakerId: req.member_id,
            preferredEvaluatorId: req.preferred_evaluator_id,
          }),
        }).catch(() => {});
      }
    }

    await supabase.from('speaker_slot_requests').update({
      status: 'approved',
      reviewer_id: currentAdminId,
      review_comment: commentInputs[req.id]?.trim() || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id);

    fetch('/api/notify-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'speaker_slot', event: 'approved', requestId: req.id }),
    }).catch(() => {});

    setActing(null);
    fetchRequests();
    onChanged();
  }

  async function deny(req: SpeakerSlotRequest) {
    if (!commentInputs[req.id]?.trim()) {
      alert('Please add a comment explaining why the request is denied.');
      return;
    }
    setActing(req.id);
    await supabase.from('speaker_slot_requests').update({
      status: 'denied',
      reviewer_id: currentAdminId,
      review_comment: commentInputs[req.id].trim(),
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id);
    // No extra slot → decline the evaluator nomination that rode along with it.
    await supabase.from('evaluator_requests')
      .update({
        status: 'denied',
        reviewer_id: currentAdminId,
        review_comment: 'Extra speaker slot was not approved.',
        reviewed_at: new Date().toISOString(),
      })
      .eq('speaker_slot_request_id', req.id)
      .eq('status', 'pending');

    fetch('/api/notify-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'speaker_slot', event: 'denied', requestId: req.id }),
    }).catch(() => {});

    setActing(null);
    fetchRequests();
  }

  // ── Role interest requests ──────────────────────────────────────────────────
  // Approving assigns the role outright, into the lowest still-open slot.
  async function approveInterest(req: RoleInterestRequest) {
    const meeting = meetings.find(m => m.id === req.meeting_id);
    if (!meeting) return;
    const meta = ROLE_META[req.role_key];

    const openSlot = getMeetingRoles(meeting)
      .filter(r => r.roleKey === req.role_key)
      .map(r => r.slot)
      .find(s => !meeting.role_claims.some(c => c.role_key === req.role_key && c.slot_index === s));
    if (openSlot == null) {
      alert(`Every ${meta.label} slot for this meeting is already filled. Free one up first, or deny this request.`);
      return;
    }

    // The member may have picked up other roles since asking — warn, don't block.
    const existing = meeting.role_claims.filter(c => c.member_id === req.member_id).map(c => c.role_key);
    const conflict = roleClaimBlocked(req.role_key, existing);
    if (conflict && !confirm(`${conflict}. Assign ${meta.label} anyway?`)) return;

    setActing(req.id);
    await supabase.from('role_claims').insert({
      meeting_id: req.meeting_id,
      role_key: req.role_key,
      slot_index: openSlot,
      member_id: req.member_id,
      admin_override: true,
    });
    await supabase.from('role_interest_requests').update({
      status: 'approved',
      reviewer_id: currentAdminId,
      review_comment: commentInputs[req.id]?.trim() || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id);

    // The approval email carries the role + any officer note; the generic
    // "role assigned" mail would duplicate it, so it's deliberately not sent.
    fetch('/api/notify-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'role_interest', event: 'approved', requestId: req.id }),
    }).catch(() => {});

    setActing(null);
    fetchRequests();
    onChanged();
  }

  async function denyInterest(req: RoleInterestRequest) {
    if (!commentInputs[req.id]?.trim()) {
      alert('Please add a comment explaining why the request is denied.');
      return;
    }
    setActing(req.id);
    await supabase.from('role_interest_requests').update({
      status: 'denied',
      reviewer_id: currentAdminId,
      review_comment: commentInputs[req.id].trim(),
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id);

    fetch('/api/notify-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'role_interest', event: 'denied', requestId: req.id }),
    }).catch(() => {});

    setActing(null);
    fetchRequests();
  }

  // ── Evaluator (speaker-nominated) requests ──────────────────────────────────
  async function approveEval(req: EvaluatorRequest) {
    const meeting = meetings.find(m => m.id === req.meeting_id);
    if (!meeting) return;

    // Unbound: this evaluator came from an extra-slot request whose speaker slot
    // isn't approved yet, so there's no slot to assign into.
    if (req.speaker_slot_index == null) {
      alert('This evaluator is tied to an extra speaker-slot request. Approve that speaker slot first, then approve the evaluator.');
      return;
    }

    // The paired evaluator slot must be free (a pending request holds it, but an
    // admin may have filled it directly in the meantime).
    const taken = meeting.role_claims.some(
      c => c.role_key === 'evaluator' && c.slot_index === req.speaker_slot_index,
    );
    if (taken) {
      alert('That evaluator slot is already filled. Remove the current evaluator first, or deny this request.');
      return;
    }
    // The nominee must not already be evaluating another speaker in this meeting.
    const nomineeAlreadyEvaluator = meeting.role_claims.some(
      c => c.role_key === 'evaluator' && c.member_id === req.preferred_evaluator_id,
    );
    if (nomineeAlreadyEvaluator) {
      const who = memberMap.get(req.preferred_evaluator_id)?.display_name ?? 'This member';
      alert(`TM ${who} is already assigned as an evaluator for this meeting. Deny this request, or free up their other slot first.`);
      return;
    }
    setActing(req.id);

    await supabase.from('role_claims').insert({
      meeting_id: req.meeting_id,
      role_key: 'evaluator',
      slot_index: req.speaker_slot_index,
      member_id: req.preferred_evaluator_id,
      admin_override: true,
    });

    await supabase.from('evaluator_requests').update({
      status: 'approved',
      reviewer_id: currentAdminId,
      review_comment: commentInputs[req.id]?.trim() || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id);

    fetch('/api/notify-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId: req.meeting_id,
        targetMemberId: req.preferred_evaluator_id,
        roleKey: 'evaluator',
        action: 'assigned',
        actorId: currentAdminId,
        actorIsAdmin: true,
      }),
    }).catch(() => {});

    // Let the requesting speaker know their evaluator was approved.
    fetch('/api/notify-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'evaluator', event: 'approved', requestId: req.id }),
    }).catch(() => {});

    setActing(null);
    fetchRequests();
    onChanged();
  }

  async function denyEval(req: EvaluatorRequest) {
    if (!commentInputs[req.id]?.trim()) {
      alert('Please add a comment explaining why the request is denied.');
      return;
    }
    setActing(req.id);
    await supabase.from('evaluator_requests').update({
      status: 'denied',
      reviewer_id: currentAdminId,
      review_comment: commentInputs[req.id].trim(),
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id);

    fetch('/api/notify-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'evaluator', event: 'denied', requestId: req.id }),
    }).catch(() => {});

    setActing(null);
    fetchRequests();
  }

  const pending  = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status !== 'pending');
  const evalPending  = evalRequests.filter(r => r.status === 'pending');
  const evalResolved = evalRequests.filter(r => r.status !== 'pending');
  const rolePending  = roleRequests.filter(r => r.status === 'pending');
  const roleResolved = roleRequests.filter(r => r.status !== 'pending' && r.status !== 'cancelled');

  if (loading) return <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-20 bg-slate-200 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>;

  return (
    <div className="space-y-6 pb-8">
      {/* Pending */}
      <div>
        <p className={labelCls}>Pending Requests ({pending.length})</p>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">No pending requests.</p>
        ) : (
          <div className="space-y-3">
            {pending.map(req => {
              const member  = memberMap.get(req.member_id);
              const meeting = meetingMap.get(req.meeting_id);
              return (
                <div key={req.id} className={`${cardCls} p-4 space-y-3 border-l-4 border-amber-400 dark:border-amber-600`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        TM {member?.display_name ?? 'Unknown'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        🎙️ Speaker slot · {meeting ? `Meeting #${meeting.number} · ${new Date(meeting.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Unknown meeting'}
                      </p>
                      {req.request_note && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 italic">
                          &ldquo;{req.request_note}&rdquo;
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                        Requested {new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <textarea
                    value={commentInputs[req.id] ?? ''}
                    onChange={e => setCommentInputs(prev => ({ ...prev, [req.id]: e.target.value }))}
                    placeholder="Add a comment (required for deny, optional for approve)…"
                    rows={2}
                    className={`${inputCls} text-xs resize-none`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => approve(req)}
                      disabled={acting === req.id}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl py-2.5 disabled:opacity-40 active:scale-95 transition-all">
                      {acting === req.id ? '…' : '✓ Approve'}
                    </button>
                    <button
                      onClick={() => deny(req)}
                      disabled={acting === req.id}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl py-2.5 disabled:opacity-40 active:scale-95 transition-all">
                      {acting === req.id ? '…' : '✗ Deny'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Role requests (raised during the online-only reservation window) */}
      <div>
        <p className={labelCls}>Role Requests ({rolePending.length})</p>
        {rolePending.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">No pending role requests.</p>
        ) : (
          <div className="space-y-3">
            {rolePending.map(req => {
              const member  = memberMap.get(req.member_id);
              const meeting = meetingMap.get(req.meeting_id);
              const meta    = ROLE_META[req.role_key];
              // Others who asked for the same role at the same meeting — only one
              // can have it, so surface the competition before approving.
              const rivals = rolePending.filter(
                r => r.id !== req.id && r.meeting_id === req.meeting_id && r.role_key === req.role_key,
              );
              return (
                <div key={req.id} className={`${cardCls} p-4 space-y-3 border-l-4 border-amber-400 dark:border-amber-600`}>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      🙋 TM {member?.display_name ?? 'Unknown'} <span className="font-normal text-slate-400">wants</span> {meta.emoji} {meta.label}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {meeting ? `Meeting #${meeting.number} · ${new Date(meeting.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Unknown meeting'}
                    </p>
                    {req.request_note && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 italic">&ldquo;{req.request_note}&rdquo;</p>
                    )}
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                      Requested {new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {rivals.length > 0 && (
                    <div className="rounded-lg bg-amber-100/70 dark:bg-amber-900/30 border border-amber-300/60 dark:border-amber-700/50 px-2.5 py-2">
                      <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                        ⚠️ {rivals.length} other member{rivals.length > 1 ? 's' : ''} asked for {meta.label} too:
                      </p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        {rivals.map(r => `TM ${memberMap.get(r.member_id)?.display_name ?? 'Unknown'}`).join(', ')}
                      </p>
                    </div>
                  )}
                  <textarea
                    value={commentInputs[req.id] ?? ''}
                    onChange={e => setCommentInputs(prev => ({ ...prev, [req.id]: e.target.value }))}
                    placeholder="Add a comment (required for deny, optional for approve)…"
                    rows={2}
                    className={`${inputCls} text-xs resize-none`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveInterest(req)}
                      disabled={acting === req.id}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl py-2.5 disabled:opacity-40 active:scale-95 transition-all">
                      {acting === req.id ? '…' : '✓ Approve & assign'}
                    </button>
                    <button
                      onClick={() => denyInterest(req)}
                      disabled={acting === req.id}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl py-2.5 disabled:opacity-40 active:scale-95 transition-all">
                      {acting === req.id ? '…' : '✗ Deny'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {roleResolved.length > 0 && (
          <div className="mt-3 space-y-2">
            {roleResolved.map(req => {
              const member   = memberMap.get(req.member_id);
              const meeting  = meetingMap.get(req.meeting_id);
              const reviewer = req.reviewer_id ? memberMap.get(req.reviewer_id) : null;
              const meta     = ROLE_META[req.role_key];
              return (
                <div key={req.id} className={`${cardCls} p-3 border-l-4 ${req.status === 'approved' ? 'border-emerald-400 dark:border-emerald-600' : 'border-red-400 dark:border-red-700'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {req.status === 'approved' ? '✓' : '✗'} TM {member?.display_name ?? '?'} → {meta.emoji} {meta.label}
                        {meeting ? ` · Meeting #${meeting.number}` : ''}
                      </p>
                      {req.review_comment && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 italic">&ldquo;{req.review_comment}&rdquo;</p>
                      )}
                      {reviewer && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">by TM {reviewer.display_name}</p>}
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${req.status === 'approved' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'}`}>
                      {req.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Evaluator requests (speaker-nominated) */}
      <div>
        <p className={labelCls}>Evaluator Requests ({evalPending.length})</p>
        {evalPending.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">No pending evaluator requests.</p>
        ) : (
          <div className="space-y-3">
            {evalPending.map(req => {
              const speaker   = memberMap.get(req.speaker_id);
              const evaluator = memberMap.get(req.preferred_evaluator_id);
              const meeting   = meetingMap.get(req.meeting_id);
              // Other speakers in the same meeting who nominated the same person —
              // only one can be approved, so surface the competing requests.
              const coRequesters = evalPending.filter(
                r => r.id !== req.id && r.speaker_id !== req.speaker_id && r.meeting_id === req.meeting_id && r.preferred_evaluator_id === req.preferred_evaluator_id,
              );
              return (
                <div key={req.id} className={`${cardCls} p-4 space-y-3 border-l-4 border-amber-400 dark:border-amber-600`}>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      🎙️ TM {speaker?.display_name ?? 'Unknown'} <span className="font-normal text-slate-400">wants</span> ⚖️ TM {evaluator?.display_name ?? 'Unknown'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {meeting ? `Meeting #${meeting.number} · ${new Date(meeting.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Unknown meeting'} · {req.speaker_slot_index != null ? `Evaluator slot ${req.speaker_slot_index}` : 'Awaiting extra-slot approval'}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                      Requested {new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {coRequesters.length > 0 && (
                    <div className="rounded-lg bg-amber-100/70 dark:bg-amber-900/30 border border-amber-300/60 dark:border-amber-700/50 px-2.5 py-2">
                      <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                        ⚠️ TM {evaluator?.display_name ?? 'This evaluator'} is also requested by {coRequesters.length} other speaker{coRequesters.length > 1 ? 's' : ''}:
                      </p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        {coRequesters.map(r => `TM ${memberMap.get(r.speaker_id)?.display_name ?? 'Unknown'}${r.speaker_slot_index != null ? ` (slot ${r.speaker_slot_index})` : ''}`).join(', ')}
                      </p>
                      <p className="text-[10px] text-amber-600/80 dark:text-amber-500/80 mt-0.5">Only one can be approved — approving this one leaves the others to deny.</p>
                    </div>
                  )}
                  <textarea
                    value={commentInputs[req.id] ?? ''}
                    onChange={e => setCommentInputs(prev => ({ ...prev, [req.id]: e.target.value }))}
                    placeholder="Add a comment (required for deny, optional for approve)…"
                    rows={2}
                    className={`${inputCls} text-xs resize-none`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveEval(req)}
                      disabled={acting === req.id}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl py-2.5 disabled:opacity-40 active:scale-95 transition-all">
                      {acting === req.id ? '…' : '✓ Approve & assign'}
                    </button>
                    <button
                      onClick={() => denyEval(req)}
                      disabled={acting === req.id}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl py-2.5 disabled:opacity-40 active:scale-95 transition-all">
                      {acting === req.id ? '…' : '✗ Deny'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {evalResolved.length > 0 && (
          <div className="mt-3 space-y-2">
            {evalResolved.map(req => {
              const speaker   = memberMap.get(req.speaker_id);
              const evaluator = memberMap.get(req.preferred_evaluator_id);
              const meeting   = meetingMap.get(req.meeting_id);
              const reviewer  = req.reviewer_id ? memberMap.get(req.reviewer_id) : null;
              const tone = req.status === 'approved'
                ? 'border-emerald-400 dark:border-emerald-600'
                : req.status === 'denied'
                ? 'border-red-400 dark:border-red-700'
                : 'border-slate-300 dark:border-slate-600';
              return (
                <div key={req.id} className={`${cardCls} p-3 border-l-4 ${tone}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        🎙️ TM {speaker?.display_name ?? '?'} → ⚖️ TM {evaluator?.display_name ?? '?'}
                        {meeting ? ` · Meeting #${meeting.number}` : ''}
                      </p>
                      {req.review_comment && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 italic">&ldquo;{req.review_comment}&rdquo;</p>
                      )}
                      {reviewer && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">by TM {reviewer.display_name}</p>}
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      req.status === 'approved'
                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                        : req.status === 'denied'
                        ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                      {req.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* History */}
      {resolved.length > 0 && (
        <div>
          <p className={labelCls}>History</p>
          <div className="space-y-2">
            {resolved.map(req => {
              const member  = memberMap.get(req.member_id);
              const meeting = meetingMap.get(req.meeting_id);
              const reviewer = req.reviewer_id ? memberMap.get(req.reviewer_id) : null;
              return (
                <div key={req.id} className={`${cardCls} p-3 border-l-4 ${req.status === 'approved' ? 'border-emerald-400 dark:border-emerald-600' : 'border-red-400 dark:border-red-700'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {req.status === 'approved' ? '✓' : '✗'} TM {member?.display_name ?? '?'}
                        {meeting ? ` · Meeting #${meeting.number}` : ''}
                      </p>
                      {req.review_comment && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 italic">&ldquo;{req.review_comment}&rdquo;</p>
                      )}
                      {reviewer && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">by TM {reviewer.display_name}</p>}
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${req.status === 'approved' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'}`}>
                      {req.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agenda settings ──────────────────────────────────────────────────────────

function TimerMMSS({ value, onChange }: { value: number; onChange: (secs: number) => void }) {
  const m = Math.floor(value / 60);
  const s = value % 60;
  const cls = 'w-12 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-1 text-sm text-center bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-maroon-600';
  return (
    <span className="inline-flex items-center gap-1">
      <input type="number" min={0} max={59} value={m} aria-label="minutes"
        onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0) * 60 + s)} className={cls} />
      <span className="text-slate-400 text-sm">:</span>
      <input type="number" min={0} max={59} value={s} aria-label="seconds"
        onChange={e => onChange(m * 60 + Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))} className={cls} />
    </span>
  );
}

// The reservation setting is stored as "days before the meeting", but admins
// think in weekdays — so it's presented as the day roles open. Covers the two
// weeks before a meeting, which is as far back as any window needs to reach.
function reservationOpenDayOptions(meetingWeekday: number): { days: number; label: string }[] {
  return Array.from({ length: 14 }, (_, days) => {
    const wd = (((meetingWeekday - days) % 7) + 7) % 7;
    const label = days === 0
      ? `${WEEKDAY_LABELS[wd]} — meeting day`
      : days < 7
        ? WEEKDAY_LABELS[wd]
        : `${WEEKDAY_LABELS[wd]} — the week before`;
    return { days, label };
  });
}

function AgendaSettingsPanel({ meetings }: { meetings: MeetingWithClaims[] }) {
  const supabase = createClient();
  const [vals, setVals] = useState({
    networking_mins: 10,
    l1_speech_mins: 6, other_speech_mins: 7, tt_speaker_count_min: 4,
    tt_speaker_count_max: 5, tt_mins_per_speaker: 2, tmod_conclusion_mins: 5, lock_before_mins: 60,
    max_speaker_slots: 2, online_reservation_days_before: DEFAULT_RESERVATION_DAYS_BEFORE,
    offline_reservation_days_before: DEFAULT_OFFLINE_RESERVATION_DAYS_BEFORE,
  });
  const [reservationEnabled, setReservationEnabled] = useState(false);
  const [offlineReservationEnabled, setOfflineReservationEnabled] = useState(false);
  const [autoSchedulePaused, setAutoSchedulePaused] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleConfig>({ weekday: 6, startTime: '19:30', endTime: '21:00' });
  const [defaultDisabledRoles, setDefaultDisabledRoles] = useState<RoleKey[]>([]);
  const [timerModes, setTimerModes] = useState<TimerModes>(DEFAULT_TIMER_MODES);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    supabase.from('agenda_config').select('*').single().then(({ data }) => {
      if (data) {
        setVals({ networking_mins: data.networking_mins ?? 10, l1_speech_mins: data.l1_speech_mins, other_speech_mins: data.other_speech_mins, tt_speaker_count_min: data.tt_speaker_count_min, tt_speaker_count_max: data.tt_speaker_count_max, tt_mins_per_speaker: data.tt_mins_per_speaker, tmod_conclusion_mins: data.tmod_conclusion_mins, lock_before_mins: data.lock_before_mins ?? 60, max_speaker_slots: data.max_speaker_slots ?? 2, online_reservation_days_before: data.online_reservation_days_before ?? DEFAULT_RESERVATION_DAYS_BEFORE, offline_reservation_days_before: data.offline_reservation_days_before ?? DEFAULT_OFFLINE_RESERVATION_DAYS_BEFORE });
        setReservationEnabled(data.online_reservation_enabled === true);
        setOfflineReservationEnabled(data.offline_reservation_enabled === true);
        setAutoSchedulePaused(data.auto_schedule_paused === true);
        setSchedule({ weekday: data.schedule_weekday ?? 6, startTime: data.schedule_start_time ?? '19:30', endTime: data.schedule_end_time ?? '21:00' });
        setDefaultDisabledRoles((data.default_disabled_roles ?? []) as RoleKey[]);
        setTimerModes(normalizeModes(data.timer_modes));
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setTimerThreshold(key: TimerModeKey, field: keyof TimerThresholds, secs: number) {
    setTimerModes(prev => ({ ...prev, [key]: { ...prev[key], [field]: secs } }));
  }

  function toggleDefaultRole(key: RoleKey) {
    setDefaultDisabledRoles(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  async function save() {
    setSaving(true);
    setSaveError(false);
    const { error } = await supabase.from('agenda_config').upsert({
      id: 1, ...vals,
      schedule_weekday: schedule.weekday,
      schedule_start_time: schedule.startTime,
      schedule_end_time: schedule.endTime,
      default_disabled_roles: defaultDisabledRoles,
      timer_modes: timerModes,
      online_reservation_enabled: reservationEnabled,
      offline_reservation_enabled: offlineReservationEnabled,
      auto_schedule_paused: autoSchedulePaused,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      console.error('[agenda_config] save failed', error);
      setSaveError(true);
      setTimeout(() => setSaveError(false), 4000);
      return;
    }
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  function numField(key: keyof typeof vals, label: string, hint?: string, min = 1) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</p>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
        <input type="number" min={min} max={60} value={vals[key]}
          onChange={e => setVals(v => ({ ...v, [key]: parseInt(e.target.value) || min }))}
          className="w-16 shrink-0 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm text-center bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-maroon-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Meeting schedule */}
      <div className={`${cardCls} p-5 space-y-5`}>
        <div>
          <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">Meeting Schedule</h3>
          <p className="text-xs text-slate-500">Used to auto-create upcoming meetings when fewer than 3 are scheduled.</p>
        </div>
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input type="checkbox" checked={autoSchedulePaused} onChange={e => setAutoSchedulePaused(e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-maroon-700 rounded shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Pause automatic scheduling
            </span>
            <span className="block text-xs text-slate-500">
              Checked = the weekly cron creates nothing. Members see &ldquo;Our next meeting will be
              scheduled soon&rdquo; until one is created — by you here, or by unchecking this.
            </span>
          </span>
        </label>
        <div className={autoSchedulePaused ? 'opacity-40 pointer-events-none space-y-3' : 'space-y-3'}>
          <div>
            <p className={labelCls}>Default day of week</p>
            <select value={schedule.weekday} onChange={e => setSchedule(s => ({ ...s, weekday: parseInt(e.target.value) }))}
              className={`${inputCls} mt-1`}>
              {WEEKDAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={labelCls}>Default start time</p>
              <TimePicker value={schedule.startTime} onChange={v => setSchedule(s => ({ ...s, startTime: v }))} />
            </div>
            <div>
              <p className={labelCls}>Default end time</p>
              <TimePicker value={schedule.endTime} onChange={v => setSchedule(s => ({ ...s, endTime: v }))} />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <p className={labelCls}>Default roles for new meetings</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 mb-1.5">New meetings (manual or auto-scheduled) open with these categories on. Tap to enable/disable. Greyed = off by default.</p>
            <div className="flex flex-wrap gap-1.5">
              {TOGGLEABLE_ROLES.map(({ key, label }) => {
                const enabled = !defaultDisabledRoles.includes(key);
                return (
                  <button key={key} type="button" onClick={() => toggleDefaultRole(key)}
                    aria-pressed={enabled}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all active:scale-95 ${
                      enabled
                        ? 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-600 line-through'
                    }`}>
                    {enabled ? '✓' : '✕'} {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <button onClick={save} disabled={saving} className={`w-full ${saveError ? 'bg-red-600 hover:bg-red-700 text-white' : primaryBtn}`}>{saveError ? '✗ Save failed — retry' : saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Settings'}</button>
      </div>

      {/* Agenda timing */}
      <div className={`${cardCls} p-5 space-y-5`}>
        <div>
          <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">Agenda Timing</h3>
          <p className="text-xs text-slate-500">Changes apply immediately to any agenda opened after saving.</p>
        </div>
        <div className="space-y-1"><p className={labelCls}>Opening</p><div className="pt-1">{numField('networking_mins', 'Networking / Meet & Greet (mins)', 'Buffer before the meeting is called to order — set to 0 to skip', 0)}</div></div>
        <div className="space-y-1"><p className={labelCls}>Prepared Speeches</p><div className="space-y-3 pt-1">{numField('l1_speech_mins', 'L1 speech max (mins)', 'Pathways Level 1 — standard is 6')}{numField('other_speech_mins', 'Other speech max (mins)', 'Levels 2–5 — standard is 7')}</div></div>
        <div className="space-y-1"><p className={labelCls}>Table Topics</p><div className="space-y-3 pt-1">{numField('tt_speaker_count_min', 'Min speakers')}{numField('tt_speaker_count_max', 'Max speakers')}{numField('tt_mins_per_speaker', 'Max mins per speaker', 'Standard TT is 1–2½ min each')}</div></div>
        <div className="space-y-1"><p className={labelCls}>Closing</p><div className="pt-1">{numField('tmod_conclusion_mins', 'TMoD theme conclusion (mins)')}</div></div>
        <div className="space-y-1"><p className={labelCls}>Speaker Slots</p><div className="pt-1">{numField('max_speaker_slots', 'Max speaker slots per meeting', 'Upper cap for extra-slot requests. Meetings start with 1.')}</div></div>
        <div className="space-y-1"><p className={labelCls}>Role Sign-up Lock</p><div className="pt-1">{numField('lock_before_mins', 'Lock roles before meeting (mins)', 'Roles become read-only this many minutes before start')}</div></div>
        <button onClick={save} disabled={saving} className={`w-full ${saveError ? 'bg-red-600 hover:bg-red-700 text-white' : primaryBtn}`}>{saveError ? '✗ Save failed — retry' : saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Settings'}</button>
      </div>

      {/* Role reservation for online-only members */}
      <div className={`${cardCls} p-5 space-y-5`}>
        <div>
          <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">Role Reservation</h3>
          <p className="text-xs text-slate-500">
            Hold every role for members who attend <strong>online only</strong>, then open them to the whole club
            closer to the meeting. Set each member&apos;s mode under <strong>Members → Attends</strong>. The
            no-same-role-back-to-back rule applies in both phases.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input type="checkbox" checked={reservationEnabled} onChange={e => setReservationEnabled(e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-maroon-700 rounded shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Reserve roles for online-only members
            </span>
            <span className="block text-xs text-slate-500">
              Off = every role is open to everyone as soon as the meeting is created.
            </span>
          </span>
        </label>

        <div className={reservationEnabled ? '' : 'opacity-40 pointer-events-none'}>
          <p className={labelCls}>Roles open to everyone on</p>
          <select
            value={vals.online_reservation_days_before}
            onChange={e => setVals(v => ({ ...v, online_reservation_days_before: parseInt(e.target.value) }))}
            className={`${inputCls} mt-1`}
          >
            {reservationOpenDayOptions(schedule.weekday).map(({ days, label }) => (
              <option key={days} value={days}>{label}</option>
            ))}
          </select>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
            Roles open at midnight IST on that day and stay open right through the meeting. Days are counted
            back from each meeting&apos;s own date, so a meeting moved off {WEEKDAY_LABELS[schedule.weekday]}
            {' '}shifts its opening day with it.
          </p>

          {(() => {
            const next = meetings.filter(m => !isMeetingPast(m)).sort((a, b) => a.number - b.number)[0];
            const window = next ? roleReservation(next, true, vals.online_reservation_days_before) : null;
            if (!next || !window) return null;
            return (
              <p className="text-xs text-slate-500 mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 leading-relaxed">
                Next up — <strong>Meeting #{next.number}</strong> on {formatMeetingDate(next.date)}: online-only
                members can claim now, everyone else from{' '}
                <strong className="text-slate-700 dark:text-slate-300">{formatMeetingDate(window.opensOn)}</strong>.
              </p>
            );
          })()}
        </div>

        <button onClick={save} disabled={saving} className={`w-full ${saveError ? 'bg-red-600 hover:bg-red-700 text-white' : primaryBtn}`}>{saveError ? '✗ Save failed — retry' : saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Settings'}</button>
      </div>

      {/* Role sign-up window for visiting WIC India club members */}
      <div className={`${cardCls} p-5 space-y-5`}>
        <div>
          <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">
            {WIC_CLUB_NAME}
          </h3>
          <p className="text-xs text-slate-500">
            Members of our sister club see everything our own members see, but sign up for roles only in
            the last few days — so {HOME_CLUB_NAME} members get first pick. Mark a member as{' '}
            <strong>WIC</strong> under <strong>Members → Attends</strong>. This window is separate from the
            online reservation above; a WIC member answers to this one only.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input type="checkbox" checked={offlineReservationEnabled} onChange={e => setOfflineReservationEnabled(e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-maroon-700 rounded shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Hold roles back from {WIC_CLUB_SHORT} members
            </span>
            <span className="block text-xs text-slate-500">
              Off = WIC members can claim any open role as soon as a meeting is created.
            </span>
          </span>
        </label>

        <div className={offlineReservationEnabled ? '' : 'opacity-40 pointer-events-none'}>
          <p className={labelCls}>Roles open to {WIC_CLUB_SHORT} members on</p>
          <select
            value={vals.offline_reservation_days_before}
            onChange={e => setVals(v => ({ ...v, offline_reservation_days_before: parseInt(e.target.value) }))}
            className={`${inputCls} mt-1`}
          >
            {reservationOpenDayOptions(schedule.weekday).map(({ days, label }) => (
              <option key={days} value={days}>{label}</option>
            ))}
          </select>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
            Counted back from each meeting&apos;s own date, opening at midnight IST. Until then a WIC member
            can still request a role and an officer assigns it.
          </p>

          {(() => {
            const next = meetings.filter(m => !isMeetingPast(m)).sort((a, b) => a.number - b.number)[0];
            const window = next ? offlineClaimWindow(next, true, vals.offline_reservation_days_before) : null;
            if (!next || !window) return null;
            return (
              <p className="text-xs text-slate-500 mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 leading-relaxed">
                Next up — <strong>Meeting #{next.number}</strong> on {formatMeetingDate(next.date)}:{' '}
                {WIC_CLUB_SHORT} members can claim from{' '}
                <strong className="text-slate-700 dark:text-slate-300">{formatMeetingDate(window.opensOn)}</strong>.
              </p>
            );
          })()}
        </div>

        <button onClick={save} disabled={saving} className={`w-full ${saveError ? 'bg-red-600 hover:bg-red-700 text-white' : primaryBtn}`}>{saveError ? '✗ Save failed — retry' : saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Settings'}</button>
      </div>

      {/* Speech timer */}
      <div className={`${cardCls} p-5 space-y-5`}>
        <div>
          <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">Speech Timer</h3>
          <p className="text-xs text-slate-500">Club-wide green / yellow / red times and grace period for the <Link href="/timer" className="text-maroon-600 dark:text-maroon-400 underline">timer page</Link>. Shown as mm:ss; grace is the extra time allowed after red.</p>
        </div>
        {TIMER_MODE_META.map(({ key, label, hint }) => (
          <div key={key} className="space-y-2">
            <p className={labelCls}>{label} <span className="text-slate-400 normal-case font-medium">· {hint}</span></p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-0.5">
              {(['green', 'yellow', 'red', 'grace'] as const).map(field => (
                <div key={field} className="flex items-center justify-between gap-2">
                  <span className="text-sm capitalize text-slate-700 dark:text-slate-300">{field}</span>
                  <TimerMMSS value={timerModes[key][field]} onChange={s => setTimerThreshold(key, field, s)} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <button onClick={save} disabled={saving} className={`w-full ${saveError ? 'bg-red-600 hover:bg-red-700 text-white' : primaryBtn}`}>{saveError ? '✗ Save failed — retry' : saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Settings'}</button>
      </div>
    </div>
  );
}

// ─── Announcement panel ───────────────────────────────────────────────────────

function AnnouncementPanel({ current, onChanged }: { current: Announcement | null; onChanged: () => void }) {
  const supabase = createClient();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  async function post() {
    if (!text.trim()) return; setSaving(true);
    const message = text.trim();
    await supabase.from('announcements').update({ active: false }).eq('active', true);
    await supabase.from('announcements').insert({ message, active: true });
    // Offer to email all members about the new announcement.
    if (confirm('Email all members about this announcement?')) {
      fetch('/api/notify-announcement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      }).catch(() => {});
    }
    setText(''); setSaving(false); onChanged();
  }

  async function clear() {
    if (!current) return;
    await supabase.from('announcements').update({ active: false }).eq('id', current.id);
    onChanged();
  }

  return (
    <div className="space-y-4 pb-8">
      {current && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-500 mb-2">Active announcement</p>
          <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{current.message}</p>
          <button onClick={clear} className="mt-3 text-xs text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300">Clear announcement</button>
        </div>
      )}
      <div className={`${cardCls} p-5 space-y-3`}>
        <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm">{current ? 'Replace announcement' : 'Post announcement'}</h3>
        <p className="text-xs text-slate-500 -mt-1">Shown as a banner to all users when they open the app.</p>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Type your announcement here…" rows={3}
          className={`${inputCls} resize-none`} />
        <button onClick={post} disabled={!text.trim() || saving} className={`w-full ${primaryBtn}`}>{saving ? 'Posting…' : 'Post'}</button>
      </div>
    </div>
  );
}

// ─── Voting controls ──────────────────────────────────────────────────────────

function VotingControls({ meeting, ballot, allMembers, onChanged }: { meeting: MeetingWithClaims; ballot: Ballot | null; allMembers: Member[]; onChanged: () => void }) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [voterCount, setVoterCount] = useState('');
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [results, setResults] = useState<VoteResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [ttSpeakers, setTtSpeakers] = useState<TTSpeaker[]>(ballot?.table_topics_speakers ?? []);
  const [addMemberId, setAddMemberId] = useState('');
  const [guestNameInput, setGuestNameInput] = useState('');
  const [savingTT, setSavingTT] = useState(false);

  useEffect(() => { setTtSpeakers(ballot?.table_topics_speakers ?? []); }, [ballot?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ballot || ballot.status !== 'open') { setLiveCount(null); return; }
    async function fetchCount() {
      const { data } = await supabase.rpc('get_vote_count', { p_ballot_id: ballot!.id });
      if (data !== null) {
        const count = Number(data); setLiveCount(count);
        if (ballot!.voter_count && count >= ballot!.voter_count) {
          await supabase.from('ballots').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', ballot!.id);
          onChanged();
        }
      }
    }
    fetchCount();
    const t = setInterval(fetchCount, 5000);
    return () => clearInterval(t);
  }, [ballot?.id, ballot?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ballot || !showResults) return;
    supabase.rpc('get_ballot_results', { p_ballot_id: ballot.id }).then(({ data }) => { if (data) setResults(data as VoteResult[]); });
  }, [ballot?.id, showResults]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showShare || qrDataUrl) return;
    import('qrcode').then(QRCode => QRCode.toDataURL(window.location.origin, { width: 240, margin: 2, color: { dark: '#004165', light: '#ffffff' } }).then(setQrDataUrl));
  }, [showShare, qrDataUrl]);

  async function saveTT(speakers: TTSpeaker[]) {
    setSavingTT(true); setTtSpeakers(speakers);
    if (ballot) await supabase.from('ballots').update({ table_topics_speakers: speakers }).eq('id', ballot.id);
    else await supabase.from('ballots').upsert({ meeting_id: meeting.id, status: 'not_started', table_topics_speakers: speakers }, { onConflict: 'meeting_id' });
    setSavingTT(false); onChanged();
  }

  async function addTTMember() {
    if (!addMemberId) return;
    const member = allMembers.find(m => m.id === addMemberId);
    if (!member || ttSpeakers.some(s => s.id === addMemberId)) return;
    await saveTT([...ttSpeakers, { id: addMemberId, name: member.display_name, is_guest: false }]);
    setAddMemberId('');
  }

  async function addTTGuest() {
    const name = guestNameInput.trim(); if (!name) return;
    await saveTT([...ttSpeakers, { id: `guest-${Date.now()}`, name, is_guest: true }]);
    setGuestNameInput('');
  }

  async function openVoting() {
    setBusy(true);
    const payload = { status: 'open' as const, meeting_code: null, voter_count: voterCount ? parseInt(voterCount) : null, table_topics_speakers: ttSpeakers, opened_at: new Date().toISOString(), closed_at: null };
    if (ballot) await supabase.from('ballots').update(payload).eq('id', ballot.id);
    else await supabase.from('ballots').insert({ meeting_id: meeting.id, ...payload });
    setBusy(false); setShowOpen(false); onChanged();
  }

  async function handleShare() {
    const url = window.location.origin;
    if (navigator.share) await navigator.share({ title: `Meeting #${meeting.number} — Vote Now`, url }).catch(() => {});
    else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  async function closeVoting() {
    if (!ballot) return; setBusy(true);
    await supabase.from('ballots').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', ballot.id);
    setBusy(false); onChanged();
  }

  async function reopenVoting() {
    if (!ballot || !window.confirm('Re-opening will clear all existing votes. Continue?')) return;
    setBusy(true);
    await supabase.rpc('delete_ballot_votes', { p_ballot_id: ballot.id });
    await supabase.from('ballots').update({ status: 'open', closed_at: null, voter_count: null }).eq('id', ballot.id);
    setBusy(false); setShowResults(false); setLiveCount(null); setResults([]); onChanged();
  }

  async function resetBallot() {
    if (!ballot || resetInput !== String(meeting.number)) return; setBusy(true);
    await supabase.rpc('delete_ballot_votes', { p_ballot_id: ballot.id });
    await supabase.from('ballots').update({ status: 'not_started', meeting_code: null, voter_count: null, table_topics_speakers: [], opened_at: null, closed_at: null }).eq('id', ballot.id);
    setBusy(false); setShowReset(false); setResetInput(''); setShowShare(false); setQrDataUrl(''); setShowResults(false); setResults([]); setLiveCount(null); setTtSpeakers([]); setVoterCount(''); setShowOpen(false); onChanged();
  }

  const status = ballot?.status ?? 'not_started';
  const availableMembers = allMembers.filter(m => !ttSpeakers.some(s => s.id === m.id));
  const CAT_LABELS: Record<string, string> = { speaker: '🎙️ Best Speaker', evaluator: '⚖️ Best Evaluator', table_topics: '💬 Best Table Topics Speaker', role_player: '🎤 Best Role Player', aux_role: '⏱️ Best Auxiliary Role Player' };

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-700/40 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm shrink-0">🗳️</span>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">Voting · Meeting #{meeting.number}</span>
          <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            status === 'open'
              ? 'bg-emerald-100 dark:bg-emerald-400/15 text-emerald-700 dark:text-emerald-400'
              : status === 'closed'
              ? 'bg-amber-100 dark:bg-gold-300/15 text-amber-700 dark:text-gold-300'
              : 'bg-slate-100 dark:bg-slate-700/60 text-slate-500'
          }`}>
            {status === 'not_started' ? 'Not started' : status === 'open' ? 'Open' : 'Closed'}
          </span>
        </div>
        {status === 'open' && liveCount !== null && (
          <span className="text-xs text-slate-500 shrink-0">{liveCount}{ballot?.voter_count ? ` / ${ballot.voter_count}` : ''} vote{liveCount !== 1 ? 's' : ''}</span>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        {(status === 'not_started' || status === 'open') && (
          <div>
            <p className={labelCls}>💬 Table Topics Speakers</p>
            {ttSpeakers.length > 0 && (
              <div className="space-y-1 mb-2">
                {ttSpeakers.map(s => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/60">
                    <span className="text-xs text-slate-700 dark:text-slate-300 flex-1 min-w-0 truncate">{s.is_guest ? `${s.name} (Guest)` : `TM ${s.name}`}</span>
                    <button onClick={() => saveTT(ttSpeakers.filter(x => x.id !== s.id))} disabled={savingTT} className="text-xs text-slate-400 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 px-1 shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 mb-2">
              <select value={addMemberId} onChange={e => setAddMemberId(e.target.value)} className={`flex-1 min-w-0 ${selectCls}`}>
                <option value="">Add a member…</option>
                {availableMembers.map(m => <option key={m.id} value={m.id}>TM {m.display_name}</option>)}
              </select>
              <button onClick={addTTMember} disabled={!addMemberId || savingTT} className={`shrink-0 ${primaryBtn} !px-3 !py-2 !text-xs`}>Add</button>
            </div>
            <div className="flex gap-2">
              <input type="text" value={guestNameInput} onChange={e => setGuestNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTTGuest()} placeholder="Guest name…" className={`flex-1 min-w-0 ${inputCls}`} />
              <button onClick={addTTGuest} disabled={!guestNameInput.trim() || savingTT} className={`shrink-0 ${ghostBtn} !px-3 !py-2 !text-xs`}>+ Guest</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {status === 'not_started' && !showOpen && <button onClick={() => setShowOpen(true)} className={primaryBtn}>🗳️ Open voting</button>}
          {status === 'open' && <>
            <button onClick={closeVoting} disabled={busy} className="text-sm font-semibold bg-gold-300 text-slate-900 px-4 py-2 rounded-xl disabled:opacity-50 active:scale-95 transition-transform">Close voting</button>
            <button onClick={() => setShowShare(!showShare)} className={ghostBtn}>📤 Share link</button>
            <button onClick={() => setShowResults(!showResults)} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-3 py-2">{showResults ? 'Hide tallies' : 'Preview tallies'}</button>
          </>}
          {status === 'closed' && <>
            <button onClick={reopenVoting} disabled={busy} className={ghostBtn}>↩ Re-open &amp; reset votes</button>
            <button onClick={() => setShowResults(!showResults)} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-3 py-2">{showResults ? 'Hide results' : 'View results'}</button>
          </>}
          {ballot && <button onClick={() => setShowReset(!showReset)} className="text-xs text-red-400/60 dark:text-red-500/40 hover:text-red-500 dark:hover:text-red-400 px-3 py-2 ml-auto">Reset ballot</button>}
        </div>

        {showOpen && (
          <div className="bg-slate-100 dark:bg-slate-800/60 rounded-xl p-4 space-y-3">
            <label className="text-xs text-slate-500 block mb-1.5">Members present today? <span className="text-slate-400">(optional)</span></label>
            <input type="number" inputMode="numeric" min={1} value={voterCount} onChange={e => setVoterCount(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 25"
              className="w-28 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-lg font-bold text-slate-900 dark:text-slate-100 text-center focus:outline-none focus:ring-2 focus:ring-maroon-500" autoFocus />
            <div className="flex gap-2">
              <button onClick={openVoting} disabled={busy} className="text-sm font-semibold bg-emerald-600 text-white px-5 py-2.5 rounded-xl disabled:opacity-40 active:scale-95 transition-transform">{busy ? '…' : 'Start voting'}</button>
              <button onClick={() => { setShowOpen(false); setVoterCount(''); }} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-3">Cancel</button>
            </div>
          </div>
        )}

        {showShare && (
          <div className="bg-slate-100 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700 text-center">Share with members to vote</p>
            {qrDataUrl ? <img src={qrDataUrl} alt="QR code" className="w-52 h-52 mx-auto rounded-xl" /> : <div className="w-52 h-52 mx-auto rounded-xl bg-slate-200 animate-pulse" />}
            <p className="text-[11px] text-slate-500 text-center font-mono break-all">{typeof window !== 'undefined' ? window.location.origin : ''}</p>
            <button onClick={handleShare} className="w-full bg-maroon-700 text-white rounded-xl py-3 text-sm font-semibold active:scale-95 transition-transform">{copied ? '✓ Copied!' : '📤 Share / Copy link'}</button>
          </div>
        )}

        {showResults && (
          <div className="bg-slate-100 dark:bg-slate-800/50 rounded-xl p-3 space-y-3">
            {results.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-600 text-center py-2">No votes yet.</p>}
            {Object.entries(CAT_LABELS).map(([cat, label]) => {
              const catRows = results.filter(r => r.category === cat);
              if (!catRows.length) return null;
              return (
                <div key={cat}>
                  <p className={`${labelCls} mb-1`}>{label}</p>
                  {catRows.map((r, i) => (
                    <div key={`${r.voted_for_member_id ?? r.voted_for_display_name}-${i}`} className="flex items-center gap-2 py-0.5">
                      <span className={`text-xs ${i === 0 ? 'text-amber-500 dark:text-gold-300' : 'text-transparent'}`}>★</span>
                      <span className={`text-sm ${i === 0 ? 'text-amber-700 dark:text-gold-200 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>{r.voted_for_display_name}</span>
                      <span className="ml-auto text-xs text-slate-400 dark:text-slate-600">{r.vote_count} vote{r.vote_count !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {showReset && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/20 rounded-xl p-3">
            <p className="text-xs text-red-600 dark:text-red-300 mb-2">Type <strong className="font-mono">{meeting.number}</strong> to wipe all votes and fully reset this ballot.</p>
            <div className="flex gap-2">
              <input type="text" value={resetInput} onChange={e => setResetInput(e.target.value)} placeholder={String(meeting.number)}
                className="flex-1 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-1.5 text-sm border border-red-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-red-500" />
              <button onClick={resetBallot} disabled={busy || resetInput !== String(meeting.number)} className="text-xs font-semibold bg-red-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-40">{busy ? '…' : 'Reset'}</button>
              <button onClick={() => { setShowReset(false); setResetInput(''); }} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Usage / app-tracking panel ────────────────────────────────────────────────

type CaptureRow = DeviceCapture & { member?: { display_name: string } | null };

function UsagePanel({ currentMemberId }: { currentMemberId: string }) {
  const [captures, setCaptures] = useState<CaptureRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/captures?memberId=${encodeURIComponent(currentMemberId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Admin access required.' : 'Could not load usage data.');
        return r.json();
      })
      .then((d) => setCaptures(d.captures as CaptureRow[]))
      .catch((e) => setError(e.message));
  }, [currentMemberId]);

  if (error) return <div className="text-center py-16 text-red-500 dark:text-red-400 text-sm">{error}</div>;
  if (!captures) return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-slate-200 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>;
  if (captures.length === 0) return <div className="text-center py-16 text-slate-400 dark:text-slate-600 text-sm">No usage recorded yet.</div>;

  const uniqueVisitors = new Set(captures.map((c) => c.visitor_id ?? c.ip ?? c.id)).size;
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const last7 = captures.filter((c) => c.created_at >= since).length;

  // Top breakdowns
  const tally = (key: (c: CaptureRow) => string | null) => {
    const m = new Map<string, number>();
    for (const c of captures) {
      const v = key(c) || 'Unknown';
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byLocation = tally((c) => [c.city, c.country].filter(Boolean).join(', ') || null).slice(0, 8);
  const byDevice   = tally((c) => c.device_type).slice(0, 5);
  const byBrowser  = tally((c) => c.browser).slice(0, 5);

  const fmtTime = (s: string) => new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const Stat = ({ label, value }: { label: string; value: number }) => (
    <div className={`${cardCls} p-3 text-center`}>
      <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">{label}</p>
    </div>
  );

  const BreakdownCard = ({ title, rows }: { title: string; rows: [string, number][] }) => {
    const max = rows[0]?.[1] ?? 1;
    return (
      <div className={`${cardCls} p-4`}>
        <p className={labelCls}>{title}</p>
        <div className="space-y-1.5 mt-1">
          {rows.map(([name, count]) => (
            <div key={name} className="flex items-center gap-2">
              <span className="text-xs text-slate-700 dark:text-slate-300 w-32 shrink-0 truncate">{name}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-maroon-600 to-maroon-500 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500 w-8 text-right shrink-0">{count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Total opens" value={captures.length} />
        <Stat label="Unique devices" value={uniqueVisitors} />
        <Stat label="Last 7 days" value={last7} />
      </div>

      <BreakdownCard title="📍 Top locations" rows={byLocation} />
      <div className="grid grid-cols-1 gap-4">
        <BreakdownCard title="📱 Device type" rows={byDevice} />
        <BreakdownCard title="🌐 Browser" rows={byBrowser} />
      </div>

      <div>
        <p className={labelCls}>Recent sessions</p>
        <div className="space-y-2 mt-1">
          {captures.slice(0, 100).map((c) => (
            <div key={c.id} className={`${cardCls} p-3`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {c.member?.display_name ? `TM ${c.member.display_name}` : 'Anonymous visitor'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {[c.browser, c.os, c.device_type].filter(Boolean).join(' · ') || 'Unknown device'}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                    {[c.city, c.region, c.country].filter(Boolean).join(', ') || 'Location unknown'}
                    {c.ip ? ` · ${c.ip}` : ''}
                  </p>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-600 shrink-0 text-right">{fmtTime(c.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
        {captures.length > 100 && (
          <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-3">Showing 100 of {captures.length} most recent.</p>
        )}
      </div>
    </div>
  );
}

// ─── Admin panel ──────────────────────────────────────────────────────────────

function AdminPanel({ currentMember }: { currentMember: Member }) {
  const supabase = createClient();
  const [meetings, setMeetings] = useState<MeetingWithClaims[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [ballotsMap, setBallotsMap] = useState<Map<string, Ballot>>(new Map());
  const [guestRegs, setGuestRegs] = useState<GuestRegistration[]>([]);
  const [currentAnnouncement, setCurrentAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'meetings' | 'members' | 'guests' | 'requests' | 'announce' | 'settings' | 'usage' | 'email' | 'whatsapp' | 'surveys'>('meetings');
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<MeetingWithClaims | null>(null);
  const [memberFilter, setMemberFilter] = useState<'active' | 'all'>('active');
  const [memberSearch, setMemberSearch] = useState('');
  // WIC India members belong to a different club, so the Members tab is our own
  // roster by default and reveals them on request.
  const [showWicMembers, setShowWicMembers] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(null);
  const [autoSchedulePaused, setAutoSchedulePaused] = useState(false);
  const [autoFillStatus, setAutoFillStatus] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const autoFilledRef = useRef(false);

  const fetchAll = useCallback(async () => {
    const [{ data: m }, { data: mb }, { data: bl }, { data: gr }, { data: ann }, { data: cfg }] = await Promise.all([
      supabase.from('meetings').select('*, role_claims(*, member:members(*)), evaluator_requests(*)').order('number', { ascending: false }).limit(20),
      supabase.from('members').select('*').order('name'),
      supabase.from('ballots').select('*'),
      supabase.from('guest_registrations').select('*').order('created_at', { ascending: false }),
      supabase.from('announcements').select('*').eq('active', true).order('created_at', { ascending: false }).limit(1),
      supabase.from('agenda_config').select('schedule_weekday, schedule_start_time, schedule_end_time, auto_schedule_paused').single(),
    ]);
    if (m)  setMeetings(m as MeetingWithClaims[]);
    if (mb) setMembers(mb as Member[]);
    if (bl) setBallotsMap(new Map((bl as Ballot[]).map(b => [b.meeting_id, b])));
    if (gr) setGuestRegs(gr as GuestRegistration[]);
    setCurrentAnnouncement((ann as Announcement[] | null)?.[0] ?? null);
    if (cfg) setScheduleConfig({ weekday: cfg.schedule_weekday ?? 6, startTime: cfg.schedule_start_time ?? '19:30', endTime: cfg.schedule_end_time ?? '21:00' });
    setAutoSchedulePaused(cfg?.auto_schedule_paused === true);
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function fillMeetings(cfg: ScheduleConfig, allMeetings: MeetingWithClaims[], silent = false) {
    const upcoming = allMeetings.filter(m => !isMeetingPast(m)).sort((a, b) => a.number - b.number);
    // We only ever keep ONE upcoming meeting: the "next" meeting. It's created
    // only once the current one is over (i.e. no upcoming meetings remain).
    const needed = upcoming.length === 0 ? 1 : 0;
    if (needed <= 0) {
      if (!silent) setAutoFillStatus('Next meeting already exists.');
      return;
    }
    setFilling(true);
    const maxNumber = allMeetings.reduce((max, m) => Math.max(max, m.number), 0);
    // Advance from whichever is later: today, or the last meeting on record — so
    // the next meeting always lands on the next configured weekday AFTER the most
    // recent meeting and never reuses or precedes an existing meeting's date.
    const latestDateStr = allMeetings.reduce((max, m) => (m.date > max ? m.date : max), '');
    const latestDate = latestDateStr ? new Date(latestDateStr + 'T00:00:00') : new Date(0);
    const now = new Date();
    const startFrom = latestDate > now ? latestDate : now;
    const rows = [];
    let cur = new Date(startFrom);
    let num = maxNumber + 1;
    for (let i = 0; i < needed; i++) {
      cur = nextWeekdayAfter(cur, cfg.weekday);
      rows.push({
        number: num++,
        date: toLocalDateStr(cur),
        start_time: cfg.startTime + ':00',
        end_time: cfg.endTime + ':00',
        theme: 'TBD',
        meeting_type: 'regular' as const,
        speaker_slots: 1,
        evaluator_slots: 1,
        base_speaker_slots: 1,
      });
    }
    const { data: created } = await supabase.from('meetings').insert(rows).select('id');
    setFilling(false);

    // Announce like every other meeting-creation path does (manual "+ Add
    // meeting" and the server cron both notify) — this used to just insert
    // and return, so meetings created from here went out with zero email or
    // WhatsApp announcement and no error to show for it.
    let notifyIssue = '';
    for (const m of created ?? []) {
      try {
        const res = await fetch('/api/notify-meeting-created', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingId: m.id }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) notifyIssue = ` — announcement failed: ${d.error ?? res.statusText}`;
      } catch {
        notifyIssue = ' — announcement could not be triggered (network error)';
      }
    }

    setAutoFillStatus(`✓ ${needed} meeting${needed > 1 ? 's' : ''} auto-scheduled (${rows.map(r => r.date).join(', ')})${notifyIssue}`);
    setTimeout(() => setAutoFillStatus(null), 6000);
    fetchAll();
  }

  // Auto-fill once on load: create the next meeting only if none is upcoming
  // and scheduling isn't paused — otherwise merely opening this tab would
  // silently defeat the pause toggle in Settings.
  useEffect(() => {
    if (loading || !scheduleConfig || autoFilledRef.current || autoSchedulePaused) return;
    autoFilledRef.current = true;
    const upcoming = meetings.filter(m => !isMeetingPast(m));
    if (upcoming.length === 0) fillMeetings(scheduleConfig, meetings, true);
  }, [loading, scheduleConfig, autoSchedulePaused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same notification as delete, but the meeting row stays — marked
  // cancelled with a reason — so it shows under Past Meetings instead of
  // vanishing. Aborting the prompt aborts the whole action (unlike delete,
  // there's nothing left to do if we're not cancelling).
  async function cancelMeeting(id: string) {
    const m = meetings.find(mt => mt.id === id);
    if (!m) return;
    const reason = window.prompt(`Cancel Meeting #${m.number} and notify all members?\n\nEnter a reason to include in the email/WhatsApp, or Cancel to abort.`);
    if (reason === null) return;
    const { error } = await supabase.from('meetings')
      .update({ cancelled: true, cancellation_reason: reason.trim() || null })
      .eq('id', id);
    if (error) { alert(`Failed: ${error.message}`); return; }
    fetch('/api/notify-meeting-cancelled', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingNumber: m.number, meetingDate: m.date,
        startTime: m.start_time, endTime: m.end_time, meetingTheme: m.theme,
        reason: reason.trim() || null,
      }),
    }).catch(() => {});
    fetchAll();
  }

  async function deleteMeeting(id: string) {
    if (!confirm('Delete this meeting and all its role claims? This cannot be undone.')) return;
    // Capture details BEFORE deletion so we can tell members it was cancelled.
    const m = meetings.find(mt => mt.id === id);
    // One prompt does both jobs: Cancel skips notifying entirely (same as
    // declining the old yes/no confirm), OK — even with blank text — notifies,
    // with whatever reason was typed included in the email and WhatsApp message.
    const reason = m
      ? window.prompt(`Notify all members that Meeting #${m.number} has been cancelled?\n\nEnter a reason to include in the email/WhatsApp, or Cancel to skip notifying.`)
      : null;
    await supabase.from('meetings').delete().eq('id', id);
    if (m && reason !== null) {
      fetch('/api/notify-meeting-cancelled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingNumber: m.number, meetingDate: m.date,
          startTime: m.start_time, endTime: m.end_time, meetingTheme: m.theme,
          reason: reason.trim() || null,
        }),
      }).catch(() => {});
    }
    fetchAll();
  }

  async function addMember(name: string, email: string, phone: string, whatsappEnabled: boolean) {
    const { data: created, error } = await supabase.from('members')
      .insert({
        membership_no: `MANUAL-${Date.now()}`, name, display_name: name, active: true,
        email: email || null,
        // Captured up front so the welcome can go out on WhatsApp too — added
        // later, it arrives after the member has already missed the introduction.
        phone: phone || null,
      })
      .select('id').single();
    if (error) { alert(`Failed: ${error.message}`); return; }

    if (created?.id) {
      // The WhatsApp permission is written on its own, and awaited: on its own
      // because a database still missing migration 058 must not lose the whole
      // member over an unknown column, and awaited because the welcome below
      // reads this exact flag to decide whether to message their phone.
      if (whatsappEnabled) {
        const { error: waErr } = await supabase.from('members')
          .update({ whatsapp_enabled: true }).eq('id', created.id);
        if (waErr) alert(`Member added, but WhatsApp could not be enabled: ${waErr.message}`);
      }
      // Welcome the new member (best-effort). The route decides per channel —
      // a member with no email may still be reachable on WhatsApp once they fill
      // in a phone number, and gating here would rule that out for both. The
      // WhatsApp half is skipped unless the box above was ticked.
      fetch('/api/notify-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetMemberId: created.id }),
      }).catch(() => {});
    }
    fetchAll();
  }

  const matchesMemberFilters = (m: Member) =>
    (memberFilter === 'all' || m.active)
    && (!memberSearch.trim()
      || m.name.toLowerCase().includes(memberSearch.toLowerCase())
      || m.display_name.toLowerCase().includes(memberSearch.toLowerCase()));

  // Our own roster and the visiting WIC India club, kept apart everywhere the
  // app talks about "club members".
  const clubMembers = members.filter(m => participationMode(m) !== 'offline');
  const wicMembers  = members.filter(m => participationMode(m) === 'offline');
  const displayedMembers    = clubMembers.filter(matchesMemberFilters);
  const displayedWicMembers = wicMembers.filter(matchesMemberFilters);

  const tabs = [
    { id: 'meetings'  as const, label: 'Meetings' },
    { id: 'members'   as const, label: 'Members' },
    { id: 'guests'    as const, label: 'Guests' },
    { id: 'requests'  as const, label: 'Requests' },
    { id: 'announce'  as const, label: 'Announce' },
    { id: 'usage'     as const, label: 'Usage' },
    { id: 'surveys'   as const, label: 'Surveys' },
    { id: 'email'     as const, label: 'Email' },
    { id: 'whatsapp'  as const, label: 'WhatsApp' },
    { id: 'settings'  as const, label: 'Settings' },
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
              <p className="text-[11px] font-bold text-white leading-tight">Admin Panel</p>
              <p className="text-[11px] font-semibold text-gold-300 leading-tight truncate">
                TM {currentMember.display_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-black uppercase tracking-wide bg-white/15 text-white/80 px-2.5 py-1 rounded-full">Admin</span>
            <Link href="/" className="text-[11px] font-semibold text-white/60 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-all min-h-[34px] flex items-center">
              ← App
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="sticky top-[88px] z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-2xl mx-auto px-2">
          <div className="flex flex-wrap justify-center sm:justify-start">
            {tabs.map(({ id, label }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`relative shrink-0 py-2.5 px-3 text-xs font-bold tracking-wide transition-all ${
                  tab === id
                    ? 'text-maroon-600 dark:text-maroon-400'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}>
                {label}
                {tab === id && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-maroon-500" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-slate-200 dark:bg-slate-900/60 rounded-2xl h-32 animate-pulse" />)}</div>
        ) : tab === 'settings' ? (
          <AgendaSettingsPanel meetings={meetings} />
        ) : tab === 'email' ? (
          <EmailSettingsPanel currentAdminId={currentMember.id} members={members} />
        ) : tab === 'whatsapp' ? (
          <WhatsAppSettingsPanel currentAdminId={currentMember.id} />
        ) : tab === 'surveys' ? (
          <AdminSurveysPanel members={members} />
        ) : tab === 'usage' ? (
          <UsagePanel currentMemberId={currentMember.id} />
        ) : tab === 'guests' ? (
          <GuestLog guestRegs={guestRegs} meetings={meetings} />
        ) : tab === 'requests' ? (
          <RequestsPanel allMembers={members} meetings={meetings} currentAdminId={currentMember.id} onChanged={fetchAll} />
        ) : tab === 'announce' ? (
          <AnnouncementPanel current={currentAnnouncement} onChanged={fetchAll} />
        ) : tab === 'meetings' ? (
          <div className="space-y-4 pb-8">
            {autoFillStatus && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                {autoFillStatus}
              </div>
            )}
            {!showNewMeeting && !editingMeeting && (
              <div className="flex gap-2">
                <button onClick={() => setShowNewMeeting(true)}
                  className="flex-1 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl py-4
                             text-slate-400 dark:text-slate-500 hover:border-maroon-400 dark:hover:border-maroon-700/60
                             hover:text-maroon-600 dark:hover:text-maroon-400 text-sm font-medium transition-colors">
                  + Add meeting
                </button>
                {scheduleConfig && (
                  <button
                    onClick={() => fillMeetings(scheduleConfig, meetings)}
                    disabled={filling || autoSchedulePaused}
                    title={autoSchedulePaused
                      ? 'Auto-scheduling is paused in Settings — unpause it there, or use "+ Add meeting" to create one manually'
                      : `Create the next ${WEEKDAY_LABELS[scheduleConfig.weekday]} meeting if none is upcoming`}
                    className={`shrink-0 px-4 py-2 rounded-2xl border-2 border-dashed text-sm font-medium transition-colors disabled:opacity-40 ${
                      filling || autoSchedulePaused
                        ? 'border-slate-300 dark:border-slate-700 text-slate-400'
                        : 'border-emerald-300 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-500 hover:border-emerald-400 dark:hover:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
                    }`}>
                    {filling ? '…' : '⚡ Auto-schedule'}
                  </button>
                )}
              </div>
            )}
            {showNewMeeting && <MeetingForm onSave={() => { setShowNewMeeting(false); fetchAll(); }} onCancel={() => setShowNewMeeting(false)} />}

            {(() => {
              const nextId = [...meetings].filter(m => !isMeetingPast(m)).sort((a, b) => a.number - b.number)[0]?.id ?? null;
              return meetings.map((m, i) => {
                const ballot = ballotsMap.get(m.id) ?? null;
                const showVoting = m.id === nextId || (ballot?.status ?? 'not_started') !== 'not_started';
                return (
                  <div key={m.id}>
                    {i > 0 && <hr className="border-slate-200 dark:border-slate-800 mb-4" />}
                    {editingMeeting?.id === m.id ? (
                      <MeetingForm
                        initial={{ id: m.id, number: String(m.number), date: m.date, start_time: m.start_time, end_time: m.end_time, theme: m.theme ?? '', meeting_link: m.meeting_link ?? '', meeting_type: m.meeting_type, speaker_slots: String(m.base_speaker_slots ?? m.speaker_slots), evaluator_slots: String(m.base_speaker_slots ?? m.evaluator_slots), disabled_roles: m.disabled_roles ?? [], jury_slots: String(m.jury_slots ?? 0), speaker_groups: m.speaker_groups ?? [], pair_groups: m.pair_groups ?? {} }}
                        onSave={() => { setEditingMeeting(null); fetchAll(); }}
                        onCancel={() => setEditingMeeting(null)}
                      />
                    ) : (
                      <div>
                        <MeetingCard meeting={m} allMembers={members} memberId={currentMember.id} isAdmin={true} onChanged={fetchAll} />
                        <div className="flex gap-1 mt-2 px-1 flex-wrap">
                          <button onClick={() => setEditingMeeting(m)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Edit meeting</button>
                          {!m.cancelled && (
                            <button onClick={() => cancelMeeting(m.id)} className="text-xs text-slate-400 dark:text-slate-600 hover:text-amber-600 dark:hover:text-amber-400 px-3 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors">Cancel meeting</button>
                          )}
                          <button onClick={() => deleteMeeting(m.id)} className="text-xs text-slate-400 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">Delete</button>
                          {(m.jury_slots ?? 0) > 0 && (
                            <>
                              <Link href={`/judge/${m.id}`} className="text-xs text-maroon-600 dark:text-maroon-400 hover:text-maroon-800 dark:hover:text-maroon-300 px-3 py-1.5 rounded-lg hover:bg-maroon-50 dark:hover:bg-maroon-950/20 transition-colors">🧑‍⚖️ Judge page</Link>
                              <Link href={`/contest/${m.id}`} className="text-xs text-maroon-600 dark:text-maroon-400 hover:text-maroon-800 dark:hover:text-maroon-300 px-3 py-1.5 rounded-lg hover:bg-maroon-50 dark:hover:bg-maroon-950/20 transition-colors">🏆 Results &amp; compute</Link>
                            </>
                          )}
                        </div>
                        {showVoting && <VotingControls meeting={m} ballot={ballot} allMembers={members} onChanged={fetchAll} />}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="space-y-4 pb-8">
            <AddMemberForm onAdd={addMember} />

            <div className="flex gap-2 items-center">
              <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search members…"
                className={`flex-1 min-w-0 ${inputCls} !py-1.5`} />
              <div className="flex gap-1 shrink-0">
                {(['active', 'all'] as const).map(f => (
                  <button key={f} onClick={() => setMemberFilter(f)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                      memberFilter === f
                        ? 'bg-maroon-700 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}>
                    {f === 'active' ? 'Active' : 'All'}
                  </button>
                ))}
              </div>
              {/* Our club's count — WIC India members are tallied on their own
                  section header below. */}
              <span className="text-xs text-slate-400 dark:text-slate-600 shrink-0">{displayedMembers.length}</span>
            </div>

            <div className="space-y-1.5">
              {displayedMembers.map(m => (
                <MemberRow key={m.id} member={m} allMembers={members} currentAdminId={currentMember.id} onUpdated={fetchAll} />
              ))}
            </div>

            {/* Visiting WIC India club — not our members, so folded away. */}
            {wicMembers.length > 0 && (
              <div className="space-y-1.5">
                <button
                  onClick={() => setShowWicMembers(v => !v)}
                  className="w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-xl border border-dashed
                             border-violet-200 dark:border-violet-800/50 bg-violet-50/60 dark:bg-violet-950/20
                             hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors"
                >
                  <span className="text-sm">🤝</span>
                  <span className="text-xs font-semibold text-violet-800 dark:text-violet-300">
                    {WIC_CLUB_NAME}
                  </span>
                  <span className="text-[10px] text-violet-500 dark:text-violet-400/80">
                    {wicMembers.length}
                  </span>
                  <span className="ml-auto text-xs text-violet-400 dark:text-violet-500">
                    {showWicMembers ? '▾ Hide' : '▸ Show'}
                  </span>
                </button>
                {showWicMembers && displayedWicMembers.map(m => (
                  <MemberRow key={m.id} member={m} allMembers={members} currentAdminId={currentMember.id} onUpdated={fetchAll} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <SiteFooter members={members} />
    </div>
  );
}

// ─── Entry ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
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
      setState(isAdminMember(m) ? 'granted' : 'no-access');
    }, () => setState('error'));
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#020617]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-maroon-600 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400 dark:text-slate-500">Opening admin panel…</p>
      </div>
    </div>
  );

  if (state === 'error') return (
    <GateScreen
      icon="📡"
      title="Connection problem"
      body="Couldn't verify your access. Check your internet connection and try again."
      cta="↻ Try again"
      onCta={() => { setState('loading'); setAttempt(a => a + 1); }}
    />
  );

  if (state === 'no-identity') return (
    <GateScreen
      icon="👤"
      title="Sign in first"
      body="Open the main app, sign in to your TM profile, then return here."
      cta="← Go to main app"
      href="/"
    />
  );

  if (state === 'no-access') return (
    <GateScreen
      icon="🔒"
      title="Admin access required"
      body={`You're signed in as TM ${currentMember?.display_name ?? ''}. Contact the Club President or VP Education to get admin rights.`}
      cta="← Back to meetings"
      href="/"
    />
  );

  return <AdminPanel currentMember={currentMember!} />;
}
