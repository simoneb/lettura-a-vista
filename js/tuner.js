// Accordatore libero e autotest altoparlante → microfono.
import { Mic } from './audio.js';
import { PitchTracker } from './pitch.js';
import { midiName, midiToHz } from './theory.js';

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const COLORS = { good: '#2f855a', ok: '#c47f17', bad: '#c53030' };

export class Tuner {
  constructor({ audio, getSettings, getVoice, getDefaultRef, sim = false }) {
    this.audio = audio;
    this.getSettings = getSettings;
    this.getVoice = getVoice;
    this.getDefaultRef = getDefaultRef;
    this.sim = sim;
    this.$ = (id) => document.getElementById(id);
    this.history = []; // { t, midi | null }
    this.recent = [];
    this.ref = null;
    this.refUntil = 0;
    this.mic = null;
    this.busy = false;
    this.$('tu-ref-down').onclick = () => this.setRef(this.ref - 1);
    this.$('tu-ref-up').onclick = () => this.setRef(this.ref + 1);
    this.$('tu-ref-play').onclick = () => this.playRef();
    this.$('tu-compare').onchange = () => this.drawStatic();
    this.$('tu-selftest').onclick = () => this.selfTest();
    this.$('dlg-tuner').addEventListener('close', () => this.close());
  }

  async open() {
    await this.audio.ensure();
    this.setRef(Math.round(this.getDefaultRef()));
    this.$('tu-selftest-out').innerHTML = '';
    this.$('dlg-tuner').showModal();
    this.history = [];
    this.recent = [];
    await this.startMic(this.getSettings().echo);
    this.loop();
  }

  async startMic(echoCancellation, sink = null) {
    this.stopMic();
    const sr = this.audio.ctx.sampleRate;
    this.pt = new PitchTracker(sr);
    this.floor = -50;
    this.mic = new Mic(this.audio);
    this.mic.onChunk = (samples, end) => {
      for (const f of this.pt.push(samples, end)) {
        const db = 20 * Math.log10(f.rms + 1e-9);
        this.floor = Math.min(this.floor + 0.01, db);
        const voiced = f.midi !== null && f.clarity > 0.85 && db > this.floor + 12;
        const fr = { t: f.t, midi: voiced ? f.midi : null, db };
        if (sink) sink(fr);
        else this.onFrame(fr);
      }
    };
    try {
      const simFn = !this.sim ? null : sink
        ? (input) => { this.audio.track.connect(input); this.loopback = input; } // autotest simulato: altoparlante → ingresso
        : (input) => this.simVoice(input);
      await this.mic.start({ echoCancellation, sim: simFn });
      return true;
    } catch (_) {
      this.$('tu-note').textContent = '—';
      this.$('tu-cents').textContent = 'Microfono non disponibile';
      return false;
    }
  }

  stopMic() {
    if (this.loopback) { try { this.audio.track.disconnect(this.loopback); } catch (_) { /* */ } this.loopback = null; }
    if (this.mic) { this.mic.stop(); this.mic = null; }
    this.audio.stopAll();
  }

  close() {
    cancelAnimationFrame(this.raf);
    this.stopMic();
    this.audio.stopAll();
  }

  setRef(m) {
    const v = this.getVoice();
    this.ref = Math.max(v.lo - 5, Math.min(v.hi + 5, m));
    this.$('tu-ref').textContent = midiName(this.ref);
    this.drawStatic();
  }

  playRef() {
    const t = this.audio.now + 0.05;
    this.audio.note(this.ref, t, 2);
    this.refUntil = t + 2.1 + this.audio.outLatency + 0.1;
  }

  onFrame(f) {
    this.history.push(f);
    const cut = f.t - 6;
    while (this.history.length && this.history[0].t < cut) this.history.shift();
    if (f.midi !== null) { this.recent.push(f.midi); if (this.recent.length > 5) this.recent.shift(); } else this.recent = [];
  }

