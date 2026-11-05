// Excel/CSV'den yük alma: dosya seçimi, sütun eşleme, birim, önizleme ve yük listesine ekleme.
// Excel dosyaları yerel SheetJS (vendor/xlsx.full.min.js) ile okunur; CSV doğrudan çözülür.
import { t, tListeHepsi } from './dil.js';
import { kac, olcu, sayi, sayiOku, imperialMi, mmdenOlcu, kgdanAgirlik, olcuBirimi, agirlikBirimi } from './bicim.js';
import { simge } from './simgeler.js';
import { $, $$, diyalog, ogeUret, bildirim, hataKutusu } from './arayuz.js';
import { istek } from './kopru.js';
import { RENKLER, sablonUrunleri } from './veri.js';
import { kuralEtiketleri } from './bilesenler.js';

const OLCU_UST_MM = 65000;

/**
 * Hedef alanlar ve başlıklarda aranacak eş anlamlılar (sadeleşmiş: küçük harf, aksansız). Türkçe ve İngilizce
 * eş anlamlılar burada; etkin dilin şablon başlığı (excel.sablon.baslik.*) da eşleme sırasında eklenir.
 */
const ALANLAR = [
  { ad: 'ad', zorunlu: true, es: ['ad', 'adi', 'urun', 'urun adi', 'malzeme', 'malzeme adi', 'aciklama', 'tanim', 'isim', 'parca', 'name', 'item', 'description', 'product'] },
  { ad: 'referans', es: ['referans', 'ref', 'kod', 'urun kodu', 'stok kodu', 'malzeme kodu', 'sku', 'code', 'parca no', 'reference', 'part no'] },
  { ad: 'uzunluk', zorunlu: true, es: ['uzunluk', 'boy', 'derinlik', 'length', 'l', 'depth'] },
  { ad: 'en', zorunlu: true, es: ['en', 'genislik', 'width', 'w'] },
  { ad: 'yukseklik', zorunlu: true, es: ['yukseklik', 'height', 'h'] },
  { ad: 'agirlik', es: ['agirlik', 'kg', 'kilo', 'brut agirlik', 'net agirlik', 'birim agirlik', 'weight', 'gross weight', 'unit weight', 'lb'] },
  { ad: 'adet', es: ['adet', 'miktar', 'adedi', 'sayi', 'qty', 'quantity', 'pieces', 'pcs'] },
  { ad: 'ustuneKonamaz', kural: true, es: ['ustune konamaz', 'istiflenemez', 'istif yok', 'ust uste konmaz', 'no stack', 'do not stack', 'non stackable'] },
  { ad: 'yalnizZemin', kural: true, es: ['yalniz zemin', 'sadece zemin', 'zemin', 'floor only', 'bottom only'] },
  { ad: 'donus', kural: true, es: ['yon', 'yonu', 'donus', 'orientation', 'rotation'] },
  { ad: 'ustYukSiniri', kural: true, es: ['ust yuk siniri', 'ust yuk', 'max ust yuk', 'istif yuku', 'max load on top', 'top load limit', 'stack load'] },
  { ad: 'teslimatSirasi', kural: true, es: ['teslimat sirasi', 'teslimat', 'durak', 'stop', 'delivery stop', 'delivery order'] },
];

/** Ölçü birimi çarpanı (mm'ye) ve ağırlık birimi çarpanı (kg'a) */
const CARPAN = { mm: 1, cm: 10, m: 1000, in: 25.4 };
const AGIRLIK_CARPAN = { kg: 1, lb: 0.45359237 };

/** Başlık metnini karşılaştırmaya hazırlar: küçük harf, aksansız, harf ve rakam dışı boşluk, birim parantezi ayrı. */
function sadelestir(metin) {
  return String(metin ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (h) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }[h]))
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}()]+/gu, ' ')
    .trim();
}

/** Alanın eş anlamlıları + etkin dildeki şablon başlığı (birim parantezi atılmış) */
function esAnlamlilar(alan) {
  const sablon = sadelestir(t('excel.sablon.baslik.' + alan.ad, { birim: '', agirlik: '' })).replace(/\(.*?\)/g, '').trim();
  return sablon && !alan.es.includes(sablon) ? alan.es.concat(sablon) : alan.es;
}

