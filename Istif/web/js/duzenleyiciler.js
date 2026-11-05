// Düzenleme pencereleri: yük kalemi / ürün, araç, ürün seçici ve tek satırlık ad sorusu.
import { t } from './dil.js';
import { kac, kg, olcu, sayiOku, olcuBirimi, agirlikBirimi, mmdenOlcu, olcudenMm, kgdanAgirlik, agirliktanKg } from './bicim.js';
import { simge, aracCizimi } from './simgeler.js';
import { diyalog, ogeUret, $, $$, bildirim } from './arayuz.js';
import { sayiAlani, sayiAlanlariniBagla, alanDegeri, alanHatasi, anahtar, renkSecici, renkSeciciBagla, kuralEtiketleri, boyalariUygula } from './bilesenler.js';
import { ARAC_TURLERI, RENKLER, hazirArac, VARSAYILAN_ARAC } from './veri.js';
import { durum } from './durum.js';

/** mm → alanda gösterilen ölçü (cm ya da in); 0 ise boş */
const olcuDegeri = (mm) => (mm ? mmdenOlcu(mm) : '');

/**
 * Yük kalemi ya da ürün düzenleyici.
 * mod: 'plan' (adet, teslimat, ürünlere kaydet görünür) ya da 'urun'
 * Döner: { kalem, urunlereKaydet } ya da vazgeçilirse null
 */
