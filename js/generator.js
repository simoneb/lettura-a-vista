// Generatore di esercizi: melodie, intervalli, ritmo.
import {
  KEYS, degreePitch, scaleDegreeOf, pitchMidi, INTERVALS, intervalPitch, transposePitch,
} from './theory.js';

export const VOICES = {
  basso: { it: 'Basso', lo: 41, hi: 60, male: true, clef: 'bass' },
  baritono: { it: 'Baritono', lo: 45, hi: 62, male: true, clef: 'bass' },
  tenore: { it: 'Tenore', lo: 50, hi: 67, male: true, clef: 'treble' },
  contralto: { it: 'Contralto', lo: 55, hi: 72, male: false, clef: 'treble' },
  mezzo: { it: 'Mezzosoprano', lo: 57, hi: 74, male: false, clef: 'treble' },
  soprano: { it: 'Soprano', lo: 60, hi: 77, male: false, clef: 'treble' },
};

export const LEVELS = [
  { n: 1, it: 'Gradi congiunti, Do maggiore', bpm: 60 },
  { n: 2, it: 'Salti di terza, Do/Sol/Fa', bpm: 66 },
  { n: 3, it: 'Arpeggi, crome, 2 alterazioni', bpm: 72 },
  { n: 4, it: '3/4, punto, tonalità minori', bpm: 72 },
  { n: 5, it: 'Seste e ottave, pause', bpm: 76 },
  { n: 6, it: 'Cromatismi, 6/8', bpm: 76 },
  { n: 7, it: 'Settime, sincopi, 4 alterazioni', bpm: 80 },
  { n: 8, it: 'Tutto insieme', bpm: 84 },
];

const KEYS_BY_LEVEL = [
  ['C'],
  ['C', 'G', 'F'],
  ['C', 'G', 'F', 'D', 'Bb', 'Am'],
  ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'Am', 'Em', 'Dm'],
  ['G', 'F', 'D', 'Bb', 'A', 'Eb', 'Am', 'Em', 'Dm', 'Bm', 'Gm'],
  ['G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'Em', 'Dm', 'Bm', 'Gm', 'F#m', 'Cm'],
  Object.keys(KEYS),
  Object.keys(KEYS),
];

const TIMES_BY_LEVEL = [
  ['4/4'], ['4/4', '2/4'], ['4/4', '2/4'], ['4/4', '3/4'], ['4/4', '3/4', '2/4'],
  ['4/4', '3/4', '6/8'], ['4/4', '3/4', '6/8', '2/4'], ['4/4', '3/4', '6/8', '2/4'],
];

export const TIMES = {
  '4/4': { num: 4, den: 4, measureQ: 4, beatQ: 1 },
  '3/4': { num: 3, den: 4, measureQ: 3, beatQ: 1 },
  '2/4': { num: 2, den: 4, measureQ: 2, beatQ: 1 },
  '6/8': { num: 6, den: 8, measureQ: 3, beatQ: 1.5 },
};

// Figure ritmiche per battuta. Numero = durata in semiminime, 'rN' = pausa di durata N.
// Ogni pattern è introdotto dal livello indicato.
const PATTERNS = {
  '4/4': [
    [1, [2, 2]], [1, [1, 1, 2]], [1, [2, 1, 1]], [1, [1, 1, 1, 1]],
    [2, [3, 1]], [2, [1, 2, 1]], [2, [4]],
    [3, [0.5, 0.5, 1, 2]], [3, [1, 0.5, 0.5, 1, 1]], [3, [1, 1, 0.5, 0.5, 1]], [3, [0.5, 0.5, 0.5, 0.5, 2]],
    [4, [1.5, 0.5, 2]], [4, [1.5, 0.5, 1, 1]], [4, [2, 1.5, 0.5]],
    [5, [1, 'r1', 1, 1]], [5, ['r1', 1, 1, 1]], [5, [2, 'r1', 1]], [5, [1, 1, 'r2']],
    [6, [0.75, 0.25, 1, 2]], [6, [1, 'r0.5', 0.5, 2]],
    [7, [0.5, 1, 0.5, 2]], [7, [1, 0.5, 1, 0.5, 1]], [7, [0.25, 0.25, 0.5, 1, 2]],
  ],
  '3/4': [
    [1, [2, 1]], [1, [1, 1, 1]], [1, [1, 2]],
    [3, [0.5, 0.5, 1, 1]], [3, [1, 0.5, 0.5, 1]], [3, [3]],
    [4, [1.5, 0.5, 1]], [4, [2, 0.5, 0.5]],
    [5, [1, 'r1', 1]], [5, ['r1', 1, 1]],
    [7, [0.5, 1, 0.5, 1]], [7, [0.75, 0.25, 2]],
  ],
  '2/4': [
    [1, [1, 1]], [1, [2]],
    [3, [0.5, 0.5, 1]], [3, [1, 0.5, 0.5]],
    [4, [1.5, 0.5]],
    [5, ['r1', 1]], [5, [1, 'r1']],
    [7, [0.5, 1, 0.5]], [7, [0.25, 0.25, 0.5, 1]],
  ],
  '6/8': [
    [1, [1.5, 1.5]], [1, [1, 0.5, 1.5]], [1, [1, 0.5, 1, 0.5]], [1, [0.5, 0.5, 0.5, 1.5]],
    [1, [1.5, 1, 0.5]], [1, [3]], [2, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]],
    [5, [1, 'r0.5', 1.5]], [7, [0.75, 0.25, 0.5, 1.5]],
  ],
};

