// Prove automatiche della fisica e della simulazione (come --selftest della versione Mac).
// Uso: node test/selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Wind, newBoat, step, idealSheets, norm180, norm360, clamp, speedKn, twaOf, dirVec, len, sub, add, mul, SAIL_PLANS } from '../js/physics.js';
import { Lake } from '../js/lake.js';
import { Simulation, Coach, COURSE, WINDS } from '../js/sim.js';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
let failures = 0;
const check = (ok, what) => { console.log((ok ? '  ok   ' : '  ERRORE ') + what); if (!ok) failures++; };
const f1 = (x) => x.toFixed(1), f0 = (x) => x.toFixed(0);

const steady = (kn) => { const w = new Wind(kn, 0); w.shifts = false; return w; };
const hold = (s, twa) => { s.rudder = clamp(norm180(twaOf(s) - twa) * 1.2 - s.r * 0.8, -25, 25); };
function run(s, w, secs, trim = true, f = null) {
  const ev = [];
  for (let i = 0; i < secs * 120; i++) {
    if (f) f(s);
    if (trim) { const id = idealSheets(s); s.mainSheet = id.main; s.jibSheet = id.jib; }
    ev.push(...step(s, w, 1 / 120));
  }
  return ev;
}
function speed(tws, twa) {
  const w = steady(tws), s = newBoat();
  s.heading = norm360(-twa);
  run(s, w, 70, true, (b) => hold(b, twa));
  let acc = 0, heel = 0, n = 0;
  run(s, w, 20, true, (b) => { hold(b, twa); acc += speedKn(b); heel += Math.abs(b.heel); n++; });
  return { kn: acc / n, heel: heel / n };
}

console.log('Polare con vele regolate (nodi / sbandamento):');
for (const tws of [6, 10, 15, 20]) {
  console.log(`  ${tws} kn: ` + [45, 60, 90, 120, 150, 180].map((a) => { const r = speed(tws, a); return `${a}°=${f1(r.kn)}/${f0(r.heel)}°`; }).join('  '));
}
// confronto con la polare ORC della Protagonist 7.50 (mediana di 16 certificati): dalla bolina al traverso
const near = (x, ref, tol) => Math.abs(x - ref) / ref <= tol;
let beat10 = { vmg: 0 };
for (let a = 34; a <= 46; a += 2) { const r = speed(10, a), v = r.kn * Math.cos(a * Math.PI / 180); if (v > beat10.vmg) beat10 = { a, vmg: v }; }
check(near(beat10.vmg, 4.44, 0.07) && Math.abs(beat10.a - 37.8) <= 4, `bolina 10 nodi: VMG ${beat10.vmg.toFixed(2)} a ${beat10.a}° (ORC 4.44 a 37.8°)`);
for (const [tws, twa, ref] of [[6, 60, 5.65], [10, 60, 6.45], [10, 90, 6.83], [16, 75, 7.29]]) {
  const r = speed(tws, twa);
  check(near(r.kn, ref, 0.07), `${tws} nodi a ${twa}°: ${r.kn.toFixed(2)} kn (ORC ${ref})`);
}
// con lo spinnaker: lasco e poppa
const spiAt = (tws, twa) => {
  const w = steady(tws), b = newBoat(); b.heading = norm360(-twa); b.u = 3.5;
  Object.assign(b, { spi: 1, spiUp: 1, jibFurl: 1, spiSide: 1 });
  let acc = 0, n = 0;
  run(b, w, 40, true, (x) => hold(x, twa));
  run(b, w, 10, true, (x) => { hold(x, twa); acc += speedKn(x); n++; });
  return acc / n;
};
for (const [tws, twa, ref] of [[10, 120, 7.03], [14, 150, 7.41], [14, 120, 8.2]]) {
  const kn = spiAt(tws, twa);
  check(near(kn, ref, 0.07), `con lo spi, ${tws} nodi a ${twa}°: ${kn.toFixed(2)} kn (ORC ${ref})`);
}
let run10 = { vmg: 0 };
for (let a = 140; a <= 178; a += 6) { const v = -spiAt(10, a) * Math.cos(a * Math.PI / 180); if (v > run10.vmg) run10 = { a, vmg: v }; }
check(near(run10.vmg, 5.25, 0.07) && run10.a < 172, `poppa con lo spi, 10 nodi: VMG ${run10.vmg.toFixed(2)} a ${run10.a}° (ORC 5.25 a 154.6°)`);
check(speed(6, 45).heel < speed(15, 45).heel, "piu' vento, piu' sbandamento");

