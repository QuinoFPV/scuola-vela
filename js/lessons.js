// Lezioni guidate: un percorso a tappe come a scuola. Ogni tappa ha il suo controllo automatico; alla fine il voto in
// stelle, che resta salvato. L'istruttore spiega ogni tappa (a voce, con la modalita' vocale accesa).
import { twaOf, speedKn, norm180, norm360, dirVec, add, sub, mul, len, bearing, idealSheets } from './physics.js';
import { Coach, WINDS, mobPlan, gavPlan } from './sim.js';

const twa = (sim) => Math.abs(twaOf(sim.boat));
const kn = (sim) => Math.abs(speedKn(sim.boat));
const pos = (sim) => Coach.pointOfSail(twaOf(sim.boat));
const tack = (sim) => (twaOf(sim.boat) > 0 ? 'mure a dritta' : 'mure a sinistra');

/** Gli errori che contano nel voto: chiave di sim.stats e come si dice. */
export const ERRORS = [
  ['unannounced', 'manovre senza avvisare'], ['early', 'manovre prima del «pronti!»'], ['wrongCall', 'manovre diverse da quella chiamata'],
  ['involuntary', 'strambate involontarie'], ['irons', 'fermi prua al vento'], ['aground', 'in secca'], ['buoyHits', 'boe toccate'],
  ['boatHits', 'barche urtate'], ['mobHits', 'salvagente investito'], ['gavHits', 'gavitello urtato'],
];

/** Tappa: title (corto, maiuscolo), text (cosa fare; i tasti tra parentesi spariscono sul telefono e a voce), hold
 *  (secondi in cui la condizione deve restare vera), check(sim, run) e start(sim, run) quando comincia. */
const andature = () => [
  { title: 'TRAVERSO', text: 'Traverso: il vento arriva di fianco, a 90°. Tienilo finché la barretta è piena.', hold: 8, check: (s) => pos(s) === 'TRAVERSO' },
  { title: 'BOLINA STRETTA', text: "Orza fino alla bolina stretta, 40-50° dal vento, e tienila. Non salire nell'angolo morto: le vele sbattono.", hold: 8,
    check: (s) => pos(s) === 'BOLINA STRETTA' && kn(s) > 2.5 },
  { title: 'BOLINA LARGA', text: 'Poggia un poco: bolina larga, 55-75° dal vento.', hold: 8, check: (s) => pos(s) === 'BOLINA LARGA' },
  { title: 'LASCO', text: 'Poggia ancora: lasco, 105-135° dal vento. Le vele si lascano.', hold: 8, check: (s) => pos(s) === 'LASCO' },
  { title: 'GRAN LASCO', text: 'Ancora più giù: gran lasco, 135-165° dal vento.', hold: 8, check: (s) => pos(s) === 'GRAN LASCO' },
  { title: 'POPPA', text: 'Poppa: il vento da dietro, oltre 165°. Attento a non strambare: se la randa passa dalla parte del vento, orza un poco.', hold: 8,
    check: (s) => pos(s) === 'POPPA' },
];

/** Virata o strambata chiamata, due o tre volte: andatura di partenza, chiamata, manovra, andatura sulle nuove mure. */
function manoeuvres(kind, rounds) {
  const t = kind === 'tack';
  const steps = [];
  for (let i = 0; i < rounds; i++) {
    const n = rounds > 1 ? ` (${i + 1} di ${rounds})` : '';
    steps.push(t
      ? { title: 'BOLINA STRETTA', text: 'Bolina stretta, 40-50° dal vento: tienila finché la barretta è piena.', hold: 5,
        check: (s) => pos(s) === 'BOLINA STRETTA' && kn(s) > 2.5 }
      : { title: 'GRAN LASCO', text: 'Gran lasco, 135-165° dal vento: tienilo finché la barretta è piena.', hold: 5,
        check: (s) => pos(s) === 'GRAN LASCO' });
    steps.push(t
      ? { title: 'PRONTI A VIRARE?', text: `Avvisa l'equipaggio${n}: «pronti a virare?» (9) e aspetta il «pronti!».`, check: (s) => s.call?.kind === 'tack' && s.call.ready }
      : { title: 'PRONTI A STRAMBARE?', text: `Avvisa l'equipaggio${n}: «pronti a strambare?» (8) e aspetta il «pronti!». Con le vele automatiche la randa va al centro.`,
        check: (s) => s.call?.kind === 'gybe' && s.call.ready });
    steps.push(t
      ? { title: 'VIRA', text: 'Vira: metti la barra e porta la prua oltre il vento, senza fermarti, fino alla bolina sulle altre mure.',
        start: (s, r) => { r.mark = s.stats.tacks; }, check: (s, r) => s.stats.tacks > r.mark }
      : { title: 'STRAMBA', text: 'Stramba: poggia piano finché il boma passa dall\'altra parte.',
        start: (s, r) => { r.mark = s.stats.gybes; }, check: (s, r) => s.stats.gybes > r.mark });
    steps.push(t
      ? { title: 'NUOVE MURE', text: 'Riprendi la bolina stretta sulle nuove mure e la velocità, sopra i 3 nodi.', hold: 3,
        check: (s) => pos(s) === 'BOLINA STRETTA' && kn(s) > 3 }
      : { title: 'NUOVE MURE', text: 'Riprendi il gran lasco sulle nuove mure.', hold: 3, check: (s) => pos(s) === 'GRAN LASCO' });
  }
  return steps;
}