const FINAL = { '4/4': [[4], [2, 2]], '3/4': [[3]], '2/4': [[2]], '6/8': [[3]] };

function rnd(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[rnd(arr.length)]; }
function weighted(items) {
  const tot = items.reduce((s, [w]) => s + w, 0);
  let r = Math.random() * tot;
  for (const [w, v] of items) { r -= w; if (r <= 0) return v; }
  return items[items.length - 1][1];
}

function patternPool(time, level) {
  return PATTERNS[time].filter(([lv]) => lv <= level).map(([, p]) => p);
}

function patternToSlots(p) {
  return p.map((x) => (typeof x === 'string' ? { d: parseFloat(x.slice(1)), rest: true } : { d: x, rest: false }));
}

// Sceglie la collocazione della tonica e la finestra di gradi utilizzabili.
function placeTonic(key, voice, level) {
  const want = level <= 1 ? [0, 5] : level <= 2 ? [-3, 7] : level <= 4 ? [-4, 8] : [-5, 9];
  let best = null;
  for (let oct = 1; oct <= 5; oct++) {
    const tonic = { l: key.tonic.l + 7 * oct, a: key.tonic.a };
    let lo = Infinity; let hi = -Infinity;
    for (let n = want[0]; n <= want[1]; n++) {
      const m = pitchMidi(degreePitch(key, tonic, n));
      if (m >= voice.lo && m <= voice.hi) { lo = Math.min(lo, n); hi = Math.max(hi, n); }
    }
    if (lo > 0 || hi < 3) continue; // la tonica e qualche grado sopra devono stare nell'estensione
    const span = hi - lo;
    const center = (pitchMidi(degreePitch(key, tonic, lo)) + pitchMidi(degreePitch(key, tonic, hi))) / 2;
    const score = span * 10 - Math.abs(center - (voice.lo + voice.hi) / 2);
    if (!best || score > best.score) best = { tonic, lo, hi, score };
  }
  return best;
}

function stepPool(level) {
  // [peso, passo diatonico]
  const p = [[30, 1], [30, -1]];
  if (level === 1) p.push([6, 0]);
  if (level >= 2) p.push([8, 2], [8, -2], [4, 0]);
  if (level >= 3) p.push([5, 3], [5, -3], [5, 4], [5, -4]);
  if (level >= 5) p.push([3, 5], [3, -5], [2, 7], [2, -7]);
  if (level >= 7) p.push([2, 6], [2, -6]);
  return p;
}

const TRIAD = new Set([0, 2, 4]);

function generateDegrees(count, level, lo, hi, key) {
  const pool = stepPool(level);
  const seq = [];
  const starts = level === 1 ? [0] : [0, 0, 2, 4].filter((n) => n >= lo && n <= hi);
  seq.push(pick(starts));
  let lastStep = 0;
  for (let i = 1; i < count; i++) {
    const cur = seq[i - 1];
    let next = null;
    for (let tries = 0; tries < 50 && next === null; tries++) {
      let s = weighted(pool);
      if (Math.abs(lastStep) >= 3) s = -Math.sign(lastStep) * (Math.random() < 0.8 ? 1 : 2); // compensa il salto
      const cand = cur + s;
      if (cand < lo || cand > hi) continue;
      if (s === 0 && seq.length >= 2 && seq[seq.length - 2] === cur) continue;
      if (seq.length >= 3 && seq[seq.length - 2] === cand && seq[seq.length - 3] === cur) continue; // niente altalena
      if (Math.abs(s) >= 3 && level < 5 && !TRIAD.has(scaleDegreeOf(cand))) continue;
      if (Math.abs(s) >= 3 && level < 5 && !TRIAD.has(scaleDegreeOf(cur))) continue;
      const semis = Math.abs(pitchMidi(degreePitch(key, { l: 28, a: 0 }, cand)) - pitchMidi(degreePitch(key, { l: 28, a: 0 }, cur)));
      if (semis === 6 && level < 6) continue; // niente tritono
      next = cand; lastStep = s;
    }
    if (next === null) { next = cur + (cur > (lo + hi) / 2 ? -1 : 1); lastStep = next - cur; }
    seq.push(next);
  }
  return seq;
}

