// İstif motor testlerinin senaryoları. Girdiler sözleşmedeki biçimdedir.

export const TIR = { ad: "Tır", en: 2500, yukseklik: 2800, uzunluk: 13600, maksAgirlik: 24000 };
export const STANDART_TIR = { ad: "Standart tır", en: 2480, yukseklik: 2700, uzunluk: 13600, maksAgirlik: 24000 };
export const MEGA_TIR = { ad: "Mega tır", en: 2480, yukseklik: 3000, uzunluk: 13600, maksAgirlik: 24000 };
export const KONTEYNER_40HC = { ad: "40' HC konteyner", en: 2352, yukseklik: 2698, uzunluk: 12032, maksAgirlik: 26500 };
// Karışık filo senaryoları için
export const FILO_TIR = { ad: "Standart Tır", en: 2500, yukseklik: 2800, uzunluk: 13600, maksAgirlik: 24000, aks: { sasiMesafe: 1000, aksMerkezi: 11800 } };
export const KAMYON = { ad: "10 Ton Kamyon", en: 2450, yukseklik: 2500, uzunluk: 7200, maksAgirlik: 10000 };
// Dengeleme senaryoları için test girdisi (motorda varsayılan değildir)
export const DENGE_AKS = { sasiMesafe: 1690, aksMerkezi: 9400 };

/**
 * Örnek: tarım makineleri. 9 parça, 5.313 kg.
 * kural(kalemId) her kalem için ek alanları döndürür.
 */
export function tarimMakineleri(kural = () => ({})) {
  const temel = [
    { id: "gubre", ad: "Gübre makinesi", en: 1500, yukseklik: 1400, uzunluk: 2750, agirlik: 600, adet: 1, renk: "#F59E0B" },
    { id: "ilac", ad: "İlaçlama makinesi", en: 1600, yukseklik: 1450, uzunluk: 3450, agirlik: 655, adet: 3, renk: "#3ABFF0" },
    { id: "capa", ad: "Çapa makinesi", en: 1100, yukseklik: 1300, uzunluk: 2200, agirlik: 354, adet: 2, renk: "#22C55E" },
    { id: "disk", ad: "Diskaro", en: 2000, yukseklik: 660, uzunluk: 2000, agirlik: 680, adet: 3, renk: "#EF4444" },
  ];
  return temel.map((k) => ({
    referans: "",
    donus: "dik",
    ustuneKonabilir: true,
    yalnizZemin: false,
    ustYukSiniri: null,
    teslimatSirasi: 0,
    ...k,
    ...kural(k.id),
  }));
}

/** İkinci örnek: elektrik panosu sevkiyatı (dik kolonlar, kat panoları, demonte karkas) */
export function panoYuku() {
  return [
    { id: "kolon8", ad: "Dağıtım kolonu 800", en: 800, yukseklik: 2200, uzunluk: 600, agirlik: 420, adet: 6, donus: "dik", ustuneKonabilir: false, renk: "#E50043" },
    { id: "kolon10", ad: "Çekmeceli kolon 1000", en: 1000, yukseklik: 2200, uzunluk: 600, agirlik: 520, adet: 4, donus: "dik", ustuneKonabilir: false, renk: "#0F172A" },
    { id: "kat", ad: "Kat panosu", en: 600, yukseklik: 800, uzunluk: 250, agirlik: 55, adet: 18, donus: "serbest", ustuneKonabilir: true, renk: "#008E4F" },
    { id: "karkas", ad: "Demonte karkas", en: 1200, yukseklik: 300, uzunluk: 800, agirlik: 95, adet: 20, donus: "serbest", ustuneKonabilir: true, renk: "#FF9600" },
  ];
}