  loop() {
    const tick = () => {
      this.render();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  status(cents) {
    const a = Math.abs(cents);
    return a <= 15 ? 'good' : a <= 35 ? 'ok' : 'bad';
  }

  render() {
    const compare = this.$('tu-compare').checked;
    const playingRef = this.audio.now < this.refUntil;
    this.$('tu-src').textContent = playingRef ? 'Sto suonando il riferimento: il microfono sente l\'altoparlante' : '';
    if (this.recent.length >= 3) {
      const m = median(this.recent);
      const nearest = Math.round(m);
      const target = compare ? this.ref : nearest;
      let cents = (m - target) * 100;
      if (compare && this.getSettings().foldOctave) { cents = ((cents % 1200) + 1200) % 1200; if (cents > 600) cents -= 1200; }
      this.$('tu-note').textContent = midiName(m);
      this.$('tu-hz').textContent = `${midiToHz(m).toFixed(1)} Hz`;
      const st = this.status(cents);
      const c = Math.round(cents);
      this.$('tu-cents').textContent = compare
        ? (Math.abs(cents) >= 100 ? `${c > 0 ? '+' : ''}${c} cent dal ${midiName(this.ref)}` : `${c > 0 ? '+' : ''}${c} cent`)
        : `${c > 0 ? '+' : ''}${c} cent`;
      this.$('tu-cents').style.color = COLORS[st];
      this.$('tu-needle').style.left = `${50 + Math.max(-50, Math.min(50, cents / 1))}%`;
    } else {
      this.$('tu-note').textContent = '–';
      this.$('tu-hz').textContent = '';
      this.$('tu-cents').textContent = 'Tieni una nota';
      this.$('tu-cents').style.color = '';
    }
    this.drawGraph();
  }

  drawStatic() { /* il grafico si ridisegna a ogni frame */ }

  drawGraph() {
    const cv = this.$('tu-graph');
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth; const h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const compare = this.$('tu-compare').checked;
    const voiced = this.history.filter((f) => f.midi !== null);
    const center = compare ? this.ref : (voiced.length ? Math.round(median(voiced.slice(-30).map((f) => f.midi))) : this.ref);
    const span = 4; // semitoni sopra e sotto
    const y = (m) => h / 2 - ((m - center) / span) * (h / 2 - 8);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--muted').trim() || '#888';
    g.font = '11px system-ui, sans-serif';
    for (let k = -span; k <= span; k++) {
      const yy = y(center + k);
      g.strokeStyle = ink; g.globalAlpha = k === 0 ? 0.6 : 0.18; g.lineWidth = k === 0 ? 1.5 : 1;
      g.beginPath(); g.moveTo(40, yy); g.lineTo(w, yy); g.stroke();
      g.globalAlpha = k === 0 ? 0.9 : 0.5; g.fillStyle = ink;
      g.fillText(midiName(center + k), 2, yy + 4);
    }
    g.globalAlpha = 1;
    if (!this.history.length) return;
    const tEnd = this.history[this.history.length - 1].t;
    const x = (t) => 40 + ((t - (tEnd - 6)) / 6) * (w - 44);
    for (const f of voiced) {
      const target = compare ? this.ref : Math.round(f.midi);
      g.fillStyle = COLORS[this.status((f.midi - target) * 100)];
      g.beginPath(); g.arc(x(f.t), y(f.midi), 2.2, 0, Math.PI * 2); g.fill();
    }
  }

  // Suona alcune note e verifica che il microfono le riconosca.
  async selfTest() {
    if (this.busy) return;
    this.busy = true;
    const btn = this.$('tu-selftest');
    const out = this.$('tu-selftest-out');
    btn.disabled = true;
    out.innerHTML = '<p class="hint">Autotest in corso: stai in silenzio, volume medio-alto…</p>';
    const v = this.getVoice();
    const notes = [v.lo + 3, v.lo + 7, Math.round((v.lo + v.hi) / 2) + 1, v.hi - 2, v.hi + 7];
    const frames = [];
    const ok = await this.startMic(false, (f) => frames.push(f));
    if (!ok) { btn.disabled = false; this.busy = false; return; }
    const t0 = this.audio.now + 0.5;
    const dur = 1.2; const gap = 0.35;
    const L = this.audio.outLatency + 0.05;
    notes.forEach((m, i) => this.audio.note(m, t0 + i * (dur + gap), dur, { vel: 0.4 }));
    this.refUntil = t0 + notes.length * (dur + gap) + L;
    await new Promise((r) => setTimeout(r, (t0 - this.audio.now + notes.length * (dur + gap) + 0.4) * 1000));
    const rows = notes.map((m, i) => {
      const s = t0 + i * (dur + gap) + L + 0.3; const e = s + dur - 0.5;
      const win = frames.filter((f) => f.t >= s && f.t <= e);
      const vm = win.filter((f) => f.midi !== null).map((f) => f.midi);
      if (vm.length < win.length * 0.3 || !vm.length) return { m, status: 'bad', text: 'non sentita' };
      const got = median(vm);
      const c = Math.round((got - m) * 100);
      const oct = Math.abs(Math.abs(c) - 1200) < 60;
      const status = Math.abs(c) <= 15 ? 'good' : Math.abs(c) <= 35 ? 'ok' : 'bad';
      return { m, status, oct, text: `${midiName(got)} (${c > 0 ? '+' : ''}${c} cent)` };
    });
    const good = rows.filter((r) => r.status === 'good').length;
    const lowOct = rows.some((r, i) => i === 0 && (r.oct || r.status === 'bad'));
    let verdict;
    if (good >= 4) verdict = 'Il rilevamento funziona: l\'app riconosce correttamente le note dal microfono.';
    else if (good >= 2) verdict = 'Il rilevamento funziona in parte. Ripeti in un ambiente più silenzioso o con il volume più alto.';
    else verdict = 'Il microfono non riconosce bene le note: controlla il volume, il permesso del microfono e riprova.';
    out.innerHTML = `
      <table class="hist-table"><thead><tr><th>Suonata</th><th>Riconosciuta</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${midiName(r.m)}</td><td><span class="dot ${r.status}" style="display:inline-block"></span> ${r.text}</td></tr>`).join('')}
      </tbody></table>
      <p>${verdict}</p>
      ${lowOct ? '<p class="hint">La nota più grave è difficile per l\'altoparlante del telefono: un errore solo lì non vuol dire che la tua voce venga misurata male.</p>' : ''}`;
    await this.startMic(this.getSettings().echo);
    btn.disabled = false;
    this.busy = false;
  }

  // Voce simulata (?sim): oscilla attorno al riferimento.
  simVoice(input) {
    const c = this.audio.ctx;
    const o = c.createOscillator();
    o.setPeriodicWave(this.audio.wave);
    o.frequency.value = midiToHz(this.ref + 0.12);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.3;
    const lg = c.createGain(); lg.gain.value = midiToHz(this.ref) * 0.02;
    lfo.connect(lg); lg.connect(o.frequency);
    const g = c.createGain(); g.gain.value = 0.25;
    o.connect(g); g.connect(input);
    o.start(); lfo.start();
    this.audio.keep(o); this.audio.keep(lfo);
  }
}
