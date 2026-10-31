// Lezioni guidate: un percorso a tappe come a scuola. Ogni tappa ha il suo controllo automatico; alla fine il voto in
// stelle, che resta salvato. L'istruttore spiega ogni tappa (a voce, con la modalita' vocale accesa).
import { twaOf, speedKn, norm360, dirVec, add, mul } from './physics.js';
import { Coach, WINDS } from './sim.js';

const twa = (sim) => Math.abs(twaOf(sim.boat));
const kn = (sim) => Math.abs(speedKn(sim.boat));
const pos = (sim) => Coach.pointOfSail(twaOf(sim.boat));
const tack = (sim) => (twaOf(sim.boat) > 0 ? 'mure a dritta' : 'mure a sinistra');

/** Gli errori che contano nel voto: chiave di sim.stats e come si dice. */
export const ERRORS = [
  ['unannounced', 'manovre senza avvisare'], ['early', 'manovre prima del «pronti!»'], ['wrongCall', 'manovre diverse da quella chiamata'],
  ['involuntary', 'strambate involontarie'], ['irons', 'fermi prua al vento'], ['aground', 'in secca'], ['buoyHits', 'boe toccate'],
  ['boatHits', 'barche urtate'],
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

/** Le lezioni. wind in nodi; twa andatura di partenza in acqua libera, davanti al centro del lago; par il tempo per le
 *  tre stelle (secondi). */
export const LESSONS = [
  { id: 'andature', title: 'Le andature', goal: 'Dal traverso alla bolina stretta e poi giù fino alla poppa: si impara a riconoscere le andature.',
    wind: 10, twa: 90, par: 150, steps: andature },
  { id: 'virata', title: 'La virata', goal: 'Tre virate chiamate come a scuola: «pronti a virare?», «pronti!», «viro!».',
    wind: 10, twa: 45, par: 150, steps: () => manoeuvres('tack', 3) },
  { id: 'strambata', title: 'La strambata', goal: 'Due strambate chiamate e controllate, col boma che passa piano.',
    wind: 10, twa: 150, par: 150, steps: () => manoeuvres('gybe', 2) },
];

/** I voti salvati: { id: { stars, time } }. */
export function loadProgress() {
  try { return JSON.parse(localStorage.getItem('scuolaVela.lezioni') || '{}'); } catch { return {}; }
}
function saveProgress(p) {
  try { localStorage.setItem('scuolaVela.lezioni', JSON.stringify(p)); } catch { /* niente memoria: vale solo adesso */ }
}

/** Mette la barca in acqua libera per la lezione: 80 m sottovento al centro del lago, all'andatura di partenza. */
export function placeForLesson(sim, def) {
  const b = sim.boat, W = sim.wind.baseDir;
  b.pos = add(sim.lake.center, mul(dirVec(W + 180), 80));
  b.heading = norm360(W - def.twa);
  const lee = def.twa > 0 ? -1 : 1;
  // anche il vento: la barca appena messa in acqua non lo conosce fino al primo passo (twd = 0)
  Object.assign(b, { u: 2.5, v: 0, r: 0, rudder: 0, mainSide: lee, jibSide: lee, crew: -lee, twd: W, tws: sim.windKn });
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
    const s = this.step, ok = s.check(sim, this);
    if (s.hold) { this.hold = ok ? this.hold + dt : 0; if (this.hold < s.hold) return; } else if (!ok) return;
    this.i++;
    if (this.i >= this.steps.length) { this.finish(sim); return; }
    sim.say(`BENE · ${s.title} FATTO`, 'good');
    this.enter(sim);
  }

  /** Gli errori fatti durante la lezione: [come si dice, quante volte]. */
  errors(sim) {
    return ERRORS.map(([k, label]) => [label, (sim.stats[k] ?? 0) - (this.stats0[k] ?? 0)]).filter(([, n]) => n > 0);
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
