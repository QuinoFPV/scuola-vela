// Prove automatiche della fisica e della simulazione (come --selftest della versione Mac).
// Uso: node test/selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Wind, newBoat, step, idealSheets, norm180, norm360, clamp, speedKn, twaOf, dirVec, len, sub, add, mul, bearing, SAIL_PLANS, byLee } from '../js/physics.js';
import { Lake } from '../js/lake.js';
import { Simulation, Coach, COURSE, WINDS, MOB, mobPlan, GAV, gavPlan, CALL } from '../js/sim.js';
import { speechText, Voice } from '../js/voice.js';
import { heardCommands, Ear } from '../js/listen.js';
import { LESSONS, LessonRun, placeForLesson, lessonWindIndex } from '../js/lessons.js';

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
// false mure: in poppa con la randa dalla parte del vento; poggiando ancora il boma passa da solo
{
  const w = steady(10), b = newBoat();
  b.heading = norm360(-172);
  run(b, w, 40, true, (x) => hold(x, 172));
  check(byLee(b) === 0 && !Coach.tips(b, lake).some(([t]) => t.includes('False mure')), `in poppa con la randa sottovento le mure sono giuste (${f0(twaOf(b))}°)`);
  const side = b.mainSide;
  run(b, w, 12, true, (x) => hold(x, -174));
  check(b.mainSide === side && byLee(b) > 2 && Coach.tips(b, lake).some(([t]) => t.includes('False mure')),
    `passato il vento in poppa, randa ancora dalla stessa parte: false mure di ${f0(byLee(b))}° e l'istruttore lo dice`);
  const ev = run(b, w, 12, true, (x) => hold(x, -150));
  check(ev.some((e) => e.type === 'gybe') && byLee(b) === 0, 'poggiando ancora il boma passa da solo (strambata involontaria) e le mure tornano giuste');
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

// uomo a mare: il salvagente vola dalla poppa, scarroccia col vento e si afferra solo arrivando quasi fermi
{
  const make = (kn = 10) => {
    const sm = new Simulation(lake);
    sm.settings.gusts = false; sm.settings.windIndex = WINDS.findIndex((x) => x[1] === kn); sm.reset(); sm.wind.shifts = false;
    sm.boat.pos = add(lake.center, mul(dirVec(sm.wind.baseDir + 180), 60));
    Object.assign(sm.boat, { heading: norm360(sm.wind.baseDir - 50), u: 3, v: 0, r: 0, heel: 0, twd: sm.wind.baseDir, tws: kn });
    sm.autoTrim = true;
    return sm;
  };
  const near = (sm, along, across, u) => {
    const b = sm.boat, f = dirVec(b.heading), st = dirVec(b.heading + 90);
    Object.assign(b, { u, v: 0, r: 0 });
    sm.mob.fly = 0; sm.mob.pos = add(b.pos, add(mul(f, along), mul(st, across)));
  };
  const sm = make();
  sm.manOverboard();
  const throwAt = { ...sm.boat.pos };
  check(sm.mob && sm.message.includes('UOMO A MARE') && Coach.tips(sm.boat, lake, sm.mob).some(([x]) => x.includes('allontanati')), "uomo a mare: salvagente lanciato, l'istruttore dice di allontanarsi");
  for (let i = 0; i < 60; i++) sm.update(1 / 60, {});
  const landed = { ...sm.mob.pos };
  check(sm.mob.fly === 0 && len(sub(landed, throwAt)) < 9, `il salvagente cade a poppa (${f1(len(sub(landed, throwAt)))} m dal lancio)`);
  sm.boat.pos = add(sm.boat.pos, mul(dirVec(sm.wind.baseDir), 300));          // la barca si toglie di mezzo
  for (let i = 0; i < 60 * 60; i++) sm.update(1 / 60, {});
  const moved = sub(sm.mob.pos, landed), down = dirVec(sm.wind.baseDir + 180), along = moved.x * down.x + moved.y * down.y;
  check(along > 6 && along < 14 && along > len(moved) * 0.95, `scarroccia sottovento (${f1(along)} m in un minuto con 10 nodi)`);
  const fast = make(); fast.manOverboard(); near(fast, 0, -2.5, 2.6); fast.update(1 / 60, {});
  check(fast.mob && fast.message.includes('TROPPO VELOCE'), 'a 5 nodi non lo si afferra');
  const hit = make(); hit.manOverboard(); near(hit, 3, 0, 2.6); hit.update(1 / 60, {});
  const hrel = sub(hit.mob.pos, hit.boat.pos), hacross = Math.abs(hrel.x * dirVec(hit.boat.heading + 90).x + hrel.y * dirVec(hit.boat.heading + 90).y);
  check(hit.mob && hit.message.includes('INVESTITO') && hacross > 0.5, `preso di prua: investito e scostato dallo scafo (${f1(hacross)} m di lato)`);
  // twa > 0: vento da dritta, sottovento e' a sinistra (across < 0)
  const lee = make(); lee.manOverboard(); near(lee, 0.5, -2.6, 0.4); lee.update(1 / 60, {});
  check(!lee.mob && lee.lastMob !== null && lee.message.includes('RECUPERATO') && lee.message.includes('SOTTOVENTO') && lee.tone === 'good', 'quasi fermo, sottovento alle sartie: recuperato');
  const wnd = make(); wnd.manOverboard(); near(wnd, 0.5, 2.6, 0.4);
  const wtip = Coach.mobTip(wnd.boat, wnd.mob)[0];
  wnd.update(1 / 60, {});
  check(!wnd.mob && wnd.message.includes('SOPRAVENTO') && wnd.tone === 'good' && wtip.includes('scarroccia via'), "anche sopravento va bene: l'istruttore avvisa che la barca scarroccia via");
  const [p6, p10, p20] = [6, 10, 20].map(mobPlan);
  check(p6.stop > p10.stop && p10.stop > p20.stop && p10.away > p10.start && p10.start > p10.stop,
    `vele in bando a ${p6.stop} m con 6 nodi, ${p10.stop} con 10, ${p20.stop} con 20; con 10 nodi ci si allontana di ${p10.away} m e si risale da ${p10.start} m`);
  const off = make(); off.manOverboard(); off.manOverboard();
  check(!off.mob && off.message.includes('ANNULLATO'), 'di nuovo per annullare');
  // manovra completa con le distanze dell'istruttore: traverso, virata, gran lasco sotto al salvagente, bolina larga, bando
  for (const from of [90, 140]) {
    const fm = make(10), to = (twa) => ({ tillerTarget: clamp(norm180(twaOf(fm.boat) - twa) * 1.2 - fm.boat.r * 0.8, -25, 25) });
    fm.boat.pos = add(lake.center, mul(dirVec(fm.wind.baseDir + 180), 150));
    Object.assign(fm.boat, { heading: norm360(fm.wind.baseDir + from) });
    for (let i = 0; i < 20 * 60; i++) fm.update(1 / 60, to(-from));
    fm.manOverboard();
    const plan = mobPlan(10);
    let side = Math.sign(twaOf(fm.boat)), phase = 'via', t = 0;
    while (fm.mob && t < 240) {
      const b = fm.boat, rel = sub(fm.mob.pos, b.pos), d = len(rel), up = dirVec(b.twd);
      const above = rel.x * up.x + rel.y * up.y, off = norm180(bearing(rel) - b.twd);
      let c;
      if (phase === 'via') { c = to(90 * side); if (d >= plan.away) { phase = 'virata'; side = -side; } }
      else if (phase === 'virata') { c = to(45 * side); if (Math.sign(twaOf(b)) === side && Math.abs(twaOf(b)) > 35) phase = 'giu'; }
      else if (phase === 'giu') { c = to(150 * side); if (above > 10 && -off * side >= 55) phase = 'su'; }
      else {
        const aim = add(fm.mob.pos, mul(up, d > 15 ? 2 : 1));
        c = { tillerTarget: clamp(norm180(bearing(sub(aim, b.pos)) - b.heading) * 1.2 - b.r * 0.8, -25, 25) };
        if (d < plan.stop && !b.bando) fm.toggleBando();
        if (d < 10 && speedKn(b) > 2) c = to(30 * Math.sign(twaOf(b)));
      }
      fm.update(1 / 60, c); t += 1 / 60;
    }
    check(!fm.mob && fm.message.includes('RECUPERATO'), `manovra completa con 10 nodi partendo a ${from}°: via ${plan.away} m, vele in bando a ${plan.stop} m, recuperato in ${f0(t)} s`);
  }
  // avvicinamento vero: 90 m sottovento, di bolina larga verso il salvagente, vele in bando dove dice l'istruttore
  for (const kn of [10, 20]) {
    const ap = make(kn), ring = add(lake.center, mul(dirVec(ap.wind.baseDir + 180), 60)), from = norm360(ap.wind.baseDir + 180 + 58);     // da sottovento, 58° dal vento
    ap.boat.pos = add(ring, mul(dirVec(from), 90));
    Object.assign(ap.boat, { heading: norm360(from + 180), u: 3 });
    ap.manOverboard(); ap.mob.pos = ring; ap.mob.fly = 0;
    let t = 0, said = '', advised = false;
    while (ap.mob && t < 150) {
      const b = ap.boat, rel = sub(ap.mob.pos, b.pos), d = len(rel), up = dirVec(b.twd);
      const tip = Coach.tips(b, lake, ap.mob).map(([x]) => x).join(' ');
      const m = /a (\d+) m metti le vele in bando/.exec(tip);
      if (m) { said = m[1]; advised = true; }
      if (said && d < +said && !b.bando) ap.toggleBando();
      const aim = add(ap.mob.pos, mul(up, d > 15 ? 2 : 1));
      let c = { tillerTarget: clamp(norm180(bearing(sub(aim, b.pos)) - b.heading) * 1.2 - b.r * 0.8, -25, 25) };
      if (d < 10 && speedKn(b) > 2) c = { tillerTarget: clamp(norm180(twaOf(b) - 30 * Math.sign(twaOf(b))) * 1.2 - b.r * 0.8, -25, 25) };   // all'ultimo orza
      ap.update(1 / 60, c); t += 1 / 60;
    }
    check(advised && !ap.mob && ap.message.includes('RECUPERATO'), `${kn} nodi: di bolina larga, vele in bando a ${said} m, recuperato in ${f0(t)} s`);
  }
}

// gavitello: si risale di bolina, si orza prua al vento dove dice l'istruttore, si arriva per abbrivio e lo si prende a prua
{
  const g0 = lake.base.gav, st = lake.startPoint(), out = dirVec(lake.shoreOut), r0 = sub(g0, st);
  const fromStart = Math.abs(r0.x * out.y - r0.y * out.x);
  const moored = Math.min(...lake.base.moorings.map((m) => len(sub(m, g0))));
  check(lake.depth(g0) > 8 && fromStart > 40 && moored > 60, `gavitello in acqua libera: ${f0(lake.depth(g0))} m di fondo, ${f0(fromStart)} m dalla rotta di uscita, barca all'ormeggio più vicina a ${f0(moored)} m`);
  const make = (kn = 10, reef = 0) => {
    const sm = new Simulation(lake);
    sm.settings.gusts = false; sm.settings.windIndex = WINDS.findIndex((x) => x[1] === kn); sm.reset(); sm.wind.shifts = false;
    sm.autoTrim = true; sm.boat.reef = reef;
    sm.mooring();
    return sm;
  };
  // mette la barca vicino al gavitello: along metri avanti, across di lato (positivo a dritta), velocita' u
  const near = (sm, along, across, u, twa = 20) => {
    const b = sm.boat, W = sm.wind.baseDir;
    Object.assign(b, { heading: norm360(W - twa), u, v: 0, r: 0, twd: W, tws: sm.windKn });
    const f = dirVec(b.heading), s9 = dirVec(b.heading + 90);
    b.pos = sub(sm.gavPos, add(mul(f, along), mul(s9, across)));
  };
  const fast = make(); near(fast, 4.5, 0.6, 1.6); fast.update(1 / 60, {});
  check(!fast.gav.moored && fast.message.includes('TROPPO VELOCE'), 'a 3 nodi chi è a prua non riesce a prenderlo');
  const aft = make(); near(aft, -1, 2.4, 0.3); aft.update(1 / 60, {});
  check(!aft.gav.moored && aft.message.includes('A PRUA'), 'di fianco a poppa non si prende: si prende a prua');
  const off = make(); off.mooring();
  check(!off.gav && off.message.includes('ANNULLATO'), 'di nuovo per annullare');
  // il pilota fa come dice l'istruttore: bolina stretta fino alla linea del vento del gavitello (virando se la incrocia
  // troppo sotto), orza quando lo dice e libera le scotte quando lo dice
  const approach = (sm, side) => {
    const g = sm.gavPos, W = sm.wind.baseDir, plan = gavPlan(sm.windKn);
    sm.boat.pos = add(sub(g, mul(dirVec(W), plan.luff + 70)), mul(dirVec(W + 90), side * 45));
    let twa0 = side * 42, phase = 'bolina', tTack = -100, t = 0, luffAt = null, released = false;
    Object.assign(sm.boat, { heading: norm360(W - twa0), u: 2.5, mainSide: -side, jibSide: -side });
    sm.update(1 / 30, { tillerTarget: 0 });
    while (!sm.gav.moored && t < 150) {
      const b = sm.boat, U = dirVec(b.twd), P = dirVec(b.twd + 90), rel = sub(g, b.pos);
      const above = rel.x * U.x + rel.y * U.y, lat = rel.x * P.x + rel.y * P.y, coming = twa0 > 0 ? lat < 0 : lat > 0;
      const tip = Coach.gavTip(b, sm.gav)[0];
      if (phase === 'bolina' && t - tTack > 8) {
        if (tip.startsWith('Ora orza') && coming && Math.abs(lat) < 3.5) { phase = 'orza'; luffAt = len(rel); }
        else if (!coming && Math.abs(lat) > Math.max(6, (above - plan.luff) / 1.9)) { twa0 = -twa0; tTack = t; }
      }
      if (phase === 'orza' && tip.includes('lascia andare le scotte') && !b.bando) { sm.toggleBando(); released = true; }
      const hd = phase === 'orza' ? b.twd + clamp(norm180(bearing(rel) - b.twd), -15, 15) : b.twd - twa0;
      sm.update(1 / 30, { tillerTarget: clamp(norm180(hd - b.heading) * 1.2 - b.r * 0.8, -25, 25) });
      t += 1 / 30;
    }
    return { luffAt, released, t };
  };
  for (const [kn, reef] of [[6, 0], [10, 0], [15, 1], [20, 1]]) {
    const res = [-1, 1].map((side) => { const sm = make(kn, reef); return { ...approach(sm, side), sm }; });
    const ok = res.every((r) => r.sm.gav.moored && r.sm.message.includes('GAVITELLO PRESO'));
    check(ok, `${kn} nodi${reef ? ' con una mano' : ''}: orza a ${res.map((r) => f0(r.luffAt ?? 0)).join(' e ')} m (piano ${gavPlan(kn).luff}), ${res.some((r) => r.released) ? 'scotte libere quando lo dice, ' : ''}preso in ${res.map((r) => f0(r.t)).join(' e ')} s`);
  }
  // ormeggiati: la cima tiene la prua e la barca si mette prua al vento; mollato il gavitello la barca scade
  const mo = make(10); near(mo, 4.2, 0.4, 0.4, 25); mo.update(1 / 60, {});
  const tookIt = mo.gav.moored && mo.boat.bando;
  for (let i = 0; i < 60 * 30; i++) mo.update(1 / 30, {});
  const bowGap = len(sub(add(mo.boat.pos, mul(dirVec(mo.boat.heading), 3.6)), mo.gavPos));
  check(tookIt && bowGap < GAV.line + 0.3 && Math.abs(twaOf(mo.boat)) < 25 && Math.abs(speedKn(mo.boat)) < 0.5 && Coach.tips(mo.boat, lake, null, mo.gav)[0][0].includes('Ormeggiati'),
    `ormeggiati: dopo un minuto la prua è a ${f1(bowGap)} m dal gavitello, ${f0(Math.abs(twaOf(mo.boat)))}° dal vento`);
  mo.mooring();
  for (let i = 0; i < 15 * 30; i++) mo.update(1 / 30, {});
  const gone = len(sub(add(mo.boat.pos, mul(dirVec(mo.boat.heading), 3.6)), mo.gavPos));
  check(!mo.gav && mo.message.includes('MOLLATO') && gone > GAV.line + 1, `mollato il gavitello la barca scade (${f1(gone)} m dopo 15 s)`);
}

// chiamate della manovra: "pronti a virare?", "pronti!", "viro!". Senza avvisare l'equipaggio protesta; in strambata
// chiamata, con le vele automatiche, al "pronti!" la randa si cazza al centro e il boma passa piano
{
  const make = (twa) => {
    const sm = new Simulation(lake);
    sm.settings.gusts = false; sm.settings.windIndex = 1; sm.reset(); sm.wind.shifts = false; sm.autoTrim = true;
    const b = sm.boat;
    Object.assign(b, { pos: { ...lake.center }, heading: norm360(sm.wind.baseDir - twa), u: 2.5, mainSide: twa > 0 ? -1 : 1, jibSide: twa > 0 ? -1 : 1 });
    return sm;
  };
  // naviga a twa gradi dal vento; in said le frasi dette a bordo e le manovre, nell'ordine
  const sail = (sm, secs, twa, said = []) => {
    for (let i = 0; i < secs * 60; i++) {
      sm.update(1 / 60, { tillerTarget: clamp(norm180(twaOf(sm.boat) - twa) * 1.2 - sm.boat.r * 0.8, -25, 25) });
      for (const e of sm.events) if (e.type === 'tack' || e.type === 'gybe') said.push(e.violent ? 'BOMA DI COLPO' : e.type === 'tack' ? 'VIRATA' : 'STRAMBATA');
      said.push(...sm.lines.splice(0).map((l) => l.text));
    }
    return said;
  };
  const inOrder = (said, ...want) => { let i = 0; for (const t of said) if (t === want[i]) i++; return i === want.length; };
  const called = (from, to) => { const sm = make(from); sail(sm, 15, from); sm.announce(); return { sm, said: sail(sm, 2, from, [sm.lines.pop().text]).concat(sail(sm, 12, to)) }; };
  const tk = called(42, -42);
  check(inOrder(tk.said, 'Pronti a virare?', 'Pronti!', 'Viro!', 'VIRATA') && !tk.said.some((t) => t.includes('vvisa')) && !tk.sm.call,
    `virata chiamata: ${tk.said.filter((t) => !t.includes(' NODI')).join(' → ')}`);
  const tk0 = make(42); sail(tk0, 15, 42); const said0 = sail(tk0, 12, -42);
  check(said0.includes('Ehi, avvisa quando viri!') && tk0.message.includes('SENZA AVVISARE'), 'virata senza avvisare: "Ehi, avvisa quando viri!"');
  // virata prima della risposta: la barca passa il vento subito dopo la chiamata
  const tk1 = make(42); sail(tk1, 15, 42); tk1.announce(); tk1.boat.heading = norm360(2 * tk1.boat.twd - tk1.boat.heading);
  const said1 = sail(tk1, 0.5, -42);
  check(said1.includes('Aspetta, non eravamo pronti!'), `virata prima del «pronti!» (${CALL.answer} s): "Aspetta, non eravamo pronti!"`);
  const gy = called(150, -150);
  check(inOrder(gy.said, 'Pronti a strambare?', 'Pronti!', 'Strambo!', 'STRAMBATA') && !gy.said.includes('BOMA DI COLPO'),
    `strambata chiamata, vele automatiche: randa cazzata al centro, il boma passa piano (${gy.said.filter((t) => !t.includes(' NODI')).join(' → ')})`);
  const gy0 = make(150); sail(gy0, 15, 150); const said2 = sail(gy0, 15, -150);
  check(said2.includes('BOMA DI COLPO') && said2.includes('Attenti al boma!'), 'strambata senza avvisare: il boma passa di colpo, "Attenti al boma!"');
  // chiamata la virata, fatta la strambata (e viceversa): l'equipaggio se ne accorge
  const wr = make(150); sail(wr, 15, 150); wr.announce('tack'); const said4 = sail(wr, 2, 150).concat(sail(wr, 15, -150));
  const wr2 = make(42); sail(wr2, 15, 42); wr2.announce('gybe'); const said5 = sail(wr2, 2, 42).concat(sail(wr2, 12, -42));
  check(said4.includes('Ma non si virava?') && said5.includes('Ma non si strambava?') && wr.message.includes('MA HAI STRAMBATO'),
    'chiamata una manovra e fatta l\'altra: "Ma non si virava?", "Ma non si strambava?"');
  // modalita' vocale spenta: niente chiamate ne' proteste, i messaggi di sempre
  const off = make(42); off.settings.voices = 2; sail(off, 15, 42); off.announce('tack');
  const saidOff = sail(off, 12, -42);
  check(!off.call && !saidOff.some((t) => /[a-z]/.test(t) && !t.includes(' NODI')) && saidOff.includes('VIRATA') && off.message.startsWith('VIRATA: ORA'),
    `modalità vocale spenta: nessuna chiamata, nessuna protesta (${saidOff.filter((t) => !t.includes(' NODI')).join(' → ')}, "${off.message}")`);
  const ex = make(42); sail(ex, 5, 42); ex.announce(); const said3 = sail(ex, CALL.wait + 2, 42);
  check(!ex.call && !said3.includes('Viro!'), `senza manovra la chiamata scade dopo ${CALL.wait} s`);
  // per la voce: minuscole, niente tasti, minuti e metri per esteso
  const sp = [
    ['GAVITELLO PRESO IN 1:25 · ORMEGGIATI: SCOTTE LIBERE', 'Gavitello preso in 1 minuto e 25 secondi, ormeggiati: scotte libere'],
    ["HAI TOCCATO LA BOA! IN REGATA SAREBBE UN GIRO DI PENALITA'", 'Hai toccato la boa! in regata sarebbe un giro di penalità'],
    ['Ora lascia andare le scotte (SPAZIO): così ti fermi sul gavitello', 'Ora lascia andare le scotte: così ti fermi sul gavitello'],
    ['VIRATA SENZA AVVISARE: PRIMA SI CHIAMA «PRONTI A VIRARE?» (9)', 'Virata senza avvisare: prima si chiama pronti a virare?'],
    ['Risali di bolina stretta: quando il gavitello è dritto sopravento a te, a circa 24 m, orza prua al vento', 'Risali di bolina stretta: quando il gavitello è dritto sopravento a te, a circa 24 metri, orza prua al vento'],
  ];
  const bad = sp.filter(([a, b]) => speechText(a) !== b);
  check(!bad.length, 'testi per la voce' + bad.map(([a]) => `\n      "${speechText(a)}"`).join(''));
}

// voci: un pilota che obbedisce solo a cio' che sente dire dall'istruttore (con mezzo secondo di reazione) prende il
// gavitello come quello che legge i consigli; l'equipaggio passa davanti all'istruttore
{
  let T = 0, cur = null;
  const heard = [], realPerf = globalThis.performance;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => T * 1000 }, configurable: true, writable: true });
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.speechSynthesis = {
    getVoices: () => [{ name: 'Alice', lang: 'it-IT', localService: true }], resume() {},
    cancel() { cur = null; },
    speak(u) { if (u.text.trim()) { heard.push({ t: T, text: u.text }); cur = { u, end: T + 0.3 + u.text.length * 0.07 / u.rate }; } },
  };
  const tick = (sm, voice) => { if (cur && T >= cur.end) { const u = cur.u; cur = null; u.onend?.(); } voice.update(sm, true, false); };
  const byEar = (kn, reef, side) => {
    T = 0; cur = null; heard.length = 0;
    const sm = new Simulation(lake), voice = new Voice();
    sm.settings.gusts = false; sm.settings.windIndex = WINDS.findIndex((x) => x[1] === kn); sm.reset(); sm.wind.shifts = false;
    sm.autoTrim = true; sm.boat.reef = reef; sm.mooring();
    const g = sm.gavPos, W = sm.wind.baseDir, plan = gavPlan(kn), ear = (w) => heard.some((h) => h.text.includes(w) && T - h.t > 0.5);
    sm.boat.pos = add(sub(g, mul(dirVec(W), plan.luff + 70)), mul(dirVec(W + 90), side * 45));
    let twa0 = side * 42, phase = 'bolina', tTack = -100, luffAt = 0;
    Object.assign(sm.boat, { heading: norm360(W - twa0), u: 2.5, mainSide: -side, jibSide: -side });
    while (!sm.gav.moored && T < 150) {
      const b = sm.boat, U = dirVec(b.twd), P = dirVec(b.twd + 90), rel = sub(g, b.pos);
      const above = rel.x * U.x + rel.y * U.y, lat = rel.x * P.x + rel.y * P.y, coming = twa0 > 0 ? lat < 0 : lat > 0;
      if (phase === 'bolina' && T - tTack > 8 && T > 1) {
        if (ear('Ora orza') && coming && Math.abs(lat) < 3.5) { phase = 'orza'; luffAt = len(rel); }
        else if (!coming && Math.abs(lat) > Math.max(6, (above - plan.luff) / 1.9)) { twa0 = -twa0; tTack = T; sm.announce(); }
      }
      if (phase === 'orza' && ear('lascia andare') && !b.bando) sm.toggleBando();
      const hd = phase === 'orza' ? b.twd + clamp(norm180(bearing(rel) - b.twd), -15, 15) : b.twd - twa0;
      sm.update(1 / 30, { tillerTarget: clamp(norm180(hd - b.heading) * 1.2 - b.r * 0.8, -25, 25) });
      T += 1 / 30; tick(sm, voice);
    }
    return { ok: sm.gav.moored, luffAt, t: T };
  };
  const runs = [[10, 0, 1], [20, 1, -1]].map(([kn, reef, side]) => ({ kn, ...byEar(kn, reef, side) }));
  check(runs.every((r) => r.ok), 'a orecchio: ' + runs.map((r) => `${r.kn} nodi orza a ${f0(r.luffAt)} m, preso in ${f0(r.t)} s`).join(' · ')
    + `; "${heard.find((h) => h.text.includes('lascia andare'))?.text ?? 'nessun lascia andare'}"`);
  // la chiamata interrompe un consiglio lungo dell'istruttore
  T = 0; cur = null; heard.length = 0;
  const sm = new Simulation(lake), voice = new Voice();
  sm.lines.length = 0; sm.talk('istruttore', 'Bolina larga verso il salvagente, puntandolo un paio di metri di lato'); tick(sm, voice);
  T += 0.5; sm.announce(); tick(sm, voice);
  const order = heard.map((h) => h.text).join(' | ');
  check(/^Bolina larga[^|]* \| Pronti a (virare|strambare)\?$/.test(order), `la chiamata del timoniere interrompe l'istruttore (${order})`);
  Object.defineProperty(globalThis, 'performance', { value: realPerf, configurable: true, writable: true });
}

