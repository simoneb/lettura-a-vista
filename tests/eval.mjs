// node tests/eval.mjs — verifica la pipeline intonazione/ritmo su una voce sintetica
import { PitchTracker, EnergyTracker } from '../js/pitch.js';
import { evaluateMelody, evaluateRhythm } from '../js/evaluate.js';
import { midiToHz } from '../js/theory.js';
const sr=48000, spb=1.0;
const notes=[[48,1],[50,1],[52,1],[50,1],[48,2],[52,1],[55,1],[55,1],[53,1],[52,2]];
let t=0.5; const ev=[]; for (const [m,d] of notes){ ev.push({i:ev.length,rest:false,midi:m,start:t,end:t+d*spb}); t+=d*spb; }
// errori voluti: n.3 un semitono sopra, n.6 in ritardo di 250 ms, n.1 calante di 40 cent
const N=Math.ceil((t+0.5)*sr), x=new Float32Array(N); let ph=0;
for (let i=0;i<N;i++){ const ts=i/sr; let cur=null;
  for (const n of ev){ let s=n.start, e=n.end-0.04; if(n.i===6) s+=0.25; if(ts>=s&&ts<e) cur={...n,s,e}; }
  if(cur){ let m=cur.midi; if(cur.i===3) m+=1; if(cur.i===1) m-=0.4; const f=midiToHz(m)*(1+0.004*Math.sin(2*Math.PI*5.5*ts)); ph+=2*Math.PI*f/sr;
    const env=Math.min(1,(ts-cur.s)/0.03)*Math.min(1,(cur.e-ts)/0.03);
    x[i]=0.2*env*(Math.sin(ph)+0.5*Math.sin(2*ph)+0.3*Math.sin(3*ph)); }
  x[i]+=0.002*(Math.random()-0.5); }
const pt=new PitchTracker(sr), et=new EnergyTracker(sr); let fr=[],en=[];
for (let o=0;o<N;o+=1024){ const c=x.subarray(o,Math.min(N,o+1024)); const end=(o+c.length-1)/sr; fr.push(...pt.push(c,end)); en.push(...et.push(c,end)); }
const r=evaluateMelody(ev,fr,en);
console.log('pitch',r.pitch,'rhythm',r.rhythm,'total',r.total);
for (const x of r.results) console.log(x.i, x.status, x.cents, x.onsetErr, x.msg);
const rr=evaluateRhythm(ev,en); console.log('rhythm mode', rr.rhythm, rr.results.map(x=>x.onsetErr).join(','), 'extra', rr.extra);
