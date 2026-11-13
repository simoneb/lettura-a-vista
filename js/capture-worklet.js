// Raccoglie l'ingresso in blocchi da 1024 campioni e li invia con il frame iniziale.
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 1024;
    this.buf = new Float32Array(this.size);
    this.n = 0;
    this.start = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        if (this.n === 0) this.start = currentFrame + i;
        this.buf[this.n++] = ch[i];
        if (this.n === this.size) {
          this.port.postMessage({ samples: this.buf, frame: this.start }, [this.buf.buffer]);
          this.buf = new Float32Array(this.size);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('capture', Capture);