/** Prua al vento e ripartenza: fermarsi, ripartire col timone (l'equipaggio tiene il fiocco a collo), poi andare
 *  indietro con la randa scontrata e ripartire mollando il boma. */
function irons() {
  const close = { title: 'BOLINA STRETTA', text: 'Riprendi la bolina stretta sopra i 3 nodi.', hold: 3, check: (s) => pos(s) === 'BOLINA STRETTA' && kn(s) > 3 };
  const stop = { title: 'PRUA AL VENTO', text: 'Orza piano fino a prua al vento: le vele sbattono e la barca si ferma.', hold: 1,
    check: (s) => twa(s) < 30 && kn(s) < 0.6 };
  return [
    { ...close, text: 'Bolina stretta, 40-50° dal vento: tienila finché la barretta è piena.', hold: 5 },
    stop,
    { title: 'RIPARTI COL TIMONE', text: "Barra tutta da una parte: la barca va indietro e la prua cade, l'equipaggio tiene il fiocco a collo. Caduta la prua, raddrizza la barra.",
      check: (s) => twa(s) > 55 && !s.boat.backMain },
    close,
    { ...stop, text: 'Di nuovo prua al vento, fino a fermarti.' },
    { title: 'INDIETRO', text: 'Ora scontra la randa (K): il vento la prende di fronte e la barca va indietro. In retromarcia correzioni dolci.', hold: 3,
      check: (s) => !!s.boat.backMain && speedKn(s.boat) < -0.6 },
    { title: 'MOLLA IL BOMA', text: 'Quando la prua cade di lato molla il boma (K) e riparti.', check: (s) => !s.boat.backMain && twa(s) > 50 },
    close,
  ];
}

/** Vele manuali: la randa al limite del fileggiare, il fiocco coi filetti, in tre andature. Vale la regolazione giusta
 *  con lo stesso margine dei consigli dell'istruttore (randa 0,09, fiocco 0,1 della corsa della scotta). */
const trimmed = (s, jib = true) => {
  const b = s.boat, id = idealSheets(b);
  return !s.autoTrim && !b.bando && Math.abs(b.mainSheet - id.main) <= 0.09 && (!jib || Math.abs(b.jibSheet - id.jib) <= 0.1);
};
const manual = () => [
  { title: 'VELE MANUALI', text: 'Passa alle vele manuali (T): da qui le scotte le regoli tu.', check: (s) => !s.autoTrim },
  { title: 'RANDA', text: 'Al traverso lasca la randa (A) finché fileggia sul davanti, poi cazzala (Q) quel tanto che basta perché smetta.', hold: 4,
    check: (s) => pos(s) === 'TRAVERSO' && trimmed(s, false) },
  { title: 'FIOCCO', text: 'Ora il fiocco, coi filetti: se si alza quello sopravento cazza (W), se cade quello sottovento lasca (S).', hold: 4,
    check: (s) => pos(s) === 'TRAVERSO' && trimmed(s) },
  { title: 'BOLINA STRETTA', text: 'Orza in bolina stretta e cazza randa e fiocco finché non fileggiano e i filetti sono dritti.', hold: 5,
    check: (s) => pos(s) === 'BOLINA STRETTA' && kn(s) > 3 && trimmed(s) },
  { title: 'LASCO', text: 'Poggia al lasco e lasca tutte e due: la randa fino al limite del fileggiare, il fiocco coi filetti dritti.', hold: 5,
    check: (s) => pos(s) === 'LASCO' && trimmed(s) },
  { title: 'VELE AUTOMATICHE', text: "Fatto: ripassa alle vele automatiche (T), le regola di nuovo l'equipaggio.", check: (s) => s.autoTrim },
];

