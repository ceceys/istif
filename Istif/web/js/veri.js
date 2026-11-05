// Araç kataloğu, hazır araç tipleri, renk paleti, varsayılan ürünler ve örnek yükler. Ölçüler mm, ağırlık kg.
import { t, dilKodu } from './dil.js';

/** Kalem renkleri: koyu ve açık zeminde birbirinden ayrışan tonlar */
export const RENKLER = [
  '#3ABFF0', '#F2B441', '#35C48A', '#9D8CF2', '#E8716B',
  '#5ED6C6', '#F08FC0', '#6EA8FE', '#D9A066', '#C9CED6',
];

export const ARAC_TURLERI = ['tir', 'kamyon', 'kamyonet', 'konteyner'];

/** Katalog kategorisi → 3B model türü (konteynerde kabin yok; vagon ve hava kargo kutusu da konteyner gibi çizilir) */
const KATEGORI_TUR = {
  dorse: 'tir',
  kamyon: 'kamyon',
  romork: 'kamyon',
  'takas-kasasi': 'kamyon',
  panelvan: 'kamyonet',
  konteyner: 'konteyner',
  hava: 'konteyner',
  demiryolu: 'konteyner',
};
export const KATALOG_KATEGORILERI = Object.keys(KATEGORI_TUR);

/**
 * Hazır tipler katalog kayıtlarından türetilir (05.11 kararı): ölçü, kapı ağzı, yük ve kaynak katalogdan,
 * görünen ad dil dosyasından gelir. maksAgirlik verilen tipte katalogdaki değerin yerine o kullanılır
 * (dorse kayıtlarında tipik yük yok; Standart ve Mega Tır için 24.000 kg alındı).
 * Aks varsayılanı yok: değer kaynakla kesinleşmedi; kullanıcı araç kartında girer.
 * Panelvan: katalogdaki doğrulanmış Ford Transit L3H2 kaydı; yükü katalogdan.
 * Katalogda bulunmayan kayıt listeye girmez.
 */
const HAZIR = [
  { id: 'standart-tir', katalogId: 'dorse-tenteli-standart-1362', maksAgirlik: 24000 },
  { id: 'mega-tir', katalogId: 'dorse-mega-tenteli-1362', maksAgirlik: 24000 },
  { id: 'konteyner-20', katalogId: 'konteyner-20dc' },
  { id: 'konteyner-40', katalogId: 'konteyner-40dc' },
  { id: 'konteyner-40hc', katalogId: 'konteyner-40hc' },
  { id: 'panelvan', katalogId: 'ford-transit-l3h2-onden-cekis' },
];

/** Yeni planın aracı; Ayarlar'da başka bir varsayılan seçilmemişse */
export const VARSAYILAN_ARAC = 'standart-tir';

// ---------------------------------------------------------------------------
// Katalog (web/veri/arac-katalogu.json)
// ---------------------------------------------------------------------------

let katalog = { surum: 0, tarih: null, kayitlar: [] };
let katalogHatasi = null;

const pozitif = (n) => Number.isFinite(n) && n > 0;

/** Kayıt programda kullanılabilir mi? (iç ölçüler pozitif tamsayı, kategori bilinen) */
function kayitGecerli(k) {
  return !!k && typeof k.id === 'string' && k.ic && pozitif(k.ic.uzunluk) && pozitif(k.ic.en) && pozitif(k.ic.yukseklik);
}

/** Kataloğu okur; açılış sırasında bir kez çağrılır. Okunamazsa hazır tipler boş kalır, hata saklanır. */
export async function katalogYukle() {
  try {
    const yanit = await fetch(new URL('../veri/arac-katalogu.json', import.meta.url), { cache: 'no-store' });
    if (!yanit.ok) throw new Error('HTTP ' + yanit.status);
    const v = await yanit.json();
    if (!v || !Array.isArray(v.kayitlar)) throw new Error('kayitlar yok');
    katalog = { surum: v.surum || 0, tarih: v.tarih || null, kayitlar: v.kayitlar.filter(kayitGecerli) };
    katalogHatasi = null;
  } catch (e) {
    katalogHatasi = e;
    console.error('Araç kataloğu okunamadı', e);
  }
  return katalog;
}

