// Uygulama durumu: ayarlar, kütüphane (ürünler, araçlar) ve açık plan. Değişiklikler olayla duyurulur.
// Açık planın girdileri için geri al / yinele geçmişi de burada tutulur.
import { istek, bildir } from './kopru.js';
import { t } from './dil.js';
import { URUN } from './urun.js';
import {
  hazirArac, hazirAraclar, plandaArac, bosArac, varsayilanUrunler, paletUrunleri, VARSAYILAN_ARAC,
  KUTUPHANE_SURUMU, ARAC_TURLERI, KATALOG_KATEGORILERI, katalogKaydi, katalogdanArac,
} from './veri.js';

const parametreler = new URLSearchParams(location.search);

export const durum = {
  kutuphane: { surum: KUTUPHANE_SURUMU, urunler: [], araclar: [] },
  plan: null,
  /** Kabukta (ya da tarayıcıda) kayıtlı ayarlar; açılışta okunur */
  /** animasyon: "acik" | "sistem" | "kapali" (js/hareket.js) */
  ayarlar: { dil: 'sistem', tema: 'sistem', birim: 'metrik', varsayilanArac: null, guncellemeDenetimi: true, animasyon: 'acik' },
  /** Windows'un (ya da tarayıcının) dili; "Sistem dili" seçeneğinde gösterilir */
  sistemDili: 'en',
  /** Kabuktan: kurulu mu, veri klasörü */
  surumBilgisi: { kurulu: false, veriKlasoru: null, tarayici: true },
  /** ?ornek=1: motor yerine arayuz-ornek/ornek-sonuc.json kullanılır (geliştirme) */
  gelistirme: parametreler.get('ornek') === '1',
};

const olaylar = new EventTarget();

export function yay(ad, detay) {
  olaylar.dispatchEvent(new CustomEvent(ad, { detail: detay }));
}

export function dinle(ad, fn) {
  const sarmal = (e) => fn(e.detail);
  olaylar.addEventListener(ad, sarmal);
  return () => olaylar.removeEventListener(ad, sarmal);
}

let idSayac = 0;
export function yeniId(onek) {
  idSayac += 1;
  return `${onek}${Date.now().toString(36)}${idSayac.toString(36)}`;
}

// ---------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------

/** Ayarı yazar (kabukta ayarlar.json, tarayıcıda localStorage) ve duyurur. */
export async function ayarDegistir(degisiklik) {
  Object.assign(durum.ayarlar, degisiklik);
  await istek('ayarlarYaz', degisiklik);
  yay('ayarlar', degisiklik);
}

// ---------------------------------------------------------------------------
// Kütüphane
// ---------------------------------------------------------------------------

export async function kutuphaneYukle() {
  let veri = null;
  try {
    veri = await istek('kutuphaneOku');
  } catch (e) {
    console.warn('Kütüphane okunamadı', e);
  }
  if (!veri || !Array.isArray(veri.urunler) || !Array.isArray(veri.araclar)) {
    durum.kutuphane = { surum: KUTUPHANE_SURUMU, urunler: varsayilanUrunler(), araclar: [] };
    await kutuphaneKaydet().catch(() => {});
  } else {
    durum.kutuphane = veri;
    if (!(veri.surum >= KUTUPHANE_SURUMU)) {
      // 2. sürüm: palet ürünleri eklenir (kullanıcının ürünleri ve araçları korunur)
      const var_ = new Set(veri.urunler.map((u) => u.id));
      paletUrunleri().filter((u) => !var_.has(u.id)).forEach((u) => veri.urunler.push(u));
      veri.surum = KUTUPHANE_SURUMU;
      await kutuphaneKaydet().catch(() => {});
    }
  }
  yay('kutuphane');
}

export async function kutuphaneKaydet() {
  await istek('kutuphaneYaz', { veri: durum.kutuphane });
  yay('kutuphane');
}

