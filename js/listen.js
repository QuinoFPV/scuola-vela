// L'allievo da' i comandi a voce: il riconoscimento vocale del browser (Safari, Chrome) ascolta dal microfono.
// Il riconoscimento lo fa il browser (Apple o Google): qui arrivano solo le parole capite.

/** I comandi a voce, nell'ordine in cui si cercano. Ogni frase trovata si toglie dal testo, cosi' "togli la farfalla" non
 *  vale anche come "farfalla", "lascia andare le scotte" non vale come "lasca" e il "vira" dentro "pronti a vira(re)",
 *  mentre la frase non e' ancora finita, non e' un "viro!". Il riconoscimento scrive "strambare" in tanti modi
 *  (stambare, strabare, sdrambare, astrambare, alla strambata) e "virare" anche come "girare" o "avvirare". */
const PHRASES = [
  ['tack', / pront\S*(?: (?:a|ad|alla|per))? a?(?:v+ir|gir|bir)\S*/g],
  ['gybe', / pront\S*(?: (?:a|ad|alla|per))? a?(?:s[td]?|t)r?[aou]m?b\S*/g],
  ['goTack', / (?:viro|vira|virò)(?= )/g],
  ['goGybe', / (?:strambo|stramba|strambò|strombo)(?= )/g],
  ['bandoOff', / riprend\S* (?:le )?scotte(?= )/g],
  ['bandoOn', / (?:(?:vele|scotte) )?in bando| molla tutto| (?:lascia|libera|molla) (?:andare )?(?:tutte )?(?:le )?scotte(?= )/g],
  ['spiDown', / (?:ammain\S*|giù|abbassa|cala) (?:lo |il )?(?:spi|spy|spinnaker)\S*/g],
  ['spiUp', / (?:issa\S*|isso|alza|tira su|su) (?:lo |il )?(?:spi|spy|spinnaker)\S*/g],
  ['wingOff', / (?:togli|leva|via) (?:la )?farfalla/g],
  ['wingOn', / (?:a |in )?farfalla/g],
  ['backOff', / (?:molla|lascia|libera) (?:il )?boma/g],
  ['backOn', / scontra (?:la )?randa| randa (?:a collo|scontrata)/g],
  ['cappaOff', / (?:libera|togli|leva) (?:il )?fiocco(?: dalla cappa)?| (?:via la|esci dalla|togli la) cappa/g],
  ['cappaOn', / (?:(?:fiocco|mettiti|vai|andiamo) )?in cappa/g],
  ['mob', / uomo (?:a|in) mare/g],
  ['gavOff', / molla (?:il )?gavitello/g],
  ['gav', / (?:prendi (?:il )?)?gavitello| rientr(?:iamo|o)(?: alla base| in porto)?(?= )/g],
  ['reefOut', / (?:sciogli\S*|togli|leva|molla) (?:i |una |la |le )?(?:terzarol\S*|mano|mani)(?= )| (?:aumenta (?:la )?|più )tela/g],
  ['reefIn', / (?:(?:prendi\S*|fai|facciamo) )?(?:una |la )?mano di terzarol\S*| (?:prendi\S*|fai|facciamo) (?:una |la )?mano(?= )| terzarol\S*| riduc\S* (?:la )?tela| meno tela/g],
  ['manual', / vele manuali| regolo io| manuale(?= )/g],
  ['auto', / vele automatiche| automatic\S*/g],
];
/** "Cazza la randa", "lasca un po' il fiocco", "cazza tutto", "molla la randa": scotta e di quanto (in frazione della
 *  corsa; negativo = cazzare). Senza vela vale per tutte e due; "lascia", "caccia" e "molla" solo con la vela, perche'
 *  il riconoscimento a volte capisce cosi' "lasca" e "cazza". */
const SHEET = / (cazz\S*|caccia|lasc\S*|molla)(?: (un po|un poco|poco|pochino|leggermente|tutto|tutta|bene|a ferro))?(?: (?:la|il|le|lo))?(?: (randa|fiocco|genoa|genova|vele|tutto))?(?: (un po|un poco|poco|pochino|leggermente|tutta|bene|a ferro))?(?= )/g;

/** Tutte le parole dei comandi: servono a riconoscere l'eco (le altre parole di una frase dell'istruttore). */
const VOCAB = new Set(('pronti virare strambare viro vira strambo stramba vele scotte bando molla tutto lascia libera andare riprendi '
  + 'ammaina issa alza spi spinnaker farfalla togli leva scontra randa boma collo scontrata fiocco cappa mettiti uomo mare '
  + 'gavitello prendi rientro rientriamo base terzaroli mano mani sciogli aumenta tela riduci meno più fai facciamo manuali '
  + 'automatiche cazza lasca caccia poco pochino bene ferro genoa vai andiamo').split(' '));

const words = (text) => text.toLowerCase().replace(/[^a-zàèéìòù]+/g, ' ').trim().split(' ').filter(Boolean);

/** I comandi in una frase capita, nell'ordine in cui sono stati detti: nomi come 'tack', 'bandoOn', e per le scotte
 *  'sheet:main:-0.15' (vela main, jib o both; di quanto). */
