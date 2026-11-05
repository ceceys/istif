// İlkel geometrilerden araç modeli: dorse/kasa, şasi, tekerlekler, tente iskeleti, alçak poligonlu kabin
// ya da konteyner çerçevesi, metre cetveli ve KAPI işareti.
// Birim metredir. Yük alanı: x ∈ [0, en], y ∈ [0, yükseklik], z ∈ [0, uzunluk]; z = 0 ön duvar (kabin tarafı).
import * as THREE from 'three';
import { tabanDokusu, yaziDokusu } from './dokular.js';
import { metre, imperialMi } from '../bicim.js';
import { t } from '../dil.js';

const MM = 0.001;

/** Türlere göre yer yüksekliği ve kabin ölçüleri (m) */
const TUR = {
  tir: { yer: 1.2, kabin: { uzunluk: 2.4, tavan: 2.8, ara: 0.55 }, teker: 0.53 },
  kamyon: { yer: 1.12, kabin: { uzunluk: 2.15, tavan: 2.45, ara: 0.12 }, teker: 0.5 },
  kamyonet: { yer: 0.86, kabin: { uzunluk: 1.85, tavan: 1.95, ara: 0.1 }, teker: 0.38 },
  konteyner: { yer: 0.16, kabin: null, teker: 0 },
};

function malzemeler(anizotropi) {
  const taban = tabanDokusu(anizotropi);
  return {
    taban,
    levhalar: [], // cetvel yazılarının malzemeleri (rapor çekiminde koyulaşır)
    govde: new THREE.MeshStandardMaterial({ color: 0x2a3552, metalness: 0.55, roughness: 0.45 }),
    sasi: new THREE.MeshStandardMaterial({ color: 0x141a29, metalness: 0.5, roughness: 0.6 }),
    zeminKaplama: new THREE.MeshStandardMaterial({ color: 0xffffff, map: taban, metalness: 0.05, roughness: 0.88 }),
    lastik: new THREE.MeshStandardMaterial({ color: 0x11141b, metalness: 0, roughness: 0.92 }),
    jant: new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.85, roughness: 0.28 }),
    gobek: new THREE.MeshStandardMaterial({ color: 0x5c6472, metalness: 0.7, roughness: 0.4 }),
    boya: new THREE.MeshStandardMaterial({ color: 0x1d2b4d, metalness: 0.6, roughness: 0.3, flatShading: true }),
    cam: new THREE.MeshStandardMaterial({ color: 0x08111f, metalness: 0.9, roughness: 0.06, side: THREE.DoubleSide }),
    vurgu: new THREE.MeshStandardMaterial({ color: 0x3abff0, emissive: 0x3abff0, emissiveIntensity: 0.85, metalness: 0.2, roughness: 0.4 }),
    iskelet: new THREE.MeshStandardMaterial({ color: 0x8a929e, metalness: 0.75, roughness: 0.35 }),
    tente: new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0, roughness: 0.9, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
    onDuvar: new THREE.MeshStandardMaterial({ color: 0x3a4767, metalness: 0.4, roughness: 0.6, transparent: true, opacity: 0.6 }),
    kenar: new THREE.LineBasicMaterial({ color: 0x9fbde3, transparent: true, opacity: 0.42 }),
    oluk: new THREE.LineBasicMaterial({ color: 0x9fbde3, transparent: true, opacity: 0.14 }),
    stop: new THREE.MeshStandardMaterial({ color: 0x5a0d14, emissive: 0xff2a3a, emissiveIntensity: 1.1 }),
    sinyal: new THREE.MeshStandardMaterial({ color: 0x5a3a0a, emissive: 0xffa21a, emissiveIntensity: 0.9 }),
    far: new THREE.MeshStandardMaterial({ color: 0xdfeefc, emissive: 0xe8f6ff, emissiveIntensity: 1.1 }),
    konteyner: new THREE.MeshStandardMaterial({ color: 0x34507f, metalness: 0.5, roughness: 0.5 }),
    konteynerDuvar: new THREE.MeshStandardMaterial({ color: 0x5a78a8, metalness: 0.2, roughness: 0.8, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }),
    kose: new THREE.MeshStandardMaterial({ color: 0x9aa3b0, metalness: 0.7, roughness: 0.4 }),
    cetvel: new THREE.LineBasicMaterial({ color: 0x8fa6c9, transparent: true, opacity: 0.75 }),
    pay: new THREE.LineDashedMaterial({ color: 0xf2b441, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.9 }),
    payDolgu: new THREE.MeshBasicMaterial({ color: 0xf2b441, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  };
}

