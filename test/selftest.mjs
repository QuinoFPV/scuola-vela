// Prove automatiche della fisica e della simulazione (come --selftest della versione Mac).
// Uso: node test/selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Wind, newBoat, step, idealSheets, norm180, norm360, clamp, speedKn, twaOf, dirVec, len, sub, add, mul, SAIL_PLANS } from '../js/physics.js';
import { Lake } from '../js/lake.js';
import { Simulation, Coach, COURSE } from '../js/sim.js';

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
const up = speed(10, 45), reach = speed(10, 90), down = speed(10, 175);
check(up.kn >= 3.8 && up.kn <= 5.5, `bolina 10 nodi: ${f1(up.kn)} kn`);
check(reach.kn >= 4.8 && reach.kn <= 6.3, `traverso 10 nodi: ${f1(reach.kn)} kn`);
check(down.kn >= 3.2 && down.kn <= 5.0, `poppa 10 nodi: ${f1(down.kn)} kn`);
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
// giro delle boe
const simC = new Simulation(lake);
const order = [];
for (let k = 0; k < 4; k++) {
  order.push(simC.nextMark);
  simC.boat.pos = add(simC.marks[COURSE[k % 3]], { x: 10, y: 0 }); simC.boat.u = 2;
  for (let i = 0; i < 30 * 20; i++) simC.update(1 / 30, {});
  simC.boat.pos = { ...lake.center };
}
check(order.join() === '0,2,1,0' && simC.lastLap !== null, `giro delle boe in ordine (${simC.lastLap | 0} s)`);
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

console.log(failures === 0 ? 'TUTTO OK' : `${failures} ERRORI`);
process.exit(failures === 0 ? 0 : 1);
