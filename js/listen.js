// L'allievo chiama le manovre a voce: il riconoscimento vocale del browser (Safari, Chrome) ascolta dal microfono.
// Il riconoscimento lo fa il browser (Apple o Google): qui arrivano solo le parole capite.

/** Parole che il riconoscimento scrive per "virare" (anche "girare", "avvirare" attaccato alla a) e per "strambare"
 *  (parola rara: a volte "stambare", "strabare", "sdrambare", "astrambare", "strambata"). */
const TACK = /^a?(?:v+ir|gir|bir)/, GYBE = /^a?(?:s[td]?|t)r?[aou]m?b/;
const GO_TACK = ['viro', 'vira', 'virò'], GO_GYBE = ['strambo', 'stramba', 'strambò', 'strombo'];

/** Quante chiamate ci sono in una frase capita: "pronti a virare?" (tack), "pronti a strambare?" (gybe), "viro!" (goTack),
 *  "strambo!" (goGybe). Dopo "pronti" si accettano "a", "ad", "alla", "per". Il "vira" dentro "pronti a vira(re)", mentre
 *  la frase non e' ancora finita, non e' un "viro!". */
export function heardCalls(text) {
  const words = text.toLowerCase().replace(/[^a-zàèéìòù]+/g, ' ').trim().split(' ');
  const got = { tack: 0, gybe: 0, goTack: 0, goGybe: 0 };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.startsWith('pront')) {
      const j = ['a', 'ad', 'alla', 'per'].includes(words[i + 1]) ? i + 2 : i + 1, next = words[j] ?? '';
      if (TACK.test(next)) { got.tack++; i = j; continue; }
      if (GYBE.test(next)) { got.gybe++; i = j; continue; }
    }
    if (GO_TACK.includes(w)) got.goTack++;
    if (GO_GYBE.includes(w)) got.goGybe++;
  }
  return got;
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
