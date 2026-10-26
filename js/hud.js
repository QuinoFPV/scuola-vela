// Strumenti e indicazioni sopra la scena: pannelli HTML e piccoli disegni su canvas.
import { rad, clamp, len, sub, bearing, idealSheets, speedKn, twaOf, leeway, vmg, SAIL_PLANS, Spec } from './physics.js';
import { Coach, WINDS, DIRECTIONS, STEERING, MARK_NAMES } from './sim.js';
import { CAMERAS } from './world.js';
import { BOATS } from './textures.js';

const COLORS = { good: '#73ff80', warn: '#ffd94d', bad: '#ff6b61', info: '#ffffff' };
const $ = (id) => document.getElementById(id);

function hiDPI(canvas, w, h, maxK = 4) {
  const k = Math.min(window.devicePixelRatio || 1, maxK);
  canvas.width = w * k; canvas.height = h * k;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const g = canvas.getContext('2d');
  g.setTransform(k, 0, 0, k, 0, 0);
  return g;
}

export class HUD {
  constructor(lake, touch = false) {
    this.lake = lake;
    this.touch = touch;                      // telefono o tablet: comandi a dito, niente nomi dei tasti
    const k = touch ? 2 : 4;                 // sui telefoni (3x) basta il doppio
    this.dial = hiDPI($('dial'), 270, 290, k);
    this.map = hiDPI($('map'), 200, 220, k);
    this.tell = hiDPI($('tellCanvas'), 226, 96, k);
    this.helm = hiDPI($('helmCanvas'), 230, 104, k);
    this.menuRow = 0;
    this.textTime = -1;
    this.phone = matchMedia('(max-height: 520px)');       // telefono in orizzontale: strumenti ridotti
  }

  /** Scrive solo se cambia: sui telefoni ogni ritocco della pagina costa. */
  static put(id, text, prop = 'textContent') {
    const el = $(id);
    if (el[prop] !== text) el[prop] = text;
    return el;
  }

