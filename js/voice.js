// Voci a bordo con la sintesi vocale del telefono o del computer: niente registrazioni, la voce italiana del sistema.
// Il timoniere (l'allievo) chiama le manovre, l'equipaggio risponde, l'istruttore dal gommone dice consigli e avvisi.
import { Coach } from './sim.js';

/** Chi parla: quale delle voci italiane del sistema (se ce n'e' piu' d'una), tono e velocita'. Con una voce sola i ruoli
 *  si distinguono dal tono. */
const ROLES = {
  istruttore: { slot: 0, pitch: 1, rate: 1.05 },
  prodiere: { slot: 1, pitch: 1.2, rate: 1.15 },
  randista: { slot: 2, pitch: 0.85, rate: 1.1 },
  timoniere: { slot: 3, pitch: 1, rate: 1.1 },
};
/** La modalita' vocale, ricordata per le volte dopo: tutta accesa, senza l'istruttore a voce, o spenta del tutto
 *  (niente voci, microfono ne' chiamate delle manovre). */
export const VOICE_MODES = ['SÌ', "SÌ, MA SENZA L'ISTRUTTORE A VOCE", 'NO'];

/** I messaggi sono in maiuscolo, coi tasti tra parentesi e coi numeri scritti corti: per la voce minuscole, niente
 *  tasti, minuti e metri per esteso. */