/** Merkezi verilen kutu ekler. */
function kutu(g, mat, gx, gy, gz, x, y, z, golge = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(gx, gy, gz), mat);
  m.position.set(x, y, z);
  m.castShadow = golge;
  m.receiveShadow = golge;
  g.add(m);
  return m;
}

/** Tekerlek (lastik + jant + göbek), aynı geometriler paylaşılır. */
function tekerlekGeometrileri(r, gen) {
  const lastik = new THREE.CylinderGeometry(r, r, gen, 32);
  lastik.rotateZ(Math.PI / 2);
  const jant = new THREE.CylinderGeometry(r * 0.6, r * 0.6, gen + 0.012, 24);
  jant.rotateZ(Math.PI / 2);
  const gobek = new THREE.CylinderGeometry(r * 0.2, r * 0.2, gen + 0.03, 12);
  gobek.rotateZ(Math.PI / 2);
  return { lastik, jant, gobek };
}

function aks(g, m, geo, xSol, xSag, z, yMerkez, gen) {
  for (const x of [xSol, xSag]) {
    const l = new THREE.Mesh(geo.lastik, m.lastik);
    l.position.set(x, yMerkez, z);
    l.castShadow = true;
    g.add(l);
    const j = new THREE.Mesh(geo.jant, m.jant);
    j.position.copy(l.position);
    g.add(j);
    const gb = new THREE.Mesh(geo.gobek, m.gobek);
    gb.position.copy(l.position);
    g.add(gb);
  }
  const mil = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, Math.abs(xSag - xSol) - gen, 10), m.sasi);
  mil.rotation.z = Math.PI / 2;
  mil.position.set((xSol + xSag) / 2, yMerkez, z);
  g.add(mil);
}

/** Dört köşesi verilen düzlem parçası (cam, kapı vb.) */
function dortgen(g, mat, a, b, c, d) {
  const geo = new THREE.BufferGeometry();
  const p = [a, b, c, a, c, d].flatMap((v) => [v.x, v.y, v.z]);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  g.add(m);
  return m;
}

/**
 * Alçak poligonlu kabin. Profil yandan (u: kabinin arkasından öne, v: kabin tabanından yukarı) çizilip
 * genişlik boyunca çekilir; u ekseni dünyada -z yönüne (öne) döner.
 */