export async function kalemDuzenle({ kalem = null, mod = 'plan', siraNo = 0 } = {}) {
  const yeni = !kalem;
  const k = {
    ad: '', referans: '', uzunluk: 0, en: 0, yukseklik: 0, agirlik: 0, adet: 1,
    renk: RENKLER[siraNo % RENKLER.length], donus: 'serbest', ustuneKonabilir: true,
    yalnizZemin: false, ustYukSiniri: null, teslimatSirasi: 0,
    ...(kalem || {}),
  };
  const planMi = mod === 'plan';
  const baslik = planMi
    ? t(yeni ? 'kalem.baslikYeni' : 'kalem.baslikDuzenle')
    : t(yeni ? 'kalem.baslikUrunYeni' : 'kalem.baslikUrunDuzenle');

  const form = ogeUret(`
    <form class="form kalem-formu" novalidate>
      <div class="form-satir form-satir--2-1">
        <label class="alan" data-alan="ad">
          <span class="alan-etiket">${kac(t('kalem.ad'))}</span>
          <input type="text" name="ad" value="${kac(k.ad)}" placeholder="${kac(t('kalem.adYer'))}" maxlength="80" autocomplete="off">
        </label>
        <label class="alan">
          <span class="alan-etiket">${kac(t('kalem.referans'))}</span>
          <input type="text" name="referans" value="${kac(k.referans)}" placeholder="${kac(t('kalem.referansYer'))}" maxlength="60" autocomplete="off">
        </label>
      </div>

      <fieldset class="grup">
        <legend>${kac(t('kalem.olculer'))}</legend>
        <div class="form-satir form-satir--3">
          ${sayiAlani({ ad: 'uzunluk', etiket: t('kalem.uzunluk'), deger: olcuDegeri(k.uzunluk), birim: olcuBirimi() })}
          ${sayiAlani({ ad: 'en', etiket: t('kalem.en'), deger: olcuDegeri(k.en), birim: olcuBirimi() })}
          ${sayiAlani({ ad: 'yukseklik', etiket: t('kalem.yukseklik'), deger: olcuDegeri(k.yukseklik), birim: olcuBirimi() })}
        </div>
        <div class="form-satir ${planMi ? 'form-satir--2' : 'form-satir--1-yarim'}">
          ${sayiAlani({ ad: 'agirlik', etiket: t('kalem.agirlik'), deger: kgdanAgirlik(k.agirlik), birim: agirlikBirimi() })}
          ${planMi ? sayiAlani({ ad: 'adet', etiket: t('kalem.adet'), deger: k.adet, ondalik: 0, enAz: 1 }) : ''}
        </div>
      </fieldset>

      <fieldset class="grup">
        <legend>${kac(t('kalem.renk'))}</legend>
        ${renkSecici(k.renk)}
      </fieldset>

      <fieldset class="grup">
        <legend>${kac(t('kalem.yon'))}</legend>
        <div class="bolumlu" role="radiogroup">
          ${['serbest', 'dik', 'sabit'].map((y) => `
            <label class="bolumlu-secenek">
              <input type="radio" name="donus" value="${y}" ${k.donus === y ? 'checked' : ''}>
              <span>${kac(t('kalem.yonAd.' + y))}</span>
            </label>`).join('')}
        </div>
        <p class="alan-aciklama yon-aciklama">${kac(t('kalem.yonAciklama.' + k.donus))}</p>
      </fieldset>

      <fieldset class="grup">
        <legend>${kac(t('kalem.kurallar'))}</legend>
        ${anahtar({ ad: 'ustuneKonamaz', etiket: t('kalem.ustuneKonamaz'), aciklama: t('kalem.ustuneKonamazAciklama'), acik: k.ustuneKonabilir === false })}
        ${anahtar({ ad: 'yalnizZemin', etiket: t('kalem.yalnizZemin'), aciklama: t('kalem.yalnizZeminAciklama'), acik: !!k.yalnizZemin })}
        <div class="anahtar-ile-alan">
          ${anahtar({ ad: 'ustYukVar', etiket: t('kalem.ustYukSiniri'), aciklama: t('kalem.ustYukAciklama'), acik: k.ustYukSiniri != null && k.ustuneKonabilir !== false, devreDisi: k.ustuneKonabilir === false })}
          ${sayiAlani({ ad: 'ustYukSiniri', etiket: '', deger: k.ustYukSiniri == null ? '' : kgdanAgirlik(k.ustYukSiniri), birim: agirlikBirimi(), devreDisi: k.ustYukSiniri == null || k.ustuneKonabilir === false, kucuk: true })}
        </div>
        ${planMi ? `
        <div class="teslimat-satir">
          <div class="anahtar-metin">
            <span class="anahtar-etiket">${kac(t('kalem.teslimat'))}</span>
            <span class="anahtar-aciklama">${kac(t('kalem.teslimatAciklama'))}</span>
          </div>
          ${sayiAlani({ ad: 'teslimatSirasi', etiket: '', deger: k.teslimatSirasi || 0, ondalik: 0, kucuk: true })}
        </div>` : ''}
      </fieldset>

      ${planMi && !k.urunId ? `<div class="form-alt-secenek">${anahtar({ ad: 'urunlereKaydet', etiket: t('kalem.urunlereKaydet'), acik: false })}</div>` : ''}
    </form>`);

  let renk = k.renk;
  sayiAlanlariniBagla(form);
  renkSeciciBagla(form, (r) => (renk = r));

  // Yön açıklaması seçime göre değişir
  $$('input[name="donus"]', form).forEach((r) => r.addEventListener('change', () => {
    $('.yon-aciklama', form).textContent = t('kalem.yonAciklama.' + r.value);
  }));

  // Üstüne konamaz açıkken üst yük sınırı anlamsız
  const ustuneKonamaz = $('[name="ustuneKonamaz"]', form);
  const ustYukVar = $('[name="ustYukVar"]', form);
  const ustYuk = $('[name="ustYukSiniri"]', form);
  const ustYukGuncelle = () => {
    ustYukVar.disabled = ustuneKonamaz.checked;
    ustYukVar.closest('.anahtar-satir').classList.toggle('devre-disi', ustuneKonamaz.checked);
    const acik = ustYukVar.checked && !ustuneKonamaz.checked;
    ustYuk.disabled = !acik;
    ustYuk.closest('.sayi-girdi').classList.toggle('devre-disi', !acik);
    if (acik && !ustYuk.value) ustYuk.focus();
  };
  ustuneKonamaz.addEventListener('change', ustYukGuncelle);
  ustYukVar.addEventListener('change', ustYukGuncelle);

  let sonuc = null;
  const d = diyalog({
    baslik,
    icerik: form,
    genislik: 600,
    sinif: 'diyalog--form',
    dugmeler: [
      { metin: t('genel.vazgec'), tur: 'ikincil', deger: false },
      { metin: t('genel.kaydet'), tur: 'birincil', deger: true },
    ],
    once: (deger) => {
      if (!deger) return true;
      const v = (ad) => alanDegeri(form, ad);
      const ad = $('[name="ad"]', form).value.trim();
      const u = v('uzunluk'), e = v('en'), y = v('yukseklik'), a = v('agirlik');
      const adet = planMi ? v('adet') : 1;
      let tamam = true;
      alanHatasi(form, 'ad', ad ? '' : t('kalem.hataAd'));
      if (!ad) tamam = false;
      const olcuAdlari = ['uzunluk', 'en', 'yukseklik'];
      const gecersiz = olcuAdlari.filter((n) => !(Number.isFinite(v(n)) && v(n) > 0));
      olcuAdlari.forEach((n) => alanHatasi(form, n, ''));
      gecersiz.forEach((n, i) => alanHatasi(form, n, i === 0 ? t('kalem.hataOlcu') : ' '));
      if (gecersiz.length) tamam = false;
      const agirlikTamam = Number.isFinite(a) && a >= 0;
      alanHatasi(form, 'agirlik', agirlikTamam ? '' : t('kalem.hataAgirlik'));
      if (!agirlikTamam) tamam = false;
      if (planMi) {
        const adetTamam = Number.isFinite(adet) && adet >= 1;
        alanHatasi(form, 'adet', adetTamam ? '' : t('kalem.hataAdet'));
        if (!adetTamam) tamam = false;
      }
      const ustYukAcik = ustYukVar.checked && !ustuneKonamaz.checked;
      const ustYukDeger = v('ustYukSiniri');
      if (ustYukAcik && !(Number.isFinite(ustYukDeger) && ustYukDeger >= 0)) {
        alanHatasi(form, 'ustYukSiniri', t('kalem.hataUstYuk'));
        tamam = false;
      } else alanHatasi(form, 'ustYukSiniri', '');
      if (!tamam) {
        const ilk = form.querySelector('.alan--hata input');
        if (ilk) ilk.focus();
        return false;
      }
      sonuc = {
        kalem: {
          ...k,
          ad,
          referans: $('[name="referans"]', form).value.trim(),
          uzunluk: olcudenMm(u),
          en: olcudenMm(e),
          yukseklik: olcudenMm(y),
          agirlik: agirliktanKg(a),
          adet: Math.round(adet),
          renk,
          donus: $('[name="donus"]:checked', form)?.value || 'serbest',
          ustuneKonabilir: !ustuneKonamaz.checked,
          yalnizZemin: $('[name="yalnizZemin"]', form).checked,
          ustYukSiniri: ustYukAcik ? agirliktanKg(ustYukDeger) : null,
          teslimatSirasi: planMi ? Math.max(0, Math.round(v('teslimatSirasi') || 0)) : 0,
        },
        urunlereKaydet: !!$('[name="urunlereKaydet"]', form)?.checked,
      };
      return true;
    },
  });
  await d.sonuc;
  return sonuc;
}

