'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  DEFAULT_TIMER_MODES, TIMER_MODE_META, normalizeModes, getStage, formatClock,
  type TimerModes, type TimerModeKey, type TimerThresholds, type TimerStage,
} from '@/lib/timer';

const OVERRIDE_KEY = 'tm_timer_overrides';
const MUTE_KEY = 'tm_timer_muted';
const SHOWTIME_KEY = 'tm_timer_showtime';

// Per-stage visual treatment for the big timer surface.
type StageStyle = { bg: string; text: string; sub: string; label: string; chip: string; border: string };
const STAGE_STYLE: Record<TimerStage, StageStyle> = {
  under: { bg: 'bg-slate-800',  text: 'text-white', sub: 'text-white/90', label: 'Ready',     chip: 'bg-slate-600 text-slate-100', border: 'border-transparent' },
  green: { bg: 'bg-emerald-600', text: 'text-white', sub: 'text-white/90', label: 'Green',     chip: 'bg-emerald-800 text-emerald-50', border: 'border-transparent' },
  yellow:{ bg: 'bg-amber-500',   text: 'text-white', sub: 'text-white/90', label: 'Yellow',    chip: 'bg-amber-700 text-amber-50', border: 'border-transparent' },
  red:   { bg: 'bg-red-600',     text: 'text-white', sub: 'text-white/90', label: 'Red',       chip: 'bg-red-800 text-red-50', border: 'border-transparent' },
  over:  { bg: 'bg-red-700 animate-[pulse_0.8s_ease-in-out_infinite]', text: 'text-white', sub: 'text-white/90', label: 'Over time', chip: 'bg-black/40 text-white', border: 'border-transparent' },
};

// Shown while the timer is running but has not yet reached the green threshold,
// so starting the clock visibly changes the card (off-white, not idle grey).
const STARTED_STYLE: StageStyle = {
  bg: 'bg-stone-100', text: 'text-slate-900', sub: 'text-slate-500', label: 'Started', chip: 'bg-slate-200 text-slate-600', border: 'border-black',
};

function MMSSInput({ value, onChange }: { value: number; onChange: (secs: number) => void }) {
  const m = Math.floor(value / 60);
  const s = value % 60;
  const cls = 'w-12 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-1 text-sm text-center bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-maroon-600';
  return (
    <span className="inline-flex items-center gap-1">
      <input type="number" min={0} max={59} value={m} aria-label="minutes"
        onChange={e => onChange(Math.max(0, (parseInt(e.target.value) || 0)) * 60 + s)} className={cls} />
      <span className="text-slate-400 text-sm">:</span>
      <input type="number" min={0} max={59} value={s} aria-label="seconds"
        onChange={e => onChange(m * 60 + Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))} className={cls} />
    </span>
  );
}

