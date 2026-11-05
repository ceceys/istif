// Elle düzenlemenin arayüz tarafındaki saf hesapları (tamsayı mm): parça anahtarı, ortak kutu, araç içine kırpma,
// ızgara ve mıknatıs, 90° döndürme, döndürme izni. Motor çağrısı yok; denetim, yaslama ve kalan boşluk motordadır.
// Eksenler sözleşmedeki gibi: x genişlik (0 = sol duvar), y yükseklik, z uzunluk (0 = ön duvar).

/** Yerleşimi araçlar arasında tekil tanıtan anahtar (sıra değişse de aynı kalır) */
export const parcaAnahtari = (y) => `${y.kalemId}|${y.parcaNo}`;

/** Yerleşimden kutu: { x, y, z, xe, ye, ze } */
export function kutu(y) {
  return { x: y.x, y: y.y, z: y.z, xe: y.x + y.en, ye: y.y + y.yukseklik, ze: y.z + y.uzunluk };
}

/** Seçili yerleşimlerin ortak dış kutusu; seçim boşsa null */
export function ortakKutu(yerlesimler, indeksler) {
  let s = null;
  for (const i of indeksler) {
    const y = yerlesimler[i];
    if (!y) continue;
    const k = kutu(y);
    if (!s) s = { ...k };
    else {
      s.x = Math.min(s.x, k.x); s.y = Math.min(s.y, k.y); s.z = Math.min(s.z, k.z);
      s.xe = Math.max(s.xe, k.xe); s.ye = Math.max(s.ye, k.ye); s.ze = Math.max(s.ze, k.ze);
    }
  }
  return s;
}

const kesisir = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

/**
 * Kaydırmayı ortak kutu araçtan çıkmayacak biçimde kırpar (sığan eksenlerde).
 * arac: { en, yukseklik, uzunluk } (uzunluk aracın gerçek iç uzunluğu; kapı payına girmek serbest, motor uyarır)
 */
export function kirp(k, d, arac) {
  const sinirla = (v, enAz, enCok) => (enAz > enCok ? v : Math.min(enCok, Math.max(enAz, v)));
  return {
    x: sinirla(d.x, -k.x, arac.en - k.xe),
    y: sinirla(d.y, -k.y, arac.yukseklik - k.ye),
    z: sinirla(d.z, -k.z, arac.uzunluk - k.ze),
  };
}

/**
 * Sürükleme sonunda oturulacak kaydırma: ızgara adımına yuvarlanır, duvara ve komşu yüzlere yakınsa yapışır,
 * sonra araç içine kırpılır.
 * @param k        sürüklenen grubun başlangıç kutusu
 * @param d        ham kaydırma (mm, ondalıklı olabilir)
 * @param adim     ızgara adımı (mm)
 * @param digerleri sürüklenmeyen parçaların kutuları
 * @param arac     { en, yukseklik, uzunluk, kapiPayiMm }
 * @param eksenler hangi eksenler serbest: { x, y, z } (true/false)
 */
export function oturt(k, d, adim, digerleri, arac, eksenler = { x: true, y: false, z: true }) {
  const izgara = (v) => (adim > 0 ? Math.round(v / adim) * adim : v);
  const esik = Math.max(8, adim * 0.6);
  const sonuc = { x: 0, y: 0, z: 0 };
  const ham = { x: eksenler.x ? d.x : 0, y: eksenler.y ? d.y : 0, z: eksenler.z ? d.z : 0 };
  const kayik = (dd) => ({ x: k.x + dd.x, y: k.y + dd.y, z: k.z + dd.z, xe: k.xe + dd.x, ye: k.ye + dd.y, ze: k.ze + dd.z });
  const yuvarlak = { x: izgara(ham.x), y: izgara(ham.y), z: izgara(ham.z) };
  const g = { x: k.xe - k.x, y: k.ye - k.y, z: k.ze - k.z };
  const kullanilabilir = arac.uzunluk - (arac.kapiPayiMm || 0);
  const ust = { x: arac.en, y: arac.yukseklik, z: kullanilabilir };
  const diger = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] };

  for (const e of ['x', 'y', 'z']) {
    if (!eksenler[e]) continue;
    // Öteki eksenlerde ızgaraya oturmuş konumla komşuluk aranır
    const deneme = kayik({ ...yuvarlak, [e]: ham[e] });
    const hamBas = k[e] + ham[e];
    const adaylar = [0, ust[e] - g[e]];
    for (const b of digerleri) {
      const [a1, a2] = diger[e];
      if (!kesisir(deneme[a1], deneme[a1 + 'e'], b[a1], b[a1 + 'e'])) continue;
      if (!kesisir(deneme[a2], deneme[a2 + 'e'], b[a2], b[a2 + 'e'])) continue;
      // Komşunun karşı yüzü; yükseklikte bu, altındaki parçanın üst yüzü olur
      adaylar.push(b[e + 'e'], b[e] - g[e]);
    }
    let enIyi = null;
    for (const a of adaylar) {
      const fark = Math.abs(hamBas - a);
      if (fark < esik && (enIyi == null || fark < Math.abs(hamBas - enIyi))) enIyi = a;
    }
    sonuc[e] = enIyi != null ? enIyi - k[e] : yuvarlak[e];
  }
  const kirpik = kirp(k, sonuc, arac);
  return { x: Math.round(kirpik.x), y: Math.round(kirpik.y), z: Math.round(kirpik.z) };
}

