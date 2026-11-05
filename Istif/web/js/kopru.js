// Kabuk köprüsü. WebView2 içinde chrome.webview üzerinden kabuğa istek gönderir;
// tarayıcıda açılınca aynı istekleri localStorage ile karşılar.
//   istek:  { tur, id, ... }    cevap: { tur: "cevap", id, ok, veri | hata }
import { URUN } from './urun.js';
import { t } from './dil.js';
import { katalogKayitlari, kayitBaglantilari } from './veri.js';

const webview = window.chrome && window.chrome.webview ? window.chrome.webview : null;

/** Windows kabuğunun içinde mi çalışıyoruz? */
export const kabukVar = !!webview;

const bekleyen = new Map();
const dinleyiciler = new Map();
let sayac = 0;

if (webview) {
  webview.addEventListener('message', (olay) => {
    const m = olay.data;
    if (!m || typeof m !== 'object') return;
    if (m.tur === 'cevap') {
      const b = bekleyen.get(m.id);
      if (!b) return;
      bekleyen.delete(m.id);
      if (m.ok) b.coz(m.veri ?? null);
      else b.reddet(new Error(m.hata || t('genel.bilinmeyenHata')));
      return;
    }
    const liste = dinleyiciler.get(m.tur);
    if (liste) liste.forEach((fn) => fn(m));
  });
}

/** Kabuktan gelen bildirimi dinler (goruldu, kapatmaIstegi, planAcildi, guncellemeVar…). */
export function dinle(tur, fn) {
  if (!dinleyiciler.has(tur)) dinleyiciler.set(tur, new Set());
  dinleyiciler.get(tur).add(fn);
  return () => dinleyiciler.get(tur).delete(fn);
}

/** Cevap beklemeyen bildirim (hazir, durum, kapatmaAlindi). */
export function bildir(tur, veri = {}) {
  if (webview) webview.postMessage({ ...veri, tur });
}

/** Kabuğa istek gönderir; cevabı Promise olarak döner. Vazgeçilen pencerelerde veri null olur. */
export function istek(tur, veri = {}) {
  if (!webview) return yerelIstek(tur, veri);
  const id = ++sayac;
  return new Promise((coz, reddet) => {
    bekleyen.set(id, { coz, reddet });
    webview.postMessage({ ...veri, tur, id });
  });
}

// ---------------------------------------------------------------------------
// Tarayıcı yedeği (localStorage)
// ---------------------------------------------------------------------------

const ANAHTAR = {
  kutuphane: `${URUN.kisaAd}.kutuphane`,
  planlar: `${URUN.kisaAd}.planlar`,
  son: `${URUN.kisaAd}.son-planlar`,
  ayarlar: `${URUN.kisaAd}.ayarlar`,
  taslak: `${URUN.kisaAd}.taslak`,
};

const VARSAYILAN_AYARLAR = { dil: 'sistem', tema: 'sistem', birim: 'metrik', varsayilanArac: null, animasyon: 'acik' };

/** Tarayıcıda yalnız bilinen bağlantılar açılır: ürün bağlantıları ve katalogdaki kaynaklar */
function izinliBaglanti(url) {
  if (Object.values(URUN.baglantilar).includes(url)) return true;
  return katalogKayitlari().some((k) => kayitBaglantilari(k).includes(url));
}

/** Tarayıcıda dosya indirme olarak kaydeder (yerel, ağ yok) */
function indir(adi, baytlar) {
  const adres = URL.createObjectURL(new Blob([baytlar]));
  const a = document.createElement('a');
  a.href = adres;
  a.download = adi;
  a.click();
  setTimeout(() => URL.revokeObjectURL(adres), 2000);
}

function oku(anahtar, varsayilan = null) {
  try {
    const s = localStorage.getItem(anahtar);
    return s ? JSON.parse(s) : varsayilan;
  } catch {
    return varsayilan;
  }
}

function yaz(anahtar, deger) {
  localStorage.setItem(anahtar, JSON.stringify(deger));
}

function sonaEkle(yol, json) {
  let ad = yol;
  let ozet = null;
  try {
    const p = JSON.parse(json);
    ad = p.ad || ad;
    ozet = p.ozet || null;
  } catch {
    /* özet yoksa yalnız ad */
  }
  const liste = oku(ANAHTAR.son, []).filter((k) => k.yol !== yol);
  liste.unshift({ yol, ad, tarih: new Date().toISOString(), ozet });
  yaz(ANAHTAR.son, liste.slice(0, 10));
}

function dosyaSec() {
  return new Promise((coz, reddet) => {
    const girdi = document.createElement('input');
    girdi.type = 'file';
    girdi.accept = URUN.uzanti + ',application/json';
    girdi.addEventListener('cancel', () => coz(null));
    girdi.addEventListener('change', () => {
      const dosya = girdi.files && girdi.files[0];
      if (!dosya) return coz(null);
      dosya.text().then((json) => coz({ yol: dosya.name, json }), reddet);
    });
    girdi.click();
  });
}

