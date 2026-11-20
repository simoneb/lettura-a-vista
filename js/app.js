import { generate, VOICES, LEVELS } from './generator.js';
import { ScoreView } from './score.js';
import { AudioEngine, Mic } from './audio.js';
import { PitchTracker, EnergyTracker } from './pitch.js';
import { evaluateMelody, evaluateRhythm, centsDiff, energyOnsets } from './evaluate.js';
import { midiName, itName, degreePitch, pitchMidi } from './theory.js';
import * as store from './storage.js';
import { Tuner } from './tuner.js';

const SIM = new URLSearchParams(location.search).has('sim');
const $ = (id) => document.getElementById(id);
const MODE_IT = { melody: 'Melodia', intervals: 'Intervalli', rhythm: 'Ritmo' };

const settings = store.loadSettings();
const audio = new AudioEngine();
const score = new ScoreView($('score'));

let ex = null;
let range = [0, 0];
let take = null; // ultima prova
let run = null; // { kind, raf, mic, timer }

// ---------- impostazioni e controlli ----------

function save() { store.saveSettings(settings); }

function bpm() { return settings.bpm || LEVELS[settings.level - 1].bpm; }

function latency() {
  if (SIM) return 0;
  if (settings.latencyMs !== null) return settings.latencyMs / 1000;
  return (audio.ctx ? audio.outLatency : 0.04) + 0.04;
}

function applyVolumes() {
  audio.setVolumes({ track: settings.volTrack, voice: settings.volVoice, click: settings.volClick });
}

function initControls() {
  LEVELS.forEach((l) => $('level').add(new Option(`${l.n} · ${l.it}`, l.n)));
  Object.entries(VOICES).forEach(([id, v]) => $('voice').add(new Option(v.it, id)));

  document.querySelectorAll('#mode button').forEach((b) => b.addEventListener('click', () => {
    settings.mode = b.dataset.mode; save(); syncControls(); newExercise();
  }));
  $('level').addEventListener('change', (e) => {
    settings.level = +e.target.value; settings.bpm = null; settings.showNames = settings.level <= 2;
    save(); syncControls(); newExercise();
  });
  $('clef').addEventListener('change', (e) => { settings.clef = e.target.value; save(); newExercise(); });
  $('bpm').addEventListener('input', (e) => { settings.bpm = +e.target.value; $('bpm-out').textContent = settings.bpm; save(); renderMeta(); });
  $('from').addEventListener('change', (e) => { range[0] = +e.target.value; if (range[1] < range[0]) range[1] = range[0]; syncRange(); draw(); });
  $('to').addEventListener('change', (e) => { range[1] = +e.target.value; if (range[0] > range[1]) range[0] = range[1]; syncRange(); draw(); });
  $('names').addEventListener('change', (e) => { settings.showNames = e.target.checked; save(); draw(); });
  $('metro').addEventListener('change', (e) => { settings.metronome = e.target.checked; save(); });
  $('btn-new').addEventListener('click', () => { stop(); newExercise(); });

  score.onNoteTap = (n) => {
    if (run || ex.mode === 'rhythm') return;
    withAudio(() => audio.note(n.midi, audio.now + 0.02, 1));
  };

  $('btn-tonic').addEventListener('click', () => withAudio(() => playTonic(audio.now + 0.05)));
  $('btn-cadence').addEventListener('click', () => withAudio(() => playCadence(audio.now + 0.05)));
  $('btn-first').addEventListener('click', () => withAudio(() => playFirst(audio.now + 0.05)));
  $('btn-listen').addEventListener('click', () => (run ? stop() : listen()));
  $('btn-sing').addEventListener('click', () => (run ? stop() : sing()));
  $('btn-replay').addEventListener('click', () => (run ? stop() : replay()));

  // impostazioni
  $('btn-settings').addEventListener('click', () => { syncSettingsDialog(); $('dlg-settings').showModal(); });
  $('voice').addEventListener('change', (e) => {
    settings.voiceId = e.target.value; settings.clef = VOICES[settings.voiceId].clef; save(); syncControls(); newExercise();
  });
  $('pretest').addEventListener('change', (e) => { settings.preTest = e.target.value; save(); });
  $('metro-during').addEventListener('change', (e) => { settings.metroDuring = e.target.checked; save(); });
  $('fold').addEventListener('change', (e) => { settings.foldOctave = e.target.checked; save(); });
  $('echo').addEventListener('change', (e) => { settings.echo = e.target.checked; save(); });
  for (const [id, key] of [['vol-track', 'volTrack'], ['vol-voice', 'volVoice'], ['vol-click', 'volClick']]) {
    $(id).addEventListener('input', (e) => { settings[key] = +e.target.value; save(); applyVolumes(); });
  }
  $('latency').addEventListener('input', (e) => { settings.latencyMs = +e.target.value; $('lat-out').textContent = settings.latencyMs; save(); });
  $('btn-calibrate').addEventListener('click', calibrate);

  const tuner = new Tuner({
    audio,
    sim: SIM,
    getSettings: () => settings,
    getVoice: () => VOICES[settings.voiceId],
    getDefaultRef: () => (ex && ex.mode !== 'rhythm' ? ex.tonicMidi : Math.round((VOICES[settings.voiceId].lo + VOICES[settings.voiceId].hi) / 2)),
  });
  $('btn-tuner').addEventListener('click', () => { stop(); tuner.open(); });
  $('btn-history').addEventListener('click', () => { renderHistory(); $('dlg-history').showModal(); });
  $('btn-clear-history').addEventListener('click', () => {
    if (confirm('Cancellare tutto lo storico? Non si può annullare.')) { store.clearHistory(); renderHistory(); }
  });

  let rw = window.innerWidth;
  window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - rw) > 30) { rw = window.innerWidth; draw(); } });
}