/** Seçili yerleşimleri d kadar kaydırır (yeni dizi; ötekiler aynı nesne kopyası) */
export function tasi(yerlesimler, indeksler, d) {
  const kume = new Set(indeksler);
  return yerlesimler.map((y, i) => (kume.has(i)
    ? { ...y, x: Math.round(y.x + d.x), y: Math.round(y.y + d.y), z: Math.round(y.z + d.z) }
    : { ...y }));
}

/**
 * 90° döndürme (sağ el kuralı, +90°). eksen: 'y' (R, yatayda döner), 'z' (T, yana yatar), 'x' (Y, öne yatar).
 * Grup ortak kutusunun ortası çevresinde döner; tabanı eski yükseklikte kalır, sonra araç içine kırpılır.
 * Döner: { yerlesimler, pivot0, pivot1 } (pivotlar mm, ortak kutunun döndürmeden önceki ve sonraki ortası)
 */
export function dondur(yerlesimler, indeksler, eksen, arac) {
  const k = ortakKutu(yerlesimler, indeksler);
  if (!k) return { yerlesimler: yerlesimler.map((y) => ({ ...y })), pivot0: null, pivot1: null };
  const C = { x: (k.x + k.xe) / 2, y: (k.y + k.ye) / 2, z: (k.z + k.ze) / 2 };
  const cevir = (v) => {
    if (eksen === 'y') return { x: v.z, y: v.y, z: -v.x };
    if (eksen === 'z') return { x: -v.y, y: v.x, z: v.z };
    return { x: v.x, y: -v.z, z: v.y };
  };
  const kume = new Set(indeksler);
  const yeni = yerlesimler.map((y, i) => {
    if (!kume.has(i)) return { ...y };
    const a = cevir({ x: y.x - C.x, y: y.y - C.y, z: y.z - C.z });
    const b = cevir({ x: y.x + y.en - C.x, y: y.y + y.yukseklik - C.y, z: y.z + y.uzunluk - C.z });
    return {
      ...y,
      x: C.x + Math.min(a.x, b.x),
      y: C.y + Math.min(a.y, b.y),
      z: C.z + Math.min(a.z, b.z),
      en: Math.abs(b.x - a.x),
      yukseklik: Math.abs(b.y - a.y),
      uzunluk: Math.abs(b.z - a.z),
    };
  });
  // Grubun yeni köşesi tamsayıya, tabanı eski yüksekliğe alınır; bütün grup aynı kaydırmayı görür
  const k2 = ortakKutu(yeni, indeksler);
  const d = {
    x: Math.round(k2.x) - k2.x,
    y: k.y - k2.y,
    z: Math.round(k2.z) - k2.z,
  };
  const k3 = { x: k2.x + d.x, y: k2.y + d.y, z: k2.z + d.z, xe: k2.xe + d.x, ye: k2.ye + d.y, ze: k2.ze + d.z };
  const ic = kirp(k3, { x: 0, y: 0, z: 0 }, arac);
  const top = { x: d.x + ic.x, y: d.y + ic.y, z: d.z + ic.z };
  for (const i of indeksler) {
    const y = yeni[i];
    y.x = Math.round(y.x + top.x);
    y.y = Math.round(y.y + top.y);
    y.z = Math.round(y.z + top.z);
    y.en = Math.round(y.en);
    y.yukseklik = Math.round(y.yukseklik);
    y.uzunluk = Math.round(y.uzunluk);
  }
  const k4 = ortakKutu(yeni, indeksler);
  return {
    yerlesimler: yeni,
    pivot0: C,
    pivot1: { x: (k4.x + k4.xe) / 2, y: (k4.y + k4.ye) / 2, z: (k4.z + k4.ze) / 2 },
  };
}

/** Tuşa karşılık gelen döndürme ekseni: R yatayda (y), T yana (z), Y öne (x) */
export const DONDURME_EKSENI = { R: 'y', T: 'z', Y: 'x' };

/**
 * Seçimdeki kalemlerin döndürme kuralına göre izin.
 * kalemler: seçili parçaların kalemleri ({ ad, donus }); eksen 'y' | 'z' | 'x'.
 * Döner: { izin, sebep: null | 'secimYok' | 'sabit' | 'dik', ad }
 */
export function dondurmeIzni(kalemler, eksen) {
  if (!kalemler.length) return { izin: false, sebep: 'secimYok', ad: '' };
  const sabit = kalemler.find((k) => k.donus === 'sabit');
  if (sabit) return { izin: false, sebep: 'sabit', ad: sabit.ad };
  if (eksen !== 'y') {
    const dik = kalemler.find((k) => k.donus === 'dik');
    if (dik) return { izin: false, sebep: 'dik', ad: dik.ad };
  }
  return { izin: true, sebep: null, ad: '' };
}

/** İki ölçü üçlüsü arasındaki 90° dönüş ekseni (tek eksende çeyrek tur değilse null) */
export function donusEkseni(a, b) {
  if (a.en === b.en && a.yukseklik === b.yukseklik && a.uzunluk === b.uzunluk) return null;
  if (a.yukseklik === b.yukseklik && a.en === b.uzunluk && a.uzunluk === b.en) return 'y';
  if (a.uzunluk === b.uzunluk && a.en === b.yukseklik && a.yukseklik === b.en) return 'z';
  if (a.en === b.en && a.yukseklik === b.uzunluk && a.uzunluk === b.yukseklik) return 'x';
  return null;
}