function basliktanBirim(baslik) {
  const m = /\((mm|cm|m|in)\)/.exec(sadelestir(baslik));
  return m ? m[1] : null;
}

function basliktanAgirlikBirimi(baslik) {
  const m = /\((kg|lb|lbs)\)/.exec(sadelestir(baslik));
  return m ? (m[1] === 'kg' ? 'kg' : 'lb') : null;
}

// ---------------------------------------------------------------------------
// Dosya okuma
// ---------------------------------------------------------------------------

let xlsxSozu = null;

function xlsxYukle() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxSozu) {
    xlsxSozu = new Promise((coz, reddet) => {
      const s = document.createElement('script');
      s.src = 'vendor/xlsx.full.min.js';
      s.onload = () => (window.XLSX ? coz(window.XLSX) : reddet(new Error(t('excel.kutuphaneYok'))));
      s.onerror = () => {
        xlsxSozu = null;
        reddet(new Error(t('excel.kutuphaneYok')));
      };
      document.head.appendChild(s);
    });
  }
  return xlsxSozu;
}

function base64tenBaytlar(b64) {
  const ikili = atob(b64);
  const b = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i += 1) b[i] = ikili.charCodeAt(i);
  return b;
}

/** CSV: UTF-8 değilse Türkçe Windows kodlaması (1254); ayraç ilk satırdan (; , sekme) seçilir. */
function csvOku(baytlar) {
  let metin;
  try {
    metin = new TextDecoder('utf-8', { fatal: true }).decode(baytlar);
  } catch {
    metin = new TextDecoder('windows-1254').decode(baytlar);
  }
  metin = metin.replace(/^﻿/, '');
  const ilkSatir = metin.split(/\r?\n/, 1)[0] || '';
  const say = (c) => ilkSatir.split(c).length - 1;
  const ayrac = [';', ',', '\t'].reduce((a, c) => (say(c) > say(a) ? c : a), ';');

  const satirlar = [];
  let satir = [];
  let alan = '';
  let tirnak = false;
  for (let i = 0; i < metin.length; i += 1) {
    const c = metin[i];
    if (tirnak) {
      if (c === '"' && metin[i + 1] === '"') { alan += '"'; i += 1; }
      else if (c === '"') tirnak = false;
      else alan += c;
    } else if (c === '"') tirnak = true;
    else if (c === ayrac) { satir.push(alan); alan = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && metin[i + 1] === '\n') i += 1;
      satir.push(alan);
      satirlar.push(satir);
      satir = [];
      alan = '';
    } else alan += c;
  }
  if (alan !== '' || satir.length) {
    satir.push(alan);
    satirlar.push(satir);
  }
  return satirlar;
}

/** Döner: [{ ad, satirlar: [[hücre, ...], ...] }] */
async function tabloOku(dosyaAdi, base64) {
  const uzanti = String(dosyaAdi).toLowerCase().split('.').pop();
  if (uzanti === 'csv' || uzanti === 'txt') return [{ ad: 'CSV', satirlar: csvOku(base64tenBaytlar(base64)) }];
  const X = await xlsxYukle();
  const kitap = X.read(base64, { type: 'base64' });
  return kitap.SheetNames.map((ad) => ({
    ad,
    satirlar: X.utils.sheet_to_json(kitap.Sheets[ad], { header: 1, raw: true, defval: '', blankrows: false }),
  }));
}

// ---------------------------------------------------------------------------
// Eşleme ve satır çevirme
// ---------------------------------------------------------------------------

/** İlk dolu satır başlıktır. Döner: { basliklar, veri } */
function basliklariAyir(satirlar) {
  const dolu = (r) => Array.isArray(r) && r.some((h) => String(h ?? '').trim() !== '');
  const i = satirlar.findIndex(dolu);
  if (i < 0) return { basliklar: [], veri: [] };
  const basliklar = satirlar[i].map((h, j) => String(h ?? '').trim() || `${j + 1}`);
  const veri = satirlar.slice(i + 1).map((r, k) => ({ no: i + k + 2, hucreler: r })).filter((r) => dolu(r.hucreler));
  return { basliklar, veri };
}

