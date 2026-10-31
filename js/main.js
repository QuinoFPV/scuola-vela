// Scuola di Vela — versione web. Avvio, comandi, menu e ciclo di gioco.
import * as THREE from './vendor/three.module.min.js';
import { Lake } from './lake.js';
import { Simulation, WINDS } from './sim.js';
import { World } from './world.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { Voice } from './voice.js';
import { Ear } from './listen.js';
import { BOATS, loadSailLogo } from './textures.js';
import { clamp, norm180, twaOf, speedKn, Spec } from './physics.js';

const $ = (id) => document.getElementById(id);

// telefono o tablet: comandi a dito e grafica piu' leggera (?touch=1 o ?touch=0 per provarlo)
const params = new URLSearchParams(location.search);
const TOUCH = params.has('touch') ? params.get('touch') !== '0' : matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', TOUCH);

async function loadData() {
  const files = ['terrain.bin', 'lake.bin', 'info.json', 'trees.bin', 'houses.bin'];
  let done = 0;
  const cache = {};
  await Promise.all([loadSailLogo(), ...files.map(async (f) => {
    const r = await fetch('data/' + f);
    if (!r.ok) throw new Error('manca data/' + f);
    cache[f] = await r.arrayBuffer();
    done++;
    $('loadBar').style.width = `${done / files.length * 70}%`;
  })]);
  return Lake.load(async (name) => cache[name]);
}

