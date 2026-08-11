'use client';
import { useCallback, useEffect, useState } from 'react';
import { formatMeetingDate, formatTime } from '@/lib/utils';

const inputCls = 'w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-maroon-600';
const cardCls = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl shadow-card-light dark:shadow-card-dark';
const labelCls = 'text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block';
const primaryBtn = 'bg-gradient-to-r from-emerald-700 to-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold active:scale-95 transition-all disabled:opacity-40';
const ghostBtn = 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40';

interface Settings {
  enabled: boolean;
  access_token: string;        // write-only; blank means "keep existing"
  phone_number_id: string;
  business_account_id: string;
  api_version: string;
  default_country_code: string;
  text_mode: boolean;
  welcome_enabled: boolean;
  meeting_created_enabled: boolean;
  role_change_enabled: boolean;
  role_reminder_enabled: boolean;
  no_role_nudge_enabled: boolean;
  meeting_starting_enabled: boolean;
  meeting_starting_lead_minutes: number;
  hasToken?: boolean;
}

const EMPTY: Settings = {
  enabled: false, access_token: '', phone_number_id: '', business_account_id: '',
  api_version: 'v25.0', default_country_code: '91', text_mode: false,
  welcome_enabled: true, meeting_created_enabled: true, role_change_enabled: true,
  role_reminder_enabled: true, no_role_nudge_enabled: true, meeting_starting_enabled: true,
  meeting_starting_lead_minutes: 70,
};

interface TemplateRow {
  key: string;
  template_name: string;
  language_code: string;
  body_text: string;
  param_vars: string[];
  enabled: boolean;
}
interface TemplatePreview { rendered: string; metaBody: string; params: string[] }
interface TemplatesData {
  templates: TemplateRow[];
  defaults: Record<string, string>;
  defaultParamVars: Record<string, string[]>;
  placeholders: Record<string, string[]>;
  labels: Record<string, string>;
  hints: Record<string, string>;
  keys: string[];
  /** The subset an admin can fire by hand. */
  manualKeys: string[];
  /** Of those, the ones that don't need a meeting scheduled. */
  meetinglessKeys: string[];
  previews: Record<string, TemplatePreview>;
}

interface TargetMeeting {
  id: string; number: number; date: string; start_time: string; end_time: string;
  theme: string | null; meeting_link?: string | null;
}
interface SendTarget {
  meeting: TargetMeeting | null;
  audience: { active: number; reachable: number; noPhone: number; optedOut: number };
  openRoles: number;
  withRole: number;
}

