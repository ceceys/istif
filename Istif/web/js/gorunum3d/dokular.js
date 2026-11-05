// Tuval (canvas) ile üretilen dokular: parça üst yüzü, yazı levhaları, zemin.
import * as THREE from 'three';

const YAZI_AILESI = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
const BASLIK_AILESI = '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';

function tuval(g, y) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(g));
  c.height = Math.max(2, Math.round(y));
  return c;
}

function dokuYap(c, anizotropi = 1) {
  const d = new THREE.CanvasTexture(c);
  d.colorSpace = THREE.SRGBColorSpace;
  d.anisotropy = anizotropi;
  d.minFilter = THREE.LinearMipmapLinearFilter;
  d.magFilter = THREE.LinearFilter;
  d.generateMipmaps = true;
  return d;
}

function yuvarlakDikdortgen(x, sx, sy, g, y, r) {
  x.beginPath();
  x.moveTo(sx + r, sy);
  x.arcTo(sx + g, sy, sx + g, sy + y, r);
  x.arcTo(sx + g, sy + y, sx, sy + y, r);
  x.arcTo(sx, sy + y, sx, sy, r);
  x.arcTo(sx, sy, sx + g, sy, r);
  x.closePath();
}

/** Metni en fazla `satirSiniri` satıra böler; sığmazsa son satır üç noktayla kesilir. */
function satirla(x, metin, enCok, satirSiniri) {
  const kelimeler = String(metin).split(/\s+/).filter(Boolean);
  const satirlar = [];
  let simdiki = '';
  for (const k of kelimeler) {
    const deneme = simdiki ? simdiki + ' ' + k : k;
    if (x.measureText(deneme).width <= enCok || !simdiki) simdiki = deneme;
    else {
      satirlar.push(simdiki);
      simdiki = k;
    }
  }
  if (simdiki) satirlar.push(simdiki);
  if (satirlar.length > satirSiniri) {
    satirlar.length = satirSiniri;
    satirlar[satirSiniri - 1] += '…';
  }
  return satirlar.map((s) => {
    if (x.measureText(s).width <= enCok) return s;
    let kes = s;
    while (kes.length > 1 && x.measureText(kes + '…').width > enCok) kes = kes.slice(0, -1);
    return kes + '…';
  });
}

const ustYuzOnbellek = new Map();

/**
 * Parçanın üst yüzü: "üstüne konamaz" parçalarda çapraz şerit, ortada okunur ad etiketi.
 * genM: tuvalin yatayına düşen kenar (m), yukM: dikeyine düşen kenar (m).
 */
export function ustYuzDokusu({ ad, capraz, genM, yukM, anizotropi = 4 }) {
  const pxM = 220;
  let g = genM * pxM;
  let y = yukM * pxM;
  const olcek = Math.min(1, 1024 / Math.max(g, y));
  g = Math.max(24, Math.round(g * olcek));
  y = Math.max(24, Math.round(y * olcek));
  const anahtar = `${ad}|${capraz ? 1 : 0}|${g}x${y}`;
  const onceki = ustYuzOnbellek.get(anahtar);
  if (onceki) {
    onceki.kullanim += 1;
    return onceki.doku;
  }

  const c = tuval(g, y);
  const x = c.getContext('2d');
  const birim = pxM * olcek; // 1 m kaç piksel

  if (capraz) {
    x.save();
    x.strokeStyle = 'rgba(10, 18, 38, 0.34)';
    x.lineWidth = Math.max(2, 0.05 * birim);
    const ara = Math.max(6, 0.15 * birim);
    for (let i = -y; i < g + y; i += ara) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i + y, y);
      x.stroke();
    }
    x.restore();
    x.strokeStyle = 'rgba(10, 18, 38, 0.42)';
    x.lineWidth = Math.max(2, 0.025 * birim);
    x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, g - x.lineWidth, y - x.lineWidth);
  }

  // Ad etiketi: kısa kenara göre ölçeklenir
  const kisa = Math.min(g, y);
  const enCok = g * 0.82;
  let yazi = Math.min(Math.round(kisa * 0.24), Math.round(0.24 * birim), 96);
  let satirlar = [];
  for (; yazi >= 9; yazi -= 1) {
    x.font = `600 ${yazi}px ${YAZI_AILESI}`;
    satirlar = satirla(x, ad, enCok, 2);
    if (satirlar.every((s) => !s.endsWith('…')) || yazi === 9) break;
  }
  if (kisa >= 40 && yazi >= 9) {
    x.font = `600 ${yazi}px ${YAZI_AILESI}`;
    const satirY = yazi * 1.18;
    const genislik = Math.max(...satirlar.map((s) => x.measureText(s).width));
    const pg = genislik + yazi * 1.1;
    const py = satirlar.length * satirY + yazi * 0.62;
    yuvarlakDikdortgen(x, (g - pg) / 2, (y - py) / 2, pg, py, Math.min(py / 2, yazi * 0.55));
    x.fillStyle = 'rgba(9, 16, 34, 0.74)';
    x.fill();
    x.fillStyle = '#FFFFFF';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const bas = y / 2 - ((satirlar.length - 1) * satirY) / 2;
    satirlar.forEach((s, i) => x.fillText(s, g / 2, bas + i * satirY + yazi * 0.04));
  }

  const doku = dokuYap(c, anizotropi);
  ustYuzOnbellek.set(anahtar, { doku, kullanim: 1 });
  return doku;
}