async function main() {
  const lake = await loadData();
  $('loadText').textContent = 'Preparo il lago…';
  await new Promise((r) => setTimeout(r, 30));

  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // su Retina 1,5x basta e alleggerisce molto; sui telefoni scende da sola se i fotogrammi non bastano
  const maxRatio = Math.min(window.devicePixelRatio, 1.5), minRatio = Math.min(window.devicePixelRatio, 1);
  let ratio = maxRatio;
  renderer.setPixelRatio(ratio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = TOUCH ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

  const sim = new Simulation(lake);
  sim.settings.boat = 0;
  sim.autoTrim = true;                         // si parte sempre con le vele regolate in automatico
  const world = new World(renderer, lake, { light: TOUCH });
  const hud = new HUD(lake, TOUCH);
  const audio = new Audio();
  const voice = new Voice();
  sim.settings.voices = voice.mode;
  const showSound = () => {
    $('sound').classList.toggle('muted', audio.muted);
    $('sound').title = (audio.muted ? 'Audio spento: tocca per accenderlo' : 'Audio acceso: tocca per spegnerlo') + (TOUCH ? '' : ' (M)');
  };
  showSound();
  // l'allievo chiama le manovre al microfono; le parole capite compaiono sopra la barca
  let deniedSaid = false;
  const ear = new Ear((k) => {
    if (overlay || sim.paused) return;
    if (k === 'tack' || k === 'gybe') sim.announce(k, true);
    else sim.helmGo(k === 'goTack' ? 'tack' : 'gybe');
  }, (text) => { hud.heard = { text, at: performance.now() / 1000 }; }, showMic);
  function showMic() {
    const b = $('mic');
    b.classList.toggle('on', ear.listening);
    b.classList.toggle('wait', ear.wanted && !ear.listening);
    b.classList.toggle('na', !ear.supported || ear.denied);
    b.title = !ear.supported ? 'Questo browser non sa ascoltare: usa Safari o Chrome'
      : ear.denied ? 'Microfono non concesso: permettilo nelle impostazioni del browser'
      : ear.wanted ? 'Ti ascolto: «pronti a virare?», poi «viro!» (tocca per spegnere)' : 'Chiama le manovre a voce: tocca per accendere il microfono';
    if (ear.denied && !deniedSaid) { deniedSaid = true; sim.say('MICROFONO NON CONCESSO: PERMETTILO NELLE IMPOSTAZIONI DEL BROWSER', 'warn'); }
  }
  showMic();
  $('loadBar').style.width = '100%';

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    world.camera.aspect = w / h;
    world.camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // --- comandi ------------------------------------------------------------------------------
  const keys = new Set();
  let overlay = 'menu', helpReturn = 'menu', mouseTarget = null, drag = null, demo = 0;
  let centering = false;                       // freccia giu': la barra va al centro, esattamente a zero, anche con un tocco
  const show = (kind) => {
    overlay = kind;
    document.body.classList.toggle('sailing', !kind);
    $('menu').style.display = kind === 'menu' ? 'flex' : 'none';
    $('help').style.display = kind === 'help' ? 'flex' : 'none';
    if (kind === 'menu') hud.showMenu(sim.settings, changeSetting);
  };
  function changeSetting(row, d) {
    const st = sim.settings;
    if (row === 0) { st.windIndex = (st.windIndex + d + WINDS.length) % WINDS.length; sim.applyWind(); }
    if (row === 1) { st.gusts = !st.gusts; sim.applyWind(); }
    if (row === 2) { st.windFrom = (st.windFrom + 1) % 2; sim.reset(); world.wake.reset(); }
    if (row === 3) st.steering = (st.steering + (d > 0 ? 1 : 2)) % 3;
    if (row === 4) { st.boat = (st.boat + 1) % BOATS.length; world.boat.setStyle(BOATS[st.boat].sails); }
    if (row === 5) st.aids = !st.aids;
    if (row === 6) st.triangle = !st.triangle;
    if (row === 7) st.dirtyAir = !st.dirtyAir;
    if (row === 8) { voice.setMode((voice.mode + (d > 0 ? 1 : 2)) % 3); st.voices = voice.mode; }
    show('menu');
  }
  // a tutto schermo e in orizzontale dove il browser lo permette (Android, iPad); l'iPhone lo fa dalla schermata Home
  const fullscreen = () => {
    const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!TOUCH || !req || document.fullscreenElement || document.webkitFullscreenElement) return;
    Promise.resolve(req.call(el, { navigationUI: 'hide' })).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  };
  const startSailing = () => {
    fullscreen();
    audio.start();
    voice.unlock();
    ear.start();                               // se era acceso l'altra volta (Safari lo accende solo da un tocco)
    sim.reset();
    sim.autoTrim = true;                       // si parte sempre con le vele regolate in automatico (T per il manuale)
    world.orbitYaw = 0; world.orbitPitch = 0; world.zoom = 1; world.wake.reset();
    show('');
  };
  $('startBtn').onclick = startSailing;
  $('helpBtn').onclick = (e) => { e.preventDefault(); helpReturn = 'menu'; show('help'); };
  $('closeHelp').onclick = () => { show(helpReturn); if (!helpReturn) sim.paused = false; };

  function command(code) {
    const st = sim.settings;
    switch (code) {
      case 'Escape': sim.paused = false; sim.replay = null; show('menu'); break;
      case 'KeyH': sim.paused = true; helpReturn = ''; show('help'); break;
      case 'Space': sim.toggleBando(); break;          // vele in bando: scotte libere, di nuovo per riprenderle
      case 'KeyK': sim.toggleBackMain(0); break;       // randa scontrata dal lato dov'e' il boma, di nuovo per mollarla
      case 'KeyY': sim.toggleFarfalla(); break;        // andatura a farfalla, di nuovo per riportare il fiocco
      case 'KeyE': sim.toggleSpi(); break;             // spinnaker: issa / ammaina
      case 'KeyU': sim.toggleCappa(); break;           // fiocco in cappa / libero
      case 'Enter': case 'NumpadEnter': sim.manOverboard(); break;   // uomo a mare: salvagente in acqua, di nuovo per annullare
      case 'Digit0': case 'Numpad0': sim.mooring(); break;          // gavitello: rientro e ormeggio, di nuovo per annullare o mollarlo
      case 'Digit9': case 'Numpad9': voice.unlock(); sim.announce('tack'); break;   // "pronti a virare?"
      case 'Digit8': case 'Numpad8': voice.unlock(); sim.announce('gybe'); break;   // "pronti a strambare?"
      case 'ArrowDown': case 'ArrowUp': centering = true; break;
      case 'KeyJ': sim.toggleBackMain(-1); break;      // ... a sinistra
      case 'KeyL': sim.toggleBackMain(1); break;       // ... a dritta
      case 'KeyF': st.triangle = !st.triangle; sim.say(st.triangle ? 'TRIANGOLO DEI VENTI: REALE, APPARENTE E VELOCITÀ DELLA BARCA' : 'TRIANGOLO DEI VENTI NASCOSTO', 'info'); break;
      case 'KeyO': st.dirtyAir = !st.dirtyAir; sim.say(st.dirtyAir ? "ARIA SPORCA: IL VENTO DISTURBATO CHE LE VELE LASCIANO SOTTOVENTO" : 'ARIA SPORCA NASCOSTA', 'info'); break;
      case 'KeyT':
        sim.autoTrim = !sim.autoTrim;
        sim.boat.bando = false;
        sim.say(sim.autoTrim ? "VELE AUTOMATICHE: L'ALLIEVO PENSA SOLO AL TIMONE" : TOUCH ? 'VELE MANUALI: CAZZA E LASCA IN BASSO A DESTRA' : 'VELE MANUALI: Q/A RANDA, W/S FIOCCO', 'info');
        break;
      case 'KeyC': world.mode = (world.mode + 1) % 4; world.orbitYaw = 0; world.orbitPitch = 0; world.zoom = 1; break;
      case 'KeyP': sim.paused = !sim.paused; break;
      case 'KeyR': if (sim.replay === null) sim.startReplay(); else sim.stopReplay(); break;
      case 'KeyI': st.aids = !st.aids; sim.say(st.aids ? "AIUTI DELL'ISTRUTTORE ATTIVI" : 'AIUTI DISATTIVATI', 'info'); break;
      case 'KeyM': audio.setMuted(!audio.muted); showSound(); break;
      case 'KeyZ': sim.reef(1); break;                 // riduce la tela: terzaroli, poi tormentina
      case 'KeyX': sim.reef(-1); break;                // la aumenta
      case 'KeyG': st.gusts = !st.gusts; sim.applyWind(); sim.say(st.gusts ? 'RAFFICHE E SALTI DI VENTO' : 'VENTO COSTANTE', 'info'); break;
      case 'KeyB':
        st.steering = (st.steering + 1) % 3;
        sim.say(['BARRA SEMPLICE: LA FRECCIA INDICA DOVE VA LA PRUA', 'BARRA REALE: SPINGI A SINISTRA E LA PRUA VA A DRITTA', 'RUOTA: SI GIRA COME UN VOLANTE'][st.steering], 'info');
        break;
      case 'KeyV': st.boat = (st.boat + 1) % BOATS.length; world.boat.setStyle(BOATS[st.boat].sails); sim.say('BARCA: ' + BOATS[st.boat].name, 'info'); break;
      case 'KeyD': st.windFrom = (st.windFrom + 1) % 2; sim.reset(); world.wake.reset(); break;
      case 'KeyN': sim.reset(); world.wake.reset(); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': case 'Digit6':
        st.windIndex = +code.slice(5) - 1; sim.applyWind(); sim.say(`VENTO ${WINDS[st.windIndex][0]}: ${WINDS[st.windIndex][1]} NODI`, 'info'); break;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    if (overlay === 'help') {
      if (e.code === 'KeyH' || e.code === 'Escape') { show(helpReturn); if (!helpReturn) sim.paused = false; }
      return;
    }
    if (overlay === 'menu') {
      const rows = hud.menuRows(sim.settings).length;
      if (e.code === 'ArrowUp') { hud.menuRow = (hud.menuRow + rows - 1) % rows; show('menu'); }
      if (e.code === 'ArrowDown') { hud.menuRow = (hud.menuRow + 1) % rows; show('menu'); }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') changeSetting(hud.menuRow, e.code === 'ArrowRight' ? 1 : -1);
      if (e.code === 'Enter' || e.code === 'Space') startSailing();
      if (e.code === 'KeyH') { helpReturn = 'menu'; show('help'); }
      return;
    }
    keys.add(e.code);
    if (e.repeat) return;
    command(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, rudder: sim.boat.rudder, button: e.button }; });
  window.addEventListener('mousemove', (e) => {
    if (!drag || overlay) return;
    if (drag.button === 2) {
      world.orbitYaw += (e.clientX - drag.x) * 0.4;
      world.orbitPitch = clamp(world.orbitPitch + (e.clientY - drag.y) * 0.3, -10, 75);
      drag.x = e.clientX; drag.y = e.clientY;
    } else {
      const invert = sim.settings.steering === 1 ? -1 : 1;
      mouseTarget = clamp(drag.rudder + (e.clientX - drag.x) / 160 * 30 * invert, -Spec.rudderMax, Spec.rudderMax);
    }
  });
  window.addEventListener('mouseup', () => { drag = null; mouseTarget = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    // a scatti esponenziali: anche una rotella velocissima non porta lo zoom a zero o sotto
    if (Number.isFinite(e.deltaY)) world.zoom = clamp(world.zoom * Math.exp(clamp(e.deltaY, -400, 400) * 0.001), 0.35, 5);
  }, { passive: false });

  // --- comandi a dito ---------------------------------------------------------------------------
  // il dito resta "agganciato" al comando anche se esce dal suo riquadro
  const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch { /* puntatore gia' sparito */ } };
  // scena: un dito gira intorno alla barca, due dita avvicinano o allontanano
  const fingers = new Map();
  let pinch = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();                                // niente finti clic del mouse dopo il tocco
    capture(canvas, e);
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = fingers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    fingers.set(e.pointerId, cur);
    if (overlay) return;
    if (fingers.size === 1) {
      world.orbitYaw += (cur.x - prev.x) * 0.4;
      world.orbitPitch = clamp(world.orbitPitch + (cur.y - prev.y) * 0.3, -10, 75);
    } else if (fingers.size === 2) {
      const [a, b] = [...fingers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch && d > 1) world.zoom = clamp(world.zoom * pinch / d, 0.35, 5);
      pinch = d;
    }
  });
  const lift = (e) => { fingers.delete(e.pointerId); pinch = null; };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  document.addEventListener('gesturestart', (e) => e.preventDefault());      // Safari: niente zoom della pagina

  // barra del timone: il dito sposta la barra, che resta dove la si lascia
  const tiller = $('tiller');
  let tillerSet = null, tillerDown = false;
  const tillerAt = (e) => {
    const r = tiller.getBoundingClientRect(), pad = 26;
    let v = clamp((e.clientX - r.left - pad) / (r.width - 2 * pad) * 2 - 1, -1, 1);
    if (Math.abs(v) < 0.06) v = 0;
    tillerSet = v * Spec.rudderMax * (sim.settings.steering === 1 ? -1 : 1);
  };
  tiller.addEventListener('pointerdown', (e) => { e.preventDefault(); capture(tiller, e); tillerDown = true; tiller.classList.add('held'); tillerAt(e); });
  tiller.addEventListener('pointermove', (e) => { if (tillerDown) tillerAt(e); });
  const tillerUp = () => { tillerDown = false; tiller.classList.remove('held'); };
  tiller.addEventListener('pointerup', tillerUp);
  tiller.addEventListener('pointercancel', tillerUp);

  // scotte: cazza e lasca finché si tiene premuto
  const held = { main: 0, jib: 0 };
  for (const b of document.querySelectorAll('#sheets [data-hold]')) {
    const sail = b.dataset.hold, d = +b.dataset.d;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); capture(b, e); held[sail] = d; b.classList.add('held'); });
    const off = () => { if (held[sail] === d) held[sail] = 0; b.classList.remove('held'); };
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('lostpointercapture', off);
  }
  // la barra dei pulsanti fa le veci dei tasti; toccando gli strumenti si vedono tutti i dati
  for (const b of document.querySelectorAll('#tbar button, #sheets .acts button, #sheets .calls button')) b.addEventListener('click', () => command(b.dataset.k));
  // senza fuoco sul pulsante: la barra spaziatrice resta "vele in bando" e non riaccende l'audio
  $('sound').addEventListener('mousedown', (e) => e.preventDefault());
  $('sound').addEventListener('click', (e) => { e.stopPropagation(); command('KeyM'); });    // senza aprire gli strumenti
  $('mic').addEventListener('mousedown', (e) => e.preventDefault());
  $('mic').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!ear.supported) { sim.say('QUESTO BROWSER NON SA ASCOLTARE: USA SAFARI O CHROME', 'warn'); return; }
    deniedSaid = false;
    ear.toggle();
    sim.say(ear.wanted ? "MICROFONO ACCESO: DI' «PRONTI A VIRARE?» E DOPO IL «PRONTI!» «VIRO!»" : 'MICROFONO SPENTO', 'info');
  });
  $('instruments').addEventListener('click', () => { if (TOUCH) $('instruments').classList.toggle('open'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ear.stop(); else ear.start();
    if (!audio.ctx) return;
    if (document.hidden) audio.ctx.suspend(); else audio.ctx.resume();
  });

  function controls() {
    const c = { tiller: 0, tillerFine: false, tillerTarget: mouseTarget, main: 0, jib: 0 };
    const invert = sim.settings.steering === 1 ? -1 : 1;
    if (keys.has('ArrowLeft')) c.tiller -= invert;
    if (keys.has('ArrowRight')) c.tiller += invert;
    c.tillerFine = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (tillerSet !== null) {
      c.tillerTarget = tillerSet;
      if (!tillerDown && Math.abs(sim.boat.rudder - tillerSet) < 0.5) tillerSet = null;     // arrivata: resta li'
    }
    // la barra va al centro finche' non arriva a zero; la si riprende con le frecce, il mouse o il dito
    if (keys.has('ArrowLeft') || keys.has('ArrowRight') || mouseTarget !== null || tillerDown) centering = false;
    if (centering) {
      c.tillerTarget = 0;
      if (sim.boat.rudder === 0) centering = false;
    }
    c.main += held.main; c.jib += held.jib;
    if (keys.has('KeyQ')) c.main += 1;
    if (keys.has('KeyA')) c.main -= 1;
    if (keys.has('KeyW')) c.jib += 1;
    if (keys.has('KeyS')) c.jib -= 1;
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find((p) => p) : null;
    if (pad) {
      const x = pad.axes[0] || 0;
      if (Math.abs(x) > 0.12) { c.tillerTarget = x * 30 * invert; centering = false; }
      c.main += (pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0);
      if (pad.buttons[5]?.pressed) c.jib += 1;
      if (pad.buttons[4]?.pressed) c.jib -= 1;
    }
    return c;
  }

  // --- ciclo ------------------------------------------------------------------------------
  show('menu');
  $('loading').style.display = 'none';
  let last = performance.now(), fpsT = 0, frames = 0, fastWindows = 0;
  function frame(now) {
    const raw = (now - last) / 1000;
    const dt = clamp(raw, 0, 0.05);                       // il primo fotogramma puo' arrivare "prima" dell'avvio
    last = now;
    let c = controls();
    if (overlay === 'menu') {
      // dietro al menu la barca naviga da sola
      demo += dt;
      c = { tillerTarget: clamp(norm180(twaOf(sim.boat) - 70) * 1.2 - sim.boat.r * 0.8, -20, 20) };
      world.orbitYaw = 35 + Math.sin(demo * 0.05) * 50;
    }
    sim.update(dt, c);
    world.update(sim, dt, now / 1000);
    voice.update(sim, !overlay && !sim.paused && sim.replay === null && !document.hidden, audio.muted);
    for (const e of sim.events) if (e.type === 'gybe' || e.type === 'tack') audio.boom(e.type === 'gybe' && e.violent);
    const s = sim.shown, quiet = sim.paused || sim.replay !== null;
    audio.set({ aws: quiet ? 0 : s.aws, speed: quiet ? 0 : speedKn(s), luff: quiet ? 0 : Math.max(s.mainLuff, s.jibLuff * (1 - s.jibFurl), s.spiLuff * s.spiUp), winching: (c.main || 0) > 0 || (c.jib || 0) > 0 }, dt);
    hud.refresh(sim, world, now / 1000);
    renderer.render(world.scene, world.camera);
    frames++; fpsT += Math.max(0, raw);
    if (fpsT > 2) {
      const fps = window.__fps = frames / fpsT;
      frames = 0; fpsT = 0;
      // telefoni e tablet: meno pixel se la scena non sta dietro ai 60 fotogrammi, di nuovo di piu' se avanza
      if (TOUCH && !document.hidden) {
        if (fps < 40 && ratio > minRatio) { ratio = Math.max(minRatio, ratio * 0.85); renderer.setPixelRatio(ratio); fastWindows = 0; }
        else if (fps > 56 && ratio < maxRatio && ++fastWindows >= 3) { ratio = Math.min(maxRatio, ratio * 1.1); renderer.setPixelRatio(ratio); fastWindows = 0; }
        window.__ratio = ratio;
      }
    }
    requestAnimationFrame(frame);
  }
  window.__sim = sim; window.__world = world; window.__voice = voice; window.__ear = ear;
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  $('loadText').textContent = 'Errore: ' + e.message + ' (serve un server web: vedi LEGGIMI)';
});
