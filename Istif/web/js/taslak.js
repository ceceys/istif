// Otomatik taslak: açık planda kaydedilmemiş değişiklik varsa 30 sn'de bir taslak yazılır.
// Kabuk taslağı program olağan kapanınca siler; çökme ya da elektrik kesintisinden sonra taslak kalır
// ve açılışta "kaydedilmemiş plan, geri yüklensin mi?" diye sorulur.
// Dil değişince sayfa yeniden yüklenir; açık plan o sırada oturum hafızasıyla (sessionStorage) taşınır.
import { t } from './dil.js';
import { kac, tarihSaat } from './bicim.js';
import { istek, kabukVar } from './kopru.js';
import { durum, dinle, planJson, plandanOku, planiAc } from './durum.js';
import { diyalog } from './arayuz.js';
import { aktifEkran } from './yonlendirici.js';

const ARALIK_MS = 30000;
const YENIDEN_YUKLEME = 'istif.yenidenYukleme';
let sonYazilan = null;

async function yaz() {
  const p = durum.plan;
  if (!p || !p.kaydedilmemis || !p.kalemler.length) return;
  const json = planJson(p);
  if (json === sonYazilan) return;
  try {
    await istek('taslakYaz', {
      json: JSON.stringify({ bicim: 'istif-taslak', zaman: new Date().toISOString(), yol: p.yol, plan: JSON.parse(json) }),
    });
    sonYazilan = json;
  } catch (e) {
    console.warn('Taslak yazılamadı', e);
  }
}

export async function taslakSil() {
  sonYazilan = null;
  await istek('taslakSil').catch(() => {});
}

/** Zamanlayıcıyı kurar; plan açılınca ya da kaydedilince eski taslak silinir. */
export function taslakBaslat() {
  setInterval(yaz, ARALIK_MS);
  dinle('planKaydedildi', () => taslakSil());
  dinle('planAcildi', (p) => {
    if (!p.kaydedilmemis) taslakSil();
  });
  if (!kabukVar) {
    // Tarayıcıda olağan kapanış: kaydedilmemiş değişiklik yoksa taslak gerekmez
    addEventListener('pagehide', () => {
      if (!durum.plan || !durum.plan.kaydedilmemis) localStorage.removeItem('istif.taslak');
    });
  }
}

/** Açılışta kalan taslak varsa sorar. Geri yüklenirse true. */
export async function taslakSor() {
  let v = null;
  try {
    v = await istek('taslakOku');
  } catch {
    return false;
  }
  if (!v || typeof v !== 'object' || !v.plan) return false;
  let plan;
  try {
    plan = plandanOku(v.plan);
  } catch {
    await taslakSil();
    return false;
  }
  const d = diyalog({
    baslik: t('taslak.baslik'),
    icerik: `
      <p class="diyalog-metin">${kac(t('taslak.metin'))}</p>
      <div class="taslak-kart"><b>${kac(plan.ad)}</b><small>${kac(v.zaman ? tarihSaat(v.zaman) : '')}</small></div>`,
    simgeAdi: 'geriAl',
    genislik: 460,
    dugmeler: [
      { metin: t('taslak.sil'), tur: 'ikincil', deger: false },
      { metin: t('taslak.geriYukle'), tur: 'birincil', deger: true },
    ],
  });
  const evet = (await d.sonuc) === true;
  if (!evet) {
    await taslakSil();
    return false;
  }
  planiAc(plan, { yol: typeof v.yol === 'string' ? v.yol : null, kaydedilmemis: true });
  return true;
}

/** Dil değişince: açık plan ve ekran oturum hafızasına yazılır, sayfa yeniden yüklenir. */
export function yenidenYukle() {
  const p = durum.plan;
  const kayit = { ekran: aktifEkran(), plan: p ? JSON.parse(planJson(p)) : null, yol: p ? p.yol : null, kaydedilmemis: p ? p.kaydedilmemis : false };
  try {
    sessionStorage.setItem(YENIDEN_YUKLEME, JSON.stringify(kayit));
  } catch {
    /* hafıza doluysa plan yalnız taslaktan döner */
  }
  location.reload();
}

/** Yeniden yüklemeden sonra açık planı geri koyar. Döner: { ekran } ya da null */
export function yenidenYuklemedenDon() {
  let kayit = null;
  try {
    kayit = JSON.parse(sessionStorage.getItem(YENIDEN_YUKLEME) || 'null');
    sessionStorage.removeItem(YENIDEN_YUKLEME);
  } catch {
    return null;
  }
  if (!kayit) return null;
  if (kayit.plan) {
    try {
      planiAc(plandanOku(kayit.plan), { yol: kayit.yol, kaydedilmemis: kayit.kaydedilmemis });
    } catch {
      /* plan okunamazsa boş açılır */
    }
  }
  return { ekran: kayit.ekran };
}