/** Uomo a mare: l'istruttore butta il salvagente all'improvviso; ci si allontana al traverso, si vira, si scende al gran
 *  lasco sotto al salvagente e si risale di bolina larga, con le vele in bando a mobPlan().stop metri. Ogni tappa vale
 *  anche se il salvagente e' gia' stato preso (chi lo prende prima salta le altre). */
function overboard(wind) {
  const plan = mobPlan(wind), got = (s) => s.lastMob !== null;
  return [
    { title: 'TRAVERSO', text: "Traverso: tienilo finché la barretta è piena. Da qui in poi l'istruttore può buttare in acqua il salvagente.", hold: 5,
      check: (s) => pos(s) === 'TRAVERSO' },
    { title: 'UOMO A MARE', text: `Non perderlo di vista: chi è a prua lo indica col braccio. Resta al traverso e allontanati di ${plan.away} m.`,
      // l'equipaggio grida «uomo a mare!»; l'istruttore lo dice con la tappa
      start: (s) => { if (!s.mob) { s.manOverboard(); s.lines.pop(); } }, check: (s) => got(s) || !!s.mob?.far },
    { title: 'VIRA', text: 'Chiama la virata (9) e vira: si torna verso il salvagente.',
      start: (s, r) => { r.mark = s.stats.tacks + s.stats.gybes; }, check: (s, r) => got(s) || s.stats.tacks + s.stats.gybes > r.mark },
    { title: 'SOTTO AL SALVAGENTE', text: `Poggia al gran lasco e scendi sotto al salvagente, finché lo vedi a 50-60° dal vento, ad almeno ${plan.start} m.`,
      check: (s) => {
        if (got(s)) return true;
        const b = s.boat, rel = sub(s.mob.pos, b.pos), up = dirVec(b.twd), off = Math.abs(norm180(bearing(rel) - b.twd));
        return rel.x * up.x + rel.y * up.y > 10 && off >= 45 && off <= 75;
      } },
    { title: 'RECUPERO', text: `Bolina larga verso il salvagente, un paio di metri di lato. A ${plan.stop} m vele in bando (SPAZIO): arrivi quasi fermo e chi è a prua lo prende.`,
      check: got },
  ];
}

/** Gavitello: si risale di bolina stretta fin sotto al gavitello e a gavPlan().luff metri si orza prua al vento; la
 *  barca arriva per abbrivio e chi e' a prua lo prende col mezzo marinaio. */
function mooring(wind) {
  const plan = gavPlan(wind);
  return [
    { title: 'RISALI', text: `Rientro al gavitello della scuola: risali di bolina stretta finché è dritto sopravento a te, a circa ${plan.luff} m.`,
      start: (s) => { if (!s.gav) { s.mooring(); s.lines.pop(); } },        // l'istruttore lo dice con la tappa
      check: (s) => {
        if (s.gav?.moored) return true;
        const b = s.boat, rel = sub(s.gavPos, b.pos), up = dirVec(b.twd), above = rel.x * up.x + rel.y * up.y;
        return Math.abs(rel.x * up.y - rel.y * up.x) < 6 && above > 0 && above < plan.luff + 6;
      } },
    { title: 'PRUA AL VENTO', text: 'Orza prua al vento e arriva per abbrivio, quasi fermo: chi è a prua lo prende col mezzo marinaio. Se vai forte, vele in bando (SPAZIO).',
      check: (s) => !!s.gav?.moored },
  ];
}

/** Giro delle boe: dalla bolina si gira la boa di bolina, poi quella di traverso (si stramba) e quella di poppa, sempre
 *  lasciandole a sinistra; finito quando si riparte di bolina. sim.courseStep: la prossima boa del giro. */