  refresh(sim, world, time) {
    const s = sim.shown, aids = sim.settings.aids, twa = twaOf(s);
    if (this.touch) this.refreshTouch(sim, s, world);
    // i testi bastano 10 volte al secondo
    const text = !this.touch || time - this.textTime > 0.1 || time < this.textTime;
    if (text) this.textTime = time;
    const key = (k) => this.touch ? '' : ` (${k})`;
    // strumenti
    const tack = Coach.tack(twa);
    HUD.put('spd', `${speedKn(s).toFixed(1)} nodi`);
    const pos = HUD.put('posail', Coach.pointOfSail(twa) + (tack ? '  ·  ' + tack : ''));
    pos.style.color = Math.abs(twa) < 34 ? COLORS.bad : '#99d9ff';
    const v = vmg(s);
    const m = sim.marks[sim.nextMark];
    let lap = 'Giro delle boe: parte alla boa di bolina';
    if (sim.lapStart !== null) {
      const t = (sim.time - sim.lapStart) | 0;
      lap = `Giro in corso  ${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`;
      if (sim.lastLap !== null) lap += `   ultimo ${(sim.lastLap / 60) | 0}:${String((sim.lastLap | 0) % 60).padStart(2, '0')}`;
    }
    if (text) $('lines').innerHTML = [
      `Vento reale  ${s.tws.toFixed(0)} nodi · ${Math.abs(twa).toFixed(0)}° dalla prua`,
      `Vento apparente  ${s.aws.toFixed(0)} nodi · ${Math.abs(s.awa).toFixed(0)}°`,
      `Prua ${String(s.heading.toFixed(0)).padStart(3, '0')}°   VMG ${Math.abs(v).toFixed(1)} nodi ${v >= 0 ? 'verso il vento' : 'sottovento'}`,
      `Scarroccio ${Math.abs(leeway(s)).toFixed(0)}°   Timone ${s.rudder.toFixed(0)}°`,
      `Vele: ${s.backMain ? `RANDA SCONTRATA A ${s.backMain > 0 ? 'DRITTA' : 'SINISTRA'}${key('K')}` : s.bando ? 'IN BANDO' + key('SPAZIO') : (sim.autoTrim ? 'AUTOMATICHE' : 'MANUALI') + key('T')}${s.farfalla ? '   ·   A FARFALLA' + key('Y') : ''}${s.cappa ? '   ·   FIOCCO IN CAPPA' + key('U') : ''}${s.spi ? (s.spiUp < 1 ? '   ·   SPI IN ISSATA' : '   ·   SPI') + key('E') : s.spiUp > 0 ? '   ·   SPI IN AMMAINATA' : ''}   ·   ${SAIL_PLANS[clamp(s.reef, 0, 3)]}${key(s.reef === 0 ? 'Z' : s.reef === 3 ? 'X' : 'Z/X')}`,
      `Prossima: ${MARK_NAMES[sim.nextMark].toLowerCase()}  ${len(sub(m, s.pos)).toFixed(0)} m a ${String(bearing(sub(m, s.pos)).toFixed(0)).padStart(3, '0')}°`,
      lap,
    ].map((l) => `<div>${l}</div>`).join('');

    this.drawDial(s, aids);
    this.drawMap(sim, s, time);
    // scotte
    const ideal = idealSheets(s);
    for (const [id, val, idl, luff, ang] of [['main', s.mainSheet, ideal.main, s.mainLuff, s.mainAngle], ['jib', s.jibSheet, ideal.jib, s.jibLuff, s.jibAngle]]) {
      $(id + 'Fill').style.width = `${Math.max(2, val * 100)}%`;
      const mk = $(id + 'Ideal');
      mk.style.left = `${idl * 100}%`;
      mk.style.display = aids && !sim.autoTrim ? 'block' : 'none';
      const lab = $(id + 'Val');
      lab.textContent = luff > 0.35 ? 'SBATTE' : `${Math.abs(ang).toFixed(0)}°`;
      lab.style.color = luff > 0.35 ? COLORS.bad : '#fff';
    }
    if (!this.touch) this.drawHelm(s, sim.settings.steering === 2);
    // consigli e filetti
    $('tips').style.display = aids ? 'block' : 'none';
    $('tell').style.display = aids ? 'block' : 'none';
    if (aids && text) {
      // sui telefoni i tasti Z e X sono i pulsanti RIDUCI e AUMENTA
      HUD.put('tipList', Coach.tips(s, this.lake).map(([t, tone]) => `<li style="color:${COLORS[tone]}">${this.keyless(t)}</li>`).join(''), 'innerHTML');
    }
    if (aids) {
      const [t, tone] = Coach.telltales(s);
      const verdict = $('tellVerdict');
      verdict.textContent = t; verdict.style.color = COLORS[tone];
      this.drawTelltales(s, time);
    }
    // messaggi
    const age = sim.time - sim.messageTime;
    const msg = $('message');
    msg.textContent = this.keyless(sim.message);
    msg.style.color = COLORS[sim.tone];
    msg.style.opacity = clamp(4 - age, 0, 1);
    const st = $('status');
    if (sim.replay !== null) st.textContent = `◀◀  MOVIOLA  ${(sim.historySpan[1] - sim.replay).toFixed(1)} s fa  ·  ${this.touch ? 'DIRETTA per tornare in mare' : 'R per tornare in diretta, P pausa'}`;
    else if (sim.paused) st.textContent = this.touch ? 'PAUSA  ·  trascina col dito per girare intorno alla barca' : 'PAUSA  ·  trascina col tasto destro per girare intorno alla barca  ·  P per ripartire';
    else st.textContent = '';
    if (!this.touch) $('footer').textContent = `Vista: ${CAMERAS[world.mode]} (C)   ·   H comandi   ·   ESC menu`;
  }

  /** Sui telefoni i tasti diventano i nomi dei pulsanti. */
  keyless(t) {
    if (!this.touch) return t;
    return t.replace(/ \(Z\)/i, ' (RIDUCI)').replace(/ \(X\)/i, ' (AUMENTA)').replace(/ \(SPAZIO\)/i, '').replace(/ \(K\)/i, '').replace(/ \(Y\)/i, '').replace(/ \(E\)/i, '').replace(/ \(U\)/i, '');
  }

