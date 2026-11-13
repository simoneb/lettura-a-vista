// Valutazione di una prova: intonazione nota per nota e precisione ritmica.
import { midiName } from './theory.js';

const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (a, p) => { if (!a.length) return -100; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

export function isVoiced(f, gateDb) {
  return f.midi !== null && f.clarity > 0.8 && 20 * Math.log10(f.rms + 1e-9) > gateDb;
}

export function noiseGate(energy) {
  const dbs = energy.map((e) => e.db);
  const floor = pct(dbs, 0.05);
  const peak = pct(dbs, 0.95);
  return Math.max(-65, Math.min(floor + 10, peak - 25));
}

// Cents di differenza, eventualmente ripiegati sull'ottava.
export function centsDiff(sung, target, foldOctave) {
  let c = (sung - target) * 100;
  if (foldOctave) { c = ((c % 1200) + 1200) % 1200; if (c > 600) c -= 1200; }
  return c;
}

// Attacchi da energia: salita dopo un avvallamento.
export function energyOnsets(energy, { minGap = 0.09 } = {}) {
  if (!energy.length) return [];
  const dbs = energy.map((e) => e.db);
  const floor = pct(dbs, 0.15);
  const peak = pct(dbs, 0.97);
  const range = Math.max(12, peak - floor);
  const hi = floor + 0.5 * range;
  const lo = floor + 0.3 * range;
  // media mobile su 3 blocchi
  const sm = dbs.map((_, i) => (dbs[Math.max(0, i - 1)] + dbs[i] + dbs[Math.min(dbs.length - 1, i + 1)]) / 3);
  const out = [];
  let armed = true; let lastLoIdx = 0;
  let localMin = Infinity;
  for (let i = 0; i < sm.length; i++) {
    const v = sm[i];
    if (v < lo) { armed = true; lastLoIdx = i; }
    localMin = Math.min(localMin, v);
    // ricarica anche su un avvallamento relativo di 6 dB (note ribattute legate)
    if (!armed && i > 4) {
      const prevMax = Math.max(...sm.slice(Math.max(0, i - 30), i));
      if (prevMax - v > 6) { armed = true; lastLoIdx = i; }
    }
    const recentMin = Math.min(...sm.slice(Math.max(0, i - 8), i + 1));
    if (armed && v > hi && v - recentMin > 6 && v >= sm[Math.max(0, i - 1)]) {
      let k = i;
      while (k > lastLoIdx && sm[k - 1] < sm[k] && sm[k - 1] > lo - 6) k--;
      const t = energy[k].t;
      if (!out.length || t - out[out.length - 1] > minGap) out.push(t);
      armed = false;
    }
  }
  return out;
}

// Attacchi da altezza: inizio del canto o cambio di nota stabile.
export function pitchOnsets(frames, gateDb) {
  const out = [];
  let unvoicedRun = 10;
  const voicedMidi = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const v = isVoiced(f, gateDb);
    if (!v) { unvoicedRun++; voicedMidi.length = 0; continue; }
    if (unvoicedRun >= 3) out.push(f.t);
    unvoicedRun = 0;
    voicedMidi.push(f.midi);
    const n = voicedMidi.length;
    if (n >= 8) {
      const before = median(voicedMidi.slice(n - 8, n - 4));
      const after = median(voicedMidi.slice(n - 4));
      if (Math.abs(after - before) > 0.7) {
        const t = frames[i - 3].t;
        if (!out.length || t - out[out.length - 1] > 0.08) out.push(t);
        voicedMidi.splice(0, n - 4);
      }
    }
  }
  return out;
}

function mergeOnsets(a, b, tol = 0.06) {
  const all = [...a, ...b].sort((x, y) => x - y);
  const out = [];
  for (const t of all) if (!out.length || t - out[out.length - 1] > tol) out.push(t);
  return out;
}