/** Dışarıdan gelen kütüphane verisini doğrular; geçersizse null. */
export function kutuphaneDogrula(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.urunler) || !Array.isArray(v.araclar)) return null;
  const urunler = v.urunler
    .filter((u) => u && typeof u === 'object' && u.uzunluk > 0 && u.en > 0 && u.yukseklik > 0)
    .map((u) => {
      const { adet, teslimatSirasi, urunId, ...k } = kalemDuzelt(u);
      return { ...k, id: typeof u.id === 'string' && u.id ? u.id : k.id };
    });
  const araclar = v.araclar.map(aracDuzelt).filter(Boolean).map((a, i) => ({
    ...a,
    id: typeof v.araclar[i]?.id === 'string' && v.araclar[i].id ? v.araclar[i].id : yeniId('a'),
  }));
  return { surum: KUTUPHANE_SURUMU, urunler, araclar };
}

/** Hazır tipler + kullanıcının araçları */
export function tumAraclar() {
  return hazirAraclar().concat(durum.kutuphane.araclar.map((a) => ({ ...a, hazir: false })));
}

/** Kimlikten araç: hazır tip, kütüphanedeki araç ya da "katalog:<kayıt kimliği>" */
export function aracBul(id) {
  if (typeof id === 'string' && id.startsWith(KATALOG_ONEKI)) {
    const k = katalogKaydi(id.slice(KATALOG_ONEKI.length));
    return k ? { ...katalogdanArac(k), id } : null;
  }
  return tumAraclar().find((a) => a.id === id) || null;
}

/** Katalogdan seçilen aracın plandaki tip kimliği öneki */
export const KATALOG_ONEKI = 'katalog:';

/** Katalog kaydından plan aracı; tip kimliği "katalog:<kimlik>" olur, böylece ölçüsü değişince "Özel ölçü" görünür */
export function katalogdanPlanAraci(k) {
  return plandaArac({ ...katalogdanArac(k), id: KATALOG_ONEKI + k.id });
}

/** Plandaki araç, seçildiği tipten farklı ölçüdeyse "Özel ölçü" */
export function aracOzelMi(arac) {
  const kaynak = aracBul(arac.tipId);
  if (!kaynak) return true;
  return (
    kaynak.uzunluk !== arac.uzunluk ||
    kaynak.en !== arac.en ||
    kaynak.yukseklik !== arac.yukseklik ||
    (kaynak.maksAgirlik || 0) !== (arac.maksAgirlik || 0)
  );
}

/** Yeni plan için araç: Ayarlar'daki varsayılan, yoksa Standart Tır, katalog açılamadıysa boş araç */
export function varsayilanPlanAraci() {
  const secili = durum.ayarlar.varsayilanArac ? aracBul(durum.ayarlar.varsayilanArac) : null;
  const a = secili || hazirArac(VARSAYILAN_ARAC) || hazirAraclar()[0];
  return a ? plandaArac(a) : bosArac();
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export function yeniPlanNesnesi(veri = {}) {
  const simdi = new Date().toISOString();
  return {
    ad: veri.ad || t('plan.yeniAd'),
    arac: veri.arac || varsayilanPlanAraci(),
    /** Karışık filo: ana araç dolunca sırayla kullanılacak öteki araçlar */
    filo: Array.isArray(veri.filo) ? veri.filo : [],
    filoSecimi: veri.filoSecimi === 'enUygun' ? 'enUygun' : 'sirayla',
    cokluArac: veri.cokluArac !== false,
    /** Kısa yükü dorsede ortala (motor desteklemiyorsa yok sayılır) */
    dengele: veri.dengele === true,
    kalemler: (veri.kalemler || []).map(kalemDuzelt),
    sonuc: veri.sonuc || null,
    sonucImza: veri.sonucImza || null,
    /** Sonuç hesaplanırken kullanılan araç ve filo (3B ve özet bunu çizer) */
    sonucArac: veri.sonucArac || null,
    /** Yerleşim 3B'de elle değiştirildi (taşıma, döndürme, yaslama); "Planla" yeniden basılınca sorulur */
    elleDuzenlendi: veri.elleDuzenlendi === true && !!veri.sonuc,
    /** Elle düzenlemeden önceki motor sonucu ("Otomatik plana dön" bunu geri koyar) */
    otomatikSonuc: veri.otomatikSonuc || null,
    olusturma: veri.olusturma || simdi,
    guncelleme: veri.guncelleme || simdi,
    // çalışma anı alanları (dosyaya yazılmaz)
    yol: null,
    kaydedilmemis: false,
  };
}

export function kalemDuzelt(k) {
  const sayi = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    id: k.id || yeniId('k'),
    urunId: k.urunId || null,
    ad: String(k.ad || '').trim() || '?',
    referans: String(k.referans || ''),
    uzunluk: Math.round(sayi(k.uzunluk, 0)),
    en: Math.round(sayi(k.en, 0)),
    yukseklik: Math.round(sayi(k.yukseklik, 0)),
    agirlik: Math.max(0, sayi(k.agirlik, 0)),
    adet: Math.max(1, Math.round(sayi(k.adet, 1))),
    renk: /^#[0-9a-f]{6}$/i.test(k.renk) ? k.renk : '#3ABFF0',
    donus: ['serbest', 'dik', 'sabit'].includes(k.donus) ? k.donus : 'serbest',
    ustuneKonabilir: k.ustuneKonabilir !== false,
    yalnizZemin: k.yalnizZemin === true,
    ustYukSiniri: k.ustYukSiniri == null || k.ustYukSiniri === '' ? null : Math.max(0, sayi(k.ustYukSiniri, 0)),
    teslimatSirasi: Math.max(0, Math.round(sayi(k.teslimatSirasi, 0))),
  };
}

