// Immagini disegnate al volo: vele, scritte su scafo e boma, schiuma, cielo.
// Le coordinate delle tele seguono la convenzione di three.js: v = 0 in basso, v = 1 in alto.
import * as THREE from './vendor/three.module.min.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Le due barche della scuola. */
export const BOATS = [
  { name: 'SPORTACTION NERA', sails: 'black' },
  { name: 'SPORTACTION BIANCA · ITA 09', sails: 'white' },
];

// genoa della Protagonist 7.50 (certificato ORC): inferitura 8,70 m, base 3,83 m (LP 3,59)
const JIB_FOOT = 3.83, LUFF = 8.7;
/** Larghezza della randa (m) alla frazione f dell'inferitura: base 3,40, poi 2,98 / 2,35 / 1,40 / 0,82 a 1/4, 1/2, 3/4, 7/8
 *  e 0,20 in testa (certificato ORC: 18,15 m²). Interpolata dolcemente fra le misure. */
const MAIN_W = [[0, 3.40], [0.25, 2.98], [0.5, 2.35], [0.75, 1.40], [0.875, 0.82], [1, 0.20]];
export function mainChord(f) {
  const x = Math.min(1, Math.max(0, f));
  let i = 0;
  while (i < MAIN_W.length - 2 && x > MAIN_W[i + 1][0]) i++;
  const [f0, w0] = MAIN_W[i], [f1, w1] = MAIN_W[i + 1], t = (x - f0) / (f1 - f0);
  // Catmull-Rom tra i punti vicini, per una balumina senza spigoli
  const wm = (MAIN_W[i - 1] ?? MAIN_W[i])[1], wp = (MAIN_W[i + 2] ?? MAIN_W[i + 1])[1];
  return 0.5 * ((2 * w0) + (-wm + w1) * t + (2 * wm - 5 * w0 + 4 * w1 - wp) * t * t + (-wm + 3 * w0 - 3 * w1 + wp) * t * t * t);
}

/** Logo della scuola in alto sulla randa nera: si carica all'avvio, prima di disegnare le vele. */
let sailLogo = null;
export function loadSailLogo(url = 'img/logo-randa.png') {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { sailLogo = img; resolve(); };
    img.onerror = () => resolve();                     // senza logo la randa resta nera
    img.src = url;
  });
}

