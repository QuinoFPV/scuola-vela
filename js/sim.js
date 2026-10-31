// Simulazione: barca, vento, onde, boe, moviola, messaggi e consigli dell'istruttore.
import {
  Wind, newBoat, copyBoat, step, idealSheets, Spec, norm180, norm360, rad, deg, clamp, dirVec, len, sub, add, mul,
  speedKn, twaOf, stormJib, byLee, bearing, KNOT,
} from './physics.js';

/** Le onde del lago (le stesse dello shader dell'acqua, per far galleggiare barca e boe). */
export class Waves {
  static lambda = [34, 21, 13, 8, 5];
  static ampK = [0.36, 0.26, 0.18, 0.12, 0.08];
  static offset = [0, 0.45, -0.5, 0.9, -1.1];
  static phase = [0, 1.7, 4.1, 2.3, 5.5];
  constructor() { this.amp = 0.3; this.dirRad = Math.PI; this.time = 0; }
  static amplitude(kn) { return 0.06 + Math.pow(kn / 20, 1.6) * 0.55; }
  /** Altezza e pendenza in un punto del mondo 3D (x = est, z = -nord). */
  sample(x, z) {
    let h = 0, gx = 0, gz = 0;
    for (let i = 0; i < 5; i++) {
      const a = this.dirRad + Waves.offset[i];
      const dx = Math.sin(a), dz = -Math.cos(a);
      const k = 2 * Math.PI / Waves.lambda[i], w = Math.sqrt(9.81 * k);
      const A = this.amp * Waves.ampK[i];
      const th = k * (dx * x + dz * z) - w * this.time + Waves.phase[i];
      h += A * Math.sin(th);
      const c = A * k * Math.cos(th);
      gx += c * dx; gz += c * dz;
    }
    return { h, gx, gz };
  }
}

export const WINDS = [['LEGGERO', 6], ['MODERATO', 10], ['TESO', 15], ['FRESCO', 20], ['FORTE', 25], ['MOLTO FORTE', 30]];
/** I venti del Sebino: l'Ora sale da sud il pomeriggio, il Sover scende da nord la mattina. */
export const DIRECTIONS = [['ORA', 'da sud, pomeriggio', 180], ['SOVER', 'da nord, mattina', 0]];
export const STEERING = ['BARRA SEMPLICE (freccia = verso)', 'BARRA REALE (spingi a sinistra, vai a dritta)', 'RUOTA'];
export const COURSE = [0, 2, 1];
export const MARK_NAMES = ['BOA DI BOLINA', 'BOA DI POPPA', 'BOA DI TRAVERSO'];
/** Da MARK_FAR metri si avvisa di lasciare la boa a sinistra; sotto MARK_NEAR la freccia antioraria ha preso il posto
 *  del freccione giallo che da lontano indica dov'e' la boa. */
export const MARK_NEAR = 50, MARK_FAR = 70;
/** Uomo a mare: secondi di volo del salvagente lanciato; frazione del vento a cui scarroccia; velocita' massima (nodi)
 *  e distanza dal bordo (m) a cui lo si afferra col mezzo marinaio; meta' larghezza dello scafo. */
export const MOB = { fly: 0.8, drift: 0.03, slow: 1.5, reach: 2.0, halfBeam: 1.25 };
/** Le distanze dell'uomo a mare per il vento che c'e'. Di bolina larga, con le vele in bando, la barca si ferma in 35 m
 *  con 6 nodi di vento, 26 con 10, 14 con 20 (le vele che sbattono frenano di piu' col vento forte): stop e' dove
 *  metterle in bando, con un po' di margine; start da dove partire di bolina larga verso il salvagente; away quanto
 *  allontanarsi al traverso prima di virare, perche' poi scendendo al gran lasco si arrivi a start. */
export function mobPlan(tws) {
  const stop = Math.round(36 * Math.pow(10 / Math.max(4, tws), 0.7) / 5) * 5;
  return { stop, start: stop + 20, away: Math.max(60, stop + 35) };
}
/** Gavitello della scuola: velocita' massima (nodi) a cui chi e' a prua lo prende col mezzo marinaio; fin dove arriva
 *  il mezzo marinaio oltre la prua (m); cima d'ormeggio dalla prua (m); quanto la catena lascia spostare il gavitello
 *  quando lo scafo lo scosta (m). */
export const GAV = { slow: 1.5, reach: 2.5, line: 3, swing: 1.5 };
/** Quanti metri scorre ancora la barca prua al vento prima di fermarsi. La frenata e' a + b v^2: a dalle vele che
 *  sbattono, che prua al vento sentono circa il vento reale (di piu' con le scotte libere), b dallo scafo. Numeri
 *  ricavati dalle planate prua al vento da bolina stretta con 6-20 nodi (con 10 nodi da 5,7 nodi la barca scorre 26 m
 *  con le vele regolate, 14 con le scotte libere). */
export function gavStop(s) {
  const v = Math.max(0, s.u), a = (s.bando ? 0.00238 : 0.00101) * Math.pow(s.tws, s.bando ? 1.76 : 1.69), b = s.bando ? 0.036 : 0.024;
  return Math.log(1 + b * v * v / Math.max(1e-4, a)) / (2 * b);
}
/** Le distanze del gavitello per il vento che c'e', misurate col pilota automatico delle prove: luff e' dove orzare prua
 *  al vento, col gavitello dritto sopravento (dal centro della barca); start da dove cominciare a risalire di bolina. */
const GAV_LUFF = [[6, 33], [10, 24], [15, 10], [20, 9], [30, 7]];
export function gavPlan(tws) {
  let i = 1;
  while (i < GAV_LUFF.length - 1 && GAV_LUFF[i][0] < tws) i++;
  const [a, b] = [GAV_LUFF[i - 1], GAV_LUFF[i]], k = clamp((tws - a[0]) / (b[0] - a[0]), 0, 1);
  const luff = Math.round(a[1] + (b[1] - a[1]) * k);
  return { luff, start: luff + 40 };
}
/** Le chiamate della manovra (after: per quanti secondi la randa resta al centro dopo una strambata chiamata).
 *  Dopo quanti secondi l'equipaggio risponde "pronti!"; per quanti secondi la chiamata vale
 *  se poi non si manovra; da quanti gradi al secondo la prua che gira vuol dire che la manovra e' cominciata ("viro!");
 *  sotto quanti nodi le vele che passano dall'altra parte da sole (prua al vento quasi fermi) non sono una manovra;
 *  fin dove chi sta alla randa la cazza prima di una strambata chiamata, con le vele automatiche (sopra 0,45 il boma
 *  passa di colpo). */
export const CALL = { answer: 1.2, wait: 20, turn: 5, slow: 1, haul: 0.15, after: 2.5 };

export class Simulation {
  constructor(lake) {
    this.lake = lake;
    this.settings = { windIndex: 1, windFrom: 0, gusts: true, steering: 0, aids: true, boat: 0, triangle: false, dirtyAir: false };
    this.waves = new Waves();
    this.autoTrim = false;
    this.paused = false;
    this.replay = null;
    this.replaySpeed = 0.5;
    this.message = ''; this.tone = 'info'; this.messageTime = -100;
    this.events = [];
    this.lines = [];
    this.forceCalls = false;                       // nelle lezioni le chiamate ci sono anche con la modalita' vocale spenta
    this.reset();
  }
  get windKn() { return WINDS[this.settings.windIndex][1]; }
  get windDir() { return norm360(this.lake.axis + DIRECTIONS[this.settings.windFrom][2]); }

