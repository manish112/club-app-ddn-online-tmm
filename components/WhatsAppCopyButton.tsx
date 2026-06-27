'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { MeetingWithClaims, Member } from '@/lib/types';
import { buildWhatsAppAgenda, buildWhatsAppIntros } from '@/lib/utils';

type CopyMode = 'full' | 'no-intros' | 'intros-only';

interface Props {
  meeting: MeetingWithClaims;
  members: Member[];
  lockBeforeMins?: number;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white shrink-0">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.1.546 4.073 1.5 5.796L0 24l6.344-1.489A11.938 11.938 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.796 9.796 0 01-5.031-1.385l-.36-.214-3.762.884.9-3.665-.234-.374A9.796 9.796 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/>
    </svg>
  );
}

export function WhatsAppCopyButton({ meeting, members, lockBeforeMins = 60 }: Props) {
  const [picking, setPicking] = useState(false);
  const [copiedMode, setCopiedMode] = useState<CopyMode | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function copy(mode: CopyMode) {
    const membersById = new Map(members.map((m) => [m.id, m]));
    const baseUrl = window.location.origin;
    const text =
      mode === 'intros-only'
        ? buildWhatsAppIntros(meeting, membersById)
        : buildWhatsAppAgenda(meeting, membersById, mode === 'full', lockBeforeMins, baseUrl);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedMode(mode);
    setPicking(false);
    setTimeout(() => setCopiedMode(null), 2500);
  }

  // A fixed, centred toast guarantees the "copied" feedback is visible on
  // mobile regardless of where the button sits / scroll position. Portalled to
  // <body> because MeetingCard's hover transform would otherwise trap the
  // position:fixed overlay to the card (see photo-lightbox-portal-fix).
  const toast =
    mounted && copiedMode !== null
      ? createPortal(
          <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4 pointer-events-none">
            <div className="flex items-center gap-2 bg-[#1fba58] text-white text-sm font-semibold px-5 py-3 rounded-full shadow-lg shadow-black/20">
              <WhatsAppIcon />
              Copied to clipboard!
            </div>
          </div>,
          document.body
        )
      : null;

  // The options are shown in a portalled bottom-sheet (centred on desktop) so
  // they never overflow / squeeze the meeting card they live in, and each
  // option carries a label + description so it's clear what gets copied.
  const sheet =
    mounted && picking
      ? createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setPicking(false)}
          >
            <div
              className="w-full max-w-xs bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-4 space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#25D366]">
                  <WhatsAppIcon />
                </span>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Copy for WhatsApp</p>
              </div>
              <button onClick={() => copy('full')}
                className="w-full text-left px-3 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1fba58] text-white active:scale-[0.98] transition-all">
                <span className="block text-sm font-semibold">Role players + intro</span>
                <span className="block text-[11px] text-white/80">Full agenda with member intros</span>
              </button>
              <button onClick={() => copy('no-intros')}
                className="w-full text-left px-3 py-2.5 rounded-xl bg-slate-500 dark:bg-slate-700 hover:bg-slate-600 dark:hover:bg-slate-600 text-white active:scale-[0.98] transition-all">
                <span className="block text-sm font-semibold">Role players only</span>
                <span className="block text-[11px] text-white/80">Agenda without the intros</span>
              </button>
              <button onClick={() => copy('intros-only')}
                className="w-full text-left px-3 py-2.5 rounded-xl bg-navy-700 hover:bg-navy-800 text-white active:scale-[0.98] transition-all">
                <span className="block text-sm font-semibold">Intro only</span>
                <span className="block text-[11px] text-white/80">Just the member introductions</span>
              </button>
              <button onClick={() => setPicking(false)}
                className="w-full py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {toast}
      {sheet}
      <button
        onClick={() => setPicking(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                   bg-[#25D366] text-white hover:bg-[#1fba58] active:scale-95
                   transition-all min-h-[36px] shadow-sm"
      >
        <WhatsAppIcon />
        Copy for WhatsApp
      </button>
    </>
  );
}
