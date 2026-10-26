// Fisica della barca scuola: vento, vele, chiglia, timone, sbandamento.
// Porta in JavaScript di Physics.swift (versione Mac): stessi numeri, stessi risultati.

// --- angoli (gradi, bussola: 0 = nord, 90 = est); vettori {x: est, y: nord} -------------------
export const norm180 = (a) => { let r = a % 360; if (r > 180) r -= 360; if (r <= -180) r += 360; return r; };
export const norm360 = (a) => { const r = a % 360; return r < 0 ? r + 360 : r; };
export const rad = (d) => d * Math.PI / 180;
export const deg = (r) => r * 180 / Math.PI;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const dirVec = (d) => ({ x: Math.sin(rad(d)), y: Math.cos(rad(d)) });
export const bearing = (v) => norm360(deg(Math.atan2(v.x, v.y)));
export const len = (v) => Math.hypot(v.x, v.y);
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const KNOT = 0.514444;

/** La barca scuola: Protagonist 7.50 (7,50 m, 850 kg piu' l'equipaggio, randa 18,8 m², genoa 15,9 m²).
 *  Scafo, deriva e stabilita' sono tarati sulla polare ORC della classe (mediana di 16 certificati, windregatta.com):
 *  dalla bolina al traverso le velocita' stanno entro qualche per cento. Lo spinnaker non c'e'. */
export const Spec = {
  length: 7.5, mass: 1090, mainArea: 18.8, jibArea: 15.9,
  ceHeight: 3.6, clrDepth: 0.9, mainX: -0.55, jibX: 1.5,
  mainMin: 3, mainMax: 85, jibMin: 9, jibMax: 100,
  rudderMax: 35, hullSpeed: 3.48,
  // scafo: resistenza (N) quadratica e lineare, "muro" oltre la velocita' critica, portanza della chiglia e sua resistenza indotta
  hullQuad: 3.19, hullLin: 20, hullWall: 700, hullWallExp: 9.35, keelLift: [3477, 4026, 274.5], keelInduced: 0.00052,
  // stabilita': braccio raddrizzante (m), peso dell'equipaggio che si sporge (kg); inerzie di rollio e d'imbardata
  gzArm: 3.49, crewWeight: 260, heelInertia: 6000, heelDamping: 4000, yawInertia: 7050,
  // randa scontrata: angolo a cui l'equipaggio tiene il boma spingendolo fuori; distanza del centro velico dall'albero lungo il boma
  backAngle: 70, mainCeAlong: 1.1,
  // forza (N) che la randa scontrata puo' fare prima che chi tiene il boma debba cedere: con tanto vento il boma rientra
  backHold: 800,
  // andando indietro lo scafo (specchio di poppa avanti, chiglia e timone al contrario) frena molto di piu':
  // resistenza propria della retromarcia, quadratica e lineare (N)
  asternQuad: 120, asternLin: 60,
  // terzaroli: superficie della randa con 0, 1 o 2 mani; di quanto scende il centro di spinta per mano;
  // secondi in cui la randa sbatte mentre si riduce o si scioglie
  reefArea: [1, 0.76, 0.56], reefDrop: 0.45, reefTime: 6,
  // tormentina: fiocco da burrasca (superficie relativa, discesa del centro di spinta, secondi per il cambio)
  stormJibArea: 0.4, stormDrop: 0.25, stormTime: 10,
};
/** Riduzioni possibili: 0 randa piena, 1 e 2 mani di terzaroli, 3 = due mani + tormentina. */
export const SAIL_PLANS = ['randa piena', '1 mano di terzaroli', '2 mani di terzaroli', '2 mani + tormentina'];
export const mainReefs = (s) => clamp(s.reef, 0, 2);
export const stormJib = (s) => s.reef >= 3;