function eslemeTahmini(basliklar) {
  const temiz = basliklar.map((b) => sadelestir(b).replace(/\(.*?\)/g, '').trim());
  const esleme = {};
  const kullanilan = new Set();
  // Önce tam eşleşme, sonra başlangıç eşleşmesi; uzun eş anlamlılar önce
  for (const tam of [true, false]) {
    for (const alan of ALANLAR) {
      if (esleme[alan.ad] != null) continue;
      const adaylar = [...esAnlamlilar(alan)].sort((a, b) => b.length - a.length);
      const i = temiz.findIndex((b, j) => !kullanilan.has(j) && adaylar.some((e) => (tam ? b === e : b.startsWith(e + ' '))));
      if (i >= 0) {
        esleme[alan.ad] = i;
        kullanilan.add(i);
      }
    }
  }
  return esleme;
}

function birimTahmini(basliklar, esleme, veri) {
  for (const ad of ['uzunluk', 'en', 'yukseklik']) {
    if (esleme[ad] != null) {
      const b = basliktanBirim(basliklar[esleme[ad]]);
      if (b) return b;
    }
  }
  const degerler = [];
  for (const r of veri.slice(0, 50)) {
    for (const ad of ['uzunluk', 'en', 'yukseklik']) {
      if (esleme[ad] == null) continue;
      const v = sayiOku(r.hucreler[esleme[ad]]);
      if (Number.isFinite(v) && v > 0) degerler.push(v);
    }
  }
  const kisa = imperialMi() ? 'in' : 'cm';
  if (!degerler.length) return kisa;
  degerler.sort((a, b) => a - b);
  const orta = degerler[Math.floor(degerler.length / 2)];
  if (orta > 600) return 'mm';
  if (orta < 15) return 'm';
  return kisa;
}

/** Evet/hayır hücresi: etkin dilin, İngilizcenin ve Türkçenin kelimeleri birlikte tanınır */
function evetMi(deger) {
  if (typeof deger === 'boolean') return deger;
  const s = String(deger ?? '').trim().toLocaleLowerCase('tr-TR');
  if (!s) return false;
  if (tListeHepsi('excel.evet').map((x) => x.toLocaleLowerCase('tr-TR')).includes(s)) return true;
  if (tListeHepsi('excel.hayir').map((x) => x.toLocaleLowerCase('tr-TR')).includes(s)) return false;
  return null;
}

function yonOku(deger) {
  const s = String(deger ?? '').trim().toLocaleLowerCase('tr-TR');
  if (!s) return 'serbest';
  return ['serbest', 'dik', 'sabit'].find((y) => tListeHepsi('excel.yon.' + y).map((x) => x.toLocaleLowerCase('tr-TR')).includes(s)) || null;
}