/** Dosyadan ya da kütüphaneden gelen araç nesnesini doğrular; geçersizse null. */
export function aracDuzelt(a) {
  if (!a || typeof a !== 'object' || !(a.uzunluk > 0 && a.en > 0 && a.yukseklik > 0)) return null;
  const pozitif = (v) => Number.isFinite(Number(v)) && Number(v) > 0;
  return {
    tipId: typeof a.tipId === 'string' ? a.tipId : null,
    ad: String(a.ad || ''),
    tur: ARAC_TURLERI.includes(a.tur) ? a.tur : 'tir',
    uzunluk: Math.round(a.uzunluk),
    en: Math.round(a.en),
    yukseklik: Math.round(a.yukseklik),
    maksAgirlik: Math.max(0, Number(a.maksAgirlik) || 0),
    yukBilinmiyor: a.yukBilinmiyor === true && !(Number(a.maksAgirlik) > 0),
    kapiPayiMm: Math.max(0, Math.round(Number(a.kapiPayiMm) || 0)),
    aks: a.aks && pozitif(a.aks.sasiMesafe) && pozitif(a.aks.aksMerkezi) ? { sasiMesafe: Math.round(a.aks.sasiMesafe), aksMerkezi: Math.round(a.aks.aksMerkezi) } : null,
    kapi: a.kapi && pozitif(a.kapi.en) && pozitif(a.kapi.yukseklik) ? { en: Math.round(a.kapi.en), yukseklik: Math.round(a.kapi.yukseklik) } : null,
    tipik: a.tipik === true,
    kaynak: typeof a.kaynak === 'string' && a.kaynak.startsWith('https://') ? a.kaynak : null,
    katalogId: typeof a.katalogId === 'string' ? a.katalogId : null,
    kategori: KATALOG_KATEGORILERI.includes(a.kategori) ? a.kategori : null,
  };
}

/** Açık planı değiştirir ve duyurur. */
export function planiAc(plan, { yol = null, kaydedilmemis = false } = {}) {
  plan.yol = yol;
  plan.kaydedilmemis = kaydedilmemis;
  durum.plan = plan;
  gecmisSifirla();
  belgeBasligiGuncelle();
  bildir('durum', { kaydedilmemis: kaydedilmemis && plan.kalemler.length > 0 });
  yay('planAcildi', plan);
}

/**
 * Plan değişti: kaydedilmemiş işaretlenir, sonuç eskidiyse arayüz bunu gösterir.
 * ne: 'ad', 'arac', 'aracAlani', 'kalem', 'sonuc' (yeni hesap), 'elle' / 'elleKlavye' (elle düzenleme), 'gecmis'
 */
