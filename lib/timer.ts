// Speech-timer model shared by the public /timer page and the admin settings panel.
// Times are stored in whole seconds. Defaults follow the official Toastmasters
// 675E Timer Script: green at the lower bound, yellow in the middle, red at the
// upper bound, plus a 30-second grace period before the speaker is over time.

export type TimerModeKey = 'icebreaker' | 'speech' | 'tabletopics' | 'evaluation';

export interface TimerThresholds {
  green: number;  // seconds at which the green card is shown
  yellow: number; // seconds at which the yellow card is shown
  red: number;    // seconds at which the red card is shown (the max time)
  grace: number;  // extra seconds allowed past red before "over time"
}

export type TimerModes = Record<TimerModeKey, TimerThresholds>;

export const DEFAULT_TIMER_MODES: TimerModes = {
  icebreaker:  { green: 240, yellow: 300, red: 360, grace: 30 }, // 4 / 5 / 6 min
  speech:      { green: 300, yellow: 360, red: 420, grace: 30 }, // 5 / 6 / 7 min
  tabletopics: { green: 60,  yellow: 90,  red: 120, grace: 30 }, // 1 / 1:30 / 2 min
  evaluation:  { green: 120, yellow: 150, red: 180, grace: 30 }, // 2 / 2:30 / 3 min
};

export const TIMER_MODE_META: { key: TimerModeKey; label: string; hint: string }[] = [
  { key: 'icebreaker',  label: 'Ice Breaker',   hint: '4–6 min' },
  { key: 'speech',      label: 'Prepared Speech', hint: '5–7 min' },
  { key: 'tabletopics', label: 'Table Topics',  hint: '1–2 min' },
  { key: 'evaluation',  label: 'Evaluation',    hint: '2–3 min' },
];

export type TimerStage = 'under' | 'green' | 'yellow' | 'red' | 'over';

// Which colour card should be showing for the given elapsed seconds.
export function getStage(elapsed: number, t: TimerThresholds): TimerStage {
  if (elapsed >= t.red + t.grace) return 'over';
  if (elapsed >= t.red) return 'red';
  if (elapsed >= t.yellow) return 'yellow';
  if (elapsed >= t.green) return 'green';
  return 'under';
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// Merge partial/stored config over the defaults so missing keys never break the UI.
export function normalizeModes(raw: unknown): TimerModes {
  const out: TimerModes = { ...DEFAULT_TIMER_MODES };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(DEFAULT_TIMER_MODES) as TimerModeKey[]) {
      const v = (raw as Record<string, unknown>)[key];
      if (v && typeof v === 'object') {
        const d = DEFAULT_TIMER_MODES[key];
        const r = v as Partial<TimerThresholds>;
        out[key] = {
          green: Number.isFinite(r.green) ? Number(r.green) : d.green,
          yellow: Number.isFinite(r.yellow) ? Number(r.yellow) : d.yellow,
          red: Number.isFinite(r.red) ? Number(r.red) : d.red,
          grace: Number.isFinite(r.grace) ? Number(r.grace) : d.grace,
        };
      }
    }
  }
  return out;
}