export const katalogBilgisi = () => ({ surum: katalog.surum, tarih: katalog.tarih, sayi: katalog.kayitlar.length, hata: katalogHatasi });
export const katalogKayitlari = () => katalog.kayitlar;
export const katalogKaydi = (id) => katalog.kayitlar.find((k) => k.id === id) || null;

/** { tr, en } biçimindeki alanın etkin dildeki metni; yoksa İngilizcesi, o da yoksa Türkçesi */
export function yerelMetin(alan) {
  if (!alan) return '';
  if (typeof alan === 'string') return alan;
  return alan[dilKodu()] || alan.en || alan.tr || '';
}

export const kayitAdi = (k) => yerelMetin(k.ad) || k.id;

/** Kaydın kaynak adresleri (birincil, ikinci kaynak, ekler); yalnız https ve tekil */
export function kayitBaglantilari(k) {
  const liste = [k.kaynak, k.ikinciKaynak && k.ikinciKaynak.url, ...(Array.isArray(k.ekKaynaklar) ? k.ekKaynaklar : [])];
  return [...new Set(liste.filter((u) => typeof u === 'string' && u.startsWith('https://')))];
}

export const kategoriTuru = (kategori) => KATEGORI_TUR[kategori] || 'tir';

/**
 * Katalog kaydından düzenlenebilir araç nesnesi (kütüphane biçimi).
 * maksYuk kaynakta yoksa (null) azami yük 0 gider (motor için sınırsız) ve yukBilinmiyor işaretlenir;
 * arayüz alanı boş gösterip kullanıcıdan değeri ister.
 */
export function katalogdanArac(k) {
  return {
    katalogId: k.id,
    kategori: k.kategori,
    tur: kategoriTuru(k.kategori),
    ad: kayitAdi(k),
    uzunluk: Math.round(k.ic.uzunluk),
    en: Math.round(k.ic.en),
    yukseklik: Math.round(k.ic.yukseklik),
    maksAgirlik: pozitif(k.maksYuk) ? Math.round(k.maksYuk) : 0,
    yukBilinmiyor: !pozitif(k.maksYuk),
    kapiPayiMm: 0,
    kapi: k.kapi && pozitif(k.kapi.en) && pozitif(k.kapi.yukseklik) ? { en: Math.round(k.kapi.en), yukseklik: Math.round(k.kapi.yukseklik) } : null,
    tipik: k.tipik === true,
    kaynak: typeof k.kaynak === 'string' ? k.kaynak : null,
    aks: null,
  };
}

// ---------------------------------------------------------------------------
// Hazır tipler
// ---------------------------------------------------------------------------

/** Hazır tipler (katalogdan), adları dil dosyasından */
export function hazirAraclar() {
  return HAZIR.map((h) => {
    const k = katalogKaydi(h.katalogId);
    if (!k) return null;
    const a = katalogdanArac(k);
    const yuk = h.maksAgirlik != null ? { maksAgirlik: h.maksAgirlik, yukBilinmiyor: false } : {};
    return { ...a, ...yuk, id: h.id, ad: t('araclar.tipler.' + h.id), hazir: true };
  }).filter(Boolean);
}

export function hazirArac(id) {
  return hazirAraclar().find((a) => a.id === id) || null;
}

/** Plan için araç nesnesi (hazır tipten, katalogdan ya da kütüphanedeki araçtan) */
export function plandaArac(kaynak) {
  return {
    tipId: kaynak.id || null,
    ad: kaynak.ad,
    tur: ARAC_TURLERI.includes(kaynak.tur) ? kaynak.tur : 'tir',
    uzunluk: kaynak.uzunluk,
    en: kaynak.en,
    yukseklik: kaynak.yukseklik,
    maksAgirlik: kaynak.maksAgirlik || 0,
    yukBilinmiyor: kaynak.yukBilinmiyor === true && !(kaynak.maksAgirlik > 0),
    kapiPayiMm: kaynak.kapiPayiMm || 0,
    aks: kaynak.aks ? { ...kaynak.aks } : null,
    kapi: kaynak.kapi ? { ...kaynak.kapi } : null,
    tipik: kaynak.tipik === true,
    kaynak: kaynak.kaynak || null,
    katalogId: kaynak.katalogId || null,
    kategori: kaynak.kategori || null,
  };
}