function kabinKur(g, m, { cx, genislik, arkaZ, tabanY, uzunluk: L, tavan: H, spoiler }) {
  const P = [
    [0, 0.35],
    [0, H - 0.1],
  ];
  if (spoiler && spoiler > H + 0.2) {
    P.push([0.12, spoiler], [0.7, spoiler - 0.06], [L * 0.62, H + 0.04]);
  } else {
    P.push([0.08, H]);
  }
  P.push(
    [L * 0.81, H + 0.02],
    [L * 0.915, H - 0.2],
    [L * 0.985, H * 0.555],
    [L * 1.0, H * 0.48],
    [L * 1.012, 0.35],
    [L * 0.98, 0],
    [0.25, 0]
  );
  const sekil = new THREE.Shape();
  sekil.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i += 1) sekil.lineTo(P[i][0], P[i][1]);
  sekil.closePath();

  const geo = new THREE.ExtrudeGeometry(sekil, {
    depth: genislik - 0.08,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geo.translate(0, 0, -(genislik - 0.08) / 2);
  geo.rotateY(Math.PI / 2); // u → -z, çekme ekseni → x
  const govde = new THREE.Mesh(geo, m.boya);
  govde.position.set(cx, tabanY, arkaZ);
  govde.castShadow = true;
  govde.receiveShadow = true;
  g.add(govde);

  const dunya = (u, v, x) => new THREE.Vector3(cx + x, tabanY + v, arkaZ - u);
  const yariG = genislik / 2;

  // Ön cam: profildeki ön cam çizgisinin biraz önünde
  const camAltV = H * 0.57;
  const camUstV = H - 0.24;
  const uCizgi = (v) => {
    const [u1, v1] = [L * 0.985, H * 0.555];
    const [u2, v2] = [L * 0.915, H - 0.2];
    return u1 + ((v - v1) / (v2 - v1)) * (u2 - u1) + 0.045;
  };
  const camX = yariG - 0.16;
  dortgen(g, m.cam,
    dunya(uCizgi(camAltV), camAltV, -camX), dunya(uCizgi(camAltV), camAltV, camX),
    dunya(uCizgi(camUstV), camUstV, camX), dunya(uCizgi(camUstV), camUstV, -camX));

  // Yan camlar
  const pencere = [
    [L * 0.885, H * 0.6],
    [L * 0.83, H - 0.32],
    [L * 0.5, H - 0.28],
    [L * 0.5, H * 0.6],
  ];
  for (const isaret of [-1, 1]) {
    const x = isaret * (yariG + 0.004);
    const k = pencere.map(([u, v]) => dunya(u, v, x));
    dortgen(g, m.cam, k[0], k[1], k[2], k[3]);
  }

  // Camgöbeği şerit: iki yanda ve önde
  const seritV = H * 0.44;
  for (const isaret of [-1, 1]) {
    kutu(g, m.vurgu, 0.012, 0.05, L * 0.9, cx + isaret * (yariG + 0.006), tabanY + seritV, arkaZ - L * 0.5, false);
  }
  kutu(g, m.vurgu, genislik - 0.3, 0.04, 0.012, cx, tabanY + H * 0.5, arkaZ - L * 1.0 - 0.045, false);

  // Izgara, farlar, tampon, aynalar
  kutu(g, m.sasi, genislik - 0.7, H * 0.26, 0.03, cx, tabanY + H * 0.3, arkaZ - L * 1.012 - 0.03, false);
  for (const isaret of [-1, 1]) {
    kutu(g, m.far, 0.34, 0.12, 0.04, cx + isaret * (yariG - 0.3), tabanY + 0.52, arkaZ - L * 1.012 - 0.03, false);
    kutu(g, m.sinyal, 0.1, 0.07, 0.04, cx + isaret * (yariG - 0.08), tabanY + 0.52, arkaZ - L * 1.012 - 0.03, false);
    kutu(g, m.sasi, 0.05, 0.36, 0.13, cx + isaret * (yariG + 0.2), tabanY + H * 0.72, arkaZ - L * 0.86);
    kutu(g, m.sasi, 0.2, 0.03, 0.03, cx + isaret * (yariG + 0.1), tabanY + H * 0.78, arkaZ - L * 0.86, false);
  }
  kutu(g, m.govde, genislik + 0.04, 0.3, 0.14, cx, tabanY + 0.15, arkaZ - L * 0.97);
}

/** Tente iskeleti: dikmeler, üst kirişler, tavan yayları, ön duvar, arka kapı çerçevesi, yarı saydam perde. */
function tenteKur(g, m, W, H, L) {
  const n = Math.max(2, Math.round(L / 1.36));
  for (let i = 0; i <= n; i += 1) {
    const z = (i * L) / n;
    for (const x of [-0.03, W + 0.03]) kutu(g, m.iskelet, 0.045, H, 0.045, x, H / 2, z);
    kutu(g, m.iskelet, W + 0.06, 0.035, 0.04, W / 2, H + 0.03, z);
  }
  for (const x of [-0.03, W + 0.03]) kutu(g, m.iskelet, 0.06, 0.07, L + 0.06, x, H + 0.02, L / 2);
  kutu(g, m.onDuvar, W + 0.08, H + 0.06, 0.06, W / 2, H / 2, -0.03);
  // arka çerçeve
  kutu(g, m.govde, W + 0.12, 0.16, 0.1, W / 2, H + 0.02, L + 0.04);
  for (const x of [-0.04, W + 0.04]) kutu(g, m.govde, 0.1, H, 0.1, x, H / 2, L + 0.04);

  // perde
  const yan = new THREE.PlaneGeometry(L, H);
  for (const x of [-0.04, W + 0.04]) {
    const p = new THREE.Mesh(yan, m.tente);
    p.rotation.y = Math.PI / 2;
    p.position.set(x, H / 2, L / 2);
    g.add(p);
  }
  const tavan = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.08, L), m.tente);
  tavan.rotation.x = -Math.PI / 2;
  tavan.position.set(W / 2, H + 0.06, L / 2);
  g.add(tavan);

  const kenar = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.08, H + 0.06, L + 0.06)), m.kenar);
  kenar.position.set(W / 2, (H + 0.06) / 2, L / 2);
  g.add(kenar);
}

