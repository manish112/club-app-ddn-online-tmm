'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { MeetingWithClaims, Member } from '@/lib/types';
import {
  buildAgendaSections,
  formatMeetingDate,
  formatTime,
  DEFAULT_AGENDA_CONFIG,
  type AgendaConfig,
} from '@/lib/utils';

interface Props {
  meeting: MeetingWithClaims;
  members: Member[];
  onClose: () => void;
}

export function AgendaModal({ meeting, members, onClose }: Props) {
  const [config, setConfig] = useState<AgendaConfig>(DEFAULT_AGENDA_CONFIG);

  // Fetch timing config; silently fall back to defaults on any error
  useEffect(() => {
    createClient()
      .from('agenda_config')
      .select('*')
      .single()
      .then(({ data }) => {
        if (!data) return;
        setConfig({
          l1SpeechMins:       data.l1_speech_mins,
          otherSpeechMins:    data.other_speech_mins,
          ttSpeakerCountMin:  data.tt_speaker_count_min,
          ttSpeakerCountMax:  data.tt_speaker_count_max,
          ttMinsPerSpeaker:   data.tt_mins_per_speaker,
          tmodConclusionMins: data.tmod_conclusion_mins,
        });
      });
  }, []);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const membersById = new Map(members.map((m) => [m.id, m]));
  // Supplement with member data embedded in claims (active-member filter may exclude some)
  for (const c of meeting.role_claims) {
    if (c.member && !membersById.has(c.member_id)) {
      membersById.set(c.member_id, c.member as Member);
    }
  }

  const sections = buildAgendaSections(meeting, membersById, config);

  return (
    <>
      {/* Print: hide everything except #agenda-print-content */}
      <style>{`
        @media print {
          html, body {
            height: auto !important;
            overflow: visible !important;
          }
          body * { visibility: hidden; }
          #agenda-print-content,
          #agenda-print-content * { visibility: visible; }
          #agenda-print-content {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
          }
          @page { size: A4 portrait; margin: 14mm 16mm; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal panel */}
      <div className="fixed inset-0 z-50 overflow-y-auto pointer-events-none">
        <div className="min-h-full flex items-start sm:items-center justify-center p-2 sm:p-6 pt-4">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl pointer-events-auto mb-4">

            {/* Sticky toolbar */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-3
                             bg-white/95 backdrop-blur-sm border-b border-stone-100 rounded-t-2xl">
              <span className="text-sm font-semibold text-stone-700 truncate">
                Meeting #{meeting.number} — Agenda
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                             bg-maroon-700 text-white hover:bg-maroon-800 active:scale-95
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
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400
                             hover:bg-stone-100 hover:text-stone-700 transition-colors text-base font-medium"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable agenda content */}
            <div id="agenda-print-content" className="px-5 py-5 font-sans">

              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-1">
                Dehradun WIC India Toastmasters Club
              </p>
              <h1 className="text-2xl font-bold text-stone-900 mb-1">
                Meeting #{meeting.number} — Agenda
              </h1>
              <p className="text-sm text-stone-500">
                {formatMeetingDate(meeting.date)}&nbsp;·&nbsp;
                {formatTime(meeting.start_time)}–{formatTime(meeting.end_time)} IST
              </p>
              {meeting.theme && (
                <p className="mt-1.5 text-sm font-medium text-stone-700">
                  🌐&nbsp;<span className="font-semibold">Theme:</span> {meeting.theme}
                </p>
              )}

              <hr className="my-4 border-stone-200" />

              {sections.map((section) => (
                <div key={section.num} className="mb-6">
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="w-6 h-6 rounded-full bg-maroon-700 text-white
                                     flex items-center justify-center text-xs font-bold shrink-0">
                      {section.num}
                    </span>
                    <h2 className="text-base font-bold text-stone-900">{section.title}</h2>
                  </div>

                  {section.rows.map((row, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 py-2 border-b border-stone-100 last:border-0
                        ${row.indented ? 'pl-7' : ''}`}
                    >
                      <span className="w-[4.5rem] shrink-0 text-[11px] text-stone-400 tabular-nums pt-0.5 font-medium">
                        {row.timeLabel}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold leading-snug text-stone-800">
                            {row.label}
                            {row.name !== undefined && (
                              row.name
                                ? <span className="text-maroon-700"> TM {row.name}</span>
                                : <span className="text-stone-300"> TM ___________</span>
                            )}
                            {row.suffix}
                            {row.name2 !== undefined && (
                              row.name2
                                ? <span className="text-maroon-700"> TM {row.name2}</span>
                                : <span className="text-stone-300"> TM ___________</span>
                            )}
                          </p>
                          {row.duration && (
                            <span className="shrink-0 text-[10px] font-medium border border-stone-300
                                             text-stone-500 px-1.5 py-0.5 rounded whitespace-nowrap mt-0.5">
                              {row.duration}
                            </span>
                          )}
                        </div>
                        {row.note && (
                          <p className="text-xs text-stone-400 italic mt-0.5">{row.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              <p className="text-xs text-stone-400 italic mt-4 leading-relaxed border-t border-stone-100 pt-3">
                Times are a guide, generated from the current role sign-ups. Speech allotments default to
                the Pathways level (Level 1 = 4–{config.l1SpeechMins} min, others = 5–{config.otherSpeechMins} min).
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
