// Plan ekranının araç kartı: araç seçici (hazır tipler, araçlarım, gelişmiş katalog), ölçü alanları,
// kaynak ve "tipik" bilgisi, isteğe bağlı aks bilgisi, çoklu araç ve dengeleme seçenekleri, karışık filo düzenleyici.
import { t } from '../dil.js';
import {
  kac, kg, m3, aracOlcusu, olcuBirimi, agirlikBirimi, mmdenOlcu, olcudenMm, kgdanAgirlik, agirliktanKg, cm, sayiOku,
} from '../bicim.js';
import { simge, aracCizimi } from '../simgeler.js';
import { $, $$, bildirim, hataKutusu } from '../arayuz.js';
import { sayiAlani, sayiAlanlariniBagla, anahtar, alanHatasi } from '../bilesenler.js';
import { metinSor } from '../duzenleyiciler.js';
import { durum, planDegisti, tumAraclar, aracOzelMi, kutuphaneKaydet, yeniId, dinle } from '../durum.js';
import { plandaArac, hazirAraclar, davlumbazNotuVar, katalogKaydi, yerelMetin } from '../veri.js';
import { katalogDiyalogu, aracSecDiyalogu, baglantiAc, alanAdi } from '../katalog.js';

const FILO_SINIRI = 8;

