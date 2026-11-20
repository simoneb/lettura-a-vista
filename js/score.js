// Disegno dello spartito con VexFlow, più cursore e traccia della voce sovrapposti.
import { vexKey, itName, diatonicFromC4 } from './theory.js';

const VF = window.Vex.Flow;
const SVGNS = 'http://www.w3.org/2000/svg';

const DUR = { 4: ['w', 0], 3: ['h', 1], 2: ['h', 0], 1.5: ['q', 1], 1: ['q', 0], 0.75: ['8', 1], 0.5: ['8', 0], 0.25: ['16', 0] };
const REST_KEY = { treble: 'b/4', bass: 'd/3', percussion: 'b/4' };
const C4_LINE = { treble: 0, bass: 6, percussion: 0 };

export const STATUS_COLOR = { good: '#2f855a', ok: '#c47f17', warn: '#c47f17', bad: '#c53030' };

export class ScoreView {
  constructor(el) {
    this.el = el;
    this.systems = [];
    this.notePos = [];
    this.onMeasureTap = null;
    this.onNoteTap = null;
    el.addEventListener('click', (e) => this.handleTap(e));
  }

  render(ex, { showNames = false, colors = null, range = null } = {}) {
    this.ex = ex;
    this.el.innerHTML = '';
    const W = Math.max(300, this.el.clientWidth);
    const ts = ex.timeSig;
    const timeStr = `${ts.num}/${ts.den}`;
    const clef = ex.clef;
    const byMeasure = Array.from({ length: ex.measures }, () => []);
    ex.notes.forEach((n) => byMeasure[n.measure].push(n));
    const maxNotes = Math.max(...byMeasure.map((m) => m.length));
    const minW = Math.max(90, 17 * maxNotes + 20);
    const probe0 = new VF.Stave(0, 0, 200);
    this.decorate(probe0, ex, false);
    const headW = probe0.getNoteStartX() - probe0.getX();
    const perLine = Math.max(1, Math.min(4, Math.floor((W - 12 - headW) / minW)));
    const lines = Math.ceil(ex.measures / perLine);
    const sysH = showNames ? 140 : 118;
    const top = 20;

    const renderer = new VF.Renderer(this.el, VF.Renderer.Backends.SVG);
    renderer.resize(W, lines * sysH + 10);
    const ctx = renderer.getContext();
    this.svg = ctx.svg;
    this.svg.setAttribute('class', 'score-svg');
    this.systems = [];
    this.notePos = new Array(ex.notes.length);
    this.measureBoxes = [];

    for (let s = 0; s < lines; s++) {
      const y = s * sysH + top;
      const m0 = s * perLine;
      const mCount = Math.min(perLine, ex.measures - m0);
      // larghezza dell'intestazione (chiave, armatura, tempo)
      const probe = new VF.Stave(0, y, 200);
      this.decorate(probe, ex, s === 0);
      const extra = probe.getNoteStartX() - probe.getX();
      const noteArea = (W - 12 - extra) / perLine;
      let x = 5;
      const sys = { index: s, y, staves: [], anchors: [] };
      for (let k = 0; k < mCount; k++) {
        const m = m0 + k;
        const width = noteArea + (k === 0 ? extra : 0);
        const stave = new VF.Stave(x, y, width);
        if (k === 0) this.decorate(stave, ex, s === 0);
        if (m === ex.measures - 1) stave.setEndBarType(VF.Barline.type.END);
        stave.setContext(ctx).draw();
        sys.staves.push(stave);
        this.measureBoxes.push({ m, x0: x, x1: x + width, y0: y - 10, y1: y + sysH - 30, sys: s });

        const vfNotes = byMeasure[m].map((n) => this.makeNote(n, ex, showNames, colors));
        const voice = new VF.Voice({ num_beats: ts.num, beat_value: ts.den }).setMode(VF.Voice.Mode.STRICT);
        voice.addTickables(vfNotes);
        if (clef !== 'percussion') VF.Accidental.applyAccidentals([voice], ex.key.vex);
        const beams = VF.Beam.generateBeams(vfNotes.filter((v) => !v.isRest()), { groups: VF.Beam.getDefaultBeamGroups(timeStr) });
        new VF.Formatter().joinVoices([voice]).format([voice], stave.getNoteEndX() - stave.getNoteStartX() - 12);
        voice.draw(ctx, stave);
        beams.forEach((b) => b.setContext(ctx).draw());

        byMeasure[m].forEach((n, j) => {
          const v = vfNotes[j];
          const nx = v.getAbsoluteX() + (v.getGlyphWidth ? v.getGlyphWidth() / 2 : 5);
          this.notePos[n.i] = { sys: s, x: nx };
          sys.anchors.push({ q: n.startQ, x: nx - 4 });
        });
        sys.anchors.push({ q: (m + 1) * ts.measureQ, x: x + width - 6, bar: true });
        x += width;
      }
      sys.stave0 = sys.staves[0];
      this.systems.push(sys);
    }

    // overlay
    this.overlay = document.createElementNS(SVGNS, 'g');
    this.overlay.setAttribute('class', 'overlay');
    this.svg.appendChild(this.overlay);
    this.traceLayer = document.createElementNS(SVGNS, 'g');
    this.overlay.appendChild(this.traceLayer);
    if (range) this.shadeOutside(range);
    this.cursor = document.createElementNS(SVGNS, 'rect');
    this.cursor.setAttribute('class', 'cursor');
    this.cursor.setAttribute('width', '3');
    this.cursor.setAttribute('rx', '1.5');
    this.cursor.style.display = 'none';
    this.overlay.appendChild(this.cursor);
    this.curSys = -1;
  }

