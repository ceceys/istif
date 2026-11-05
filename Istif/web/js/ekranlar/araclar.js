// Araçlar: kullanıcının araçları, hazır tipler (katalogdan türetilir, silinemez, kopyalanır) ve
// "Gelişmiş" sekmesinde bütün araç kataloğu.
import { t, yerel } from '../dil.js';
import { kac, kg, m3, aracOlcusu, cm, olcuBirimi } from '../bicim.js';
import { simge, aracCizimi } from '../simgeler.js';
import { $, $$, ogeUret, bildirim, hataKutusu, onayIste, siraliGiris } from '../arayuz.js';
import {
  durum, dinle, kutuphaneKaydet, yeniId, tumAraclar, planDegisti, planiAc, yeniPlanNesnesi, katalogdanPlanAraci,
} from '../durum.js';
import { plandaArac, davlumbazNotuVar, katalogKayitlari } from '../veri.js';
import { aracDuzenle } from '../duzenleyiciler.js';
import { git } from '../yonlendirici.js';
import { katalogPaneli, baglantiAc, alanAdi } from '../katalog.js';

export function araclarEkraniKur() {
  const kok = ogeUret(`
    <section class="ekran ekran-kutuphane ekran-araclar">
      <div class="ekran-ic">
        <header class="ekran-baslik">
          <div>
            <h1>${kac(t('araclar.baslik'))}</h1>
            <p class="ekran-aciklama">${kac(t('araclar.aciklama'))}</p>
          </div>
          <div class="ekran-baslik-eylem">
            <label class="arama arac-arama">${simge('ara', 16)}<input type="search" placeholder="${kac(t('araclar.ara'))}" autocomplete="off" aria-label="${kac(t('araclar.ara'))}"></label>
            <button type="button" class="dugme dugme--birincil" data-eylem="yeni">${simge('ekle', 18)}${kac(t('araclar.yeni'))}</button>
          </div>
        </header>
        <div class="sekmeler" role="tablist">
          <button type="button" role="tab" class="sekme secili" data-sekme="araclar" aria-selected="true">${simge('araclar', 16)}${kac(t('araclar.sekmeAraclar'))}</button>
          <button type="button" role="tab" class="sekme" data-sekme="katalog" aria-selected="false">${simge('katalog', 16)}${kac(t('araclar.sekmeGelismis'))}<span class="sayac-rozet katalog-sayisi"></span></button>
        </div>
        <div class="sekme-icerik" data-icerik="araclar">
          <p class="not-satiri arac-tip-notu">${simge('bilgi', 14)}${kac(t('araclar.tipNotu'))}</p>
          <div class="arac-gruplari"></div>
        </div>
        <div class="sekme-icerik" data-icerik="katalog" hidden></div>
      </div>
    </section>`);

  const arama = $('input[type="search"]', kok);
  const kap = $('.arac-gruplari', kok);
  let sekme = 'araclar';
  let katalog = null;

  function kart(a) {
    const seciliMi = durum.plan && durum.plan.arac.tipId === a.id;
    const kapi = a.kapi ? `${cm(a.kapi.en)} × ${cm(a.kapi.yukseklik)} ${olcuBirimi()}` : null;
    return `
      <article class="arac-kart${a.hazir ? ' arac-kart--hazir' : ''}${seciliMi ? ' arac-kart--secili' : ''}" data-id="${kac(a.id)}">
        <header>
          <span class="arac-kart-tur">${kac(t('araclar.turler.' + (a.tur || 'tir')))}</span>
          <span class="arac-kart-rozetler">
            ${a.katalogId ? (a.tipik
              ? `<span class="rozet rozet--tipik" title="${kac(t('katalog.tipikAciklama'))}">${kac(t('katalog.tipik'))}</span>`
              : `<span class="rozet rozet--model" title="${kac(t('katalog.modelAciklama'))}">${kac(t('katalog.model'))}</span>`) : ''}
            ${a.hazir ? `<span class="rozet rozet--kilit">${simge('kilit', 12)}${kac(t('araclar.hazir'))}</span>` : ''}
          </span>
        </header>
        <div class="arac-kart-cizim">${aracCizimi(a.tur, 150)}</div>
        <h3>${kac(a.ad)}</h3>
        <dl class="arac-kart-bilgi">
          <div><dt>${kac(t('araclar.icOlcu'))}</dt><dd>${kac(aracOlcusu(a))}</dd></div>
          <div><dt>${kac(t('araclar.hacim'))}</dt><dd>${kac(m3(a.uzunluk * a.en * a.yukseklik))}</dd></div>
          <div><dt>${kac(t('araclar.azamiYuk'))}</dt><dd>${a.maksAgirlik ? kac(kg(a.maksAgirlik)) : kac(a.yukBilinmiyor ? t('katalog.yukYok') : t('araclar.sinirsiz'))}</dd></div>
          ${kapi ? `<div><dt>${kac(t('katalog.kapi'))}</dt><dd>${kac(kapi)}</dd></div>` : ''}
        </dl>
        ${davlumbazNotuVar(a) ? `<p class="arac-kart-not">${simge('bilgi', 12)}${kac(t('katalog.davlumbaz'))}</p>` : ''}
        ${a.kaynak ? `<button type="button" class="baglanti-kucuk" data-url="${kac(a.kaynak)}" title="${kac(a.kaynak)}">${simge('disBaglanti', 12)}${kac(t('katalog.kaynak'))}: ${kac(alanAdi(a.kaynak))}</button>` : ''}
        <footer>
          <button type="button" class="dugme dugme--ikincil dugme--kucuk" data-eylem="planda">${simge('sag', 15)}${kac(t('araclar.plandaKullan'))}</button>
          <span class="bosluk"></span>
          <button type="button" class="simge-dugme" data-eylem="kopyala" title="${kac(t('araclar.kopyala'))}" aria-label="${kac(t('araclar.kopyala'))}">${simge('kopyala', 16)}</button>
          ${a.hazir ? '' : `
          <button type="button" class="simge-dugme" data-eylem="duzenle" title="${kac(t('genel.duzenle'))}" aria-label="${kac(t('genel.duzenle'))}">${simge('duzenle', 16)}</button>
          <button type="button" class="simge-dugme simge-dugme--tehlike" data-eylem="sil" title="${kac(t('genel.sil'))}" aria-label="${kac(t('genel.sil'))}">${simge('sil', 16)}</button>`}
        </footer>
      </article>`;
  }

  function ciz({ giris = false } = {}) {
    const s = arama.value.trim().toLocaleLowerCase(yerel());
    const uygun = (a) => !s || `${a.ad} ${t('araclar.turler.' + a.tur)}`.toLocaleLowerCase(yerel()).includes(s);
    const tum = tumAraclar();
    const hazir = tum.filter((a) => a.hazir && uygun(a));
    const benim = tum.filter((a) => !a.hazir && uygun(a));
    kap.innerHTML = `
      <section class="arac-grubu">
        <h2 class="grup-baslik">${kac(t('araclar.grupBenim'))}<span class="sayac-rozet">${durum.kutuphane.araclar.length}</span></h2>
        ${benim.length ? `<div class="arac-izgara">${benim.map(kart).join('')}</div>` : `
          <div class="bos-durum bos-durum--kucuk">${simge('araclar', 24)}<div><b>${kac(t('araclar.bos'))}</b><small>${kac(t('araclar.bosAlt'))}</small></div></div>`}
      </section>
      <section class="arac-grubu">
        <h2 class="grup-baslik">${kac(t('araclar.grupHazir'))}<span class="sayac-rozet">${hazir.length}</span></h2>
        <div class="arac-izgara">${hazir.map(kart).join('')}</div>
      </section>`;
    if (giris) siraliGiris(kap, '.arac-kart', 30);
  }

  function sekmeSec(ad) {
    sekme = ad;
    $$('.sekme', kok).forEach((b) => {
      b.classList.toggle('secili', b.dataset.sekme === ad);
      b.setAttribute('aria-selected', String(b.dataset.sekme === ad));
    });
    $$('.sekme-icerik', kok).forEach((i) => (i.hidden = i.dataset.icerik !== ad));
    $('.arac-arama', kok).hidden = ad !== 'araclar';
    if (ad === 'katalog') {
      if (!katalog) {
        katalog = katalogPaneli({ kullan: (k) => plandaKullanArac(katalogdanPlanAraci(k)) });
        $('[data-icerik="katalog"]', kok).appendChild(katalog.kok);
      }
      katalog.odakla();
    } else ciz();
  }

  async function kaydetVeCiz(metin) {
    try {
      await kutuphaneKaydet();
      bildirim(metin, { tur: 'basari' });
    } catch (e) {
      hataKutusu({ baslik: t('araclar.baslik'), metin: e.message });
    }
    ciz();
  }

  async function yeni(kaynak = null) {
    const taslak = kaynak ? { ...kaynak, id: null, hazir: false, ad: t('araclar.kopyaAd', { ad: kaynak.ad }) } : null;
    const a = await aracDuzenle({ arac: taslak });
    if (!a) return;
    const kayit = { ...a, id: yeniId('a') };
    durum.kutuphane.araclar.push(kayit);
    kaydetVeCiz(t('araclar.kaydedildi', { ad: kayit.ad }));
  }

  async function duzenle(id) {
    const liste = durum.kutuphane.araclar;
    const i = liste.findIndex((a) => a.id === id);
    if (i < 0) return;
    const a = await aracDuzenle({ arac: liste[i] });
    if (!a) return;
    liste[i] = { ...a, id };
    kaydetVeCiz(t('araclar.kaydedildi', { ad: a.ad }));
  }

  async function sil(id) {
    const a = durum.kutuphane.araclar.find((x) => x.id === id);
    if (!a) return;
    const evet = await onayIste({ baslik: t('araclar.silBaslik'), metin: t('araclar.silMetin', { ad: a.ad }), tamam: t('genel.sil'), tehlike: true, simgeAdi: 'sil' });
    if (!evet) return;
    durum.kutuphane.araclar = durum.kutuphane.araclar.filter((x) => x.id !== id);
    kaydetVeCiz(t('araclar.silindi', { ad: a.ad }));
  }

  function plandaKullanArac(arac) {
    if (!durum.plan) planiAc(yeniPlanNesnesi());
    durum.plan.arac = arac;
    planDegisti('arac');
    bildirim(t('araclar.plandaKullanildi', { ad: arac.ad }), { tur: 'basari' });
    git('plan');
  }

  kok.addEventListener('click', (e) => {
    const url = e.target.closest('[data-url]')?.dataset.url;
    if (url && !e.target.closest('.katalog')) {
      baglantiAc(url);
      return;
    }
    const sekmeDugme = e.target.closest('[data-sekme]');
    if (sekmeDugme) {
      sekmeSec(sekmeDugme.dataset.sekme);
      return;
    }
    const eylem = e.target.closest('[data-eylem]')?.dataset.eylem;
    if (!eylem || e.target.closest('.katalog')) return;
    if (eylem === 'yeni') return yeni();
    const id = e.target.closest('.arac-kart')?.dataset.id;
    if (!id) return;
    const a = tumAraclar().find((x) => x.id === id);
    if (eylem === 'kopyala') yeni(a);
    else if (eylem === 'duzenle') duzenle(id);
    else if (eylem === 'sil') sil(id);
    else if (eylem === 'planda' && a) plandaKullanArac(plandaArac(a));
  });
  $('.sekmeler', kok).addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    sekmeSec(sekme === 'araclar' ? 'katalog' : 'araclar');
    $(`.sekme[data-sekme="${sekme}"]`, kok).focus();
  });
  arama.addEventListener('input', () => ciz());
  dinle('kutuphane', () => {
    if (!kok.hidden && sekme === 'araclar') ciz();
  });

  return {
    kok,
    goster() {
      $('.katalog-sayisi', kok).textContent = new Intl.NumberFormat(yerel()).format(katalogKayitlari().length);
      if (sekme === 'araclar') ciz({ giris: true });
    },
    /** Geliştirme ve ekran görüntüsü için */
    sekmeSec,
  };
}