// microfono: i comandi capiti nelle frasi, anche mentre arrivano a pezzi; l'eco delle voci del gioco non comanda;
// detta a voce la chiamata non la ripete il timoniere; le scotte a voce
{
  const cases = [
    ['Pronti a virare?', 'tack'], ['pronti ad virare', 'tack'], ['pronti a girare', 'tack'], ['Pronti a strambare', 'gybe'],
    ['pronti a vira', 'tack'], ['viro', 'goTack'], ['Virò!', 'goTack'], ['strambo', 'goGybe'], ['pronti', ''], ['vira la barca', 'goTack'],
    ['ora vado a virare', ''], ['pronti astrambare', 'gybe'], ['pronti a stambare', 'gybe'], ['Pronti alla strambata', 'gybe'],
    ['pronti avvirare', 'tack'], ['pronti a sdrambare', 'gybe'], ['Strambò', 'goGybe'],
    ['Vele in bando!', 'bandoOn'], ['lascia andare le scotte', 'bandoOn'], ['molla tutto', 'bandoOn'], ['riprendi le scotte', 'bandoOff'],
    ['issa lo spi', 'spiUp'], ['ammaina lo spinnaker', 'spiDown'], ['farfalla', 'wingOn'], ['togli la farfalla', 'wingOff'],
    ['scontra la randa', 'backOn'], ['molla il boma', 'backOff'], ['fiocco in cappa', 'cappaOn'], ['libera il fiocco', 'cappaOff'],
    ['Uomo a mare!', 'mob'], ['prendi il gavitello', 'gav'], ['molla il gavitello', 'gavOff'],
    ['prendi una mano di terzaroli', 'reefIn'], ['riduci la tela', 'reefIn'], ['sciogli i terzaroli', 'reefOut'],
    ['vele manuali', 'manual'], ['vele automatiche', 'auto'],
    ['cazza la randa', 'sheet:main:-0.15'], ["lasca un po' il fiocco", 'sheet:jib:0.07'], ['cazza tutto', 'sheet:both:-1'],
    ['cazza la randa a ferro', 'sheet:main:-1'], ['molla la randa', 'sheet:main:0.3'], ['lascia', ''], ['il vento sta calando', ''],
    ['pronti a virare vele in bando cazza il fiocco', 'tack,bandoOn,sheet:jib:-0.15'],
  ];
  const bad = cases.filter(([t, k]) => heardCommands(t).join() !== k);
  check(!bad.length, `${cases.length} frasi capite: chiamate, scotte, manovre, esercizi` + bad.map(([t]) => `\n      "${t}" → ${heardCommands(t).join() || 'niente'}`).join(''));
  // Safari: una frase sola che cresce e si corregge; Chrome: una frase per ogni pezzo detto
  let got = [], said = [];
  const ear = new Ear((k) => got.push(k), () => {}, () => {}, () => said);
  for (const t of ['pronti a vira', 'pronti a virare', 'pronti a virare viro', 'pronti a virare viro']) ear.result({ resultIndex: 0, results: [[{ transcript: t }]] });
  ear.result({ resultIndex: 1, results: [[{ transcript: 'pronti a virare viro' }], [{ transcript: 'pronti a strambare' }]] });
  check(got.join(' ') === 'tack goTack gybe', `una frase che cresce conta una volta: ${got.join(' ')}`);
  // eco: l'istruttore dice "ora frena: vele in bando" e il microfono lo sente; l'allievo che lo ripete dopo, si'
  const now = performance.now() / 1000;
  said = [{ text: 'Ora frena: vele in bando, arrivi per abbrivio', start: now - 2, end: now - 0.2 }];
  got = []; ear.result({ resultIndex: 2, results: [[], [], [{ transcript: 'ora frena vele in bando arrivi per abbrivio' }]] });
  ear.result({ resultIndex: 3, results: [[], [], [], [{ transcript: 'vele in bando' }]] });
  const echo1 = got.join();
  said = [{ text: 'Ora frena: vele in bando, arrivi per abbrivio', start: now - 3, end: now - 1.5 }];
  got = []; ear.result({ resultIndex: 4, results: [[], [], [], [], [{ transcript: 'vele in bando' }]] });
  check(echo1 === '' && got.join() === 'bandoOn', `l'eco dell'istruttore non comanda, l'allievo che ripete dopo sì (${echo1 || 'niente'} / ${got.join()})`);
  // Safari: rifiutato da solo (senza un tocco) si aspetta un tocco; rifiutato dopo un tocco e' il permesso negato
  const sr = new Ear(() => {}, () => {}, () => {});
  let last = null;
  Object.assign(sr, { supported: true, wanted: true, SR: class { constructor() { last = this; } start() {} abort() {} } });
  sr.start(); last.onerror({ error: 'not-allowed' }); sr.rec = null;
  const waits = sr.blocked && sr.wanted && !sr.denied;
  sr.start(); const quiet = sr.rec === null;
  sr.start(true); last.onerror({ error: 'not-allowed' });
  check(waits && quiet && sr.denied && !sr.wanted, 'microfono rifiutato senza tocco: aspetta un tocco; rifiutato dopo un tocco: permesso negato');
  const sm = new Simulation(lake);
  sm.settings.gusts = false; sm.reset(); sm.wind.shifts = false; sm.autoTrim = true;
  Object.assign(sm.boat, { pos: { ...lake.center }, heading: norm360(sm.wind.baseDir - 42), u: 2.5, mainSide: -1, jibSide: -1 });
  sm.lines.length = 0;
  sm.announce('tack', true); sm.helmGo('tack');
  const early = sm.message;
  for (let i = 0; i < 90; i++) sm.update(1 / 60, { tillerTarget: clamp(norm180(twaOf(sm.boat) - 42) * 1.2 - sm.boat.r * 0.8, -25, 25) });
  sm.helmGo('tack');
  const lines = sm.lines.map((l) => `${l.who}: ${l.text}`);
  check(sm.call?.ready && sm.call.go && early.includes('ASPETTA') && sm.message.includes('VIRO') && lines.join() === 'prodiere: Pronti!',
    `chiamata a voce: il timoniere tace, «viro!» prima del «pronti!» aspetta (${lines.join(' · ')})`);
  // scotte a voce: dalle vele automatiche si passa alle manuali e la scotta va dove detto, alla velocita' delle mani
  const m0 = sm.boat.mainSheet; sm.trimBy('main', 0.3);
  const goal = m0 + 0.3, msg = sm.message;
  for (let i = 0; i < 60; i++) sm.update(1 / 60, {});
  const half = sm.boat.mainSheet;
  for (let i = 0; i < 120; i++) sm.update(1 / 60, {});
  check(!sm.autoTrim && msg.includes('VELE MANUALI') && half > m0 + 0.15 && half < goal && Math.abs(sm.boat.mainSheet - goal) < 0.01,
    `«molla la randa»: vele manuali, scotta da ${f1(m0 * 100)} a ${f1(goal * 100)}% in ${f1(0.3 / 0.22)} s`);
}