const w = steady(10);
// virata
let s = newBoat(); s.heading = 315;
run(s, w, 50, true, (b) => hold(b, 45));
const before = speedKn(s);
let minSpd = 99;
const ev = run(s, w, 30, true, (b) => {
  b.rudder = twaOf(b) > -38 ? 25 : clamp(norm180(twaOf(b) + 45) * 1.2 - b.r * 0.8, -25, 25);
  minSpd = Math.min(minSpd, speedKn(b));
});
check(twaOf(s) < -35 && twaOf(s) > -60, `virata riuscita, ora mure a sinistra (twa ${f0(twaOf(s))})`);
check(ev.some((e) => e.type === 'tack'), 'evento virata');
check(minSpd < before * 0.8 && minSpd > 1, `in virata la barca rallenta (${f1(before)} → min ${f1(minSpd)} kn)`);
check(speedKn(s) > before * 0.75, `dopo 30 s ha ripreso velocità (${f1(speedKn(s))} kn)`);
// prua al vento
s = newBoat(); s.heading = 315;
run(s, w, 30, true, (b) => hold(b, 45));
run(s, w, 40, false, (b) => { b.mainSheet = 1; b.jibSheet = 1; hold(b, 0); });
check(Math.abs(speedKn(s)) < 1.2 && s.mainLuff > 0.5, `prua al vento si ferma e le vele sbattono (${f1(speedKn(s))} kn)`);
// scotte lascate al traverso
s = newBoat(); s.heading = 270;
run(s, w, 40);
const good = speedKn(s);
run(s, w, 30, false, (b) => { b.mainSheet = 1; b.jibSheet = 1; hold(b, 90); });
check(s.mainLuff > 0.5 && speedKn(s) < good * 0.5, `scotte lascate: vele che sbattono, ${f1(good)} → ${f1(speedKn(s))} kn`);
// strambata involontaria e controllata
s = newBoat(); Object.assign(s, { heading: 190, u: 2, mainSide: 1, jibSide: 1, mainAngle: 80 });
run(s, w, 40, true, (b) => hold(b, -165));
let gy = run(s, w, 20, true, (b) => hold(b, 160));
check(gy.some((e) => e.type === 'gybe' && e.violent) && s.mainSide < 0, 'al lee con la randa lascata il boma passa di colpo');
s = newBoat(); Object.assign(s, { heading: 190, u: 2, mainSide: 1, mainAngle: 80 });
run(s, w, 40, true, (b) => hold(b, -165));
gy = run(s, w, 20, false, (b) => { b.mainSheet = 0.05; hold(b, 160); });
check(gy.some((e) => e.type === 'gybe' && !e.violent), 'strambata controllata con la randa cazzata');
// bilanciamento
const drift = [true, false].map((mainOnly) => {
  const b0 = newBoat(); b0.heading = 270; b0.u = 2.5;
  run(b0, w, 12, false, (b) => { const i = idealSheets(b); b.mainSheet = mainOnly ? i.main : 1; b.jibSheet = mainOnly ? 1 : i.jib; b.rudder = 0; });
  return twaOf(b0);
});
check(drift[0] < 85 && drift[1] > drift[0] + 8, `solo randa orza (90° → ${f0(drift[0])}°), solo fiocco poggia (→ ${f0(drift[1])}°)`);
// vento forte
s = newBoat(); s.heading = 300; s.u = 2;
let maxHeel = 0;
run(s, steady(22), 25, false, (b) => { b.mainSheet = 0; b.jibSheet = 0; b.rudder = 0; maxHeel = Math.max(maxHeel, Math.abs(b.heel)); });
check(maxHeel > 30 && Math.abs(twaOf(s)) < 40, `22 nodi, tutto cazzato: sbanda ${f0(maxHeel)}° e va all'orza`);
// retromarcia
s = newBoat(); Object.assign(s, { heading: 0, u: -0.8, mainSheet: 1, jibSheet: 1 });
run(s, w, 4, false, (b) => { b.rudder = 25; b.mainSheet = 1; b.jibSheet = 1; });
check(norm180(s.heading) < 0, "all'indietro con la barra a dritta la prua va a sinistra");

