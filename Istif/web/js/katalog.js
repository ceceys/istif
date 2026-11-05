// Gelişmiş araç kataloğu (web/veri/arac-katalogu.json): arama, kategori ve üretici süzgeci; her kayıtta iç ölçü,
// kapı ağzı, yük kapasitesi, "tipik" rozeti ve kaynak bağlantıları. Kayıt sayısından bağımsız çalışır;
// liste parça parça çizilir. Kaynak bağlantıları kabuktan açılır (katalogdaki adresler izinlidir).
import { t, tVarsa, yerel } from './dil.js';
import { kac, kg, m3, cm, olcu, olcuBirimi, sayi } from './bicim.js';
import { simge, aracCizimi } from './simgeler.js';
import { $, ogeUret, diyalog, bildirim, hataKutusu } from './arayuz.js';
import { istek } from './kopru.js';
import {
  katalogKayitlari, katalogBilgisi, kayitAdi, yerelMetin, kayitBaglantilari, katalogdanArac, kategoriTuru,
  KATALOG_KATEGORILERI, hazirAraclar, davlumbazNotuVar, plandaArac,
} from './veri.js';
import { durum, kutuphaneKaydet, yeniId, katalogdanPlanAraci } from './durum.js';

const SAYFA = 40;

function sade(s) {
  return String(s ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (h) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }[h]))
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Katalogdaki serbest metinli alt kategori ("Büyük", "Dry"…) dil dosyasında varsa çevrilir, yoksa olduğu gibi */
export function altKategoriAdi(s) {
  if (!s) return '';
  const anahtar = 'katalog.alt.' + sade(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return tVarsa(anahtar) || s;
}

export const kategoriAdi = (k) => tVarsa('katalog.kategori.' + k) || k;

/** Kaynak bağlantısını varsayılan tarayıcıda açar (kabuk izin listesini denetler) */
export function baglantiAc(url) {
  istek('baglantiAc', { url }).catch((e) => hataKutusu({ baslik: t('katalog.kaynak'), metin: e.message }));
}

export function alanAdi(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Kütüphaneye kaydeder; aynı katalog kaydı zaten varsa yeniden eklemez */
async function kutuphaneyeKaydet(k) {
  const varMi = durum.kutuphane.araclar.some((a) => a.katalogId === k.id);
  if (varMi) {
    bildirim(t('katalog.zatenKayitli', { ad: kayitAdi(k) }), { tur: 'bilgi' });
    return;
  }
  const a = katalogdanArac(k);
  durum.kutuphane.araclar.push({ ...a, id: yeniId('a') });
  try {
    await kutuphaneKaydet();
    bildirim(t('katalog.kaydedildi', { ad: a.ad }), { tur: 'basari' });
  } catch (e) {
    hataKutusu({ baslik: t('araclar.baslik'), metin: e.message });
  }
}

function kayitKarti(k) {
  const a = katalogdanArac(k);
  const baglantilar = kayitBaglantilari(k);
  const not = yerelMetin(k.not);
  const kapi = a.kapi ? `${cm(a.kapi.en)} × ${cm(a.kapi.yukseklik)} ${olcuBirimi()}` : t('katalog.yok');
  const yuk = a.maksAgirlik > 0 ? kg(a.maksAgirlik) : t('katalog.yukYok');
  const alt = [kategoriAdi(k.kategori), altKategoriAdi(k.altKategori), k.uretici ? `${k.uretici}${k.model ? ' ' + k.model : ''}` : k.model]
    .filter(Boolean).join(' · ');
  return `
    <article class="katalog-kayit" role="listitem" data-id="${kac(k.id)}">
      <div class="katalog-kayit-cizim">${aracCizimi(kategoriTuru(k.kategori), 64)}</div>
      <div class="katalog-kayit-govde">
        <div class="katalog-kayit-ust">
          <b>${kac(kayitAdi(k))}</b>
          ${k.tipik
            ? `<span class="rozet rozet--tipik" title="${kac(t('katalog.tipikAciklama'))}">${kac(t('katalog.tipik'))}</span>`
            : `<span class="rozet rozet--model" title="${kac(t('katalog.modelAciklama'))}">${kac(t('katalog.model'))}</span>`}
        </div>
        <small class="katalog-kayit-alt">${kac(alt)}</small>
        <dl class="katalog-olculer">
          <div><dt>${kac(t('katalog.icOlcu'))}</dt><dd>${olcu(a.uzunluk, a.en, a.yukseklik)} ${kac(olcuBirimi())}</dd></div>
          <div><dt>${kac(t('katalog.kapi'))}</dt><dd>${kac(kapi)}</dd></div>
          <div><dt>${kac(t('katalog.yuk'))}</dt><dd class="${a.maksAgirlik > 0 ? '' : 'soluk'}">${kac(yuk)}</dd></div>
          <div><dt>${kac(t('katalog.hacim'))}</dt><dd>${kac(m3(a.uzunluk * a.en * a.yukseklik))}</dd></div>
        </dl>
        ${davlumbazNotuVar(a) ? `<p class="katalog-not-satiri">${simge('bilgi', 13)}${kac(t('katalog.davlumbaz'))}</p>` : ''}
        ${not || baglantilar.length > 1 ? `
        <details class="katalog-ayrinti">
          <summary>${kac(t('katalog.ayrinti'))}</summary>
          ${not ? `<p>${kac(not)}</p>` : ''}
          <div class="katalog-kaynaklar">
            ${baglantilar.map((u, i) => `<button type="button" class="baglanti-kucuk" data-url="${kac(u)}" title="${kac(u)}">${simge('disBaglanti', 12)}${kac(i === 0 ? t('katalog.kaynak') : t('katalog.ekKaynak', { n: i + 1 }))}: ${kac(alanAdi(u))}</button>`).join('')}
          </div>
        </details>` : ''}
      </div>
      <div class="katalog-kayit-eylem">
        <button type="button" class="dugme dugme--ikincil dugme--kucuk" data-eylem="kullan">${simge('sag', 14)}${kac(t('katalog.kullan'))}</button>
        <button type="button" class="dugme dugme--hayalet dugme--kucuk" data-eylem="kaydet">${simge('yerImi', 14)}${kac(t('katalog.kaydet'))}</button>
        ${baglantilar[0] ? `<button type="button" class="metin-dugme" data-url="${kac(baglantilar[0])}" title="${kac(baglantilar[0])}">${simge('disBaglanti', 13)}${kac(t('katalog.kaynak'))}</button>` : ''}
      </div>
    </article>`;
}

/**
 * Katalog paneli (Araçlar ekranının "Gelişmiş" sekmesi ve katalog penceresi).
 * kullan(kayit) "Bu aracı kullan" düğmesiyle çağrılır.
 */
export function katalogPaneli({ kullan }) {
  const kok = ogeUret(`
    <div class="katalog">
      <div class="katalog-suzgec">
        <label class="arama">${simge('ara', 16)}<input type="search" placeholder="${kac(t('katalog.ara'))}" autocomplete="off" aria-label="${kac(t('katalog.ara'))}"></label>
        <label class="alan alan--yatay"><span class="alan-etiket">${kac(t('katalog.kategori'))}</span><select class="secim" data-suzgec="kategori"></select></label>
        <label class="alan alan--yatay"><span class="alan-etiket">${kac(t('katalog.uretici'))}</span><select class="secim" data-suzgec="uretici"></select></label>
      </div>
      <div class="katalog-ust">
        <span class="katalog-sayi soluk" aria-live="polite"></span>
        <span class="katalog-bilgi">${simge('bilgi', 13)}${kac(t('katalog.not'))}</span>
      </div>
      <div class="katalog-liste" role="list"></div>
    </div>`);

  const arama = $('input[type="search"]', kok);
  const kategoriSecim = $('[data-suzgec="kategori"]', kok);
  const ureticiSecim = $('[data-suzgec="uretici"]', kok);
  const liste = $('.katalog-liste', kok);
  let gosterilen = SAYFA;

  function secenekleriCiz() {
    const kayitlar = katalogKayitlari();
    const kategoriler = KATALOG_KATEGORILERI.filter((k) => kayitlar.some((r) => r.kategori === k));
    const ureticiler = [...new Set(kayitlar.map((r) => r.uretici).filter(Boolean))].sort((a, b) => a.localeCompare(b, yerel()));
    kategoriSecim.innerHTML = `<option value="">${kac(t('genel.hepsi'))}</option>` +
      kategoriler.map((k) => `<option value="${kac(k)}">${kac(kategoriAdi(k))} (${sayi(kayitlar.filter((r) => r.kategori === k).length)})</option>`).join('');
    ureticiSecim.innerHTML = `<option value="">${kac(t('genel.hepsi'))}</option>` +
      ureticiler.map((u) => `<option value="${kac(u)}">${kac(u)}</option>`).join('');
  }

  function uygunlar() {
    const s = sade(arama.value.trim());
    const kat = kategoriSecim.value;
    const ur = ureticiSecim.value;
    return katalogKayitlari().filter((k) => {
      if (kat && k.kategori !== kat) return false;
      if (ur && k.uretici !== ur) return false;
      if (!s) return true;
      const metin = sade([k.id, k.ad && k.ad.tr, k.ad && k.ad.en, k.uretici, k.model, k.altKategori, kategoriAdi(k.kategori)].join(' '));
      return s.split(/\s+/).every((parca) => metin.includes(parca));
    });
  }

  function ciz() {
    const bilgi = katalogBilgisi();
    if (bilgi.hata) {
      liste.innerHTML = `<div class="bos-durum bos-durum--kucuk">${simge('uyari', 22)}<div><b>${kac(t('katalog.acilamadi'))}</b></div></div>`;
      $('.katalog-sayi', kok).textContent = '';
      return;
    }
    const sonuc = uygunlar();
    $('.katalog-sayi', kok).textContent = t('katalog.sayi', { n: sonuc.length });
    if (!sonuc.length) {
      liste.innerHTML = `<p class="bos-not">${kac(t('katalog.bulunamadi'))}</p>`;
      return;
    }
    const parca = sonuc.slice(0, gosterilen);
    liste.innerHTML = parca.map(kayitKarti).join('') + (sonuc.length > gosterilen
      ? `<button type="button" class="dugme dugme--ikincil katalog-daha" data-eylem="daha">${kac(t('katalog.dahaFazla', { n: sonuc.length - gosterilen }))}</button>`
      : '');
  }

  const yeniden = () => {
    gosterilen = SAYFA;
    ciz();
  };
  arama.addEventListener('input', yeniden);
  kategoriSecim.addEventListener('change', yeniden);
  ureticiSecim.addEventListener('change', yeniden);

  liste.addEventListener('click', (e) => {
    const url = e.target.closest('[data-url]')?.dataset.url;
    if (url) {
      baglantiAc(url);
      return;
    }
    const eylem = e.target.closest('[data-eylem]')?.dataset.eylem;
    if (eylem === 'daha') {
      gosterilen += SAYFA;
      ciz();
      return;
    }
    const id = e.target.closest('.katalog-kayit')?.dataset.id;
    const k = id && katalogKayitlari().find((r) => r.id === id);
    if (!k) return;
    if (eylem === 'kullan') kullan(k);
    else if (eylem === 'kaydet') kutuphaneyeKaydet(k);
  });

  secenekleriCiz();
  ciz();
  return { kok, ciz, odakla: () => arama.focus() };
}

/** Katalog penceresi. Kayıt seçilirse plan aracı döner, vazgeçilirse null. */
export async function katalogDiyalogu({ baslik = t('katalog.baslik') } = {}) {
  let secilen = null;
  let d = null;
  const panel = katalogPaneli({
    kullan: (k) => {
      secilen = katalogdanPlanAraci(k);
      d.kapat(true);
    },
  });
  d = diyalog({ baslik, icerik: panel.kok, simgeAdi: 'katalog', genislik: 1000, sinif: 'diyalog--genis diyalog--katalog' });
  await d.sonuc;
  return secilen;
}

/**
 * Araç seçme penceresi (filoya araç eklemek için): hazır tipler, kullanıcının araçları ve katalog.
 * Döner: plan aracı ya da null
 */
export async function aracSecDiyalogu({ baslik }) {
  const satir = (a) => `
    <button type="button" class="arac-menu-oge" data-id="${kac(a.id)}">
      <span class="arac-menu-cizim">${aracCizimi(a.tur, 44)}</span>
      <span class="arac-menu-metin"><b>${kac(a.ad)}</b><small>${olcu(a.uzunluk, a.en, a.yukseklik)} ${kac(olcuBirimi())} · ${a.maksAgirlik ? kac(kg(a.maksAgirlik)) : '—'}</small></span>
    </button>`;
  const benim = durum.kutuphane.araclar;
  const kok = ogeUret(`
    <div class="arac-sec">
      <div class="arac-menu-grup">${kac(t('plan.arac.hazirTipler'))}</div>
      ${hazirAraclar().map(satir).join('')}
      ${benim.length ? `<div class="arac-menu-grup">${kac(t('plan.arac.araclarim'))}</div>${benim.map(satir).join('')}` : ''}
      <button type="button" class="arac-menu-katalog" data-eylem="katalog">${simge('katalog', 16)}<span>${kac(t('katalog.ac'))}</span>${simge('sag', 14)}</button>
    </div>`);
  let secilen = null;
  const d = diyalog({ baslik, icerik: kok, simgeAdi: 'araclar', genislik: 520, sinif: 'diyalog--liste' });
  kok.addEventListener('click', async (e) => {
    if (e.target.closest('[data-eylem="katalog"]')) {
      const a = await katalogDiyalogu();
      if (a) {
        secilen = a;
        d.kapat(true);
      }
      return;
    }
    const id = e.target.closest('.arac-menu-oge')?.dataset.id;
    if (!id) return;
    const kaynak = hazirAraclar().concat(benim).find((a) => a.id === id);
    if (kaynak) {
      secilen = plandaArac(kaynak);
      d.kapat(true);
    }
  });
  await d.sonuc;
  return secilen;
}