// Cadenza finale: penultima sul 2° o 7° grado, ultima sulla tonica.
function fixEnding(seq, lo, hi) {
  const n = seq.length;
  if (n < 2) return;
  const prev = n >= 3 ? seq[n - 3] : seq[0];
  const tonics = [0, 7, -7].filter((t) => t >= lo && t <= hi);
  const final = tonics.reduce((b, t) => (Math.abs(t - prev) < Math.abs(b - prev) ? t : b), tonics[0]);
  seq[n - 1] = final;
  const options = [final + 1, final - 1].filter((t) => t >= lo && t <= hi);
  seq[n - 2] = options.reduce((b, t) => (Math.abs(t - prev) < Math.abs(b - prev) ? t : b), options[0]);
}

function buildPitches(key, tonic, degrees, level) {
  const pitches = degrees.map((n) => degreePitch(key, tonic, n));
  // minore armonico/melodico: sensibile verso la tonica
  if (key.mode === 'minor') {
    for (let i = 0; i < degrees.length - 1; i++) {
      if (scaleDegreeOf(degrees[i]) === 6 && degrees[i + 1] === degrees[i] + 1) {
        pitches[i] = { ...pitches[i], a: pitches[i].a + 1 };
        if (i > 0 && degrees[i - 1] === degrees[i] - 1 && scaleDegreeOf(degrees[i - 1]) === 5) {
          pitches[i - 1] = { ...pitches[i - 1], a: pitches[i - 1].a + 1 };
        }
      }
    }
  }
  // cromatismi di passaggio
  if (level >= 6) {
    for (let i = 1; i < degrees.length - 2; i++) {
      if (Math.random() > 0.3) continue;
      const a = degrees[i - 1]; const b = degrees[i]; const c = degrees[i + 1];
      const gap = pitchMidi(pitches[i + 1]) - pitchMidi(pitches[i]);
      if (pitches[i].a !== degreePitch(key, tonic, b).a) continue;
      if (b === a + 1 && pitches[i].a >= 1) continue;
      if (b === a - 1 && pitches[i + 1].a >= 1) continue;
      if (b === a + 1 && c === b + 1 && gap === 2) { pitches[i] = { ...pitches[i], a: pitches[i].a + 1 }; i++; }
      else if (b === a - 1 && c === b - 1 && gap === -2) { pitches[i] = { l: pitches[i + 1].l, a: pitches[i + 1].a + 1 }; i++; }
    }
  }
  return pitches;
}

function buildRhythm(time, level, measures) {
  const pool = patternPool(time, level);
  const out = [];
  for (let m = 0; m < measures; m++) {
    let p;
    if (m === measures - 1) p = pick(FINAL[time]);
    else {
      p = pick(pool);
      if (m === 0) for (let k = 0; k < 10 && typeof p[0] === 'string'; k++) p = pick(pool); // niente pausa iniziale
    }
    out.push(patternToSlots(p));
  }
  return out;
}

function assemble(measureSlots, pitches, time) {
  const t = TIMES[time];
  const notes = [];
  let k = 0;
  measureSlots.forEach((slots, m) => {
    let q = m * t.measureQ;
    for (const s of slots) {
      const note = { measure: m, startQ: q, durQ: s.d, rest: s.rest };
      if (!s.rest) note.pitch = pitches[k++];
      notes.push(note);
      q += s.d;
    }
  });
  return notes;
}

function transposition(voice, clef) {
  if (clef === 'treble' && voice.male) return 12;
  if (clef === 'bass' && !voice.male) return -12;
  return 0;
}