export default function TimerPage() {
  const [clubModes, setClubModes] = useState<TimerModes>(DEFAULT_TIMER_MODES);
  const [modes, setModes] = useState<TimerModes>(DEFAULT_TIMER_MODES);
  const [mode, setMode] = useState<TimerModeKey>('speech');
  const [showSettings, setShowSettings] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // Timer state: elapsed = accumulated + (running ? now - startedAt : 0)
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const accumulatedRef = useRef(0);
  const startedAtRef = useRef(0);

  const audioRef = useRef<AudioContext | null>(null);
  const prevStageRef = useRef<TimerStage>('under');

  const t: TimerThresholds = modes[mode];
  const stage = getStage(elapsed, t);

  // ── Load club defaults + local override + mute pref ─────────────────────────
  useEffect(() => {
    setMuted(localStorage.getItem(MUTE_KEY) === '1');
    setShowTime(localStorage.getItem(SHOWTIME_KEY) === '1');
    let override: Partial<TimerModes> | null = null;
    try { override = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || 'null'); } catch { /* ignore */ }

    createClient().from('agenda_config').select('timer_modes').single().then(({ data }) => {
      const club = normalizeModes(data?.timer_modes);
      setClubModes(club);
      setModes(override ? normalizeModes({ ...club, ...override }) : club);
    });
  }, []);

  // ── Ticking ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setElapsed(accumulatedRef.current + (Date.now() - startedAtRef.current) / 1000);
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  // ── Beep on stage change while running ───────────────────────────────────────
  const beep = useCallback((count: number, freq: number, long = false) => {
    if (muted) return;
    const ctx = audioRef.current;
    if (!ctx) return;
    const dur = long ? 0.6 : 0.14;
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      const start = ctx.currentTime + i * (dur + 0.08);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    }
  }, [muted]);

  useEffect(() => {
    const prev = prevStageRef.current;
    if (stage !== prev && running) {
      if (stage === 'green') beep(1, 880);
      else if (stage === 'yellow') beep(2, 880);
      else if (stage === 'red') beep(3, 660);
      else if (stage === 'over') beep(1, 330, true);
    }
    prevStageRef.current = stage;
  }, [stage, running, beep]);

  // ── Controls ─────────────────────────────────────────────────────────────────
  function ensureAudio() {
    if (!audioRef.current) {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioRef.current = new Ctx();
      } catch { /* audio unsupported */ }
    }
    audioRef.current?.resume();
  }

  function start() {
    ensureAudio();
    startedAtRef.current = Date.now();
    setStopped(false);
    setRunning(true);
  }
  function pause() {
    accumulatedRef.current = accumulatedRef.current + (Date.now() - startedAtRef.current) / 1000;
    setElapsed(accumulatedRef.current);
    setRunning(false);
  }
  // Stop ends the timing and reveals the final elapsed time, even when the
  // count-up is otherwise hidden.
  function stop() {
    if (running) {
      accumulatedRef.current = accumulatedRef.current + (Date.now() - startedAtRef.current) / 1000;
      setElapsed(accumulatedRef.current);
    }
    setRunning(false);
    setStopped(true);
  }
  function reset() {
    accumulatedRef.current = 0;
    setElapsed(0);
    setRunning(false);
    setStopped(false);
    prevStageRef.current = 'under';
  }
  function changeMode(key: TimerModeKey) {
    setMode(key);
    reset();
  }
  function toggleMute() {
    setMuted(m => { localStorage.setItem(MUTE_KEY, m ? '0' : '1'); return !m; });
  }
  function toggleShowTime() {
    setShowTime(v => { localStorage.setItem(SHOWTIME_KEY, v ? '0' : '1'); return !v; });
  }

  function updateThreshold(key: TimerModeKey, field: keyof TimerThresholds, secs: number) {
    setModes(prev => {
      const next = { ...prev, [key]: { ...prev[key], [field]: secs } };
      localStorage.setItem(OVERRIDE_KEY, JSON.stringify(next));
      return next;
    });
  }
  function resetToClubDefaults() {
    localStorage.removeItem(OVERRIDE_KEY);
    setModes(clubModes);
  }
  const isOverridden = JSON.stringify(modes) !== JSON.stringify(clubModes);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  // Grace countdown shown while in the red window (still within grace).
  const graceLeft = stage === 'red' ? Math.ceil(t.red + t.grace - elapsed) : 0;
  const ss = stage === 'under' && running ? STARTED_STYLE : STAGE_STYLE[stage];

  return (
    <main className="min-h-[calc(100vh-2.25rem)] bg-slate-50 dark:bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="text-sm text-maroon-600 dark:text-maroon-400 font-medium">← Back</Link>
          <h1 className="font-serif font-semibold text-slate-900 dark:text-slate-100">Speech Timer</h1>
          <ThemeToggle />
        </div>

        {/* Mode selector */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {TIMER_MODE_META.map(({ key, label, hint }) => {
            const active = key === mode;
            return (
              <button key={key} onClick={() => changeMode(key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all active:scale-95 ${
                  active
                    ? 'border-maroon-600 bg-maroon-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                }`}>
                {label} <span className={active ? 'text-white/70' : 'text-slate-400'}>· {hint}</span>
              </button>
            );
          })}
        </div>

        {/* Big timer surface */}
        <div className={`flex flex-col items-center justify-center min-h-[16rem] rounded-3xl border-2 ${ss.border} ${ss.bg} ${ss.text} px-6 py-10 text-center shadow-lg transition-colors duration-300`}>
          {(showTime || stopped) && (
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${ss.chip}`}>
                {running && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
                  </span>
                )}
                {ss.label}
              </span>
            </div>
          )}
          <div className="w-full text-center leading-none">
            {showTime || stopped ? (
              <span className="font-mono font-bold tabular-nums text-7xl sm:text-8xl">
                {formatClock(elapsed)}
              </span>
            ) : (
              <span className={`font-serif font-bold uppercase tracking-wide text-5xl sm:text-6xl ${running && stage !== 'over' ? 'animate-pulse' : ''}`}>
                {ss.label}
              </span>
            )}
          </div>
          <div className={`w-full text-center mt-4 h-5 text-sm font-medium ${ss.sub}`}>
            {stopped
              ? `⏱ Final time: ${formatClock(elapsed)}`
              : stage === 'over'
                ? '⛔ Over time — please conclude'
                : stage === 'red'
                  ? `Grace: ${formatClock(graceLeft)} left`
                  : running
                    ? ''
                    : `Green ${formatClock(t.green)} · Yellow ${formatClock(t.yellow)} · Red ${formatClock(t.red)}`}
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {running ? (
            <>
              <button onClick={pause}
                className="bg-slate-800 dark:bg-slate-700 text-white rounded-xl py-3 text-sm font-semibold active:scale-95 transition-all">
                Pause
              </button>
              <button onClick={stop}
                className="bg-red-700 text-white rounded-xl py-3 text-sm font-semibold active:scale-95 transition-all">
                Stop
              </button>
            </>
          ) : (
            <button onClick={start}
              className="col-span-2 bg-gradient-to-r from-maroon-700 to-maroon-600 text-white rounded-xl py-3 text-sm font-semibold active:scale-95 transition-all">
              {elapsed > 0 ? 'Resume' : 'Start'}
            </button>
          )}
          <button onClick={reset}
            className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl py-3 text-sm font-medium active:scale-95 transition-all">
            Reset
          </button>
        </div>

        {/* Secondary actions */}
        <div className="flex items-center justify-between mt-3 text-sm">
          <div className="flex items-center gap-3">
            <button onClick={toggleMute} className="text-slate-500 dark:text-slate-400 hover:text-maroon-600 dark:hover:text-maroon-400">
              {muted ? '🔇 Sound off' : '🔔 Sound on'}
            </button>
            <button onClick={toggleShowTime} className="text-slate-500 dark:text-slate-400 hover:text-maroon-600 dark:hover:text-maroon-400">
              {showTime ? '🙈 Hide time' : '👁 Show time'}
            </button>
            <button onClick={toggleFullscreen} className="text-slate-500 dark:text-slate-400 hover:text-maroon-600 dark:hover:text-maroon-400">
              ⛶ Fullscreen
            </button>
          </div>
          <button onClick={() => setShowSettings(s => !s)} className="text-slate-500 dark:text-slate-400 hover:text-maroon-600 dark:hover:text-maroon-400">
            {showSettings ? 'Hide times' : 'Adjust times'}
          </button>
        </div>

        {/* Per-session threshold override */}
        {showSettings && (
          <div className="mt-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {TIMER_MODE_META.find(m => m.key === mode)?.label} times (mm:ss)
              </p>
              {isOverridden && (
                <button onClick={resetToClubDefaults} className="text-[11px] font-semibold text-maroon-600 dark:text-maroon-400">
                  Reset to club defaults
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400">Changes apply on this device only. Admins set club-wide defaults in the Admin Panel.</p>
            {(['green', 'yellow', 'red', 'grace'] as const).map(field => (
              <div key={field} className="flex items-center justify-between">
                <span className="text-sm capitalize text-slate-700 dark:text-slate-300">{field === 'grace' ? 'Grace (after red)' : field}</span>
                <MMSSInput value={t[field]} onChange={secs => updateThreshold(mode, field, secs)} />
              </div>
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-400 dark:text-slate-600">
          Tip: share your screen (with the timer visible) so speakers can see the colours. Enable “share tab audio” to share the beeps.
        </p>
      </div>
    </main>
  );
}
