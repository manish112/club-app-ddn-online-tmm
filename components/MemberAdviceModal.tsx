'use client';
import type { Member, MeetingWithClaims, RoleKey } from '@/lib/types';
import { ROLE_META } from '@/lib/types';
import { getMemberRecentRoles, formatMeetingDate } from '@/lib/utils';

interface Props {
  member: Member;
  meetings: MeetingWithClaims[];
  onClose: () => void;
}

export function MemberAdviceModal({ member, meetings, onClose }: Props) {
  const recent = getMemberRecentRoles(meetings, member.id, 5);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-modal-dark p-6 max-h-[85vh] overflow-y-auto">
        <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-5 sm:hidden" />

        <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-1">
          Hi TM {member.display_name} 👋
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">Here&apos;s how your roles have been rotating.</p>

        {recent.length > 0 ? (
          <div className="space-y-2 mb-5">
            {recent.map(({ meeting, roles }) => (
              <div key={meeting.id} className="flex items-start gap-3 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Meeting #{meeting.number}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{formatMeetingDate(meeting.date)}</p>
                </div>
                <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                  {roles.map((r: RoleKey, i: number) => (
                    <span key={`${r}-${i}`}
                      className="text-xs font-medium text-maroon-700 dark:text-maroon-400
                                 bg-maroon-50 dark:bg-maroon-950/30
                                 border border-maroon-100 dark:border-maroon-900/50
                                 rounded-full px-2 py-0.5 whitespace-nowrap">
                      {ROLE_META[r].emoji} {ROLE_META[r].label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-5 py-4 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">No roles on record yet.</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Claim one below to get started!</p>
          </div>
        )}

        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-3 mb-3">
          <p className="text-sm text-slate-700 dark:text-amber-200 leading-relaxed">
            🔄 <strong>Keep rotating your roles.</strong> Taking a variety of roles helps you grow
            across every Toastmasters skill — speaking, evaluating, and the supporting roles.
          </p>
        </div>

        <div className="rounded-xl bg-maroon-50 dark:bg-maroon-950/20 border border-maroon-100 dark:border-maroon-900/40 p-3 mb-5">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            ⚠️ You can&apos;t take the <strong>same role in two consecutive meetings</strong>.
            Roles you held in the meeting just before or after will be greyed out.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            The one exception is <strong>Evaluator</strong> — feel free to evaluate back-to-back.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700
                     text-white rounded-xl py-3.5 text-base font-semibold
                     min-h-[44px] active:scale-95 transition-all shadow-sm"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
