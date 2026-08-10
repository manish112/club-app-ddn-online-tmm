'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import type { MeetingWithClaims, Member } from '@/lib/types';
import {
  buildAgendaSections,
  formatMeetingDate,
  formatTime,
  type AgendaSection,
} from '@/lib/utils';

export default function AgendaPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<MeetingWithClaims | null>(null);
  const [sections, setSections] = useState<AgendaSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('meetings')
      .select('*, role_claims(*, member:members(*))')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          const m = data as MeetingWithClaims;
          const byId = new Map<string, Member>();
          for (const c of m.role_claims) {
            // Guest holders have no member row; their name lives on the claim.
            if (c.member_id && c.member) byId.set(c.member_id, c.member as Member);
          }
          setMeeting(m);
          setSections(buildAgendaSections(m, byId));
        }
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-stone-400 text-sm">
        Loading agenda…
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex items-center justify-center min-h-screen text-stone-500 text-sm">
        Meeting not found.
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          [class*="bg-navy"] { display: none !important; }
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 14mm 16mm; }
        }
      `}</style>

      <div className="max-w-2xl mx-auto px-6 py-8 font-sans text-stone-900">

        {/* Toolbar */}
        <div className="no-print flex items-center justify-between mb-8">
          <button
            onClick={() => history.back()}
            className="text-sm text-stone-500 hover:text-stone-800 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                       bg-maroon-700 text-white hover:bg-maroon-800 active:scale-95
                       transition-all shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white shrink-0">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            Download PDF
          </button>
        </div>

        {/* Meeting header */}
        <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-1">
          Dehradun WIC India Toastmasters Club
        </p>
        <h1 className="text-[1.75rem] font-bold leading-tight text-stone-900 mb-1">
          Meeting #{meeting.number} — Agenda
        </h1>
        <p className="text-sm text-stone-500">
          {formatMeetingDate(meeting.date)}&nbsp;·&nbsp;
          {formatTime(meeting.start_time)}–{formatTime(meeting.end_time)} IST
        </p>
        {meeting.theme && (
          <p className="mt-2 text-sm font-medium text-stone-700">
            🌐&nbsp;<span className="font-semibold">Theme:</span> {meeting.theme}
          </p>
        )}

        <hr className="my-6 border-stone-200" />

        {/* Sections */}
        {sections.map((section) => (
          <div key={section.num} className="mb-8">
            {/* Section header */}
            <div className="flex items-center gap-3 mb-3">
              <span className="w-7 h-7 rounded-full bg-maroon-700 text-white
                               flex items-center justify-center text-sm font-bold shrink-0">
                {section.num}
              </span>
              <h2 className="text-lg font-bold text-stone-900">{section.title}</h2>
            </div>

            {/* Rows */}
            <div>
              {section.rows.map((row, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 py-2.5 border-b border-stone-100 last:border-0
                    ${row.indented ? 'pl-8' : ''}`}
                >
                  {/* Time */}
                  <span className="w-[4.5rem] shrink-0 text-[11px] text-stone-400 tabular-nums pt-0.5 font-medium">
                    {row.timeLabel}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
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
          </div>
        ))}

        {/* Footer */}
        <p className="text-xs text-stone-400 italic mt-6 leading-relaxed border-t border-stone-100 pt-4">
          Times are a guide, generated from the current role sign-ups. Speech allotments default
          to the Pathways level (Level 1 = 4–6 min, others = 5–7 min) and can be overridden per
          speaker via &ldquo;Edit speech details&rdquo;.
        </p>
      </div>
    </>
  );
}
