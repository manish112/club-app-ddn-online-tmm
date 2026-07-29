'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Member } from '@/lib/types';
import { RichMessageEditor } from '@/components/RichMessageEditor';
import { formatMeetingDate, formatTime } from '@/lib/utils';

const inputCls = 'w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-maroon-600';
const cardCls = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl shadow-card-light dark:shadow-card-dark';
const labelCls = 'text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block';
const primaryBtn = 'bg-gradient-to-r from-maroon-700 to-maroon-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold active:scale-95 transition-all disabled:opacity-40';
const ghostBtn = 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40';

interface Settings {
  enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;      // write-only; blank means "keep existing"
  from_name: string;
  from_email: string;
  reply_to: string;
  app_url: string;
  day_before_enabled: boolean;
  day_before_meeting_enabled: boolean;
  hour_before_enabled: boolean;
  hasPassword?: boolean;
}

interface TemplateRow { key: string; subject: string; body_html: string; enabled: boolean }
interface TemplatesData {
  templates: TemplateRow[];
  defaults: Record<string, { subject: string; body_html: string }>;
  placeholders: Record<string, string[]>;
  labels: Record<string, string>;
  keys: string[];
}

// The meeting a manual "next meeting" email will be built from — shown to the
// admin *before* they send, so a wrong pick is caught rather than emailed out.
export interface TargetMeeting {
  id: string; number: number; date: string; start_time: string; end_time: string;
  theme: string | null; meeting_link?: string | null;
}

function meetingSummary(m: TargetMeeting): string {
  const theme = m.theme && m.theme !== 'TBD' ? ` · ${m.theme}` : '';
  return `Meeting #${m.number} — ${formatMeetingDate(m.date)}, ${formatTime(m.start_time)}–${formatTime(m.end_time)} IST${theme}`;
}

function useTargetMeeting(currentAdminId: string) {
  const [meeting, setMeeting] = useState<TargetMeeting | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Returns the freshly-resolved meeting so callers can confirm against it.
  const reload = useCallback(async (): Promise<TargetMeeting | null> => {
    const res = await fetch(`/api/admin/email-broadcast?memberId=${currentAdminId}`);
    const d = await res.json().catch(() => ({}));
    const next: TargetMeeting | null = res.ok ? (d.meeting ?? null) : null;
    setMeeting(next);
    setLoaded(true);
    return next;
  }, [currentAdminId]);

  useEffect(() => { reload(); }, [reload]);
  return { meeting, loaded, reload };
}

