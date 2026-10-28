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
    this.sweep = 0; this.sweepAngle = null; this.wrongWay = false; this.approachSaid = false;
    this.replay = null;
    this.time = 0;
    this.aground = false;
    this.ironsTimer = 0;
    this.waves.amp = Waves.amplitude(this.windKn) * 0.55;
    this.waves.dirRad = rad(this.wind.baseDir + 180);
    this.say(`${DIRECTIONS[this.settings.windFrom][0]} ${this.windKn} NODI · SI ESCE DALLA BASE: TRAVERSO ${lee > 0 ? 'MURE A SINISTRA' : 'MURE A DRITTA'}`, 'info');
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

  say(text, tone) { this.message = text; this.tone = tone; this.messageTime = this.time; }

  /** Riduce (+1) o aumenta (-1) la tela: 1 mano, 2 mani, 2 mani + tormentina. Durante la manovra
   *  la vela interessata sbatte (la randa per i terzaroli, il fiocco per la tormentina). */
  reef(d) {
    const b = this.boat;
    if (this.replay !== null || b.reefTimer > 0 || b.jibTimer > 0) return;
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
    if (b.spiUp > 0) { this.say('PRIMA AMMAINA LO SPI (E)', 'warn'); return; }
    if (Math.abs(twaOf(b)) > 130) { this.say('LA CAPPA SI FA DI BOLINA O AL TRAVERSO: PRIMA ORZA', 'warn'); return; }
    b.cappa = b.awa >= 0 ? 1 : -1; b.farfalla = false;
    this.say(this.autoTrim ? "FIOCCO IN CAPPA. ORA VELE MANUALI (T), LASCA LA RANDA E TIMONE ALL'ORZA" : "FIOCCO IN CAPPA. ORA LASCA LA RANDA E METTI IL TIMONE ALL'ORZA", 'info');
  }

  /** Spinnaker: si issa dal traverso in giu' (il fiocco si avvolge, il tangone va sopravento) o si ammaina. */
  toggleSpi() {
    const b = this.boat;
    if (b.spi) { b.spi = 0; this.say('SI AMMAINA LO SPI E SI SROTOLA IL FIOCCO', 'info'); return; }
    if (Math.abs(twaOf(b)) < 80) { this.say('LO SPI SI ISSA DAL TRAVERSO IN GIÙ: PRIMA POGGIA', 'warn'); return; }
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
    if (Math.abs(twaOf(b)) < 150) { this.say('LA FARFALLA SI FA IN POPPA: POGGIA FINO A 165-180° DAL VENTO', 'warn'); return; }
    b.farfalla = true; b.jibSide = -b.mainSide;
    this.say("ANDATURA A FARFALLA: RANDA DA UNA PARTE, FIOCCO DALL'ALTRA SUL TANGONE", 'good');
  }

  /** Uomo a mare: l'istruttore butta in acqua il salvagente anulare (con l'asta e la bandierina) dalla poppa e
   *  l'allievo deve tornare a prenderlo. Di nuovo per annullare l'esercizio. */
  manOverboard() {
    if (this.replay !== null) return;
    if (this.mob) { this.mob = null; this.say('ESERCIZIO ANNULLATO, IL GOMMONE RIPRENDE IL SALVAGENTE', 'info'); return; }
    const b = this.boat, fwd = dirVec(b.heading), side = dirVec(b.heading + 90), k = Math.random() < 0.5 ? -1 : 1;
    const from = sub(b.pos, mul(fwd, 3.4));
    this.mob = { from, pos: add(from, add(mul(fwd, -3), mul(side, 2 * k))), t0: this.time, fly: MOB.fly, hit: -100, miss: -100, away: false };
    this.say('UOMO A MARE! NON PERDERE DI VISTA IL SALVAGENTE', 'bad');
  }
  /** Dove si vede il salvagente, anche in moviola; null se non e' in acqua. */
  get mobShown() { return this.replay !== null ? this.shown.mobPos ?? null : this.mob ? this.mob.pos : null; }

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
      this.time += h;
    }
    this.waves.time = this.time;
    this.checkGround();
    for (const e of this.events) {
      if (e.type === 'cappaEnd') this.say('LA BARCA HA VIRATO: IL FIOCCO NON È PIÙ IN CAPPA', 'info');
      if (e.type === 'spiGybe') this.say("STRAMBATA CON LO SPI: SI PASSA IL TANGONE DALL'ALTRA PARTE", 'info');
      if (e.type === 'broach') this.say('STRAORZATA! TROPPO VENTO PER LO SPI: POGGIA, LASCA LA RANDA O AMMAINA (E)', 'bad');
      if (e.type === 'wingEnd') this.say("TROPPO ALL'ORZA PER LA FARFALLA: IL FIOCCO SI CHIUDE E TORNA SOTTOVENTO", 'warn');
      if (e.type === 'gybe') this.say(e.violent ? 'STRAMBATA INVOLONTARIA! IL BOMA HA ATTRAVERSATO DI COLPO' : 'STRAMBATA', e.violent ? 'bad' : 'good');
      if (e.type === 'tack') this.say(twaOf(this.boat) > 0 ? 'VIRATA: ORA MURE A DRITTA' : 'VIRATA: ORA MURE A SINISTRA', 'good');
    }
    this.checkCourse(dt);
    this.checkMob(dt);
    this.historyTimer -= dt;
    if (this.historyTimer <= 0) {
      const snap = copyBoat(this.boat);
      snap.mobPos = this.mob ? { ...this.mob.pos } : null;
      this.history.push(snap);
      this.historyTimer = 1 / 30;
      while (this.history.length && this.time - this.history[0].time > 40) this.history.shift();
    }
    if (Math.abs(twaOf(this.boat)) < 30 && Math.abs(speedKn(this.boat)) < 0.4) {
      this.ironsTimer += dt;
      if (this.ironsTimer > 4 && this.time - this.messageTime > 6) this.say('FERMI PRUA AL VENTO: SCONTRA LA RANDA (K) O METTI LA BARRA DA UN LATO E ASPETTA CHE LA PRUA CADA', 'warn');
    } else this.ironsTimer = 0;
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
        this.say("HAI TOCCATO LA BOA! IN REGATA SAREBBE UN GIRO DI PENALITA'", 'bad');
      }
    }
    for (const m of this.lake.base.moorings) {
      const c = this.lake.mooredCenter(m, this.wind.direction);
      if (len(sub(b.pos, c)) < m.len * 0.45 + 1.4 && this.time - this.buoyTouch > 5) {
        this.buoyTouch = this.time;
        b.u *= 0.25;
        b.r += b.r > 0 ? -8 : 8;
        this.say("HAI URTATO UNA BARCA ALL'ORMEGGIO! ATTENZIONE IN USCITA DALLA BASE", 'bad');
        this.events.push({ type: 'ground' });
      }
    }
    if (this.mob) return;                                 // durante l'uomo a mare le boe aspettano
    // la boa si gira in senso antiorario, lasciandola a sinistra: si somma l'angolo percorso intorno a lei
    const rel = sub(b.pos, this.marks[this.nextMark]), dist = len(rel);
    if (dist < MARK_FAR && !this.approachSaid) {
      this.approachSaid = true;
      // dopo la boa di poppa si risale di bolina: lo spi va ammainato prima
      const douse = this.boat.spi && this.nextMark === 1 ? ' · AMMAINA LO SPI PRIMA (E)' : '';
      this.say(`${MARK_NAMES[this.nextMark]}: LASCIALA A SINISTRA, GIRA IN SENSO ANTIORARIO${douse}`, 'info');
    } else if (dist > 110) this.approachSaid = false;
    if (dist > 45) { this.sweep = 0; this.sweepAngle = null; this.wrongWay = false; return; }
    const a = deg(Math.atan2(rel.y, rel.x));
    if (this.sweepAngle !== null) this.sweep += norm180(a - this.sweepAngle);
    this.sweepAngle = a;
    if (this.sweep < -90 && !this.wrongWay) {
      this.wrongWay = true;
      this.say('BOA GIRATA AL CONTRARIO! VA LASCIATA A SINISTRA: TORNA INDIETRO E GIRALA IN SENSO ANTIORARIO', 'bad');
    }
    if (this.sweep < 90) return;
    this.sweep = 0; this.sweepAngle = null; this.wrongWay = false; this.approachSaid = false;
    if (this.courseStep === 0) {
      if (this.lapStart !== null) {
        this.lastLap = this.time - this.lapStart;
        const t = this.lastLap | 0;
        this.say(`GIRO COMPLETO IN ${(t / 60) | 0}:${String(t % 60).padStart(2, '0')} · SI RIPARTE DALLA BOLINA`, 'good');
      } else {
        this.say('BOA DI BOLINA PRESA: PARTE IL CRONOMETRO · ORA LA BOA DI TRAVERSO', 'good');
      }
      this.lapStart = this.time;
    } else {
      this.say(`${MARK_NAMES[this.nextMark]} PRESA · ORA ${MARK_NAMES[COURSE[(this.courseStep + 1) % 3]]}`, 'good');
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
    // la prua e' stretta, da meta' barca in giu' lo scafo e' largo quasi uguale fino allo specchio di poppa
    const half = along > 0.5 ? MOB.halfBeam * clamp((3.75 - along) / 3.25, 0, 1) : MOB.halfBeam;
    if (Math.abs(along) < 3.75 && Math.abs(across) < half + 0.35) {
      mob.pos = add(mob.pos, mul(stb, (across >= 0 ? 1 : -1) * (half + 0.35) - across));
      if (kn > 2 && this.time - mob.hit > 5) {
        mob.hit = this.time;
        this.say('SALVAGENTE INVESTITO! CON UNA PERSONA SAREBBE GRAVISSIMO', 'bad');
      }
      if (kn > MOB.slow) return;
    }
    if (along < -3.4 || along > 2.6 || Math.abs(across) > half + MOB.reach) return;
    if (kn > MOB.slow) {
      if (this.time - mob.miss > 6 && this.time - mob.hit > 3) {
        mob.miss = this.time;
        this.say('TROPPO VELOCE PER AFFERRARLO: RIPROVA ARRIVANDO PIANO', 'warn');
      }
      return;
    }
    // sottovento: il salvagente e' dalla parte opposta a quella da cui arriva il vento (twa > 0 = vento da dritta)
    const t = (this.time - mob.t0) | 0, lee = across * twaOf(b) < 0;
    this.lastMob = this.time - mob.t0;
    this.mob = null;
    this.say(`RECUPERATO IN ${(t / 60) | 0}:${String(t % 60).padStart(2, '0')} · ${lee ? 'SOTTOVENTO, COME SI DEVE' : 'SOPRAVENTO (MEGLIO SOTTOVENTO)'}`, lee ? 'good' : 'info');
  }

  /** Chiglia (1,9 m) sul fondo o prua sulla riva: la barca si ferma. */
  checkGround() {
    const b = this.boat, lake = this.lake, fwd = dirVec(b.heading);
    const keel = lake.depth(b.pos), bow = lake.depth(add(b.pos, mul(fwd, 3.6))), stern = lake.depth(sub(b.pos, mul(fwd, 3.6)));
    const hit = keel < 1.9 || (b.u > 0 && bow < 0.6) || (b.u < 0 && stern < 0.6);
    if (hit) {
      if (!this.aground) { this.say('IN SECCA! LA CHIGLIA HA TOCCATO IL FONDO', 'bad'); this.events.push({ type: 'ground' }); }
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
    if (b.bando) {
      // le scotte corrono fuori in un paio di secondi; chi ricomincia a cazzare le riprende in mano
      b.mainSheet = Math.min(1, b.mainSheet + 0.8 * dt);
      b.jibSheet = Math.min(1, b.jibSheet + 0.9 * dt);
      if ((c.main || 0) > 0 || (c.jib || 0) > 0) { this.autoTrim = false; this.toggleBando(); }
    } else if (this.autoTrim) {
      const id = idealSheets(b);
      b.mainSheet += clamp(id.main - b.mainSheet, -0.4 * dt, 0.4 * dt);
      b.jibSheet += clamp(id.jib - b.jibSheet, -0.4 * dt, 0.4 * dt);
    } else {
      b.mainSheet = clamp(b.mainSheet - (c.main || 0) * 0.22 * dt, 0, 1);
      b.jibSheet = clamp(b.jibSheet - (c.jib || 0) * 0.25 * dt, 0, 1);
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
  telltales(s) {
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
  /** Uomo a mare: cosa fare secondo dove sta il salvagente rispetto alla barca e al vento. Si allontana al traverso,
   *  si vira, si scende sottovento e si risale di bolina larga, l'andatura in cui lascando le vele ci si ferma. */
  mobTip(s, mob) {
    const rel = sub(mob.pos, s.pos), d = len(rel), kn = Math.abs(speedKn(s)), up = dirVec(s.twd);
    const above = rel.x * up.x + rel.y * up.y;                   // di quanto il salvagente e' sopravento alla barca
    const off = Math.abs(norm180(bearing(rel) - s.twd));         // la rotta per arrivarci, in gradi dal vento
    if (s.spi) return ['Uomo a mare con lo spi: ammainalo subito (E), con lo spi non si torna indietro', 'bad'];
    // appena lanciato e' vicino ma si sta andando via (a meno di essersi fermati subito)
    if (d < 14 && (mob.away || kn <= MOB.slow)) return kn > MOB.slow ? ['Troppo veloce per afferrarlo: vele in bando (SPAZIO) o orza per frenare', 'bad']
      : ["Barca quasi ferma, così: salvagente sottovento (la barca scarroccia verso di lui), all'altezza delle sartie, e lo si afferra col mezzo marinaio", 'good'];
    if (d > 160) return ['La barca è troppo lontana: torna verso il salvagente e non perderlo di vista', 'warn'];
    if (above > 10) {
      if (off < 40) return ["Il salvagente è nell'angolo morto: poggia, spostati di lato e risali di bolina larga", 'warn'];
      if (off > 75) return ["Scendi ancora un po' sottovento: l'ultimo tratto va fatto di bolina larga, così lascando ti fermi", 'info'];
      // con le vele in bando di bolina larga la barca si ferma in una cinquantina di metri: di piu' con poco vento, meno con tanto
      const stop = Math.round(50 * Math.pow(10 / Math.max(4, s.tws), 0.6) / 5) * 5;
      if (d > stop + 8 && !s.bando) return [`Bolina larga verso il salvagente, puntando un paio di metri sopra: a ${stop} m metti le vele in bando (SPAZIO)`, 'good'];
      if (!s.bando && kn > 2.5) return ['Ora frena: vele in bando (SPAZIO), arrivi per abbrivio', 'warn'];
      return kn > 3 && d < 25 ? ["Vai ancora forte: all'ultimo orza un po' per fermarti", 'warn']
        : ["Arrivi piano: tieni il salvagente sottovento, all'altezza delle sartie", 'good'];
    }
    if (d < 40) return ['Uomo a mare: chi è a prua indica il salvagente col braccio. Poggia al traverso e allontanati di 5-6 lunghezze (40 m)', 'info'];
    return ['Ora vira e scendi sottovento al salvagente: ci tornerai di bolina larga, dove puoi frenare lascando le vele', 'info'];
  },
  tips(s, lake, mob = null) {
    const out = [];
    const twa = Math.abs(twaOf(s)), ideal = idealSheets(s), kn = speedKn(s);
    if (s.backMain) {
      // esercizio della randa scontrata: retromarcia e prua che cade dal lato del boma
      const side = s.backMain > 0 ? 'dritta' : 'sinistra';
      if (twa > 65 && !s.mainBacked) out.push([`La prua è caduta: molla il boma (K) e cazza la randa per ripartire`, 'good']);
      else if (s.u < -0.15) out.push([`Randa scontrata a ${side}: vai indietro e la prua cade a ${side}. Il timone lavora al contrario: correzioni dolci`, 'info']);
      else out.push([`Randa scontrata a ${side}: tieni il boma fuori finché la barca prende abbrivio all'indietro`, 'info']);
    }
    if (twa < 33 && !s.backMain) out.push(Math.abs(kn) < 0.6
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
    else if (!s.spi && twa > 105 && s.tws < 21 && !s.bando && !s.backMain && !mob) out.push(['Andatura portante: issa lo spi (E)', 'info']);
    if (s.bando) { /* niente consigli sulle scotte: sono libere apposta */ }
    else if (Math.abs(s.heel) > 26) out.push(['Troppo sbandata: lasca la randa per scaricare', 'bad']);
    else if (Math.abs(s.rudder) > 9 && Math.abs(s.r) < 2 && Math.abs(s.heel) > 15) out.push(["Barca ardente (tira all'orza): lasca un po' di randa", 'warn']);
    if (mob) out.unshift(Coach.mobTip(s, mob));
    if (byLee(s) > 1) out.unshift(['False mure: la randa è dalla parte del vento, rischio di strambata involontaria. Orza un poco o stramba', 'bad']);
    if (Math.abs(s.rudder) > 22 && Math.abs(kn) > 1) out.push(['Tanto timone frena la barca: correzioni più dolci', 'info']);
    if (lake.depth(add(s.pos, mul(dirVec(s.heading), 25))) < 2.5 && s.u > 0.5) out.unshift(['Attenzione, bassofondale davanti: vira o poggia subito', 'bad']);
    else if (lake.depth(s.pos) < 2.2) out.unshift(["In secca: barra al centro, lasca le vele e fatti scadere all'indietro", 'bad']);
    if (!out.length) out.push(['Barca regolata bene: mantieni la rotta', 'good']);
    return out.slice(0, 3);
  },
};