/** Taban, yan kirişler (camgöbeği yansıtıcı çizgiyle), şasi. */
function tabanKur(g, m, W, L, sasiY) {
  kutu(g, m.govde, W + 0.08, 0.14, L + 0.06, W / 2, -0.07, L / 2);
  const zemin = new THREE.Mesh(new THREE.PlaneGeometry(W, L), m.zeminKaplama);
  zemin.rotation.x = -Math.PI / 2;
  zemin.position.set(W / 2, 0.002, L / 2);
  zemin.receiveShadow = true;
  m.taban.repeat.set(W, L);
  g.add(zemin);
  for (const [x, isaret] of [[-0.045, -1], [W + 0.045, 1]]) {
    kutu(g, m.govde, 0.05, 0.2, L + 0.06, x, -0.1, L / 2);
    kutu(g, m.vurgu, 0.006, 0.022, L * 0.94, x + isaret * 0.027, -0.1, L / 2, false);
  }
  for (const dx of [-0.48, 0.48]) kutu(g, m.sasi, 0.14, 0.28, L - 0.5, W / 2 + dx, sasiY, L / 2 + 0.15);
}

function arkaIsiklar(g, m, W, y, z) {
  for (const x of [0.28, W - 0.28]) {
    kutu(g, m.stop, 0.28, 0.1, 0.04, x, y, z, false);
    kutu(g, m.sinyal, 0.1, 0.1, 0.04, x + (x < W / 2 ? 0.22 : -0.22), y, z, false);
  }
}

function konteynerKur(g, m, W, H, L) {
  const zemin = new THREE.Mesh(new THREE.PlaneGeometry(W, L), m.zeminKaplama);
  zemin.rotation.x = -Math.PI / 2;
  zemin.position.set(W / 2, 0.002, L / 2);
  zemin.receiveShadow = true;
  m.taban.repeat.set(W, L);
  g.add(zemin);
  kutu(g, m.konteyner, W + 0.16, 0.14, L + 0.12, W / 2, -0.08, L / 2);

  // raylar, başlıklar, köşe dikmeleri, köşe dökümleri
  for (const x of [-0.04, W + 0.04]) {
    kutu(g, m.konteyner, 0.12, 0.12, L + 0.12, x, H + 0.06, L / 2);
  }
  for (const z of [-0.05, L + 0.05]) {
    kutu(g, m.konteyner, W + 0.2, 0.14, 0.12, W / 2, H + 0.06, z);
    for (const x of [-0.05, W + 0.05]) {
      kutu(g, m.konteyner, 0.14, H + 0.26, 0.14, x, H / 2, z);
      kutu(g, m.kose, 0.18, 0.12, 0.18, x, -0.1, z);
      kutu(g, m.kose, 0.18, 0.12, 0.18, x, H + 0.1, z);
    }
  }
  // ön duvar ve yarı saydam yan duvarlar, tavan
  kutu(g, m.onDuvar, W + 0.06, H, 0.04, W / 2, H / 2, -0.03);
  const yan = new THREE.PlaneGeometry(L, H);
  for (const x of [-0.03, W + 0.03]) {
    const p = new THREE.Mesh(yan, m.konteynerDuvar);
    p.rotation.y = Math.PI / 2;
    p.position.set(x, H / 2, L / 2);
    g.add(p);
  }
  const tavan = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.06, L), m.konteynerDuvar);
  tavan.rotation.x = -Math.PI / 2;
  tavan.position.set(W / 2, H + 0.05, L / 2);
  g.add(tavan);

  // oluklu sac çizgileri
  const n = [];
  for (let z = 0.14; z < L; z += 0.28) {
    for (const x of [-0.035, W + 0.035]) n.push(x, 0.05, z, x, H - 0.05, z);
  }
  const oluk = new THREE.BufferGeometry();
  oluk.setAttribute('position', new THREE.Float32BufferAttribute(n, 3));
  g.add(new THREE.LineSegments(oluk, m.oluk));

  const kenar = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.06, H + 0.1, L + 0.06)), m.kenar);
  kenar.position.set(W / 2, (H + 0.1) / 2 - 0.02, L / 2);
  g.add(kenar);
}