function syncControls() {
  document.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === settings.mode));
  $('level').value = settings.level;
  $('clef').value = settings.clef;
  $('clef').disabled = settings.mode === 'rhythm';
  $('bpm').value = bpm();
  $('bpm-out').textContent = bpm();
  $('names').checked = settings.showNames;
  $('metro').checked = settings.metronome;
  const pitched = settings.mode !== 'rhythm';
  ['btn-tonic', 'btn-cadence', 'btn-first'].forEach((id) => { $(id).disabled = !pitched; });
}

function syncSettingsDialog() {
  $('voice').value = settings.voiceId;
  $('pretest').value = settings.preTest;
  $('metro-during').checked = settings.metroDuring;
  $('fold').checked = settings.foldOctave;
  $('echo').checked = settings.echo;
  $('vol-track').value = settings.volTrack;
  $('vol-voice').value = settings.volVoice;
  $('vol-click').value = settings.volClick;
  const lat = Math.round(latency() * 1000);
  $('latency').value = lat;
  $('lat-out').textContent = settings.latencyMs === null ? `${lat} (stima)` : lat;
}

function syncRange() {
  const fill = (sel) => {
    sel.innerHTML = '';
    for (let m = 0; m < ex.measures; m++) sel.add(new Option(m + 1, m));
  };
  if ($('from').options.length !== ex.measures) { fill($('from')); fill($('to')); }
  $('from').value = range[0];
  $('to').value = range[1];
}

// ---------- esercizio ----------

function newExercise() {
  ex = generate(settings.mode, { level: settings.level, voiceId: settings.voiceId, clef: settings.clef });
  range = [0, ex.measures - 1];
  take = null;
  $('btn-replay').disabled = true;
  $('result').hidden = true;
  $('tuner').hidden = true;
  syncRange();
  renderMeta();
  draw();
}

function renderMeta() {
  if (!ex) return;
  const parts = [`<span>${MODE_IT[ex.mode]} · livello <b>${ex.level}</b></span>`];
  if (ex.mode !== 'rhythm') parts.push(`<span><b>${ex.key.it}</b></span>`);
  parts.push(`<span><b>${ex.time}</b> · ♩${ex.timeSig.beatQ === 1.5 ? '.' : ''} = <b>${bpm()}</b></span>`);
  if (ex.mode !== 'rhythm') parts.push(`<span>Tonica <b>${itName(ex.tonic, true)}</b></span>`);
  $('meta').innerHTML = parts.join('');
}

function draw() {
  if (!ex) return;
  const full = range[0] === 0 && range[1] === ex.measures - 1;
  score.render(ex, { showNames: settings.showNames, colors: take && take.colors, range: full ? null : range });
  if (take) drawTake(take);
}

function notesInRange(r = range) {
  return ex.notes.filter((n) => n.measure >= r[0] && n.measure <= r[1]);
}