/** Generatore pseudo-casuale ripetibile (mulberry32). */
export class Rng {
  constructor(seed) { this.s = seed >>> 0; }
  unit() {
    let t = (this.s += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.unit(); }
}

/** Il vento: direzione che oscilla, raffiche e buchi che scendono col vento. */
export class Wind {
  constructor(speed, gustiness = 0.5, seed = 7) {
    this.baseSpeed = speed;
    this.baseDir = 0;
    this.gustiness = gustiness;
    this.shifts = true;
    this.time = 0;
    this.puffs = [];
    this.rng = new Rng(seed);
    this.period = this.rng.range(240, 400);
    this.amplitude = this.rng.range(4, 8);
    this.drift = 0;
    this.puffTimer = 0;
  }
  get direction() {
    return this.shifts ? norm360(this.baseDir + this.amplitude * Math.sin(2 * Math.PI * this.time / this.period) + this.drift) : this.baseDir;
  }
  get speed() { return this.baseSpeed * (this.shifts ? 1 + 0.05 * Math.sin(2 * Math.PI * this.time / 97) : 1); }

  update(dt, center) {
    this.time += dt;
    if (this.shifts) {
      this.drift += this.rng.range(-1, 1) * 0.12 * dt;
      this.drift *= 1 - 0.01 * dt;
    }
    const down = dirVec(this.direction + 180);
    const v = this.baseSpeed * KNOT * 0.45 * dt;
    for (const p of this.puffs) { p.pos.x += down.x * v; p.pos.y += down.y * v; }
    this.puffs = this.puffs.filter((p) => len(sub(p.pos, center)) <= 700);
    if (this.gustiness <= 0) { this.puffs = []; return; }
    if (this.puffs.length < 4) for (let i = 0; i < 10; i++) this.spawn(center, true);
    this.puffTimer -= dt;
    if (this.puffTimer <= 0) {
      this.spawn(center, false);
      this.puffTimer = this.rng.range(6, 12) / Math.max(0.3, this.gustiness);
    }
  }

  spawn(c, anywhere) {
    const up = dirVec(this.direction), side = dirVec(this.direction + 90);
    const a = anywhere ? this.rng.range(-450, 450) : this.rng.range(450, 600);
    const b = this.rng.range(-450, 450);
    const gust = this.rng.unit() < 0.6;
    const k = this.baseSpeed * this.gustiness * 0.35;
    this.puffs.push({
      pos: { x: c.x + up.x * a + side.x * b, y: c.y + up.y * a + side.y * b },
      radius: this.rng.range(50, 120),
      dSpeed: gust ? this.rng.range(0.6, 1.0) * k : -this.rng.range(0.5, 0.9) * k,
      dDir: this.rng.range(-6, 6) * this.gustiness,
    });
  }

