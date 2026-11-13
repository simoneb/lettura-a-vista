// Motore audio: sintetizzatore, metronomo, riproduzione della registrazione, microfono.
import { midiToHz } from './theory.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.active = new Set();
  }

  async ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain(); this.master.connect(c.destination);
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 4;
      comp.connect(this.master);
      this.track = c.createGain(); this.track.connect(comp);
      this.clicks = c.createGain(); this.clicks.connect(comp);
      this.voice = c.createGain(); this.voice.connect(comp);
      // timbro: armoniche decrescenti, udibile anche nei registri gravi sugli altoparlanti del telefono
      const real = new Float32Array([0, 1, 0.7, 0.45, 0.3, 0.2, 0.12, 0.08, 0.05]);
      this.wave = c.createPeriodicWave(real, new Float32Array(real.length));
      await c.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url));
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx;
  }

  get now() { return this.ctx.currentTime; }

  get outLatency() {
    const c = this.ctx;
    return (c && (c.outputLatency || c.baseLatency)) || 0.03;
  }

  setVolumes({ track, voice, click }) {
    if (!this.ctx) return;
    if (track !== undefined) this.track.gain.value = track;
    if (voice !== undefined) this.voice.gain.value = voice;
    if (click !== undefined) this.clicks.gain.value = click;
  }

  keep(node, stopAt) {
    this.active.add(node);
    node.onended = () => { this.active.delete(node); try { node.disconnect(); } catch (_) { /* */ } };
    if (stopAt) node.stop(stopAt);
  }

  note(midi, when, dur, { vel = 0.32, dest = this.track } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.setPeriodicWave(this.wave);
    o.frequency.value = midiToHz(midi);
    const g = c.createGain();
    const a = 0.025; const r = 0.09;
    const end = when + Math.max(0.08, dur - 0.03);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + a);
    g.gain.setTargetAtTime(vel * 0.75, when + a, 0.25);
    g.gain.setValueAtTime(vel * 0.75, end);
    g.gain.linearRampToValueAtTime(0, end + r);
    o.connect(g); g.connect(dest);
    o.start(when);
    this.keep(o, end + r + 0.02);
  }

  chord(midis, when, dur) {
    midis.forEach((m) => this.note(m, when, dur, { vel: 0.16 }));
  }

  click(when, accent = false) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = accent ? 1760 : 1175;
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(accent ? 0.35 : 0.22, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
    o.connect(g); g.connect(this.clicks);
    o.start(when);
    this.keep(o, when + 0.06);
  }

  buffer(buf, when, offset = 0) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.connect(this.voice);
    s.start(Math.max(when, this.ctx.currentTime), offset);
    this.keep(s);
  }

  stopAll() {
    for (const n of this.active) { try { n.stop(); } catch (_) { /* */ } }
    this.active.clear();
  }
}

// Microfono tramite AudioWorklet: consegna blocchi di campioni con il tempo del contesto.
export class Mic {
  constructor(engine) { this.engine = engine; this.stream = null; this.node = null; this.onChunk = null; }

  async start({ echoCancellation = true, sim = null } = {}) {
    const c = this.engine.ctx;
    this.input = c.createGain();
    this.node = new AudioWorkletNode(c, 'capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    this.node.port.onmessage = (e) => {
      const { samples, frame } = e.data;
      const end = (frame + samples.length - 1) / c.sampleRate;
      if (this.onChunk) this.onChunk(samples, end);
    };
    this.input.connect(this.node);
    const sink = c.createGain(); sink.gain.value = 0;
    this.node.connect(sink); sink.connect(c.destination);
    this.sink = sink;
    if (sim) {
      sim(this.input);
    } else {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
      this.source = c.createMediaStreamSource(this.stream);
      this.source.connect(this.input);
    }
  }

  stop() {
    try { this.source && this.source.disconnect(); } catch (_) { /* */ }
    try { this.node && this.node.disconnect(); this.input.disconnect(); this.sink.disconnect(); } catch (_) { /* */ }
    if (this.node) this.node.port.onmessage = null;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null; this.node = null; this.source = null;
  }
}