export function WhatsAppSettingsPanel({ currentAdminId }: { currentAdminId: string }) {
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [tpl, setTpl] = useState<TemplatesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    const res = await fetch(`/api/admin/whatsapp-templates?memberId=${currentAdminId}`);
    if (res.ok) setTpl(await res.json());
  }, [currentAdminId]);

  useEffect(() => {
    (async () => {
      const sRes = await fetch(`/api/admin/whatsapp-settings?memberId=${currentAdminId}`);
      if (sRes.ok) {
        setSettings({ ...EMPTY, ...(await sRes.json()), access_token: '' });
      } else {
        const d = await sRes.json().catch(() => ({}));
        setLoadError(d.error ?? 'Could not load WhatsApp settings');
      }
      await loadTemplates();
      setLoading(false);
    })();
  }, [currentAdminId, loadTemplates]);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function save() {
    setSaving(true); setSaveMsg(null);
    const res = await fetch('/api/admin/whatsapp-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: currentAdminId, settings }),
    });
    setSaving(false);
    setSaveMsg(res.ok ? '✓ Saved' : '✗ Could not save');
    if (res.ok) setSettings((s) => ({ ...s, access_token: '', hasToken: s.hasToken || !!s.access_token }));
    setTimeout(() => setSaveMsg(null), 3000);
  }

  if (loading) {
    return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="bg-slate-200 dark:bg-slate-900/60 rounded-2xl h-40 animate-pulse" />)}</div>;
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{loadError}</p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
          Apply <code>supabase/migrations/055_whatsapp_notifications.sql</code> to this database, then reload.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* ── How this works ── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Before you start</p>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Meta only delivers a business-initiated WhatsApp message if it uses a <strong>template approved in
          advance</strong>. Plain text reaches a member only within 24 hours of them messaging your number — no
          use for a reminder. So: submit each message below for approval in Meta Business Manager, then put its
          approved name in the matching field. The panel gives you the exact body text to paste, numbering
          already applied.
        </p>
      </div>

      {/* ── Connection ── */}
      <div className={`${cardCls} p-5 space-y-4`}>
        <div>
          <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">WhatsApp Connection (Meta Cloud API)</h3>
          <p className="text-xs text-slate-500">Nothing is sent while this is off, or while the token and phone number ID are blank.</p>
        </div>

        <label className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Enable WhatsApp notifications</span>
          <input type="checkbox" checked={settings.enabled} onChange={(e) => set('enabled', e.target.checked)} className="w-5 h-5 accent-emerald-600" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2">
            <span className={labelCls}>Access token {settings.hasToken && <span className="text-emerald-500 normal-case font-normal">• set</span>}</span>
            <input type="password" value={settings.access_token} onChange={(e) => set('access_token', e.target.value)}
              placeholder={settings.hasToken ? 'Leave blank to keep' : 'EAAG…'} autoComplete="new-password" className={inputCls} />
            <span className="text-[11px] text-slate-400 mt-1 block">
              A permanent System User token. Stored server-side only and never sent back to this page.
            </span>
          </label>
          <label><span className={labelCls}>Phone number ID</span>
            <input type="text" value={settings.phone_number_id} onChange={(e) => set('phone_number_id', e.target.value)} placeholder="123456789012345" className={inputCls} /></label>
          <label><span className={labelCls}>WhatsApp business account ID</span>
            <input type="text" value={settings.business_account_id} onChange={(e) => set('business_account_id', e.target.value)} placeholder="optional" className={inputCls} /></label>
          <label><span className={labelCls}>Graph API version</span>
            <input type="text" value={settings.api_version} onChange={(e) => set('api_version', e.target.value)} placeholder="v25.0" className={inputCls} /></label>
          <label><span className={labelCls}>Default country code</span>
            <input type="text" value={settings.default_country_code} onChange={(e) => set('default_country_code', e.target.value)} placeholder="91" className={inputCls} />
            <span className="text-[11px] text-slate-400 mt-1 block">Added to member phone numbers stored without one.</span>
          </label>
        </div>

        <label className="flex items-start justify-between gap-4 border-t border-slate-100 dark:border-slate-800 pt-3">
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Send as plain text instead of templates
            <span className="block text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              For testing only. Meta delivers plain text solely to members who messaged your number in the
              last 24 hours — scheduled reminders sent this way will mostly fail.
            </span>
          </span>
          <input type="checkbox" checked={settings.text_mode} onChange={(e) => set('text_mode', e.target.checked)} className="w-5 h-5 accent-amber-500 shrink-0" />
        </label>

        {/* ── Which messages go out ── */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
          <p className={labelCls}>Messages sent automatically</p>
          <Toggle label="Welcome message" hint="To a newly added member, introducing the channel and the opt-out."
            checked={settings.welcome_enabled} onChange={(v) => set('welcome_enabled', v)} />
          <Toggle label="New meeting announced" hint="When an admin announces a newly created meeting."
            checked={settings.meeting_created_enabled} onChange={(v) => set('meeting_created_enabled', v)} />
          <Toggle label="Role assigned or removed" hint="The moment a role is claimed, assigned, released or removed — whoever did it."
            checked={settings.role_change_enabled} onChange={(v) => set('role_change_enabled', v)} />
          <Toggle label="Role reminder, 1 day before" hint="To each member holding a role, one message per role."
            checked={settings.role_reminder_enabled} onChange={(v) => set('role_reminder_enabled', v)} />
          <Toggle label="Pick a role, 1 day before" hint="Only to members without a role, and only while roles are still open."
            checked={settings.no_role_nudge_enabled} onChange={(v) => set('no_role_nudge_enabled', v)} />
          <Toggle label="Starting soon, on meeting day" hint="To all members, with the join link and the full role sheet — who has what, and what is still vacant."
            checked={settings.meeting_starting_enabled} onChange={(v) => set('meeting_starting_enabled', v)} />
          {settings.meeting_starting_enabled && (
            <label className="flex items-center gap-2 pl-1 pt-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Send it within</span>
              <input type="number" min={15} max={360} value={settings.meeting_starting_lead_minutes}
                onChange={(e) => set('meeting_starting_lead_minutes', parseInt(e.target.value) || 0)}
                className={`${inputCls} w-20 py-1.5`} />
              <span className="text-xs text-slate-500 dark:text-slate-400">minutes of the start time</span>
            </label>
          )}
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed pt-1">
            The reminders ride the same daily cron as the emails, so the actual lead time depends on when it
            lands inside the window. Each member is messaged once per meeting per reminder — a repeated or
            retried run can&apos;t double up.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving} className={primaryBtn}>{saving ? 'Saving…' : 'Save settings'}</button>
          {saveMsg && <span className="text-sm text-slate-500">{saveMsg}</span>}
        </div>
      </div>

      {/* ── Test message ── */}
      <TestMessageCard currentAdminId={currentAdminId} settings={settings} keys={tpl?.keys ?? []} labels={tpl?.labels ?? {}} />

      {/* ── Send one now ── */}
      <SendNowCard currentAdminId={currentAdminId} labels={tpl?.labels ?? {}}
        keys={tpl?.manualKeys ?? []} meetinglessKeys={tpl?.meetinglessKeys ?? []} />

      {/* ── Templates ── */}
      {tpl && <TemplateEditors data={tpl} currentAdminId={currentAdminId} onSaved={loadTemplates} />}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: {
  label: string; hint: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span className="text-sm text-slate-700 dark:text-slate-300">
        {label}
        <span className="block text-xs text-slate-400 dark:text-slate-500">{hint}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5 accent-emerald-600 shrink-0" />
    </label>
  );
}

