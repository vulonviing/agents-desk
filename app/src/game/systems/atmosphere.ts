// Clock and observation driven effects. No work is inferred from ambient movement.
export const skyAt = (hour: number) => hour >= 7 && hour < 17 ? 'day' : hour >= 17 && hour < 20 || hour === 6 ? 'dusk' : 'night';
export interface Atmosphere {
  printer: 'idle' | 'done' | 'error';
  until: number;
  completions: number[];
  celebrationUntil: number;
  lastCelebration: number;
}
export const createAtmosphere = (): Atmosphere => ({ printer: 'idle', until: 0, completions: [], celebrationUntil: 0, lastCelebration: -Infinity });
export function observeAtmosphere(s: Atmosphere, kind: 'completed' | 'error', now: number) {
  s.printer = kind === 'completed' ? 'done' : 'error';
  s.until = now + (kind === 'completed' ? 8000 : 60_000);
  if (kind === 'completed') {
    s.completions = [...s.completions.filter(t => now - t < 3_600_000), now].slice(-3);
    if (s.completions.length >= 3 && now - s.lastCelebration >= 300_000) {
      s.celebrationUntil = now + 2000; s.lastCelebration = now;
    }
  }
}
export function printerState(s: Atmosphere, now: number) {
  return now < s.until ? s.printer : 'idle';
}
