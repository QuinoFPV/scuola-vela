// Suoni con Web Audio: vento, acqua sullo scafo, vele che sbattono, winch e boma.
export class Audio {
  constructor() {
    this.ctx = null; this.lastClick = 0; this.flapPhase = 0;
    // la scelta resta per le volte dopo (in una finestra privata il browser puo' non ricordarla)
    try { this.muted = localStorage.getItem('scuolaVela.muto') === '1'; } catch { this.muted = false; }
  }

  /** Spegne o riaccende tutto: vento, acqua, vele, winch e boma. */
  setMuted(on) {
    this.muted = on;
    try { localStorage.setItem('scuolaVela.muto', on ? '1' : '0'); } catch { /* niente memoria: vale solo adesso */ }
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0 : 0.8, this.ctx.currentTime, 0.03);
  }

  /** Va avviato da un gesto dell'utente (regola dei browser). */
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);
    const chain = (type, freq, q) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(0, Math.random() * 2);
      return { f, g };
    };
    this.wind = chain('lowpass', 400, 0.7);
    this.water = chain('bandpass', 1400, 0.8);
    this.flap = chain('bandpass', 700, 1.2);
  }

  set({ aws, speed, luff, winching }, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, m = this.muted ? 0 : 1;
    const w = Math.min(1, Math.pow(aws / 22, 1.4)) * m;
    this.wind.g.gain.setTargetAtTime(w * 0.5, t, 0.3);
    this.wind.f.frequency.setTargetAtTime(250 + w * 700, t, 0.5);
    const s = Math.min(1, Math.abs(speed) / 7) * m;
    this.water.g.gain.setTargetAtTime(s * 0.35, t, 0.3);
    this.water.f.frequency.setTargetAtTime(900 + s * 1800, t, 0.4);
    // vela che sbatte: 6-9 colpi al secondo
    this.flapPhase += dt * (6 + luff * 3);
    const env = Math.pow(Math.max(0, Math.sin(this.flapPhase * 2 * Math.PI)), 6);
    this.flap.g.gain.setTargetAtTime(luff * Math.min(1, aws / 12) * env * 0.9 * m, t, 0.01);
    // winch: scatti della cricchetta mentre si cazza
    if (winching && !this.muted && t - this.lastClick > 1 / 14) { this.lastClick = t; this.burst(0.06, 4000, 0.03); }
  }

  burst(gain, freq, dur) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); src.stop(ctx.currentTime + dur + 0.05);
  }

  /** Colpo sordo del boma (strambata) o fruscio della virata. */
  boom(violent) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const g = ctx.createGain(); g.gain.setValueAtTime(violent ? 0.8 : 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (violent ? 0.9 : 0.5));
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1);
    this.burst(violent ? 0.4 : 0.15, 300, 0.4);
  }
}