export function speechText(t) {
  const caps = t === t.toUpperCase();
  let s = t.replace(/\s*\((?:[A-Z0-9]|SPAZIO|INVIO)\)/g, '')
    .replace(/[«»]/g, '').replace(/\s*·\s*/g, ', ')
    .replace(/\s*\(([^)]*)\)/g, ', $1')
    .replace(/(\d+):(\d\d)/g, (_, m, ss) => (+m ? `${m} ${+m === 1 ? 'minuto' : 'minuti'} e ` : '') + `${+ss} secondi`)
    .replace(/(\d)ª/g, (x, n) => ['', 'prima', 'seconda', 'terza'][n] || x)
    .replace(/(\d)-(\d)/g, '$1 o $2')
    .replace(/(\d)\s*°/g, '$1 gradi')
    .replace(/(\d) m\b/g, '$1 metri');
  if (caps) {
    // "PENALITA'" scritto con l'apostrofo diventa "penalità"
    s = s.toLowerCase().replace(/([aeiou])'(?![a-zà-ù])/g, (_, v) => ({ a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' })[v]);
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class Voice {
  constructor() {
    this.synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    try { this.mode = (+localStorage.getItem('scuolaVela.voci') || 0) % VOICE_MODES.length; } catch { this.mode = 0; }
    this.lastOn = this.mode === 2 ? 0 : this.mode;
    this.pool = []; this.queue = []; this.current = null; this.unlocked = false; this.simTime = 0; this.said = [];
    this.tipKey = ''; this.tipSince = 0; this.saidKey = ''; this.tipCheck = 0; this.lastCoach = -100; this.tipTimes = new Map();
    if (this.synth) {
      this.pickVoices();
      this.synth.addEventListener?.('voiceschanged', () => this.pickVoices());     // Chrome le elenca dopo un po'
    }
  }

  setMode(m) {
    if (m !== 2) this.lastOn = m;
    this.mode = m;
    try { localStorage.setItem('scuolaVela.voci', String(m)); } catch { /* niente memoria: vale solo adesso */ }
    if (m === 2) this.stop();
  }
  get on() { return this.mode !== 2; }
  /** Accesa o spenta in un colpo solo (icona col fumetto, tasto 7): riaccesa torna com'era. */
  toggle() { this.setMode(this.on ? 2 : this.lastOn); }

  /** Le voci italiane, prima le migliori e quelle del dispositivo (rispondono subito); senza quelle robotiche del Mac
   *  (Eddy, Reed, Grandma...) se ce n'e' almeno una normale. */
  pickVoices() {
    const odd = /eddy|flo\b|grandma|grandpa|nonn|reed|rocko|sandy|shelley/i;
    const score = (v) => (/premium|enhanced|avanzat|neural|natural/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
    const it = this.synth.getVoices().filter((v) => /^it([-_]|$)/i.test(v.lang));
    const fine = it.filter((v) => !odd.test(v.name));
    this.pool = (fine.length ? fine : it).sort((a, b) => score(b) - score(a));
  }

  /** Safari fa partire la voce solo dopo un tocco o un tasto: una frase muta all'uscita in mare la sblocca. */
  unlock() {
    if (!this.synth || this.unlocked) return;
    this.unlocked = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    this.synth.speak(u);
  }

  stop() {
    this.queue.length = 0;
    if (this.current) { this.current.rec.end = performance.now() / 1000; this.current = null; this.synth.cancel(); }
  }

  /** Le frasi dette negli ultimi secondi, con quando sono cominciate e finite: il microfono le riconosce come eco. */
  recent() {
    const now = performance.now() / 1000;
    this.said = this.said.filter((r) => now - r.start < 10);
    return this.said.map((r) => ({ text: r.text, start: r.start, end: Math.min(r.end, r.until) }));
  }

  /** A ogni fotogramma: raccoglie le frasi della simulazione e le dice una alla volta. active e' falso col menu, in
   *  pausa, in moviola e con la pagina nascosta; muted e' l'altoparlante spento. */
  update(sim, active, muted) {
    const lines = sim.lines.splice(0);
    if (!this.synth) return;
    const now = performance.now() / 1000;
    if (sim.time < this.simTime - 0.5) this.stop();                 // si ricomincia (N, D): basta frasi di prima
    this.simTime = sim.time;
    if (!active || muted || this.mode === 2) { this.stop(); return; }
    for (const l of lines) if (l.who !== 'istruttore' || this.mode === 0) this.queue.push({ who: l.who, text: l.text, at: now });
    if (this.mode === 0 && sim.settings.aids) this.coach(sim, now);
    this.next(now);
  }

  /** L'istruttore dice a voce il primo consiglio quando cambia e resta per un attimo; non lo ripete finche' resta
   *  quello ne' se torna entro 20 s, e tra una frase e l'altra lascia qualche secondo. Solo cio' che conta: errori,
   *  avvisi e le istruzioni degli esercizi (queste subito: "ora orza" non puo' aspettare), non "barca regolata bene".
   *  Mentre la barca gira tace (in virata la prua passa apposta dall'angolo morto), e cosi' dalla chiamata della
   *  manovra a qualche secondo dopo: vicino al gavitello una virata somiglia a un'orzata. */
  coach(sim, now) {
    if (now < this.tipCheck) return;
    const [text, tone] = Coach.tips(sim.boat, sim.lake, sim.mob, sim.gav)[0];
    const exercise = sim.mob || (sim.gav && !sim.gav.moored);
    this.tipCheck = now + (exercise ? 0.1 : 0.25);
    // "ora orza", "lascia andare le scotte": i comandi degli esercizi si dicono subito e passano davanti al resto
    const urgent = !!exercise && (tone === 'warn' || tone === 'bad');
    if (sim.call || sim.time - sim.lastTurn < 4 || (!urgent && Math.abs(sim.boat.r) > (exercise ? 6 : 3))) { this.tipSince = now; return; }
    const key = exercise || tone === 'bad' || tone === 'warn' ? text.replace(/\d+/g, '#') : '';   // "a 120 m" e "a 110 m": stesso consiglio
    if (key !== this.tipKey) {
      // consiglio cambiato: quello ancora in attesa e' gia' vecchio
      this.tipKey = key; this.tipSince = now; this.saidKey = ''; this.queue = this.queue.filter((l) => !l.tip);
      if (!urgent) return;
    }
    if (!key || key === this.saidKey || now - this.tipSince < (urgent ? 0 : exercise ? 0.3 : 1) || now - this.lastCoach < (urgent ? 0 : exercise ? 2.5 : 4)) return;
    if (now - (this.tipTimes.get(key) ?? -100) < 20) return;
    this.saidKey = key; this.tipTimes.set(key, now);
    this.queue = this.queue.filter((l) => !l.tip);                   // un consiglio alla volta
    this.queue.push({ who: 'istruttore', text, at: now, tip: true, urgent });
  }

  /** La prossima frase. Quelle vecchie non si dicono piu' (un "viro!" dopo la virata non serve). L'equipaggio ha la
   *  precedenza e interrompe l'istruttore, perche' le manovre non aspettano; un comando urgente degli esercizi
   *  interrompe qualunque altra frase dell'istruttore, anche il comando di prima. */
  next(now) {
    this.queue = this.queue.filter((l) => now - l.at < (l.who === 'istruttore' ? 4 : 3));
    if (!this.queue.length) return;
    let i = this.queue.findIndex((l) => l.who !== 'istruttore');
    if (i < 0) i = this.queue.findIndex((l) => l.urgent);
    const first = i >= 0 ? this.queue[i] : this.queue[0], cur = this.current;
    if (cur && now < cur.until) {
      const crew = first.who !== 'istruttore';
      if (cur.who !== 'istruttore' || !(crew || first.urgent)) return;
      cur.rec.end = now;
      this.current = null;
      this.synth.cancel();
    }
    this.queue.splice(i >= 0 ? i : 0, 1);
    // dopo il "preso!" dell'equipaggio un "troppo veloce" rimasto in attesa non ha piu' senso
    if (first.who !== 'istruttore') this.queue = this.queue.filter((l) => l.who !== 'istruttore' || l.at >= first.at);
    this.speak(first, now);
  }

  speak(l, now) {
    const role = ROLES[l.who] ?? ROLES.istruttore, text = speechText(l.text);
    const u = new SpeechSynthesisUtterance(text), v = this.pool.length ? this.pool[role.slot % this.pool.length] : null;
    if (v) u.voice = v;
    u.lang = v?.lang || 'it-IT'; u.pitch = role.pitch; u.rate = role.rate;
    // se il browser non avvisa della fine, la frase si considera finita dopo il tempo che serve a dirla
    const until = now + 1 + text.length * 0.075 / role.rate, rec = { text, start: now, end: Infinity, until };
    const cur = this.current = { who: l.who, urgent: !!l.urgent, until, u, rec };
    this.said.push(rec);
    u.onend = u.onerror = () => { rec.end = Math.min(rec.end, performance.now() / 1000); if (this.current === cur) this.current = null; };
    if (l.who === 'istruttore') this.lastCoach = now;
    this.synth.resume?.();                       // Chrome a volte resta in pausa dopo che la scheda e' stata nascosta
    this.synth.speak(u);
  }
}