  /** Ricomincia: barca davanti alla base, al traverso verso il largo. */
  reset() {
    const lake = this.lake;
    this.wind = new Wind(this.windKn, this.settings.gusts ? 0.55 : 0, (Math.random() * 1e9) | 0);
    this.wind.baseDir = this.windDir;
    this.placeMarks();
    const b = newBoat();
    b.pos = lake.startPoint();
    const h1 = norm360(this.wind.baseDir + 90), h2 = norm360(this.wind.baseDir - 90);
    b.heading = Math.abs(norm180(h1 - lake.shoreOut)) < Math.abs(norm180(h2 - lake.shoreOut)) ? h1 : h2;
    const lee = norm180(this.wind.baseDir - b.heading) < 0 ? 1 : -1;
    Object.assign(b, { u: 2.2, mainSide: lee, jibSide: lee, mainSheet: 0.55, jibSheet: 0.55,
                       mainAngle: 50 * lee, jibAngle: 40 * lee, crew: -lee });
    this.boat = b;
    this.history = []; this.historyTimer = 0;
    this.track = []; this.trackTimer = 0;
    this.courseStep = 0; this.lapStart = null; this.lastLap = null; this.buoyTouch = -100;
    this.mob = null; this.lastMob = null;
    this.gav = null; this.lastGav = null; this.gavPos = { ...lake.base.gav };
    this.call = null; this.lastTurn = -100; this.lines.length = 0; this.sheetGoal = {}; this.haulUntil = -100;
    // quante manovre e quanti errori dall'uscita: li usano il voto delle lezioni e la pagella
    this.stats = { tacks: 0, gybes: 0, unannounced: 0, early: 0, wrongCall: 0, involuntary: 0, aground: 0, buoyHits: 0,
                   boatHits: 0, mobHits: 0, gavHits: 0, irons: 0 };
    this.sweep = 0; this.sweepAngle = null; this.wrongWay = false; this.approachSaid = false;
    this.replay = null;
    this.time = 0;
    this.aground = false;
    this.ironsTimer = 0;
    this.waves.amp = Waves.amplitude(this.windKn) * 0.55;
    this.waves.dirRad = rad(this.wind.baseDir + 180);
    this.say(`${DIRECTIONS[this.settings.windFrom][0]} ${this.windKn} NODI · SI ESCE DALLA BASE: TRAVERSO ${lee > 0 ? 'MURE A SINISTRA' : 'MURE A DRITTA'}`, 'info', true);
  }

  /** Boe allineate al vento: bolina a 300 m sopravento del centro, poppa a 250 m sottovento, una di traverso.
   *  Le boe si lasciano a sinistra: la boa di traverso sta a sinistra guardando il vento, cosi' il triangolo
   *  bolina -> traverso -> poppa si percorre in senso antiorario. */
  placeMarks() {
    const lake = this.lake, c = lake.center, w = dirVec(this.wind.baseDir);
    const side = add(c, mul(dirVec(this.wind.baseDir - 90), 220));
    this.marks = [add(c, mul(w, 300)), sub(c, mul(w, 250)), side].map((p) => {
      let q = p;
      while (lake.depth(q) < 15 && len(sub(q, c)) > 40) q = add(c, mul(sub(q, c), 0.9));
      return q;
    });
  }

  applyWind() {
    this.wind.baseSpeed = this.windKn;
    this.wind.gustiness = this.settings.gusts ? 0.55 : 0;
    this.waves.amp = Waves.amplitude(this.windKn) * 0.55;
  }

  /** Messaggio sullo schermo; con voice l'istruttore lo dice anche a voce (solo cio' che griderebbe dal gommone). */
  say(text, tone, voice = false) {
    this.message = text; this.tone = tone; this.messageTime = this.time;
    if (voice) this.talk('istruttore', text);
  }
  /** Una frase detta a bordo da timoniere, randista, prodiere (il terzo uomo: fiocco e prua) o istruttore. La legge
   *  voice.js a ogni fotogramma; qui ne restano solo le ultime, cosi' senza voci (prove, menu) non si accumulano. */
  talk(who, text) {
    this.lines.push({ who, text, time: this.time });
    if (this.lines.length > 10) this.lines.shift();
  }

  /** Riduce (+1) o aumenta (-1) la tela: 1 mano, 2 mani, 2 mani + tormentina. Durante la manovra
   *  la vela interessata sbatte (la randa per i terzaroli, il fiocco per la tormentina). */
  reef(d) {
    const b = this.boat;
    if (this.replay !== null) return;
    if (b.reefTimer > 0 || b.jibTimer > 0) { this.say('MANOVRA DELLA TELA IN CORSO: ASPETTA CHE FINISCA', 'info'); return; }
    const r = b.reef + d;
    if (r < 0 || r > 3) { this.say(d > 0 ? 'TELA GIÀ AL MINIMO: DUE MANI DI TERZAROLI E TORMENTINA' : 'LA TELA È GIÀ TUTTA A RIVA', 'info'); return; }
    const jibChange = (b.reef === 3) !== (r === 3);
    b.reef = r;
    if (jibChange) {
      b.jibTimer = Spec.stormTime;
      this.say(r === 3 ? 'SI AMMAINA IL FIOCCO E SI ISSA LA TORMENTINA' : 'SI TOGLIE LA TORMENTINA E SI RIMETTE IL FIOCCO', 'info');
    } else {
      b.reefTimer = Spec.reefTime;
      this.say(d > 0 ? `TERZAROLI: SI PRENDE LA ${r}ª MANO (LA RANDA SBATTE PER QUALCHE SECONDO)`
        : (r === 0 ? 'TERZAROLI SCIOLTI: RANDA PIENA' : 'SI SCIOGLIE UNA MANO: ORA 1 MANO DI TERZAROLI'), 'info');
    }
  }
  get nextMark() { return COURSE[this.courseStep]; }

