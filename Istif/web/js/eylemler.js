// Ekranlardan çağrılan ortak işler: yeni plan, örnek yük, plan aç/kaydet, kapatma ve güncelleme soruları.
import { t } from './dil.js';
import { URUN } from './urun.js';
import { istek, kabukVar, bildir, dinle as kabukDinle } from './kopru.js';
import { durum, planiAc, planKaydedildi, planJson, plandanOku, yeniPlanNesnesi } from './durum.js';
import { ornekPlanVerisi } from './veri.js';
import { bildirim, diyalog, hataKutusu, onayIste } from './arayuz.js';
import { git } from './yonlendirici.js';
import { kac } from './bicim.js';

/** Açık planda kaydedilmemiş değişiklik varsa sorar; devam edilebilirse true. */
export async function degisiklikleriSor() {
  const p = durum.plan;
  if (!p || !p.kaydedilmemis || !p.kalemler.length) return true;
  return onayIste({
    baslik: t('plan.degisiklik.baslik'),
    metin: t('plan.degisiklik.metin'),
    tamam: t('plan.degisiklik.devam'),
    tehlike: true,
  });
}

export async function yeniPlan() {
  if (!(await degisiklikleriSor())) return;
  planiAc(yeniPlanNesnesi());
  git('plan');
}

/** Örnek yük galerisinden bir plan açar: ad "tarim" | "palet" | "koli" | "konteyner" */
export async function ornekAc({ ad = 'tarim', planla = false } = {}) {
  if (!(await degisiklikleriSor())) return;
  planiAc(yeniPlanNesnesi(ornekPlanVerisi(ad)), { kaydedilmemis: true });
  git('plan');
  if (planla) setTimeout(() => document.dispatchEvent(new CustomEvent('istif:planla')), 350);
}

/** yol verilmezse Aç penceresi; verilirse doğrudan açar (son planlar). */
export async function planAc(yol = null) {
  if (!(await degisiklikleriSor())) return;
  let cevap;
  try {
    cevap = await istek('planAc', yol ? { yol } : {});
  } catch (e) {
    await hataKutusu({ baslik: t('plan.ac'), metin: e.message });
    return;
  }
  if (!cevap) return;
  acilanPlaniYukle(cevap);
}

/** Kabuktan ya da Aç penceresinden gelen { yol, json } */
export function acilanPlaniYukle({ yol, json }) {
  let plan;
  try {
    plan = plandanOku(json);
  } catch (e) {
    hataKutusu({ baslik: t('plan.ac'), metin: e.message });
    return;
  }
  const kaliciYol = kabukVar || String(yol).startsWith('yerel:') ? yol : null;
  planiAc(plan, { yol: kaliciYol });
  git('plan');
  bildirim(t('plan.acildi', { ad: plan.ad }), { tur: 'basari' });
}

/** Planı kaydeder. farkli: her zaman Kaydet penceresi açılır. */
export async function kaydet({ farkli = false } = {}) {
  const p = durum.plan;
  if (!p) return false;
  let cevap;
  try {
    cevap = await istek('planKaydet', { json: planJson(p), onerilenAd: p.ad, yol: farkli ? null : p.yol });
  } catch (e) {
    await hataKutusu({ baslik: t('plan.kaydet'), metin: e.message });
    return false;
  }
  if (!cevap) return false;
  planKaydedildi(cevap.yol);
  bildirim(kabukVar ? t('plan.kaydedildiBildirim') : t('plan.tarayicidaKaydedildi'), {
    tur: 'basari',
    eylem: kabukVar ? { metin: t('planlar.klasordeGoster'), fn: () => istek('dosyaGoster', { yol: cevap.yol }).catch(() => {}) } : null,
  });
  return true;
}

/** Pencere kapatılırken kaydedilmemiş değişiklik varsa kabuk sorar. */
export async function kapatmaIstegi() {
  bildir('kapatmaAlindi');
  const d = diyalog({
    baslik: t('plan.kapatma.baslik'),
    icerik: `<p class="diyalog-metin">${kac(t('plan.kapatma.metin'))}</p>`,
    simgeAdi: 'uyari',
    genislik: 460,
    dugmeler: [
      { metin: t('genel.vazgec'), tur: 'ikincil', deger: 'vazgec' },
      { metin: t('plan.kapatma.kaydetmedenCik'), tur: 'ikincil', deger: 'cik' },
      { metin: t('plan.kapatma.kaydetCik'), tur: 'birincil', deger: 'kaydet' },
    ],
  });
  const secim = await d.sonuc;
  if (secim === 'cik') istek('pencere', { islem: 'kapat', zorla: true });
  else if (secim === 'kaydet' && (await kaydet())) istek('pencere', { islem: 'kapat', zorla: true });
}

/** Kabuk yeni sürüm bulunca sorulur; onaylanırsa indirilip kurulur. */
export async function guncellemeSor({ surum, notlar }) {
  const icerik = `
    <p class="diyalog-metin">${kac(t('guncelleme.metin', { ad: URUN.ad, s: surum }))}</p>
    ${notlar ? `<div class="surum-notlari"><h3>${kac(t('guncelleme.notlar'))}</h3><pre>${kac(notlar)}</pre></div>` : ''}
    <div class="guncelleme-ilerleme" hidden><div class="ilerleme-cubuk"><span></span></div><p class="ilerleme-metin"></p></div>`;
  const d = diyalog({
    baslik: t('guncelleme.baslik', { s: surum }),
    icerik,
    simgeAdi: 'guncelle',
    genislik: 500,
    dugmeler: [
      { metin: t('guncelleme.sonra'), tur: 'ikincil', deger: false },
      { metin: t('guncelleme.simdi'), tur: 'birincil', deger: true, kapatmaz: true },
    ],
    once: async (deger, dugme) => {
      if (!deger) return true;
      if (durum.plan && durum.plan.kaydedilmemis && durum.plan.kalemler.length) {
        const kaydetsin = await onayIste({ baslik: t('plan.degisiklik.baslik'), metin: t('guncelleme.once'), tamam: t('plan.kaydet'), iptal: t('plan.degisiklik.devam') });
        if (kaydetsin && !(await kaydet())) return false;
      }
      dugme.disabled = true;
      const kutu = d.govde.querySelector('.guncelleme-ilerleme');
      const cubuk = kutu.querySelector('.ilerleme-cubuk span');
      const yazi = kutu.querySelector('.ilerleme-metin');
      kutu.hidden = false;
      yazi.textContent = t('guncelleme.hazirlaniyor');
      const birak = kabukDinle('guncellemeIlerleme', (m) => {
        cubuk.style.width = `${m.yuzde}%`;
        yazi.textContent = t('guncelleme.indiriliyor', { y: m.yuzde });
      });
      try {
        await istek('guncellemeKur');
        yazi.textContent = t('guncelleme.kuruluyor');
      } catch (e) {
        birak();
        dugme.disabled = false;
        kutu.hidden = true;
        await hataKutusu({ baslik: t('guncelleme.hata'), metin: e.message });
      }
      return false;
    },
  });
  return d.sonuc;
}
