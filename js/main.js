// Scuola di Vela — versione web. Avvio, comandi, menu e ciclo di gioco.
import * as THREE from './vendor/three.module.min.js';
import { Lake } from './lake.js';
import { Simulation, WINDS } from './sim.js';
import { World } from './world.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { BOATS } from './textures.js';
import { clamp, norm180, twaOf, speedKn, Spec } from './physics.js';

const $ = (id) => document.getElementById(id);

async function loadData() {
  const files = ['terrain.bin', 'lake.bin', 'info.json', 'trees.bin', 'houses.bin'];
  let done = 0;
  const cache = {};
  await Promise.all(files.map(async (f) => {
    const r = await fetch('data/' + f);
    if (!r.ok) throw new Error('manca data/' + f);
    cache[f] = await r.arrayBuffer();
    done++;
    $('loadBar').style.width = `${done / files.length * 70}%`;
  }));
  return Lake.load(async (name) => cache[name]);
}

async function main() {
  const lake = await loadData();
  $('loadText').textContent = 'Preparo il lago…';
  await new Promise((r) => setTimeout(r, 30));

  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));     // su Retina 1,5x basta e alleggerisce molto
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const sim = new Simulation(lake);
  sim.settings.boat = 0;
  sim.autoTrim = true;                         // si parte sempre con le vele regolate in automatico
  const world = new World(renderer, lake);
  const hud = new HUD(lake);
  const audio = new Audio();
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
  const show = (kind) => {
    overlay = kind;
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
    show('menu');
  }
  const startSailing = () => {
    audio.start();
    sim.reset();
    sim.autoTrim = true;                       // si parte sempre con le vele regolate in automatico (T per il manuale)
    world.orbitYaw = 0; world.orbitPitch = 0; world.zoom = 1; world.wake.reset();
    show('');
  };
  $('startBtn').onclick = startSailing;
  $('helpBtn').onclick = () => { helpReturn = 'menu'; show('help'); };
  $('closeHelp').onclick = () => { show(helpReturn); if (!helpReturn) sim.paused = false; };

  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    if (overlay === 'help') {
      if (e.code === 'KeyH' || e.code === 'Escape') { show(helpReturn); if (!helpReturn) sim.paused = false; }
      return;
    }
    if (overlay === 'menu') {
      if (e.code === 'ArrowUp') { hud.menuRow = (hud.menuRow + 5) % 6; show('menu'); }
      if (e.code === 'ArrowDown') { hud.menuRow = (hud.menuRow + 1) % 6; show('menu'); }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') changeSetting(hud.menuRow, e.code === 'ArrowRight' ? 1 : -1);
      if (e.code === 'Enter' || e.code === 'Space') startSailing();
      if (e.code === 'KeyH') { helpReturn = 'menu'; show('help'); }
      return;
    }
    keys.add(e.code);
    if (e.repeat) return;
    const st = sim.settings;
    switch (e.code) {
      case 'Escape': sim.paused = false; sim.replay = null; show('menu'); break;
      case 'KeyH': sim.paused = true; helpReturn = ''; show('help'); break;
      case 'KeyT': sim.autoTrim = !sim.autoTrim; sim.say(sim.autoTrim ? "VELE AUTOMATICHE: L'ALLIEVO PENSA SOLO AL TIMONE" : 'VELE MANUALI: Q/A RANDA, W/S FIOCCO', 'info'); break;
      case 'KeyC': world.mode = (world.mode + 1) % 4; world.orbitYaw = 0; world.orbitPitch = 0; world.zoom = 1; break;
      case 'KeyP': sim.paused = !sim.paused; break;
      case 'KeyR': if (sim.replay === null) sim.startReplay(); else sim.stopReplay(); break;
      case 'KeyI': st.aids = !st.aids; sim.say(st.aids ? "AIUTI DELL'ISTRUTTORE ATTIVI" : 'AIUTI DISATTIVATI', 'info'); break;
      case 'KeyM': audio.muted = !audio.muted; break;
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
        st.windIndex = +e.code.slice(5) - 1; sim.applyWind(); sim.say(`VENTO ${WINDS[st.windIndex][0]}: ${WINDS[st.windIndex][1]} NODI`, 'info'); break;
    }
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
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); world.zoom = clamp(world.zoom * (1 + e.deltaY * 0.001), 0.35, 5); }, { passive: false });

  function controls() {
    const c = { tiller: 0, tillerFine: false, tillerTarget: mouseTarget, centerTiller: keys.has('ArrowUp'), main: 0, jib: 0 };
    const invert = sim.settings.steering === 1 ? -1 : 1;
    if (keys.has('ArrowLeft')) c.tiller -= invert;
    if (keys.has('ArrowRight')) c.tiller += invert;
    c.tillerFine = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (keys.has('KeyQ')) c.main += 1;
    if (keys.has('KeyA')) c.main -= 1;
    if (keys.has('KeyW')) c.jib += 1;
    if (keys.has('KeyS')) c.jib -= 1;
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find((p) => p) : null;
    if (pad) {
      const x = pad.axes[0] || 0;
      if (Math.abs(x) > 0.12) c.tillerTarget = x * 30 * invert;
      c.main += (pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0);
      if (pad.buttons[5]?.pressed) c.jib += 1;
      if (pad.buttons[4]?.pressed) c.jib -= 1;
    }
    return c;
  }

  // --- ciclo ------------------------------------------------------------------------------
  show('menu');
  $('loading').style.display = 'none';
  let last = performance.now(), fpsT = 0, frames = 0;
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);       // il primo fotogramma puo' arrivare "prima" dell'avvio
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
    for (const e of sim.events) if (e.type === 'gybe' || e.type === 'tack') audio.boom(e.type === 'gybe' && e.violent);
    const s = sim.shown, quiet = sim.paused || sim.replay !== null;
    audio.set({ aws: quiet ? 0 : s.aws, speed: quiet ? 0 : speedKn(s), luff: quiet ? 0 : Math.max(s.mainLuff, s.jibLuff), winching: (c.main || 0) > 0 || (c.jib || 0) > 0 }, dt);
    hud.refresh(sim, world, now / 1000);
    renderer.render(world.scene, world.camera);
    frames++; fpsT += dt;
    if (fpsT > 1) { window.__fps = frames / fpsT; frames = 0; fpsT = 0; }
    requestAnimationFrame(frame);
  }
  window.__sim = sim; window.__world = world;
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  $('loadText').textContent = 'Errore: ' + e.message + ' (serve un server web: vedi LEGGIMI)';
});