export function planDegisti(ne = 'girdi') {
  const p = durum.plan;
  if (!p) return;
  p.guncelleme = new Date().toISOString();
  p.kaydedilmemis = true;
  if (ne === 'sonuc') gecmisSonucYenilendi();
  else if (ne !== 'gecmis') gecmiseYaz(ne);
  // Kabuk kapanırken sorar; boş planda sormaya değmez
  bildir('durum', { kaydedilmemis: p.kalemler.length > 0 });
  belgeBasligiGuncelle();
  yay('planDegisti', ne);
}

export function planKaydedildi(yol) {
  const p = durum.plan;
  if (!p) return;
  p.yol = yol;
  p.kaydedilmemis = false;
  bildir('durum', { kaydedilmemis: false });
  belgeBasligiGuncelle();
  yay('planKaydedildi', p);
}

export function belgeBasligiGuncelle() {
  const p = durum.plan;
  document.title = p ? t('belgeBasligi', { plan: p.ad, ad: URUN.ad }) : URUN.ad;
}

// ---------------------------------------------------------------------------
// Geri al / yinele (Ctrl+Z / Ctrl+Y): planın girdileri ve elle düzenlenen yerleşim.
// Motorun yeni hesabı geçmişe girmez; yeni hesaptan sonra eski yerleşimler geçmişten ayıklanır
// (girdi adımları kalır, eski sonuca ait yerleşim geri gelmez).
// ---------------------------------------------------------------------------

const GECMIS_SINIRI = 100;
/** Ad ve araç alanına yazarken, ok tuşlarıyla taşırken art arda gelen değişiklikler tek adım sayılır */
const BIRLESTIRME_MS = 1200;
const BIRLESEN_TURLER = new Set(['ad', 'aracAlani', 'elleKlavye']);
let geriYigini = [];
let ileriYigini = [];
let sonAnlik = null;
let sonTur = null;
let sonZaman = 0;

function anlik(p) {
  return JSON.stringify({
    ad: p.ad, arac: p.arac, filo: p.filo, filoSecimi: p.filoSecimi, cokluArac: p.cokluArac, dengele: p.dengele, kalemler: p.kalemler,
    // Açık sonucun yerleşimi: elle düzenleme adımları bununla geri alınır
    elle: p.sonuc ? { d: p.elleDuzenlendi === true, a: p.sonuc.araclar } : null,
  });
}

/** Anlıktan yerleşim kısmını atar (yalnız girdiler kalır) */
function yalnizGirdi(json) {
  const v = JSON.parse(json);
  v.elle = null;
  return JSON.stringify(v);
}

function gecmisSifirla() {
  geriYigini = [];
  ileriYigini = [];
  sonAnlik = durum.plan ? anlik(durum.plan) : null;
  sonTur = null;
  yay('gecmis');
}

/** Yeni hesap geldi: geçmişteki yerleşimler eski sonuca aittir, atılır; aynı kalan adımlar birleşir. */
function gecmisSonucYenilendi() {
  sonAnlik = durum.plan ? anlik(durum.plan) : null;
  const simdi = sonAnlik ? yalnizGirdi(sonAnlik) : null;
  const ayikla = (yigin) => {
    const kalan = [];
    for (const j of yigin.map(yalnizGirdi)) if (kalan[kalan.length - 1] !== j) kalan.push(j);
    while (kalan.length && kalan[kalan.length - 1] === simdi) kalan.pop();
    return kalan;
  };
  geriYigini = ayikla(geriYigini);
  ileriYigini = ayikla(ileriYigini);
  sonTur = null;
  yay('gecmis');
}

function gecmiseYaz(ne) {
  const yeni = anlik(durum.plan);
  if (yeni === sonAnlik) return;
  const simdi = performance.now();
  const birlestir = BIRLESEN_TURLER.has(ne) && ne === sonTur && simdi - sonZaman < BIRLESTIRME_MS;
  if (!birlestir && sonAnlik != null) {
    geriYigini.push(sonAnlik);
    if (geriYigini.length > GECMIS_SINIRI) geriYigini.shift();
  }
  ileriYigini = [];
  sonAnlik = yeni;
  sonTur = ne;
  sonZaman = simdi;
  yay('gecmis');
}