/** Tohumlu sözde rastgele sayı: aynı tohum aynı koli listesini verir */
function rastgele(tohum) {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rastgele koliler, her biri tek adet.
 * yeniKurallar=false: yalnız eski motorun da bildiği kurallar (döndürme, üstüne konamaz).
 * yeniKurallar=true: yalnız zemin, üst yük sınırı ve teslimat sırası da eklenir.
 */
export function rastgeleKoliler(adet, tohum, yeniKurallar = false) {
  const r = rastgele(tohum);
  const arasi = (a, b, adim = 10) => a + Math.floor(r() * ((b - a) / adim + 1)) * adim;
  const renkler = ["#3ABFF0", "#F59E0B", "#22C55E", "#EF4444", "#A855F7", "#64748B"];
  const liste = [];
  for (let i = 1; i <= adet; i++) {
    const d = r();
    const k = {
      id: "koli" + i,
      ad: "Koli " + i,
      en: arasi(300, 1200),
      yukseklik: arasi(200, 1000),
      uzunluk: arasi(300, 1200),
      agirlik: arasi(5, 120, 1),
      adet: 1,
      donus: d < 0.7 ? "serbest" : d < 0.9 ? "dik" : "sabit",
      ustuneKonabilir: r() < 0.9,
      yalnizZemin: false,
      ustYukSiniri: null,
      teslimatSirasi: 0,
      renk: renkler[i % renkler.length],
    };
    if (yeniKurallar) {
      k.yalnizZemin = r() < 0.05;
      if (k.ustuneKonabilir && r() < 0.3) k.ustYukSiniri = arasi(100, 400);
      k.teslimatSirasi = Math.floor(r() * 3);
    }
    liste.push(k);
  }
  return liste;
}

/** Çok duraklı küçük sevkiyat: teslimat sırası denetimi için */
export function cokDurakli() {
  const liste = [];
  const durak = [
    { ad: "1. durak", renk: "#3ABFF0" },
    { ad: "2. durak", renk: "#F59E0B" },
    { ad: "3. durak", renk: "#22C55E" },
  ];
  durak.forEach((d, i) => {
    liste.push({ id: "palet" + (i + 1), ad: d.ad + " paleti", en: 1200, yukseklik: 1200, uzunluk: 800, agirlik: 400, adet: 6, donus: "dik", ustuneKonabilir: true, ustYukSiniri: 500, teslimatSirasi: i + 1, renk: d.renk });
    liste.push({ id: "koli" + (i + 1), ad: d.ad + " kolisi", en: 600, yukseklik: 500, uzunluk: 400, agirlik: 30, adet: 10, donus: "serbest", ustuneKonabilir: true, teslimatSirasi: i + 1, renk: d.renk });
  });
  return liste;
}

/** Bütün senaryolar. php: eski motorla aynı kurallarla karşılaştırılabilir mi */
export function senaryolar() {
  const hicIstiflenmez = () => ({ ustuneKonabilir: false, yalnizZemin: true });
  const ilacIstiflenmez = (id) => (id === "ilac" ? { ustuneKonabilir: false, yalnizZemin: true } : {});
  const ilacUstuneKonmaz = (id) => (id === "ilac" ? { ustuneKonabilir: false } : {});
  const megaKurallar = (id) => (id === "ilac" ? { ustuneKonabilir: false, yalnizZemin: true } : { ustYukSiniri: 300 });
  return [
    {
      kod: "a",
      baslik: "Tarım makineleri, hiçbir parça istiflenmiyor",
      php: true,
      girdi: { arac: { ...TIR, aks: { sasiMesafe: 1000, aksMerkezi: 11800 } }, cokluArac: true, kalemler: tarimMakineleri(hicIstiflenmez), secenekler: { destekOrani: 0.7 } },
    },
    {
      kod: "a-pay",
      baslik: "Tarım makineleri, hiçbir parça istiflenmiyor, kapıda 500 mm pay",
      php: false,
      girdi: { arac: { ...TIR, kapiPayiMm: 500 }, cokluArac: true, kalemler: tarimMakineleri(hicIstiflenmez), secenekler: { destekOrani: 0.7 } },
    },
    {
      kod: "b",
      baslik: "Tarım makineleri, yalnız ilaçlamalar istiflenmiyor",
      php: false,
      girdi: { arac: { ...TIR }, cokluArac: true, kalemler: tarimMakineleri(ilacIstiflenmez), secenekler: { destekOrani: 0.7 } },
    },
    {
      kod: "b'",
      baslik: "Tarım makineleri, ilaçlamanın üstüne konmaz (eski motorun kuralı)",
      php: true,
      girdi: { arac: { ...TIR }, cokluArac: true, kalemler: tarimMakineleri(ilacUstuneKonmaz), secenekler: { destekOrani: 0.7 } },
    },
    {
      kod: "c",
      baslik: "Tarım makineleri, mega tır, ilaçlama yalnız zemin, diğerleri üst yük 300 kg",
      php: false,
      girdi: { arac: { ...MEGA_TIR }, cokluArac: true, kalemler: tarimMakineleri(megaKurallar), secenekler: { destekOrani: 0.7 } },
    },
    {
      kod: "c'",
      baslik: "Tarım makineleri, mega tır, ilaçlamanın üstüne konmaz (eski motorun kuralı)",
      php: true,
      girdi: { arac: { ...MEGA_TIR }, cokluArac: true, kalemler: tarimMakineleri(ilacUstuneKonmaz), secenekler: { destekOrani: 0.7 } },
    },
    {
      kod: "d",
      baslik: "Pano yükü, 40' HC konteyner",
      php: true,
      girdi: { arac: { ...KONTEYNER_40HC }, cokluArac: true, kalemler: panoYuku(), secenekler: { destekOrani: 0.7 } },
    },
    {
      kod: "e",
      baslik: "300 rastgele koli, standart tır",
      php: true,
      girdi: { arac: { ...STANDART_TIR }, cokluArac: true, kalemler: rastgeleKoliler(300, 20261105), secenekler: { destekOrani: 0.7 } },
    },
    {
      kod: "e+",
      baslik: "300 rastgele koli, yeni kurallar ve 3 teslimat grubu",
      php: false,
      girdi: { arac: { ...STANDART_TIR }, cokluArac: true, kalemler: rastgeleKoliler(300, 7, true), secenekler: { destekOrani: 0.7 } },
    },
    {
      kod: "f",
      baslik: "Üç duraklı sevkiyat, tek araç",
      php: false,
      girdi: { arac: { ...STANDART_TIR }, cokluArac: false, kalemler: cokDurakli(), secenekler: { destekOrani: 0.7 } },
    },
    {
      kod: "g",
      baslik: "Tarım makineleri, yalnız ilaçlamalar istiflenmiyor, filo tır + kamyon, en uygun seçim",
      php: false,
      girdi: {
        arac: { ...TIR }, // filo verildiği için yok sayılmalı
        filo: [{ ...FILO_TIR }, { ...KAMYON }],
        cokluArac: true,
        kalemler: tarimMakineleri(ilacIstiflenmez),
        secenekler: { destekOrani: 0.7, filoSecimi: "enUygun" },
      },
    },
    {
      kod: "g-sira",
      baslik: "Tarım makineleri, hiçbir parça istiflenmiyor, filo tır + kamyon sırayla, tek seferlik",
      php: false,
      girdi: {
        filo: [{ ...FILO_TIR }, { ...KAMYON }],
        cokluArac: false,
        kalemler: tarimMakineleri(hicIstiflenmez),
        secenekler: { destekOrani: 0.7, filoSecimi: "sirayla" },
      },
    },
    {
      kod: "e-filo",
      baslik: "300 rastgele koli, filo standart tır + kamyon, en uygun seçim",
      php: false,
      girdi: {
        filo: [{ ...STANDART_TIR }, { ...KAMYON }],
        cokluArac: true,
        kalemler: rastgeleKoliler(300, 20261105),
        secenekler: { destekOrani: 0.7, filoSecimi: "enUygun" },
      },
    },
    {
      kod: "h",
      baslik: "Tarım makineleri, filo tır (aks verili) + kamyon, en uygun, dengele açık",
      php: false,
      girdi: {
        filo: [{ ...FILO_TIR, aks: { ...DENGE_AKS } }, { ...KAMYON }],
        cokluArac: true,
        kalemler: tarimMakineleri(ilacIstiflenmez),
        secenekler: { destekOrani: 0.7, filoSecimi: "enUygun", dengele: true },
      },
    },
    {
      kod: "h-tir",
      baslik: "Tarım makineleri, yalnız tır (aks verili), dengele açık: ikinci tırda kısa yük",
      php: false,
      girdi: {
        arac: { ...FILO_TIR, aks: { ...DENGE_AKS } },
        cokluArac: true,
        kalemler: tarimMakineleri(ilacIstiflenmez),
        secenekler: { destekOrani: 0.7, dengele: true },
      },
    },
  ];
}