function timing(r = range) {
  const ts = ex.timeSig;
  const secPerBeat = 60 / bpm();
  const secPerQ = secPerBeat / ts.beatQ;
  return {
    secPerBeat, secPerQ, beatQ: ts.beatQ,
    q0: r[0] * ts.measureQ, q1: (r[1] + 1) * ts.measureQ,
    beatsPerMeasure: Math.round(ts.measureQ / ts.beatQ),
  };
}

const noteStart = (n, T, t0) => t0 + (n.startQ - T.q0) * T.secPerQ;

// ---------- suoni ----------

async function withAudio(fn) {
  await audio.ensure(); applyVolumes(); fn();
}

function playTonic(t) { audio.note(ex.tonicMidi, t, 1.3); return t + 1.6; }

function playFirst(t) {
  const n = notesInRange().find((x) => !x.rest);
  if (n) audio.note(n.midi, t, 1.3);
  return t + 1.6;
}

function playCadence(t) {
  const k = ex.key;
  const tonic = ex.tonic;
  const chord = (degs, raise7) => degs.map((d) => {
    const p = degreePitch(k, tonic, d);
    if (raise7 && k.mode === 'minor' && ((d % 7) + 7) % 7 === 6) p.a += 1;
    return pitchMidi(p);
  });
  const prog = [[[-7, 0, 2, 4], false], [[-4, 0, 3, 5], false], [[-3, -1, 1, 4], true], [[-7, 0, 2, 4], false]];
  const d = 0.75;
  prog.forEach(([degs, r], i) => audio.chord(chord(degs, r), t + i * d, i === 3 ? 1.3 : d));
  return t + 3 * d + 1.6;
}

function scheduleExercise(t0, T, notes, clicks) {
  for (const n of notes) {
    if (n.rest) continue;
    const s = noteStart(n, T, t0);
    const dur = n.durQ * T.secPerQ;
    if (ex.mode === 'rhythm') audio.note(69, s, Math.min(dur, 0.9), { vel: 0.22 });
    else audio.note(n.midi, s, dur);
  }
  if (clicks) {
    const beats = Math.round((T.q1 - T.q0) / T.beatQ);
    for (let b = 0; b < beats; b++) audio.click(t0 + b * T.secPerBeat, b % T.beatsPerMeasure === 0);
  }
}

// ---------- trasporto ----------

function setRunning(kind) {
  const btn = { listen: 'btn-listen', sing: 'btn-sing', replay: 'btn-replay' }[kind];
  for (const id of ['btn-listen', 'btn-sing', 'btn-replay']) {
    const b = $(id);
    if (id === btn) { b.classList.add('stop'); b.dataset.label = b.dataset.label || b.innerHTML; b.innerHTML = '<span class="ico">■</span>Stop'; b.disabled = false; }
    else b.disabled = !!kind;
  }
  ['btn-new', 'level', 'clef', 'from', 'to'].forEach((id) => { $(id).disabled = !!kind || (id === 'clef' && settings.mode === 'rhythm'); });
  document.querySelectorAll('#mode button').forEach((b) => { b.disabled = !!kind; });
}

function resetButtons() {
  for (const id of ['btn-listen', 'btn-sing', 'btn-replay']) {
    const b = $(id);
    b.classList.remove('stop');
    if (b.dataset.label) { b.innerHTML = b.dataset.label; delete b.dataset.label; }
    b.disabled = false;
  }
  $('btn-replay').disabled = !take;
  ['btn-new', 'level', 'from', 'to'].forEach((id) => { $(id).disabled = false; });
  $('clef').disabled = settings.mode === 'rhythm';
  document.querySelectorAll('#mode button').forEach((b) => { b.disabled = false; });
}

function stop() {
  if (!run) return;
  const r = run;
  run = null;
  cancelAnimationFrame(r.raf);
  clearTimeout(r.timer);
  audio.stopAll();
  if (r.mic) r.mic.stop();
  score.setCursor(null);
  resetButtons();
  if (r.kind === 'sing') { $('tuner').hidden = true; document.querySelector('.transport').classList.remove('singing'); }
}