function MeetingTargetBanner({ meeting, loaded }: { meeting: TargetMeeting | null; loaded: boolean }) {
  if (!loaded) return <p className="text-xs text-slate-400">Checking which meeting will be used…</p>;
  if (!meeting) {
    return (
      <div className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">No meeting scheduled — meeting emails can&apos;t be sent.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Email will use</p>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{meetingSummary(meeting)}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">
        {meeting.meeting_link ? 'Meeting link included.' : 'No meeting link set — the email won’t have a join link.'}
      </p>
    </div>
  );
}

const EMPTY: Settings = {
  enabled: false, smtp_host: '', smtp_port: 587, smtp_secure: false, smtp_user: '', smtp_pass: '',
  from_name: 'Dehradun Online Toastmasters', from_email: '', reply_to: '', app_url: '',
  day_before_enabled: true, day_before_meeting_enabled: true, hour_before_enabled: true,
};

export function EmailSettingsPanel({ currentAdminId, members }: { currentAdminId: string; members: Member[] }) {
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [tpl, setTpl] = useState<TemplatesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingConn, setSavingConn] = useState(false);
  const [connMsg, setConnMsg] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [sRes, tRes] = await Promise.all([
        fetch(`/api/admin/email-settings?memberId=${currentAdminId}`),
        fetch(`/api/admin/email-templates?memberId=${currentAdminId}`),
      ]);
      if (sRes.ok) {
        const s = await sRes.json();
        setSettings({ ...EMPTY, ...s, smtp_pass: '' });
      }
      if (tRes.ok) setTpl(await tRes.json());
      setLoading(false);
    })();
  }, [currentAdminId]);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function saveConnection() {
    setSavingConn(true); setConnMsg(null);
    const res = await fetch('/api/admin/email-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: currentAdminId, settings }),
    });
    setSavingConn(false);
    setConnMsg(res.ok ? '✓ Saved' : '✗ Could not save');
    if (res.ok) setSettings((s) => ({ ...s, smtp_pass: '', hasPassword: s.hasPassword || !!s.smtp_pass }));
    setTimeout(() => setConnMsg(null), 3000);
  }

  async function sendTest() {
    if (!testTo.trim()) return;
    setTesting(true); setTestMsg(null);
    const res = await fetch('/api/admin/email-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: currentAdminId, to: testTo.trim(), settings }),
    });
    const data = await res.json().catch(() => ({}));
    setTesting(false);
    setTestMsg(res.ok ? '✓ Test email sent' : `✗ ${data.error ?? 'Failed to send'}`);
  }

  if (loading) {
    return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="bg-slate-200 dark:bg-slate-900/60 rounded-2xl h-40 animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-4 pb-8">
      {/* ── Connection ── */}
      <div className={`${cardCls} p-5 space-y-4`}>
        <div>
          <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">Email Connection (SMTP)</h3>
          <p className="text-xs text-slate-500">Notifications are only sent while enabled and a host + from address are set.</p>
        </div>

        <label className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Enable email notifications</span>
          <input type="checkbox" checked={settings.enabled} onChange={(e) => set('enabled', e.target.checked)} className="w-5 h-5 accent-maroon-600" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2"><span className={labelCls}>SMTP host</span>
            <input type="text" value={settings.smtp_host} onChange={(e) => set('smtp_host', e.target.value)} placeholder="smtp.gmail.com" className={inputCls} /></label>
          <label><span className={labelCls}>Port</span>
            <input type="number" value={settings.smtp_port} onChange={(e) => set('smtp_port', parseInt(e.target.value) || 0)} className={inputCls} /></label>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" checked={settings.smtp_secure} onChange={(e) => set('smtp_secure', e.target.checked)} className="w-4 h-4 accent-maroon-600" />
            <span className="text-sm text-slate-700 dark:text-slate-300">Secure (SSL / port 465)</span>
          </label>
          <label><span className={labelCls}>Username</span>
            <input type="text" value={settings.smtp_user} onChange={(e) => set('smtp_user', e.target.value)} autoComplete="off" className={inputCls} /></label>
          <label><span className={labelCls}>Password {settings.hasPassword && <span className="text-emerald-500 normal-case font-normal">• set</span>}</span>
            <input type="password" value={settings.smtp_pass} onChange={(e) => set('smtp_pass', e.target.value)} placeholder={settings.hasPassword ? 'Leave blank to keep' : ''} autoComplete="new-password" className={inputCls} /></label>
          <label><span className={labelCls}>From name</span>
            <input type="text" value={settings.from_name} onChange={(e) => set('from_name', e.target.value)} className={inputCls} /></label>
          <label><span className={labelCls}>From email</span>
            <input type="email" value={settings.from_email} onChange={(e) => set('from_email', e.target.value)} placeholder="club@example.com" className={inputCls} /></label>
          <label className="col-span-2"><span className={labelCls}>Reply-to (optional)</span>
            <input type="email" value={settings.reply_to} onChange={(e) => set('reply_to', e.target.value)} className={inputCls} /></label>
          <label className="col-span-2"><span className={labelCls}>App URL (used in email links)</span>
            <input type="url" value={settings.app_url} onChange={(e) => set('app_url', e.target.value)} placeholder="https://dehradun-online-tm.vercel.app" className={inputCls} /></label>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-700 dark:text-slate-300">Send role reminders 1 day before</span>
            <input type="checkbox" checked={settings.day_before_enabled} onChange={(e) => set('day_before_enabled', e.target.checked)} className="w-5 h-5 accent-maroon-600" />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-700 dark:text-slate-300">Send meeting reminder 1 day before</span>
            <input type="checkbox" checked={settings.day_before_meeting_enabled} onChange={(e) => set('day_before_meeting_enabled', e.target.checked)} className="w-5 h-5 accent-maroon-600" />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-700 dark:text-slate-300">Send meeting reminder 1 hour before</span>
            <input type="checkbox" checked={settings.hour_before_enabled} onChange={(e) => set('hour_before_enabled', e.target.checked)} className="w-5 h-5 accent-maroon-600" />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={saveConnection} disabled={savingConn} className={primaryBtn}>{savingConn ? 'Saving…' : 'Save connection'}</button>
          {connMsg && <span className="text-sm text-slate-500">{connMsg}</span>}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
          <span className={labelCls}>Send a test email</span>
          <div className="flex items-center gap-2">
            <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" className={inputCls} />
            <button onClick={sendTest} disabled={testing || !testTo.trim()} className={`${ghostBtn} shrink-0`}>{testing ? 'Sending…' : 'Test'}</button>
          </div>
          {testMsg && <p className="text-xs mt-1.5 text-slate-500">{testMsg}</p>}
          <p className="text-[11px] text-slate-400 mt-1">Uses the values above (even unsaved). A blank password falls back to the stored one.</p>
        </div>
      </div>

      {/* ── Write a custom message to all members ── */}
      <CustomMessageCard currentAdminId={currentAdminId} />

      {/* ── Broadcast to all members ── */}
      <BroadcastCard currentAdminId={currentAdminId} />

      {/* ── Send to a specific member ── */}
      {tpl && <SendToMember currentAdminId={currentAdminId} members={members} keys={tpl.keys} labels={tpl.labels} placeholders={tpl.placeholders} />}

      {/* ── Templates ── */}
      {tpl && <TemplateEditors data={tpl} currentAdminId={currentAdminId} />}
    </div>
  );
}

