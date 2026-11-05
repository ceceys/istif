// Sayı, ölçü ve tarih biçimleri.
// Kullanıcı metrik (cm, kg, m) ya da imperial (in, lb, ft) birimle girer ve görür; motor her zaman tamsayı mm ve kg alır.
// Sayı ve tarih biçimi etkin dilin yerel ayarıyla (Intl) yazılır.
import { yerel, t } from './dil.js';

const MM_INC = 25.4;
const MM_FT = 304.8;
const KG_LB = 0.45359237;

let birimSistemi = 'metrik';

/** "metrik" ya da "imperial" */
export function birimAyarla(b) {
  birimSistemi = b === 'imperial' ? 'imperial' : 'metrik';
}
export const birimSistemiAdi = () => birimSistemi;
export const imperialMi = () => birimSistemi === 'imperial';

// ---------------------------------------------------------------------------
// Birimler ve dönüşüm
// ---------------------------------------------------------------------------

/** Parça ve araç ölçüsü birimi: cm ya da in */
export const olcuBirimi = () => t(imperialMi() ? 'birim.in' : 'birim.cm');
/** Ağırlık birimi: kg ya da lb */
export const agirlikBirimi = () => t(imperialMi() ? 'birim.lb' : 'birim.kg');
/** Uzun mesafe birimi: m ya da ft */
export const uzunBirim = () => t(imperialMi() ? 'birim.ft' : 'birim.m');
/** Hacim birimi: m³ ya da ft³ */
export const hacimBirimi = () => t(imperialMi() ? 'birim.ft3' : 'birim.m3');

/** mm → gösterilen ölçü (cm ya da in), sayı */
export const mmdenOlcu = (mm) => (imperialMi() ? (mm || 0) / MM_INC : (mm || 0) / 10);
/** Gösterilen ölçü (cm ya da in) → tamsayı mm */
export const olcudenMm = (v) => Math.round(imperialMi() ? v * MM_INC : v * 10);
/** kg → gösterilen ağırlık (kg ya da lb) */
export const kgdanAgirlik = (k) => (imperialMi() ? (k || 0) / KG_LB : k || 0);
/** Gösterilen ağırlık (kg ya da lb) → kg (0,1 kg'a yuvarlanır) */
export const agirliktanKg = (v) => Math.round((imperialMi() ? v * KG_LB : v) * 10) / 10;

/** Eski ad: cm değerini mm'ye çevirir; imperial seçiliyse inç kabul edilir. */
export const cmdenMm = olcudenMm;

// ---------------------------------------------------------------------------
// Sayı
// ---------------------------------------------------------------------------

const bicimciler = new Map();

function bicimci(enAz, enCok) {
  const anahtar = `${yerel()}|${enAz}|${enCok}`;
  let b = bicimciler.get(anahtar);
  if (!b) {
    b = new Intl.NumberFormat(yerel(), { minimumFractionDigits: enAz, maximumFractionDigits: enCok });
    bicimciler.set(anahtar, b);
  }
  return b;
}

/** Sabit ondalıklı sayı: sayi(5313) → "5.313", sayi(13.1, 2) → "13,10" */
export function sayi(n, basamak = 0) {
  if (n == null || !Number.isFinite(n)) return '—';
  return bicimci(basamak, basamak).format(n);
}

/** Gerektiği kadar ondalık: esnek(589.8) → "589,8", esnek(160) → "160" */
export function esnek(n, enCok = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return bicimci(0, enCok).format(n);
}

/** Ağırlık metni, etkin birimle: "5.313 kg" ya da "11,713 lb" */
export const kg = (n) => `${sayi(Math.round(kgdanAgirlik(n)))} ${agirlikBirimi()}`;
/** Uzunluk (mm) metni: "13,10 m" ya da "42.98 ft" */
export const metre = (mm) => `${sayi(imperialMi() ? (mm || 0) / MM_FT : (mm || 0) / 1000, 2)} ${uzunBirim()}`;
/** Uzunluk (mm), uzun birimde ve birimsiz: "13,10" (m) ya da "42.98" (ft) */
export const uzunSayi = (mm) => sayi(imperialMi() ? (mm || 0) / MM_FT : (mm || 0) / 1000, 2);
/** Ağırlık (kg), etkin birimde ve birimsiz: "655" (kg) ya da "1,444" (lb) */
export const agirlikSayi = (k) => sayi(Math.round(kgdanAgirlik(k)));