/** Bir satırı kaleme çevirir. Döner: { kalem, hatalar: [] } */
function satirCevir(r, esleme, birim, agirlikBirimiAdi = 'kg') {
  const h = (ad) => (esleme[ad] == null ? '' : r.hucreler[esleme[ad]]);
  const hatalar = [];
  const ad = String(h('ad') ?? '').trim();
  if (!ad) hatalar.push(t('excel.hatalar.ad'));

  const olc = {};
  let olcuHatasi = false;
  for (const a of ['uzunluk', 'en', 'yukseklik']) {
    const v = sayiOku(h(a));
    if (!Number.isFinite(v) || v <= 0) olcuHatasi = true;
    else olc[a] = Math.round(v * CARPAN[birim]);
  }
  if (olcuHatasi) hatalar.push(t('excel.hatalar.olcu'));
  else if (Object.values(olc).some((v) => v > OLCU_UST_MM)) hatalar.push(t('excel.hatalar.olcuBuyuk'));

  let agirlik = 0;
  if (String(h('agirlik') ?? '').trim() !== '') {
    agirlik = sayiOku(h('agirlik')) * AGIRLIK_CARPAN[agirlikBirimiAdi];
    if (!Number.isFinite(agirlik) || agirlik < 0) hatalar.push(t('excel.hatalar.agirlik'));
  }
  let adet = 1;
  if (String(h('adet') ?? '').trim() !== '') {
    adet = sayiOku(h('adet'));
    if (!Number.isFinite(adet) || adet < 1 || Math.round(adet) !== adet) hatalar.push(t('excel.hatalar.adet'));
  }
  let ustYukSiniri = null;
  if (String(h('ustYukSiniri') ?? '').trim() !== '') {
    ustYukSiniri = sayiOku(h('ustYukSiniri')) * AGIRLIK_CARPAN[agirlikBirimiAdi];
    if (!Number.isFinite(ustYukSiniri) || ustYukSiniri < 0) hatalar.push(t('excel.hatalar.ustYuk'));
  }
  let teslimatSirasi = 0;
  if (String(h('teslimatSirasi') ?? '').trim() !== '') {
    teslimatSirasi = sayiOku(h('teslimatSirasi'));
    if (!Number.isFinite(teslimatSirasi) || teslimatSirasi < 0) hatalar.push(t('excel.hatalar.teslimat'));
  }
  const ustuneKonamaz = evetMi(h('ustuneKonamaz')) === true;
  const yalnizZemin = evetMi(h('yalnizZemin')) === true;
  const donus = yonOku(h('donus')) || 'serbest';

  return {
    hatalar,
    kalem: {
      ad,
      referans: String(h('referans') ?? '').trim(),
      ...olc,
      agirlik: Number.isFinite(agirlik) ? Math.round(agirlik * 10) / 10 : 0,
      adet: Number.isFinite(adet) ? Math.round(adet) : 1,
      donus,
      ustuneKonabilir: !ustuneKonamaz,
      yalnizZemin,
      ustYukSiniri: ustuneKonamaz ? null : ustYukSiniri,
      teslimatSirasi: Number.isFinite(teslimatSirasi) ? Math.round(teslimatSirasi) : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Pencereler
// ---------------------------------------------------------------------------

/**
 * "Excel'den al": açıklama, şablon indirme ve dosya seçimi; dosya seçilince eşleme penceresi açılır.
 * ekle(kalemler) seçilen satırlarla çağrılır.
 */
export function excelAl({ ekle, renkBasi = 0 }) {
  const icerik = ogeUret(`
    <div class="excel-giris">
      <p class="diyalog-metin">${kac(t('excel.aciklama'))}</p>
      <div class="excel-sablon">
        <span class="excel-sablon-simge">${simge('dosya', 20)}</span>
        <span>${kac(t('excel.sablonAciklama'))}</span>
        <button type="button" class="dugme dugme--ikincil dugme--kucuk" data-eylem="sablon">${simge('kaydet', 15)}${kac(t('excel.sablonIndir'))}</button>
      </div>
      <p class="excel-durum soluk" aria-live="polite"></p>
    </div>`);
  $('[data-eylem="sablon"]', icerik).addEventListener('click', () => sablonIndir());

  const d = diyalog({
    baslik: t('excel.baslik'),
    icerik,
    simgeAdi: 'tablo',
    genislik: 540,
    dugmeler: [
      { metin: t('genel.vazgec'), tur: 'ikincil', deger: false },
      { metin: t('excel.dosyaSec'), tur: 'birincil', deger: 'sec', kapatmaz: true },
    ],
    once: async (deger) => {
      if (deger !== 'sec') return true;
      let dosya;
      try {
        dosya = await istek('dosyaSec', { filtre: 'tablo' });
      } catch (e) {
        hataKutusu({ baslik: t('excel.baslik'), metin: e.message });
        return false;
      }
      if (!dosya) return false;
      $('.excel-durum', icerik).textContent = t('excel.okunuyor');
      const tamam = await eslemeAc({ ad: dosya.ad, base64: dosya.base64, ekle, renkBasi });
      $('.excel-durum', icerik).textContent = '';
      if (tamam !== false) d.kapat(true);
      return false;
    },
  });
  return d.sonuc;
}

/** Eşleme penceresi. Dosya okunamazsa hata kutusu gösterip false döner. */
export async function eslemeAc({ ad, base64, ekle, renkBasi = 0 }) {
  let sayfalar;
  try {
    sayfalar = (await tabloOku(ad, base64)).filter((s) => s.satirlar.length);
  } catch (e) {
    await hataKutusu({ baslik: t('excel.baslik'), metin: t('excel.okunamadi'), ayrinti: String(e && e.message ? e.message : e) });
    return false;
  }
  if (!sayfalar.length) {
    await hataKutusu({ baslik: t('excel.baslik'), metin: t('excel.bos') });
    return false;
  }

  let sayfa = 0;
  let { basliklar, veri } = basliklariAyir(sayfalar[0].satirlar);
  let esleme = eslemeTahmini(basliklar);
  let birim = birimTahmini(basliklar, esleme, veri);
  let agirlikBir = (esleme.agirlik != null && basliktanAgirlikBirimi(basliklar[esleme.agirlik])) || (imperialMi() ? 'lb' : 'kg');
  let sonuclar = [];

  const kok = ogeUret(`
    <div class="excel-esleme">
      <div class="excel-ust">
        <div class="excel-dosya">${simge('dosya', 18)}<span><small>${kac(t('excel.dosya'))}</small><b>${kac(ad)}</b></span></div>
        <label class="alan excel-sayfa" ${sayfalar.length < 2 ? 'hidden' : ''}>
          <span class="alan-etiket">${kac(t('excel.sayfa'))}</span>
          <select class="secim">${sayfalar.map((s, i) => `<option value="${i}">${kac(s.ad)}</option>`).join('')}</select>
        </label>
        <div class="alan excel-birim">
          <span class="alan-etiket">${kac(t('excel.birim'))}</span>
          <div class="bolumlu" role="radiogroup" aria-label="${kac(t('excel.birim'))}">
            ${Object.keys(CARPAN).map((b) => `
              <label class="bolumlu-secenek"><input type="radio" name="birim" value="${b}"><span>${kac(t('birim.' + b))}</span></label>`).join('')}
          </div>
        </div>
        <div class="alan excel-birim">
          <span class="alan-etiket">${kac(t('excel.agirlikBirimi'))}</span>
          <div class="bolumlu" role="radiogroup" aria-label="${kac(t('excel.agirlikBirimi'))}">
            ${Object.keys(AGIRLIK_CARPAN).map((b) => `
              <label class="bolumlu-secenek"><input type="radio" name="agirlikBirimi" value="${b}"><span>${kac(t('birim.' + b))}</span></label>`).join('')}
          </div>
        </div>
      </div>
      <p class="alan-aciklama excel-birim-not">${simge('bilgi', 13)}${kac(t('excel.birimTahmin'))}</p>
      <div class="excel-alanlar"></div>
      <div class="excel-onizleme">
        <div class="excel-onizleme-ust"><h3>${kac(t('excel.onizleme'))}</h3><span class="excel-ozet"></span></div>
        <div class="tablo-kap"><table class="tablo excel-tablo"><thead></thead><tbody></tbody></table></div>
      </div>
    </div>`);

  const alanlarKap = $('.excel-alanlar', kok);

  function alanlariCiz() {
    const secenekler = (secili) => `<option value="">${kac(t('excel.yok'))}</option>` +
      basliklar.map((b, i) => `<option value="${i}" ${secili === i ? 'selected' : ''}>${kac(b)}</option>`).join('');
    const grup = (kural) => ALANLAR.filter((a) => !!a.kural === kural).map((a) => `
      <label class="alan alan--secim${a.zorunlu && esleme[a.ad] == null ? ' alan--hata' : ''}">
        <span class="alan-etiket">${kac(t('excel.alanlar.' + a.ad))}${a.zorunlu ? ` <em>${kac(t('excel.zorunlu'))}</em>` : ''}</span>
        <select class="secim" data-alan="${a.ad}">${secenekler(esleme[a.ad])}</select>
      </label>`).join('');
    alanlarKap.innerHTML = `
      <h3>${kac(t('excel.alanlarBaslik'))}</h3>
      <div class="excel-izgara">${grup(false)}</div>
      <h3>${kac(t('excel.kurallarBaslik'))}</h3>
      <div class="excel-izgara excel-izgara--5">${grup(true)}</div>`;
  }

  function onizlemeCiz() {
    const eksik = ALANLAR.filter((a) => a.zorunlu && esleme[a.ad] == null);
    $$('.alan--secim', alanlarKap).forEach((l) => {
      const a = l.querySelector('select').dataset.alan;
      l.classList.toggle('alan--hata', !!ALANLAR.find((x) => x.ad === a).zorunlu && esleme[a] == null);
    });
    sonuclar = eksik.length ? [] : veri.map((r) => ({ no: r.no, ...satirCevir(r, esleme, birim, agirlikBir) }));
    const gecerli = sonuclar.filter((s) => !s.hatalar.length);
    const hatali = sonuclar.length - gecerli.length;
    const ozet = $('.excel-ozet', kok);
    if (eksik.length) {
      ozet.innerHTML = `<span class="hata-yazi">${kac(t('excel.hatalar.eslesmedi', { alanlar: eksik.map((a) => t('excel.alanlar.' + a.ad)).join(', ') }))}</span>`;
    } else {
      ozet.innerHTML = hatali
        ? kac([t('excel.ozet', { n: gecerli.length }), t('excel.ozetHatali', { n: hatali })].join(' · '))
        : kac(t('excel.ozet', { n: gecerli.length }));
    }
    $('thead', kok).innerHTML = `<tr>
      <th class="sag">${kac(t('excel.onizlemeSutun.satir'))}</th>
      <th>${kac(t('excel.onizlemeSutun.ad'))}</th>
      <th class="sag">${kac(t('excel.onizlemeSutun.olcu', { birim: olcuBirimi() }))}</th>
      <th class="sag">${kac(t('excel.onizlemeSutun.agirlik', { birim: agirlikBirimi() }))}</th>
      <th class="sag">${kac(t('excel.onizlemeSutun.adet'))}</th>
      <th>${kac(t('excel.onizlemeSutun.kurallar'))}</th>
      <th>${kac(t('excel.onizlemeSutun.durum'))}</th></tr>`;
    const gosterilen = eksik.length ? veri.slice(0, 10).map((r) => ({ no: r.no, hatalar: [], kalem: null, ham: r })) : sonuclar.slice(0, 10);
    $('tbody', kok).innerHTML = gosterilen.map((s) => {
      if (!s.kalem) {
        return `<tr><td class="sag rakam">${s.no}</td><td colspan="6" class="soluk">${kac(s.ham.hucreler.join(' · '))}</td></tr>`;
      }
      const k = s.kalem;
      const hata = s.hatalar.length > 0;
      const olcuMetni = k.uzunluk && k.en && k.yukseklik ? olcu(k.uzunluk, k.en, k.yukseklik) : '—';
      return `
        <tr class="${hata ? 'satir-hatali' : ''}">
          <td class="sag rakam">${s.no}</td>
          <td>${kac(k.ad || '—')}${k.referans ? ` <span class="soluk">· ${kac(k.referans)}</span>` : ''}</td>
          <td class="sag rakam">${olcuMetni}</td>
          <td class="sag rakam">${kac(sayi(Math.round(kgdanAgirlik(k.agirlik))))}</td>
          <td class="sag rakam">${sayi(k.adet)}</td>
          <td><div class="etiketler">${hata ? '' : kuralEtiketleri(k, { yon: k.donus !== 'serbest' })}</div></td>
          <td>${hata ? `<span class="durum-hata">${simge('hata', 13)}${kac(s.hatalar.join(' · '))}</span>` : `<span class="durum-tamam">${simge('onay', 13)}${kac(t('excel.tamam'))}</span>`}</td>
        </tr>`;
    }).join('');
    const dugme = d.kok.querySelector('.dugme--birincil');
    if (dugme) {
      dugme.disabled = !gecerli.length;
      dugme.textContent = t('excel.ekle', { n: gecerli.length });
    }
  }

  function birimCiz() {
    $$('[name="birim"]', kok).forEach((r) => (r.checked = r.value === birim));
    $$('[name="agirlikBirimi"]', kok).forEach((r) => (r.checked = r.value === agirlikBir));
  }

  kok.addEventListener('change', (e) => {
    const el = e.target;
    if (el.name === 'birim') birim = el.value;
    else if (el.name === 'agirlikBirimi') agirlikBir = el.value;
    else if (el.dataset.alan) {
      const yeni = el.value === '' ? null : Number(el.value);
      // Aynı sütun iki alana bağlanmasın
      if (yeni != null) for (const a of Object.keys(esleme)) if (esleme[a] === yeni && a !== el.dataset.alan) esleme[a] = null;
      esleme[el.dataset.alan] = yeni;
      alanlariCiz();
    } else if (el.closest('.excel-sayfa')) {
      sayfa = Number(el.value);
      ({ basliklar, veri } = basliklariAyir(sayfalar[sayfa].satirlar));
      esleme = eslemeTahmini(basliklar);
      birim = birimTahmini(basliklar, esleme, veri);
      birimCiz();
      alanlariCiz();
    }
    onizlemeCiz();
  });

  const d = diyalog({
    baslik: t('excel.eslemeBaslik'),
    icerik: kok,
    simgeAdi: 'tablo',
    genislik: 980,
    sinif: 'diyalog--genis',
    dugmeler: [
      { metin: t('genel.vazgec'), tur: 'ikincil', deger: false },
      { metin: t('excel.ekle', { n: 0 }), tur: 'birincil', deger: true },
    ],
    once: (deger) => {
      if (!deger) return true;
      const kalemler = sonuclar.filter((s) => !s.hatalar.length).map((s, i) => ({
        ...s.kalem,
        renk: RENKLER[(renkBasi + i) % RENKLER.length],
      }));
      if (!kalemler.length) return false;
      ekle(kalemler);
      bildirim(t('excel.eklendi', { n: kalemler.length }), { tur: 'basari' });
      return true;
    },
  });
  birimCiz();
  alanlariCiz();
  onizlemeCiz();
  return d.sonuc;
}

/** Örnek başlıklı ve örnek satırlı .xlsx şablonu üretir ve kaydettirir. */
export async function sablonIndir() {
  try {
    const X = await xlsxYukle();
    const evet = t('excel.sablon.evet');
    const hayir = t('excel.sablon.hayir');
    const yuvarla = (v) => Math.round(v * 10) / 10;
    const basliklar = ALANLAR.map((a) => t('excel.sablon.baslik.' + a.ad, { birim: olcuBirimi(), agirlik: agirlikBirimi() }));
    const satirlar = [basliklar].concat(sablonUrunleri().map((u) => [
      u.ad, u.referans || '', yuvarla(mmdenOlcu(u.uzunluk)), yuvarla(mmdenOlcu(u.en)), yuvarla(mmdenOlcu(u.yukseklik)),
      Math.round(kgdanAgirlik(u.agirlik)), u.adet,
      u.ustuneKonabilir === false ? evet : hayir, u.yalnizZemin ? evet : hayir, t('plan.yonler.' + u.donus), '', 0,
    ]));
    const sayfa = X.utils.aoa_to_sheet(satirlar);
    sayfa['!cols'] = satirlar[0].map((b, i) => ({ wch: i === 0 ? 24 : Math.max(10, String(b).length + 2) }));
    const kitap = X.utils.book_new();
    X.utils.book_append_sheet(kitap, sayfa, t('excel.sablon.sayfa'));
    const base64 = X.write(kitap, { bookType: 'xlsx', type: 'base64' });
    const cevap = await istek('dosyaKaydet', { onerilenAd: t('excel.sablonAdi'), base64, filtre: 'xlsx' });
    if (cevap) bildirim(t('excel.sablonKaydedildi'), { tur: 'basari' });
  } catch (e) {
    hataKutusu({ baslik: t('excel.sablonIndir'), metin: e.message });
  }
}

/** Geliştirme ve deneme: şablonla aynı başlıkta, bir hatalı satır içeren örnek çalışma kitabı (base64). */
export async function ornekKitap() {
  const X = await xlsxYukle();
  const satirlar = [
    ['Malzeme adı', 'Stok kodu', 'Boy (cm)', 'Genişlik (cm)', 'Yükseklik (cm)', 'Brüt ağırlık', 'Miktar', 'Üstüne konamaz', 'Yön'],
    ['Gübre makinesi', 'GM-150', 275, 150, 140, 600, 1, 'hayır', 'dik'],
    ['İlaçlama makinesi', 'IM-345', 345, 160, 145, 655, 3, 'evet', 'dik'],
    ['Çapa makinesi', 'CM-220', 220, 110, 130, 354, 2, '', 'dik'],
    ['Diskaro', 'DK-200', 200, 200, 66, 680, 3, '', ''],
    ['Yedek parça kolisi', 'YP-60', 60, 40, 40, '18,5', 12, '', 'serbest'],
    ['Ölçüsü eksik kasa', 'KS-01', '', 120, 100, 210, 2, '', ''],
  ];
  const kitap = X.utils.book_new();
  X.utils.book_append_sheet(kitap, X.utils.aoa_to_sheet(satirlar), 'Sevkiyat');
  return X.write(kitap, { bookType: 'xlsx', type: 'base64' });
}