  /** Lo stato da mostrare: quello vivo o quello della moviola. */
  get shown() {
    const h = this.history;
    if (this.replay === null || h.length === 0) return this.boat;
    const t = this.replay;
    if (t <= h[0].time) return h[0];
    if (t >= h[h.length - 1].time) return h[h.length - 1];
    let lo = 0, hi = h.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (h[m].time < t) lo = m; else hi = m; }
    const a = h[lo], b = h[hi], k = (t - a.time) / Math.max(0.001, b.time - a.time);
    const s = copyBoat(k < 0.5 ? a : b);
    s.pos = { x: a.pos.x + (b.pos.x - a.pos.x) * k, y: a.pos.y + (b.pos.y - a.pos.y) * k };
    s.heading = norm360(a.heading + norm180(b.heading - a.heading) * k);
    for (const f of ['heel', 'mainAngle', 'jibAngle', 'rudder', 'crew']) s[f] = a[f] + (b[f] - a[f]) * k;
    s.time = t;
    return s;
  }
  get historySpan() { return this.history.length ? [this.history[0].time, this.history[this.history.length - 1].time] : [0, 0]; }

  /** Comando a voce sulle scotte ("cazza la randa", "lasca un po' il fiocco"): d e' di quanto, in frazione della corsa
   *  (negativo = cazzare); sail main, jib o both. La scotta va dove detto alla velocita' delle mani. Chi da' ordini
   *  sulle scotte le vuole regolare lui: con le vele automatiche (o in bando) si passa alle vele manuali. */
  trimBy(sail, d) {
    if (this.replay !== null) return;
    const b = this.boat, pre = this.autoTrim || b.bando ? 'VELE MANUALI · ' : '';
    this.autoTrim = false; b.bando = false;
    for (const k of sail === 'both' ? ['main', 'jib'] : [sail]) this.sheetGoal[k] = clamp(b[k + 'Sheet'] + d, 0, 1);
    const what = { main: 'RANDA', jib: 'FIOCCO', both: 'RANDA E FIOCCO' }[sail];
    const how = Math.abs(d) >= 1 ? ' TUTTO' : Math.abs(d) < 0.1 ? " UN PO'" : '';
    this.say(`${pre}${what}: SI ${d < 0 ? 'CAZZA' : 'LASCA'}${how}`, 'info');
  }

  /** Vele in bando: si liberano le scotte e le vele vanno fuori del tutto; di nuovo per riprenderle. */
  toggleBando() {
    const b = this.boat;
    b.bando = !b.bando;
    if (b.bando) this.say('VELE IN BANDO: SCOTTE LIBERATE DEL TUTTO, LA BARCA RALLENTA', 'warn');
    else this.say(this.autoTrim ? 'SI RIPRENDONO LE SCOTTE: LE VELE SI REGOLANO DA SOLE' : 'SCOTTE IN MANO: ORA CAZZA RANDA E FIOCCO', 'info');
  }

  /** Randa scontrata: chi e' a prua spinge fuori il boma dal lato scelto (+1 dritta, -1 sinistra, 0 dove si trova),
   *  il vento la prende al contrario e la barca va indietro; di nuovo per mollarlo. */
  toggleBackMain(side = 0) {
    const b = this.boat;
    if (b.backMain && (side === 0 || side === b.backMain)) {
      // il boma torna libero sottovento: non e' una virata
      b.backMain = 0;
      b.mainSide = b.awa >= 0 ? -1 : 1;
      this.say('BOMA MOLLATO: REGOLA LA RANDA E RIPARTI', 'info');
      return;
    }
    const want = side || b.mainSide || 1;
    b.backMain = want; b.mainSide = want;
    b.backAng = Math.max(10, Math.abs(b.mainAngle));          // il boma parte da dove si trova
    const rule = ['LA FRECCIA INDICA DOVE VA LA POPPA', 'LA POPPA VA DALLA PARTE OPPOSTA ALLA BARRA',
                  'GIRA LA RUOTA DALLA PARTE DOVE VUOI CHE VADA LA POPPA'][this.settings.steering];
    this.say(`RANDA SCONTRATA ${want > 0 ? 'A DRITTA' : 'A SINISTRA'}: SI VA INDIETRO · IN RETROMARCIA ${rule}`, 'info');
  }

  /** Fiocco in cappa: cazzato sopravento sul lato dove si trova il vento; randa e timone li regola l'allievo.
   *  Di nuovo per liberarlo e ripartire. */
  toggleCappa() {
    const b = this.boat;
    if (b.cappa) {
      b.cappa = 0; b.jibSide = b.awa >= 0 ? -1 : 1;
      this.say('FIOCCO LIBERATO DALLA CAPPA: CAZZA LA RANDA E RIPARTI', 'info');
      return;
    }
    if (b.spiUp > 0) { this.say('PRIMA AMMAINA LO SPI (E)', 'warn', true); return; }
    if (Math.abs(twaOf(b)) > 130) { this.say('LA CAPPA SI FA DI BOLINA O AL TRAVERSO: PRIMA ORZA', 'warn', true); return; }
    b.cappa = b.awa >= 0 ? 1 : -1; b.farfalla = false;
    this.say(this.autoTrim ? "FIOCCO IN CAPPA. ORA VELE MANUALI (T), LASCA LA RANDA E TIMONE ALL'ORZA" : "FIOCCO IN CAPPA. ORA LASCA LA RANDA E METTI IL TIMONE ALL'ORZA", 'info');
  }

  /** Spinnaker: si issa dal traverso in giu' (il fiocco si avvolge, il tangone va sopravento) o si ammaina. */
  toggleSpi() {
    const b = this.boat;
    if (b.spi) { b.spi = 0; this.say('SI AMMAINA LO SPI E SI SROTOLA IL FIOCCO', 'info'); return; }
    if (Math.abs(twaOf(b)) < 80) { this.say('LO SPI SI ISSA DAL TRAVERSO IN GIÙ: PRIMA POGGIA', 'warn', true); return; }
    b.spi = 1; b.spiSide = b.awa >= 0 ? 1 : -1; b.farfalla = false;
    this.say('SI ISSA LO SPI: TANGONE SOPRAVENTO, IL FIOCCO SI AVVOLGE', 'good');
  }

  /** Andatura a farfalla: in poppa il fiocco va dalla parte opposta alla randa, sul tangone; di nuovo per riportarlo. */
  toggleFarfalla() {
    const b = this.boat;
    if (b.spi) { this.say('CON LO SPI ISSATO LA FARFALLA NON SERVE', 'info'); return; }
    if (b.farfalla) {
      b.farfalla = false; b.jibSide = b.mainSide;
      this.say('FIOCCO RIPORTATO DALLA PARTE DELLA RANDA', 'info');
      return;
    }
    if (Math.abs(twaOf(b)) < 150) { this.say('LA FARFALLA SI FA IN POPPA: POGGIA FINO A 165-180° DAL VENTO', 'warn', true); return; }
    b.farfalla = true; b.jibSide = -b.mainSide;
    this.say("ANDATURA A FARFALLA: RANDA DA UNA PARTE, FIOCCO DALL'ALTRA SUL TANGONE", 'good');
  }

  /** Uomo a mare: l'istruttore butta in acqua il salvagente anulare (con l'asta e la bandierina) dalla poppa e
   *  l'allievo deve tornare a prenderlo. Di nuovo per annullare l'esercizio. */
  manOverboard(spoken = false) {
    if (this.replay !== null) return;
    if (this.mob) { this.mob = null; this.say('ESERCIZIO ANNULLATO, IL GOMMONE RIPRENDE IL SALVAGENTE', 'info'); return; }
    this.gav = null;                                       // un esercizio alla volta
    const b = this.boat, fwd = dirVec(b.heading), side = dirVec(b.heading + 90), k = Math.random() < 0.5 ? -1 : 1;
    const from = sub(b.pos, mul(fwd, 3.4));
    this.mob = { from, pos: add(from, add(mul(fwd, -3), mul(side, 2 * k))), t0: this.time, fly: MOB.fly, hit: -100, miss: -100, away: false, far: false };
    // a bordo lo grida chi lo vede cadere (se non l'ha gia' gridato l'allievo); l'istruttore ricorda la prima regola
    if (!spoken) this.talk('prodiere', 'Uomo a mare!');
    this.say('UOMO A MARE! NON PERDERE DI VISTA IL SALVAGENTE', 'bad');
    this.talk('istruttore', 'Non perdere di vista il salvagente');
  }
  /** Dove si vede il salvagente, anche in moviola; null se non e' in acqua. */
  get mobShown() { return this.replay !== null ? this.shown.mobPos ?? null : this.mob ? this.mob.pos : null; }

  /** Gavitello: l'esercizio di fine lezione. Si rientra alla base e si prende il gavitello della scuola a prua, arrivando
   *  prua al vento quasi fermi; preso, la barca resta ormeggiata. Di nuovo per annullare o, da ormeggiati, per mollarlo. */
  mooring() {
    if (this.replay !== null) return;
    if (this.gav) {
      const moored = this.gav.moored;
      this.gav = null;
      this.say(moored ? 'GAVITELLO MOLLATO: RIPRENDI LE SCOTTE (SPAZIO) E RIPARTI' : 'ESERCIZIO DEL GAVITELLO ANNULLATO', 'info');
      return;
    }
    this.mob = null;
    this.gav = { pos: this.gavPos, t0: this.time, hit: -100, miss: -100, aft: -100, moored: false };
    this.say('RIENTRO: PRENDI IL GAVITELLO DELLA SCUOLA ARRIVANDO PRUA AL VENTO', 'info', true);
  }
  /** Dove si vede il gavitello (anche in moviola) e se la barca e' ormeggiata. */
  get gavShown() { return this.replay !== null ? this.shown.gavPos ?? this.gavPos : this.gavPos; }
  get mooredShown() { return this.replay !== null ? !!this.shown.moored : !!this.gav?.moored; }

  /** "Pronti a virare?" o "pronti a strambare?": dal pulsante, dal tasto o detto al microfono (senza dire quale: di bolina
   *  e al traverso si vira, dal lasco in giu' si stramba). Il timoniere avvisa, l'equipaggio risponde "pronti!" e poi si manovra. Chi vira o
   *  stramba senza avvisare se lo sente dire. spoken: l'ha detto l'allievo al microfono, la voce del timoniere tace. */
  announce(kind = null, spoken = false) {
    if (this.replay !== null || !this.talking) return;
    if (this.gav?.moored) { this.say('ORMEGGIATI: PRIMA SI MOLLA IL GAVITELLO (0)', 'warn'); return; }
    kind ??= Math.abs(twaOf(this.boat)) < 90 ? 'tack' : 'gybe';
    if (this.call?.kind === kind) return;                // gia' chiamata: si aspetta la risposta o la manovra
    this.call = { kind, t: this.time, ready: false, go: false, spoken };
    if (!spoken) this.talk('timoniere', kind === 'tack' ? 'Pronti a virare?' : 'Pronti a strambare?');
    this.say(kind === 'tack' ? '«PRONTI A VIRARE?»' : '«PRONTI A STRAMBARE?»', 'info');
  }
  /** "Viro!" o "strambo!" detto dall'allievo al microfono, dopo il "pronti!" dell'equipaggio. */
  helmGo(kind) {
    const c = this.call;
    if (this.replay !== null || c?.kind !== kind || c.go) return;
    if (!c.ready) { this.say("ASPETTA IL «PRONTI!» DELL'EQUIPAGGIO", 'warn'); return; }
    c.go = true;
    this.say(kind === 'tack' ? '«VIRO!»' : '«STRAMBO!»', 'info');
  }

  /** La chiamata della manovra: la risposta dell'equipaggio (in virata chi sta al fiocco, in strambata chi sta alla
   *  randa), il "viro!" quando la prua comincia a girare e, alla virata o strambata, se era stata chiamata bene. */
  /** Modalita' vocale accesa (sim.settings.voices diverso da 2), o una lezione: solo allora ci sono le chiamate delle manovre. */
  get talking() { return this.settings.voices !== 2 || this.forceCalls; }

  checkCall() {
    if (!this.talking) { this.call = null; return; }
    const b = this.boat, c = this.call, tack = c?.kind === 'tack';
    // in strambata, con le vele automatiche, chi sta alla randa risponde quando l'ha cazzata al centro
    const hauled = tack || !this.autoTrim || b.mainSheet <= CALL.haul + 0.15 || Math.abs(twaOf(b)) <= 120;
    if (c && !c.ready && this.time - c.t >= CALL.answer && hauled) {
      c.ready = true;
      this.talk(tack ? 'prodiere' : 'randista', 'Pronti!');
      this.say(tack ? '«PRONTI!» · ORA VIRA' : this.autoTrim ? '«PRONTI!» · RANDA AL CENTRO: ORA STRAMBA'
        : '«PRONTI!» · CAZZA LA RANDA AL CENTRO (Q), POI STRAMBA', 'good');
    }
    if (c?.ready && !c.go) {
      const twa = twaOf(b), into = b.r * Math.sign(twa);  // > 0: la prua va verso il vento
      if (tack ? into > CALL.turn || Math.abs(twa) < 20 : into < -CALL.turn || Math.abs(twa) > 170) {
        c.go = true;
        if (!c.spoken) this.talk('timoniere', tack ? 'Viro!' : 'Strambo!');
        this.say(tack ? '«VIRO!»' : '«STRAMBO!»', 'info');
      }
    }
    for (const e of this.events) {
      if (e.type !== 'tack' && e.type !== 'gybe') continue;
      const call = this.call, crew = e.type === 'tack' ? 'prodiere' : 'randista';
      if (call?.kind === e.type) this.call = null;
      // quasi fermi, in bando, arrivando sul gavitello o in cappa le vele passano dall'altra parte da sole: non e' una
      // manovra (lastTurn: l'ultima vera, per far tacere l'istruttore qualche secondo)
      if (Math.abs(speedKn(b)) < CALL.slow || b.bando || (this.gav && len(sub(this.gavPos, b.pos)) < 30)
        || this.events.some((x) => x.type === 'cappaEnd')) continue;
      this.call = null; this.lastTurn = this.time;
      this.stats[e.type === 'tack' ? 'tacks' : 'gybes']++;
      if (call?.kind === e.type && call.ready) {
        if (!call.go && !call.spoken) this.talk('timoniere', e.type === 'tack' ? 'Viro!' : 'Strambo!');
        if (e.type === 'gybe') this.haulUntil = this.time + CALL.after;
      } else if (call?.kind === e.type) {
        this.stats.early++;
        this.talk(crew, 'Aspetta, non eravamo pronti!');
        this.say("PRIMA DI MANOVRARE SI ASPETTA IL «PRONTI!» DELL'EQUIPAGGIO", 'warn');
      } else if (call) {
        // chiamata una manovra, fatta l'altra
        this.stats.wrongCall++;
        this.talk(crew, e.type === 'tack' ? 'Ma non si strambava?' : 'Ma non si virava?');
        if (e.type === 'gybe' && e.violent) this.talk('randista', 'Attenti al boma!');
        if (this.settings.aids) this.say(e.type === 'tack' ? 'HAI CHIAMATO LA STRAMBATA MA HAI VIRATO' : 'HAI CHIAMATO LA VIRATA MA HAI STRAMBATO', 'warn');
      } else if (e.type === 'gybe' && e.violent) {
        this.talk('randista', 'Attenti al boma!');
      } else {
        this.stats.unannounced++;
        this.talk(crew, e.type === 'tack' ? 'Ehi, avvisa quando viri!' : 'Ehi, avvisa quando strambi!');
        if (this.settings.aids) this.say(e.type === 'tack' ? 'VIRATA SENZA AVVISARE: PRIMA SI CHIAMA «PRONTI A VIRARE?» (9)'
          : 'STRAMBATA SENZA AVVISARE: PRIMA SI CHIAMA «PRONTI A STRAMBARE?» (8)', 'warn');
      }
    }
    if (this.call && this.time - this.call.t > CALL.wait) this.call = null;   // nessuna manovra: la chiamata scade
  }

  startReplay() {
    if (this.history.length < 30) return;
    this.replay = Math.max(this.historySpan[0], this.time - 20);
    this.say('MOVIOLA: GLI ULTIMI 20 SECONDI AL RALENTI', 'info');
  }
  stopReplay() { this.replay = null; this.say('DI NUOVO IN DIRETTA', 'info'); }

  /** Avanza di dt secondi reali con i comandi c. */
  update(dt, c) {
    this.events = [];
    if (this.replay !== null) {
      if (!this.paused) this.replay = Math.min(this.replay + dt * this.replaySpeed, this.historySpan[1]);
      this.waves.time = this.shown.time;
      return;
    }
    if (this.paused) return;
    const steps = Math.max(1, Math.round(dt * 120)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.applyControls(c, h);
      this.wind.update(h, this.boat.pos);
      this.events.push(...step(this.boat, this.wind, h));
      if (this.gav?.moored) this.holdMooring(h);
      this.time += h;
    }
    this.waves.time = this.time;
    this.checkGround();
    for (const e of this.events) {
      if (e.type === 'cappaEnd') this.say('LA BARCA HA VIRATO: IL FIOCCO NON È PIÙ IN CAPPA', 'info');
      if (e.type === 'spiGybe') this.say("STRAMBATA CON LO SPI: SI PASSA IL TANGONE DALL'ALTRA PARTE", 'info');
      if (e.type === 'broach') this.say('STRAORZATA! TROPPO VENTO PER LO SPI: POGGIA, LASCA LA RANDA O AMMAINA (E)', 'bad', true);
      if (e.type === 'wingEnd') this.say("TROPPO ALL'ORZA PER LA FARFALLA: IL FIOCCO SI CHIUDE E TORNA SOTTOVENTO", 'warn', true);
      if (e.type === 'gybe' && e.violent) this.stats.involuntary++;
      if (e.type === 'gybe') this.say(e.violent ? 'STRAMBATA INVOLONTARIA! IL BOMA HA ATTRAVERSATO DI COLPO' : 'STRAMBATA', e.violent ? 'bad' : 'good', e.violent);
      if (e.type === 'tack') this.say(twaOf(this.boat) > 0 ? 'VIRATA: ORA MURE A DRITTA' : 'VIRATA: ORA MURE A SINISTRA', 'good');
    }
    this.checkCall();
    this.checkCourse(dt);
    this.checkMob(dt);
    this.checkGav(dt);
    this.historyTimer -= dt;
    if (this.historyTimer <= 0) {
      const snap = copyBoat(this.boat);
      snap.mobPos = this.mob ? { ...this.mob.pos } : null;
      snap.gavPos = { ...this.gavPos }; snap.moored = !!this.gav?.moored;
      this.history.push(snap);
      this.historyTimer = 1 / 30;
      while (this.history.length && this.time - this.history[0].time > 40) this.history.shift();
    }
    if (Math.abs(twaOf(this.boat)) < 30 && Math.abs(speedKn(this.boat)) < 0.4 && !this.gav?.moored) {
      this.ironsTimer += dt;
      if (this.ironsTimer > 4 && this.time - this.messageTime > 6) {
        // sullo schermo torna ogni 6 s, a voce l'istruttore lo dice una volta
        this.say('FERMI PRUA AL VENTO: SCONTRA LA RANDA (K) O METTI LA BARRA DA UN LATO E ASPETTA CHE LA PRUA CADA', 'warn', !this.ironsSaid);
        if (!this.ironsSaid) this.stats.irons++;
        this.ironsSaid = true;
      }
    } else { this.ironsTimer = 0; this.ironsSaid = false; }
  }

  /** Giro delle boe, urti contro le boe e scia sulla mappa. */
  checkCourse(dt) {
    const b = this.boat;
    this.trackTimer -= dt;
    if (this.trackTimer <= 0) {
      this.track.push({ ...b.pos });
      if (this.track.length > 180) this.track.shift();
      this.trackTimer = 2;
    }
    for (const m of this.marks) {
      if (len(sub(b.pos, m)) < 2.6 && this.time - this.buoyTouch > 5) {
        this.buoyTouch = this.time;
        b.u *= 0.4;
        b.r += b.r > 0 ? -6 : 6;
        this.say("HAI TOCCATO LA BOA! IN REGATA SAREBBE UN GIRO DI PENALITA'", 'bad', true);
        this.stats.buoyHits++;
      }
    }
    for (const m of this.lake.base.moorings) {
      const c = this.lake.mooredCenter(m, this.wind.direction);
      if (len(sub(b.pos, c)) < m.len * 0.45 + 1.4 && this.time - this.buoyTouch > 5) {
        this.buoyTouch = this.time;
        b.u *= 0.25;
        b.r += b.r > 0 ? -8 : 8;
        this.say("HAI URTATO UNA BARCA ALL'ORMEGGIO! ATTENZIONE IN USCITA DALLA BASE", 'bad', true);
        this.stats.boatHits++;
        this.events.push({ type: 'ground' });
      }
    }
    if (this.mob || this.gav) return;                     // durante l'uomo a mare e il gavitello le boe aspettano
    // la boa si gira in senso antiorario, lasciandola a sinistra: si somma l'angolo percorso intorno a lei
    const rel = sub(b.pos, this.marks[this.nextMark]), dist = len(rel);
    if (dist < MARK_FAR && !this.approachSaid) {
      this.approachSaid = true;
      // dopo la boa di poppa si risale di bolina: lo spi va ammainato prima
      const douse = this.boat.spi && this.nextMark === 1 ? ' · AMMAINA LO SPI PRIMA (E)' : '';
      this.say(`${MARK_NAMES[this.nextMark]}: LASCIALA A SINISTRA, GIRA IN SENSO ANTIORARIO${douse}`, 'info', true);
    } else if (dist > 110) this.approachSaid = false;
    if (dist > 45) { this.sweep = 0; this.sweepAngle = null; this.wrongWay = false; return; }
    const a = deg(Math.atan2(rel.y, rel.x));
    if (this.sweepAngle !== null) this.sweep += norm180(a - this.sweepAngle);
    this.sweepAngle = a;
    if (this.sweep < -90 && !this.wrongWay) {
      this.wrongWay = true;
      this.say('BOA GIRATA AL CONTRARIO! VA LASCIATA A SINISTRA: TORNA INDIETRO E GIRALA IN SENSO ANTIORARIO', 'bad', true);
    }
    if (this.sweep < 90) return;
    this.sweep = 0; this.sweepAngle = null; this.wrongWay = false; this.approachSaid = false;
    if (this.courseStep === 0) {
      if (this.lapStart !== null) {
        this.lastLap = this.time - this.lapStart;
        const t = this.lastLap | 0;
        this.say(`GIRO COMPLETO IN ${(t / 60) | 0}:${String(t % 60).padStart(2, '0')} · SI RIPARTE DALLA BOLINA`, 'good', true);
      } else {
        this.say('BOA DI BOLINA PRESA: PARTE IL CRONOMETRO · ORA LA BOA DI TRAVERSO', 'good', true);
      }
      this.lapStart = this.time;
    } else {
      this.say(`${MARK_NAMES[this.nextMark]} PRESA · ORA ${MARK_NAMES[COURSE[(this.courseStep + 1) % 3]]}`, 'good', true);
    }
    this.courseStep = (this.courseStep + 1) % 3;
  }

  /** Il salvagente scarroccia col vento; lo scafo lo scosta; lo si afferra dal bordo, tra la poppa e le sartie,
   *  solo con la barca quasi ferma. */
  checkMob(dt) {
    const mob = this.mob;
    if (!mob) return;
    if (mob.fly > 0) { mob.fly = Math.max(0, mob.fly - dt); return; }
    const w = this.wind.at(mob.pos);
    mob.pos = add(mob.pos, mul(dirVec(w.dir + 180), w.speed * KNOT * MOB.drift * dt));
    const b = this.boat, rel = sub(mob.pos, b.pos), fwd = dirVec(b.heading), stb = dirVec(b.heading + 90);
    const along = rel.x * fwd.x + rel.y * fwd.y, across = rel.x * stb.x + rel.y * stb.y;
    const kn = Math.hypot(b.u, b.v) / KNOT;
    if (len(rel) > 25) mob.away = true;                  // la barca si e' allontanata: ora si torna indietro
    if (len(rel) > mobPlan(w.speed).away - 5) mob.far = true;   // abbastanza da virare e tornare
    // la prua e' stretta, da meta' barca in giu' lo scafo e' largo quasi uguale fino allo specchio di poppa
    const half = along > 0.5 ? MOB.halfBeam * clamp((3.75 - along) / 3.25, 0, 1) : MOB.halfBeam;
    if (Math.abs(along) < 3.75 && Math.abs(across) < half + 0.35) {
      mob.pos = add(mob.pos, mul(stb, (across >= 0 ? 1 : -1) * (half + 0.35) - across));
      if (kn > 2 && this.time - mob.hit > 5) {
        mob.hit = this.time;
        this.say('SALVAGENTE INVESTITO! CON UNA PERSONA SAREBBE GRAVISSIMO', 'bad', true);
        this.stats.mobHits++;
      }
      if (kn > MOB.slow) return;
    }
    if (along < -3.4 || along > 2.6 || Math.abs(across) > half + MOB.reach) return;
    if (kn > MOB.slow) {
      if (this.time - mob.miss > 6 && this.time - mob.hit > 3) {
        mob.miss = this.time;
        this.say('TROPPO VELOCE PER AFFERRARLO: RIPROVA ARRIVANDO PIANO', 'warn', true);
      }
      return;
    }
    // sottovento o sopravento vanno bene tutti e due (twa > 0 = vento da dritta, sottovento e' a sinistra)
    const t = (this.time - mob.t0) | 0, lee = across * twaOf(b) < 0;
    this.lastMob = this.time - mob.t0;
    this.mob = null;
    this.talk('prodiere', 'Preso!');
    this.say(`RECUPERATO IN ${(t / 60) | 0}:${String(t % 60).padStart(2, '0')} · ${lee ? 'SOTTOVENTO' : 'SOPRAVENTO'}`, 'good', true);
  }

  /** Il gavitello: lo scafo lo scosta (la catena lo lascia spostare un poco, poi lo riporta sul corpo morto); chi e' a
   *  prua lo prende col mezzo marinaio solo con la barca quasi ferma. */
  checkGav(dt) {
    const b = this.boat, A = this.lake.base.gav, g = this.gavPos;
    const back = sub(A, g), dl = len(back);
    if (dl > 0.01) { const k = Math.min(dl, 0.3 * dt) / dl; g.x += back.x * k; g.y += back.y * k; }
    const rel = sub(g, b.pos), fwd = dirVec(b.heading), stb = dirVec(b.heading + 90);
    const along = rel.x * fwd.x + rel.y * fwd.y, across = rel.x * stb.x + rel.y * stb.y;
    if (Math.abs(along) > 12 || Math.abs(across) > 8) return;
    const kn = Math.hypot(b.u, b.v) / KNOT, gav = this.gav;
    // come per il salvagente: la prua e' stretta, da meta' barca in giu' lo scafo e' largo quasi uguale
    const half = along > 0.5 ? MOB.halfBeam * clamp((3.75 - along) / 3.25, 0, 1) : MOB.halfBeam;
    if (Math.abs(along) < 3.75 && Math.abs(across) < half + 0.3) {
      const push = mul(stb, (across >= 0 ? 1 : -1) * (half + 0.3) - across), off = sub(add(g, push), A), o = len(off);
      const p = o > GAV.swing ? add(A, mul(off, GAV.swing / o)) : add(g, push);
      g.x = p.x; g.y = p.y;
      if (kn > 2 && this.time - (gav?.hit ?? this.buoyTouch) > 5) {
        if (gav) gav.hit = this.time; else this.buoyTouch = this.time;
        b.u *= 0.8;
        this.stats.gavHits++;
        this.say(gav ? 'GAVITELLO URTATO: SI ARRIVA PRUA AL VENTO, QUASI FERMI' : 'HAI URTATO IL GAVITELLO DELLA SCUOLA', 'bad', true);
      }
    }
    if (!gav || gav.moored) return;
    // il mezzo marinaio arriva un paio di metri oltre la prua, o di fianco sulla parte di prua
    const bow = len(sub(rel, mul(fwd, 3.6)));
    const atBow = bow < GAV.reach || (along > 1.5 && along < 3.75 && Math.abs(across) < half + 1.4);
    if (!atBow) {
      if (along > -3.75 && along <= 1.5 && Math.abs(across) < half + 1.5 && kn <= GAV.slow && this.time - gav.aft > 6) {
        gav.aft = this.time;
        this.say('IL GAVITELLO SI PRENDE A PRUA: COSÌ LA BARCA RESTA PRUA AL VENTO', 'warn', true);
      }
      return;
    }
    if (kn > GAV.slow) {
      if (this.time - gav.miss > 6 && this.time - gav.hit > 3) {
        gav.miss = this.time;
        this.say('TROPPO VELOCE: IL GAVITELLO SI PRENDE CON LA BARCA QUASI FERMA', 'warn', true);
      }
      return;
    }
    const t = (this.time - gav.t0) | 0;
    gav.moored = true;
    this.lastGav = this.time - gav.t0;
    if (!b.bando) b.bando = true;
    this.talk('prodiere', 'Preso!');
    this.say(`GAVITELLO PRESO IN ${(t / 60) | 0}:${String(t % 60).padStart(2, '0')} · ORMEGGIATI: SCOTTE LIBERE`, 'good', true);
  }

  /** Ormeggiati: la cima dalla prua al gavitello non lascia allontanare la barca e tira la prua verso di lui, cosi' col
   *  vento la barca si mette prua al vento. */
  holdMooring(dt) {
    const b = this.boat, g = this.gavPos, fwd = dirVec(b.heading), stb = dirVec(b.heading + 90);
    const rel = sub(add(b.pos, mul(fwd, 3.6)), g), d = len(rel);
    if (d <= GAV.line) return;
    const n = mul(rel, 1 / d);
    b.pos = sub(b.pos, mul(n, d - GAV.line));
    // dalla velocita' si toglie la parte che allontana dal gavitello
    const vx = fwd.x * b.u + stb.x * b.v, vy = fwd.y * b.u + stb.y * b.v, away = vx * n.x + vy * n.y;
    if (away > 0) {
      const wx = vx - n.x * away, wy = vy - n.y * away;
      b.u = wx * fwd.x + wy * fwd.y; b.v = wx * stb.x + wy * stb.y;
    }
    const turn = norm180(bearing(sub(g, b.pos)) - b.heading);
    b.r += (clamp(turn * 1.5, -25, 25) - b.r) * Math.min(1, dt * 2);
  }

  /** Chiglia (1,9 m) sul fondo o prua sulla riva: la barca si ferma. */
  checkGround() {
    const b = this.boat, lake = this.lake, fwd = dirVec(b.heading);
    const keel = lake.depth(b.pos), bow = lake.depth(add(b.pos, mul(fwd, 3.6))), stern = lake.depth(sub(b.pos, mul(fwd, 3.6)));
    const hit = keel < 1.9 || (b.u > 0 && bow < 0.6) || (b.u < 0 && stern < 0.6);
    if (hit) {
      if (!this.aground) { this.say('IN SECCA! LA CHIGLIA HA TOCCATO IL FONDO', 'bad', true); this.events.push({ type: 'ground' }); this.stats.aground++; }
      this.aground = true;
      if (keel < 1.9) b.u = bow > stern ? Math.max(b.u, 0) * 0.97 : Math.min(b.u, 0) * 0.97;
      else b.u = 0;
      b.v *= 0.9; b.r *= 0.9;
    } else this.aground = false;
  }

  applyControls(c, dt) {
    const b = this.boat;
    if (c.tillerTarget !== null && c.tillerTarget !== undefined) b.rudder += clamp(c.tillerTarget - b.rudder, -90 * dt, 90 * dt);
    else if (c.tiller) b.rudder += c.tiller * (c.tillerFine ? 10 : 40) * dt;
    b.rudder = clamp(b.rudder, -Spec.rudderMax, Spec.rudderMax);
    // strambata chiamata: la randa va al centro. Con le vele automatiche la cazza subito chi sta alla randa (e risponde
    // "pronti!" quando e' al centro); con le manuali la cazza l'allievo dopo il "pronti!"
    // e la tiene al centro ancora un paio di secondi dopo la strambata (CALL.after): se la barca gira ancora e ripassa il
    // vento, il boma non torna di colpo
    b.haul = ((this.call?.kind === 'gybe' && (this.call.ready || this.autoTrim)) || this.time < this.haulUntil) && Math.abs(twaOf(b)) > 120;
    if (b.bando) {
      // le scotte corrono fuori in un paio di secondi; chi ricomincia a cazzare le riprende in mano
      b.mainSheet = Math.min(1, b.mainSheet + 0.8 * dt);
      b.jibSheet = Math.min(1, b.jibSheet + 0.9 * dt);
      if ((c.main || 0) > 0 || (c.jib || 0) > 0) { this.autoTrim = false; this.toggleBando(); }
    } else if (this.autoTrim) {
      const id = idealSheets(b);
      // chi sta alla randa la cazza al centro, cosi' il boma passa piano
      b.mainSheet += clamp((b.haul ? Math.min(id.main, CALL.haul) : id.main) - b.mainSheet, -0.4 * dt, 0.4 * dt);
      b.jibSheet += clamp(id.jib - b.jibSheet, -0.4 * dt, 0.4 * dt);
    } else {
      // un comando a voce porta la scotta dove detto alla velocita' delle mani; tasti e pulsanti la riprendono subito
      for (const [k, rate, held] of [['main', 0.22, c.main || 0], ['jib', 0.25, c.jib || 0]]) {
        const f = k + 'Sheet', goal = this.sheetGoal[k];
        if (held || goal === undefined) { delete this.sheetGoal[k]; b[f] = clamp(b[f] - held * rate * dt, 0, 1); continue; }
        b[f] += clamp(goal - b[f], -rate * dt, rate * dt);
        if (b[f] === goal) delete this.sheetGoal[k];
      }
    }
  }
}