function animateCursor(t0, T, onEnd, onFrame) {
  const lat = audio.outLatency;
  const tick = () => {
    if (!run) return;
    const heard = audio.now - lat;
    const q = T.q0 + (heard - t0) / T.secPerQ;
    if (onFrame) onFrame(heard, q);
    if (q >= T.q0) score.setCursor(Math.min(q, T.q1 - 1e-6));
    if (q >= T.q1) { score.setCursor(null); onEnd(); return; }
    run.raf = requestAnimationFrame(tick);
  };
  run.raf = requestAnimationFrame(tick);
}

async function listen() {
  await audio.ensure(); applyVolumes();
  run = { kind: 'listen' };
  setRunning('listen');
  const loopOnce = () => {
    const T = timing();
    const t0 = audio.now + 0.15;
    scheduleExercise(t0, T, notesInRange(), settings.metronome);
    animateCursor(t0, T, () => {
      if (run && $('loop').checked) { run.timer = setTimeout(loopOnce, 250); } else stop();
    });
  };
  loopOnce();
}

// ---------- prova cantata ----------

async function sing() {
  await audio.ensure(); applyVolumes();
  const T = timing();
  const notes = notesInRange();
  const r = [...range];
  const L = latency();
  const sr = audio.ctx.sampleRate;
  const pt = new PitchTracker(sr);
  const et = new EnergyTracker(sr);
  const frames = []; const energy = []; const chunks = [];
  const mic = new Mic(audio);
  run = { kind: 'sing', mic };
  setRunning('sing');
  take = null;
  $('result').hidden = true;
  $('tuner').hidden = false;
  document.querySelector('.transport').classList.add('singing');
  document.querySelector('.tuner-row').hidden = ex.mode === 'rhythm';
  document.querySelector('.meter').hidden = ex.mode === 'rhythm';
  $('tuner-status').textContent = 'Preparazione…';
  draw();

  let t = audio.now + 0.35;
  const pitched = ex.mode !== 'rhythm';
  let preEnd = t;
  if (pitched && settings.preTest === 'tonic') preEnd = playTonic(t);
  else if (pitched && settings.preTest === 'cadence') preEnd = playTonic(playCadence(t));
  else if (pitched && settings.preTest === 'first') preEnd = playFirst(t);
  t = preEnd;
  const countBeats = T.beatsPerMeasure < 3 ? 2 * T.beatsPerMeasure : T.beatsPerMeasure;
  for (let b = 0; b < countBeats; b++) audio.click(t + b * T.secPerBeat, b % T.beatsPerMeasure === 0);
  const t0 = t + countBeats * T.secPerBeat;
  scheduleExerciseClicksOnly(t0, T, settings.metroDuring);

  let liveFloor = -50;
  let lastLive = null;
  mic.onChunk = (samples, end) => {
    chunks.push({ samples: samples.slice(), end });
    for (const e of et.push(samples, end)) { e.t -= L; energy.push(e); }
    for (const f of pt.push(samples, end)) {
      f.t -= L;
      frames.push(f);
      const db = 20 * Math.log10(f.rms + 1e-9);
      liveFloor = Math.min(liveFloor + 0.01, db);
      if (pitched && f.midi !== null && f.clarity > 0.85 && db > liveFloor + 12) {
        const q = T.q0 + (f.t - t0) / T.secPerQ;
        const target = notes.find((n) => q >= n.startQ && q < n.startQ + n.durQ);
        let st = null;
        if (target && !target.rest) {
          const c = Math.abs(centsDiff(f.midi, target.midi, settings.foldOctave));
          st = c <= 30 ? 'good' : c <= 50 ? 'ok' : 'bad';
        }
        if (q >= T.q0 && q < T.q1) score.addTracePoint(q, f.midi, st);
        lastLive = { f, target };
      } else if (db < liveFloor + 6) lastLive = null;
    }
  };
  try {
    await mic.start({ echoCancellation: settings.echo, sim: SIM ? (input) => simulateSinger(input, t0, T, notes) : null });
  } catch (err) {
    stop();
    $('result').innerHTML = '<h2>Microfono non disponibile</h2><p>Concedi al browser il permesso di usare il microfono (icona a sinistra della barra degli indirizzi) e riprova.</p>';
    $('result').hidden = false;
    return;
  }
  if (!run) { mic.stop(); return; }

  animateCursor(t0, T, () => { run.timer = setTimeout(() => finishTest({ notes, T, t0, L, frames, energy, chunks, r }), 350); }, (heard, q) => {
    if (heard < preEnd) $('tuner-status').textContent = pitched && settings.preTest !== 'none' ? 'Ascolta…' : 'Preparati…';
    else if (heard < t0) $('tuner-status').textContent = `Conta: ${Math.floor((heard - preEnd) / T.secPerBeat) + 1}`;
    else $('tuner-status').textContent = pitched ? 'Canta!' : 'Scandisci «ta» su ogni nota';
    const tgt = notes.find((n) => q >= n.startQ && q < n.startQ + n.durQ);
    $('tuner-target').textContent = !pitched ? '–' : tgt ? (tgt.rest ? 'pausa' : itName(tgt.pitch, true)) : '–';
    if (pitched && lastLive) {
      $('tuner-sung').textContent = midiName(lastLive.f.midi);
      if (lastLive.target && !lastLive.target.rest) {
        const c = centsDiff(lastLive.f.midi, lastLive.target.midi, settings.foldOctave);
        $('needle').style.left = `${50 + Math.max(-50, Math.min(50, c / 2))}%`;
      }
    } else { $('tuner-sung').textContent = '–'; }
  });
}

