// Rilevamento dell'altezza (YIN) su un flusso di campioni, con sottocampionamento.
import { hzToMidi } from './theory.js';

export class PitchTracker {
  constructor(sampleRate, { minHz = 70, maxHz = 1000 } = {}) {
    this.factor = sampleRate >= 44100 ? 2 : 1;
    this.sr = sampleRate / this.factor;
    this.W = Math.round(this.sr * 0.021); // ~21 ms
    this.maxTau = Math.ceil(this.sr / minHz);
    this.minTau = Math.floor(this.sr / maxHz);
    this.need = this.W + this.maxTau + 2;
    this.ring = new Float32Array(this.need);
    this.buf = new Float32Array(this.need);
    this.w = 0;
    this.filled = 0;
    this.d = new Float32Array(this.maxTau + 1);
    this.hop = Math.round(this.sr * 0.01); // ~10 ms
    this.sinceLast = 0;
    this.carry = null; // campione dispari residuo del sottocampionamento
  }

  // samples: Float32Array a frequenza nativa; endTime: tempo (s) dell'ultimo campione.
  // Restituisce un array di frame { t, hz, midi, clarity, rms }.
  push(samples, endTime) {
    const out = [];
    let src = samples;
    if (this.factor === 2) {
      let start = 0;
      const arr = [];
      if (this.carry !== null) { arr.push((this.carry + samples[0]) * 0.5); start = 1; this.carry = null; }
      for (let i = start; i + 1 < samples.length; i += 2) arr.push((samples[i] + samples[i + 1]) * 0.5);
      if ((samples.length - start) % 2 === 1) this.carry = samples[samples.length - 1];
      src = arr;
    }
    const n = src.length;
    for (let i = 0; i < n; i++) {
      this.ring[this.w] = src[i];
      this.w = (this.w + 1) % this.need;
      if (this.filled < this.need) this.filled++;
      this.sinceLast++;
      if (this.filled === this.need && this.sinceLast >= this.hop) {
        this.sinceLast = 0;
        const head = this.need - this.w;
        this.buf.set(this.ring.subarray(this.w), 0);
        this.buf.set(this.ring.subarray(0, this.w), head);
        const remaining = n - 1 - i;
        const t = endTime - remaining / this.sr - (this.need / 2) / this.sr;
        out.push({ t, ...this.analyze() });
      }
    }
    return out;
  }

  analyze() {
    const { buf, W, maxTau, minTau, d } = this;
    let energy = 0;
    for (let j = 0; j < W + maxTau; j++) energy += buf[j] * buf[j];
    const rms = Math.sqrt(energy / (W + maxTau));
    if (rms < 1e-4) return { hz: 0, midi: null, clarity: 0, rms };
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) { const x = buf[j] - buf[j + tau]; s += x * x; }
      running += s;
      d[tau] = running > 0 ? (s * tau) / running : 1;
    }
    let tauEst = -1;
    const thr = 0.15;
    for (let tau = Math.max(2, minTau); tau < maxTau; tau++) {
      if (d[tau] < thr) {
        while (tau + 1 < maxTau && d[tau + 1] < d[tau]) tau++;
        tauEst = tau; break;
      }
    }
    if (tauEst < 0) {
      // nessun minimo sotto soglia: prendi il minimo globale se abbastanza chiaro
      let best = 1; let bt = -1;
      for (let tau = Math.max(2, minTau); tau < maxTau; tau++) if (d[tau] < best) { best = d[tau]; bt = tau; }
      if (bt < 0 || best > 0.35) return { hz: 0, midi: null, clarity: 1 - best, rms };
      tauEst = bt;
    }
    const x0 = d[tauEst - 1]; const x1 = d[tauEst]; const x2 = d[tauEst + 1] ?? x1;
    const den = x0 + x2 - 2 * x1;
    const shift = den !== 0 ? (0.5 * (x0 - x2)) / den : 0;
    const period = tauEst + Math.max(-1, Math.min(1, shift));
    const hz = this.sr / period;
    return { hz, midi: hzToMidi(hz), clarity: 1 - x1, rms };
  }
}

// Inviluppo d'energia a blocchi di ~5 ms, per gli attacchi.
export class EnergyTracker {
  constructor(sampleRate) {
    this.block = Math.round(sampleRate * 0.005);
    this.sr = sampleRate;
    this.acc = 0; this.count = 0;
  }

  push(samples, endTime) {
    const out = [];
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      this.acc += samples[i] * samples[i];
      if (++this.count === this.block) {
        const rms = Math.sqrt(this.acc / this.block);
        const t = endTime - (n - 1 - i) / this.sr - this.block / 2 / this.sr;
        out.push({ t, db: 20 * Math.log10(rms + 1e-9) });
        this.acc = 0; this.count = 0;
      }
    }
    return out;
  }
}