/**
 * Araç düzenleyici (kütüphanedeki kullanıcı aracı).
 * Döner: araç nesnesi ya da null
 */
export async function aracDuzenle({ arac = null } = {}) {
  const yeni = !arac || !arac.id;
  // Yeni araç Standart Tır ölçüleriyle başlar (katalogdan); katalog açılamadıysa boş
  const temel = hazirArac(VARSAYILAN_ARAC);
  const a = {
    ad: '', tur: 'tir', uzunluk: temel ? temel.uzunluk : 0, en: temel ? temel.en : 0, yukseklik: temel ? temel.yukseklik : 0,
    maksAgirlik: temel ? temel.maksAgirlik : 0, kapiPayiMm: 0, aks: null, ...(arac || {}),
  };
  const form = ogeUret(`
    <form class="form arac-formu" novalidate>
      <label class="alan" data-alan="ad">
        <span class="alan-etiket">${kac(t('aracDuzen.ad'))}</span>
        <input type="text" name="ad" value="${kac(a.ad)}" placeholder="${kac(t('aracDuzen.adYer'))}" maxlength="60" autocomplete="off">
      </label>
      <fieldset class="grup">
        <legend>${kac(t('aracDuzen.tur'))}</legend>
        <div class="tur-secici" role="radiogroup">
          ${ARAC_TURLERI.map((tur) => `
            <label class="tur-secenek">
              <input type="radio" name="tur" value="${tur}" ${a.tur === tur ? 'checked' : ''}>
              <span class="tur-kutu">${aracCizimi(tur, 56)}<span>${kac(t('araclar.turler.' + tur))}</span></span>
            </label>`).join('')}
        </div>
        <p class="alan-aciklama">${kac(t('aracDuzen.turAciklama'))}</p>
      </fieldset>
      <fieldset class="grup">
        <legend>${kac(t('aracDuzen.icOlcu'))}</legend>
        <div class="form-satir form-satir--3">
          ${sayiAlani({ ad: 'uzunluk', etiket: t('kalem.uzunluk'), deger: olcuDegeri(a.uzunluk), birim: olcuBirimi() })}
          ${sayiAlani({ ad: 'en', etiket: t('kalem.en'), deger: olcuDegeri(a.en), birim: olcuBirimi() })}
          ${sayiAlani({ ad: 'yukseklik', etiket: t('kalem.yukseklik'), deger: olcuDegeri(a.yukseklik), birim: olcuBirimi() })}
        </div>
        <div class="form-satir form-satir--2">
          ${sayiAlani({ ad: 'maksAgirlik', etiket: t('aracDuzen.azamiYuk'), deger: a.yukBilinmiyor && !a.maksAgirlik ? '' : kgdanAgirlik(a.maksAgirlik || 0), birim: agirlikBirimi(), ondalik: 0, ipucu: t('aracDuzen.azamiYukAciklama') })}
          ${sayiAlani({ ad: 'kapiPayi', etiket: t('plan.arac.kapiPayi'), deger: mmdenOlcu(a.kapiPayiMm || 0), birim: olcuBirimi(), ipucu: t('plan.arac.kapiPayiAciklama') })}
        </div>
        <p class="alan-aciklama">${kac(t('aracDuzen.azamiYukAciklama'))}</p>
      </fieldset>
      <fieldset class="grup">
        <legend>${kac(t('aracDuzen.aks'))}</legend>
        <p class="alan-aciklama">${kac(t('aracDuzen.aksAciklama'))}</p>
        <div class="form-satir form-satir--2">
          ${sayiAlani({ ad: 'sasiMesafe', etiket: t('aracDuzen.sasi'), deger: a.aks ? mmdenOlcu(a.aks.sasiMesafe) : '', birim: olcuBirimi() })}
          ${sayiAlani({ ad: 'aksMerkezi', etiket: t('aracDuzen.aksMerkezi'), deger: a.aks ? mmdenOlcu(a.aks.aksMerkezi) : '', birim: olcuBirimi() })}
        </div>
      </fieldset>
      <p class="not-satiri">${simge('bilgi', 14)}${kac(t('araclar.tipNotu'))}</p>
    </form>`);
  sayiAlanlariniBagla(form);

  let sonuc = null;
  const d = diyalog({
    baslik: t(yeni ? 'aracDuzen.baslikYeni' : 'aracDuzen.baslikDuzenle'),
    icerik: form,
    genislik: 600,
    sinif: 'diyalog--form',
    dugmeler: [
      { metin: t('genel.vazgec'), tur: 'ikincil', deger: false },
      { metin: t('genel.kaydet'), tur: 'birincil', deger: true },
    ],
    once: (deger) => {
      if (!deger) return true;
      const v = (ad) => alanDegeri(form, ad);
      const ad = $('[name="ad"]', form).value.trim();
      let tamam = true;
      alanHatasi(form, 'ad', ad ? '' : t('aracDuzen.hataAd'));
      if (!ad) tamam = false;
      const u = v('uzunluk'), e = v('en'), y = v('yukseklik');
      const olcuTamam = [u, e, y].every((x) => Number.isFinite(x) && x > 0);
      alanHatasi(form, 'yukseklik', olcuTamam ? '' : t('aracDuzen.hataOlcu'));
      if (!olcuTamam) tamam = false;
      const s = v('sasiMesafe'), m = v('aksMerkezi');
      let aks = null;
      if (Number.isFinite(s) || Number.isFinite(m)) {
        if (Number.isFinite(s) && Number.isFinite(m) && m > s && s >= 0) aks = { sasiMesafe: olcudenMm(s), aksMerkezi: olcudenMm(m) };
        else {
          alanHatasi(form, 'aksMerkezi', t('aracDuzen.hataAks'));
          tamam = false;
        }
      }
      if (tamam) alanHatasi(form, 'aksMerkezi', '');
      if (!tamam) return false;
      const maks = v('maksAgirlik');
      const pay = v('kapiPayi');
      sonuc = {
        ...a,
        ad,
        tur: $('[name="tur"]:checked', form)?.value || 'tir',
        uzunluk: olcudenMm(u),
        en: olcudenMm(e),
        yukseklik: olcudenMm(y),
        maksAgirlik: Number.isFinite(maks) && maks > 0 ? Math.round(agirliktanKg(maks)) : 0,
        yukBilinmiyor: !(Number.isFinite(maks) && maks > 0) && a.yukBilinmiyor === true,
        kapiPayiMm: Number.isFinite(pay) && pay > 0 ? olcudenMm(pay) : 0,
        aks,
      };
      delete sonuc.hazir;
      return true;
    },
  });
  await d.sonuc;
  return sonuc;
}