// notes: [{ i, rest, midi, start, end }] (tempi in s sulla stessa linea delle registrazioni corrette)
export function evaluateMelody(notes, frames, energy, { foldOctave = false, tolGood = 30, tolOk = 50 } = {}) {
  const gate = noiseGate(energy);
  const onsets = mergeOnsets(pitchOnsets(frames, gate), energyOnsets(energy));
  const results = [];
  let prevMidi = null;
  for (const n of notes) {
    const dur = n.end - n.start;
    const a = n.start + Math.min(0.2 * dur, 0.12);
    const b = n.end - Math.min(0.1 * dur, 0.05);
    const win = frames.filter((f) => f.t >= a && f.t <= b);
    const voiced = win.filter((f) => isVoiced(f, gate));
    const presence = win.length ? voiced.length / win.length : 0;
    if (n.rest) {
      results.push({ i: n.i, rest: true, status: presence > 0.5 ? 'warn' : 'ok', msg: presence > 0.5 ? 'Hai cantato durante la pausa' : 'Pausa rispettata' });
      prevMidi = null;
      continue;
    }
    const r = { i: n.i, rest: false, presence };
    if (presence < 0.3) {
      r.status = 'bad'; r.pitchStatus = 'bad'; r.msg = 'Non cantata';
    } else {
      const devs = voiced.map((f) => centsDiff(f.midi, n.midi, foldOctave));
      const dev = median(devs);
      r.cents = Math.round(dev);
      const sungMidi = n.midi + dev / 100;
      if (Math.abs(dev) <= tolGood) { r.pitchStatus = 'good'; r.msg = 'Intonata'; }
      else if (Math.abs(dev) <= tolOk) { r.pitchStatus = 'ok'; r.msg = dev > 0 ? 'Un po\' crescente' : 'Un po\' calante'; }
      else if (Math.abs(dev) <= 70) { r.pitchStatus = 'bad'; r.msg = dev > 0 ? 'Troppo crescente' : 'Troppo calante'; }
      else { r.pitchStatus = 'bad'; r.msg = `Nota sbagliata: hai cantato ${midiName(sungMidi, false)}`; }
    }
    // attacco
    const lo = n.start - Math.min(0.25, 0.5 * dur);
    const hi = n.start + Math.min(0.3, 0.5 * dur);
    const cand = onsets.filter((t) => t >= lo && t <= hi);
    if (cand.length) {
      const t = cand.reduce((best, x) => (Math.abs(x - n.start) < Math.abs(best - n.start) ? x : best));
      r.onsetErr = Math.round((t - n.start) * 1000);
      const e = Math.abs(r.onsetErr);
      r.rhythmStatus = e <= 110 ? 'good' : e <= 200 ? 'ok' : 'bad';
    } else if (prevMidi !== null && prevMidi === n.midi && presence >= 0.3) {
      r.rhythmStatus = null; // nota ribattuta legata: attacco non misurabile
    } else {
      r.rhythmStatus = presence >= 0.3 ? 'ok' : 'bad';
    }
    if (r.rhythmStatus === 'bad' && r.pitchStatus !== 'bad') r.msg += r.onsetErr !== undefined ? ` · attacco ${r.onsetErr > 0 ? 'in ritardo' : 'in anticipo'} di ${Math.abs(r.onsetErr)} ms` : ' · attacco non trovato';
    else if (r.rhythmStatus === 'ok' && r.onsetErr !== undefined && r.pitchStatus !== 'bad') r.msg += ` · ${r.onsetErr > 0 ? 'leggermente in ritardo' : 'leggermente in anticipo'}`;
    r.status = worst(r.pitchStatus, r.rhythmStatus);
    results.push(r);
    prevMidi = n.midi;
  }
  return summarize(results, onsets);
}

export function evaluateRhythm(notes, energy) {
  const onsets = energyOnsets(energy);
  const used = new Set();
  const results = [];
  for (const n of notes) {
    const dur = n.end - n.start;
    if (n.rest) {
      const inside = onsets.filter((t) => t > n.start + 0.08 && t < n.end - 0.08);
      results.push({ i: n.i, rest: true, status: inside.length ? 'warn' : 'ok', msg: inside.length ? 'Colpo durante la pausa' : 'Pausa rispettata' });
      continue;
    }
    const lo = n.start - Math.min(0.25, 0.5 * dur);
    const hi = n.start + Math.min(0.3, 0.5 * dur);
    const cand = onsets.filter((t) => t >= lo && t <= hi && !used.has(t));
    const r = { i: n.i, rest: false };
    if (!cand.length) { r.status = 'bad'; r.rhythmStatus = 'bad'; r.msg = 'Attacco mancante'; }
    else {
      const t = cand.reduce((best, x) => (Math.abs(x - n.start) < Math.abs(best - n.start) ? x : best));
      used.add(t);
      r.onsetErr = Math.round((t - n.start) * 1000);
      const e = Math.abs(r.onsetErr);
      r.rhythmStatus = e <= 80 ? 'good' : e <= 160 ? 'ok' : 'bad';
      r.status = r.rhythmStatus;
      r.msg = e <= 80 ? 'A tempo' : `${r.onsetErr > 0 ? 'In ritardo' : 'In anticipo'} di ${e} ms`;
    }
    results.push(r);
  }
  const extra = onsets.filter((t) => !used.has(t) && t >= notes[0].start - 0.2 && t <= notes[notes.length - 1].end).length;
  const s = summarize(results, onsets);
  s.extra = extra;
  return s;
}

function worst(a, b) {
  const rank = { bad: 3, warn: 2, ok: 1, good: 0 };
  const xs = [a, b].filter((x) => x);
  return xs.reduce((w, x) => (rank[x] > rank[w] ? x : w), 'good');
}

function score(list, key) {
  const vals = list.map((r) => r[key]).filter((x) => x);
  if (!vals.length) return null;
  const pts = vals.reduce((s, v) => s + (v === 'good' ? 1 : v === 'ok' ? 0.5 : 0), 0);
  return Math.round((100 * pts) / vals.length);
}

function summarize(results, onsets) {
  const notes = results.filter((r) => !r.rest);
  const pitch = score(notes, 'pitchStatus');
  const rhythm = score(notes, 'rhythmStatus');
  const restsOk = results.filter((r) => r.rest).every((r) => r.status === 'ok');
  const parts = [pitch, rhythm].filter((x) => x !== null);
  const total = parts.length ? Math.round(parts.reduce((s, x) => s + x, 0) / parts.length) : 0;
  return { results, pitch, rhythm, total, restsOk, onsets };
}