const course = () => [
  { title: 'BOA DI BOLINA', text: 'Risali di bolina e gira la boa di bolina lasciandola a sinistra: le boe si girano in senso antiorario.',
    check: (s) => s.courseStep === 1 },
  { title: 'BOA DI TRAVERSO', text: 'Poggia verso la boa di traverso, il freccione la indica. Per girarla si stramba: chiama la strambata (8) prima di arrivarci.',
    check: (s) => s.courseStep === 2 },
  { title: 'BOA DI POPPA', text: 'Ora la boa di poppa, sempre lasciandola a sinistra. Se hai lo spi ammainalo prima (E); girata, orza in bolina.',
    check: (s) => s.courseStep === 0 },
  { title: 'BOLINA STRETTA', text: 'Riparti di bolina stretta sopra i 3 nodi verso la boa di bolina: il giro è fatto.', hold: 3,
    check: (s) => pos(s) === 'BOLINA STRETTA' && kn(s) > 3 },
];

/** Le lezioni. wind in nodi; twa andatura di partenza in acqua libera, davanti al centro del lago, o place(sim) dove
 *  parte la barca; par il tempo per le tre stelle (secondi); ignore gli errori che nella lezione si fanno apposta;
 *  lost(sim) vero se l'esercizio e' stato annullato (si ricomincia dalla tappa restart). */
export const LESSONS = [
  { id: 'andature', title: 'Le andature', goal: 'Dal traverso alla bolina stretta e poi giù fino alla poppa: si impara a riconoscere le andature.',
    wind: 10, twa: 90, par: 150, steps: andature },
  { id: 'virata', title: 'La virata', goal: 'Tre virate chiamate come a scuola: «pronti a virare?», «pronti!», «viro!».',
    wind: 10, twa: 45, par: 150, steps: () => manoeuvres('tack', 3) },
  { id: 'strambata', title: 'La strambata', goal: 'Due strambate chiamate e controllate, col boma che passa piano.',
    wind: 10, twa: 150, par: 150, steps: () => manoeuvres('gybe', 2) },
  { id: 'prua', title: 'Prua al vento e ripartenza', goal: 'Fermarsi prua al vento, ripartire col timone e andare indietro con la randa scontrata.',
    wind: 10, twa: 45, par: 150, steps: irons, ignore: ['irons'] },
  { id: 'manuali', title: 'Le vele a mano', goal: 'Randa al limite del fileggiare e fiocco coi filetti dritti, al traverso, di bolina e al lasco.',
    wind: 10, twa: 90, par: 180, steps: manual },
  { id: 'uomo', title: 'Uomo a mare', goal: "L'istruttore butta il salvagente: allontanarsi, virare, tornare sotto e prenderlo quasi fermi.",
    wind: 10, twa: 90, par: 240, steps: () => overboard(10), lost: (s) => !s.mob && s.lastMob === null, restart: 1 },
  { id: 'gavitello', title: 'Il gavitello', goal: 'Il rientro: risalire di bolina, orzare prua al vento e prendere il gavitello della scuola.',
    wind: 10, twa: 45, par: 150, steps: () => mooring(10), place: placeForMooring, ignore: ['irons'], lost: (s) => !s.gav, restart: 0 },
  { id: 'boe', title: 'Il giro delle boe', goal: 'Boa di bolina, di traverso e di poppa, lasciandole a sinistra, con la strambata chiamata.',
    wind: 10, twa: 45, par: 480, steps: course, place: placeForCourse },
];

/** I voti salvati: { id: { stars, time } }. */
export function loadProgress() {
  try { return JSON.parse(localStorage.getItem('scuolaVela.lezioni') || '{}'); } catch { return {}; }
}
function saveProgress(p) {
  try { localStorage.setItem('scuolaVela.lezioni', JSON.stringify(p)); } catch { /* niente memoria: vale solo adesso */ }
}

/** Mette la barca in acqua libera per la lezione: 80 m sottovento al centro del lago, all'andatura di partenza, o dove
 *  dice la lezione. */
export function placeForLesson(sim, def) {
  if (def.place) def.place(sim);
  else putBoat(sim, add(sim.lake.center, mul(dirVec(sim.wind.baseDir + 180), 80)), def.twa);
}
function putBoat(sim, p, twa) {
  const b = sim.boat, W = sim.wind.baseDir, lee = twa > 0 ? -1 : 1;
  b.pos = p;
  b.heading = norm360(W - twa);
  // anche il vento: la barca appena messa in acqua non lo conosce fino al primo passo (twd = 0)
  Object.assign(b, { u: 2.5, v: 0, r: 0, rudder: 0, mainSide: lee, jibSide: lee, crew: -lee, twd: W, tws: sim.windKn });
}
/** Il primo dei punti in acqua profonda, con 40 m di acqua libera davanti (col vento da sud o da nord la riva di Castro
 *  e' da una parte o dall'altra). */