/**
 * Uzunluk boyunca cetvel (yük alanının sağ dış kenarında, taban hizasında).
 * Metrik: her metre yazılı, yarım metre çizgi. Imperial: her 5 ft yazılı, her ft çizgi.
 */
function cetvelKur(g, m, W, L, anizotropi) {
  const x0 = W + 0.24;
  const p = [x0, 0.004, 0, x0, 0.004, L];
  const imp = imperialMi();
  const kucukAdim = imp ? 0.3048 : 0.5; // m
  const buyukHer = imp ? 5 : 2; // kaç küçük adımda bir büyük çizgi
  for (let i = 0; i * kucukAdim <= L + 1e-6; i += 1) {
    const z = i * kucukAdim;
    const buyuk = i % buyukHer === 0;
    p.push(x0, 0.004, z, x0 + (buyuk ? 0.14 : 0.07), 0.004, z);
  }
  p.push(x0, 0.004, L, x0 + 0.14, 0.004, L);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.add(new THREE.LineSegments(geo, m.cetvel));

  const levhalar = [];
  const yatayLevha = (metin, x, z, yukseklik, secenek) => {
    const { doku, oran } = yaziDokusu(metin, { renk: '#9FB2D3', boyut: 44, ...secenek });
    doku.anisotropy = anizotropi;
    const mat = new THREE.MeshBasicMaterial({ map: doku, transparent: true, depthWrite: false, toneMapped: false });
    const lv = new THREE.Mesh(new THREE.PlaneGeometry(yukseklik * oran, yukseklik), mat);
    lv.rotation.x = -Math.PI / 2;
    lv.position.set(x + (yukseklik * oran) / 2, 0.006, z);
    lv.renderOrder = 2;
    g.add(lv);
    levhalar.push(doku);
    m.levhalar.push(mat);
    return lv;
  };
  const yaziAdimi = imp ? 5 * 0.3048 : 1; // m
  for (let i = 0; i * yaziAdimi <= L + 1e-6; i += 1) {
    const z = i * yaziAdimi;
    if (L - z < 0.45 && i !== 0) continue; // sondaki toplam uzunluk yazısıyla çakışmasın
    yatayLevha(String(imp ? i * 5 : i), x0 + 0.2, z, 0.2);
  }
  yatayLevha(metre(L * 1000), x0 + 0.2, L, 0.22, { renk: '#C9D6EA', kalin: 700 });
  return levhalar;
}

function kapiIsareti(g, W, H, L) {
  const { doku, oran } = yaziDokusu(t('plan.gorunum.kapi'), {
    // Koyu dolgu: hem ekrandaki koyu zeminde hem rapordaki açık zeminde okunur
    renk: '#FFFFFF', zemin: 'rgba(15, 24, 48, 0.88)', kenar: 'rgba(58, 191, 240, 0.95)', boyut: 46, kalin: 700, dolgu: 0.7,
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: doku, transparent: true, depthWrite: false, toneMapped: false }));
  const yuk = 0.5;
  sp.scale.set(yuk * oran, yuk, 1);
  sp.position.set(W / 2, H + 0.6, L + 0.08);
  sp.renderOrder = 5;
  g.add(sp);
  return doku;
}