function CustomMessageCard({ currentAdminId }: { currentAdminId: string }) {
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // True when the editor has some visible content (not just empty tags).
  const hasContent = html.replace(/<[^>]*>/g, '').trim().length > 0 || /<img/i.test(html);

  async function showPreview() {
    if (!subject.trim() || !hasContent) return;
    setPreviewing(true);
    const res = await fetch('/api/admin/email-custom', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: currentAdminId, subject: subject.trim(), html, preview: true }),
    });
    const d = await res.json().catch(() => ({}));
    setPreviewing(false);
    if (res.ok) setPreview({ subject: d.subject, html: d.html });
    else setMsg(`✗ ${d.error ?? 'Preview failed'}`);
  }

  async function send() {
    if (!subject.trim() || !hasContent) return;
    if (!confirm('Send this message by email to all members?')) return;
    setSending(true); setMsg(null);
    const res = await fetch('/api/admin/email-custom', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: currentAdminId, subject: subject.trim(), html }),
    });
    const d = await res.json().catch(() => ({}));
    setSending(false);
    if (res.ok) { setMsg(`✓ Sent to ${d.recipients} member(s)`); setSubject(''); setHtml(''); }
    else setMsg(`✗ ${d.error ?? 'Failed'}`);
  }

  return (
    <div className={`${cardCls} p-5 space-y-3`}>
      <div>
        <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">Message all members</h3>
        <p className="text-xs text-slate-500">Write a message (bold, italic, images) and email it individually to every member (they see &ldquo;Dear TM &lt;name&gt;&rdquo;). Opted-out members are skipped.</p>
      </div>
      <div>
        <span className={labelCls}>Subject</span>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} maxLength={150} />
      </div>
      <div>
        <span className={labelCls}>Message</span>
        <RichMessageEditor value={html} onChange={setHtml} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={send} disabled={sending || !subject.trim() || !hasContent} className={primaryBtn}>{sending ? 'Sending…' : 'Send to all members'}</button>
        <button onClick={showPreview} disabled={previewing || !subject.trim() || !hasContent} className={ghostBtn}>{previewing ? 'Loading…' : '👁 Preview'}</button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>

      {preview && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Preview · as sent to members</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{preview.subject}</p>
              </div>
              <button onClick={() => setPreview(null)} className="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg px-2 min-h-[36px]">✕</button>
            </div>
            <iframe title="Message preview" srcDoc={preview.html} sandbox="" className="w-full flex-1 bg-white border-0" style={{ minHeight: '60vh' }} />
          </div>
        </div>
      )}
    </div>
  );
}

