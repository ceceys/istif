// Motor bağlantısı. Motor yalnız js/motor/isci.js Web Worker'ı üzerinden çağrılır.
// Worker yoksa ya da hata verirse arayüz çökmez; anlaşılır bir hata döner.
// ?ornek=1 ile açılınca motor yerine Kaynak/arayuz-ornek/ornek-sonuc.json kullanılır.
import { t } from './dil.js';
import { durum } from './durum.js';
import { motorMetni } from './motor-metin.js';

const ZAMAN_ASIMI_MS = 45000;

export class MotorHatasi extends Error {
  constructor(mesaj, ayrinti = '') {
    super(mesaj);
    this.ayrinti = ayrinti;
  }
}

let isci = null;
let sayac = 0;
const bekleyen = new Map();

function hepsiniReddet(hata) {
  for (const [id, b] of bekleyen) {
    clearTimeout(b.saat);
    b.reddet(hata);
    bekleyen.delete(id);
  }
}

function isciyiKapat() {
  if (isci) {
    try { isci.terminate(); } catch { /* zaten kapalı */ }
  }
  isci = null;
}

function isciAl() {
  if (isci) return isci;
  try {
    isci = new Worker(new URL('./motor/isci.js', import.meta.url), { type: 'module' });
  } catch (e) {
    isci = null;
    throw new MotorHatasi(t('plan.hata.motorYok'), String(e && e.message ? e.message : e));
  }

  isci.addEventListener('message', (olay) => {
    const m = olay.data || {};
    const b = bekleyen.get(m.id);
    if (!b) return;
    if (m.tur === 'ilerleme') {
      if (b.ilerleme && Number.isFinite(m.yuzde)) b.ilerleme(m.yuzde);
      return;
    }
    clearTimeout(b.saat);
    bekleyen.delete(m.id);
    if (m.tur === 'sonuc') {
      if (!b.dogrula || sonucGecerliMi(m.sonuc)) b.coz(m.sonuc);
      else b.reddet(new MotorHatasi(t('plan.hata.gecersizSonuc')));
    } else if (m.tur === 'hata') {
      b.reddet(new MotorHatasi(m.mesaj ? motorMetni(m.mesaj) : t('plan.hata.motorHata')));
    }
  });

  isci.addEventListener('error', (olay) => {
    olay.preventDefault();
    const ayrinti = [olay.message, olay.filename && `${olay.filename}:${olay.lineno}`].filter(Boolean).join('\n')
      || t('plan.hata.isciYuklenemedi');
    hepsiniReddet(new MotorHatasi(t('plan.hata.motorYok'), ayrinti));
    isciyiKapat();
  });

  isci.addEventListener('messageerror', () => {
    hepsiniReddet(new MotorHatasi(t('plan.hata.gecersizSonuc')));
  });

  return isci;
}

function sonucGecerliMi(s) {
  return !!s && Array.isArray(s.araclar) && Array.isArray(s.sigmayanlar || []) &&
    s.araclar.every((a) => a && Array.isArray(a.yerlesimler));
}

/**
 * Yerleşimi hesaplatır.
 * @param girdi     sözleşmedeki motor girdisi (mm, kg)
 * @param ilerleme  isteğe bağlı (yuzde) => void
 */
export function planla(girdi, ilerleme) {
  if (durum.gelistirme) return ornekSonuc(ilerleme);

  return new Promise((coz, reddet) => {
    let w;
    try {
      w = isciAl();
    } catch (e) {
      reddet(e);
      return;
    }
    const id = ++sayac;
    const saat = setTimeout(() => {
      bekleyen.delete(id);
      isciyiKapat(); // takılan hesap durdurulur, sonraki istekte yeniden başlar
      reddet(new MotorHatasi(t('plan.hata.zamanAsimi')));
    }, ZAMAN_ASIMI_MS);
    bekleyen.set(id, { coz, reddet, ilerleme, saat, dogrula: true });
    try {
      w.postMessage({ tur: 'planla', id, girdi });
    } catch (e) {
      clearTimeout(saat);
      bekleyen.delete(id);
      reddet(new MotorHatasi(t('plan.hata.motorHata'), String(e && e.message ? e.message : e)));
    }
  });
}

/**
 * Elle düzenleme istekleri (denetle, kalanBosluk, yaslan, ustundekiler). Hızlıdır, ilerleme göndermez.
 * Biçimler SOZLESME.md "Elle düzenleme (06.11 eki)" bölümünde.
 */
function motorIstegi(tur, veri, zamanAsimi = 15000) {
  return new Promise((coz, reddet) => {
    let w;
    try {
      w = isciAl();
    } catch (e) {
      reddet(e);
      return;
    }
    const id = ++sayac;
    const saat = setTimeout(() => {
      bekleyen.delete(id);
      reddet(new MotorHatasi(t('plan.hata.zamanAsimi')));
    }, zamanAsimi);
    bekleyen.set(id, { coz, reddet, saat, dogrula: false });
    try {
      w.postMessage({ tur, id, ...veri });
    } catch (e) {
      clearTimeout(saat);
      bekleyen.delete(id);
      reddet(new MotorHatasi(t('plan.hata.motorHata'), String(e && e.message ? e.message : e)));
    }
  });
}

/** Elle değişmiş araçları denetler: { gecerli, ihlaller, araclar } */
export const denetle = (girdi, araclar) => motorIstegi('denetle', { girdi, araclar });
/** Seçili parçaların (boşsa bütün yükün) çevresinde kalan boşluk: { kutu, duvara, engele } */
export const kalanBosluk = (arac, yerlesimler, seciliIndeksler) => motorIstegi('kalanBosluk', { arac, yerlesimler, seciliIndeksler });
/** Seçili parçaları bir yöne yaslar: { yerlesimler, mesafe } */
export const yaslan = (arac, yerlesimler, indeksler, yon) => motorIstegi('yaslan', { arac, yerlesimler, indeksler, yon });
/** Seçili parçaların üstündeki parçaların indeksleri */
export const ustundekiler = (yerlesimler, indeksler) => motorIstegi('ustundekiler', { yerlesimler, indeksler });

/** Geliştirme: elle yazılmış örnek sonuç (Kaynak/arayuz-ornek/ornek-sonuc.json) */
async function ornekSonuc(ilerleme) {
  const adres = new URL('../../../arayuz-ornek/ornek-sonuc.json', import.meta.url);
  for (let y = 0; y <= 100; y += 20) {
    if (ilerleme) ilerleme(y);
    await new Promise((r) => setTimeout(r, 90));
  }
  let sonuc;
  try {
    const yanit = await fetch(adres, { cache: 'no-store' });
    if (!yanit.ok) throw new Error('HTTP ' + yanit.status);
    sonuc = await yanit.json();
  } catch (e) {
    throw new MotorHatasi(t('plan.hata.ornekYok'), String(e && e.message ? e.message : e));
  }
  if (!sonucGecerliMi(sonuc)) throw new MotorHatasi(t('plan.hata.gecersizSonuc'));
  sonuc.ozet = { ...(sonuc.ozet || {}), ornek: true };
  return sonuc;
}