/** Tela delle vele: ferzi, strisce, scritte. main = randa, altrimenti fiocco. */
export function sailTexture(style, main) {
  const W = 512, H = 1024;
  const [c, g] = canvas(W, H);
  const black = style === 'black';
  g.fillStyle = black ? '#1b1c1f' : '#f3f3f0';
  g.fillRect(0, 0, W, H);
  if (black) {
    // laminato: fibre diagonali
    g.strokeStyle = 'rgba(70,70,74,0.45)';
    g.lineWidth = 1;
    for (let k = -H; k < W + H; k += 26) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + H * 0.6, H); g.moveTo(k, 0); g.lineTo(k - H * 0.6, H); g.stroke();
    }
  }
  // ferzi
  g.fillStyle = black ? '#2b2c30' : '#d8d8d4';
  for (let k = 1; k < 8; k++) g.fillRect(0, H * k / 8, W, 3);
  // nastri su inferitura, balumina e base
  g.fillStyle = black ? '#38393d' : '#d0d0cc';
  g.fillRect(0, 0, 10, H); g.fillRect(W - 10, 0, 10, H); g.fillRect(0, H - 16, W, 16);
  const yOf = (f) => H * (1 - f);

  if (black) {
    // strisce di profilo blu e rossa
    for (const [f, col] of [[0.72, '#3366f2'], [0.45, '#3366f2'], [0.2, '#d92626']]) {
      g.strokeStyle = col; g.lineWidth = 5;
      g.beginPath(); g.moveTo(12, yOf(f));
      g.bezierCurveTo(W * 0.3, yOf(f) - 16, W * 0.55, yOf(f) - 6, W * 0.78, yOf(f) + 6); g.stroke();
    }
  }
  if (main) {
    if (!black) {
      // nastro rosso sull'inferitura e righe nere orizzontali, come sulla randa ITA 09
      g.fillStyle = '#c8302c'; g.fillRect(0, 0, 6, H);
      g.fillStyle = '#151515';
      for (const f of [0.28, 0.5, 0.73]) g.fillRect(W * 0.04, yOf(f), W * 0.9, 5);
    }
    // filetti rossi sulla balumina e tasche delle stecche
    g.fillStyle = '#e31f1f';
    for (const f of [0.25, 0.42, 0.6, 0.78, 0.9]) g.fillRect(W - 40, yOf(f), 36, 5);
    g.fillStyle = black ? '#2b2c30' : '#e2e2de';
    for (const f of [0.22, 0.42, 0.62, 0.82]) g.fillRect(W * 0.62, yOf(f) - 6, W * 0.36, 12);
    if (sailLogo) {
      // logo vicino alla penna, alto 0,6 m: la tela segue la corda, quindi lo si allarga per restare proporzionato
      const f = 0.8, hM = 0.6, wM = hM * sailLogo.width / sailLogo.height;
      const pxW = W / mainChord(f), pxH = H / 8.5;
      g.drawImage(sailLogo, W * 0.44 - wM * pxW / 2, yOf(f) - hM * pxH / 2, wM * pxW, hM * pxH);
    }
    if (!black) {
      // la tela segue la corda, che si stringe salendo: le scritte si allargano per restare proporzionate
      const write = (text, f, size, color, font, x = 0.5) => {
        const sx = (W / mainChord(f)) / (H / 8.5);
        g.save();
        g.translate(W * x, yOf(f));
        g.scale(sx, 1);
        g.font = `${size}px ${font}`;
        g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, 0, 0);
        g.restore();
      };
      write('ITA 09', 0.53, 64, '#141414', '600 "Helvetica Neue", Arial, sans-serif', 0.52);
      write('target', 0.24, 52, '#3a3a3a', '500 "Avenir Next", "Helvetica Neue", Arial, sans-serif', 0.6);
      g.fillStyle = '#c9d82b';
      g.beginPath(); g.arc(W * 0.555, yOf(0.24) - 2, 5, 0, Math.PI * 2); g.fill();
    }
  } else if (black) {
    // SPORTACTION.IT in verticale, dall'alto verso il basso, lettere rivolte verso la balumina
    const capH = 72, letterM = 0.36;
    let f = 0.74;
    g.font = 'bold 100px "Helvetica Neue Condensed Black", "HelveticaNeue-CondensedBlack", "Arial Narrow", Impact, sans-serif';
    for (const ch of 'SPORTACTION.IT') {
      const adv = g.measureText(ch).width;
      const wM = adv / capH * letterM;
      const chord = JIB_FOOT * (1 - f) + 0.08;
      g.save();
      g.translate(W * 0.5, yOf(f));
      g.rotate(Math.PI / 2);
      g.scale((H / LUFF) * letterM / capH, (W / chord) * letterM / capH);
      g.fillStyle = '#f7f7f7'; g.textBaseline = 'middle';
      g.fillText(ch, 0, 0);
      g.restore();
      f -= wM / LUFF;
    }
  } else {
    // fiocco bianco: fascia anti-UV blu su balumina e base
    g.fillStyle = '#20408c';
    g.fillRect(W - 34, 0, 34, H); g.fillRect(0, H - 30, W, 30);
  }
  return tex(c);
}

/** Spinnaker della scuola: giallo con la fascia blu, la scritta SPORTACTION.IT e il logo (u = dall'inferitura alla balumina, v = dalla base alla penna). */
export function spiTexture() {
  const W = 1024, H = 1024;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#ffc20e'; g.fillRect(0, 0, W, H);
  // ferzi a raggiera dalla penna
  g.strokeStyle = 'rgba(150,100,0,0.22)'; g.lineWidth = 3;
  for (let k = 1; k < 10; k++) { g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W * k / 10, H); g.stroke(); }
  for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(0, H * k / 6); g.lineTo(W, H * k / 6); g.stroke(); }
  // fascia blu curva, come nel logo
  g.fillStyle = '#0b63a8';
  g.beginPath(); g.moveTo(0, H * 0.78); g.quadraticCurveTo(W * 0.5, H * 0.5, W, H * 0.66);
  g.lineTo(W, H * 0.8); g.quadraticCurveTo(W * 0.5, H * 0.66, 0, H * 0.92); g.closePath(); g.fill();
  g.font = 'bold 74px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(W * 0.5, H * 0.715); g.rotate(-0.05); g.fillText('SPORTACTION.IT', 0, 0); g.restore();
  if (sailLogo) {
    // la A e' gialla come la vela: le si mette dietro un disco bianco
    const h = H * 0.22, w = h * sailLogo.width / sailLogo.height;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(W * 0.5, H * 0.3, h * 0.78, 0, Math.PI * 2); g.fill();
    g.drawImage(sailLogo, W * 0.5 - w / 2, H * 0.3 - h / 2, w, h);
  }
  // nastri sui bordi
  g.fillStyle = 'rgba(11,99,168,0.9)'; g.fillRect(0, 0, 12, H); g.fillRect(W - 12, 0, 12, H); g.fillRect(0, H - 16, W, 16);
  return tex(c);
}

