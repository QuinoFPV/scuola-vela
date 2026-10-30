// L'allievo chiama le manovre a voce: il riconoscimento vocale del browser (Safari, Chrome) ascolta dal microfono.
// Il riconoscimento lo fa il browser (Apple o Google): qui arrivano solo le parole capite.

/** Quante chiamate ci sono in una frase capita: "pronti a virare?" (tack), "pronti a strambare?" (gybe), "viro!" (goTack),
 *  "strambo!" (goGybe). Il riconoscimento a volte capisce "girare" o "pronta", e scrive "virò": si accetta anche quello.
 *  Il "vira" dentro "pronti a vira(re)", mentre la frase non e' ancora finita, non e' un "viro!". */
export function heardCalls(text) {
  const t = ` ${text.toLowerCase().replace(/[^a-zàèéìòù]+/g, ' ')} `;
  const count = (re) => (t.match(re) || []).length;
  const words = t.replace(/ pront\S* ad? \S+/g, ' ').trim().split(' ');
  const said = (...w) => words.filter((x) => w.includes(x)).length;
  return {
    tack: count(/ pront\S* ad? (?:vir|gir)\S*/g),
    gybe: count(/ pront\S* ad? str?[ao]mb\S*/g),
    goTack: said('viro', 'vira', 'virò'),
    goGybe: said('strambo', 'stramba', 'strambò'),
  };
}

export class Ear {
  /** onCommand(nome) a ogni chiamata capita; onHeard(testo) con quello che si e' sentito; onState() quando cambia. */
  constructor(onCommand, onHeard, onState) {
    this.SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    this.supported = !!this.SR;
    this.onCommand = onCommand; this.onHeard = onHeard; this.onState = onState;
    try { this.wanted = localStorage.getItem('scuolaVela.ascolto') === '1'; } catch { this.wanted = false; }
    this.rec = null; this.listening = false; this.denied = false; this.fired = []; this.retry = 300; this.started = 0;
  }

  /** Acceso o spento dal pulsante col microfono; la scelta resta per le volte dopo. */
  toggle() {
    this.wanted = !this.wanted;
    try { localStorage.setItem('scuolaVela.ascolto', this.wanted ? '1' : '0'); } catch { /* vale solo adesso */ }
    if (this.wanted) { this.denied = false; this.retry = 300; this.start(); } else this.stop();
    this.onState();
  }

  /** Safari vuole un tocco per accendere il microfono: si chiama dal pulsante o dal tocco di "uscire in mare". */
  start() {
    if (!this.supported || !this.wanted || this.rec) return;
    const r = this.rec = new this.SR();
    r.lang = 'it-IT'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onstart = () => { this.listening = true; this.onState(); };
    r.onresult = (e) => this.result(e);
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.denied = true; this.wanted = false; this.onState(); }
    };
    // il browser smette di ascoltare dopo un silenzio o una frase: si riparte, piu' piano se si ferma subito
    r.onend = () => {
      if (this.rec !== r) return;
      this.rec = null; this.listening = false; this.fired = [];
      this.retry = performance.now() - this.started < 1500 ? Math.min(5000, this.retry * 2) : 300;
      if (this.wanted && !document.hidden) setTimeout(() => this.start(), this.retry);
      this.onState();
    };
    this.started = performance.now();
    try { r.start(); } catch { this.rec = null; }
  }

  stop() {
    const r = this.rec;
    this.rec = null; this.listening = false; this.fired = [];
    try { r?.abort(); } catch { /* gia' fermo */ }
  }

  /** Le frasi arrivano a pezzi mentre si parla e il testo si corregge: per ogni frase si conta quante chiamate ci sono e si
   *  fa partire solo quella in piu', cosi' "pronti a virare" detto una volta vale una volta sola. */
  result(e) {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript, got = heardCalls(text);
      const f = this.fired[i] ?? (this.fired[i] = { tack: 0, gybe: 0, goTack: 0, goGybe: 0 });
      for (const k of Object.keys(f)) if (got[k] > f[k]) { f[k] = got[k]; this.onCommand(k); }
      if (text.trim()) this.onHeard(text.trim());
    }
  }
}