const BROADCAST_OPTIONS = [
  { key: 'meeting_created',     label: 'New meeting announcement', to: 'all members', meeting: true },
  { key: 'meeting_reminder_day_before', label: 'Meeting reminder (1 day before)', to: 'all members', meeting: true },
  { key: 'meeting_reminder',    label: 'Meeting reminder (1 hour before)', to: 'all members', meeting: true },
  { key: 'role_reminder',       label: 'Role reminders',            to: 'each role holder (next meeting)', meeting: true },
  { key: 'role_assigned',       label: 'Role assigned',             to: 'each role holder (next meeting)', meeting: true },
  { key: 'leadership_assigned', label: 'Leadership role appointed', to: 'each club officer', meeting: false },
  { key: 'mentor_assigned',     label: 'Mentor assigned',           to: 'each mentor & mentee', meeting: false },
  { key: 'welcome',             label: 'Welcome email',             to: 'all members', meeting: false },
] as const;

function BroadcastCard({ currentAdminId }: { currentAdminId: string }) {
  const [templateKey, setTemplateKey] = useState<string>(BROADCAST_OPTIONS[0].key);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { meeting, loaded, reload } = useTargetMeeting(currentAdminId);

  const opt = BROADCAST_OPTIONS.find((o) => o.key === templateKey);
  const needsMeeting = opt?.meeting ?? false;

  async function broadcast() {
    if (!opt) return;
    // Re-resolve the target meeting first: the panel may have been open for a
    // while, and the admin must confirm against what will actually be sent.
    const current = await reload();
    if (needsMeeting && !current) { setMsg('✗ No meeting to reference'); return; }

    const detail = needsMeeting && current ? `\n\n${meetingSummary(current)}` : '';
    if (!confirm(`Send "${opt.label}" to ${opt.to}?${detail}`)) return;

    setSending(true); setMsg(null);
    const res = await fetch('/api/admin/email-broadcast', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: currentAdminId, templateKey, expectedMeetingId: current?.id }),
    });
    const d = await res.json().catch(() => ({}));
    setSending(false);
    setMsg(res.ok
      ? `✓ Sent to ${d.recipients} recipient(s)${d.meetingNumber ? ` — Meeting #${d.meetingNumber}` : ''}`
      : `✗ ${d.error ?? 'Failed'}`);
    reload();
  }

  return (
    <div className={`${cardCls} p-5 space-y-3`}>
      <div>
        <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">Broadcast to members</h3>
        <p className="text-xs text-slate-500">Re-send a notification now. The system computes the recipients from the type and the next meeting.</p>
      </div>
      <div>
        <span className={labelCls}>Notification</span>
        <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} className={inputCls}>
          {BROADCAST_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label} → {o.to}</option>)}
        </select>
      </div>
      {needsMeeting && <MeetingTargetBanner meeting={meeting} loaded={loaded} />}
      <div className="flex items-center gap-2">
        <button onClick={broadcast} disabled={sending || (needsMeeting && loaded && !meeting)} className={primaryBtn}>{sending ? 'Sending…' : 'Send now'}</button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

