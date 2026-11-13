// Impostazioni e storico in localStorage (solo su questo dispositivo).
const SK = 'lav.settings.v1';
const HK = 'lav.history.v1';

export const DEFAULTS = {
  mode: 'melody',
  level: 1,
  voiceId: 'baritono',
  clef: 'bass',
  bpm: null,
  showNames: true,
  metronome: true,
  metroDuring: true,
  preTest: 'tonic',
  echo: true,
  foldOctave: false,
  latencyMs: null,
  volTrack: 0.8,
  volVoice: 1,
  volClick: 0.6,
};

function read(k, fallback) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
}
function write(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* spazio esaurito o bloccato */ }
}

export function loadSettings() { return { ...DEFAULTS, ...read(SK, {}) }; }
export function saveSettings(s) { write(SK, s); }

export function history() { return read(HK, []); }
export function addHistory(entry) {
  const h = history();
  h.push(entry);
  write(HK, h.slice(-500));
  return h;
}
export function clearHistory() { write(HK, []); }