  /** {dir: da dove soffia, speed: nodi} in un punto. */
  at(p) {
    let s = this.speed, d = this.direction;
    for (const f of this.puffs) {
      const qx = p.x - f.pos.x, qy = p.y - f.pos.y;
      const d2 = qx * qx + qy * qy;
      if (d2 < f.radius * f.radius * 4) {
        const k = Math.exp(-d2 / (f.radius * f.radius * 0.6));
        s += f.dSpeed * k;
        d += f.dDir * k;
      }
    }
    return { dir: norm360(d), speed: Math.max(0.5, s) };
  }
}

/** Stato della barca: basta questo per disegnarla (anche in moviola). */
export function newBoat() {
  return {
    pos: { x: 0, y: 0 }, heading: 90, u: 2, v: 0, r: 0, heel: 0, heelRate: 0, rudder: 0,
    mainSheet: 0.4, jibSheet: 0.4, mainAngle: 30, jibAngle: 25, mainSide: 1, jibSide: 1,
    mainAlpha: 0, jibAlpha: 0, mainLuff: 0, jibLuff: 0, crew: 0, reef: 0, reefTimer: 0, jibTimer: 0, bando: false,
    backMain: 0, mainBacked: false, backAng: 0, mainPush: 0, farfalla: false, jibBlanket: 0,
    twd: 0, tws: 10, awa: 0, aws: 10, drive: 0, time: 0,
  };
}
export const copyBoat = (s) => ({ ...s, pos: { ...s.pos } });
export const speedKn = (s) => Math.hypot(s.u, s.v) / KNOT * (s.u < 0 ? -1 : 1);
export const twaOf = (s) => norm180(s.twd - s.heading);
export const leeway = (s) => Math.abs(s.u) < 0.2 ? 0 : deg(Math.atan2(s.v, Math.abs(s.u)));
export const vmg = (s) => s.u / KNOT * Math.cos(rad(twaOf(s)));

const RHO_AIR = 1.225, RHO_WATER = 1025;

/** Portanza e resistenza di una vela per angolo d'incidenza (gradi). */
export function coefficients(alpha) {
  if (alpha <= 0) return { cl: 0, cd: 0.08 };
  const a = Math.min(180, alpha);
  let cl;
  if (a <= 20) cl = 1.45 * Math.sin(rad(a / 20 * 90));
  else if (a <= 40) cl = 1.45 - (a - 20) / 20 * 0.4;
  else if (a <= 90) cl = 1.05 * Math.cos(rad((a - 40) / 50 * 90));
  else cl = 0;
  if (a < 6) cl *= clamp((a - 1) / 5, 0, 1);
  const s = Math.max(0, Math.sin(rad(a)) - Math.sin(rad(22))) / (1 - Math.sin(rad(22)));
  return { cl, cd: 0.04 + 0.09 * cl * cl + 1.25 * s * s };
}

export const sheetAngle = (main, sheet) => main
  ? Spec.mainMin + sheet * (Spec.mainMax - Spec.mainMin)
  : Spec.jibMin + sheet * (Spec.jibMax - Spec.jibMin);
export const sheetFor = (main, angle) => main
  ? clamp((angle - Spec.mainMin) / (Spec.mainMax - Spec.mainMin), 0, 1)
  : clamp((angle - Spec.jibMin) / (Spec.jibMax - Spec.jibMin), 0, 1);

/** Regolazione giusta delle scotte: incidenza di circa 15°, si lasca se sbanda troppo. */
export function idealSheets(s) {
  const a = Math.abs(s.awa);
  const depower = Math.max(0, Math.abs(s.heel) - 22) * 1.2;
  return { main: sheetFor(true, a - 16 + depower), jib: sheetFor(false, a - 14 + depower * 0.5) };
}

/** Un passo di integrazione. Restituisce gli eventi: {type: 'gybe', violent} o {type: 'tack'}. */
export function step(s, wind, dt) {
  const events = [];
  s.time += dt;
  const w = wind.at(s.pos);
  s.twd = w.dir;
  s.tws = w.speed;

  // vento apparente
  const fwd = dirVec(s.heading), stbd = dirVec(s.heading + 90);
  const vb = { x: fwd.x * s.u + stbd.x * s.v, y: fwd.y * s.u + stbd.y * s.v };
  const wd = dirVec(w.dir + 180);
  const app = { x: wd.x * w.speed * KNOT - vb.x, y: wd.y * w.speed * KNOT - vb.y };
  s.aws = len(app) / KNOT;
  s.awa = norm180(bearing({ x: -app.x, y: -app.y }) - s.heading);

  // vele: passano dall'altra parte quando il vento le prende dal lato sbagliato
  const windSide = s.awa >= 0 ? 1 : -1;
  const leeSide = -windSide;
  const absAwa = Math.abs(s.awa);
  const sideFor = (current, angle) => {
    if (current === leeSide) return current;
    if (absAwa < 175 - angle * 0.15) return leeSide;
    return current;
  };
  // randa scontrata: il boma lo tiene fuori l'equipaggio, dal lato scelto, qualunque sia il vento
  const newMainSide = s.backMain ? s.backMain : sideFor(s.mainSide, Math.abs(s.mainAngle));
  if (newMainSide !== s.mainSide && !s.backMain) {
    if (absAwa > 120) {
      const violent = s.mainSheet > 0.45;
      events.push({ type: 'gybe', violent });
      if (violent) { s.heelRate += -newMainSide * 22; s.r += newMainSide * -10; }
    } else {
      events.push({ type: 'tack' });
    }
    s.mainSide = newMainSide;
  }
  if (s.backMain) s.mainSide = s.backMain;
  // a farfalla il fiocco sta dalla parte opposta alla randa, tenuto fuori dal tangone; se si orza troppo si chiude
  if (s.farfalla && Math.abs(twaOf(s)) < 140) { s.farfalla = false; events.push({ type: 'wingEnd' }); }
  s.jibSide = s.farfalla ? -s.mainSide : sideFor(s.jibSide, Math.abs(s.jibAngle));

  const heelK = Math.cos(rad(Math.min(80, Math.abs(s.heel)))) ** 2;
  const q = 0.5 * RHO_AIR * (s.aws * KNOT) ** 2 * heelK;
  const awaR = rad(s.awa);
  const flow = { x: -Math.cos(awaR), y: -Math.sin(awaR) };

  if (s.reefTimer > 0) s.reefTimer = Math.max(0, s.reefTimer - dt);
  if (s.jibTimer > 0) s.jibTimer = Math.max(0, s.jibTimer - dt);
  // randa scontrata: chi tiene il boma lo spinge fuori un po' alla volta; se la randa preme piu' di quanto regge, cede
  if (s.backMain) s.backAng = clamp(s.backAng + (s.mainPush > Spec.backHold ? -30 : 20) * dt, 20, Spec.backAngle);
  const ce = Spec.ceHeight - Spec.reefDrop * mainReefs(s) - (stormJib(s) ? Spec.stormDrop : 0);
  const sail = (main) => {
    // mentre si prende una mano (o si cambia il fiocco) la drizza e' lasca: la vela sbandiera
    const changing = main ? s.reefTimer > 0 : s.jibTimer > 0;
    const limit = changing ? 180 : sheetAngle(main, main ? s.mainSheet : s.jibSheet);
    const side = main ? s.mainSide : s.jibSide;
    const area = main ? Spec.mainArea * Spec.reefArea[mainReefs(s)] : Spec.jibArea * (stormJib(s) ? Spec.stormJibArea : 1);
    const target = main && s.backMain ? s.backMain * s.backAng : side * (side === leeSide ? Math.min(limit, absAwa) : limit);
    let ang = main ? s.mainAngle : s.jibAngle;
    ang += (target - ang) * Math.min(1, (main ? 3.5 : 6) * dt);
    const chord = 180 - ang;
    const delta = norm180(s.awa + 180 - chord);
    const alpha = Math.abs(delta);
    const { cl, cd } = coefficients(alpha);
    const sg = delta >= 0 ? 1 : -1;
    // in poppa la randa copre il fiocco che sta dalla sua stessa parte: prende poco vento e si affloscia
    const blanket = !main && side === s.mainSide ? clamp((absAwa - 135) / 35, 0, 1) : 0;
    const qs = q * (1 - 0.85 * blanket);
    const fx = (-flow.y * sg * cl + flow.x * cd) * qs * area;
    const fy = (flow.x * sg * cl + flow.y * cd) * qs * area;
    const luff = Math.max(alpha < 4 ? clamp((4 - alpha) / 4, 0, 1) : 0, blanket * 0.7);
    // il vento spinge la vela verso l'interno (preme sulla faccia esterna): e' scontrata
    const c = rad(chord), push = (fx * Math.sin(c) - fy * Math.cos(c)) * side;
    return { ang, alpha, fx, fy, luff, blanket, push: -push, backed: push < -1 };
  };
  const m = sail(true), j = sail(false);
  s.mainAngle = m.ang; s.mainAlpha = m.alpha; s.mainLuff = m.luff;
  s.mainBacked = s.backMain !== 0 && m.backed;
  s.mainPush = m.push;
  s.jibAngle = j.ang; s.jibAlpha = j.alpha; s.jibLuff = j.luff; s.jibBlanket = j.blanket;
  let fx = m.fx + j.fx, fy = m.fy + j.fy, yaw = 0;
  // resistenza aerodinamica di scafo, albero ed equipaggio
  const wk = q / heelK * 1.2;
  fx += flow.x * wk; fy += flow.y * wk;
  yaw += 0.8 * flow.y * wk;
  s.drive = fx;
  // bilanciamento: la randa fa orzare, il fiocco poggiare; sbandata: la barca orza
  yaw += Spec.mainX * m.fy + Spec.jibX * j.fy;
  // la spinta della randa agisce sul boma, fuori dall'asse: col boma fuori bordo fa girare la barca
  // (avanti in poppa la fa orzare; scontrata, all'indietro, la prua va dalla parte del boma)
  yaw -= Math.sin(rad(m.ang)) * Spec.mainCeAlong * m.fx;
  yaw += -ce * Math.sin(rad(s.heel)) * fx * 0.9;

  // scafo e chiglia
  const u = s.u, v = s.v;
  const ratio = Math.abs(u) / Spec.hullSpeed;
  let hullX = u >= 0
    ? -(Spec.hullQuad * u * u + Spec.hullWall * ratio ** Spec.hullWallExp + Spec.hullLin * u)
    : -(Spec.asternQuad * u * Math.abs(u) + Spec.asternLin * u);
  hullX *= 1 + Math.abs(s.heel) / 90;
  const [k1, k2, k3] = Spec.keelLift;
  const keelLift = -k1 * Math.abs(u) * v - k2 * v * Math.abs(v) - k3 * v;
  hullX -= Spec.keelInduced * keelLift * keelLift / Math.max(0.3, u * u);

  // timone
  const flowR = Math.abs(u) + 0.15;
  const rudderAlpha = s.rudder - deg(Math.atan2(rad(s.r) * 1.5, flowR));
  const ra = Math.abs(rudderAlpha);
  let rcl = ra < 25 ? ra * 0.055 : Math.max(0.45, 1.375 - (ra - 25) * 0.04);
  rcl *= rudderAlpha >= 0 ? 1 : -1;
  const grip = Math.cos(rad(Math.min(70, Math.abs(s.heel)))) ** 2;
  const rq = 0.5 * RHO_WATER * 0.45 * u * Math.abs(u) * grip;
  const rudderLift = rcl * rq;
  yaw += rudderLift * 3.4;
  hullX -= Math.abs(rcl) * 0.08 * Math.abs(rq);
  const rr = rad(s.r);
  yaw -= 3800 * Math.abs(u) * rr + 4000 * rr * Math.abs(rr) + 900 * rr;

  // integrazione nel piano
  const m0 = Spec.mass, my = m0 * 1.6;
  const du = (fx + hullX + 0.5 * my * v * rr) / m0;
  const dv = (fy + keelLift - rudderLift * 0.3 - m0 * u * rr) / my;
  s.u += du * dt;
  s.v += dv * dt;
  s.r += deg(yaw / Spec.yawInertia * dt);
  s.heading = norm360(s.heading + s.r * dt);
  const f2 = dirVec(s.heading), s2 = dirVec(s.heading + 90);
  s.pos = { x: s.pos.x + (f2.x * s.u + s2.x * s.v) * dt, y: s.pos.y + (f2.y * s.u + s2.y * s.v) * dt };

  // sbandamento, con l'equipaggio che si sposta sopravento
  const want = clamp(-s.heel / 10, -1, 1);
  s.crew += (want - s.crew) * Math.min(1, 0.6 * dt);
  const heelMoment = fy * (ce + Spec.clrDepth) * Math.cos(rad(s.heel));
  const h = rad(s.heel);
  const gz = Spec.gzArm * Math.sin(h) * (1 - Math.min(1, Math.abs(h) / rad(120)) ** 2 * 0.6);
  const righting = -Spec.mass * 9.81 * gz - s.crew * Spec.crewWeight * 9.81 * Math.cos(h);
  const damping = -Spec.heelDamping * rad(s.heelRate);
  s.heelRate += deg((heelMoment + righting + damping) / Spec.heelInertia * dt);
  s.heel += s.heelRate * dt;
  if (Math.abs(s.heel) > 55) { s.heel = 55 * Math.sign(s.heel); s.heelRate = 0; }
  return events;
}
