'use client';
import { useState } from 'react';
import type { Member } from '@/lib/types';

type AvatarMember = Pick<Member, 'display_name' | 'avatar_url' | 'gender'>;

const BG: Record<string, string> = {
  male:   'bg-blue-100 dark:bg-blue-950',
  female: 'bg-rose-100 dark:bg-rose-950',
  other:  'bg-violet-100 dark:bg-violet-950',
};
const FG: Record<string, string> = {
  male:   'text-blue-600 dark:text-blue-400',
  female: 'text-rose-500 dark:text-rose-400',
  other:  'text-violet-600 dark:text-violet-400',
};

interface Props {
  member: AvatarMember;
  size?: number;
  className?: string;
}

export function MemberAvatar({ member, size = 48, className = '' }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const g = member.gender ?? '';
  const bg = BG[g] ?? 'bg-slate-100 dark:bg-slate-800';
  const fg = FG[g] ?? 'text-slate-500 dark:text-slate-400';
  const initial = member.display_name.charAt(0).toUpperCase();

  if (member.avatar_url) {
    return (
      <>
        <img
          src={member.avatar_url}
          alt={member.display_name}
          style={{ width: size, height: size }}
          onClick={() => setLightboxOpen(true)}
          className={`rounded-full object-cover shrink-0 cursor-pointer ${className}`}
        />

        {lightboxOpen && (
          <div
            className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-6"
            onClick={() => setLightboxOpen(false)}
          >
            <div className="relative max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <img
                src={member.avatar_url}
                alt={member.display_name}
                className="w-full rounded-2xl shadow-2xl object-cover"
              />
              <p className="text-center text-white text-sm font-medium mt-3">
                TM {member.display_name}
              </p>
              <button
                onClick={() => setLightboxOpen(false)}
                className="absolute -top-3 -right-3 w-8 h-8 bg-white dark:bg-slate-800 rounded-full shadow-lg
                           flex items-center justify-center text-slate-600 dark:text-slate-300
                           hover:text-slate-900 dark:hover:text-white text-lg font-bold leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={`rounded-full flex items-center justify-center font-bold shrink-0 ${bg} ${fg} ${className}`}
    >
      {initial}
    </div>
  );
}
