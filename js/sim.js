// Simulazione: barca, vento, onde, boe, moviola, messaggi e consigli dell'istruttore.
import {
  Wind, newBoat, copyBoat, step, idealSheets, Spec, norm180, norm360, rad, deg, clamp, dirVec, len, sub, add, mul,
  speedKn, twaOf, stormJib,
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
    const out = dirVec(lake.shoreOut);
    let d = 0;
    while (d < 400 && lake.depth(mul(out, d)) < 3) d += 2;
    const b = newBoat();
    b.pos = mul(out, d + 45);
    const h1 = norm360(this.wind.baseDir + 90), h2 = norm360(this.wind.baseDir - 90);
    b.heading = Math.abs(norm180(h1 - lake.shoreOut)) < Math.abs(norm180(h2 - lake.shoreOut)) ? h1 : h2;
    const lee = norm180(this.wind.baseDir - b.heading) < 0 ? 1 : -1;
    Object.assign(b, { u: 2.2, mainSide: lee, jibSide: lee, mainSheet: 0.55, jibSheet: 0.55,
                       mainAngle: 50 * lee, jibAngle: 40 * lee, crew: -lee });
    this.boat = b;
    this.history = []; this.historyTimer = 0;
    this.track = []; this.trackTimer = 0;
    this.courseStep = 0; this.lapStart = null; this.lastLap = null; this.buoyTouch = -100;
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
    const rule = ['LA FRECCIA INDICA DOVE VA LA POPPA', 'LA POPPA VA DALLA PARTE OPPOSTA ALLA BARRA',
                  'GIRA LA RUOTA DALLA PARTE DOVE VUOI CHE VADA LA POPPA'][this.settings.steering];
    this.say(`RANDA SCONTRATA ${want > 0 ? 'A DRITTA' : 'A SINISTRA'}: SI VA INDIETRO · IN RETROMARCIA ${rule}`, 'info');
  }

  /** Andatura a farfalla: in poppa il fiocco va dalla parte opposta alla randa, sul tangone; di nuovo per riportarlo. */
  toggleFarfalla() {
    const b = this.boat;
    if (b.farfalla) {
      b.farfalla = false; b.jibSide = b.mainSide;
      this.say('FIOCCO RIPORTATO DALLA PARTE DELLA RANDA', 'info');
      return;
    }
    if (Math.abs(twaOf(b)) < 150) { this.say('LA FARFALLA SI FA IN POPPA: POGGIA FINO A 165-180° DAL VENTO', 'warn'); return; }
    b.farfalla = true; b.jibSide = -b.mainSide;
    this.say("ANDATURA A FARFALLA: RANDA DA UNA PARTE, FIOCCO DALL'ALTRA SUL TANGONE", 'good');
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
      this.time += h;
    }
    this.waves.time = this.time;
    this.checkGround();
    for (const e of this.events) {
      if (e.type === 'wingEnd') this.say("TROPPO ALL'ORZA PER LA FARFALLA: IL FIOCCO SI CHIUDE E TORNA SOTTOVENTO", 'warn');
      if (e.type === 'gybe') this.say(e.violent ? 'STRAMBATA INVOLONTARIA! IL BOMA HA ATTRAVERSATO DI COLPO' : 'STRAMBATA', e.violent ? 'bad' : 'good');
      if (e.type === 'tack') this.say(twaOf(this.boat) > 0 ? 'VIRATA: ORA MURE A DRITTA' : 'VIRATA: ORA MURE A SINISTRA', 'good');
    }
    this.checkCourse(dt);
    this.historyTimer -= dt;
    if (this.historyTimer <= 0) {
      this.history.push(copyBoat(this.boat));
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
    // la boa si gira in senso antiorario, lasciandola a sinistra: si somma l'angolo percorso intorno a lei
    const rel = sub(b.pos, this.marks[this.nextMark]), dist = len(rel);
    if (dist < 70 && !this.approachSaid) {
      this.approachSaid = true;
      this.say(`${MARK_NAMES[this.nextMark]}: LASCIALA A SINISTRA, GIRA IN SENSO ANTIORARIO`, 'info');
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
    else if (c.centerTiller) b.rudder += clamp(-b.rudder, -90 * dt, 90 * dt);
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
    if (a < 38) return 'ANGOLO MORTO';
    if (a < 55) return 'BOLINA STRETTA';
    if (a < 75) return 'BOLINA LARGA';
    if (a < 105) return 'TRAVERSO';
    if (a < 135) return 'LASCO';
    if (a < 165) return 'GRAN LASCO';
    return 'POPPA';
  },
  tack(twa) { return Math.abs(twa) > 177 ? '' : (twa > 0 ? 'MURE A DRITTA' : 'MURE A SINISTRA'); },
  telltales(s) {
    if (s.bando) return ['Vele in bando: i filetti non lavorano', 'info'];
    if (s.jibTimer > 0) return ['Cambio del fiocco in corso', 'info'];
    if (Math.abs(s.awa) > 120) return ['In poppa i filetti non lavorano: guarda il fiocco', 'info'];
    if (s.jibLuff > 0.5) return ['Il fiocco sbatte: cazza la scotta o poggia', 'bad'];
    if (s.jibAlpha < 6) return ["Filetto sopravento che si alza: poggia un po' o cazza", 'warn'];
    if (s.jibAlpha > 22) return ["Filetto sottovento che cade: orza un po' o lasca", 'warn'];
    return ['Filetti dritti: fiocco regolato bene', 'good'];
  },
  tips(s, lake) {
    const out = [];
    const twa = Math.abs(twaOf(s)), ideal = idealSheets(s), kn = speedKn(s);
    if (s.backMain) {
      // esercizio della randa scontrata: retromarcia e prua che cade dal lato del boma
      const side = s.backMain > 0 ? 'dritta' : 'sinistra';
      if (twa > 65 && !s.mainBacked) out.push([`La prua è caduta: molla il boma (K) e cazza la randa per ripartire`, 'good']);
      else if (s.u < -0.15) out.push([`Randa scontrata a ${side}: vai indietro e la prua cade a ${side}. Il timone lavora al contrario: correzioni dolci`, 'info']);
      else out.push([`Randa scontrata a ${side}: tieni il boma fuori finché la barca prende abbrivio all'indietro`, 'info']);
    }
    if (twa < 36 && !s.backMain) out.push(Math.abs(kn) < 0.6
      ? ["Sei fermo nell'angolo morto: scontra la randa (K) o metti la barra e lascia cadere la prua", 'bad']
      : ['Troppo all\'orza: le vele non portano, poggia di qualche grado', 'bad']);
    if (s.bando) out.push(['Vele in bando: senza scotte la barca rallenta (in poppa poco). Per ripartire riprendi le scotte (SPAZIO)', 'info']);
    else if (s.backMain) { /* il boma lo tiene l'equipaggio: niente consigli sulla scotta della randa */ }
    else if (s.reefTimer > 0) { /* durante i terzaroli la randa sbatte apposta */ }
    else if (s.mainLuff > 0.35 && twa >= 36 && Math.abs(s.heel) > 20) out.push(['La randa fileggia per scaricare: con questo vento va bene così', 'info']);
    else if (s.mainLuff > 0.35 && twa >= 36) out.push(['La randa fileggia (sbatte): cazzala', 'bad']);
    else if (s.mainSheet - ideal.main > 0.09 && twa < 160) out.push(["Randa troppo lascata: cazzala finché smette di fileggiare", 'warn']);
    else if (ideal.main - s.mainSheet > 0.09 && twa > 45) out.push(["Randa troppo cazzata: lasca finché non fileggia, poi riprendi un po'", 'warn']);
    if (s.jibTimer > 0 || s.bando || s.backMain) { /* il fiocco sbatte apposta: cambio, scotte libere o randa scontrata */ }
    else if (s.farfalla) out.push([twa < 155 ? "A farfalla stai orzando troppo: poggia, sotto i 140° il fiocco si chiude" : 'A farfalla: tieni la poppa piena, randa e fiocco prendono tutti e due vento pulito', twa < 155 ? 'warn' : 'good']);
    else if (s.jibBlanket > 0.5) out.push(['In poppa il fiocco è coperto dalla randa e sbatte: prova la farfalla (Y)', 'info']);
    else if (s.jibLuff > 0.35 && twa >= 36) out.push(['Il fiocco sbatte: cazza la scotta del fiocco', 'bad']);
    else if (s.jibSheet - ideal.jib > 0.1 && twa < 150) out.push(['Fiocco troppo lascato: cazzalo', 'warn']);
    else if (ideal.jib - s.jibSheet > 0.1 && twa > 45) out.push(["Fiocco troppo cazzato: lascalo un po'", 'warn']);
    const busy = s.reefTimer > 0 || s.jibTimer > 0;
    if (s.reefTimer > 0) out.push(['Terzarolo in corso: tieni la barca dritta finché la randa è ridotta', 'info']);
    if (s.jibTimer > 0) out.push(['Cambio del fiocco in corso: prua stabile, il fiocco sbatte finché non è issato', 'info']);
    if (Math.abs(s.heel) > 24 && s.reef < 3 && s.tws > 13 && !busy) {
      out.push([s.reef < 2 ? 'Vento forte: prendi una mano di terzaroli (Z)' : 'Ancora troppo vento: metti la tormentina al posto del fiocco (Z)', 'warn']);
    } else if (stormJib(s) && s.tws < 16 && !busy) out.push(['Il vento è calato: togli la tormentina e rimetti il fiocco (X)', 'info']);
    else if (s.reef > 0 && s.reef < 3 && s.tws < 9 && !busy) out.push(['Poco vento: sciogli i terzaroli per avere più tela (X)', 'info']);
    if (s.bando) { /* niente consigli sulle scotte: sono libere apposta */ }
    else if (Math.abs(s.heel) > 26) out.push(['Troppo sbandata: lasca la randa per scaricare', 'bad']);
    else if (Math.abs(s.rudder) > 9 && Math.abs(s.r) < 2 && Math.abs(s.heel) > 15) out.push(["Barca ardente (tira all'orza): lasca un po' di randa", 'warn']);
    if (twa > 168 && s.mainSide * (twaOf(s) > 0 ? 1 : -1) > 0) out.push(['Sei al LEE: rischio di strambata involontaria, orza un poco', 'bad']);
    if (Math.abs(s.rudder) > 22 && Math.abs(kn) > 1) out.push(['Tanto timone frena la barca: correzioni più dolci', 'info']);
    if (lake.depth(add(s.pos, mul(dirVec(s.heading), 25))) < 2.5 && s.u > 0.5) out.unshift(['Attenzione, bassofondale davanti: vira o poggia subito', 'bad']);
    else if (lake.depth(s.pos) < 2.2) out.unshift(["In secca: barra al centro, lasca le vele e fatti scadere all'indietro", 'bad']);
    if (!out.length) out.push(['Barca regolata bene: mantieni la rotta', 'good']);
    return out.slice(0, 3);
  },
};