function SendToMember({ currentAdminId, members, keys, labels, placeholders }: {
  currentAdminId: string; members: Member[]; keys: string[];
  labels: Record<string, string>; placeholders: Record<string, string[]>;
}) {
  const withEmail = members.filter((m) => m.email);
  const [templateKey, setTemplateKey] = useState(keys[0] ?? '');
  const [targetId, setTargetId] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { meeting, loaded, reload } = useTargetMeeting(currentAdminId);

  // Templates that render meeting details are filled from the next meeting.
  const needsMeeting = (placeholders[templateKey] ?? []).includes('meeting_number');

  async function send() {
    if (!targetId || !templateKey) return;
    const current = needsMeeting ? await reload() : null;
    const who = withEmail.find((m) => m.id === targetId);
    const detail = current ? `\n\n${meetingSummary(current)}` : '';
    if (!confirm(`Send "${labels[templateKey]}" to TM ${who?.display_name ?? 'this member'}?${detail}`)) return;
    setSending(true); setMsg(null);
    const res = await fetch('/api/admin/email-send-member', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: currentAdminId, targetMemberId: targetId, templateKey }),
    });
    const d = await res.json().catch(() => ({}));
    setSending(false);
    setMsg(res.ok ? `✓ Sent to ${d.sentTo}` : `✗ ${d.error ?? 'Failed'}`);
  }

  return (
    <div className={`${cardCls} p-5 space-y-3`}>
      <div>
        <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">Send to a member</h3>
        <p className="text-xs text-slate-500">Send one notification to a specific TM, personalized to them and using the next meeting&apos;s details.</p>
      </div>
      <div>
        <span className={labelCls}>Notification</span>
        <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} className={inputCls}>
          {keys.map((k) => <option key={k} value={k}>{labels[k]}</option>)}
        </select>
      </div>
      <div>
        <span className={labelCls}>Member</span>
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className={inputCls}>
          <option value="">Select a member…</option>
          {withEmail.map((m) => <option key={m.id} value={m.id}>TM {m.display_name}</option>)}
        </select>
        {members.length !== withEmail.length && (
          <p className="text-[11px] text-slate-400 mt-1">{members.length - withEmail.length} member(s) without an email are hidden.</p>
        )}
      </div>
      {needsMeeting && <MeetingTargetBanner meeting={meeting} loaded={loaded} />}
      <div className="flex items-center gap-2">
        <button onClick={send} disabled={sending || !targetId} className={primaryBtn}>{sending ? 'Sending…' : 'Send email'}</button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

