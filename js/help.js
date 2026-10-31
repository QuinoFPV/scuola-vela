// L'aiuto: per ogni funzione, in grande, i tasti (computer) o i pulsanti (telefono) che la fanno partire, cosa fa chi
// timona e cosa fa l'equipaggio, e la frase da dire col microfono. Un elenco solo per computer e telefono.
//   t titolo · k tasti [tasto, didascalia] · b pulsanti del telefono [scritta, didascalia, stile] · d cosa fa
//   dt cosa fa, detto per il telefono · you / crew chi fa cosa · v frasi a voce · call solo con la modalita' vocale
const MENU = [['☰', 'nel menu']];
const SECTIONS = [
  ['TIMONE E VELE', [
    { t: 'Timone', k: [['←'], ['→'], ['↓', 'al centro'], ['⇧', 'piano']], b: [['BARRA', 'in basso a sinistra']],
      d: 'Le frecce muovono la barra; con Shift piano; freccia giù la riporta esattamente al centro. Anche col mouse: tieni premuto e trascina.',
      dt: 'Trascina il dito: la barra resta dove la lasci. Tocca il centro per raddrizzarla.', you: 'il timone è sempre tuo.' },
    { t: 'Vele automatiche o manuali', k: [['T']], b: [['VELE AUTO', 'in alto']], v: ['vele automatiche', 'vele manuali'],
      d: 'Si parte con le vele automatiche: le scotte le regola l\'equipaggio e tu pensi solo al timone. Con le manuali le regoli tu.' },
    { t: 'Randa', k: [['Q', 'cazza'], ['A', 'lasca']], b: [['CAZZA', 'randa'], ['LASCA', 'randa']], v: ['cazza la randa', "lasca un po' la randa", 'molla la randa'],
      d: 'Tieni premuto finché serve. A voce la scotta si muove di quanto dici e le vele diventano manuali.',
      dt: 'Tieni premuto; i pulsanti compaiono in basso a destra con le vele manuali. A voce le vele diventano manuali.' },
    { t: 'Fiocco', k: [['W', 'cazza'], ['S', 'lasca']], b: [['CAZZA', 'fiocco'], ['LASCA', 'fiocco']], v: ['cazza il fiocco', 'lasca il fiocco'],
      d: 'Come la randa. I filetti del fiocco, in basso a destra, dicono se è regolato bene.' },
    { t: 'Vele in bando', k: [['SPAZIO']], b: [['VELE IN BANDO', 'in basso a destra']], v: ['vele in bando', 'riprendi le scotte'],
      d: 'Scotte libere del tutto: le vele sbattono e la barca rallenta. Di nuovo per riprenderle.',
      crew: 'libera le scotte e, con le vele automatiche, le riprende.' },
    { t: 'Riduci o aumenta la tela', k: [['Z', 'riduci'], ['X', 'aumenta']], b: [['RIDUCI', 'in alto'], ['AUMENTA', 'in alto']],
      v: ['prendi una mano di terzaroli', 'sciogli i terzaroli'], d: 'Una mano di terzaroli, due mani, due mani e tormentina al posto del fiocco.',
      crew: 'prende la mano: la randa sbatte qualche secondo.', you: 'tieni la barca dritta finché ha finito.' },
  ]],
  ['MANOVRE', [
    { t: 'Pronti a virare?', call: true, k: [['9']], b: [['PRONTI A VIRARE?', 'in basso a destra', 'blue']], v: ['pronti a virare?', 'viro!'],
      d: 'Si avvisa l\'equipaggio prima di virare. Senza avvisare protesta.',
      you: 'dopo il «pronti!» metti la barra e passi col vento.', crew: 'risponde «pronti!», passa il fiocco e lo cazza al winch.' },
    { t: 'Pronti a strambare?', call: true, k: [['8']], b: [['PRONTI A STRAMBARE?', 'in basso a destra', 'blue']], v: ['pronti a strambare?', 'strambo!'],
      d: 'Si avvisa prima di strambare; senza avviso il boma passa di colpo.',
      you: 'dopo il «pronti!» poggi fino a strambare (con le vele manuali prima cazzi la randa al centro).',
      crew: 'risponde; con le vele automatiche cazza la randa al centro e poi la rilascia.' },
    { t: 'Spinnaker', k: [['E']], b: [['ISSA SPI', 'dal traverso in giù']], v: ['issa lo spi', 'ammaina lo spi'],
      d: 'Si issa dal traverso in giù; di nuovo per ammainarlo.',
      crew: 'issa, avvolge il fiocco, mette il tangone e regola lo spi.', you: 'non orzare troppo (si chiude); col vento forte attento alla straorzata.' },
    { t: 'Farfalla', k: [['Y']], b: [['FARFALLA', 'in poppa']], v: ['farfalla', 'togli la farfalla'],
      d: 'In poppa il fiocco va dalla parte opposta alla randa, sul tangone. Di nuovo per riportarlo.',
      crew: 'porta il fiocco dall\'altra parte.', you: 'resta in poppa piena, tra 150° e 180° dal vento.' },
    { t: 'Randa scontrata', k: [['K', 'lato del boma'], ['J', 'a sinistra'], ['L', 'a dritta']], b: [['SCONTRA RANDA', 'di bolina']],
      v: ['scontra la randa', 'molla il boma'], d: 'Per uscire dall\'angolo morto e andare in retromarcia. Di nuovo per mollare il boma.',
      crew: 'spinge fuori il boma e lo tiene.', you: 'in retromarcia il timone lavora al contrario.' },
    { t: 'Fiocco in cappa', k: [['U']], b: [['FIOCCO IN CAPPA', 'di bolina e al traverso']], v: ['fiocco in cappa', 'libera il fiocco'],
      d: 'La barca si ferma e scarroccia piano. Di nuovo per liberare il fiocco.',
      crew: 'cazza il fiocco sopravento.', you: 'lasca la randa (vele manuali) e tieni la barra all\'orza.' },
  ]],
  ['ESERCIZI', [
    { t: 'Uomo a mare', k: [['INVIO']], b: [['UOMO A MARE', 'in alto', 'red']], v: ['uomo a mare!'],
      d: 'L\'istruttore butta in acqua il salvagente. Di nuovo per annullare.',
      you: 'allontanati al traverso, vira, scendi sotto e torna di bolina larga; vele in bando dove dice l\'istruttore.',
      crew: 'lo indica (il freccione arancione) e lo prende col mezzo marinaio quando arrivi piano.' },
    { t: 'Gavitello', k: [['0']], b: [['GAVITELLO', 'in basso a destra']], v: ['prendi il gavitello', 'molla il gavitello'],
      d: 'Rientro alla base: si prende il gavitello della scuola a prua. Di nuovo per mollarlo.',
      you: 'risali di bolina, orza prua al vento dove dice l\'istruttore, lascia andare le scotte quando lo dice.',
      crew: 'lo prende a prua col mezzo marinaio e dà volta alla cima.' },
    { t: 'Giro delle boe', k: [], b: [],
      d: 'Segui il freccione giallo. Le boe si lasciano a sinistra (si girano in senso antiorario); il cronometro parte alla boa di bolina.' },
  ]],
  ['VOCE', [
    { t: 'Modalità vocale', k: [['7']], b: [['💬', 'negli strumenti', 'icon']],
      d: 'Accende o spegne tutto insieme: voci dell\'equipaggio e dell\'istruttore, microfono, chiamate delle manovre. Nel menu c\'è anche «senza l\'istruttore a voce».' },
    { t: 'Microfono', k: [['🎤', 'negli strumenti', 'icon']], b: [['🎤', 'negli strumenti', 'icon']],
      d: 'Verde: ascolta. Le frasi da dire sono in verde sotto ogni funzione; sopra la barca compare quello che ha capito. La prima volta il browser chiede il permesso (Safari o Chrome).' },
    { t: 'Audio', k: [['M']], b: [['🔊', 'negli strumenti', 'icon']], d: 'Spegne e riaccende tutti i suoni e le voci.' },
  ]],
  ['VISTA E AIUTI', [
    { t: 'Vista', k: [['C']], b: [['VISTA', 'in alto']], d: 'Dal gommone dell\'istruttore, dal timoniere, di lato, dall\'alto.' },
    { t: 'Girare intorno e zoom', k: [['tasto destro', 'trascina'], ['rotella', 'zoom']], b: [['un dito', 'gira'], ['due dita', 'zoom']],
      d: 'Per guardare la barca da ogni parte, da vicino o da lontano.' },
    { t: 'Moviola', k: [['R']], b: [['MOVIOLA', 'in alto']], d: 'Gli ultimi 20 secondi al rallentatore; di nuovo per tornare in diretta.' },
    { t: 'Pausa', k: [['P']], b: [['PAUSA', 'in alto']], d: 'Ferma tutto; la vista si può girare per spiegare.' },
    { t: 'Aiuti dell\'istruttore', k: [['I']], b: MENU, d: 'Consigli, filetti del fiocco e regolazione ideale delle scotte.' },
    { t: 'Triangolo dei venti e aria sporca', k: [['F', 'triangolo'], ['O', 'aria sporca']], b: MENU,
      d: 'Frecce sull\'acqua col vento reale, quello apparente e la barca; la scia di vento disturbato sottovento alle vele.' },
  ]],
  ['VENTO, BARCA E MENU', [
    { t: 'Vento', k: [['1…6'], ['G', 'raffiche']], b: MENU, d: '6, 10, 15, 20, 25 o 30 nodi; raffiche e salti di vento sì o no.' },
    { t: 'Ora o Sover', k: [['D']], b: MENU, d: 'L\'Ora da sud, il pomeriggio; il Sover da nord, la mattina.' },
    { t: 'Timone e barca', k: [['B', 'timone'], ['V', 'barca']], b: MENU, d: 'Barra semplice, barra reale o ruota; barca nera SPORTACTION o bianca ITA 09.' },
    { t: 'Ricomincia', k: [['N']], b: MENU, d: 'Di nuovo davanti alla base.', dt: 'Dal menu, uscendo di nuovo in mare.' },
    { t: 'Menu e aiuto', k: [['ESC', 'menu'], ['H', 'aiuto']], b: [['☰', 'in alto a sinistra']], d: 'Nel menu si scelgono vento, barca, aiuti e voci.' },
    { t: 'Gamepad', desk: true, k: [['levetta', 'barra'], ['grilletti', 'randa'], ['dorsali', 'fiocco']], d: 'Se ne colleghi uno.' },
    { t: 'Come un\'app', touch: true, b: [['Condividi', 'nel browser']], d: 'Scegli «Aggiungi a schermata Home»: il gioco si apre a tutto schermo.' },
  ]],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Riempie l'aiuto per il computer o per il telefono; voiceOn: modalita' vocale accesa (frasi a voce e chiamate). */
export function renderHelp(body, nav, touch, voiceOn) {
  const cap = ([label, note, style]) => `<span class="kc">${touch || style === 'icon'
    ? `<span class="btn ${style ?? ''}">${esc(label)}</span>` : `<kbd${label.length > 3 ? ' class="wide"' : ''}>${esc(label)}</kbd>`}${note ? `<small>${esc(note)}</small>` : ''}</span>`;
  const item = (it) => {
    if ((it.desk && touch) || (it.touch && !touch)) return '';
    const keys = touch ? it.b ?? [] : it.k ?? [];
    const who = (label, text) => text ? `<div class="hwho"><span>${label}</span> ${esc(text)}</div>` : '';
    const off = it.call && !voiceOn ? `<div class="hwho"><span>Spenta:</span> accendi la modalità vocale (${touch ? '💬' : '7'}).</div>` : '';
    const voice = voiceOn && it.v ? `<div class="hvoice">🎤 ${it.v.map((p) => `«${esc(p)}»`).join(' · ')}</div>` : '';
    return `<div class="hitem"><div class="hkeys">${keys.map(cap).join('') || '<span class="kc"><small>da solo</small></span>'}</div>`
      + `<div class="htext"><b>${esc(it.t)}</b><p>${esc((touch && it.dt) || it.d)}</p>${who('Tu:', it.you)}${who('Equipaggio:', it.crew)}${off}${voice}</div></div>`;
  };
  body.innerHTML = SECTIONS.map(([name, items], i) => `<section id="help${i}"><h3>${name}</h3><div class="hgrid">${items.map(item).join('')}</div></section>`).join('');
  nav.innerHTML = SECTIONS.map(([name], i) => `<button data-s="${i}">${name}</button>`).join('');
  for (const b of nav.querySelectorAll('button')) b.onclick = () => body.querySelector(`#help${b.dataset.s}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
}