/** Kapı payı: arka kapıda boş bırakılacak alan, kesik çizgili ince şerit. */
function kapiPayiKur(g, m, W, L, payM) {
  if (!(payM > 0)) return;
  const z0 = L - payM;
  const y = 0.008;
  const p = [
    0, y, z0, W, y, z0,
    W, y, z0, W, y, L,
    W, y, L, 0, y, L,
    0, y, L, 0, y, z0,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const cizgi = new THREE.LineSegments(geo, m.pay);
  cizgi.computeLineDistances();
  g.add(cizgi);
  const dolgu = new THREE.Mesh(new THREE.PlaneGeometry(W, payM), m.payDolgu);
  dolgu.rotation.x = -Math.PI / 2;
  dolgu.position.set(W / 2, y - 0.002, L - payM / 2);
  g.add(dolgu);
}

/**
 * Araç modelini kurar.
 * @param arac { tur, en, yukseklik, uzunluk (mm), aks?: { aksMerkezi, sasiMesafe }, kapiPayiMm }
 * @returns { grup, zeminY, sinir: Box3, temizle() }
 */
export function aracModeliKur(arac, { anizotropi = 8 } = {}) {
  const tur = TUR[arac.tur] ? arac.tur : 'tir';
  const ozellik = TUR[tur];
  const W = arac.en * MM;
  const H = arac.yukseklik * MM;
  const L = arac.uzunluk * MM;
  const zeminY = -ozellik.yer;
  const g = new THREE.Group();
  g.name = 'arac';
  const m = malzemeler(anizotropi);
  const dokular = [m.taban];

  if (tur === 'konteyner') {
    konteynerKur(g, m, W, H, L);
  } else {
    const r = ozellik.teker;
    const gen = tur === 'kamyonet' ? 0.26 : 0.36;
    const geo = tekerlekGeometrileri(r, gen);
    const tekerY = zeminY + r;
    const xSol = 0.02 + gen / 2;
    const xSag = W - 0.02 - gen / 2;
    const sasiY = Math.max(zeminY + r * 2 + 0.05, -0.32);

    tabanKur(g, m, W, L, tur === 'tir' ? -0.3 : Math.min(-0.24, sasiY));
    tenteKur(g, m, W, H, L);

    // arka tampon ve ışıklar
    kutu(g, m.sasi, W - 0.3, 0.12, 0.1, W / 2, zeminY + 0.5, L + 0.12);
    for (const x of [0.4, W - 0.4]) kutu(g, m.sasi, 0.08, Math.abs(zeminY + 0.5) + 0.05, 0.08, x, (zeminY + 0.5) / 2, L + 0.1);
    arkaIsiklar(g, m, W, -0.28, L + 0.07);

    const kabin = ozellik.kabin;
    const cx = W / 2;
    const kabinGen = Math.min(2.5, Math.max(1.9, W));
    const kabinTaban = zeminY + (tur === 'kamyonet' ? 0.38 : 0.45);

    if (tur === 'tir') {
      // dorse: üç aks, ayaklar, beşinci teker
      const aksZ = arac.aks && arac.aks.aksMerkezi > 0 ? arac.aks.aksMerkezi * MM : L - 1.85;
      for (const d of [-1.31, 0, 1.31]) aks(g, m, geo, xSol, xSag, aksZ + d, tekerY, gen);
      for (const x of [cx - 0.55, cx + 0.55]) kutu(g, m.sasi, 0.1, 0.75, 0.1, x, -0.5, Math.min(2.6, L * 0.2));
      const kingpin = arac.aks && arac.aks.sasiMesafe > 0 ? arac.aks.sasiMesafe * MM : 1.0;

      // çekici
      const arkaZ = -kabin.ara;
      // rüzgârlık dorse tavanına kadar yükselir (kabin tabanına göre yükseklik)
      const spoiler = H - 0.05 - kabinTaban;
      kabinKur(g, m, { cx, genislik: kabinGen, arkaZ, tabanY: kabinTaban, uzunluk: kabin.uzunluk, tavan: kabin.tavan, spoiler });
      const onAks = arkaZ - kabin.uzunluk + 1.0;
      const arkaAks = kingpin + 0.4;
      const sasiBas = arkaZ - kabin.uzunluk + 0.15;
      const sasiSon = arkaAks + 0.9;
      for (const dx of [-0.42, 0.42]) {
        kutu(g, m.sasi, 0.12, 0.26, sasiSon - sasiBas, cx + dx, zeminY + 0.78, (sasiBas + sasiSon) / 2);
      }
      const besinci = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.07, 28), m.gobek);
      besinci.position.set(cx, -0.19, kingpin);
      g.add(besinci);
      aks(g, m, geo, cx - kabinGen / 2 + 0.03 + gen / 2, cx + kabinGen / 2 - 0.03 - gen / 2, onAks, tekerY, gen);
      aks(g, m, geo, cx - kabinGen / 2 + 0.03 + gen / 2, cx + kabinGen / 2 - 0.03 - gen / 2, arkaAks, tekerY, gen);
      // yakıt depoları
      for (const isaret of [-1, 1]) {
        const depo = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.05, 20), m.jant);
        depo.rotation.x = Math.PI / 2;
        depo.position.set(cx + isaret * (kabinGen / 2 - 0.3), zeminY + 0.62, (onAks + arkaAks) / 2 - 0.15);
        depo.castShadow = true;
        g.add(depo);
      }
    } else {
      const arkaZ = -kabin.ara;
      kabinKur(g, m, { cx, genislik: kabinGen, arkaZ, tabanY: kabinTaban, uzunluk: kabin.uzunluk, tavan: kabin.tavan, spoiler: null });
      const onAks = arkaZ - kabin.uzunluk + (tur === 'kamyonet' ? 0.7 : 0.95);
      const arkaAks = L * 0.62;
      aks(g, m, geo, cx - kabinGen / 2 + 0.03 + gen / 2, cx + kabinGen / 2 - 0.03 - gen / 2, onAks, tekerY, gen);
      aks(g, m, geo, xSol, xSag, arkaAks, tekerY, gen);
      for (const dx of [-0.42, 0.42]) {
        const bas = onAks - 0.7;
        kutu(g, m.sasi, 0.12, 0.22, -bas + 0.2, cx + dx, Math.min(-0.24, sasiY), (bas + 0.2) / 2);
      }
    }
  }

  dokular.push(...cetvelKur(g, m, W, L, anizotropi));
  dokular.push(kapiIsareti(g, W, H, L));
  kapiPayiKur(g, m, W, L, (arac.kapiPayiMm || 0) * MM);

  const sinir = new THREE.Box3().setFromObject(g);
  sinir.min.y = Math.min(sinir.min.y, zeminY);

  function temizle() {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    Object.values(m).forEach((x) => x && x.dispose && x.dispose());
    m.levhalar.forEach((x) => x.dispose());
    dokular.forEach((d) => d.dispose());
  }

  /** Rapor çekimi için açık zeminde okunur çizgi ve yazı renkleri (true), ya da ekran renkleri (false) */
  function zeminModu(acik) {
    m.kenar.color.set(acik ? 0x5d7396 : 0x9fbde3);
    m.kenar.opacity = acik ? 0.8 : 0.42;
    m.oluk.color.set(acik ? 0x5d7396 : 0x9fbde3);
    m.oluk.opacity = acik ? 0.28 : 0.14;
    m.cetvel.color.set(acik ? 0x5d7396 : 0x8fa6c9);
    m.tente.color.set(acik ? 0x8fa3c6 : 0xc9ced6);
    m.tente.opacity = acik ? 0.1 : 0.07;
    m.levhalar.forEach((x) => x.color.set(acik ? 0x56688a : 0xffffff));
  }

  return { grup: g, zeminY, sinir, W, H, L, temizle, zeminModu };
}