export function heardCommands(text) {
  let t = ` ${words(text).join(' ')} `;
  const found = [];
  const take = (re, name) => {
    t = t.replace(re, (m, ...g) => {
      const at = g[g.length - 2], n = typeof name === 'function' ? name(...g) : name;
      if (n) found.push([at, n]);
      return n ? ' '.repeat(m.length) : m;
    });
  };
  for (const [name, re] of PHRASES) take(re, name);
  take(SHEET, (verb, before, sail, after) => {
    if (!sail && /^(?:caccia|lasci|molla)/.test(verb)) return null;
    const amount = before ?? after;
    const v = verb.startsWith('molla') ? 0.3 : !amount ? 0.15 : /^(?:tutt[oa]|a ferro)$/.test(amount) ? 1 : amount === 'bene' ? 0.3 : 0.07;
    const which = sail === 'randa' ? 'main' : sail && sail !== 'vele' && sail !== 'tutto' ? 'jib' : 'both';
    return `sheet:${which}:${/^(?:cazz|cacc)/.test(verb) ? -v : v}`;
  });
  return found.sort((a, b) => a[0] - b[0]).map(([, n]) => n);
}

/** Eco: il microfono sente le voci del gioco. Un comando non vale se una frase appena detta dal gioco contiene lo stesso
 *  comando e: stava ancora parlando (o aveva appena finito), oppure quello che si e' sentito ha almeno due altre parole
 *  di quella frase ("ora frena: vele in bando, arrivi per abbrivio"). Chi ripete subito dopo l'ordine dell'istruttore,
 *  con parole sue, viene ascoltato. recent: [{ text, start, end }] in secondi. */
export function isEcho(cmd, text, recent, now) {
  const mine = words(text).filter((w) => w.length >= 3 && !VOCAB.has(w));
  return recent.some((r) => heardCommands(r.text).includes(cmd)
    && (now - r.end < 0.8 || (now - r.start < 8 && mine.filter((w) => words(r.text).includes(w)).length >= 2)));
}

export class Ear {
  /** onCommand(nome) a ogni comando capito; onHeard(testo) con quello che si e' sentito; onState() quando cambia.
   *  recent() le frasi appena dette dal gioco, per l'eco. */
  constructor(onCommand, onHeard, onState, recent = () => []) {
    this.SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    this.supported = !!this.SR;
    this.onCommand = onCommand; this.onHeard = onHeard; this.onState = onState; this.recent = recent;
    try { this.wanted = localStorage.getItem('scuolaVela.ascolto') === '1'; } catch { this.wanted = false; }
    this.rec = null; this.listening = false; this.denied = false; this.blocked = false; this.fired = []; this.retry = 300; this.started = 0;
    this.enabled = true;                         // falso con la modalita' vocale spenta: il microfono resta spento
  }

  /** Acceso o spento dal pulsante col microfono; la scelta resta per le volte dopo. */
  toggle() {
    this.wanted = !this.wanted;
    try { localStorage.setItem('scuolaVela.ascolto', this.wanted ? '1' : '0'); } catch { /* vale solo adesso */ }
    if (this.wanted) { this.denied = false; this.retry = 300; this.start(true); } else this.stop();
    this.onState();
  }

  /** Safari accende il microfono solo da un tocco o da un tasto (gesture). Rifiutato da un tocco vuol dire permesso
   *  negato; rifiutato da solo (ripartenza, ritorno sulla pagina) vuol dire che serve un tocco: si aspetta il prossimo. */
  start(gesture = false) {
    if (!this.supported || !this.enabled || !this.wanted || this.rec || (this.blocked && !gesture)) return;
    const r = this.rec = new this.SR();
    r.lang = 'it-IT'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onstart = () => { this.listening = true; this.blocked = false; this.onState(); };
    r.onresult = (e) => this.result(e);
    r.onerror = (e) => {
      if (e.error !== 'not-allowed' && e.error !== 'service-not-allowed') return;
      if (gesture) { this.denied = true; this.wanted = false; } else this.blocked = true;
      this.onState();
    };
    // il browser smette di ascoltare dopo un silenzio o una frase: si riparte, piu' piano se si ferma subito
    r.onend = () => {
      if (this.rec !== r) return;
      this.rec = null; this.listening = false; this.fired = [];
      this.retry = performance.now() - this.started < 1500 ? Math.min(5000, this.retry * 2) : 300;
      if (this.wanted && this.enabled && !this.blocked && !document.hidden) setTimeout(() => this.start(), this.retry);
      this.onState();
    };
    this.started = performance.now();
    try { r.start(); } catch { this.rec = null; }
  }

  stop() {
    const r = this.rec;
    this.rec = null; this.listening = false; this.fired = [];
    try { r?.abort(); } catch { /* gia' fermo */ }
  }

  /** Le frasi arrivano a pezzi mentre si parla e il testo si corregge (Safari manda una frase sola che cresce): per ogni
   *  frase si conta quante volte c'e' ogni comando e si fa partire solo quello in piu', cosi' "vele in bando" detto una
   *  volta vale una volta sola. L'eco si giudica sulla parte nuova della frase. */
  result(e) {
    const now = performance.now() / 1000;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript, cmds = heardCommands(text), w = words(text);
      const f = this.fired[i] ?? (this.fired[i] = { n: {}, words: 0 });
      const tail = w.slice(Math.max(0, f.words - 3)).join(' ');
      f.words = w.length;
      const seen = {};
      for (const c of cmds) {
        seen[c] = (seen[c] ?? 0) + 1;
        if (seen[c] <= (f.n[c] ?? 0)) continue;
        f.n[c] = seen[c];
        if (!isEcho(c, tail, this.recent(), now)) this.onCommand(c);
      }
      if (text.trim()) this.onHeard(text.trim());
    }
  }
}