// lezioni guidate: un pilota che fa quello che dice ogni tappa le finisce con tre stelle; senza chiamare la virata
// l'errore conta e le stelle scendono
{
  const TARGET = { TRAVERSO: 90, 'BOLINA STRETTA': 45, 'BOLINA LARGA': 65, LASCO: 120, 'GRAN LASCO': 150, POPPA: 168, 'NUOVE MURE': null };
  const lesson = (id, opts = {}) => {
    const def = LESSONS.find((l) => l.id === id), sm = new Simulation(lake);
    Object.assign(sm.settings, { windIndex: lessonWindIndex(def), gusts: false, aids: true, voices: opts.voices ?? 0 });
    sm.reset(); sm.wind.shifts = false; sm.autoTrim = true; sm.forceCalls = true;
    placeForLesson(sm, def);
    const run = new LessonRun(sm, def);
    let side = Math.sign(twaOf(sm.boat)), t = 0, flipped = -1;
    while (!run.done && t < 400) {
      const st = run.step.title, b = sm.boat;
      let want = TARGET[st];
      if (st === 'PRONTI A VIRARE?' || st === 'PRONTI A STRAMBARE?') { if (!opts.noCall && !sm.call) sm.announce(st.includes('VIRARE') ? 'tack' : 'gybe'); want = Math.abs(twaOf(b)); }
      if (opts.noCall && st === 'PRONTI A VIRARE?') { side = -side; want = 45; }
      // in strambata si poggia appena oltre la poppa, poi si riprende il gran lasco: girando forte la barca ripasserebbe il vento
      if (st === 'VIRA' || st === 'STRAMBA') { if (flipped !== run.i) { flipped = run.i; side = -side; } want = st === 'VIRA' ? 45 : 168; }
      if (st === 'NUOVE MURE') want = run.def.id === 'virata' ? 45 : 150;
      sm.update(1 / 30, { tillerTarget: clamp(norm180(twaOf(b) - side * want) * 1.2 - b.r * 0.8, -25, 25) });
      run.update(sm);
      t += 1 / 30;
    }
    return { run, sm, t };
  };
  for (const id of ['andature', 'virata', 'strambata']) {
    const { run, sm, t } = lesson(id);
    check(run.done && run.stars === 3, `lezione «${run.def.title}»: ${run.steps.length} tappe in ${f0(t)} s, ${run.stars ?? 0} stelle${run.done ? '' : ` (ferma a ${run.step.title})`}${run.errors(sm).map(([l, n]) => `, ${n} ${l}`).join('')}`);
  }
  const lazy = lesson('virata', { noCall: true });
  check(!lazy.run.done || lazy.run.stars < 3, `virare senza chiamare non vale tre stelle (${lazy.run.done ? lazy.run.stars + ' stelle' : 'ferma a ' + lazy.run.step.title})`);
}

console.log(failures === 0 ? 'TUTTO OK' : `${failures} ERRORI`);
process.exit(failures === 0 ? 0 : 1);