  decorate(stave, ex, withTime) {
    const ts = ex.timeSig;
    if (ex.clef === 'percussion') stave.addClef('percussion');
    else {
      const ann = ex.transpose === 12 ? '8vb' : ex.transpose === -12 ? '8va' : undefined;
      stave.addClef(ex.clef, 'default', ann);
      stave.addKeySignature(ex.key.vex);
    }
    if (withTime) stave.addTimeSignature(`${ts.num}/${ts.den}`);
  }

  makeNote(n, ex, showNames, colors) {
    const [d, dots] = DUR[n.durQ];
    const clef = ex.clef === 'percussion' ? 'percussion' : ex.clef;
    let key;
    if (n.rest) key = REST_KEY[clef];
    else if (ex.clef === 'percussion') key = 'b/4';
    else key = vexKey(n.written);
    const sn = new VF.StaveNote({ keys: [key], duration: d + 'd'.repeat(dots) + (n.rest ? 'r' : ''), clef: clef === 'percussion' ? 'treble' : clef, auto_stem: true });
    if (dots) VF.Dot.buildAndAttach([sn], { all: true });
    if (showNames && !n.rest && ex.clef !== 'percussion') {
      const a = new VF.Annotation(itName(n.written)).setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM);
      a.setFont('system-ui, sans-serif', 11);
      sn.addModifier(a, 0);
    }
    if (n.label && showNames) {
      const a = new VF.Annotation(n.label).setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
      a.setFont('system-ui, sans-serif', 10, 'italic');
      sn.addModifier(a, 0);
    }
    const st = colors && colors.get(n.i);
    if (st) sn.setStyle({ fillStyle: STATUS_COLOR[st], strokeStyle: STATUS_COLOR[st] });
    return sn;
  }

  shadeOutside([a, b]) {
    for (const box of this.measureBoxes) {
      if (box.m >= a && box.m <= b) continue;
      const r = document.createElementNS(SVGNS, 'rect');
      r.setAttribute('x', box.x0); r.setAttribute('y', box.y0);
      r.setAttribute('width', box.x1 - box.x0); r.setAttribute('height', box.y1 - box.y0);
      r.setAttribute('class', 'shade');
      this.overlay.appendChild(r);
    }
  }

  // Posizione (sistema, x) del tempo q (in semiminime dall'inizio).
  posAt(q) {
    for (const sys of this.systems) {
      const an = sys.anchors;
      if (q < an[0].q - 1e-9) continue;
      if (q > an[an.length - 1].q + 1e-9) continue;
      for (let i = 0; i < an.length - 1; i++) {
        const a = an[i]; const b = an[i + 1];
        if (q >= a.q - 1e-9 && q <= b.q + 1e-9) {
          if (b.q === a.q) return { sys: sys.index, x: a.x };
          return { sys: sys.index, x: a.x + ((q - a.q) / (b.q - a.q)) * (b.x - a.x) };
        }
      }
    }
    return null;
  }

  yForMidi(sys, midi) {
    const written = midi + this.ex.transpose;
    const line = C4_LINE[this.ex.clef] + diatonicFromC4(written) / 2;
    return this.systems[sys].stave0.getYForNote(line);
  }

  setCursor(q) {
    if (q === null || q === undefined) { this.cursor.style.display = 'none'; this.curSys = -1; return; }
    const p = this.posAt(q);
    if (!p) { this.cursor.style.display = 'none'; return; }
    const st = this.systems[p.sys].stave0;
    const y0 = st.getYForLine(0) - 18;
    const y1 = st.getYForLine(4) + 18;
    this.cursor.style.display = '';
    this.cursor.setAttribute('x', p.x - 1.5);
    this.cursor.setAttribute('y', y0);
    this.cursor.setAttribute('height', y1 - y0);
    if (p.sys !== this.curSys) {
      this.curSys = p.sys;
      this.scrollToSystem(p.sys);
    }
  }

  scrollToSystem(s) {
    const scroller = this.el;
    const sys = this.systems[s];
    if (!sys) return;
    const rect = this.svg.getBoundingClientRect();
    const sysTop = rect.top + sys.y - 30;
    const sysBottom = sysTop + 140;
    if (sysTop < 70 || sysBottom > window.innerHeight - 170) {
      window.scrollBy({ top: sysTop - 90, behavior: 'smooth' });
    }
    void scroller;
  }

  clearTrace() { if (this.traceLayer) this.traceLayer.innerHTML = ''; }

  addTracePoint(q, midi, status) {
    const p = this.posAt(q);
    if (!p) return;
    const y = this.yForMidi(p.sys, midi);
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('cx', p.x.toFixed(1));
    c.setAttribute('cy', y.toFixed(1));
    c.setAttribute('r', '2.2');
    c.setAttribute('fill', STATUS_COLOR[status] || '#5a6b8c');
    c.setAttribute('class', 'trace');
    this.traceLayer.appendChild(c);
  }

  addOnsetMark(q, status) {
    const p = this.posAt(q);
    if (!p) return;
    const st = this.systems[p.sys].stave0;
    const l = document.createElementNS(SVGNS, 'line');
    l.setAttribute('x1', p.x); l.setAttribute('x2', p.x);
    l.setAttribute('y1', st.getYForLine(4) + 14); l.setAttribute('y2', st.getYForLine(4) + 26);
    l.setAttribute('stroke', STATUS_COLOR[status] || '#5a6b8c');
    l.setAttribute('stroke-width', '3');
    l.setAttribute('stroke-linecap', 'round');
    this.traceLayer.appendChild(l);
  }

  handleTap(e) {
    if (!this.svg) return;
    const rect = this.svg.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    const box = this.measureBoxes.find((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
    if (!box) return;
    if (this.onMeasureTap) this.onMeasureTap(box.m);
    if (this.onNoteTap) {
      // nota più vicina al tocco nella battuta toccata
      let best = null;
      for (const n of this.ex.notes) {
        if (n.measure !== box.m || n.rest) continue;
        const d = Math.abs(this.notePos[n.i].x - x);
        if (!best || d < best.d) best = { n, d };
      }
      if (best) this.onNoteTap(best.n);
    }
  }
}