/** Araç kartını kurar. kok: boş <section class="kart arac-karti"> */
export function aracKartiKur(kok) {
  kok.innerHTML = `
    <header class="kart-baslik">
      <h2>${simge('araclar', 18)}${kac(t('plan.arac.baslik'))}</h2>
      <span class="rozet rozet--ozel" hidden>${kac(t('plan.arac.ozelOlcu'))}</span>
    </header>
    <div class="arac-secici">
      <button type="button" class="arac-secici-dugme" aria-haspopup="listbox" aria-expanded="false">
        <span class="arac-secici-cizim"></span>
        <span class="arac-secici-metin"><b class="arac-adi"></b><small class="arac-olcu"></small></span>
        ${simge('asagi', 16, 'arac-secici-ok')}
      </button>
      <div class="arac-menu" role="listbox" hidden></div>
    </div>
    <div class="arac-bilgi"></div>
    <div class="arac-alanlari"></div>
    <p class="arac-uyari" hidden>${simge('uyari', 14)}<span>${kac(t('plan.arac.yukYok'))}</span></p>
    <details class="aks-ayrinti">
      <summary>${simge('asagi', 14, 'aks-ok')}<span>${kac(t('aracDuzen.aks'))}</span><small class="aks-ozet soluk"></small></summary>
      <p class="alan-aciklama">${kac(t('plan.arac.aksAciklama'))}</p>
      <div class="aks-alanlari"></div>
    </details>
    <div class="arac-secenekler"></div>
    <div class="filo">
      <div class="filo-baslik">
        <span><b>${kac(t('plan.filo.baslik'))}</b><small>${kac(t('plan.filo.aciklama'))}</small></span>
      </div>
      <ol class="filo-listesi"></ol>
      <button type="button" class="metin-dugme" data-eylem="filoEkle">${simge('ekle', 15)}${kac(t('plan.filo.ekle'))}</button>
      <div class="filo-secim"></div>
    </div>
    <p class="arac-notu">${simge('bilgi', 13)}<span>${kac(t('plan.arac.tipNotu'))}</span></p>
    <div class="arac-alt">
      <button type="button" class="metin-dugme" data-eylem="aracKaydet">${simge('yerImi', 15)}${kac(t('plan.arac.kaydet'))}</button>
    </div>`;

  const el = (s) => $(s, kok);
  const plan = () => durum.plan;
  const aracAlanlari = el('.arac-alanlari');
  const aksAlanlari = el('.aks-alanlari');
  const aracMenu = el('.arac-menu');
  const aracDugme = el('.arac-secici-dugme');
  const filoListesi = el('.filo-listesi');

  // ------------------------------------------------------------------ özet satırı ve bilgi

  function ustCiz() {
    const a = plan().arac;
    el('.arac-secici-cizim').innerHTML = aracCizimi(a.tur, 52);
    el('.arac-adi').textContent = a.ad;
    el('.arac-olcu').textContent = a.uzunluk > 0 ? aracOlcusu(a) : t('plan.arac.olcuGirin');
    el('.rozet--ozel').hidden = !aracOzelMi(a);
    bilgiCiz();
  }

  /** Tipik rozeti, kaynak bağlantısı, kapı ağzı ve panelvanda davlumbaz notu */
  function bilgiCiz() {
    const a = plan().arac;
    const kayit = a.katalogId ? katalogKaydi(a.katalogId) : null;
    const parcalar = [];
    if (a.katalogId) {
      parcalar.push(a.tipik
        ? `<span class="rozet rozet--tipik" title="${kac(t('katalog.tipikAciklama'))}">${kac(t('katalog.tipik'))}</span>`
        : `<span class="rozet rozet--model" title="${kac(t('katalog.modelAciklama'))}">${kac(t('katalog.model'))}</span>`);
    }
    if (a.kaynak) {
      parcalar.push(`<button type="button" class="baglanti-kucuk" data-url="${kac(a.kaynak)}" title="${kac(a.kaynak)}">${simge('disBaglanti', 12)}${kac(t('katalog.kaynak'))}: ${kac(alanAdi(a.kaynak))}</button>`);
    }
    if (a.kapi) {
      parcalar.push(`<span class="arac-kapi" title="${kac(t('plan.arac.kapiAciklama'))}">${simge('kapi', 13)}${kac(t('plan.arac.kapiAgzi', { olcu: `${cm(a.kapi.en)} × ${cm(a.kapi.yukseklik)} ${olcuBirimi()}` }))}</span>`);
    }
    let notlar = '';
    if (davlumbazNotuVar(a)) {
      const not = kayit ? yerelMetin(kayit.not) : '';
      notlar = `<p class="arac-davlumbaz">${simge('bilgi', 13)}<span>${kac(t('katalog.davlumbaz'))}${not ? `<small>${kac(not)}</small>` : ''}</span></p>`;
    }
    const kap = el('.arac-bilgi');
    kap.innerHTML = (parcalar.length ? `<div class="arac-bilgi-satir">${parcalar.join('')}</div>` : '') + notlar;
    kap.hidden = !parcalar.length && !notlar;
  }

  el('.arac-bilgi').addEventListener('click', (e) => {
    const url = e.target.closest('[data-url]')?.dataset.url;
    if (url) baglantiAc(url);
  });

  // ------------------------------------------------------------------ alanlar

  function alanlariCiz() {
    const a = plan().arac;
    const odak = document.activeElement && kok.contains(document.activeElement) ? document.activeElement.name : null;
    if (!odak || !aracAlanlari.contains(document.activeElement)) {
      aracAlanlari.innerHTML = `
        <div class="form-satir form-satir--2">
          ${sayiAlani({ ad: 'uzunluk', etiket: t('plan.arac.uzunluk'), deger: a.uzunluk ? mmdenOlcu(a.uzunluk) : '', birim: olcuBirimi() })}
          ${sayiAlani({ ad: 'en', etiket: t('plan.arac.en'), deger: a.en ? mmdenOlcu(a.en) : '', birim: olcuBirimi(), ipucu: davlumbazNotuVar(a) ? t('katalog.davlumbaz') : '' })}
          ${sayiAlani({ ad: 'yukseklik', etiket: t('plan.arac.yukseklik'), deger: a.yukseklik ? mmdenOlcu(a.yukseklik) : '', birim: olcuBirimi() })}
          ${sayiAlani({ ad: 'maksAgirlik', etiket: t('plan.arac.azamiYuk'), deger: a.yukBilinmiyor && !a.maksAgirlik ? '' : kgdanAgirlik(a.maksAgirlik || 0), birim: agirlikBirimi(), ondalik: 0, ipucu: t('aracDuzen.azamiYukAciklama') })}
          ${sayiAlani({ ad: 'kapiPayi', etiket: t('plan.arac.kapiPayi'), deger: mmdenOlcu(a.kapiPayiMm || 0), birim: olcuBirimi(), ipucu: t('plan.arac.kapiPayiAciklama') })}
          <div class="alan alan--bilgi"><span class="alan-etiket">&nbsp;</span><span class="arac-hacim"></span></div>
        </div>`;
      sayiAlanlariniBagla(aracAlanlari, alanDegisti);
    }
    if (!odak || !aksAlanlari.contains(document.activeElement)) {
      aksAlanlari.innerHTML = `
        <div class="form-satir form-satir--2">
          ${sayiAlani({ ad: 'sasiMesafe', etiket: t('aracDuzen.sasi'), deger: a.aks ? mmdenOlcu(a.aks.sasiMesafe) : '', birim: olcuBirimi() })}
          ${sayiAlani({ ad: 'aksMerkezi', etiket: t('aracDuzen.aksMerkezi'), deger: a.aks ? mmdenOlcu(a.aks.aksMerkezi) : '', birim: olcuBirimi() })}
        </div>`;
      sayiAlanlariniBagla(aksAlanlari, aksDegisti);
    }
    hacimYaz();
  }

  function hacimYaz() {
    const a = plan().arac;
    el('.arac-hacim').textContent = a.uzunluk > 0 ? t('plan.arac.hacim', { v: m3(a.en * a.yukseklik * a.uzunluk) }) : '';
    el('.arac-uyari').hidden = !(a.yukBilinmiyor && !(a.maksAgirlik > 0));
    el('.aks-ozet').textContent = a.aks ? `${cm(a.aks.sasiMesafe)} / ${cm(a.aks.aksMerkezi)} ${olcuBirimi()}` : t('plan.arac.aksYok');
  }

  function alanDegisti(ad, deger, girdi) {
    const a = plan().arac;
    const alan = girdi.closest('.alan');
    const bos = String(girdi.value).trim() === '';
    if (ad === 'maksAgirlik' && bos) {
      // Boş azami yük: sınır uygulanmaz (motora 0 gider)
      alan.classList.remove('alan--hata');
      a.maksAgirlik = 0;
    } else {
      const gecerli = Number.isFinite(deger) && deger >= 0 && (ad === 'maksAgirlik' || ad === 'kapiPayi' || deger > 0);
      alan.classList.toggle('alan--hata', !gecerli);
      if (!gecerli) return;
      if (ad === 'maksAgirlik') {
        a.maksAgirlik = Math.round(agirliktanKg(deger));
        if (a.maksAgirlik > 0) a.yukBilinmiyor = false;
      } else if (ad === 'kapiPayi') a.kapiPayiMm = olcudenMm(deger);
      else a[ad] = olcudenMm(deger);
    }
    planDegisti('aracAlani');
    el('.rozet--ozel').hidden = !aracOzelMi(a);
    el('.arac-olcu').textContent = a.uzunluk > 0 ? aracOlcusu(a) : t('plan.arac.olcuGirin');
    hacimYaz();
  }

  function aksDegisti() {
    const a = plan().arac;
    const sg = $('[name="sasiMesafe"]', aksAlanlari);
    const mg = $('[name="aksMerkezi"]', aksAlanlari);
    const bos = !sg.value.trim() && !mg.value.trim();
    let aks = null;
    let hata = '';
    if (!bos) {
      const sv = sayiOku(sg.value);
      const mv = sayiOku(mg.value);
      const s = Number.isFinite(sv) ? olcudenMm(sv) : NaN;
      const m = Number.isFinite(mv) ? olcudenMm(mv) : NaN;
      if (Number.isFinite(s) && Number.isFinite(m) && s >= 0 && m > s && m <= a.uzunluk + 5000) aks = { sasiMesafe: s, aksMerkezi: m };
      else hata = t('aracDuzen.hataAks');
    }
    alanHatasi(aksAlanlari, 'aksMerkezi', hata);
    if (hata) return;
    if (JSON.stringify(a.aks) === JSON.stringify(aks)) return;
    a.aks = aks;
    planDegisti('aracAlani');
    hacimYaz();
  }

  // ------------------------------------------------------------------ seçenekler

  function seceneklerCiz() {
    const p = plan();
    el('.arac-secenekler').innerHTML =
      anahtar({ ad: 'cokluArac', etiket: t('plan.arac.cokluArac'), acik: p.cokluArac }) +
      anahtar({ ad: 'dengele', etiket: t('plan.arac.dengele'), aciklama: t('plan.arac.dengeleAciklama'), acik: p.dengele });
  }
  el('.arac-secenekler').addEventListener('change', (e) => {
    const p = plan();
    if (e.target.name === 'cokluArac') p.cokluArac = e.target.checked;
    else if (e.target.name === 'dengele') p.dengele = e.target.checked;
    else return;
    planDegisti('secenek');
  });

  // ------------------------------------------------------------------ filo

  function filoCiz() {
    const p = plan();
    const satir = (a, i) => `
      <li class="filo-oge" data-i="${i}" draggable="true" tabindex="0" aria-label="${kac(t('plan.filo.sira', { n: i + 2, ad: a.ad }))}">
        <span class="filo-tutamak" title="${kac(t('plan.filo.surukle'))}">${simge('tutamak', 16)}</span>
        <span class="filo-no">${i + 2}</span>
        <span class="filo-cizim">${aracCizimi(a.tur, 36)}</span>
        <span class="filo-metin"><b>${kac(a.ad)}</b><small>${kac(aracOlcusu(a))}${a.maksAgirlik ? ` · ${kac(kg(a.maksAgirlik))}` : ''}</small></span>
        <span class="filo-eylemler">
          <button type="button" class="simge-dugme" data-filo="yukari" title="${kac(t('plan.filo.yukari'))}" aria-label="${kac(t('plan.filo.yukari'))}" ${i === 0 ? 'disabled' : ''}>${simge('yukari', 14)}</button>
          <button type="button" class="simge-dugme" data-filo="asagi" title="${kac(t('plan.filo.asagi'))}" aria-label="${kac(t('plan.filo.asagi'))}" ${i === p.filo.length - 1 ? 'disabled' : ''}>${simge('asagi', 14)}</button>
          <button type="button" class="simge-dugme simge-dugme--tehlike" data-filo="sil" title="${kac(t('genel.sil'))}" aria-label="${kac(t('genel.sil'))}">${simge('kapat', 14)}</button>
        </span>
      </li>`;
    filoListesi.innerHTML = p.filo.length
      ? `<li class="filo-oge filo-oge--ana"><span class="filo-tutamak"></span><span class="filo-no">1</span><span class="filo-cizim">${aracCizimi(p.arac.tur, 36)}</span><span class="filo-metin"><b>${kac(p.arac.ad)}</b><small>${kac(t('plan.filo.ana'))}</small></span></li>` +
        p.filo.map(satir).join('')
      : '';
    filoListesi.hidden = !p.filo.length;
    el('[data-eylem="filoEkle"]').hidden = p.filo.length >= FILO_SINIRI;
    el('.filo-secim').innerHTML = p.filo.length
      ? anahtar({ ad: 'enUygun', etiket: t('plan.filo.enUygun'), aciklama: t('plan.filo.enUygunAciklama'), acik: p.filoSecimi === 'enUygun' })
      : '';
  }

  function filoTasi(i, j) {
    const f = plan().filo;
    if (j < 0 || j >= f.length || i === j) return;
    const [a] = f.splice(i, 1);
    f.splice(j, 0, a);
    planDegisti('arac');
    filoCiz();
    $(`.filo-oge[data-i="${j}"]`, filoListesi)?.focus();
  }

  el('[data-eylem="filoEkle"]').addEventListener('click', async () => {
    const a = await aracSecDiyalogu({ baslik: t('plan.filo.ekle') });
    if (!a) return;
    plan().filo.push(a);
    planDegisti('arac');
    filoCiz();
  });
  el('.filo-secim').addEventListener('change', (e) => {
    if (e.target.name !== 'enUygun') return;
    plan().filoSecimi = e.target.checked ? 'enUygun' : 'sirayla';
    planDegisti('secenek');
  });
  filoListesi.addEventListener('click', (e) => {
    const d = e.target.closest('[data-filo]');
    const li = e.target.closest('.filo-oge');
    if (!d || !li) return;
    const i = Number(li.dataset.i);
    if (d.dataset.filo === 'sil') {
      plan().filo.splice(i, 1);
      planDegisti('arac');
      filoCiz();
    } else filoTasi(i, d.dataset.filo === 'yukari' ? i - 1 : i + 1);
  });
  // Klavye: Alt + ↑/↓ sırayı değiştirir, Delete siler
  filoListesi.addEventListener('keydown', (e) => {
    const li = e.target.closest('.filo-oge');
    if (!li || li !== e.target || li.dataset.i == null) return;
    const i = Number(li.dataset.i);
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      filoTasi(i, e.key === 'ArrowUp' ? i - 1 : i + 1);
    } else if (e.key === 'Delete') {
      plan().filo.splice(i, 1);
      planDegisti('arac');
      filoCiz();
    }
  });
  // Sürükle bırak
  let surukle = null;
  filoListesi.addEventListener('dragstart', (e) => {
    const li = e.target.closest('.filo-oge');
    if (!li || li.dataset.i == null) return;
    surukle = Number(li.dataset.i);
    li.classList.add('surukleniyor');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(surukle));
  });
  filoListesi.addEventListener('dragover', (e) => {
    if (surukle == null) return;
    const li = e.target.closest('.filo-oge');
    if (!li || li.dataset.i == null) return;
    e.preventDefault();
    $$('.filo-oge', filoListesi).forEach((o) => o.classList.toggle('birak-hedef', o === li));
  });
  filoListesi.addEventListener('drop', (e) => {
    const li = e.target.closest('.filo-oge');
    if (surukle == null || !li || li.dataset.i == null) return;
    e.preventDefault();
    const hedef = Number(li.dataset.i);
    const i = surukle;
    surukle = null;
    filoTasi(i, hedef);
  });
  filoListesi.addEventListener('dragend', () => {
    surukle = null;
    $$('.filo-oge', filoListesi).forEach((o) => o.classList.remove('surukleniyor', 'birak-hedef'));
  });

  // ------------------------------------------------------------------ araç menüsü

  function menuCiz() {
    const secili = plan().arac.tipId;
    const satir = (a) => `
      <button type="button" class="arac-menu-oge${a.id === secili ? ' secili' : ''}" role="option" data-id="${kac(a.id)}" aria-selected="${a.id === secili}">
        <span class="arac-menu-cizim">${aracCizimi(a.tur, 44)}</span>
        <span class="arac-menu-metin"><b>${kac(a.ad)}</b><small>${kac(aracOlcusu(a))} · ${a.maksAgirlik ? kac(kg(a.maksAgirlik)) : kac(t('plan.arac.yukBos'))}</small></span>
        ${a.id === secili ? simge('onay', 16, 'arac-menu-onay') : ''}
      </button>`;
    const benim = durum.kutuphane.araclar;
    aracMenu.innerHTML = `
      <div class="arac-menu-grup">${kac(t('plan.arac.hazirTipler'))}</div>
      ${hazirAraclar().map(satir).join('')}
      ${benim.length ? `<div class="arac-menu-grup">${kac(t('plan.arac.araclarim'))}</div>${benim.map(satir).join('')}` : ''}
      <button type="button" class="arac-menu-katalog" data-eylem="katalog">${simge('katalog', 16)}<span>${kac(t('katalog.ac'))}</span>${simge('sag', 14)}</button>
      <p class="arac-menu-not">${simge('bilgi', 13)}${kac(t('plan.arac.tipNotu'))}</p>`;
  }

  function menuAc(ac) {
    aracMenu.hidden = !ac;
    aracDugme.setAttribute('aria-expanded', String(ac));
    el('.arac-secici').classList.toggle('acik', ac);
    if (ac) {
      menuCiz();
      ($('.secili', aracMenu) || $('.arac-menu-oge', aracMenu))?.focus();
    }
  }

  function aracSec(a) {
    plan().arac = a;
    planDegisti('arac');
    hepsiniCiz();
  }

  aracDugme.addEventListener('click', () => menuAc(aracMenu.hidden));
  aracMenu.addEventListener('click', async (e) => {
    if (e.target.closest('[data-eylem="katalog"]')) {
      menuAc(false);
      const a = await katalogDiyalogu();
      if (a) aracSec(a);
      aracDugme.focus();
      return;
    }
    const oge = e.target.closest('.arac-menu-oge');
    if (!oge) return;
    const kaynak = tumAraclar().find((a) => a.id === oge.dataset.id);
    if (kaynak) aracSec(plandaArac(kaynak));
    menuAc(false);
    aracDugme.focus();
  });
  aracMenu.addEventListener('keydown', (e) => {
    const ogeler = $$('.arac-menu-oge, .arac-menu-katalog', aracMenu);
    const i = ogeler.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); ogeler[Math.min(ogeler.length - 1, i + 1)]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); ogeler[Math.max(0, i - 1)]?.focus(); }
    if (e.key === 'Home') { e.preventDefault(); ogeler[0]?.focus(); }
    if (e.key === 'End') { e.preventDefault(); ogeler[ogeler.length - 1]?.focus(); }
    if (e.key === 'Escape') { e.stopPropagation(); menuAc(false); aracDugme.focus(); }
  });
  document.addEventListener('mousedown', (e) => {
    if (!aracMenu.hidden && !el('.arac-secici').contains(e.target)) menuAc(false);
  });

  // ------------------------------------------------------------------ araçlarıma kaydet

  el('[data-eylem="aracKaydet"]').addEventListener('click', async () => {
    const a = plan().arac;
    const ad = await metinSor({
      baslik: t('plan.arac.kaydet'),
      etiket: t('aracDuzen.ad'),
      deger: aracOzelMi(a) ? t('plan.arac.ozelAdi', { ad: a.ad }) : a.ad,
    });
    if (!ad) return;
    const { tipId, ...veri } = a;
    const yeni = { ...veri, id: yeniId('a'), ad, aks: a.aks ? { ...a.aks } : null };
    durum.kutuphane.araclar.push(yeni);
    try {
      await kutuphaneKaydet();
    } catch (e) {
      hataKutusu({ baslik: t('plan.arac.kaydet'), metin: e.message });
      return;
    }
    a.tipId = yeni.id;
    a.ad = ad;
    planDegisti('arac');
    ustCiz();
    bildirim(t('plan.arac.kaydedildi', { ad }), { tur: 'basari' });
  });

  dinle('kutuphane', () => {
    if (!aracMenu.hidden) menuCiz();
  });

  function hepsiniCiz() {
    if (!plan()) return;
    ustCiz();
    alanlariCiz();
    seceneklerCiz();
    filoCiz();
  }

  return { ciz: hepsiniCiz, menuKapat: () => menuAc(false) };
}