/** Tormentina: tela pesante arancione (si vede bene col brutto tempo), con cuciture e nastri. */
export function stormTexture() {
  const W = 512, H = 1024;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#ff6b10'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#d9540a';
  for (let k = 1; k < 6; k++) g.fillRect(0, H * k / 6, W, 4);
  g.fillStyle = '#1f1f1f';
  g.fillRect(0, 0, 14, H); g.fillRect(0, H - 20, W, 20); g.fillRect(W - 12, 0, 12, H);
  return tex(c);
}

/**
 * Scafo: carena nera sotto la linea di galleggiamento e scritte sulle mure.
 * u: meta' sinistra dell'immagine = murata di dritta (prua verso u = 0,5), meta' destra = sinistra.
 * v = (y + 0,45) / 1,6.
 */
export function hullTexture(style) {
  const W = 2048, H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#f4f5f6'; g.fillRect(0, 0, W, H);
  const yPx = (y) => H * (1 - (y + 0.45) / 1.6);
  g.fillStyle = '#101114'; g.fillRect(0, yPx(0.05), W, H);
  const sx = (W / 2 / 7.9) / (H / 1.6);
  const put = (text, t, y, font, color) => {
    for (const half of [0, 1]) {
      const u = half === 0 ? 0.5 * (1 - t) : 0.5 + 0.5 * t;
      g.save();
      g.translate(W * u, yPx(y)); g.scale(sx, 1);
      g.font = font; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 0, 0);
      g.restore();
    }
  };
  if (style === 'black') {
    put('SPORTACTION', 0.24, 0.6, 'italic bold 64px "Helvetica Neue", Arial, sans-serif', '#142a6b');
  } else {
    put('SPORTACTION', 0.2, 0.55, 'bold 58px "DIN Condensed", "Arial Narrow", Impact, sans-serif', '#8ea2b4');
    put('pegaso', 0.8, 0.42, '500 40px "Avenir Next", Arial, sans-serif', '#2b6b4a');
  }
  return tex(c);
}

/** Boma bianco con la scritta SPORTACTION centrata in "center" (0...1). */
/** Fianco della boa gonfiabile da regata (alta 2,2 m, 1 m di raggio): spicchi, fascia SPORTACTION, linea di galleggiamento. */
export function markTexture() {
  const W = 2048, H = 512, perM = H / 2.2;
  const [c, g] = canvas(W, H);
  const yPx = (y) => H * (1 - (y + 0.25) / 2.2);                       // y = metri sopra l'acqua
  const body = g.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, '#ffd23a'); body.addColorStop(0.75, '#ffc20e'); body.addColorStop(1, '#e9a800');
  g.fillStyle = body; g.fillRect(0, 0, W, H);
  // spicchi del gonfiabile
  for (let i = 0; i < 8; i++) {
    const x = W * i / 8;
    const sh = g.createLinearGradient(x, 0, x + W / 8, 0);
    sh.addColorStop(0, 'rgba(120,70,0,0.16)'); sh.addColorStop(0.18, 'rgba(255,255,255,0.05)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.10)'); sh.addColorStop(1, 'rgba(120,70,0,0.10)');
    g.fillStyle = sh; g.fillRect(x, 0, W / 8, H);
  }
  // fascia bianca con la scritta, ripetuta tre volte intorno
  g.fillStyle = '#f7f7f5'; g.fillRect(0, yPx(1.45), W, yPx(1.0) - yPx(1.45));
  const sx = (W / (2 * Math.PI * 1.0)) / perM;
  for (let k = 0; k < 3; k++) {
    g.save();
    g.translate(W * (k + 0.5) / 3, yPx(1.225)); g.scale(sx, 1);
    g.font = 'italic bold 64px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = '#142a6b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SPORTACTION', 0, 2);
    g.restore();
  }
  // piede scuro, bagnato
  const foot = g.createLinearGradient(0, yPx(0.25), 0, H);
  foot.addColorStop(0, 'rgba(60,45,10,0)'); foot.addColorStop(1, 'rgba(60,45,10,0.55)');
  g.fillStyle = foot; g.fillRect(0, yPx(0.25), W, H - yPx(0.25));
  return tex(c);
}