  /** Comandi a dito: posizione della barra, scotte, pulsanti che cambiano scritta, dati essenziali. */
  refreshTouch(sim, s, world) {
    const steering = sim.settings.steering;
    // la barra vera si sposta al contrario della pala del timone
    const f = clamp(s.rudder / Spec.rudderMax * (steering === 1 ? -1 : 1), -1, 1) * 0.5 + 0.5;
    $('tillerKnob').style.left = `calc(26px + (100% - 52px) * ${f.toFixed(4)})`;
    HUD.put('tillerLabel', ['BARRA: LA PRUA VA DOVE SPOSTI IL DITO', 'BARRA VERA: SPINGI E LA PRUA VA DALL\'ALTRA PARTE', 'RUOTA: COME UN VOLANTE'][steering]);
    document.body.classList.toggle('auto-trim', sim.autoTrim);
    if (!sim.autoTrim) {
      const ideal = idealSheets(s), show = sim.settings.aids ? 'block' : 'none';
      // la barra piena = scotta cazzata, come il pulsante in alto
      $('tMainFill').style.width = `${(1 - s.mainSheet) * 100}%`;
      $('tJibFill').style.width = `${(1 - s.jibSheet) * 100}%`;
      Object.assign($('tMainIdeal').style, { left: `${(1 - ideal.main) * 100}%`, display: show });
      Object.assign($('tJibIdeal').style, { left: `${(1 - ideal.jib) * 100}%`, display: show });
    }
    HUD.put('tTrim', sim.autoTrim ? 'VELE AUTO' : 'VELE MAN.').classList.toggle('on', !sim.autoTrim);
    HUD.put('tBando', s.bando ? 'RIPRENDI LE SCOTTE' : 'VELE IN BANDO').classList.toggle('on', s.bando);
    HUD.put('tBack', s.backMain ? 'MOLLA IL BOMA' : 'SCONTRA RANDA').classList.toggle('on', !!s.backMain);
    // pulsanti che servono solo in certe andature: spi dal traverso in giu', farfalla in poppa, randa scontrata da fermi
    const twa = Math.abs(twaOf(s));
    const spiB = HUD.put('tSpi', s.spi ? 'AMMAINA SPI' : 'ISSA SPI');
    spiB.classList.toggle('on', !!s.spi);
    spiB.style.display = s.spi || twa > 75 ? '' : 'none';
    const wing = HUD.put('tWing', s.farfalla ? 'TOGLI FARFALLA' : 'FARFALLA');
    wing.classList.toggle('on', s.farfalla);
    wing.style.display = s.farfalla || (twa > 145 && !s.spi) ? '' : 'none';
    $('tBack').style.display = s.backMain || twa < 75 ? '' : 'none';
    const cappa = HUD.put('tCappa', s.cappa ? 'LIBERA FIOCCO' : 'FIOCCO IN CAPPA');
    cappa.classList.toggle('on', !!s.cappa);
    cappa.style.display = s.cappa || (twa < 130 && !s.spi && !s.backMain) ? '' : 'none';
    HUD.put('tPause', sim.paused ? 'RIPARTI' : 'PAUSA').classList.toggle('on', sim.paused);
    HUD.put('tReplay', sim.replay !== null ? 'DIRETTA' : 'MOVIOLA').classList.toggle('on', sim.replay !== null);
    const lap = sim.lapStart !== null ? `  ·  giro ${((sim.time - sim.lapStart) / 60) | 0}:${String(((sim.time - sim.lapStart) | 0) % 60).padStart(2, '0')}` : '';
    const m = sim.marks[sim.nextMark];
    const heel = `${Math.abs(s.heel).toFixed(0)}°`;
    HUD.put('mini', this.phone.matches ? `Vento ${s.tws.toFixed(0)} nodi · sband. ${heel}\nBoa a ${len(sub(m, s.pos)).toFixed(0)} m${lap}` : `Sbandamento ${heel}`);
    $('mini').style.color = Math.abs(s.heel) > 25 ? COLORS.bad : '';
  }