function scheduleExerciseClicksOnly(t0, T, on) {
  if (!on) return;
  const beats = Math.round((T.q1 - T.q0) / T.beatQ);
  for (let b = 0; b < beats; b++) audio.click(t0 + b * T.secPerBeat, b % T.beatsPerMeasure === 0);
}

// Voce simulata per le prove senza microfono (?sim): qualche errore voluto.
function simulateSinger(input, t0, T, notes) {
  const c = audio.ctx;
  notes.forEach((n, k) => {
    if (n.rest) return;
    const s = noteStart(n, T, t0) + 0.02 + Math.random() * 0.05 + (k === 3 ? 0.22 : 0);
    const e = noteStart(n, T, t0) + n.durQ * T.secPerQ - 0.06;
    const o = c.createOscillator();
    o.setPeriodicWave(audio.wave);
    const detune = k === 5 ? 100 : (Math.random() - 0.5) * 30 + (k === 2 ? -42 : 0);
    o.frequency.value = 440 * Math.pow(2, ((ex.mode === 'rhythm' ? 57 : n.midi) - 69 + detune / 100) / 12);
    const g = c.createGain();
    const end = ex.mode === 'rhythm' ? Math.min(e, s + 0.15) : e;
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.3, s + 0.03);
    g.gain.setValueAtTime(0.3, end); g.gain.linearRampToValueAtTime(0, end + 0.03);
    o.connect(g); g.connect(input);
    o.start(s); o.stop(end + 0.05);
    audio.keep(o);
  });
}

function finishTest({ notes, T, t0, L, frames, energy, chunks, r }) {
  const mic = run && run.mic;
  if (mic) mic.stop();
  const evNotes = notes.map((n) => ({ i: n.i, rest: n.rest, midi: n.midi, start: noteStart(n, T, t0), end: noteStart(n, T, t0) + n.durQ * T.secPerQ }));
  const result = ex.mode === 'rhythm'
    ? evaluateRhythm(evNotes, energy)
    : evaluateMelody(evNotes, frames, energy, { foldOctave: settings.foldOctave });

  // registrazione
  let buffer = null; let perfStart = 0;
  if (chunks.length) {
    const sr = audio.ctx.sampleRate;
    const len = chunks.reduce((s, c) => s + c.samples.length, 0);
    buffer = audio.ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    let o = 0;
    for (const c of chunks) { data.set(c.samples, o); o += c.samples.length; }
    perfStart = chunks[0].end - (chunks[0].samples.length - 1) / sr - L;
  }
  const colors = new Map();
  result.results.forEach((x) => { if (!(x.rest && x.status === 'ok')) colors.set(x.i, x.status); });
  take = { notes, T, t0, frames, energy, buffer, perfStart, result, colors, range: r };
  if (SIM) window.__take = take;
  run = null;
  resetButtons();
  $('tuner').hidden = true;
  document.querySelector('.transport').classList.remove('singing');
  draw();
  renderResult(result);
  store.addHistory({ ts: Date.now(), mode: ex.mode, level: ex.level, key: ex.key.it, time: ex.time, bpm: bpm(), pitch: result.pitch, rhythm: result.rhythm, total: result.total });
}

