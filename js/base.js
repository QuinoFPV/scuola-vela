// La base Sportaction sulla spiaggia di Castro, come nelle foto aeree: statale SS469 lungo la riva,
// prato con ombrelloni, punto ristoro, magazzino con l'insegna, bandiere, pontile, manica a vento,
// il capannone Marini Marmi a nord e le barche all'ormeggio nella baia (che si girano col vento).
import * as THREE from './vendor/three.module.min.js';
import { hullGeometry, halfBeam, sheer, tAt, rod } from './boat.js';
import { rad, dirVec } from './physics.js';

const std = (color, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildBase(lake) {
  const root = new THREE.Group(), B = lake.base;
  const ground = (p) => lake.height(p.x, p.y);
  const yaw = (p) => Math.atan2(p.tx, -p.ty);          // orienta l'asse Z locale lungo la riva

  // --- strada statale SS469 -----------------------------------------------------------------
  const asphalt = canvasTex(128, 512, (g, w, h) => {
    g.fillStyle = '#4a4c4f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#e8e8e2';
    g.fillRect(4, 0, 4, h); g.fillRect(w - 8, 0, 4, h);
    for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 2, y, 4, 64);
  });
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  const rp = [], ruv = [], ri = [];
  for (let s = -560, k = 0; s <= 560; s += 4, k++) {
    const c = lake.basePoint(s, -lake.roadIn(s));
    for (const side of [-1, 1]) {
      const x = c.x + c.nx * 3.75 * side, y = c.y + c.ny * 3.75 * side;
      rp.push(x, lake.height(x, y) + 0.12, -y);
      ruv.push(side < 0 ? 0 : 1, s / 20);
    }
    if (k > 0) { const a = (k - 1) * 2; ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
  rg.setIndex(ri); rg.computeVertexNormals();
  const road = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  road.receiveShadow = true;
  root.add(road);

  // --- ombrelloni ---------------------------------------------------------------------------
  const canopy = new THREE.ConeGeometry(1.3, 0.5, 8).translate(0, 2.35, 0);
  const pole = new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6).translate(0, 1.2, 0);
  const um = new THREE.InstancedMesh(canopy, std(0xf4f1ea, 0.8), B.umbrellas.length);
  const pm = new THREE.InstancedMesh(pole, std(0xcfcfcf, 0.4, 0.6), B.umbrellas.length);
  const M = new THREE.Matrix4();
  B.umbrellas.forEach((p, i) => { M.makeTranslation(p.x, ground(p), -p.y); um.setMatrixAt(i, M); pm.setMatrixAt(i, M); });
  um.castShadow = true;
  root.add(um, pm);

  // --- edifici --------------------------------------------------------------------------------
  const sign = canvasTex(1024, 160, (g, w, h) => {
    g.fillStyle = '#121418'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic bold 86px "Helvetica Neue", Arial, sans-serif'; g.fillText('SPORTACTION', w / 2, h * 0.42);
    g.font = '600 30px "Avenir Next", Arial, sans-serif'; g.fillStyle = '#9fc4ff';
    g.fillText('LAKE ISEO EXPERIENCE · VELA · WINDSURF · SUP · KITE', w / 2, h * 0.82);
  });
  const factoryRoof = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4f4b46'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9aa2a6';
    for (let y = 16; y < h; y += 40) g.fillRect(18, y, w - 36, 10);              // lucernari
  });
  factoryRoof.wrapS = factoryRoof.wrapT = THREE.RepeatWrapping;
  // pareti del capannone: cemento con file di finestre e portoni
  const factoryWall = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#8f887d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    g.fillStyle = '#2d3236';
    for (let x = 10; x < w; x += 32) g.fillRect(x, 22, 20, 26);                 // finestre in alto
    for (let x = 30; x < w; x += 128) g.fillRect(x, 70, 44, 58);                // portoni
    g.fillStyle = 'rgba(255,255,255,0.15)';
    for (let x = 10; x < w; x += 32) g.fillRect(x, 22, 20, 4);
  });
  factoryWall.wrapS = THREE.RepeatWrapping;
  for (const b of B.buildings) {
    const g0 = ground(b), grp = new THREE.Group();
    grp.position.set(b.x, g0, -b.y);
    grp.rotation.y = yaw(b);
    let wallMat = std(b.wall, 0.85);
    if (b.roof === 'factory') {
      const t = factoryWall.clone(); t.needsUpdate = true; t.repeat.set(b.l / 32, 1);
      wallMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
    }
    const walls = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h + 1, b.l), wallMat);
    walls.position.y = (b.h - 1) / 2;
    walls.castShadow = walls.receiveShadow = true;
    grp.add(walls);
    if (b.roof === 'tile') {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4), std(0xa44c2e, 0.8));
      roof.scale.set(b.w + 0.8, 1.6, b.l + 0.8);
      roof.position.y = b.h + 0.8;
      roof.castShadow = true;
      grp.add(roof);
    } else {
      const mat = b.roof === 'factory' ? new THREE.MeshStandardMaterial({ map: factoryRoof, roughness: 0.8 }) : std(0x6d7073, 0.8);
      if (b.roof === 'factory') { factoryRoof.repeat.set(1, b.l / 30); }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.4, 0.3, b.l + 0.4), mat);
      roof.position.y = b.h + 0.15;
      grp.add(roof);
    }
    if (b.sign) {
      // insegna sul lato verso il lago
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(b.l * 0.9, b.l * 0.9 * 160 / 1024), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6 }));
      // il lato +X locale guarda verso (-ty, tx): si sceglie quello rivolto verso l'acqua
      const lakeSide = (-b.ty * b.nx + b.tx * b.ny) > 0 ? 1 : -1;
      sg.position.set(lakeSide * (b.w / 2 + 0.02), b.h * 0.62, 0);
      sg.rotation.y = lakeSide * Math.PI / 2;
      grp.add(sg);
    }
    root.add(grp);
  }

  // --- bandiere a vela SPORTACTION -----------------------------------------------------------
  const flagTex = canvasTex(128, 512, (g, w, h) => {
    g.fillStyle = '#121418'; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic bold 62px "Helvetica Neue", Arial, sans-serif'; g.fillText('SPORTACTION', 0, 0);
    g.restore();
  });
  for (const f of B.flags) {
    const y0 = ground(f), grp = new THREE.Group();
    grp.position.set(f.x, y0, -f.y);
    grp.add(rod(V(0, 0, 0), V(0, 4.2, 0), 0.025, std(0x222222, 0.4)));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 3), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.7 }));
    flag.position.set(0.4, 2.6, 0);
    grp.add(flag);
    grp.rotation.y = yaw(f) + Math.PI / 2;
    root.add(grp);
  }

  // --- pontile con piattaforma galleggiante -----------------------------------------------------
  const wood = std(0x7d5b3c, 0.85);
  const a = B.pier.from, bpt = B.pier.to;
  const L = Math.hypot(bpt.x - a.x, bpt.y - a.y);
  const walk = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, L), wood);
  walk.position.set((a.x + bpt.x) / 2, 0.55, -(a.y + bpt.y) / 2);
  walk.rotation.y = Math.atan2(a.nx, -a.ny);
  walk.castShadow = walk.receiveShadow = true;
  root.add(walk);
  const plat = new THREE.Mesh(new THREE.BoxGeometry(5, 0.35, 7), wood);
  plat.position.set(bpt.x + a.nx * 3.4, 0.3, -(bpt.y + a.ny * 3.4));
  plat.rotation.y = walk.rotation.y;
  plat.castShadow = plat.receiveShadow = true;
  root.add(plat);
  for (let k = 0; k <= L; k += 4) for (const sd of [-1, 1]) {
    const px = a.x + a.nx * k + a.tx * sd, py = a.y + a.ny * k + a.ty * sd;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3, 8), wood);
    post.position.set(px, -0.6, -py);
    root.add(post);
  }

  // --- manica a vento ---------------------------------------------------------------------------
  const sp = B.sock, h0 = Math.max(0.5, ground(sp));
  root.add(rod(V(sp.x, h0, -sp.y), V(sp.x, h0 + 8, -sp.y), 0.06, std(0xe6e6e6, 0.3, 0.6)));
  const windsock = new THREE.Group();
  windsock.position.set(sp.x, h0 + 7.7, -sp.y);
  const stripes = canvasTex(64, 64, (g) => { for (let k = 0; k < 5; k++) { g.fillStyle = k % 2 ? '#fff' : '#e02020'; g.fillRect(0, k * 64 / 5, 64, 64 / 5); } });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 1.6, 12, 1, true), new THREE.MeshStandardMaterial({ map: stripes, side: THREE.DoubleSide, roughness: 0.8 }));
  cone.rotation.x = Math.PI / 2; cone.position.z = 0.8;
  windsock.add(cone);
  root.add(windsock);

  // --- barche all'ormeggio -------------------------------------------------------------------
  const hullGeo = hullGeometry();
  const white = std(0xf3f4f5, 0.25), covers = [0x1f4a8c, 0x2e6b4f, 0x8c1f1f, 0x2b2b2b];
  const deckShape = new THREE.Shape();
  for (let i = 0; i <= 20; i++) { const t = i / 20; deckShape[i ? 'lineTo' : 'moveTo'](halfBeam(t) * 0.99, 3.95 - 7.9 * t); }
  for (let i = 20; i >= 0; i--) { const t = i / 20; deckShape.lineTo(-halfBeam(t) * 0.99, 3.95 - 7.9 * t); }
  const deckGeo = new THREE.ShapeGeometry(deckShape).rotateX(-Math.PI / 2);
  const moored = B.moorings.map((m, i) => {
    const grp = new THREE.Group(), k = m.len / 7.9;
    const body = new THREE.Group();
    body.scale.set(k, k, k);
    body.add(new THREE.Mesh(hullGeo, white));
    const deck = new THREE.Mesh(deckGeo, std(0xdedcd6, 0.8));
    deck.position.y = sheer(0.5) + 0.02;
    body.add(deck);
    if (m.motor) {
      const cons = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.9), white); cons.position.set(0, 1.0, 0.6); body.add(cons);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.05), std(0x101418, 0.1)); glass.position.set(0, 1.5, 0.2); glass.rotation.x = -0.4; body.add(glass);
      const eng = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.5), std(0x1a1a1a, 0.4)); eng.position.set(0, 0.7, 4.1); body.add(eng);
    } else {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 2.4), white); cabin.position.set(0, 0.9, -0.8); body.add(cabin);
      body.add(rod(V(0, 1.0, -0.6), V(0, 10.2, -0.6), 0.06, std(0xcfd2d4, 0.3, 0.6)));
      // randa piegata sul boma con la sua copertura colorata
      body.add(rod(V(0, 1.75, -0.5), V(0, 1.75, 2.8), 0.11, std(covers[i % covers.length], 0.8)));
      body.add(rod(V(0, 0.9, -3.9), V(0, 9.0, -0.6), 0.008, std(0x333333)));
      body.add(rod(V(0, 10.1, -0.6), V(0, 0.7, 3.9), 0.007, std(0x333333)));
    }
    grp.add(body);
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), std(i % 3 ? 0xf2f2f2 : 0xff7a1a, 0.4));
    root.add(grp, buoy);
    return { grp, buoy, m };
  });

  /** Barche che si girano col vento e galleggiano sulle onde; manica a vento. */
  function update(windDir, windSpeed, waves, time) {
    for (const [i, b] of moored.entries()) {
      const heading = windDir + b.m.turn + 5 * Math.sin(time * 0.15 + i);
      const c = lake.mooredCenter(b.m, windDir);
      const smp = waves.sample(c.x, -c.y);
      b.grp.position.set(c.x, smp.h - 0.02, -c.y);
      b.grp.rotation.set(-smp.gz * 0.4, -rad(heading), smp.gx * 0.4, 'YXZ');
      const sb = waves.sample(b.m.x, -b.m.y);
      b.buoy.position.set(b.m.x, sb.h + 0.1, -b.m.y);
    }
    windsock.rotation.set((1 - Math.min(1, windSpeed / 14)) * 1.1, -rad(windDir), 0, 'YXZ');
  }
  return { root, update };
}