function anligiUygula(json) {
  const { elle, ...girdi } = JSON.parse(json);
  const p = durum.plan;
  Object.assign(p, girdi);
  // Yerleşim kısmı yalnız açık sonuca aittir; ayıklanmış adımda (elle: null) sonuç yerinde kalır
  let elleDegisti = false;
  if (elle && p.sonuc) {
    if (JSON.stringify(elle.a) !== JSON.stringify(p.sonuc.araclar)) {
      p.sonuc = { ...p.sonuc, araclar: elle.a };
      elleDegisti = true;
    }
    if (p.elleDuzenlendi !== elle.d) {
      p.elleDuzenlendi = elle.d;
      elleDegisti = true;
    }
  }
  sonAnlik = json;
  sonTur = null;
  planDegisti('gecmis');
  yay('planYenile', { elleDegisti });
  yay('gecmis');
}

export const geriAlinabilir = () => !!durum.plan && geriYigini.length > 0;
export const yinelenebilir = () => !!durum.plan && ileriYigini.length > 0;

export function geriAl() {
  if (!geriAlinabilir()) return false;
  ileriYigini.push(anlik(durum.plan));
  anligiUygula(geriYigini.pop());
  return true;
}

export function yinele() {
  if (!yinelenebilir()) return false;
  geriYigini.push(anlik(durum.plan));
  anligiUygula(ileriYigini.pop());
  return true;
}

// ---------------------------------------------------------------------------
// Motor girdisi ve dosya biçimi
// ---------------------------------------------------------------------------

function motorAraci(a) {
  const arac = {
    ad: a.ad,
    en: a.en,
    yukseklik: a.yukseklik,
    uzunluk: a.uzunluk,
    maksAgirlik: a.maksAgirlik || 0,
    kapiPayiMm: a.kapiPayiMm || 0,
  };
  if (a.aks && a.aks.sasiMesafe > 0 && a.aks.aksMerkezi > a.aks.sasiMesafe) arac.aks = { ...a.aks };
  return arac;
}

/** Motorun beklediği girdi (mm, kg). Filo varsa ana araç listenin başındadır. */
export function motorGirdisi(plan) {
  const filo = plan.filo && plan.filo.length ? [plan.arac, ...plan.filo].map(motorAraci) : null;
  const secenekler = { destekOrani: 0.7, dengele: plan.dengele === true };
  if (filo) secenekler.filoSecimi = plan.filoSecimi === 'enUygun' ? 'enUygun' : 'sirayla';
  return {
    arac: motorAraci(plan.arac),
    ...(filo ? { filo } : {}),
    cokluArac: plan.cokluArac,
    kalemler: plan.kalemler.map((k) => ({
      id: k.id,
      ad: k.ad,
      referans: k.referans || '',
      en: k.en,
      yukseklik: k.yukseklik,
      uzunluk: k.uzunluk,
      agirlik: k.agirlik,
      adet: k.adet,
      renk: k.renk,
      donus: k.donus,
      ustuneKonabilir: k.ustuneKonabilir,
      yalnizZemin: k.yalnizZemin,
      ustYukSiniri: k.ustuneKonabilir ? k.ustYukSiniri : null,
      teslimatSirasi: k.teslimatSirasi || 0,
    })),
    secenekler,
  };
}

/** Sonucu etkileyen girdilerin imzası; adlar ve referanslar yerleşimi değiştirmediği için dışarıda kalır. */
export const girdiImzasi = (girdi) =>
  JSON.stringify({
    ...girdi,
    arac: { ...girdi.arac, ad: undefined },
    filo: girdi.filo ? girdi.filo.map((a) => ({ ...a, ad: undefined })) : undefined,
    kalemler: girdi.kalemler.map(({ ad, referans, ...k }) => k),
  });

/** Sonuç açık plandaki girdilerle mi hesaplandı? */
export function sonucGuncelMi(plan) {
  return !!plan.sonuc && plan.sonucImza === girdiImzasi(motorGirdisi(plan));
}

export function planToplamlari(plan) {
  let parca = 0;
  let agirlik = 0;
  let hacim = 0;
  for (const k of plan.kalemler) {
    parca += k.adet;
    agirlik += k.agirlik * k.adet;
    hacim += k.uzunluk * k.en * k.yukseklik * k.adet;
  }
  return { kalem: plan.kalemler.length, parca, agirlik, hacim };
}