// ── Send a test message ─────────────────────────────────────────────────────
function TestMessageCard({ currentAdminId, settings, keys, labels }: {
  currentAdminId: string; settings: Settings; keys: string[]; labels: Record<string, string>;
}) {
  const [to, setTo] = useState('');
  const [mode, setMode] = useState<'text' | 'template'>('text');
  const [text, setText] = useState('Test message from the club app 👋');
  const [templateKey, setTemplateKey] = useState(keys[0] ?? 'meeting_created');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (keys.length && !keys.includes(templateKey)) setTemplateKey(keys[0]); }, [keys, templateKey]);

  async function send() {
    setBusy(true); setMsg(null);
    const res = await fetch('/api/admin/whatsapp-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: currentAdminId, to: to.trim(), mode, text, templateKey, settings }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? '✓ Sent — check the phone' : `✗ ${data.error ?? 'Failed to send'}`);
  }

  return (
    <div className={`${cardCls} p-5 space-y-3`}>
      <div>
        <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">Send a test message</h3>
        <p className="text-xs text-slate-500">Uses the settings above, even unsaved. A blank access token falls back to the stored one.</p>
      </div>

      <label><span className={labelCls}>To (phone number)</span>
        <input type="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="9876543210 or +91 98765 43210" className={inputCls} />
        <span className="text-[11px] text-slate-400 mt-1 block">
          A number without a country code gets +{settings.default_country_code || '91'}.
        </span>
      </label>

      <div className="flex gap-2">
        {(['text', 'template'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold border transition-colors ${
              mode === m
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}>
            {m === 'text' ? 'Plain text' : 'Approved template'}
          </button>
        ))}
      </div>

      {mode === 'text' ? (
        <>
          <label><span className={labelCls}>Message</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className={`${inputCls} font-mono text-xs`} /></label>
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Only delivered if that number messaged your business number in the last 24 hours. Otherwise Meta
            returns a re-engagement error — which is the expected result, not a broken setup.
          </p>
        </>
      ) : (
        <>
          <label><span className={labelCls}>Template</span>
            <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} className={inputCls}>
              {keys.map((k) => <option key={k} value={k}>{labels[k] ?? k}</option>)}
            </select></label>
          <p className="text-[11px] text-slate-400">
            Sent with real data from the next meeting, so this doubles as a check that the template&apos;s
            parameters line up. Works whether or not the recipient has messaged you.
          </p>
        </>
      )}

      <div className="flex items-center gap-3">
        <button onClick={send} disabled={busy || !to.trim()} className={primaryBtn}>{busy ? 'Sending…' : 'Send test'}</button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

// ── Fire one of the four notifications now ──────────────────────────────────
function SendNowCard({ currentAdminId, keys, meetinglessKeys, labels }: {
  currentAdminId: string; keys: string[]; meetinglessKeys: string[]; labels: Record<string, string>;
}) {
  const [target, setTarget] = useState<SendTarget | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/admin/whatsapp-send?memberId=${currentAdminId}`);
    setTarget(res.ok ? await res.json() : null);
    setLoaded(true);
  }, [currentAdminId]);

  useEffect(() => { reload(); }, [reload]);

  async function send(key: string) {
    const fresh = await fetch(`/api/admin/whatsapp-send?memberId=${currentAdminId}`).then((r) => r.json()).catch(() => null);
    // The welcome isn't about a meeting, so it can go out when none is
    // scheduled — which is when a club would be introducing the channel.
    const needsMeeting = !meetinglessKeys.includes(key);
    if (needsMeeting && !fresh?.meeting) { setMsg('✗ No meeting scheduled'); return; }
    const reach = fresh?.audience?.reachable ?? 0;
    if (!confirm(
      `Send "${labels[key] ?? key}" on WhatsApp now?\n\n`
      + (needsMeeting ? `Meeting #${fresh.meeting.number} — ${formatMeetingDate(fresh.meeting.date)}\n` : '')
      + `Up to ${reach} member${reach === 1 ? '' : 's'} can be reached.\n\n`
      + 'This is not deduplicated — sending twice messages everyone twice.'
    )) return;

    setBusy(key); setMsg(null);
    const res = await fetch('/api/admin/whatsapp-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: currentAdminId, key }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setMsg(`✗ ${data.error ?? 'Could not send'}`); return; }
    if (data.skipped) { setMsg(`Nothing sent — ${data.skipped}`); return; }
    setMsg(`✓ Sent to ${data.sent}${data.failed ? ` · ${data.failed} failed` : ''}`
      + (data.sent === 0 && data.reason ? ` (${data.reason})` : ''));
    reload();
  }

  return (
    <div className={`${cardCls} p-5 space-y-3`}>
      <div>
        <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">Send one now</h3>
        <p className="text-xs text-slate-500">Fires a message for the upcoming meeting straight away, outside the schedule.</p>
      </div>

      {!loaded ? (
        <p className="text-xs text-slate-400">Checking which meeting will be used…</p>
      ) : !target?.meeting ? (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">No meeting scheduled — nothing can be sent.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Will use</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Meeting #{target.meeting.number} — {formatMeetingDate(target.meeting.date)},{' '}
            {formatTime(target.meeting.start_time)}–{formatTime(target.meeting.end_time)} IST
            {target.meeting.theme && target.meeting.theme !== 'TBD' ? ` · ${target.meeting.theme}` : ''}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            {target.audience.reachable} of {target.audience.active} active members reachable
            {target.audience.noPhone > 0 && ` · ${target.audience.noPhone} without a usable phone number`}
            {target.audience.optedOut > 0 && ` · ${target.audience.optedOut} opted out`}
            {' · '}{target.openRoles} role{target.openRoles === 1 ? '' : 's'} still open
            {' · '}{target.withRole} member{target.withRole === 1 ? '' : 's'} already signed up
            {!target.meeting.meeting_link && ' · no join link set'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {keys.map((k) => (
          <button key={k} onClick={() => send(k)}
            disabled={!!busy || (!target?.meeting && !meetinglessKeys.includes(k))}
            className={`${ghostBtn} text-left text-xs`}>
            {busy === k ? 'Sending…' : labels[k] ?? k}
          </button>
        ))}
      </div>
      {msg && <p className="text-sm text-slate-500">{msg}</p>}
    </div>
  );
}

// ── Template editors ────────────────────────────────────────────────────────
function TemplateEditors({ data, currentAdminId, onSaved }: {
  data: TemplatesData; currentAdminId: string; onSaved: () => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm px-1">Message templates</h3>
      {data.keys.map((key) => (
        <TemplateEditor key={key} tplKey={key} data={data} currentAdminId={currentAdminId} onSaved={onSaved} />
      ))}
    </div>
  );
}

function TemplateEditor({ tplKey, data, currentAdminId, onSaved }: {
  tplKey: string; data: TemplatesData; currentAdminId: string; onSaved: () => void;
}) {
  const stored = data.templates.find((t) => t.key === tplKey);
  const defaultBody = data.defaults[tplKey] ?? '';
  const defaultParams = data.defaultParamVars[tplKey] ?? [];

  const [open, setOpen] = useState(false);
  const [templateName, setTemplateName] = useState(stored?.template_name ?? '');
  const [language, setLanguage] = useState(stored?.language_code || 'en');
  const [body, setBody] = useState(stored?.body_text || defaultBody);
  const [params, setParams] = useState<string[]>(
    stored?.param_vars?.length ? stored.param_vars : defaultParams);
  const [enabled, setEnabled] = useState(stored?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const preview = data.previews[tplKey];
  const placeholders = data.placeholders[tplKey] ?? [];
  const configured = !!(stored?.template_name ?? '').trim();

  // Placeholders in the body that no parameter fills. Counted, not just listed:
  // a variable used twice (the sign-off names the VP Education, and the welcome
  // names them mid-sentence too) needs two parameters, and mapping it once would
  // leave the second occurrence to be stripped silently.
  const used = [...body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
  const tally = (list: string[]) => list.reduce<Record<string, number>>(
    (acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});
  const usedCount = tally(used);
  const paramCount = tally(params);
  const unmapped = Object.keys(usedCount).filter((v) => (paramCount[v] ?? 0) < usedCount[v]);

  async function save() {
    setSaving(true); setMsg(null);
    const res = await fetch('/api/admin/whatsapp-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId: currentAdminId, key: tplKey,
        template_name: templateName, language_code: language,
        body_text: body, param_vars: params, enabled,
      }),
    });
    setSaving(false);
    setMsg(res.ok ? '✓ Saved' : '✗ Could not save');
    if (res.ok) onSaved();
    setTimeout(() => setMsg(null), 3000);
  }

  // The body as Meta wants it: our named placeholders replaced by {{1}}, {{2}}…
  // in the configured order. Recomputed locally so edits show up before saving.
  // One occurrence at a time — mirrors toMetaBody on the server, so a repeated
  // variable becomes two numbered parameters rather than collapsing onto one.
  const metaBody = (() => {
    let out = body;
    params.forEach((name, i) => {
      out = out.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`), `{{${i + 1}}}`);
    });
    // Leading letter or underscore only, so the cleanup can't eat the {{1}},
    // {{2}}… numbering just written in.
    return out.replace(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/g, '');
  })();

  async function copyMetaBody() {
    try { await navigator.clipboard.writeText(metaBody); } catch { return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`${cardCls} overflow-hidden`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{data.labels[tplKey] ?? tplKey}</span>
          <span className="block text-[11px] text-slate-400 truncate">{data.hints[tplKey] ?? ''}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {!enabled
            ? <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">Off</span>
            : configured
              ? <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full">Ready</span>
              : <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-full">No template</span>}
          <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-700 dark:text-slate-300">Send this message</span>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-5 h-5 accent-emerald-600" />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2"><span className={labelCls}>Approved template name</span>
              <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)}
                placeholder="club_meeting_created" className={inputCls} /></label>
            <label><span className={labelCls}>Language</span>
              <input type="text" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" className={inputCls} /></label>
          </div>

          <label><span className={labelCls}>Message body</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} className={`${inputCls} font-mono text-xs leading-relaxed`} />
          </label>
          <p className="text-[11px] text-slate-400">
            Available placeholders: {placeholders.map((p) => `{{${p}}}`).join(', ')}
          </p>
          <p className="text-[11px] text-slate-400">
            Line breaks, blank lines and emoji belong in the body — Meta allows them here but rejects
            them inside a substituted value, so a list arrives as one line with <code>·</code> between
            items. Wrap text in *asterisks* for bold on the phone.
          </p>

          <div>
            <span className={labelCls}>Parameter order — which variable fills Meta&apos;s {'{{1}}'}, {'{{2}}'}…</span>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {params.map((p, i) => (
                <button key={`${p}-${i}`} type="button"
                  onClick={() => setParams(params.filter((_, j) => j !== i))}
                  title="Remove from the order"
                  className="text-[11px] font-mono px-2 py-1 rounded-lg border bg-emerald-600 text-white border-emerald-600">
                  <span className="font-bold mr-1">{i + 1}.</span>{p}
                  <span className="ml-1.5 opacity-70">×</span>
                </button>
              ))}
              {params.length === 0 && <span className="text-[11px] text-slate-400">No parameters — the message will be sent as fixed text.</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {placeholders.map((p) => (
                <button key={p} type="button" onClick={() => setParams([...params, p])}
                  className="text-[11px] font-mono px-2 py-1 rounded-lg border bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-emerald-500">
                  + {p}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Add in the order the placeholders appear in the body; click a numbered one to remove it. A
              variable used twice — the VP Education&apos;s name, in the text and again in the sign-off —
              needs adding twice, once per occurrence.
            </p>
            {unmapped.length > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                Used in the body more often than it is mapped, so the extra occurrence will be dropped from
                the message Meta sends: {unmapped.map((v) => `{{${v}}}`).join(', ')}
              </p>
            )}
          </div>

          {/* What to submit to Meta */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className={`${labelCls} mb-0`}>Paste this into Meta as the template body</span>
              <button type="button" onClick={copyMetaBody} className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-500 shrink-0">
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <pre className="text-[11px] font-mono text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{metaBody}</pre>
          </div>

          {/* What a member reads */}
          {preview && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-900/20 p-3">
              <span className={`${labelCls} mb-1.5`}>How it reads, with real data (as last saved)</span>
              <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{preview.rendered}</pre>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving} className={primaryBtn}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => { setBody(defaultBody); setParams(defaultParams); }} className={ghostBtn}>Reset text</button>
            {msg && <span className="text-sm text-slate-500">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