function drawTake(tk) {
  score.clearTrace();
  if (ex.mode === 'rhythm') {
    for (const x of tk.result.results) {
      if (x.onsetErr === undefined) continue;
      const n = ex.notes[x.i];
      score.addOnsetMark(n.startQ + x.onsetErr / 1000 / tk.T.secPerQ, x.rhythmStatus);
    }
    return;
  }
  const dbs = tk.energy.map((e) => e.db).sort((a, b) => a - b);
  const floor = dbs.length ? dbs[Math.floor(dbs.length * 0.05)] : -60;
  const peak = dbs.length ? dbs[Math.floor(dbs.length * 0.95)] : -20;
  const gate = Math.max(-65, Math.min(floor + 10, peak - 25));
  for (const f of tk.frames) {
    if (f.midi === null || f.clarity <= 0.8 || 20 * Math.log10(f.rms + 1e-9) <= gate) continue;
    const q = tk.T.q0 + (f.t - tk.t0) / tk.T.secPerQ;
    if (q < tk.T.q0 || q >= tk.T.q1) continue;
    const target = tk.notes.find((n) => q >= n.startQ && q < n.startQ + n.durQ);
    let st = null;
    if (target && !target.rest) {
      const c = Math.abs(centsDiff(f.midi, target.midi, settings.foldOctave));
      st = c <= 30 ? 'good' : c <= 50 ? 'ok' : 'bad';
    }
    score.addTracePoint(q, f.midi, st);
  }
}