function deepest(sim, tries) {
  const ok = ([p, twa]) => [0, 20, 40].every((d) => sim.lake.depth(add(p, mul(dirVec(sim.wind.baseDir - twa), d))) > 6);
  return tries.find(ok) ?? tries[0];
}
/** Gavitello: di bolina stretta sottovento al gavitello, 90 m sotto il punto dove orzare e 50 m di lato, dalla parte
 *  dove c'e' acqua libera; da li' le mure verso la linea del vento del gavitello. */
function placeForMooring(sim) {
  const g = sim.gavPos, W = sim.wind.baseDir, down = gavPlan(sim.windKn).luff + 90;
  const at = (side) => [add(sub(g, mul(dirVec(W), down)), mul(dirVec(W + 90), side * 50)), side * 45];
  putBoat(sim, ...deepest(sim, [at(1), at(-1)]));
}
/** Giro delle boe: di bolina mure a dritta 80 m sotto la boa di bolina e 100 m alla sua destra (guardando il vento):
 *  sulle mure giuste per lasciarla a sinistra. */
function placeForCourse(sim) {
  const m = sim.marks[0], W = sim.wind.baseDir;
  putBoat(sim, add(sub(m, mul(dirVec(W), 80)), mul(dirVec(W + 90), 100)), 45);
}
export const lessonWindIndex = (def) => Math.max(0, WINDS.findIndex((w) => w[1] === def.wind));

/** Una lezione in corso: la tappa attuale, quanto e' stata vera la sua condizione, gli errori dall'inizio. */
export class LessonRun {
  constructor(sim, def) {
    this.def = def; this.n = LESSONS.indexOf(def) + 1;
    this.steps = def.steps(); this.i = 0; this.hold = 0; this.done = false;
    this.t0 = sim.time; this.last = sim.time; this.stats0 = { ...sim.stats };
    this.enter(sim, true);
  }
  get step() { return this.steps[this.i]; }
  get elapsed() { return this.last - this.t0; }

  enter(sim, first = false) {
    const s = this.step;
    this.hold = 0;
    s.start?.(sim, this);
    sim.talk('istruttore', first ? `Lezione ${this.n}, ${this.def.title.toLowerCase()}. ${s.text}` : s.text);
  }

  /** Dopo sim.update; usa il tempo della simulazione, cosi' la pausa e la moviola non contano. */
  update(sim) {
    if (this.done) return;
    const dt = Math.max(0, sim.time - this.last);
    this.last = sim.time;
    // esercizio annullato (di nuovo INVIO o 0): si ricomincia dalla sua prima tappa, che lo fa ripartire
    if (this.def.lost?.(sim) && this.i >= this.def.restart) { this.i = this.def.restart; this.enter(sim); return; }
    const s = this.step, ok = s.check(sim, this);
    if (s.hold) { this.hold = ok ? this.hold + dt : 0; if (this.hold < s.hold) return; } else if (!ok) return;
    this.i++;
    if (this.i >= this.steps.length) { this.finish(sim); return; }
    sim.say(`BENE · ${s.title} FATTO`, 'good');
    this.enter(sim);
  }

  /** Gli errori fatti durante la lezione: [come si dice, quante volte]. */
  errors(sim) {
    return ERRORS.filter(([k]) => !this.def.ignore?.includes(k))
      .map(([k, label]) => [label, (sim.stats[k] ?? 0) - (this.stats0[k] ?? 0)]).filter(([, n]) => n > 0);
  }

  /** Il voto: tre stelle senza errori e nel tempo, due con un paio di errori o in ritardo, una altrimenti. */
  finish(sim) {
    this.done = true;
    const errs = this.errors(sim).reduce((a, [, n]) => a + n, 0);
    let stars = errs === 0 ? 3 : errs <= 2 ? 2 : 1;
    if (this.elapsed > this.def.par) stars = Math.min(stars, 2);
    this.stars = stars;
    const p = loadProgress(), old = p[this.def.id];
    this.best = !old || stars > old.stars || (stars === old.stars && this.elapsed < old.time);
    if (this.best) { p[this.def.id] = { stars, time: Math.round(this.elapsed) }; saveProgress(p); }
    sim.say(`LEZIONE FINITA: ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, 'good');
    sim.talk('istruttore', stars === 3 ? 'Lezione finita: tre stelle, ottimo lavoro!' : `Lezione finita: ${stars === 2 ? 'due stelle' : 'una stella'}.`);
  }
}
