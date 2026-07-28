'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { Member, MemberInterestSurvey, ClubSurvey, ClubSurveyResponse } from '@/lib/types';
import type { MemberInterestResponses, ClubSurveyResponses } from '@/lib/surveys';
import { MemberInterestResponseView, ClubSurveyResponseView } from '@/components/SurveyResponseView';
import { ClubSurveyReport } from '@/components/ClubSurveyReport';

const inputCls = 'w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-maroon-600';
const cardCls = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl shadow-card-light dark:shadow-card-dark';
const labelCls = 'text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block';
const primaryBtn = 'bg-gradient-to-r from-maroon-700 to-maroon-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold active:scale-95 transition-all disabled:opacity-40';
const ghostBtn = 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40';

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AdminSurveysPanel({ members }: { members: Member[] }) {
  const supabase = createClient();
  const nameById = new Map(members.map((m) => [m.id, m.display_name]));

  const [interestSubs, setInterestSubs] = useState<MemberInterestSurvey[]>([]);
  const [surveys, setSurveys] = useState<ClubSurvey[]>([]);
  const [responses, setResponses] = useState<ClubSurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [{ data: subs }, { data: svys }, { data: resps }] = await Promise.all([
      supabase.from('member_interest_surveys').select('*').order('submitted_at', { ascending: false }),
      supabase.from('club_surveys').select('*').order('created_at', { ascending: false }),
      supabase.from('club_survey_responses').select('*').order('submitted_at', { ascending: false }),
    ]);
    setInterestSubs((subs as MemberInterestSurvey[]) ?? []);
    setSurveys((svys as ClubSurvey[]) ?? []);
    setResponses((resps as ClubSurveyResponse[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function resetInterest(id: string, name: string) {
    if (!confirm(`Reset the interest survey for TM ${name}? They'll be able to fill it again.`)) return;
    await supabase.from('member_interest_surveys').delete().eq('id', id);
    fetchAll();
  }

  async function setSurveyStatus(s: ClubSurvey, status: 'open' | 'closed') {
    const patch: Record<string, unknown> = { status };
    if (status === 'open') patch.opened_at = new Date().toISOString();
    if (status === 'closed') patch.closed_at = new Date().toISOString();
    await supabase.from('club_surveys').update(patch).eq('id', s.id);
    fetchAll();
  }

  if (loading) return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-32 bg-slate-200 dark:bg-slate-900/60 rounded-2xl animate-pulse" />)}</div>;

  return (
    <div className="space-y-4 pb-8">
      <MemberInterestSection subs={interestSubs} nameById={nameById} onReset={resetInterest} />
      <ClubSurveySection
        surveys={surveys}
        responses={responses}
        nameById={nameById}
        onStatus={setSurveyStatus}
        onCreated={fetchAll}
      />
    </div>
  );
}

// ── Member Interest ─────────────────────────────────────────────────────────
function MemberInterestSection({ subs, nameById, onReset }: {
  subs: MemberInterestSurvey[]; nameById: Map<string, string>; onReset: (id: string, name: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className={`${cardCls} p-5`}>
      <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">Member Interest Surveys</h3>
      <p className="text-xs text-slate-500 mb-3">{subs.length} submission{subs.length !== 1 ? 's' : ''}. Reset one to let that member fill it again.</p>
      {subs.length === 0 ? (
        <p className="text-sm text-slate-400 py-3 text-center">No submissions yet.</p>
      ) : (
        <div className="space-y-2">
          {subs.map((s) => {
            const name = nameById.get(s.member_id) ?? 'Unknown';
            const open = openId === s.id;
            return (
              <div key={s.id} className="border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button onClick={() => setOpenId(open ? null : s.id)} className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">TM {name}</p>
                    <p className="text-xs text-slate-400">Submitted {fmtDate(s.submitted_at)}</p>
                  </button>
                  <button onClick={() => setOpenId(open ? null : s.id)} className={ghostBtn}>{open ? 'Hide' : 'View'}</button>
                  <button onClick={() => onReset(s.id, name)} className="text-xs text-red-500 hover:text-red-600 px-2 py-2">Reset</button>
                </div>
                {open && (
                  <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <MemberInterestResponseView r={s.responses as unknown as MemberInterestResponses} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Club Surveys ────────────────────────────────────────────────────────────
function ClubSurveySection({ surveys, responses, nameById, onStatus, onCreated }: {
  surveys: ClubSurvey[]; responses: ClubSurveyResponse[]; nameById: Map<string, string>;
  onStatus: (s: ClubSurvey, status: 'open' | 'closed') => void; onCreated: () => void;
}) {
  const supabase = createClient();
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const respBySurvey = new Map<string, ClubSurveyResponse[]>();
  for (const r of responses) {
    const arr = respBySurvey.get(r.survey_id) ?? [];
    arr.push(r);
    respBySurvey.set(r.survey_id, arr);
  }

  async function create() {
    const n = parseInt(number);
    if (!n) return;
    setCreating(true);
    await supabase.from('club_surveys').insert({ survey_number: n, title: title.trim() || null, closes_at: closesAt || null, status: 'draft' });
    setCreating(false); setNumber(''); setTitle(''); setClosesAt('');
    onCreated();
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      open: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400',
      closed: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
      draft: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
    };
    return <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${map[status]}`}>{status}</span>;
  };

  return (
    <div className={`${cardCls} p-5 space-y-4`}>
      <div>
        <h3 className="font-serif font-semibold text-slate-900 dark:text-slate-100 text-sm mb-0.5">Club Surveys</h3>
        <p className="text-xs text-slate-500">Create a survey, open it for members, then close it when done.</p>
      </div>

      {/* Create */}
      <div className="space-y-2">
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <label><span className={labelCls}>Number</span>
            <input type="number" value={number} onChange={(e) => setNumber(e.target.value)} className={inputCls} /></label>
          <label><span className={labelCls}>Title (optional)</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q3 2026" className={inputCls} /></label>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex-1"><span className={labelCls}>Open until (optional)</span>
            <input type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={inputCls} /></label>
          <button onClick={create} disabled={creating || !number} className={primaryBtn}>{creating ? '…' : 'Create'}</button>
        </div>
      </div>

      {/* List */}
      {surveys.length === 0 ? (
        <p className="text-sm text-slate-400 py-2 text-center">No surveys created yet.</p>
      ) : (
        <div className="space-y-2">
          {surveys.map((s) => {
            const resps = respBySurvey.get(s.id) ?? [];
            const expanded = expandedId === s.id;
            const report = reportId === s.id;
            return (
              <div key={s.id} className="border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Survey #{s.survey_number}{s.title ? ` — ${s.title}` : ''} {statusBadge(s.status)}
                    </p>
                    <p className="text-xs text-slate-400">{resps.length} response{resps.length !== 1 ? 's' : ''} · created {fmtDate(s.created_at)}</p>
                  </div>
                  {s.status !== 'open'
                    ? <button onClick={() => onStatus(s, 'open')} className={primaryBtn.replace('px-4 py-2.5', 'px-3 py-2') + ' text-xs'}>Open</button>
                    : <button onClick={() => onStatus(s, 'closed')} className={ghostBtn}>Close</button>}
                  {resps.length > 0 && (
                    <>
                      <button onClick={() => { setReportId(report ? null : s.id); setExpandedId(null); }} className={primaryBtn.replace('px-4 py-2.5', 'px-3 py-2') + ' text-xs'}>{report ? 'Hide report' : '📊 Report'}</button>
                      <button onClick={() => { setExpandedId(expanded ? null : s.id); setReportId(null); }} className={ghostBtn}>{expanded ? 'Hide' : 'Responses'}</button>
                    </>
                  )}
                </div>
                {report && (
                  <div className="px-3 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <ClubSurveyReport responses={resps} />
                  </div>
                )}
                {expanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    {resps.map((r) => (
                      <details key={r.id} className="border border-slate-100 dark:border-slate-800 rounded-lg">
                        <summary className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                          TM {nameById.get(r.member_id) ?? 'Unknown'} <span className="text-xs text-slate-400 font-normal">· {fmtDate(r.submitted_at)}</span>
                        </summary>
                        <div className="px-3 pb-3 pt-1">
                          <ClubSurveyResponseView r={r.responses as unknown as ClubSurveyResponses} />
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