  /** Rosa del vento: la barca vista dall'alto, vento reale e apparente, angolo morto. */
  drawDial(s, aids) {
    const g = this.dial, R = 105, cx = 135, cy = 132;
    g.clearRect(0, 0, 270, 290);
    g.save(); g.translate(cx, cy);
    g.fillStyle = 'rgba(8,18,31,0.62)'; g.beginPath(); g.arc(0, 0, R + 22, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, R, 0, 7); g.stroke();
    // canvas: y verso il basso, angoli in senso orario; la barca punta in alto
    const ang = (a) => rad(a) - Math.PI / 2;
    if (aids) {
      g.fillStyle = 'rgba(255,51,51,0.22)';
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, ang(twaOf(s) - 34), ang(twaOf(s) + 34)); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(235,235,235,0.9)';
    g.beginPath(); g.moveTo(0, -44); g.bezierCurveTo(15, -22, 17, 6, 15, 34); g.lineTo(-15, 34); g.bezierCurveTo(-17, 6, -15, -22, 0, -44); g.fill();
    const boom = (px, py, a, l, w) => {
      g.strokeStyle = '#f28c1a'; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.sin(rad(a)) * l, py + Math.cos(rad(a)) * l); g.stroke();
    };
    boom(0, -8, s.mainAngle, 38, 4);
    if (s.jibFurl < 0.5) boom(0, -42, s.jibAngle, 32, 3);
    if (s.spiUp > 0.2) {
      // lo spi: una vela gialla gonfia davanti alla prua
      g.strokeStyle = s.spiLuff > 0.5 ? 'rgba(255,194,14,0.5)' : '#ffc20e'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.arc(0, -50, 26 * s.spiUp, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    }
    for (const [a, color, label] of [[twaOf(s), '#59b3ff', 'REALE'], [s.awa, '#ffd933', 'APPARENTE']]) {
      g.save(); g.rotate(rad(a));
      g.strokeStyle = color; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, -R - 18); g.lineTo(0, -R + 46); g.moveTo(-9, -R + 32); g.lineTo(0, -R + 48); g.lineTo(9, -R + 32); g.stroke();
      g.fillStyle = color; g.font = 'bold 11px "Avenir Next", sans-serif'; g.textAlign = 'center';
      g.fillText(label, 0, -R - 24);
      g.restore();
    }
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '600 13px "Avenir Next", sans-serif'; g.textAlign = 'center';
    g.fillText(`VENTO ${s.tws.toFixed(0)} NODI DA ${String(s.twd.toFixed(0)).padStart(3, '0')}°`, cx, 282);
  }

  /** Mappa del lago intorno alla barca (nord in alto), con boe, base e scia. */
  drawMap(sim, s, time) {
    const g = this.map, R = 95, cx = 100, cy = 100, k = R / 1600;
    g.clearRect(0, 0, 200, 220);
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
    g.fillStyle = 'rgba(56,77,51,0.94)'; g.fillRect(0, 0, 200, 200);
    const P = (p) => [cx + (p.x - s.pos.x) * k, cy - (p.y - s.pos.y) * k];
    this.lake.rings.forEach((ring, i) => {
      g.beginPath();
      ring.forEach((p, j) => { const [x, y] = P(p); if (j) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath();
      g.fillStyle = i === 0 ? '#1f527a' : 'rgb(56,77,51)';
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.stroke();
    });
    if (sim.track.length) {
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.5; g.beginPath();
      sim.track.forEach((p, j) => { const [x, y] = P(p); if (j) g.lineTo(x, y); else g.moveTo(x, y); });
      const [x, y] = P(s.pos); g.lineTo(x, y); g.stroke();
    }
    const [bx, by] = P({ x: 0, y: 0 });
    g.fillStyle = '#ff6650'; g.fillRect(bx - 3.5, by - 3.5, 7, 7);
    sim.marks.forEach((m, i) => {
      const [x, y] = P(m);
      // freccia antioraria: la boa si lascia a sinistra
      const a0 = 0.6, a1 = a0 - 4.6, r = 10;
      g.strokeStyle = i === sim.nextMark ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(x, y, r, a0, a1, true); g.stroke();
      const hx = x + r * Math.cos(a1), hy = y + r * Math.sin(a1), tx = Math.sin(a1), ty = -Math.cos(a1);
      g.fillStyle = g.strokeStyle;
      g.beginPath(); g.moveTo(hx + tx * 4, hy + ty * 4); g.lineTo(hx - ty * 3 - tx * 1.5, hy + tx * 3 - ty * 1.5); g.lineTo(hx + ty * 3 - tx * 1.5, hy - tx * 3 - ty * 1.5); g.fill();
      g.fillStyle = '#ffcc1a'; g.strokeStyle = '#000'; g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); g.stroke();
      if (i === sim.nextMark) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7 * (1 + 0.15 * Math.sin(time * 4)), 0, 7); g.stroke(); }
    });
    g.restore();
    g.save(); g.translate(cx, cy); g.rotate(rad(s.heading));
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 12px "Avenir Next", sans-serif'; g.textAlign = 'center';
    g.fillText('N', cx, cy - R + 16);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '11px "Avenir Next", sans-serif';
    g.fillText("LAGO D'ISEO · 3 km", cx, 214);
  }

  /** Barra (vista dall'alto) o ruota, e inclinometro. */
  drawHelm(s, wheel) {
    const g = this.helm;
    g.clearRect(0, 0, 230, 104);
    g.fillStyle = '#fff'; g.font = 'bold 13px "Avenir Next", sans-serif'; g.textAlign = 'center';
    g.fillText(wheel ? 'RUOTA' : 'BARRA', 55, 16); g.fillText('SBANDAMENTO', 170, 16);
    if (wheel) {
      const a0 = -Math.PI / 2 + rad(s.rudder) * 4;
      g.strokeStyle = '#d9d9d9'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.arc(55, 58, 30, 0, 7); g.stroke();
      for (let k = 0; k < 3; k++) { const a = a0 + k * 2 * Math.PI / 3; g.beginPath(); g.moveTo(55, 58); g.lineTo(55 + Math.cos(a) * 30, 58 + Math.sin(a) * 30); g.stroke(); }
      g.beginPath(); g.moveTo(55 + Math.cos(a0) * 30, 58 + Math.sin(a0) * 30); g.lineTo(55 + Math.cos(a0) * 38, 58 + Math.sin(a0) * 38); g.stroke();
    } else {
      // la barra si muove al contrario della pala del timone
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(15, 86, 80, 4);
      const ta = -rad(s.rudder);
      g.strokeStyle = '#cc9959'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(55, 88); g.lineTo(55 + Math.sin(ta) * 56, 88 - Math.cos(ta) * 56); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 3;
    g.beginPath(); g.arc(170, 30, 50, Math.PI / 2 - 0.9, Math.PI / 2 + 0.9); g.stroke();
    for (const lim of [-25, 25]) {
      const a = Math.PI / 2 - rad(lim) * 2;
      g.strokeStyle = 'rgba(255,77,77,0.9)';
      g.beginPath(); g.moveTo(170 + 44 * Math.cos(a), 30 + 44 * Math.sin(a)); g.lineTo(170 + 56 * Math.cos(a), 30 + 56 * Math.sin(a)); g.stroke();
    }
    const ha = Math.PI / 2 - rad(s.heel) * 2;
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(170, 30); g.lineTo(170 + 48 * Math.cos(ha), 30 + 48 * Math.sin(ha)); g.stroke();
    g.fillStyle = Math.abs(s.heel) > 25 ? COLORS.bad : '#fff'; g.font = 'bold 15px "Avenir Next", sans-serif';
    g.fillText(`${Math.abs(s.heel).toFixed(0)}°`, 170, 66);
  }

  /** Filetti del fiocco ingranditi: dritti, alzati (sopravento) o cadenti (sottovento). */
  drawTelltales(s, time) {
    const g = this.tell;
    g.clearRect(0, 0, 226, 96);
    g.font = '9px "Avenir Next", sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillText('SOPRAVENTO', 58, 10); g.fillText('SOTTOVENTO', 168, 10);
    for (let i = 0; i < 6; i++) {
      const windward = i < 3, k = i % 3;
      const stall = windward ? clamp((6 - s.jibAlpha) / 6, 0, 1) : clamp((s.jibAlpha - 22) / 10, 0, 1);
      const off = Math.abs(s.awa) > 120 || s.jibLuff > 0.5 ? 1 : stall;
      const x0 = windward ? 18 : 128, y0 = 26 + k * 24;
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x0, 16); g.lineTo(x0, 90); g.stroke();
      g.strokeStyle = windward === (s.jibSide < 0) ? '#33d94d' : '#f23333';
      g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0);
      let px = x0, py = y0;
      for (let j = 1; j <= 6; j++) {
        const wig = off * Math.sin(time * 21 + j * 1.3 + i * 2) * 1.1;
        const a = wig + off * (windward ? 0.9 : -1.1);
        px += Math.cos(a) * 12; py -= Math.sin(a) * 12;
        g.lineTo(px, py);
      }
      g.stroke();
    }
  }

  // --- menu e aiuto ---------------------------------------------------------------------------
  menuRows(st) {
    return [
      ['VENTO', `${WINDS[st.windIndex][0]}  ${WINDS[st.windIndex][1]} NODI`],
      ['RAFFICHE E SALTI', st.gusts ? 'SÌ' : 'NO (vento costante)'],
      ['DIREZIONE', `${DIRECTIONS[st.windFrom][0]} (${DIRECTIONS[st.windFrom][1]})`],
      ['TIMONE', STEERING[st.steering]],
      ['BARCA', BOATS[st.boat].name],
      ['AIUTI ISTRUTTORE', st.aids ? 'SÌ' : 'NO'],
      ['TRIANGOLO DEI VENTI', st.triangle ? 'SÌ (frecce sull\'acqua)' : 'NO'],
      ['ARIA SPORCA', st.dirtyAir ? 'SÌ (scia sottovento)' : 'NO'],
    ];
  }
  showMenu(st, onChange) {
    const rows = this.menuRows(st);
    $('menuRows').innerHTML = rows.map(([a, b], i) =>
      `<div class="row${i === this.menuRow ? ' sel' : ''}" data-i="${i}"><span>${a}</span><span><b data-d="-1">◀</b> ${b} <b data-d="1">▶</b></span></div>`).join('');
    // le frecce cambiano avanti o indietro; toccando il resto della riga si va avanti
    for (const row of $('menuRows').querySelectorAll('.row')) {
      row.onclick = (e) => { this.menuRow = +row.dataset.i; onChange(this.menuRow, +(e.target.dataset.d || 1)); };
    }
  }
}