/** Üst yüz dokusunu bırakır; kullanan kalmayınca bellekten atılır. */
export function ustYuzBirak(doku) {
  for (const [anahtar, kayit] of ustYuzOnbellek) {
    if (kayit.doku === doku) {
      kayit.kullanim -= 1;
      if (kayit.kullanim <= 0) {
        kayit.doku.dispose();
        ustYuzOnbellek.delete(anahtar);
      }
      return;
    }
  }
}

/**
 * Yazı levhası dokusu (sprite ya da zemine yatırılmış düzlem için).
 * Döner: { doku, oran } — oran = genişlik / yükseklik
 */
export function yaziDokusu(metin, { renk = '#E8ECF2', zemin = null, kenar = null, boyut = 56, kalin = 600, baslik = false, dolgu = 0.5 } = {}) {
  const olcer = tuval(8, 8).getContext('2d');
  const aile = baslik ? BASLIK_AILESI : YAZI_AILESI;
  olcer.font = `${kalin} ${boyut}px ${aile}`;
  const metinG = olcer.measureText(metin).width;
  const pad = zemin || kenar ? boyut * dolgu : boyut * 0.12;
  const g = Math.ceil(metinG + pad * 2);
  const y = Math.ceil(boyut * 1.35 + (zemin || kenar ? boyut * 0.35 : 0));
  const c = tuval(g, y);
  const x = c.getContext('2d');
  if (zemin || kenar) {
    const r = y / 2;
    const ic = kenar ? 2 : 0;
    yuvarlakDikdortgen(x, ic, ic, g - ic * 2, y - ic * 2, r - ic);
    if (zemin) {
      x.fillStyle = zemin;
      x.fill();
    }
    if (kenar) {
      x.lineWidth = 3;
      x.strokeStyle = kenar;
      x.stroke();
    }
  }
  x.font = `${kalin} ${boyut}px ${aile}`;
  x.fillStyle = renk;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(metin, g / 2, y / 2 + boyut * 0.04);
  return { doku: dokuYap(c, 4), oran: g / y };
}

/** Araç tabanı: 1 m'lik karo; boyuna tahta çizgileri ve her metrede soluk enine çizgi. */
export function tabanDokusu(anizotropi = 8) {
  const c = tuval(256, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#2B3756';
  x.fillRect(0, 0, 256, 256);
  // tahtalar (z boyunca)
  for (let i = 0; i < 8; i += 1) {
    x.fillStyle = i % 2 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.05)';
    x.fillRect(i * 32, 0, 32, 256);
    x.fillStyle = 'rgba(8,14,30,0.45)';
    x.fillRect(i * 32, 0, 1.5, 256);
  }
  // metre çizgisi
  x.fillStyle = 'rgba(120, 190, 235, 0.22)';
  x.fillRect(0, 0, 256, 2);
  const d = dokuYap(c, anizotropi);
  d.wrapS = THREE.RepeatWrapping;
  d.wrapT = THREE.RepeatWrapping;
  return d;
}

/** Zemindeki ışık havuzu: ortası hafif aydınlık, kenarlara doğru kaybolur. */
export function isikHavuzuDokusu() {
  const c = tuval(256, 256);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(60, 100, 170, 0.42)');
  g.addColorStop(0.45, 'rgba(40, 70, 130, 0.18)');
  g.addColorStop(1, 'rgba(20, 35, 70, 0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const d = new THREE.CanvasTexture(c);
  d.colorSpace = THREE.SRGBColorSpace;
  return d;
}