export function boomTexture(center) {
  const W = 1024, H = 44;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, W, H);
  g.save();
  g.translate(W * center, H / 2);
  g.scale((W / 3.35) / (H / 0.14), 1);
  g.font = 'italic bold 30px "Helvetica Neue", Arial, sans-serif';
  g.fillStyle = '#142a6b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SPORTACTION', 0, 0);
  g.restore();
  return tex(c);
}

/** Schiuma a chiazze (la trasparenza la calcola lo shader). */
export function foamTexture() {
  const N = 64;
  const [c, g] = canvas(N, N);
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    const v = 0.35 + 0.65 * (0.5 + 0.25 * Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2) + 0.25 * Math.sin(y * 1.3 + x * 0.4));
    const b = Math.max(0, Math.min(255, v * 255));
    img.data.set([b, b, b, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Goccia di spruzzo. */
export function dropTexture() {
  const [c, g] = canvas(32, 32);
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return tex(c);
}

// --- cielo -----------------------------------------------------------------------------------------
function hash(x, y, z) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
           l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
export function fbm(x, y, z) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += a * noise3(x * f, y * f, z * f); a *= 0.5; f *= 2.1; }
  return s / 0.9375;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Direzione (x = est, y = su, z = sud) di un azimut/altezza in gradi. */
export function skyDir(az, el) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

/** Cielo equirettangolare con sole e cumuli bassi sull'orizzonte. */
export function skyTexture(sunAz, sunEl, width = 1024) {
  const W = width, H = width / 2;
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  const sun = skyDir(sunAz, sunEl);
  for (let y = 0; y < H; y++) {
    const el = 90 - (y + 0.5) / H * 180;
    const e = el * Math.PI / 180, ce = Math.cos(e), se = Math.sin(e);
    for (let x = 0; x < W; x++) {
      // three.js: u = 0,5 guarda verso -Z (nord); azimut crescente verso est (+X)
      const az = ((x + 0.5) / W) * 360 - 90;
      const a = az * Math.PI / 180;
      let r, gg, b;
      if (el >= 0) {
        const t = Math.pow(1 - el / 90, 3.2);
        r = 0.16 + (0.70 - 0.16) * t; gg = 0.38 + (0.80 - 0.38) * t; b = 0.74 + (0.88 - 0.74) * t;
        const band = smooth(1, 4, el) * (1 - smooth(14, 30, el));
        if (band > 0) {
          const cloud = smooth(0.52, 0.72, fbm(Math.cos(a) * 6, Math.sin(a) * 6, el / 7)) * band;
          const shade = (0.78 + 0.22 * smooth(0, 18, el)) * 0.97;
          r += (shade - r) * cloud * 0.92; gg += (shade - gg) * cloud * 0.92; b += (shade * 0.99 - b) * cloud * 0.92;
        }
      } else {
        const k = Math.min(1, -el / 25);
        r = 0.55 + (0.12 - 0.55) * k; gg = 0.64 + (0.18 - 0.64) * k; b = 0.70 + (0.24 - 0.70) * k;
      }
      const dx = Math.sin(a) * ce, dz = -Math.cos(a) * ce;
      const cs = Math.max(0, dx * sun.x + se * sun.y + dz * sun.z);
      const glow = Math.pow(cs, 900) * 6 + Math.pow(cs, 12) * 0.25;
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, (r + glow) * 255);
      img.data[i + 1] = Math.min(255, (gg + glow * 0.92) * 255);
      img.data[i + 2] = Math.min(255, (b + glow * 0.75) * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = tex(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