// terzaroli: con vento forte la barca sbanda meno
const heelWith = (reefs, kn = 20) => {
  const ww = steady(kn), b = newBoat(); b.heading = norm360(-55); b.reef = reefs;
  run(b, ww, 60, true, (x) => hold(x, 55));
  let h = 0, k = 0, n = 0;
  run(b, ww, 15, true, (x) => { hold(x, 55); h += Math.abs(x.heel); k += speedKn(x); n++; });
  return { heel: h / n, kn: k / n };
};
const r0 = heelWith(0), r2 = heelWith(2);
check(r2.heel < r0.heel - 3 && r2.kn > r0.kn * 0.8, `20 nodi: piena ${f0(r0.heel)}° ${f1(r0.kn)} kn, due mani ${f0(r2.heel)}° ${f1(r2.kn)} kn`);
const at30 = [0, 1, 2, 3].map((r) => heelWith(r, 30));
console.log('  30 nodi di bolina larga: ' + at30.map((x, i) => `${SAIL_PLANS[i]} ${f0(x.heel)}° ${f1(x.kn)} kn`).join(' · '));
check(at30[3].heel < at30[2].heel && at30[2].heel < at30[0].heel && at30[3].heel < 30 && at30[3].kn > 4,
  `30 nodi: con due mani e tormentina la barca resta governabile (${f0(at30[3].heel)}°, ${f1(at30[3].kn)} kn)`);