/** Katalog açılamadıysa yeni plan için boş, düzenlenebilir araç */
export function bosArac() {
  return { tipId: null, ad: t('plan.arac.ozelOlcu'), tur: 'tir', uzunluk: 0, en: 0, yukseklik: 0, maksAgirlik: 0, yukBilinmiyor: false, kapiPayiMm: 0, aks: null, kapi: null, tipik: false, kaynak: null, katalogId: null, kategori: null };
}

/** Panelvanda iç genişlik tekerlek davlumbazları arasıdır (katalog notu) */
export const davlumbazNotuVar = (a) => !!a && a.kategori === 'panelvan';

// ---------------------------------------------------------------------------
// Ürünler ve örnek yükler
// ---------------------------------------------------------------------------

/** Kütüphane sürümü: 2'de palet ürünleri eklendi */
export const KUTUPHANE_SURUMU = 2;

/** Örnek yükteki dört makine; ürün kütüphanesine hazır gelir */
function makineler() {
  return [
    { id: 'u-gubre', ad: t('ornek.gubre'), referans: '', uzunluk: 2750, en: 1500, yukseklik: 1400, agirlik: 600, renk: '#F2B441', donus: 'dik', ustuneKonabilir: true, yalnizZemin: false, ustYukSiniri: null },
    { id: 'u-ilaclama', ad: t('ornek.ilaclama'), referans: '', uzunluk: 3450, en: 1600, yukseklik: 1450, agirlik: 655, renk: '#3ABFF0', donus: 'dik', ustuneKonabilir: false, yalnizZemin: true, ustYukSiniri: null },
    { id: 'u-capa', ad: t('ornek.capa'), referans: '', uzunluk: 2200, en: 1100, yukseklik: 1300, agirlik: 354, renk: '#35C48A', donus: 'dik', ustuneKonabilir: true, yalnizZemin: false, ustYukSiniri: null },
    { id: 'u-diskaro', ad: t('ornek.diskaro'), referans: '', uzunluk: 2000, en: 2000, yukseklik: 660, agirlik: 680, renk: '#9D8CF2', donus: 'dik', ustuneKonabilir: true, yalnizZemin: false, ustYukSiniri: null },
  ];
}

/**
 * Palet ürünleri: taban ölçüsü standarttır (EUR 1200 × 800, endüstriyel 1200 × 1000 mm).
 * Yükseklik ve ağırlık yüke göre değişir; 150 cm ve 0 kg yalnız başlangıç değeridir, kullanıcı düzenler.
 */
export function paletUrunleri() {
  return [
    { id: 'u-eur-palet', ad: t('ornek.eurPalet'), referans: '', uzunluk: 1200, en: 800, yukseklik: 1500, agirlik: 0, renk: '#D9A066', donus: 'dik', ustuneKonabilir: true, yalnizZemin: false, ustYukSiniri: null },
    { id: 'u-endustriyel-palet', ad: t('ornek.endustriyelPalet'), referans: '', uzunluk: 1200, en: 1000, yukseklik: 1500, agirlik: 0, renk: '#5ED6C6', donus: 'dik', ustuneKonabilir: true, yalnizZemin: false, ustYukSiniri: null },
  ];
}

export function varsayilanUrunler() {
  return makineler().concat(paletUrunleri());
}

/** Excel şablonundaki örnek satırlar (yalnız makineler; adetleri örnek yükten) */
export function sablonUrunleri() {
  const adet = { 'u-gubre': 1, 'u-ilaclama': 3, 'u-capa': 2, 'u-diskaro': 3 };
  return makineler().map((u) => ({ ...u, adet: adet[u.id] }));
}

/** Örnek yük galerisi: tarım makineleri, EUR paletler, karışık koliler, konteyner ihracatı */
export const ORNEKLER = ['tarim', 'palet', 'koli', 'konteyner'];

/** Örnek yüklerin aracı; katalog açılamadıysa yine çizilebilsin diye ölçüler yedek olarak burada da durur */
function ornekAraci(id, yedek, degisiklik = {}) {
  const hazir = hazirArac(id);
  const a = hazir ? plandaArac(hazir) : { ...bosArac(), tipId: null, ad: t('araclar.tipler.' + id), ...yedek };
  return { ...a, ...degisiklik };
}