/** L'istruttore: nomi delle andature e consigli su timone e vele. */
export const Coach = {
  pointOfSail(twa) {
    const a = Math.abs(twa);
    if (a < 34) return 'ANGOLO MORTO';            // la Protagonist risale a 38-40 gradi dal vento reale
    if (a < 55) return 'BOLINA STRETTA';
    if (a < 75) return 'BOLINA LARGA';
    if (a < 105) return 'TRAVERSO';
    if (a < 135) return 'LASCO';
    if (a < 165) return 'GRAN LASCO';
    return 'POPPA';
  },
  tack(twa) { return Math.abs(twa) > 177 ? '' : (twa > 0 ? 'MURE A DRITTA' : 'MURE A SINISTRA'); },
  telltales(s, gav = null) {
    if (gav?.moored) return ['Ormeggiati: le vele sbattono, le scotte sono libere', 'info'];
    if (gav && Math.abs(twaOf(s)) < 35 && len(sub(gav.pos, s.pos)) < 60) return ['Prua al vento verso il gavitello: le vele sbattono apposta', 'info'];
    if (s.cappa) return ['Fiocco in cappa: preso dal vento dalla parte di fuori', 'info'];
    if (s.jibFurl > 0.5) return ['Fiocco avvolto: con lo spi i filetti non servono', 'info'];
    if (s.bando) return ['Vele in bando: i filetti non lavorano', 'info'];
    if (s.jibTimer > 0) return ['Cambio del fiocco in corso', 'info'];
    if (Math.abs(s.awa) > 120) return ['In poppa i filetti non lavorano: guarda il fiocco', 'info'];
    if (s.jibLuff > 0.5) return ['Il fiocco sbatte: cazza la scotta o poggia', 'bad'];
    if (s.jibAlpha < 6) return ["Filetto sopravento che si alza: poggia un po' o cazza", 'warn'];
    if (s.jibAlpha > 22) return ["Filetto sottovento che cade: orza un po' o lasca", 'warn'];
    return ['Filetti dritti: fiocco regolato bene', 'good'];
  },
  /** Uomo a mare: cosa fare secondo dove sta il salvagente rispetto alla barca e al vento. Ci si allontana al traverso,
   *  si vira, si scende al gran lasco sotto al salvagente e si risale di bolina larga, l'andatura in cui lascando le vele
   *  ci si ferma; per fermarsi serve spazio, piu' con poco vento. */
  mobTip(s, mob) {
    const rel = sub(mob.pos, s.pos), d = len(rel), kn = Math.abs(speedKn(s)), up = dirVec(s.twd);
    const fwd = dirVec(s.heading), stb = dirVec(s.heading + 90);
    const above = rel.x * up.x + rel.y * up.y;                   // di quanto il salvagente e' sopravento alla barca
    const off = Math.abs(norm180(bearing(rel) - s.twd));         // la rotta per arrivarci, in gradi dal vento
    // m/s con cui la barca si avvicina al salvagente (negativo se se ne va)
    const closing = ((fwd.x * s.u + stb.x * s.v) * rel.x + (fwd.y * s.u + stb.y * s.v) * rel.y) / Math.max(1, d);
    const plan = mobPlan(s.tws);
    if (s.spi) return ['Uomo a mare con lo spi: ammainalo subito (E), con lo spi non si torna indietro', 'bad'];
    // appena lanciato e' vicino ma si sta andando via (a meno di essersi fermati subito)
    if (d < 14 && (mob.away || kn <= MOB.slow)) {
      if (kn > MOB.slow) return ['Troppo veloce per afferrarlo: vele in bando (SPAZIO) o orza per frenare', 'bad'];
      return (rel.x * stb.x + rel.y * stb.y) * twaOf(s) < 0
        ? ["Barca quasi ferma, salvagente sottovento: la barca scarroccia verso di lui, afferralo col mezzo marinaio all'altezza delle sartie", 'good']
        : ['Barca quasi ferma, salvagente sopravento: la barca scarroccia via da lui, afferralo subito col mezzo marinaio', 'good'];
    }
    if (d > 220) return ['La barca è troppo lontana: torna verso il salvagente e non perderlo di vista', 'warn'];
    // ultimo tratto: la barca sta arrivando sul salvagente, piano o gia' con le vele in bando...
    const coming = mob.away && closing > -0.2;
    if (coming && (s.bando || kn <= 3) && d < plan.start) {
      if (kn < 0.8) return ['La barca si è fermata prima: riprendi un attimo le scotte (SPAZIO) per avvicinarti, poi di nuovo in bando', 'info'];
      return kn > 3 && d < 25 ? ["Vai ancora forte: all'ultimo orza un po' per fermarti", 'warn']
        : ["Arrivi piano: portalo sul fianco, all'altezza delle sartie", 'good'];
    }
    // ...o ancora veloce, dentro lo spazio che serve per fermarsi
    if (coming && d < plan.stop + 3) {
      if (d >= plan.stop - 5 && above > 10 && off >= 40 && off <= 75) return ['Ora frena: vele in bando (SPAZIO), arrivi per abbrivio', 'warn'];
      return [`Troppo vicino per fermarti: poggia, allontanati e riprova partendo da almeno ${plan.start} m`, 'warn'];
    }
    if (above > 10) {
      if (off < 40) return ["Il salvagente è nell'angolo morto: poggia, spostati di lato e risali di bolina larga", 'warn'];
      if (off > 75) return [`Scendi ancora al gran lasco: a 50-60° dal vento e ad almeno ${plan.start} m orza in bolina larga verso il salvagente`, 'info'];
      if (s.bando) return [`Vele in bando troppo presto: riprendi le scotte (SPAZIO) e mettile in bando a ${plan.stop} m`, 'info'];
      return [`Bolina larga verso il salvagente, puntandolo un paio di metri di lato: a ${plan.stop} m metti le vele in bando (SPAZIO)`, 'good'];
    }
    if (!mob.far) return [`Uomo a mare: chi è a prua indica il salvagente col braccio. Poggia al traverso e allontanati di ${plan.away} m (${Math.round(plan.away / 7.5)} lunghezze)`, 'info'];
    return [`Ora vira e scendi al gran lasco sotto al salvagente; a 50-60° dal vento e ad almeno ${plan.start} m orza in bolina larga verso di lui`, 'info'];
  },
  /** Gavitello: si scende sottovento, si risale di bolina stretta finche' e' dritto sopravento e a gavPlan().luff metri si
   *  orza prua al vento: la barca arriva per abbrivio, quasi ferma, con la prua sul gavitello. */
  gavTip(s, gav) {
    const rel = sub(gav.pos, s.pos), d = len(rel), kn = Math.abs(speedKn(s)), up = dirVec(s.twd), fwd = dirVec(s.heading);
    const above = rel.x * up.x + rel.y * up.y, lat = Math.abs(rel.x * up.y - rel.y * up.x);
    const along = rel.x * fwd.x + rel.y * fwd.y, across = Math.abs(rel.x * fwd.y - rel.y * fwd.x);
    const twa = Math.abs(twaOf(s)), plan = gavPlan(s.tws);
    if (s.spi) return ['Rientro con lo spi: ammainalo (E), al gavitello si arriva di bolina', 'warn'];
    if (d > 350) return ['Rientro alla base: vai verso il gavitello della scuola, il freccione lo indica', 'info'];
    // lat < 12: il gavitello e' davvero sopravento, non e' una virata che passa vicino
    if (twa < 30 && along > -1 && d < plan.luff + 15 && lat < 12) {
      // prua al vento, per abbrivio: quanto manca alla prua e quanto scorre ancora la barca, con le scotte come sono e
      // libere (le vele che sbattono libere frenano quasi il doppio)
      const ahead = along - 3.6, stop = gavStop(s), loose = s.bando ? stop : gavStop({ ...s, bando: true });
      if (kn < 0.5 && ahead > 3) return ['Fermi prima del gavitello: lascia cadere la prua, allontanati e riprova orzando più vicino', 'warn'];
      if (across > 3 && along > 3 && Math.abs(s.r) < 10) return ['Il gavitello è di lato: finché hai abbrivio porta la prua su di lui col timone', 'warn'];
      if (stop < ahead - 2.5 && ahead > 6) return ['Così ti fermi prima del gavitello: poggia, allontanati e riprova orzando più vicino', 'warn'];
      if (loose > ahead + 3 && ahead < 8) return ['Arrivi troppo forte: poggia, allontanati e riprova orzando più lontano', 'warn'];
      // il momento di liberarle: da qui con le scotte libere la barca si ferma proprio sul gavitello
      if (stop > ahead + 3 && loose >= ahead - 1.5 && loose <= ahead + 1) return ['Ora lascia andare le scotte (SPAZIO): così ti fermi sul gavitello', 'warn'];
      return ['Prua al vento, arrivi per abbrivio: chi è a prua prende il gavitello col mezzo marinaio', 'good'];
    }
    if (above < 5) return [`Scendi sottovento al gavitello: ci si arriva risalendo il vento, da almeno ${plan.start} m sotto`, 'info'];
    if (lat < 6 && above < plan.luff - 6 && kn > 1.6) return [`Troppo vicino per fermarti: poggia, allontanati e riprova da almeno ${plan.start} m sotto`, 'warn'];
    // detto un paio di metri prima, il tempo di mettere la barra
    if (lat < 6 && above <= plan.luff + 3) return ['Ora orza prua al vento: arrivi per abbrivio sul gavitello', 'warn'];
    return [`Risali di bolina stretta: quando il gavitello è dritto sopravento a te, a circa ${plan.luff} m, orza prua al vento`, 'good'];
  },
  tips(s, lake, mob = null, gav = null) {
    if (gav?.moored) return [['Ormeggiati al gavitello: la barca sta prua al vento. Per ripartire molla il gavitello (0)', 'good']];
    const out = [];
    const twa = Math.abs(twaOf(s)), ideal = idealSheets(s), kn = speedKn(s);
    // arrivando al gavitello si va prua al vento apposta: niente consigli sull'angolo morto
    const luffing = gav && len(sub(gav.pos, s.pos)) < 80;
    if (s.backMain) {
      // esercizio della randa scontrata: retromarcia e prua che cade dal lato del boma
      const side = s.backMain > 0 ? 'dritta' : 'sinistra';
      if (twa > 65 && !s.mainBacked) out.push([`La prua è caduta: molla il boma (K) e cazza la randa per ripartire`, 'good']);
      else if (s.u < -0.15) out.push([`Randa scontrata a ${side}: vai indietro e la prua cade a ${side}. Il timone lavora al contrario: correzioni dolci`, 'info']);
      else out.push([`Randa scontrata a ${side}: tieni il boma fuori finché la barca prende abbrivio all'indietro`, 'info']);
    }
    if (twa < 33 && !s.backMain && !luffing) out.push(Math.abs(kn) < 0.6
      ? ["Sei fermo nell'angolo morto: scontra la randa (K) o metti la barra e lascia cadere la prua", 'bad']
      : ['Troppo all\'orza: le vele non portano, poggia di qualche grado', 'bad']);
    if (s.cappa) {
      // in cappa: randa lasca e timone all'orza li deve mettere l'allievo
      const eased = s.mainLuff > 0.3 || s.mainSheet > 0.45, helm = s.rudder * (s.awa >= 0 ? 1 : -1) > 6;
      const drift = Math.abs(s.v) / KNOT, fwd = s.u / KNOT;
      if (!eased) out.push(['In cappa la randa va lascata, altrimenti la barca riparte', 'warn']);
      else if (!helm) out.push(["In cappa il timone va all'orza e tenuto lì: il fiocco spinge la prua sottovento", 'warn']);
      else if (fwd < 2) out.push([`Barca in cappa: avanza a ${fwd.toFixed(1)} nodi e scarroccia di ${drift.toFixed(1)}. Per ripartire libera il fiocco (U)`, 'good']);
      else out.push(['In cappa la barca va ancora: lasca di più la randa', 'info']);
    }
    if (s.bando) out.push(['Vele in bando: senza scotte la barca rallenta (in poppa poco). Per ripartire riprendi le scotte (SPAZIO)', 'info']);
    else if (s.backMain || s.cappa) { /* il boma lo tiene l'equipaggio: niente consigli sulla scotta della randa */ }
    else if (s.haul) out.push([s.mainSheet > 0.45 ? 'Strambata chiamata: cazza la randa al centro, poi poggia e stramba'
      : 'Randa al centro: ora poggia e stramba, il boma passerà piano', s.mainSheet > 0.45 ? 'warn' : 'good']);
    else if (s.reefTimer > 0) { /* durante i terzaroli la randa sbatte apposta */ }
    else if (s.mainLuff > 0.35 && twa >= 33 && Math.abs(s.heel) > 20) out.push(['La randa fileggia per scaricare: con questo vento va bene così', 'info']);
    else if (s.mainLuff > 0.35 && twa >= 33) out.push(['La randa fileggia (sbatte): cazzala', 'bad']);
    else if (s.mainSheet - ideal.main > 0.09 && twa < 160) out.push(["Randa troppo lascata: cazzala finché smette di fileggiare", 'warn']);
    else if (ideal.main - s.mainSheet > 0.09 && twa > 45) out.push(["Randa troppo cazzata: lasca finché non fileggia, poi riprendi un po'", 'warn']);
    if (s.jibTimer > 0 || s.bando || s.backMain || s.jibFurl > 0.5 || s.cappa) { /* il fiocco sbatte, e' avvolto o e' in cappa apposta */ }
    else if (s.farfalla) out.push([twa < 155 ? "A farfalla stai orzando troppo: poggia, sotto i 140° il fiocco si chiude" : 'A farfalla: tieni la poppa piena, randa e fiocco prendono tutti e due vento pulito', twa < 155 ? 'warn' : 'good']);
    else if (s.jibBlanket > 0.5) out.push(['In poppa il fiocco è coperto dalla randa e sbatte: prova la farfalla (Y)', 'info']);
    else if (s.jibLuff > 0.35 && twa >= 33) out.push(['Il fiocco sbatte: cazza la scotta del fiocco', 'bad']);
    else if (s.jibSheet - ideal.jib > 0.1 && twa < 150) out.push(['Fiocco troppo lascato: cazzalo', 'warn']);
    else if (ideal.jib - s.jibSheet > 0.1 && twa > 45) out.push(["Fiocco troppo cazzato: lascalo un po'", 'warn']);
    const busy = s.reefTimer > 0 || s.jibTimer > 0;
    if (s.reefTimer > 0) out.push(['Terzarolo in corso: tieni la barca dritta finché la randa è ridotta', 'info']);
    if (s.jibTimer > 0) out.push(['Cambio del fiocco in corso: prua stabile, il fiocco sbatte finché non è issato', 'info']);
    if (Math.abs(s.heel) > 24 && s.reef < 3 && s.tws > 13 && !busy) {
      out.push([s.reef < 2 ? 'Vento forte: prendi una mano di terzaroli (Z)' : 'Ancora troppo vento: metti la tormentina al posto del fiocco (Z)', 'warn']);
    } else if (stormJib(s) && s.tws < 16 && !busy) out.push(['Il vento è calato: togli la tormentina e rimetti il fiocco (X)', 'info']);
    else if (s.reef > 0 && s.reef < 3 && s.tws < 9 && !busy) out.push(['Poco vento: sciogli i terzaroli per avere più tela (X)', 'info']);
    // spinnaker: quando issarlo, quando si chiude, quando e' troppo
    if (s.spi && s.spiUp > 0.8 && s.spiLuff > 0.5 && !s.bando) out.unshift(["Lo spi si chiude: sei troppo all'orza, poggia o ammainalo (E)", 'bad']);
    else if (s.spi && s.tws > 21 && twa < 125) out.push(['Vento forte al lasco con lo spi: rischio di straorzata, poggia o ammaina (E)', 'warn']);
    else if (!s.spi && twa > 105 && s.tws < 21 && !s.bando && !s.backMain && !mob && !gav) out.push(['Andatura portante: issa lo spi (E)', 'info']);
    if (s.bando) { /* niente consigli sulle scotte: sono libere apposta */ }
    else if (Math.abs(s.heel) > 26) out.push(['Troppo sbandata: lasca la randa per scaricare', 'bad']);
    else if (Math.abs(s.rudder) > 9 && Math.abs(s.r) < 2 && Math.abs(s.heel) > 15) out.push(["Barca ardente (tira all'orza): lasca un po' di randa", 'warn']);
    if (mob) out.unshift(Coach.mobTip(s, mob));
    if (gav) out.unshift(Coach.gavTip(s, gav));
    if (byLee(s) > 1) out.unshift(['False mure: la randa è dalla parte del vento, rischio di strambata involontaria. Orza un poco o stramba', 'bad']);
    if (Math.abs(s.rudder) > 22 && Math.abs(kn) > 1) out.push(['Tanto timone frena la barca: correzioni più dolci', 'info']);
    if (lake.depth(add(s.pos, mul(dirVec(s.heading), 25))) < 2.5 && s.u > 0.5) out.unshift(['Attenzione, bassofondale davanti: vira o poggia subito', 'bad']);
    else if (lake.depth(s.pos) < 2.2) out.unshift(["In secca: barra al centro, lasca le vele e fatti scadere all'indietro", 'bad']);
    if (!out.length) out.push(['Barca regolata bene: mantieni la rotta', 'good']);
    return out.slice(0, 3);
  },
};