// lago
const lake = await Lake.load(async (name) => { const b = readFileSync(dataDir + name); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); });
check(lake.rings.length > 10 && lake.rings[0].length > 500, `contorno del lago (${lake.rings[0].length} punti, ${lake.rings.length - 1} isole)`);
const behind = mul(dirVec(lake.shoreOut + 180), 30);
check(lake.height(behind.x, behind.y) > 0, `alle spalle della base c'è la spiaggia (${f1(lake.height(behind.x, behind.y))} m)`);
check(lake.depth(lake.center) > 40, `centro del campo in acqua profonda (${f0(lake.depth(lake.center))} m)`);
let trees = 0; for (const _ of lake.trees()) trees++;
let houses = 0; for (const _ of lake.houses()) houses++;
check(trees > 50000 && houses > 2000, `${trees} alberi e ${houses} case`);
const sim = new Simulation(lake);
check(lake.depth(sim.boat.pos) > 3 && sim.marks.every((m) => lake.depth(m) > 15), 'si parte in acqua davanti alla base, boe in acqua libera');
// secca
const simG = new Simulation(lake);
simG.boat.heading = norm360(lake.shoreOut + 180); simG.boat.u = 2.5;
let grounded = false;
for (let i = 0; i < 90 * 30; i++) {
  simG.update(1 / 30, { tillerTarget: clamp(-norm180(simG.boat.heading - norm360(lake.shoreOut + 180)) * 1.2, -25, 25) });
  if (simG.events.some((e) => e.type === 'ground')) grounded = true;
}
check(grounded, 'puntando la riva la barca va in secca e si ferma');
// giro delle boe: la barca passa intorno a ogni boa a 15 m, in senso antiorario (o orario per sbagliare)
const around = (sm, mark, from, to, leave = true) => {
  for (let i = 0; i <= 60; i++) {
    const a = (from + (to - from) * i / 60) * Math.PI / 180;
    sm.boat.pos = { x: mark.x + 15 * Math.cos(a), y: mark.y + 15 * Math.sin(a) };
    sm.update(1 / 10, {});
  }
  if (leave) { sm.boat.pos = { ...lake.center }; sm.update(1 / 10, {}); }
};
const simC = new Simulation(lake);
const order = [];
for (let k = 0; k < 4; k++) {
  order.push(simC.nextMark);
  for (let i = 0; i < 20 * 10; i++) simC.update(1 / 10, {});         // il giro dura un po'
  around(simC, simC.marks[COURSE[k % 3]], -60, 120);
}
check(order.join() === '0,2,1,0' && simC.lastLap !== null, `giro delle boe in senso antiorario, in ordine (${simC.lastLap | 0} s)`);
const simW = new Simulation(lake);
around(simW, simW.marks[0], 120, -60, false);
check(simW.nextMark === 0 && simW.wrongWay, 'girata in senso orario la boa non vale');
const turn = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
check(turn(simW.marks[0], simW.marks[2], simW.marks[1]) > 0, 'bolina, traverso e poppa formano un triangolo antiorario');
// tre minuti con raffiche
const simL = new Simulation(lake);
simL.settings.windIndex = 2; simL.reset(); simL.boat.pos = { ...lake.center }; simL.autoTrim = true;
let path = 0, finite = true;
for (let i = 0; i < 180 * 60; i++) {
  const target = i < 5000 ? 60 : -140, p0 = { ...simL.boat.pos };
  simL.update(1 / 60, { tillerTarget: clamp(norm180(twaOf(simL.boat) - target) * 1.2 - simL.boat.r * 0.8, -25, 25) });
  path += len(sub(simL.boat.pos, p0));
  if (!Number.isFinite(simL.boat.pos.x) || !Number.isFinite(simL.boat.heel)) { finite = false; break; }
}
check(finite && path > 400, `3 minuti con raffiche: tutto regolare (${f0(path)} m)`);
simL.startReplay(); simL.update(1, {});
check(simL.replay !== null && Math.abs(simL.shown.time - (simL.time - 19.5)) < 1, 'moviola');
check(Coach.tips(sim.boat, lake).length > 0 && Coach.pointOfSail(90) === 'TRAVERSO', 'consigli e andature');
const simR = new Simulation(lake);
simR.reef(1); simR.update(1, {});
check(simR.boat.reef === 1 && simR.boat.mainLuff > 0.5, 'mentre si prende la mano la randa sbatte');
const simT = new Simulation(lake);
simT.boat.reef = 2; simT.reef(1); simT.update(1, {});
check(simT.boat.reef === 3 && simT.boat.jibLuff > 0.5 && simT.boat.mainLuff < 0.5, 'issando la tormentina sbatte il fiocco, non la randa');
const lawn = lake.basePoint(-60, -12);
check(lake.height(lawn.x, lawn.y) > 0.5 && lake.height(lawn.x, lawn.y) < 3 && lake.base.moorings.length >= 18, `prato della base a ${f1(lake.height(lawn.x, lawn.y))} m, ${lake.base.moorings.length} barche all'ormeggio`);
const simM = new Simulation(lake), m0 = lake.base.moorings[0];
simM.boat.pos = add(lake.mooredCenter(m0, simM.wind.direction), { x: 0, y: 1 }); simM.boat.u = 2.5;
simM.update(1 / 30, {});
check(simM.boat.u < 1 && simM.message.includes('ORMEGGIO'), "urtando una barca all'ormeggio ci si ferma");
// vele in bando al traverso: le scotte corrono fuori e la barca rallenta; riprese, riparte
const simB = new Simulation(lake);
simB.settings.gusts = false; simB.reset(); simB.wind.shifts = false;          // vento fermo: la prova non dipende dal caso
simB.boat.pos = add(lake.center, mul(dirVec(simB.wind.baseDir + 180), 120)); simB.autoTrim = true;     // lontano dalle boe
const steer = (sm) => ({ tillerTarget: clamp(norm180(twaOf(sm.boat) - 90) * 1.2 - sm.boat.r * 0.8, -25, 25) });
for (let i = 0; i < 40 * 60; i++) simB.update(1 / 60, steer(simB));
const bandoFrom = speedKn(simB.boat);
simB.toggleBando();
for (let i = 0; i < 25 * 60; i++) simB.update(1 / 60, steer(simB));
const bandoSpd = speedKn(simB.boat);
check(simB.boat.mainSheet === 1 && simB.boat.jibSheet === 1 && bandoSpd < bandoFrom * 0.5,
  `vele in bando: scotte tutte fuori, la barca rallenta (${f1(bandoFrom)} → ${f1(bandoSpd)} kn)`);