function renderResult(res) {
  const el = $('result');
  const box = (v, l) => `<div class="score-box"><div class="v">${v === null ? '–' : `${v}%`}</div><div class="l">${l}</div></div>`;
  const ts = ex.timeSig;
  const issues = res.results.filter((x) => x.status !== 'good' && !(x.rest && x.status === 'ok')).map((x) => {
    const n = ex.notes[x.i];
    const beat = Math.floor((n.startQ - n.measure * ts.measureQ) / ts.beatQ) + 1;
    const what = n.rest ? 'pausa' : ex.mode === 'rhythm' ? 'nota' : itName(n.written);
    return `<li><span class="dot ${x.status}"></span><span>Batt. ${n.measure + 1}, tempo ${beat} (${what}): ${x.msg}${x.cents !== undefined && Math.abs(x.cents) <= 70 ? ` (${x.cents > 0 ? '+' : ''}${x.cents} cent)` : ''}</span></li>`;
  });
  const hist = store.history().filter((h) => h.mode === ex.mode && h.level === ex.level).slice(-3);
  let advice = '';
  if (hist.length === 3 && hist.every((h) => h.total >= 85) && ex.level < 8) {
    advice = `<div class="advice">Tre prove sopra l'85% a questo livello. Puoi passare al livello ${ex.level + 1}.</div>`;
  } else if (res.total < 40 && ex.level > 1 && hist.length === 3 && hist.every((h) => h.total < 50)) {
    advice = '<div class="advice">Se fai fatica, rallenta il tempo o lavora su poche battute alla volta con «Ripeti».</div>';
  }
  const extra = res.extra ? `<p class="hint">Colpi in più non previsti: ${res.extra}</p>` : '';
  el.innerHTML = `
    <h2>${res.total >= 85 ? 'Ottimo' : res.total >= 60 ? 'Buono' : 'Da rivedere'}</h2>
    <div class="scores">${box(ex.mode === 'rhythm' ? null : res.pitch, 'Intonazione')}${box(res.rhythm, 'Ritmo')}${box(res.total, 'Totale')}</div>
    ${advice}
    ${issues.length ? `<ul class="issues">${issues.join('')}</ul>` : '<p>Tutte le note giuste e a tempo.</p>'}
    ${extra}
    <div class="row">
      <button class="btn primary" id="btn-retry">Riprova</button>
      <button class="btn ghost" id="btn-next">Nuovo esercizio</button>
      ${advice.includes('livello') && ex.level < 8 ? '<button class="btn ghost" id="btn-levelup">Livello successivo</button>' : ''}
    </div>`;
  el.hidden = false;
  $('btn-retry').onclick = () => sing();
  $('btn-next').onclick = () => newExercise();
  const up = $('btn-levelup');
  if (up) up.onclick = () => { settings.level += 1; settings.bpm = null; settings.showNames = settings.level <= 2; save(); syncControls(); newExercise(); };
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- riascolto ----------

async function replay() {
  if (!take) return;
  await audio.ensure(); applyVolumes();
  run = { kind: 'replay' };
  setRunning('replay');
  const P = audio.now + 0.2;
  const shift = P - take.t0;
  scheduleExercise(P, take.T, take.notes, false);
  if (take.buffer) {
    const when = take.perfStart + shift;
    const off = Math.max(0, audio.now + 0.02 - when);
    audio.buffer(take.buffer, when + off, off);
  }
  animateCursor(P, take.T, () => stop());
}

// ---------- calibrazione latenza ----------

async function calibrate() {
  await audio.ensure();
  const msg = $('cal-msg');
  msg.textContent = 'Ascolto…';
  const mic = new Mic(audio);
  const et = new EnergyTracker(audio.ctx.sampleRate);
  const energy = [];
  mic.onChunk = (s, e) => energy.push(...et.push(s, e));
  try { await mic.start({ echoCancellation: false }); } catch (_) { msg.textContent = 'Microfono non disponibile.'; return; }
  const prev = settings.volClick;
  audio.setVolumes({ click: 1.2 });
  const t = audio.now + 0.8;
  const times = Array.from({ length: 8 }, (_, k) => t + k * 0.6);
  times.forEach((x) => audio.click(x, true));
  await new Promise((res) => setTimeout(res, (t - audio.now + 8 * 0.6 + 0.6) * 1000));
  mic.stop();
  audio.setVolumes({ click: prev });
  const onsets = energyOnsets(energy);
  const diffs = times.map((T) => onsets.find((o) => o > T - 0.005 && o < T + 0.45)).map((o, k) => (o === undefined ? null : o - times[k])).filter((d) => d !== null);
  if (diffs.length < 5) { msg.textContent = `Ho sentito solo ${diffs.length} colpi su 8. Alza il volume e riprova in silenzio.`; return; }
  diffs.sort((a, b) => a - b);
  const L = Math.round(diffs[diffs.length >> 1] * 1000);
  settings.latencyMs = L; save();
  $('latency').value = L; $('lat-out').textContent = L;
  msg.textContent = `Latenza misurata: ${L} ms`;
}

// ---------- storico ----------

function renderHistory() {
  const h = store.history();
  const body = $('history-body');
  if (!h.length) { body.innerHTML = '<p class="empty">Nessuna prova ancora.</p>'; return; }
  const last = h.slice(-30);
  const bars = last.map((x) => `<div title="${x.total}%" style="height:${Math.max(2, x.total)}%"></div>`).join('');
  const groups = {};
  for (const x of h) {
    const k = `${x.mode}|${x.level}`;
    (groups[k] = groups[k] || []).push(x);
  }
  const rows = Object.entries(groups).sort().map(([k, xs]) => {
    const [mode, level] = k.split('|');
    const avg = (key) => { const v = xs.map((x) => x[key]).filter((x) => x !== null && x !== undefined); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : '–'; };
    const recent = xs.slice(-5);
    const rAvg = Math.round(recent.reduce((s, x) => s + x.total, 0) / recent.length);
    return `<tr><td>${MODE_IT[mode]}</td><td>${level}</td><td class="n">${xs.length}</td><td class="n">${avg('pitch')}</td><td class="n">${avg('rhythm')}</td><td class="n">${rAvg}</td></tr>`;
  }).join('');
  const recentRows = h.slice(-12).reverse().map((x) => {
    const d = new Date(x.ts);
    return `<tr><td>${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</td><td>${MODE_IT[x.mode]} ${x.level}</td><td>${x.mode === 'rhythm' ? x.time : x.key}</td><td class="n">${x.total}%</td></tr>`;
  }).join('');
  body.innerHTML = `
    <p class="hint">Ultime ${last.length} prove (punteggio totale)</p>
    <div class="bars">${bars}</div>
    <table class="hist-table"><thead><tr><th>Esercizio</th><th>Liv.</th><th class="n">Prove</th><th class="n">Inton.</th><th class="n">Ritmo</th><th class="n">Ultime 5</th></tr></thead><tbody>${rows}</tbody></table>
    <h3>Recenti</h3>
    <table class="hist-table"><tbody>${recentRows}</tbody></table>`;
}

// ---------- avvio ----------

initControls();
syncControls();
newExercise();

if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('sw.js');
}
