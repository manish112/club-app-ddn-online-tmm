'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/utils/supabase/client';
import type { MeetingWithClaims, Member } from '@/lib/types';
import {
  buildAgendaSections,
  formatMeetingDate,
  formatTime,
  DEFAULT_AGENDA_CONFIG,
  type AgendaConfig,
  type AgendaRow,
} from '@/lib/utils';

interface Props {
  meeting: MeetingWithClaims;
  members: Member[];
  onClose: () => void;
}

function NameSpan({ name }: { name: string | undefined }) {
  if (name === undefined) return null;
  return name
    ? <span className="text-maroon-700"> TM {name}</span>
    : <span className="text-slate-300"> TM ___________</span>;
}

function AgendaRowText({ row }: { row: AgendaRow }) {
  return (
    <>
      {row.label}
      <NameSpan name={row.name} />
      {row.suffix}
      <NameSpan name={row.name2} />
    </>
  );
}

export function AgendaModal({ meeting, members, onClose }: Props) {
  const [config, setConfig] = useState<AgendaConfig>(DEFAULT_AGENDA_CONFIG);

  useEffect(() => {
    createClient()
      .from('agenda_config')
      .select('*')
      .single()
      .then(({ data }) => {
        if (!data) return;
        setConfig({
          networkingMins:     data.networking_mins ?? 10,
          l1SpeechMins:       data.l1_speech_mins,
          otherSpeechMins:    data.other_speech_mins,
          ttSpeakerCountMin:  data.tt_speaker_count_min,
          ttSpeakerCountMax:  data.tt_speaker_count_max,
          ttMinsPerSpeaker:   data.tt_mins_per_speaker,
          tmodConclusionMins: data.tmod_conclusion_mins,
          lockBeforeMins:     data.lock_before_mins ?? 60,
          maxSpeakerSlots:    data.max_speaker_slots ?? 2,
        });
      });
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const membersById = new Map(members.map((m) => [m.id, m]));
  for (const c of meeting.role_claims) {
    // Guest holders have no member row — buildAgendaSections reads their name
    // off the claim itself.
    if (c.member_id && c.member && !membersById.has(c.member_id)) {
      membersById.set(c.member_id, c.member as Member);
    }
  }

  const sections = buildAgendaSections(meeting, membersById, config);

  // Print-safe agenda content (always light theme)
  const agendaContent = (
    <div className="px-5 py-5 font-sans">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
        Dehradun Online Toastmasters Club
      </p>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">
        Meeting #{meeting.number} — Agenda
      </h1>
      <p className="text-sm text-slate-500">
        {formatMeetingDate(meeting.date)}&nbsp;·&nbsp;
        {formatTime(meeting.start_time)}–{formatTime(meeting.end_time)} IST
      </p>
      {meeting.theme && (
        <p className="mt-1.5 text-sm font-medium text-slate-700">
          🌐&nbsp;<span className="font-semibold">Theme:</span> {meeting.theme}
        </p>
      )}

      <hr className="my-4 border-slate-200" />

      {sections.map((section) => (
        <div key={section.num} className="mb-6">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-6 h-6 rounded-full bg-maroon-700 text-white
                             flex items-center justify-center text-xs font-bold shrink-0">
              {section.num}
            </span>
            <h2 className="text-base font-bold text-slate-900">{section.title}</h2>
          </div>

          {section.rows.map((row, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 py-2 border-b border-slate-100 last:border-0
                ${row.indented ? 'pl-7' : ''}`}
            >
              <span className="w-[4.5rem] shrink-0 text-[11px] text-slate-400 tabular-nums pt-0.5 font-medium">
                {row.timeLabel}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug text-slate-800">
                    <AgendaRowText row={row} />
                  </p>
                  {row.duration && (
                    <span className="shrink-0 text-[10px] font-medium border border-slate-300
                                     text-slate-500 px-1.5 py-0.5 rounded whitespace-nowrap mt-0.5">
                      {row.duration}
                    </span>
                  )}
                </div>
                {row.note && (
                  <p className="text-xs text-slate-400 italic mt-0.5">{row.note}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      <p className="text-xs text-slate-400 italic mt-4 leading-relaxed border-t border-slate-100 pt-3">
        Times are a guide, generated from the current role sign-ups. Each speech can set its own
        time; otherwise it defaults to the Pathways level (Level 1 = 4–{config.l1SpeechMins} min,
        others = 5–{config.otherSpeechMins} min).
      </p>
    </div>
  );

  return (
    <>
      <style>{`
        #agenda-print-portal { display: none; }
        @media print {
          html, body { height: auto !important; overflow: visible !important; }
          body * { visibility: hidden !important; }
          #agenda-print-portal { display: block !important; }
          #agenda-print-portal, #agenda-print-portal * { visibility: visible !important; }
          #agenda-print-portal {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
          }
          @page { size: A4 portrait; margin: 14mm 16mm; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 z-40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal panel */}
      <div className="fixed inset-0 z-50 overflow-y-auto pointer-events-none">
        <div className="min-h-full flex items-start sm:items-center justify-center p-2 sm:p-6 pt-4">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-modal-dark pointer-events-auto mb-4">

            {/* Sticky toolbar */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-3
                             bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm
                             border-b border-slate-100 dark:border-slate-800 rounded-t-2xl">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                Meeting #{meeting.number} — Agenda
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                             bg-gradient-to-r from-maroon-700 to-maroon-600 text-white
                             hover:from-maroon-800 hover:to-maroon-700 active:scale-95
                             transition-all shadow-sm"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white shrink-0">
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                  </svg>
                  Download PDF
                </button>
                <button
                  onClick={onClose}
                  aria-label="Close agenda"
                  className="w-8 h-8 flex items-center justify-center rounded-lg
                             text-slate-400 dark:text-slate-500
                             hover:bg-slate-100 dark:hover:bg-slate-800
                             hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Agenda content (modal view — inherit dark mode) */}
            <div className="dark:text-slate-100">
              {/* We render the same content but override colors for dark mode via CSS */}
              <div className="px-5 py-5 font-sans">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
                  Dehradun Online Toastmasters Club
                </p>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                  Meeting #{meeting.number} — Agenda
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {formatMeetingDate(meeting.date)}&nbsp;·&nbsp;
                  {formatTime(meeting.start_time)}–{formatTime(meeting.end_time)} IST
                </p>
                {meeting.theme && (
                  <p className="mt-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                    🌐&nbsp;<span className="font-semibold">Theme:</span> {meeting.theme}
                  </p>
                )}
                <hr className="my-4 border-slate-200 dark:border-slate-700" />
                {sections.map((section) => (
                  <div key={section.num} className="mb-6">
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="w-6 h-6 rounded-full bg-maroon-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {section.num}
                      </span>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">{section.title}</h2>
                    </div>
                    {section.rows.map((row, i) => (
                      <div key={i} className={`flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 ${row.indented ? 'pl-7' : ''}`}>
                        <span className="w-[4.5rem] shrink-0 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums pt-0.5 font-medium">
                          {row.timeLabel}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold leading-snug text-slate-800 dark:text-slate-200">
                              <AgendaRowText row={row} />
                            </p>
                            {row.duration && (
                              <span className="shrink-0 text-[10px] font-medium border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded whitespace-nowrap mt-0.5">
                                {row.duration}
                              </span>
                            )}
                          </div>
                          {row.note && <p className="text-xs text-slate-400 dark:text-slate-500 italic mt-0.5">{row.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                <p className="text-xs text-slate-400 dark:text-slate-500 italic mt-4 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
                  Times are a guide, generated from the current role sign-ups.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {createPortal(
        <div id="agenda-print-portal">{agendaContent}</div>,
        document.body
      )}
    </>
  );
}