/** Kapı ağzı uyarısı: parçanın en küçük iki ölçüsü kapı ağzına (en × yükseklik) sığmıyorsa true */
export function kapidanGecmez(kalem, arac) {
  const k = arac && arac.kapi;
  if (!k || !(k.en > 0 && k.yukseklik > 0)) return false;
  const [a, b] = [kalem.uzunluk, kalem.en, kalem.yukseklik].sort((x, y) => x - y);
  const [ka, kb] = [k.en, k.yukseklik].sort((x, y) => x - y);
  return a > ka || b > kb;
}

/**
 * Dosya biçimi: { bicim, surum, ad, arac, filo, filoSecimi, cokluArac, dengele, kalemler, sonuc, sonucImza, sonucArac,
 *   elleDuzenlendi, otomatikSonuc, ozet, ... }. Eski dosyalarda son iki alan yoktur; okununca elle düzenlenmemiş sayılır.
 */
export function planJson(plan) {
  const top = planToplamlari(plan);
  const s = plan.sonuc;
  const ozet = {
    aracAd: plan.arac.ad,
    aracTur: plan.arac.tur,
    aracSayisi: s ? s.araclar.length : 0,
    parca: top.parca,
    agirlik: Math.round(top.agirlik),
    doluluk: s && s.araclar.length
      ? Math.round((s.araclar.reduce((t2, a) => t2 + (a.hacimDoluluk || 0), 0) / s.araclar.length) * 10) / 10
      : null,
    elleDuzenlendi: !!s && plan.elleDuzenlendi === true,
  };
  const elle = !!s && plan.elleDuzenlendi === true;
  return JSON.stringify(
    {
      bicim: `${URUN.kisaAd}-plan`,
      surum: 1,
      uygulama: `${URUN.ad} ${URUN.surum}`,
      ad: plan.ad,
      olusturma: plan.olusturma,
      guncelleme: plan.guncelleme,
      arac: plan.arac,
      filo: plan.filo,
      filoSecimi: plan.filoSecimi,
      cokluArac: plan.cokluArac,
      dengele: plan.dengele,
      kalemler: plan.kalemler,
      sonuc: plan.sonuc,
      sonucImza: plan.sonucImza,
      sonucArac: plan.sonucArac,
      // Elle düzenlenmiş planda "sonuc" yeni yerleşimdir; motorun ilk sonucu geri dönmek için ayrıca saklanır
      elleDuzenlendi: elle,
      otomatikSonuc: elle ? plan.otomatikSonuc || null : null,
      ozet,
    },
    null,
    2
  );
}

/** Dosyadan plan okur; geçersizse hata fırlatır. */
export function plandanOku(json) {
  let v;
  try {
    v = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    throw new Error(t('plan.gecersiz', { ad: URUN.ad }));
  }
  const arac = v && typeof v === 'object' ? aracDuzelt(v.arac) : null;
  if (!arac || !Array.isArray(v.kalemler)) throw new Error(t('plan.gecersiz', { ad: URUN.ad }));
  const filo = Array.isArray(v.filo) ? v.filo.map(aracDuzelt).filter(Boolean).slice(0, 12) : [];
  const gecerliSonuc = (s) => (s && Array.isArray(s.araclar) && s.araclar.every((x) => x && Array.isArray(x.yerlesimler)) ? s : null);
  const sonuc = gecerliSonuc(v.sonuc);
  const sa = v.sonucArac;
  const sonucArac = sonuc && sa && sa.uzunluk > 0 && sa.en > 0 && sa.yukseklik > 0 ? { ...arac, ...sa } : null;
  const elleDuzenlendi = !!sonuc && v.elleDuzenlendi === true;
  // Motorun ilk sonucu, düzenlenmiş sonuçla aynı araç sayısındaysa kullanılır
  const otomatik = elleDuzenlendi ? gecerliSonuc(v.otomatikSonuc) : null;
  const otomatikSonuc = otomatik && otomatik.araclar.length === sonuc.araclar.length ? otomatik : null;
  return yeniPlanNesnesi({
    ...v, arac, filo, sonuc, sonucImza: sonuc ? v.sonucImza : null, sonucArac, elleDuzenlendi, otomatikSonuc,
  });
}