/**
 * Ürün kütüphanesinden plana ekleme. Pencere açık kalır; her "Ekle" bir kalem ekler.
 * ekle(urun, adet) çağrılır.
 */
export function urunSec({ ekle }) {
  const kok = ogeUret(`
    <div class="urun-sec">
      <label class="arama">
        ${simge('ara', 16)}
        <input type="search" placeholder="${kac(t('urunSec.ara'))}" autocomplete="off">
      </label>
      <div class="urun-sec-liste" role="list"></div>
    </div>`);
  const liste = $('.urun-sec-liste', kok);
  const arama = $('input', kok);

  function ciz() {
    const s = arama.value.trim().toLocaleLowerCase('tr-TR');
    const urunler = durum.kutuphane.urunler.filter((u) => !s || `${u.ad} ${u.referans}`.toLocaleLowerCase('tr-TR').includes(s));
    if (!durum.kutuphane.urunler.length) {
      liste.innerHTML = `<p class="bos-not">${kac(t('urunSec.bos'))}</p>`;
      return;
    }
    if (!urunler.length) {
      liste.innerHTML = `<p class="bos-not">${kac(t('urunSec.bulunamadi'))}</p>`;
      return;
    }
    liste.innerHTML = urunler.map((u) => `
      <div class="urun-sec-satir" role="listitem" data-id="${kac(u.id)}">
        <span class="renk-serit" data-boya="${kac(u.renk)}"></span>
        <div class="urun-sec-bilgi">
          <div class="urun-sec-ad">${kac(u.ad)}${u.referans ? `<span class="soluk"> · ${kac(u.referans)}</span>` : ''}</div>
          <div class="urun-sec-alt">${olcu(u.uzunluk, u.en, u.yukseklik)} ${kac(olcuBirimi())} · ${kac(kg(u.agirlik))}</div>
          <div class="etiketler">${kuralEtiketleri(u, { durak: false })}</div>
        </div>
        <div class="adim-sayac">
          <button type="button" class="simge-dugme" data-adim="-1" aria-label="-">${simge('sol', 14)}</button>
          <input type="text" inputmode="numeric" value="1" aria-label="${kac(t('kalem.adet'))}">
          <button type="button" class="simge-dugme" data-adim="1" aria-label="+">${simge('sag', 14)}</button>
        </div>
        <button type="button" class="dugme dugme--ikincil dugme--kucuk urun-ekle">${simge('ekle', 14)}${kac(t('urunSec.ekle'))}</button>
      </div>`).join('');
    boyalariUygula(liste);
  }

  liste.addEventListener('click', (e) => {
    const satir = e.target.closest('.urun-sec-satir');
    if (!satir) return;
    const girdi = $('.adim-sayac input', satir);
    const adimDugme = e.target.closest('[data-adim]');
    if (adimDugme) {
      const n = Math.max(1, (Math.round(sayiOku(girdi.value)) || 1) + Number(adimDugme.dataset.adim));
      girdi.value = String(n);
      return;
    }
    const ekleDugme = e.target.closest('.urun-ekle');
    if (ekleDugme) {
      const urun = durum.kutuphane.urunler.find((u) => u.id === satir.dataset.id);
      const adet = Math.max(1, Math.round(sayiOku(girdi.value)) || 1);
      if (urun) {
        ekle(urun, adet);
        ekleDugme.classList.add('eklendi');
        ekleDugme.innerHTML = `${simge('onay', 14)}${kac(t('urunSec.ekle'))}`;
        setTimeout(() => {
          ekleDugme.classList.remove('eklendi');
          ekleDugme.innerHTML = `${simge('ekle', 14)}${kac(t('urunSec.ekle'))}`;
        }, 1200);
        bildirim(t('urunSec.eklendi', { ad: urun.ad }), { tur: 'basari', sure: 2200 });
      }
    }
  });
  arama.addEventListener('input', ciz);
  ciz();

  return diyalog({
    baslik: t('urunSec.baslik'),
    icerik: kok,
    genislik: 640,
    sinif: 'diyalog--liste',
    dugmeler: [{ metin: t('genel.tamam'), tur: 'birincil', deger: true }],
  }).sonuc;
}

/** Tek satırlık metin sorusu (ör. araç adı). */
export async function metinSor({ baslik, etiket, deger = '' }) {
  const form = ogeUret(`
    <form class="form" novalidate>
      <label class="alan" data-alan="metin">
        <span class="alan-etiket">${kac(etiket)}</span>
        <input type="text" name="metin" value="${kac(deger)}" maxlength="60" autocomplete="off">
      </label>
    </form>`);
  let sonuc = null;
  const d = diyalog({
    baslik,
    icerik: form,
    genislik: 420,
    dugmeler: [
      { metin: t('genel.vazgec'), tur: 'ikincil', deger: false },
      { metin: t('genel.kaydet'), tur: 'birincil', deger: true },
    ],
    once: (deger2) => {
      if (!deger2) return true;
      const v = $('[name="metin"]', form).value.trim();
      alanHatasi(form, 'metin', v ? '' : t('aracDuzen.hataAd'));
      if (!v) return false;
      sonuc = v;
      return true;
    },
  });
  setTimeout(() => $('[name="metin"]', form)?.select(), 50);
  await d.sonuc;
  return sonuc;
}