/** Hacim (mm³) metni: "33,2 m³" ya da "1,172 ft³" */
export const m3 = (mm3) => (imperialMi()
  ? `${sayi((mm3 || 0) / MM_FT ** 3, 0)} ${hacimBirimi()}`
  : `${sayi((mm3 || 0) / 1e9, 1)} ${hacimBirimi()}`);
export const yuzde = (n, basamak = 1) => new Intl.NumberFormat(yerel(), {
  style: 'percent', minimumFractionDigits: basamak, maximumFractionDigits: basamak,
}).format((n || 0) / 100);

/** mm → gösterilen ölçü metni (birimsiz): 5898 → "589,8" (cm) ya da "232.2" (in) */
export const cm = (mm) => esnek(mmdenOlcu(mm), 1);

/** Uzunluk × en × yükseklik, birimsiz: "345 × 160 × 145" */
export const olcu = (u, e, y) => `${cm(u)} × ${cm(e)} × ${cm(y)}`;

/** Araç iç ölçüsü, uzun birimle: "13,62 × 2,48 × 2,70 m" */
export const aracOlcusu = (a) => {
  const b = imperialMi() ? MM_FT : 1000;
  return `${sayi(a.uzunluk / b, 2)} × ${sayi(a.en / b, 2)} × ${sayi(a.yukseklik / b, 2)} ${uzunBirim()}`;
};

let ayraclar = null;
function ondalikAyraci() {
  if (!ayraclar || ayraclar.yerel !== yerel()) {
    const parca = new Intl.NumberFormat(yerel()).formatToParts(1.5).find((p) => p.type === 'decimal');
    ayraclar = { yerel: yerel(), ondalik: parca ? parca.value : '.' };
  }
  return ayraclar.ondalik;
}

/**
 * Kullanıcının yazdığı sayıyı okur. Etkin dilin ondalık ayracı esastır ("13,6" Türkçede, "13.6" İngilizcede);
 * öteki ayraç yalnız binlik kalıbına uyuyorsa ("1.500" / "1,500") binlik sayılır, yoksa ondalık kabul edilir.
 * Okunamazsa NaN döner; boş metin için de NaN.
 */
export function sayiOku(metin) {
  if (typeof metin === 'number') return metin;
  let s = String(metin ?? '').trim().replace(/[\s  ']/g, '');
  if (!s) return NaN;
  const ondalik = ondalikAyraci() === ',' ? ',' : '.';
  const binlik = ondalik === ',' ? '.' : ',';
  const binlikKalibi = new RegExp(`^-?\\d{1,3}(\\${binlik}\\d{3})+$`);
  if (s.includes(ondalik)) {
    s = s.split(binlik).join('');
    if (ondalik === ',') s = s.replace(',', '.');
  } else if (s.includes(binlik)) {
    s = binlikKalibi.test(s) ? s.split(binlik).join('') : s.replace(binlik, '.');
  }
  if (!/^-?\d*\.?\d+$/.test(s)) return NaN;
  return Number(s);
}

// ---------------------------------------------------------------------------
// Tarih
// ---------------------------------------------------------------------------

const tarihBicimi = () => new Intl.DateTimeFormat(yerel(), { day: 'numeric', month: 'long', year: 'numeric' });
const saatBicimi = () => new Intl.DateTimeFormat(yerel(), { hour: '2-digit', minute: '2-digit' });

/** "Bugün 14:20", "Dün 09:10" ya da "3 Kasım 2026" */
export function goreceTarih(deger) {
  const d = new Date(deger);
  if (Number.isNaN(d.getTime())) return '';
  const bugun = new Date();
  const gun = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const fark = Math.round((gun(bugun) - gun(d)) / 86400000);
  if (fark === 0) return `${goreliGun(0)} ${saatBicimi().format(d)}`;
  if (fark === 1) return `${goreliGun(-1)} ${saatBicimi().format(d)}`;
  return tarihBicimi().format(d);
}

/** "5 Kasım 2026 14:20" */
export function tarihSaat(deger = new Date()) {
  const d = new Date(deger);
  return `${tarihBicimi().format(d)} ${saatBicimi().format(d)}`;
}

function goreliGun(fark) {
  // "bugün", "dün" sözlükte değil: Intl'ın göreli biçimi kullanılır
  const s = new Intl.RelativeTimeFormat(yerel(), { numeric: 'auto' }).format(fark, 'day');
  return s.charAt(0).toLocaleUpperCase(yerel()) + s.slice(1);
}

/** HTML'e güvenle yazmak için kaçış */
export function kac(metin) {
  return String(metin ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