const kalem = (i, k) => ({ id: 'k' + (i + 1), urunId: null, referans: '', teslimatSirasi: 0, ustYukSiniri: null, yalnizZemin: false, ustuneKonabilir: true, donus: 'dik', ...k });

/**
 * Örnek planın verisi.
 * tarim: 05.11.2026'daki gerçek tır yükü (4 kalem, 9 parça, 5.313 kg; tır iç ölçüsü 13,60 × 2,50 × 2,80 m).
 * Öteki örnekler gösterim içindir; ölçü ve ağırlıklar örnek değerdir.
 */
export function ornekPlanVerisi(ad = 'tarim') {
  if (ad === 'palet') {
    return {
      ad: t('ornek.planPalet'),
      arac: ornekAraci('standart-tir', { tur: 'tir', uzunluk: 13620, en: 2480, yukseklik: 2700, maksAgirlik: 24000 }),
      cokluArac: true,
      kalemler: [kalem(0, { ad: t('ornek.eurPalet'), urunId: 'u-eur-palet', uzunluk: 1200, en: 800, yukseklik: 1500, agirlik: 600, adet: 33, renk: '#D9A066', ustuneKonabilir: false })],
    };
  }
  if (ad === 'koli') {
    return {
      ad: t('ornek.planKoli'),
      arac: ornekAraci('konteyner-20', { tur: 'konteyner', uzunluk: 5898, en: 2350, yukseklik: 2390, maksAgirlik: 28200 }),
      cokluArac: true,
      kalemler: [
        kalem(0, { ad: t('ornek.koliBuyuk'), uzunluk: 1200, en: 800, yukseklik: 1000, agirlik: 180, adet: 8, renk: '#C9CED6', donus: 'dik', ustYukSiniri: 400 }),
        kalem(1, { ad: t('ornek.koliOrta'), uzunluk: 800, en: 600, yukseklik: 600, agirlik: 20, adet: 30, renk: '#3ABFF0', donus: 'serbest' }),
        kalem(2, { ad: t('ornek.koliKucuk'), uzunluk: 600, en: 400, yukseklik: 400, agirlik: 12, adet: 60, renk: '#F2B441', donus: 'serbest' }),
        kalem(3, { ad: t('ornek.koliUzun'), uzunluk: 2000, en: 400, yukseklik: 300, agirlik: 25, adet: 10, renk: '#9D8CF2', donus: 'dik' }),
      ],
    };
  }
  if (ad === 'konteyner') {
    return {
      ad: t('ornek.planKonteyner'),
      arac: ornekAraci('konteyner-40hc', { tur: 'konteyner', uzunluk: 12032, en: 2350, yukseklik: 2695, maksAgirlik: 26460 }),
      cokluArac: true,
      kalemler: [
        kalem(0, { ad: t('ornek.makineSandigi'), uzunluk: 2400, en: 1150, yukseklik: 1800, agirlik: 1200, adet: 4, renk: '#E8716B', ustuneKonabilir: false, yalnizZemin: true }),
        kalem(1, { ad: t('ornek.parcaSandigi'), uzunluk: 1200, en: 1000, yukseklik: 1000, agirlik: 350, adet: 10, renk: '#35C48A', ustYukSiniri: 700 }),
        kalem(2, { ad: t('ornek.koliOrta'), uzunluk: 600, en: 400, yukseklik: 500, agirlik: 20, adet: 40, renk: '#3ABFF0', donus: 'serbest' }),
      ],
    };
  }
  // Tarım makineleri
  const urunAdet = { 'u-gubre': 1, 'u-ilaclama': 3, 'u-capa': 2, 'u-diskaro': 3 };
  const kalemler = makineler().map((u, i) => ({ ...u, id: 'k' + (i + 1), urunId: u.id, adet: urunAdet[u.id], teslimatSirasi: 0 }));
  return {
    ad: t('ornek.planAdi'),
    arac: ornekAraci('standart-tir', { tur: 'tir', maksAgirlik: 24000 }, { uzunluk: 13600, en: 2500, yukseklik: 2800 }),
    cokluArac: true,
    kalemler,
  };
}