function TemplateEditors({ data, currentAdminId }: { data: TemplatesData; currentAdminId: string }) {
  const [testTo, setTestTo] = useState('');
  const [preview, setPreview] = useState<{ label: string; subject: string; html: string } | null>(null);
  return (
    <div className={`${cardCls} p-5 space-y-3`}>
      <div>
        <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">Email Templates</h3>
        <p className="text-xs text-slate-500">Edit the subject and HTML body. Use {'{{placeholders}}'}; leave a field blank to fall back to the built-in default.</p>
      </div>
      <div>
        <span className={labelCls}>Test recipient</span>
        <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com — where template tests are sent" className={inputCls} />
        <p className="text-[11px] text-slate-400 mt-1">Each template&apos;s <span className="font-semibold">Send test</span> renders the current (even unsaved) content with sample data and emails it here.</p>
      </div>
      {data.keys.map((key) => (
        <TemplateEditor
          key={key}
          templateKey={key}
          label={data.labels[key]}
          placeholders={data.placeholders[key] ?? []}
          stored={data.templates.find((t) => t.key === key) ?? null}
          def={data.defaults[key]}
          currentAdminId={currentAdminId}
          testTo={testTo}
          onPreview={async (subject, body) => {
            setPreview({ label: data.labels[key], subject: 'Loading…', html: '<p style="padding:24px;font-family:sans-serif;color:#64748b">Loading preview…</p>' });
            const res = await fetch('/api/admin/email-preview', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ memberId: currentAdminId, templateKey: key, subject, body_html: body }),
            });
            const d = await res.json().catch(() => ({}));
            setPreview(res.ok
              ? { label: data.labels[key], subject: d.subject, html: d.html }
              : { label: data.labels[key], subject: 'Preview failed', html: `<p style="padding:24px;font-family:sans-serif;color:#b91c1c">${d.error ?? 'Error'}</p>` });
          }}
        />
      ))}

      {preview && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreview(null)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Preview · {preview.label}</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{preview.subject}</p>
              </div>
              <button onClick={() => setPreview(null)}
                className="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg px-2 min-h-[36px]">✕</button>
            </div>
            <iframe title="Email preview" srcDoc={preview.html} sandbox=""
              className="w-full flex-1 bg-white border-0" style={{ minHeight: '60vh' }} />
            <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">Rendered with your next meeting&apos;s real data. Placeholders like {'{{full_name}}'} are filled per recipient when actually sent.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ templateKey, label, placeholders, stored, def, currentAdminId, testTo, onPreview }: {
  templateKey: string; label: string; placeholders: string[];
  stored: TemplateRow | null; def: { subject: string; body_html: string }; currentAdminId: string; testTo: string;
  onPreview: (subject: string, body: string) => void;
}) {
  const isCustom = !!(stored?.subject?.trim() || stored?.body_html?.trim());
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(stored?.subject?.trim() ? stored.subject : def.subject);
  const [body, setBody] = useState(stored?.body_html?.trim() ? stored.body_html : def.body_html);
  const [enabled, setEnabled] = useState(stored?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function sendTest() {
    if (!testTo.trim()) { setMsg('✗ Enter a test recipient above'); setTimeout(() => setMsg(null), 3000); return; }
    setTesting(true); setMsg(null);
    const res = await fetch('/api/admin/email-test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: currentAdminId, to: testTo.trim(), templateKey, subject, body_html: body }),
    });
    const data = await res.json().catch(() => ({}));
    setTesting(false);
    setMsg(res.ok ? `✓ Test sent to ${testTo.trim()}` : `✗ ${data.error ?? 'Failed'}`);
    setTimeout(() => setMsg(null), 4000);
  }

  async function save(reset = false) {
    setSaving(true); setMsg(null);
    const payload = reset
      ? { memberId: currentAdminId, key: templateKey, subject: '', body_html: '', enabled }
      : { memberId: currentAdminId, key: templateKey, subject, body_html: body, enabled };
    const res = await fetch('/api/admin/email-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    setSaving(false);
    if (reset && res.ok) { setSubject(def.subject); setBody(def.body_html); }
    setMsg(res.ok ? (reset ? '✓ Reset to default' : '✓ Saved') : '✗ Failed');
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <span className={`text-xs ${enabled ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`}>●</span>
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1">{label}</span>
        {isCustom && <span className="text-[9px] font-bold uppercase tracking-wide bg-maroon-100 dark:bg-maroon-900/40 text-maroon-700 dark:text-maroon-300 px-2 py-0.5 rounded-full">Custom</span>}
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-slate-100 dark:border-slate-800">
          <label className="flex items-center gap-2 py-1">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 accent-maroon-600" />
            <span className="text-xs text-slate-600 dark:text-slate-400">This notification is enabled</span>
          </label>
          <div>
            <span className={labelCls}>Subject</span>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
          </div>
          <div>
            <span className={labelCls}>Body (HTML)</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} spellCheck={false}
              className={`${inputCls} font-mono text-xs leading-relaxed`} />
          </div>
          <div className="text-[11px] text-slate-500">
            <span className="font-semibold">Placeholders: </span>
            {placeholders.map((p) => <code key={p} className="bg-slate-100 dark:bg-slate-800 rounded px-1 py-0.5 mr-1 mb-1 inline-block">{`{{${p}}}`}</code>)}
          </div>
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button onClick={() => save(false)} disabled={saving} className={primaryBtn}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => onPreview(subject, body)} className={ghostBtn}>👁 Preview</button>
            <button onClick={() => save(true)} disabled={saving} className={ghostBtn}>Reset to default</button>
            <button onClick={sendTest} disabled={testing} className={ghostBtn}>{testing ? 'Sending…' : '✉ Send test'}</button>
            {msg && <span className="text-xs text-slate-500">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