check(Coach.tips(simB.boat, lake).some(([t]) => t.includes('bando')), "l'istruttore spiega il bando");
simB.toggleBando();
for (let i = 0; i < 30 * 60; i++) simB.update(1 / 60, steer(simB));
check(!simB.boat.bando && speedKn(simB.boat) > bandoFrom * 0.85, `riprese le scotte riparte (${f1(speedKn(simB.boat))} kn)`);
simB.toggleBando(); simB.autoTrim = false;
simB.update(0.1, { main: 1 });
check(!simB.boat.bando, 'cazzando la randa si esce dal bando');
// randa scontrata: da fermi prua al vento, vento costante, lontano dalle boe
{
const irons = (kn) => {
  const sm = new Simulation(lake);
  sm.settings.gusts = false; sm.settings.windIndex = WINDS.findIndex((x) => x[1] === kn); sm.reset(); sm.wind.shifts = false;
  sm.boat.pos = add(lake.center, mul(dirVec(sm.wind.baseDir + 180), 120));
  Object.assign(sm.boat, { heading: norm360(sm.wind.baseDir + 3), u: 0, v: 0, r: 0, heel: 0, heelRate: 0, rudder: 0 });
  sm.autoTrim = true;
  return sm;
};
const secs = (sm, t, rudder = 0) => { for (let i = 0; i < t * 60; i++) sm.update(1 / 60, { tillerTarget: rudder }); };
const turned = (sm, h0) => norm180(sm.boat.heading - h0);
const adrift = irons(10); secs(adrift, 6);
const back = irons(10), h0 = back.boat.heading;
back.toggleBackMain(1); secs(back, 4);
const backedNow = back.boat.mainBacked;
secs(back, 2);
check(backedNow && back.boat.u < adrift.boat.u * 2 && back.boat.u < -0.5 && turned(back, h0) > 20,
  `randa scontrata a dritta: indietro a ${f1(-back.boat.u / 0.5144)} kn (scadendo ${f1(-adrift.boat.u / 0.5144)}), la prua cade a dritta di ${f0(turned(back, h0))}°`);
const astern = irons(10), h1 = astern.boat.heading;
astern.toggleBackMain(1); secs(astern, 16, 30);
check(astern.boat.u < -0.5 && Math.abs(turned(astern, h1)) < 35, `col timone al contrario si va indietro quasi dritti (${f0(turned(astern, h1))}° in 16 s)`);
while (Math.abs(twaOf(back.boat)) < 65) secs(back, 0.5);
back.toggleBackMain(0);
let tacked = false;
for (let i = 0; i < 25 * 60; i++) { back.update(1 / 60, { tillerTarget: clamp(norm180(twaOf(back.boat) + 80) * 1.2 - back.boat.r * 0.8, -25, 25) }); if (back.events.some((e) => e.type === 'tack' || e.type === 'gybe')) tacked = true; }
check(!tacked && speedKn(back.boat) > 3 && back.boat.mainSide === 1, `mollato il boma si riparte mure a sinistra (${f1(speedKn(back.boat))} kn), senza contare una virata`);
const strong = irons(20); strong.toggleBackMain(-1);
let fastest = 0, held = 90;
for (let i = 0; i < 10 * 60; i++) {
  strong.update(1 / 60, { tillerTarget: 0 });
  fastest = Math.min(fastest, strong.boat.u);
  if (strong.boat.mainBacked && i > 60) held = Math.min(held, strong.boat.backAng);
}
check(held < 40 && fastest > -1.8, `con 20 nodi chi spinge il boma cede (tenuto a ${f0(held)}°) e la retromarcia resta sotto i 3,5 nodi (${f1(-fastest / 0.5144)})`);
}
// andatura a farfalla: in poppa piena il fiocco coperto dalla randa rende poco, a farfalla prende vento pulito
{
  const runAt = (twa, wing) => {
    const w = steady(10), b = newBoat(); b.heading = norm360(-twa); b.farfalla = wing;
    let acc = 0, n = 0;
    run(b, w, 70, true, (x) => hold(x, twa));
    run(b, w, 20, true, (x) => { hold(x, twa); acc += speedKn(x); n++; });
    return { kn: acc / n, b };
  };
  const dead = runAt(178, false), wing = runAt(178, true), broad = runAt(150, false), broadWing = runAt(150, true);
  check(dead.b.jibBlanket > 0.8 && wing.b.jibSide === -wing.b.mainSide && wing.kn > dead.kn * 1.05,
    `in poppa piena a farfalla si va più forte (${f1(dead.kn)} → ${f1(wing.kn)} kn), il fiocco non è più coperto`);
  check(broad.kn > broadWing.kn, `al gran lasco conviene il fiocco dalla parte della randa (${f1(broad.kn)} contro ${f1(broadWing.kn)} kn)`);
  const sm = new Simulation(lake);
  sm.toggleFarfalla();
  check(!sm.boat.farfalla && sm.message.includes('POPPA'), 'al traverso la farfalla non si può fare');
  const b = wing.b, w = steady(10);
  const ev = run(b, w, 25, true, (x) => hold(x, 115));
  check(!b.farfalla && ev.some((e) => e.type === 'wingEnd') && b.jibSide === b.mainSide, 'orzando oltre i 140° il fiocco si chiude e torna sottovento');
}
// spinnaker: issata e ammainata, fiocco avvolto, si chiude orzando, strambata col tangone, straorzata
{
  const make = (kn, twa) => {
    const sm = new Simulation(lake);
    sm.settings.gusts = false; sm.settings.windIndex = WINDS.findIndex((x) => x[1] === kn); sm.reset(); sm.wind.shifts = false;
    sm.boat.pos = add(lake.center, mul(dirVec(sm.wind.baseDir), 150));          // sopravento, con spazio per scendere
    Object.assign(sm.boat, { heading: norm360(sm.wind.baseDir - twa), u: 3, v: 0, r: 0, heel: 0 });
    sm.autoTrim = true;
    sm.update(1 / 60, {});                                    // un passo: la barca "sente" il vento
    return sm;
  };
  const sail = (sm, twa, t) => { const ev = [];
    for (let i = 0; i < t * 60; i++) { sm.update(1 / 60, { tillerTarget: clamp(norm180(twaOf(sm.boat) - twa) * 1.2 - sm.boat.r * 0.8, -25, 25) }); ev.push(...sm.events); }
    return ev; };
  const up = make(10, 45); up.toggleSpi();
  check(!up.boat.spi && up.message.includes('POGGIA'), 'di bolina lo spi non si issa');
  const a = make(10, 135), b = make(10, 135);
  sail(a, 135, 25); b.toggleSpi(); sail(b, 135, 25);
  check(b.boat.spiUp === 1 && b.boat.jibFurl === 1 && speedKn(b.boat) > speedKn(a.boat) * 1.1,
    `con lo spi il fiocco si avvolge e si va più forte (${f1(speedKn(a.boat))} → ${f1(speedKn(b.boat))} kn a 135°)`);
  sail(b, 55, 15);
  check(b.boat.spiLuff > 0.5 && Coach.tips(b.boat, lake).some(([t]) => t.includes('spi si chiude')), "orzando troppo lo spi si chiude e l'istruttore lo dice");
  const g = make(10, 150); g.toggleSpi(); sail(g, 150, 15);
  const ev = sail(g, -150, 20);
  check(ev.some((e) => e.type === 'spiGybe') && g.boat.spiSide === (g.boat.awa >= 0 ? 1 : -1), 'strambando con lo spi si passa il tangone dall\'altra parte');
  const br = make(30, 95); br.toggleSpi();
  const evb = sail(br, 95, 20);
  check(evb.some((e) => e.type === 'broach'), 'con 30 nodi al traverso con lo spi si straorza');
  b.toggleSpi(); sail(b, 135, 8);
  check(b.boat.spiUp === 0 && b.boat.jibFurl === 0, 'ammainato lo spi il fiocco si srotola');
}
// fiocco in cappa: l'allievo lasca la randa e mette il timone all'orza, la barca si ferma e scarroccia
{
  const make = (kn, twa) => {
    const sm = new Simulation(lake);
    sm.settings.gusts = false; sm.settings.windIndex = WINDS.findIndex((x) => x[1] === kn); sm.reset(); sm.wind.shifts = false;
    sm.boat.pos = add(lake.center, mul(dirVec(sm.wind.baseDir + 180), 150));
    Object.assign(sm.boat, { heading: norm360(sm.wind.baseDir - twa), u: 2.5, v: 0, r: 0, heel: 0 });
    sm.autoTrim = true;
    for (let i = 0; i < 15 * 60; i++) sm.update(1 / 60, { tillerTarget: clamp(norm180(twaOf(sm.boat) - twa) * 1.2 - sm.boat.r * 0.8, -25, 25) });
    return sm;
  };
  const run = make(10, 150); run.toggleCappa();
  check(!run.boat.cappa && run.message.includes('ORZA'), 'in poppa la cappa non si fa');
  for (const kn of [10, 20]) {
    const h = make(kn, 55); h.toggleCappa();
    const ws = h.boat.cappa;
    h.autoTrim = false; h.boat.mainSheet = 0.55;                       // l'allievo lasca la randa...
    let ev = [];
    for (let i = 0; i < 60 * 60; i++) { h.update(1 / 60, { tillerTarget: 12 * ws }); ev.push(...h.events); }   // ...e mette il timone all'orza
    const b = h.boat, fwd = b.u / 0.5144, drift = Math.abs(b.v) / 0.5144;
    check(b.cappa === ws && b.jibBacked && fwd > 0.2 && fwd < 2 && drift > 0.2 && Math.abs(twaOf(b)) > 45 && Math.abs(twaOf(b)) < 80
      && Coach.tips(b, lake).some(([t]) => t.includes('Barca in cappa')),
      `${kn} nodi in cappa: avanza a ${f1(fwd)} kn, scarroccia di ${f1(drift)}, a ${f0(Math.abs(twaOf(b)))}° dal vento`);
  }
  const auto = make(10, 55); auto.toggleCappa(); auto.update(1 / 60, {});
  check(auto.message.includes('VELE MANUALI') && Coach.tips(auto.boat, lake).some(([t]) => t.includes('randa va lascata')), "con le vele automatiche l'istruttore dice di lascare la randa");
  // col fiocco a collo la barca fatica a passare il vento; se ci riesce (qui la si mette sull'altro bordo) la cappa e' finita
  const tk = make(10, 55); tk.toggleCappa();
  tk.boat.heading = norm360(2 * tk.boat.twd - tk.boat.heading);
  let ended = false;
  for (let i = 0; i < 60; i++) { tk.update(1 / 60, {}); if (tk.events.some((e) => e.type === 'cappaEnd')) ended = true; }
  check(ended && !tk.boat.cappa && tk.message.includes('VIRATO'), 'se la barca vira il fiocco non è più in cappa');
  const go = make(10, 55); go.toggleCappa(); go.autoTrim = false; go.boat.mainSheet = 0.55;
  for (let i = 0; i < 30 * 60; i++) go.update(1 / 60, { tillerTarget: 12 * go.boat.cappa });
  go.toggleCappa(); go.autoTrim = true;
  for (let i = 0; i < 30 * 60; i++) go.update(1 / 60, { tillerTarget: clamp(norm180(twaOf(go.boat) - 60 * Math.sign(twaOf(go.boat))) * 1.2 - go.boat.r * 0.8, -25, 25) });
  check(!go.boat.cappa && speedKn(go.boat) > 4, `liberato il fiocco si riparte (${f1(speedKn(go.boat))} kn)`);
}

console.log(failures === 0 ? 'TUTTO OK' : `${failures} ERRORI`);
process.exit(failures === 0 ? 0 : 1);
