// Teoria musicale di base: altezze, tonalità, scale, nomi italiani.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
export const IT_NAMES = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];

// Un'altezza scritta: { l: indice lettera assoluto (ottava*7 + lettera), a: alterazione }
export function pitchMidi(p) {
  const oct = Math.floor(p.l / 7);
  const letter = ((p.l % 7) + 7) % 7;
  return 12 * (oct + 1) + NATURAL_PC[letter] + p.a;
}

export function pitchLetter(p) {
  return ((p.l % 7) + 7) % 7;
}

export function pitchOctave(p) {
  return Math.floor(p.l / 7);
}

export function transposePitch(p, octaves) {
  return { l: p.l + 7 * octaves, a: p.a };
}

export function vexKey(p) {
  const acc = p.a === 0 ? '' : p.a > 0 ? '#'.repeat(p.a) : 'b'.repeat(-p.a);
  return `${LETTERS[pitchLetter(p)].toLowerCase()}${acc}/${pitchOctave(p)}`;
}

export function itName(p, withOctave = false) {
  const acc = p.a === 0 ? '' : p.a > 0 ? '♯'.repeat(p.a) : '♭'.repeat(-p.a);
  return IT_NAMES[pitchLetter(p)] + acc + (withOctave ? pitchOctave(p) : '');
}

const SHARP_NAMES = ['Do', 'Do♯', 'Re', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'Si♭', 'Si'];
export function midiName(m, withOctave = true) {
  const r = Math.round(m);
  const pc = ((r % 12) + 12) % 12;
  return SHARP_NAMES[pc] + (withOctave ? Math.floor(r / 12) - 1 : '');
}

export function midiToHz(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function hzToMidi(f) {
  return 69 + 12 * Math.log2(f / 440);
}

// Tonalità. tonic: lettera (0..6) e alterazione. acc: numero di # (>0) o b (<0).
export const KEYS = {
  C: { tonic: { l: 0, a: 0 }, mode: 'major', vex: 'C', it: 'Do maggiore', acc: 0 },
  G: { tonic: { l: 4, a: 0 }, mode: 'major', vex: 'G', it: 'Sol maggiore', acc: 1 },
  F: { tonic: { l: 3, a: 0 }, mode: 'major', vex: 'F', it: 'Fa maggiore', acc: -1 },
  D: { tonic: { l: 1, a: 0 }, mode: 'major', vex: 'D', it: 'Re maggiore', acc: 2 },
  Bb: { tonic: { l: 6, a: -1 }, mode: 'major', vex: 'Bb', it: 'Si♭ maggiore', acc: -2 },
  A: { tonic: { l: 5, a: 0 }, mode: 'major', vex: 'A', it: 'La maggiore', acc: 3 },
  Eb: { tonic: { l: 2, a: -1 }, mode: 'major', vex: 'Eb', it: 'Mi♭ maggiore', acc: -3 },
  E: { tonic: { l: 2, a: 0 }, mode: 'major', vex: 'E', it: 'Mi maggiore', acc: 4 },
  Ab: { tonic: { l: 5, a: -1 }, mode: 'major', vex: 'Ab', it: 'La♭ maggiore', acc: -4 },
  Am: { tonic: { l: 5, a: 0 }, mode: 'minor', vex: 'Am', it: 'La minore', acc: 0 },
  Em: { tonic: { l: 2, a: 0 }, mode: 'minor', vex: 'Em', it: 'Mi minore', acc: 1 },
  Dm: { tonic: { l: 1, a: 0 }, mode: 'minor', vex: 'Dm', it: 'Re minore', acc: -1 },
  Bm: { tonic: { l: 6, a: 0 }, mode: 'minor', vex: 'Bm', it: 'Si minore', acc: 2 },
  Gm: { tonic: { l: 4, a: 0 }, mode: 'minor', vex: 'Gm', it: 'Sol minore', acc: -2 },
  'F#m': { tonic: { l: 3, a: 1 }, mode: 'minor', vex: 'F#m', it: 'Fa♯ minore', acc: 3 },
  Cm: { tonic: { l: 0, a: 0 }, mode: 'minor', vex: 'Cm', it: 'Do minore', acc: -3 },
  'C#m': { tonic: { l: 0, a: 1 }, mode: 'minor', vex: 'C#m', it: 'Do♯ minore', acc: 4 },
  Fm: { tonic: { l: 3, a: 0 }, mode: 'minor', vex: 'Fm', it: 'Fa minore', acc: -4 },
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

// Altezza del grado n (intero, 0 = tonica, 7 = tonica all'ottava sopra) rispetto a una tonica collocata.
// tonicPitch: { l, a } con ottava assoluta.
export function degreePitch(key, tonicPitch, n) {
  const scale = key.mode === 'major' ? MAJOR : MINOR;
  const deg = ((n % 7) + 7) % 7;
  const oct = Math.floor(n / 7);
  const l = tonicPitch.l + n;
  const tonicMidi = pitchMidi(tonicPitch);
  const targetMidi = tonicMidi + 12 * oct + scale[deg];
  const natural = pitchMidi({ l, a: 0 });
  return { l, a: targetMidi - natural };
}

export function scaleDegreeOf(n) {
  return ((n % 7) + 7) % 7;
}

// Intervalli: [passi di lettera, semitoni, etichetta]
export const INTERVALS = [
  [1, 1, '2ª m'], [1, 2, '2ª M'], [2, 3, '3ª m'], [2, 4, '3ª M'], [3, 5, '4ª g'], [3, 6, '4ª ecc'],
  [4, 6, '5ª dim'], [4, 7, '5ª g'], [5, 8, '6ª m'], [5, 9, '6ª M'], [6, 10, '7ª m'], [6, 11, '7ª M'], [7, 12, '8ª'],
];

export function intervalPitch(p, steps, semis, dir) {
  const l = p.l + dir * steps;
  const target = pitchMidi(p) + dir * semis;
  return { l, a: target - pitchMidi({ l, a: 0 }) };
}

// Posizione diatonica continua di un midi (anche frazionario) rispetto al Do4, in passi.
const CHROM_TO_DIA = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7];
export function diatonicFromC4(m) {
  const rel = m - 60;
  const oct = Math.floor(rel / 12);
  const within = rel - 12 * oct;
  const i = Math.floor(within);
  const f = within - i;
  const d = CHROM_TO_DIA[i] + (CHROM_TO_DIA[i + 1] - CHROM_TO_DIA[i]) * f;
  return 7 * oct + d;
}

export function pitchDiatonicFromC4(p) {
  return p.l - 28; // C4 = 4*7 + 0
}