async function yerelIstek(tur, v) {
  switch (tur) {
    case 'kutuphaneOku':
      return oku(ANAHTAR.kutuphane);
    case 'kutuphaneYaz':
      yaz(ANAHTAR.kutuphane, v.veri);
      return true;
    case 'planKaydet': {
      const planlar = oku(ANAHTAR.planlar, {});
      const yol = v.yol && String(v.yol).startsWith('yerel:') ? v.yol : 'yerel:' + Date.now().toString(36);
      planlar[yol] = v.json;
      yaz(ANAHTAR.planlar, planlar);
      sonaEkle(yol, v.json);
      return { yol };
    }
    case 'planAc': {
      if (!v.yol) return dosyaSec();
      const json = oku(ANAHTAR.planlar, {})[v.yol];
      if (!json) throw new Error(t('tarayici.planYok'));
      sonaEkle(v.yol, json);
      return { yol: v.yol, json };
    }
    case 'sonPlanlar': {
      const planlar = oku(ANAHTAR.planlar, {});
      return oku(ANAHTAR.son, []).filter((k) => planlar[k.yol]);
    }
    case 'pdfKaydet':
      window.print();
      return null;
    case 'baglantiAc':
      if (!izinliBaglanti(v.url)) throw new Error(t('tarayici.kullanilamaz'));
      window.open(v.url, '_blank', 'noopener');
      return true;
    case 'ayarlarOku':
      return { ...VARSAYILAN_AYARLAR, ...oku(ANAHTAR.ayarlar, {}), surum: URUN.surum, guncellemeDenetimi: false, kurulu: false, tarayici: true };
    case 'ayarlarYaz': {
      const { tur: _tur, id: _id, ...degisiklik } = v;
      yaz(ANAHTAR.ayarlar, { ...oku(ANAHTAR.ayarlar, {}), ...degisiklik });
      return true;
    }
    case 'guncellemeDenetle':
      return { durum: 'yok' };
    case 'dosyaSec':
      return tabloDosyasiSec(v.filtre === 'json' ? '.json,application/json' : '.xlsx,.xls,.csv');
    case 'dosyaKaydet': {
      const baytlar = Uint8Array.from(atob(v.base64), (c) => c.charCodeAt(0));
      const ad = v.onerilenAd || 'dosya';
      indir(ad.includes('.') ? ad : `${ad}.${v.filtre || 'bin'}`, baytlar);
      return { yol: ad };
    }
    case 'taslakYaz':
      localStorage.setItem(ANAHTAR.taslak, typeof v.json === 'string' ? v.json : JSON.stringify(v.json));
      return true;
    case 'taslakOku':
      return oku(ANAHTAR.taslak);
    case 'taslakSil':
      localStorage.removeItem(ANAHTAR.taslak);
      return true;
    case 'surumNotlari': {
      // Geliştirme sunucusunda Kaynak/Istif/Resources/Notes.<dil>.md okunur
      for (const kod of [v.dil, 'en']) {
        try {
          const yanit = await fetch(new URL(`../../Resources/Notes.${kod}.md`, import.meta.url), { cache: 'no-store' });
          if (yanit.ok) return { dil: kod, metin: await yanit.text() };
        } catch {
          /* sıradaki dil */
        }
      }
      return null;
    }
    default:
      throw new Error(t('tarayici.kullanilamaz'));
  }
}

/** Tarayıcıda dosya seçimi (Excel/CSV ya da JSON): { ad, base64 } */
function tabloDosyasiSec(kabul) {
  return new Promise((coz, reddet) => {
    const girdi = document.createElement('input');
    girdi.type = 'file';
    girdi.accept = kabul;
    girdi.addEventListener('cancel', () => coz(null));
    girdi.addEventListener('change', () => {
      const dosya = girdi.files && girdi.files[0];
      if (!dosya) return coz(null);
      const okuyucu = new FileReader();
      okuyucu.onload = () => coz({ ad: dosya.name, base64: String(okuyucu.result).split(',')[1] || '' });
      okuyucu.onerror = () => reddet(okuyucu.error);
      okuyucu.readAsDataURL(dosya);
    });
    girdi.click();
  });
}

/** Geliştirme kipinde örnek son planları tarayıcı hafızasına yazar (boşsa). */
export function yerelTohumla(planlar) {
  if (webview || oku(ANAHTAR.son, []).length) return;
  const kayit = oku(ANAHTAR.planlar, {});
  const simdi = Date.now();
  planlar.forEach((p, i) => {
    const yol = 'yerel:ornek-' + (i + 1);
    const json = JSON.stringify(p);
    kayit[yol] = json;
  });
  yaz(ANAHTAR.planlar, kayit);
  const son = planlar.map((p, i) => ({
    yol: 'yerel:ornek-' + (i + 1),
    ad: p.ad,
    tarih: new Date(simdi - i * 26 * 3600 * 1000).toISOString(),
    ozet: p.ozet || null,
  }));
  yaz(ANAHTAR.son, son);
}