export function generateMelody({ level, voiceId, clef }) {
  const voice = VOICES[voiceId];
  const key = KEYS[pick(KEYS_BY_LEVEL[level - 1])];
  const time = pick(TIMES_BY_LEVEL[level - 1]);
  const measures = level <= 2 ? 4 : level <= 5 ? 6 : 8;
  const placed = placeTonic(key, voice, level);
  const slots = buildRhythm(time, level, measures);
  const count = slots.flat().filter((s) => !s.rest).length;
  const degrees = generateDegrees(count, level, placed.lo, placed.hi, key);
  fixEnding(degrees, placed.lo, placed.hi);
  const pitches = buildPitches(key, placed.tonic, degrees, level);
  const notes = assemble(slots, pitches, time);
  return finalize({ mode: 'melody', level, key, time, measures, notes, tonic: placed.tonic, voice, clef });
}

export function generateIntervals({ level, voiceId, clef }) {
  const voice = VOICES[voiceId];
  const keyName = level <= 4 ? 'C' : pick(['C', 'G', 'F', 'D', 'Bb']);
  const key = KEYS[keyName];
  const placed = placeTonic(key, voice, Math.max(level, 3));
  const measures = 6;
  const diatonicSteps = level <= 1 ? [1, 2] : level <= 2 ? [1, 2, 3, 4] : level <= 3 ? [1, 2, 3, 4, 5, 7] : [1, 2, 3, 4, 5, 6, 7];
  const notes = [];
  for (let m = 0; m < measures; m++) {
    let a; let b; let label = '';
    for (let tries = 0; tries < 100; tries++) {
      const n0 = placed.lo + rnd(placed.hi - placed.lo + 1);
      a = degreePitch(key, placed.tonic, n0);
      const dir = Math.random() < 0.5 ? 1 : -1;
      if (level >= 5) {
        const pool = INTERVALS.filter(([st]) => diatonicSteps.includes(st) && (level >= 6 || st !== 3 || true));
        const [st, se, lab] = pick(pool);
        if (se === 6 && Math.random() < 0.75) continue; // tritono raro
        b = intervalPitch(a, st, se, dir);
        label = lab + (dir > 0 ? ' ↑' : ' ↓');
        if (Math.abs(b.a) > 1 || Math.abs(a.a) > 1) continue;
      } else {
        const st = pick(diatonicSteps);
        b = degreePitch(key, placed.tonic, n0 + dir * st);
        const se = Math.abs(pitchMidi(b) - pitchMidi(a));
        const found = INTERVALS.find(([s, x]) => s === st && x === se);
        if (!found || se === 6) continue;
        label = found[2] + (dir > 0 ? ' ↑' : ' ↓');
      }
      const mb = pitchMidi(b);
      if (mb >= voice.lo && mb <= voice.hi) break;
    }
    notes.push({ measure: m, startQ: m * 4, durQ: 2, rest: false, pitch: a });
    notes.push({ measure: m, startQ: m * 4 + 2, durQ: 2, rest: false, pitch: b, label });
  }
  return finalize({ mode: 'intervals', level, key, time: '4/4', measures, notes, tonic: placed.tonic, voice, clef });
}

export function generateRhythm({ level, voiceId }) {
  const time = pick(TIMES_BY_LEVEL[Math.min(level + 1, 8) - 1]);
  const measures = level <= 2 ? 4 : 6;
  const slots = buildRhythm(time, Math.min(level + 1, 8), measures);
  const notes = [];
  const t = TIMES[time];
  slots.forEach((ms, m) => {
    let q = m * t.measureQ;
    for (const s of ms) { notes.push({ measure: m, startQ: q, durQ: s.d, rest: s.rest }); q += s.d; }
  });
  return finalize({ mode: 'rhythm', level, key: KEYS.C, time, measures, notes, tonic: { l: 28, a: 0 }, voice: VOICES[voiceId], clef: 'percussion' });
}

function finalize(ex) {
  const transpose = ex.clef === 'percussion' ? 0 : transposition(ex.voice, ex.clef);
  ex.transpose = transpose;
  ex.timeSig = TIMES[ex.time];
  ex.notes.forEach((n, i) => {
    n.i = i;
    if (!n.rest && n.pitch) {
      n.midi = pitchMidi(n.pitch);
      n.written = transpose ? transposePitch(n.pitch, transpose / 12) : n.pitch;
    }
  });
  // tonica nel registro della voce, per il pulsante "tonica"
  ex.tonicMidi = pitchMidi(ex.tonic);
  return ex;
}

export function generate(mode, opts) {
  if (mode === 'intervals') return generateIntervals(opts);
  if (mode === 'rhythm') return generateRhythm(opts);
  return generateMelody(opts);
}
