// İstif motor testleri. Çalıştırma: node testler/motor.test.mjs
// Her sonuç, motorun iç koduna dayanmayan bağımsız bir denetleyiciyle sınanır.

import { planla, MotorHatasi, PARCA_SINIRI, denetle as motorDenetle, kalanBosluk, yaslan, ustundekiler } from "../Istif/web/js/motor/motor.js";
import { senaryolar, rastgeleKoliler, cokDurakli, STANDART_TIR } from "./senaryolar.mjs";

let basarili = 0;
let basarisiz = 0;
const notlar = [];

function dogrula(kosul, mesaj) {
  if (kosul) basarili++;
  else {
    basarisiz++;
    console.log("  HATA: " + mesaj);
  }
}

// ---------------------------------------------------------------------------
// Bağımsız denetleyici
// ---------------------------------------------------------------------------

function kesisir(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

/** Sonucu girdiye göre baştan sona denetler; bulunan hataları döndürür */
function denetle(girdi, sonuc) {
  const hatalar = [];
  const oran = girdi.secenekler?.destekOrani ?? 0.7;
  // Filo verilmişse araç tipleri filodan, yoksa tek araçtan gelir
  const filoVar = Array.isArray(girdi.filo) && girdi.filo.length > 0;
  const tipler = filoVar ? girdi.filo : [girdi.arac];
  const tipBul = (a) =>
    tipler.find(
      (t) =>
        (t.ad ?? "") === a.ad && t.en === a.en && t.yukseklik === a.yukseklik && t.uzunluk === a.uzunluk &&
        (t.maksAgirlik ?? 0) === a.maksAgirlik && (t.kapiPayiMm ?? 0) === a.kapiPayiMm
    );
  const kalemler = new Map();
  let toplamParca = 0;
  girdi.kalemler.forEach((k, i) => {
    kalemler.set(String(k.id ?? "k" + (i + 1)), k);
    toplamParca += k.adet ?? 1;
  });
  const gorulenParca = new Set();
  let yerlesen = 0;
  let toplamAgirlik = 0;

  const aracUstSiniri = girdi.cokluArac === false ? tipler.length : Infinity;
  if (sonuc.araclar.length > aracUstSiniri) hatalar.push(`En fazla ${aracUstSiniri} araç kullanılabilirdi, ${sonuc.araclar.length} açıldı.`);
  if (typeof sonuc.ozet.sureSiniri !== "boolean") hatalar.push("Özet: sureSiniri alanı yok.");

  for (const a of sonuc.araclar) {
    const ad = `Araç ${a.no}`;
    // Araç girdideki tiplerden biri olmalı; denetim o tipin sınırlarıyla yapılır
    const A = tipBul(a);
    if (!A) {
      hatalar.push(`${ad}: girdide olmayan bir araç tipi (${a.ad}).`);
      continue;
    }
    const pay = A.kapiPayiMm ?? 0;
    const kullanilabilir = A.uzunluk - pay;
    const aksBeklenen = A.aks ? JSON.stringify({ sasiMesafe: A.aks.sasiMesafe, aksMerkezi: A.aks.aksMerkezi }) : "null";
    if (JSON.stringify(a.aks ?? null) !== aksBeklenen) hatalar.push(`${ad}: aks alanı yanlış.`);
    const Y = a.yerlesimler.map((y) => ({
      ...y,
      xe: y.x + y.en,
      ye: y.y + y.yukseklik,
      ze: y.z + y.uzunluk,
      k: kalemler.get(y.kalemId),
    }));
    const n = Y.length;
    yerlesen += n;

    // Parça kimliği, sınırlar, dönüş, yalnız zemin
    for (const y of Y) {
      const anahtar = y.kalemId + "#" + y.parcaNo;
      if (gorulenParca.has(anahtar)) hatalar.push(`${ad}: ${y.ad} iki kez yerleşmiş.`);
      gorulenParca.add(anahtar);
      if (!y.k) {
        hatalar.push(`${ad}: ${y.ad} bilinmeyen kalem.`);
        continue;
      }
      for (const alan of ["x", "y", "z", "en", "yukseklik", "uzunluk"]) {
        if (!Number.isInteger(y[alan])) hatalar.push(`${ad}: ${y.ad} ${alan} tamsayı değil.`);
      }
      if (y.x < 0 || y.y < 0 || y.z < 0 || y.xe > A.en || y.ye > A.yukseklik || y.ze > kullanilabilir) {
        hatalar.push(`${ad}: ${y.ad} araç sınırını ya da kapı payını aşıyor.`);
      }
      const k = y.k;
      const donus = k.donus ?? "serbest";
      const asil = [k.en, k.yukseklik, k.uzunluk];
      const yer = [y.en, y.yukseklik, y.uzunluk];
      let izinli;
      if (donus === "sabit") izinli = yer.every((v, i) => v === asil[i]);
      else if (donus === "dik") {
        izinli =
          y.yukseklik === k.yukseklik &&
          ((y.en === k.en && y.uzunluk === k.uzunluk) || (y.en === k.uzunluk && y.uzunluk === k.en));
      } else izinli = [...yer].sort((p, q) => p - q).join() === [...asil].sort((p, q) => p - q).join();
      if (!izinli) hatalar.push(`${ad}: ${y.ad} izin verilmeyen yönde.`);
      const dondu = !(y.en === k.en && y.yukseklik === k.yukseklik && y.uzunluk === k.uzunluk);
      if (dondu !== y.donduruldu) hatalar.push(`${ad}: ${y.ad} donduruldu alanı yanlış.`);
      if (y.ustte !== y.y > 0) hatalar.push(`${ad}: ${y.ad} ustte alanı yanlış.`);
      if (k.yalnizZemin && y.y !== 0) hatalar.push(`${ad}: ${y.ad} yalnız zemine konmalıydı.`);
      if (y.agirlik !== (k.agirlik ?? 0)) hatalar.push(`${ad}: ${y.ad} ağırlığı yanlış.`);
    }

    // Çakışma
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const p = Y[i], q = Y[j];
        if (kesisir(p.x, p.xe, q.x, q.xe) && kesisir(p.y, p.ye, q.y, q.ye) && kesisir(p.z, p.ze, q.z, q.ze)) {
          hatalar.push(`${ad}: ${p.ad} ile ${q.ad} çakışıyor.`);
        }
      }
    }

    // Destek
    for (const p of Y) {
      if (p.y === 0) continue;
      let destek = 0;
      for (const q of Y) {
        if (q === p || q.ye !== p.y) continue;
        const dx = Math.min(p.xe, q.xe) - Math.max(p.x, q.x);
        const dz = Math.min(p.ze, q.ze) - Math.max(p.z, q.z);
        if (dx > 0 && dz > 0) destek += dx * dz;
      }
      const taban = p.en * p.uzunluk;
      if (destek <= 0 || destek < oran * taban - 1e-6) {
        hatalar.push(`${ad}: ${p.ad} desteği yetersiz (%${((destek / taban) * 100).toFixed(1)}).`);
      }
    }

    // Üst ilişkisi: q, p'nin üstündeyse (izdüşüm kesişir, q.y >= p.ye). Kapanış alınır.
    const ust = [];
    for (let i = 0; i < n; i++) {
      ust.push([]);
      for (let j = 0; j < n; j++) {
        const p = Y[i], q = Y[j];
        if (i !== j && q.y >= p.ye && kesisir(p.x, p.xe, q.x, q.xe) && kesisir(p.z, p.ze, q.z, q.ze)) ust[i].push(j);
      }
    }
    const ustKapanis = (i) => {
      const gor = new Set();
      const yigin = [...ust[i]];
      while (yigin.length) {
        const j = yigin.pop();
        if (gor.has(j)) continue;
        gor.add(j);
        yigin.push(...ust[j]);
      }
      return gor;
    };
    const kapanislar = Y.map((_, i) => ustKapanis(i));

    for (let i = 0; i < n; i++) {
      const p = Y[i];
      if (!p.k) continue;
      const kume = kapanislar[i];
      if (p.k.ustuneKonabilir === false && kume.size > 0) hatalar.push(`${ad}: ${p.ad} üstüne konamaz, üstünde parça var.`);
      if (p.k.ustuneKonabilir !== false && p.k.ustYukSiniri !== null && p.k.ustYukSiniri !== undefined) {
        let yuk = 0;
        for (const j of kume) yuk += Y[j].agirlik;
        if (yuk > p.k.ustYukSiniri + 1e-9) hatalar.push(`${ad}: ${p.ad} üst yük sınırı aşıldı (${yuk} > ${p.k.ustYukSiniri}).`);
      }
    }

    // Tonaj
    const agirlik = Y.reduce((t, y) => t + y.agirlik, 0);
    toplamAgirlik += agirlik;
    if (A.maksAgirlik > 0 && agirlik > A.maksAgirlik + 1e-9) hatalar.push(`${ad}: tonaj aşıldı.`);
    if (Math.abs(agirlik - a.toplamAgirlik) > 0.01) hatalar.push(`${ad}: toplam ağırlık yanlış.`);

    // Teslimat sırası: küçük numara önce boşaltılır
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p = Y[i], q = Y[j];
        if (i === j || !p.k || !q.k) continue;
        const gp = p.k.teslimatSirasi ?? 0, gq = q.k.teslimatSirasi ?? 0;
        if (gp >= gq) continue; // p önce boşaltılır, q sonra
        if (kesisir(p.x, p.xe, q.x, q.xe) && kesisir(p.y, p.ye, q.y, q.ye) && q.z >= p.ze) {
          hatalar.push(`${ad}: ${q.ad}, önce boşaltılacak ${p.ad} parçasının kapı yolunda.`);
        }
        if (kapanislar[i].has(j)) hatalar.push(`${ad}: ${q.ad}, önce boşaltılacak ${p.ad} parçasının üstünde.`);
      }
    }

    // Yükleme sırası
    const siralar = Y.map((y) => y.sira).sort((p, q) => p - q);
    if (!siralar.every((s, i) => s === i + 1)) hatalar.push(`${ad}: sıra 1..${n} değil.`);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const p = Y[i], q = Y[j];
        // p, q'nun altındaysa önce yüklenir
        if (ust[i].includes(j) && p.sira > q.sira) hatalar.push(`${ad}: ${q.ad}, altındaki ${p.ad} parçasından önce yükleniyor.`);
        // q, p'nin kapı yolundaysa p önce yüklenir
        if (kesisir(p.x, p.xe, q.x, q.xe) && kesisir(p.y, p.ye, q.y, q.ye) && q.z >= p.ze && p.sira > q.sira) {
          hatalar.push(`${ad}: ${q.ad} önce yüklenirse ${p.ad} yerine geçemez.`);
        }
      }
    }

    // Özet alanları
    const kullanilan = Y.reduce((m, y) => Math.max(m, y.ze), 0);
    if (kullanilan !== a.kullanilanUzunluk) hatalar.push(`${ad}: kullanılan uzunluk ${a.kullanilanUzunluk}, olması gereken ${kullanilan}.`);
    const hacim = Y.reduce((t, y) => t + y.en * y.yukseklik * y.uzunluk, 0);
    const doluluk = (hacim / (A.en * A.yukseklik * A.uzunluk)) * 100;
    if (Math.abs(doluluk - a.hacimDoluluk) > 0.051) hatalar.push(`${ad}: doluluk yanlış.`);
    if (agirlik > 0) {
      const m = { x: 0, y: 0, z: 0 };
      for (const y of Y) {
        m.x += (y.x + y.en / 2) * y.agirlik;
        m.y += (y.y + y.yukseklik / 2) * y.agirlik;
        m.z += (y.z + y.uzunluk / 2) * y.agirlik;
      }
      for (const e of ["x", "y", "z"]) {
        if (Math.abs(m[e] / agirlik - a.agirlikMerkezi[e]) > 1) hatalar.push(`${ad}: ağırlık merkezi ${e} yanlış.`);
      }
      if (A.aks) {
        const s = A.aks.sasiMesafe, ak = A.aks.aksMerkezi;
        const aks = (agirlik * (m.z / agirlik - s)) / (ak - s);
        if (!a.aksYukleri || Math.abs(a.aksYukleri.aks - aks) > 2 || Math.abs(a.aksYukleri.sasi - (agirlik - aks)) > 2) {
          hatalar.push(`${ad}: aks yükü yanlış.`);
        }
        // Aks payı eksiyse (ağırlık merkezi şasi kilidinin önünde) uyarı olmalı, değilse olmamalı
        const onUyari = a.uyarilar.some((u) => u.startsWith("Ağırlık merkezi şasi kilidinin önünde"));
        if ((aks < -0.5) !== onUyari) hatalar.push(`${ad}: şasi kilidi önü uyarısı ${onUyari ? "fazla" : "eksik"}.`);
      } else if (a.aksYukleri !== null) hatalar.push(`${ad}: aks bilgisi yokken aks yükü hesaplanmış.`);
    }

    // Boyuna dengeleme: yük bütünüyle geriye kaydırılır, göreli düzen aynı kalır
    const dengele = girdi.secenekler?.dengele === true;
    const d = a.kaydirmaMm;
    const kaydirmaUyarisi = a.uyarilar.some((u) => u.includes("geriye alındı; arkasını kayışla sabitleyin."));
    if (!Number.isInteger(d) || d < 0) hatalar.push(`${ad}: kaydirmaMm geçersiz.`);
    else if (!dengele) {
      if (d !== 0) hatalar.push(`${ad}: dengele kapalıyken kaydırma yapılmış.`);
      if (kaydirmaUyarisi) hatalar.push(`${ad}: dengele kapalıyken kaydırma uyarısı var.`);
    } else {
      // Kaydırmadan önce yük ön duvardan başlar: en öndeki parça tam kaydırma kadar geride olmalı
      const enOn = n ? Math.min(...Y.map((y) => y.z)) : 0;
      if (enOn !== d) hatalar.push(`${ad}: en öndeki parça ${enOn} mm'de, kaydırma ${d} mm.`);
      if (agirlik > 0) {
        const zOnce = Y.reduce((t, y) => t + (y.z + y.uzunluk / 2) * y.agirlik, 0) / agirlik - d;
        const hedef = A.aks ? (A.aks.sasiMesafe + A.aks.aksMerkezi) / 2 : kullanilabilir / 2;
        const beklenen = Math.max(0, Math.min(kullanilabilir - (kullanilan - d), Math.round(hedef - zOnce)));
        if (Math.abs(beklenen - d) > 1) hatalar.push(`${ad}: kaydırma ${d} mm, beklenen ${beklenen} mm.`);
      }
      const metin = (d / 1000).toFixed(2).replace(".", ",");
      if (d > 0 && !a.uyarilar.some((u) => u.includes(`${metin} m geriye alındı`))) hatalar.push(`${ad}: kaydırma uyarısı eksik.`);
      if (d === 0 && kaydirmaUyarisi) hatalar.push(`${ad}: kaydırma yokken uyarı var.`);
    }
  }

  // Her parça ya yerleşmiş ya da sığmayanlarda olmalı
  for (const s of sonuc.sigmayanlar) {
    if (!["olcu", "agirlik", "kural", "sinir"].includes(s.sebep)) hatalar.push(`Sığmayan ${s.ad}: sebep geçersiz.`);
  }
  if (yerlesen + sonuc.sigmayanlar.length !== toplamParca) {
    hatalar.push(`Parça sayısı tutmuyor: ${yerlesen} yerleşen + ${sonuc.sigmayanlar.length} sığmayan ≠ ${toplamParca}.`);
  }
  if (sonuc.ozet.toplamParca !== toplamParca) hatalar.push("Özet: toplam parça yanlış.");
  if (sonuc.ozet.yerlesen !== yerlesen) hatalar.push("Özet: yerleşen yanlış.");
  if (sonuc.ozet.aracSayisi !== sonuc.araclar.length) hatalar.push("Özet: araç sayısı yanlış.");
  if (Math.abs(sonuc.ozet.toplamAgirlik - toplamAgirlik) > 0.01) hatalar.push("Özet: toplam ağırlık yanlış.");
  return hatalar;
}

// ---------------------------------------------------------------------------
// Eski PHP motorunun aynı girdilerle verdiği sonuçlar (05.11.2026 ölçümü).
// Eski motor yalnız döndürme ve "üstüne konamaz" kurallarını bilir.
// (e) için eski motorun 220 parça sınırı aşılarak 300 parçanın tamamı verildi.
// ---------------------------------------------------------------------------
const ESKI_MOTOR = {
  a: { arac: 2, sigmayan: 0, boylar: [13100, 8200], doluluk: [31.3, 14.9], ms: 12 },
  "b'": { arac: 2, sigmayan: 0, boylar: [10950, 6900], doluluk: [29.4, 16.8], ms: 12 },
  "c'": { arac: 1, sigmayan: 0, boylar: [11850], doluluk: [43.5], ms: 14 },
  d: { arac: 1, sigmayan: 0, boylar: [7550], doluluk: [25.6], ms: 1715 },
  e: { arac: 3, sigmayan: 0, boylar: [13600, 13590, 1900], doluluk: [60.4, 52.0, 2.9], ms: 14004 },
};

/** (sığmayan, araç sayısı, son aracın boyu) sırasıyla: a, b'den kötü değilse true */
function kotuDegil(js, php) {
  if (js.sigmayan !== php.sigmayan) return js.sigmayan < php.sigmayan;
  if (js.arac !== php.arac) return js.arac < php.arac;
  return js.boylar[js.boylar.length - 1] <= php.boylar[php.boylar.length - 1];
}

function ozetle(sonuc) {
  return {
    arac: sonuc.araclar.length,
    sigmayan: sonuc.sigmayanlar.length,
    boylar: sonuc.araclar.map((a) => a.kullanilanUzunluk),
    doluluk: sonuc.araclar.map((a) => a.hacimDoluluk),
    ms: sonuc.ozet.sureMs,
  };
}

// ---------------------------------------------------------------------------
// Senaryolar
// ---------------------------------------------------------------------------

const tablo = [];
const sonuclar = {};

console.log("İstif motor testleri\n");
for (const s of senaryolar()) {
  console.log(`(${s.kod}) ${s.baslik}`);
  const sonuc = planla(s.girdi);
  sonuclar[s.kod] = sonuc;
  const hatalar = denetle(s.girdi, sonuc);
  dogrula(hatalar.length === 0, `denetim: ${hatalar.slice(0, 5).join(" | ")}${hatalar.length > 5 ? ` (+${hatalar.length - 5})` : ""}`);
  const js = ozetle(sonuc);
  console.log(
    `  ${js.arac} araç, boylar ${js.boylar.join(" / ")} mm, doluluk %${js.doluluk.join(" / %")}, ${js.ms} ms, sığmayan ${js.sigmayan}`
  );
  for (const a of sonuc.araclar) if (a.uyarilar.length) console.log(`  Araç ${a.no} uyarı: ${a.uyarilar.join(" ")}`);

  dogrula(sonuc.ozet.sureSiniri === false, "güvenlik süresine takılmamalıydı");
  dogrula(js.ms < 4000, `süre 4 sn'yi aştı: ${js.ms} ms`);

  const phpKod = s.php ? s.kod : ESKI_MOTOR[s.kod + "'"] ? s.kod + "'" : null;
  const php = phpKod ? ESKI_MOTOR[phpKod] : null;
  if (s.php) dogrula(kotuDegil(js, php), `eski motordan kötü: JS ${JSON.stringify(js)} PHP ${JSON.stringify(php)}`);
  tablo.push({ kod: s.kod, js, php, ayniKural: !!s.php, phpKod });

  // Senaryoya özgü beklentiler
  if (s.kod === "a") {
    // İstif yokken taban boylarının toplamı sabit (21.300 mm). Çapa enine
    // çevrilince en iyi bölüşüm 13.450 / 7.850 mm olur (amaç: son araç en kısa).
    dogrula(js.arac === 2, "(a) 2 araç bekleniyordu");
    dogrula(js.boylar[1] <= 7850, "(a) ikinci araç 7.850 mm'den uzun");
    dogrula(sonuc.araclar.every((a) => a.aksYukleri !== null), "(a) aks bilgisi verildiği hâlde aks yükü yok");
  }
  if (s.kod === "a-pay") {
    // Kapıda 500 mm pay: kullanılabilir boy 13.100 mm, en iyi bölüşüm 13.100 / 8.200 mm
    dogrula(js.arac === 2, "(a-pay) 2 araç bekleniyordu");
    dogrula(js.boylar.every((b) => b <= 13100), "(a-pay) kapı payı aşıldı");
    dogrula(js.boylar[1] <= 8200, "(a-pay) ikinci araç 8.200 mm'den uzun");
    dogrula(sonuc.araclar.every((a) => a.uzunluk === 13600 && a.kapiPayiMm === 500), "(a-pay) araç uzunluğu ve kapı payı alanı yanlış");
  }
  if (s.kod === "b") {
    dogrula(js.arac === 2, "(b) 2 araç bekleniyordu");
    dogrula(js.boylar[1] <= 2200, "(b) son araç 2.200 mm'den uzun");
  }
  if (s.kod === "c") {
    // Bütün parçalar 300 kg'dan ağır: üst yük sınırı yüzünden hiçbir şey istiflenemez
    dogrula(sonuc.araclar.every((a) => a.yerlesimler.every((y) => y.y === 0)), "(c) istif olmamalıydı");
    dogrula(js.arac === 2, "(c) 2 araç bekleniyordu");
  }
  if (s.kod === "c'") dogrula(js.arac === 1, "(c') tek araç bekleniyordu");
  if (s.kod === "d") dogrula(js.arac === 1 && js.sigmayan === 0, "(d) tek konteynere sığmalıydı");
  if (s.kod === "f") dogrula(js.arac === 1 && js.sigmayan === 0, "(f) hepsi tek araca sığmalıydı");
  // Karışık filo
  const adlar = sonuc.araclar.map((a) => a.ad);
  if (s.kod === "g") {
    // Tır dolunca kalan 2 çapa + 1 diskaro kamyona sığar: ikinci araç kamyon olmalı
    dogrula(js.arac === 2 && js.sigmayan === 0, "(g) 2 araç, sığmayansız bekleniyordu");
    dogrula(adlar[0] === "Standart Tır" && adlar[1] === "10 Ton Kamyon", `(g) araçlar tır + kamyon olmalıydı: ${adlar.join(", ")}`);
    dogrula(sonuc.araclar[0].aksYukleri !== null && sonuc.araclar[1].aksYukleri === null, "(g) aks yükü yalnız aks bilgisi olan tırda olmalı");
    for (const a of sonuc.araclar) {
      notlar.push(
        `(g) Araç ${a.no} ${a.ad} (${a.uzunluk}×${a.en}×${a.yukseklik}, ${a.maksAgirlik} kg): ` +
          `${a.yerlesimler.length} parça, ${a.toplamAgirlik} kg, kullanılan ${a.kullanilanUzunluk} mm, doluluk %${a.hacimDoluluk}; ` +
          a.yerlesimler.map((y) => y.ad + (y.ustte ? " (üstte)" : "")).join(", ")
      );
    }
  }
  if (s.kod === "g-sira") {
    dogrula(adlar.length === 2 && adlar[0] === "Standart Tır" && adlar[1] === "10 Ton Kamyon", `(g-sira) araçlar sırayla tır + kamyon olmalıydı: ${adlar.join(", ")}`);
    dogrula(js.sigmayan >= 1 && sonuc.sigmayanlar.every((x) => x.sebep === "sinir"), "(g-sira) kalan parçalar 'sinir' ile dönmeliydi");
    notlar.push(`(g-sira) Sığmayan: ${sonuc.sigmayanlar.map((x) => `${x.ad} (${x.sebep})`).join(", ")}`);
  }
  if (s.kod === "e-filo") {
    dogrula(js.sigmayan === 0 && adlar[0] === "Standart tır", "(e-filo) hepsi yerleşmeli, ilk araç tır olmalı");
    notlar.push(`(e-filo) Araçlar: ${sonuc.araclar.map((a) => `${a.ad} ${a.kullanilanUzunluk} mm`).join(" + ")}`);
  }
  // Boyuna dengeleme
  if (s.kod === "h" || s.kod === "h-tir") {
    // Aynı girdi dengesiz çalıştırılır: kaydırma dışında her şey aynı olmalı
    const ham = planla({ ...s.girdi, secenekler: { ...s.girdi.secenekler, dengele: false } });
    dogrula(ham.araclar.length === sonuc.araclar.length, `(${s.kod}) dengele araç sayısını değiştirmemeli`);
    sonuc.araclar.forEach((a, i) => {
      const h = ham.araclar[i];
      const d = a.kaydirmaMm;
      const ayniDuzen =
        h &&
        h.yerlesimler.length === a.yerlesimler.length &&
        a.yerlesimler.every((y, k) => {
          const q = h.yerlesimler[k];
          return y.sira === q.sira && y.kalemId === q.kalemId && y.parcaNo === q.parcaNo && y.x === q.x && y.y === q.y && y.z === q.z + d;
        });
      dogrula(ayniDuzen, `(${s.kod}) Araç ${a.no}: kaydırma göreli düzeni ya da sırayı bozdu`);
      dogrula(h && a.kullanilanUzunluk === h.kullanilanUzunluk + d, `(${s.kod}) Araç ${a.no}: kullanılan uzunluk kaydırmayla uyumsuz`);
      const kullanilabilir = a.uzunluk - a.kapiPayiMm;
      dogrula(a.kullanilanUzunluk <= kullanilabilir, `(${s.kod}) Araç ${a.no}: kaydırma sınırı aştı`);
      const once = h && h.aksYukleri ? `şasi ${h.aksYukleri.sasi} / aks ${h.aksYukleri.aks} kg` : "aks bilgisi yok";
      const sonra = a.aksYukleri ? `şasi ${a.aksYukleri.sasi} / aks ${a.aksYukleri.aks} kg` : "aks bilgisi yok";
      notlar.push(
        `(${s.kod}) Araç ${a.no} ${a.ad}: kaydırma ${d} mm, kullanılan ${h ? h.kullanilanUzunluk : "?"} → ${a.kullanilanUzunluk} mm, ` +
          `AM z ${h ? h.agirlikMerkezi.z : "?"} → ${a.agirlikMerkezi.z} mm; ${once} → ${sonra}`
      );
    });
    if (s.kod === "h") {
      dogrula(adlar[0] === "Standart Tır" && adlar[1] === "10 Ton Kamyon", `(h) araçlar tır + kamyon olmalıydı: ${adlar.join(", ")}`);
      const k = sonuc.araclar[1];
      // Kamyonda aks bilgisi yok: ağırlık merkezi kullanılabilir uzunluğun ortasına gelir
      dogrula(k && k.kaydirmaMm > 0 && Math.abs(k.agirlikMerkezi.z - (k.uzunluk - k.kapiPayiMm) / 2) <= 1, "(h) kamyonda yük ortaya alınmalıydı");
    }
    if (s.kod === "h-tir") {
      const a2 = sonuc.araclar[1];
      // Kısa yük ikinci tırda: ağırlık merkezi şasi ile aks grubunun ortasına gelir, paylar eşitlenir
      dogrula(a2 && a2.kaydirmaMm > 0 && Math.abs(a2.agirlikMerkezi.z - (1690 + 9400) / 2) <= 1, "(h-tir) ikinci tırda ağırlık merkezi aks aralığının ortasına gelmeliydi");
      dogrula(a2 && a2.aksYukleri && Math.abs(a2.aksYukleri.sasi - a2.aksYukleri.aks) <= 2, "(h-tir) ikinci tırda şasi ve aks payları eşit olmalıydı");
      // Dengelemesiz: aks payı eksi, seçeneği öneren uyarı çıkar. Dengeli: uyarı yok.
      const oneri = "Ağırlık merkezi şasi kilidinin önünde; yükü geriye almak için 'Kısa yükü ortala' seçeneğini açın.";
      const h2 = ham.araclar[1];
      dogrula(h2 && h2.aksYukleri.aks < 0 && h2.uyarilar.includes(oneri), "(h-tir) dengelemesiz ikinci tırda şasi kilidi önü uyarısı bekleniyordu");
      dogrula(a2 && a2.uyarilar.every((u) => !u.includes("şasi kilidinin önünde")), "(h-tir) dengeli ikinci tırda şasi kilidi önü uyarısı olmamalıydı");
      notlar.push(`(h-tir) Dengelemesiz Araç 2 uyarıları: ${h2 ? h2.uyarilar.join(" | ") : "-"}`);
    }
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Tekrarlanabilirlik: aynı girdi üç kez, sonuç birebir aynı (süre alanı hariç)
// ---------------------------------------------------------------------------

console.log("Tekrarlanabilirlik");
const karsilastirilabilir = (r) => JSON.stringify({ ...r, ozet: { ...r.ozet, sureMs: 0 } });
const tekrarSureleri = {};
for (const s of senaryolar()) {
  const ilk = karsilastirilabilir(sonuclar[s.kod]);
  const sureler = [sonuclar[s.kod].ozet.sureMs];
  let ayni = true;
  for (let i = 0; i < 2; i++) {
    const r = planla(s.girdi);
    sureler.push(r.ozet.sureMs);
    if (karsilastirilabilir(r) !== ilk) ayni = false;
  }
  tekrarSureleri[s.kod] = sureler;
  dogrula(ayni, `(${s.kod}) üç çalıştırmada sonuç farklı`);
  console.log(`  (${s.kod}) üç çalıştırma ${ayni ? "birebir aynı" : "FARKLI"}, süreler ${sureler.join(" / ")} ms`);
}
console.log("");

// ---------------------------------------------------------------------------
// Sınır durumları
// ---------------------------------------------------------------------------

console.log("Sınır durumları");
const kutuArac = (en, yuk, uz, kg = 0) => ({ ad: "Deneme", en, yukseklik: yuk, uzunluk: uz, maksAgirlik: kg });
const hizli = { destekOrani: 0.7 };

{
  // Güvenlik süresi çok kısa verilirse sonuç yine geçerli, ama işaretli döner
  const g = { arac: { ...STANDART_TIR }, cokluArac: true, kalemler: rastgeleKoliler(300, 20261105), secenekler: { sureButcesiMs: 20, destekOrani: 0.7 } };
  const r = planla(g);
  dogrula(r.ozet.sureSiniri === true, "20 ms güvenlik süresinde sureSiniri true olmalıydı");
  dogrula(denetle(g, r).length === 0, "süre sınırına takılan sonuç da geçerli olmalı");
}
{
  // Kapı payı araç uzunluğundan kısa olmalı
  let hata = null;
  try {
    planla({ arac: { ...kutuArac(2000, 2000, 5000), kapiPayiMm: 5000 }, kalemler: [] });
  } catch (h) {
    hata = h;
  }
  dogrula(hata instanceof MotorHatasi, "uzunluğa eşit kapı payı MotorHatasi vermeliydi");
}
{
  // Dengeleme teslimat sıralı yükte de geçerli: göreli düzen bozulmaz
  const g = { arac: { ...STANDART_TIR }, cokluArac: false, kalemler: cokDurakli(), secenekler: { destekOrani: 0.7, dengele: true } };
  const r = planla(g);
  dogrula(r.araclar[0].kaydirmaMm > 0 && denetle(g, r).length === 0, "teslimat sıralı yük dengelenmeli ve kurallara uymalıydı");
}
{
  // Dolu araçta kaydırma payı yok
  const g = {
    arac: { ...kutuArac(2000, 1000, 3000), aks: { sasiMesafe: 100, aksMerkezi: 2900 } },
    cokluArac: false,
    kalemler: [{ id: "blok", ad: "Blok", en: 2000, yukseklik: 1000, uzunluk: 1000, agirlik: 100, adet: 3, donus: "sabit" }],
    secenekler: { destekOrani: 0.7, dengele: true },
  };
  const r = planla(g);
  dogrula(r.araclar[0].kaydirmaMm === 0 && r.araclar[0].uyarilar.every((u) => !u.includes("geriye alındı")), "dolu araçta kaydırma 0 olmalıydı");
}
{
  // Filodaki hatalı araç, sırasıyla birlikte bildirilir
  let hata = null;
  try {
    planla({ filo: [kutuArac(2000, 2000, 5000), { ad: "Bozuk", en: 0, yukseklik: 2000, uzunluk: 3000 }], kalemler: [] });
  } catch (h) {
    hata = h;
  }
  dogrula(hata instanceof MotorHatasi && /Filodaki 2\. araç/.test(hata.message), "hatalı filo aracı sırasıyla bildirilmeliydi");
}
{
  // Boş filo verilirse tek araç bilgisiyle çalışır
  const g = {
    arac: kutuArac(2000, 2000, 5000),
    filo: [],
    cokluArac: true,
    kalemler: [{ id: "k", ad: "Koli", en: 500, yukseklik: 500, uzunluk: 500, agirlik: 10, adet: 4 }],
    secenekler: hizli,
  };
  const r = planla(g);
  dogrula(r.araclar.length === 1 && r.araclar[0].ad === "Deneme" && denetle(g, r).length === 0, "boş filo tek araçla çalışmalıydı");
}
{
  // Kamyona sığmayan uzun parça: sırayla filoda kamyon atlanır, sonraki tır açılır
  const g = {
    filo: [kutuArac(2400, 2600, 13600), { ...kutuArac(2400, 2400, 7000), ad: "Kamyon" }, kutuArac(2400, 2600, 13600)],
    cokluArac: false,
    kalemler: [
      { id: "uzun", ad: "Uzun kasa", en: 2000, yukseklik: 2000, uzunluk: 9000, agirlik: 100, adet: 2, donus: "dik", ustuneKonabilir: false },
      { id: "koli", ad: "Koli", en: 1000, yukseklik: 1000, uzunluk: 1000, agirlik: 10, adet: 2, ustuneKonabilir: false, yalnizZemin: true },
    ],
    secenekler: hizli,
  };
  const r = planla(g);
  dogrula(r.sigmayanlar.length === 0 && denetle(g, r).length === 0, "araç atlamalı sırayla filo geçerli ve eksiksiz olmalıydı");
  dogrula(r.araclar.every((a) => a.yerlesimler.length > 0), "boş araç sonuçta kalmamalı");
}
{
  // Kullanılabilir boydan uzun parça 'olcu' ile döner
  const g = {
    arac: { ...kutuArac(2000, 2000, 5000), kapiPayiMm: 1000 },
    cokluArac: true,
    kalemler: [{ id: "uzun", ad: "Uzun kasa", en: 1000, yukseklik: 1000, uzunluk: 4500, agirlik: 10, adet: 1, donus: "dik" }],
    secenekler: hizli,
  };
  const r = planla(g);
  dogrula(r.sigmayanlar.length === 1 && r.sigmayanlar[0].sebep === "olcu", "kapı payı yüzünden sığmayan parça 'olcu' ile dönmeliydi");
}

{
  let hata = null;
  try {
    planla({ arac: kutuArac(0, 1000, 1000), kalemler: [] });
  } catch (h) {
    hata = h;
  }
  dogrula(hata instanceof MotorHatasi, "geçersiz araç ölçüsü MotorHatasi vermeliydi");
}
{
  const g = { arac: kutuArac(2000, 2000, 5000), cokluArac: true, kalemler: [], secenekler: hizli };
  const r = planla(g);
  dogrula(r.araclar.length === 0 && r.ozet.toplamParca === 0 && r.sigmayanlar.length === 0, "boş liste boş sonuç vermeli");
}
{
  const g = {
    arac: kutuArac(2000, 2000, 5000, 1000),
    cokluArac: true,
    kalemler: [
      { id: "buyuk", ad: "Büyük", en: 2100, yukseklik: 500, uzunluk: 500, agirlik: 10, adet: 1, donus: "sabit" },
      { id: "agir", ad: "Ağır", en: 500, yukseklik: 500, uzunluk: 500, agirlik: 1200, adet: 1 },
      { id: "yatik", ad: "Yatırılırsa sığar", en: 500, yukseklik: 2500, uzunluk: 500, agirlik: 10, adet: 1, donus: "serbest" },
    ],
    secenekler: hizli,
  };
  const r = planla(g);
  const sebep = Object.fromEntries(r.sigmayanlar.map((s) => [s.kalemId, s.sebep]));
  dogrula(sebep.buyuk === "olcu", "sığmayan ölçü sebebi 'olcu' olmalı");
  dogrula(sebep.agir === "agirlik", "tonajı aşan parça sebebi 'agirlik' olmalı");
  dogrula(!sebep.yatik && r.ozet.yerlesen === 1, "serbest parça yatırılarak sığmalıydı");
  dogrula(denetle(g, r).length === 0, "sınır durumu denetimi");
}
{
  // Parça sınırı: 301 parçadan biri 'sinir' ile döner
  const g = {
    arac: kutuArac(2400, 2600, 13600),
    cokluArac: true,
    kalemler: [{ id: "kucuk", ad: "Küçük koli", en: 300, yukseklik: 300, uzunluk: 300, agirlik: 5, adet: PARCA_SINIRI + 1 }],
    secenekler: hizli,
  };
  const r = planla(g);
  dogrula(r.sigmayanlar.length === 1 && r.sigmayanlar[0].sebep === "sinir", "301. parça 'sinir' ile dönmeliydi");
  dogrula(r.ozet.yerlesen === PARCA_SINIRI, "300 parça yerleşmeliydi");
  dogrula(denetle(g, r).length === 0, "parça sınırı denetimi");
}
{
  // Tek araç seçiliyken yer kalmazsa 'sinir'
  const g = {
    arac: kutuArac(1000, 1000, 2000),
    cokluArac: false,
    kalemler: [{ id: "blok", ad: "Blok", en: 1000, yukseklik: 1000, uzunluk: 1000, agirlik: 10, adet: 3 }],
    secenekler: hizli,
  };
  const r = planla(g);
  dogrula(r.araclar.length === 1 && r.ozet.yerlesen === 2, "tek araçta 2 blok yerleşmeliydi");
  dogrula(r.sigmayanlar.length === 1 && r.sigmayanlar[0].sebep === "sinir", "üçüncü blok 'sinir' ile dönmeliydi");
}
{
  // Yer var ama kural izin vermiyor: 'kural'
  const g = {
    arac: kutuArac(1000, 2000, 1000),
    cokluArac: false,
    kalemler: [{ id: "zemin", ad: "Zemin parçası", en: 1000, yukseklik: 500, uzunluk: 1000, agirlik: 10, adet: 2, donus: "sabit", yalnizZemin: true }],
    secenekler: hizli,
  };
  const r = planla(g);
  dogrula(r.sigmayanlar.length === 1 && r.sigmayanlar[0].sebep === "kural", "yalnız zemin parçası 'kural' ile dönmeliydi");
}
{
  // Üst yük sınırı: 100 kg'lık bloklar, her biri üstünde en fazla 150 kg taşır.
  // Bir sütunda en fazla iki blok olabilir; 4 blok için 2 araç gerekir.
  const g = {
    arac: kutuArac(1000, 3000, 1000),
    cokluArac: true,
    kalemler: [{ id: "blok", ad: "Blok", en: 1000, yukseklik: 500, uzunluk: 1000, agirlik: 100, adet: 4, donus: "sabit", ustYukSiniri: 150 }],
    secenekler: hizli,
  };
  const r = planla(g);
  dogrula(r.araclar.length === 2 && r.araclar.every((a) => a.yerlesimler.length === 2), "üst yük sınırıyla 2+2 yerleşim bekleniyordu");
  dogrula(denetle(g, r).length === 0, "üst yük denetimi");
}
{
  // Teslimat sırası: 2. durak (büyük numara) önde, 1. durak kapı tarafında
  const g = {
    arac: kutuArac(2400, 2400, 6000),
    cokluArac: false,
    kalemler: [
      { id: "d1", ad: "1. durak", en: 1200, yukseklik: 1000, uzunluk: 1000, agirlik: 100, adet: 4, teslimatSirasi: 1 },
      { id: "d2", ad: "2. durak", en: 1200, yukseklik: 1000, uzunluk: 1000, agirlik: 100, adet: 4, teslimatSirasi: 2 },
    ],
    secenekler: hizli,
  };
  const r = planla(g);
  const Y = r.araclar[0].yerlesimler;
  const enArka2 = Math.max(...Y.filter((y) => y.kalemId === "d2").map((y) => y.z + y.uzunluk));
  const enOn1 = Math.min(...Y.filter((y) => y.kalemId === "d1").map((y) => y.z));
  dogrula(denetle(g, r).length === 0, "teslimat sırası denetimi");
  dogrula(Y.length === 8, "8 parça yerleşmeliydi");
  notlar.push(`Teslimat sırası örneği: 2. durak en arkada ${enArka2} mm'de bitiyor, 1. durak en önde ${enOn1} mm'de başlıyor.`);
}
{
  // Aks: ağırlık merkezi aks grubunun arkasında kalınca uyarı
  const g = {
    arac: { ...kutuArac(2400, 2400, 6000), aks: { sasiMesafe: 100, aksMerkezi: 300 } },
    cokluArac: true,
    kalemler: [{ id: "m", ad: "Makine", en: 1000, yukseklik: 1000, uzunluk: 1000, agirlik: 500, adet: 1 }],
    secenekler: hizli,
  };
  const r = planla(g);
  const a = r.araclar[0];
  dogrula(a.aksYukleri && a.aksYukleri.sasi < 0, "şasi payı eksi çıkmalıydı");
  dogrula(a.uyarilar.some((u) => u.includes("aks grubunun arkasında")), "aks arkası uyarısı bekleniyordu");
  dogrula(denetle(g, r).length === 0, "aks denetimi");
}
{
  // Yanal denge: ağır ve hafif parça yan yana durmak zorunda
  const g = {
    arac: kutuArac(2480, 1000, 1000),
    cokluArac: false,
    kalemler: [
      { id: "agir", ad: "Ağır", en: 1000, yukseklik: 1000, uzunluk: 1000, agirlik: 1000, adet: 1, donus: "sabit" },
      { id: "hafif", ad: "Hafif", en: 1400, yukseklik: 1000, uzunluk: 1000, agirlik: 10, adet: 1, donus: "sabit" },
    ],
    secenekler: hizli,
  };
  const r = planla(g);
  dogrula(r.ozet.yerlesen === 2, "iki parça yan yana sığmalıydı");
  dogrula(r.araclar[0].uyarilar.some((u) => u.includes("yanlara dengesiz")), "yanal denge uyarısı bekleniyordu");
  dogrula(denetle(g, r).length === 0, "yanal denge denetimi");
}

// ---------------------------------------------------------------------------
// Elle düzenleme: denetle, kalanBosluk, yaslan
// ---------------------------------------------------------------------------

console.log("\nElle düzenleme");
const sadeJson = (x) => JSON.stringify(x);

{
  // 1) Geçerli planlar ihlalsiz döner; değişmemiş planda yeniden hesap planla ile birebir aynı
  for (const kod of ["a", "b", "d", "e", "e+", "f", "g", "g-sira"]) {
    const s = senaryolar().find((x) => x.kod === kod);
    const r = sonuclar[kod];
    const d = motorDenetle(s.girdi, r.araclar);
    dogrula(d.gecerli && d.ihlaller.length === 0, `(${kod}) geçerli plan ihlalsiz geçmeliydi: ${d.ihlaller.slice(0, 3).map((i) => i.mesaj).join(" | ")}`);
    dogrula(sadeJson(d.araclar) === sadeJson(r.araclar), `(${kod}) yeniden hesap planla çıktısıyla birebir aynı olmalıydı`);
  }
  const sh = senaryolar().find((x) => x.kod === "h");
  dogrula(motorDenetle(sh.girdi, sonuclar.h.araclar).gecerli, "(h) dengelenmiş plan geçerli olmalıydı");
}

// Elle kurulan küçük düzen: her ihlal türü tek tek sınanır
const ELLE_ARAC = { ad: "Deneme aracı", en: 2400, yukseklik: 2600, uzunluk: 6000, maksAgirlik: 1000, kapiPayiMm: 300 };
const elleGirdi = {
  arac: ELLE_ARAC,
  cokluArac: false,
  kalemler: [
    { id: "A", ad: "Hassas kasa", en: 1000, yukseklik: 1000, uzunluk: 1000, agirlik: 200, adet: 1, donus: "dik", ustuneKonabilir: false },
    { id: "B", ad: "Koli", en: 1000, yukseklik: 500, uzunluk: 1000, agirlik: 50, adet: 1, donus: "serbest" },
    { id: "C", ad: "Zemin makinesi", en: 800, yukseklik: 800, uzunluk: 800, agirlik: 300, adet: 1, donus: "dik", yalnizZemin: true },
    { id: "D", ad: "Hafif kasa", en: 1200, yukseklik: 600, uzunluk: 1000, agirlik: 40, adet: 1, donus: "dik", ustYukSiniri: 30 },
  ],
  secenekler: { destekOrani: 0.7 },
};
const elleKalem = Object.fromEntries(elleGirdi.kalemler.map((k) => [k.id, k]));
const yer = (id, x, y, z, olcu) => {
  const k = elleKalem[id];
  const [en, yukseklik, uzunluk] = olcu || [k.en, k.yukseklik, k.uzunluk];
  return { kalemId: id, parcaNo: 1, ad: k.ad, x, y, z, en, yukseklik, uzunluk, agirlik: k.agirlik };
};
// İndeksler: 0 = A, 1 = B, 2 = C, 3 = D
const temelDuzen = () => [yer("A", 0, 0, 0), yer("B", 1200, 0, 0), yer("C", 0, 0, 2000), yer("D", 1200, 0, 2000)];
const elleDenetle = (yerlesimler, aracEk = {}) => motorDenetle(elleGirdi, [{ ...ELLE_ARAC, ...aracEk, no: 1, yerlesimler }]);
const turler = (d) => d.ihlaller.map((i) => i.tur).sort().join(",");

{
  const temel = elleDenetle(temelDuzen());
  dogrula(temel.gecerli, `elle temel düzen geçerli olmalıydı: ${temel.ihlaller.map((i) => i.mesaj).join(" | ")}`);

  // Çakışma: B, A'nın içine itilir
  let y = temelDuzen();
  y[1].x = 500;
  let d = elleDenetle(y);
  dogrula(turler(d) === "cakisma,cakisma", `çakışma iki kayıt vermeliydi: ${turler(d)}`);
  dogrula(d.ihlaller.some((i) => i.yerlesimIndeksi === 1 && i.ilgili.some((q) => q.yerlesimIndeksi === 0)), "çakışmada ilgili parça A olmalıydı");
  dogrula(d.ihlaller.every((i) => i.duzey === "hata") && d.gecerli === false, "çakışma hata düzeyinde olmalı ve planı geçersiz kılmalıydı");

  // Taşma: B sağ duvardan dışarı
  y = temelDuzen();
  y[1].x = 2000;
  d = elleDenetle(y);
  dogrula(turler(d) === "tasma" && d.ihlaller[0].yerlesimIndeksi === 1, `sağdan taşma bekleniyordu: ${turler(d)}`);

  // Kapı payı: C 5.800 mm'de bitiyor, kullanılabilir uzunluk 5.700 mm
  y = temelDuzen();
  y[2].z = 5000;
  d = elleDenetle(y);
  dogrula(turler(d) === "tasma" && /Kapı payına/.test(d.ihlaller[0].mesaj), `kapı payı ihlali bekleniyordu: ${turler(d)}`);

  // Havada: B'nin altı boş
  y = temelDuzen();
  y[1].y = 700;
  d = elleDenetle(y);
  dogrula(turler(d) === "destek" && /havada/.test(d.ihlaller[0].mesaj), `havada parça bekleniyordu: ${turler(d)}`);

  // Yetersiz destek: B, C'nin üstünde kenara kaymış. C: x 0..800, z 2000..2800, üst 800.
  // B: x 0..1000, z 2400..3400. Kesişim 800 x 400 = 320.000 mm², taban 1.000.000 mm²: %32
  y = temelDuzen();
  y[1] = yer("B", 0, 800, 2400);
  d = elleDenetle(y);
  dogrula(turler(d) === "destek" && /%32/.test(d.ihlaller[0].mesaj), `%32 destek ihlali bekleniyordu: ${turler(d)} ${d.ihlaller.map((i) => i.mesaj).join(" | ")}`);

  // Üstüne konamaz: B, A'nın üstüne konur
  y = temelDuzen();
  y[1] = yer("B", 0, 1000, 0);
  d = elleDenetle(y);
  dogrula(turler(d) === "ustuneKonamaz" && d.ihlaller[0].yerlesimIndeksi === 1 && d.ihlaller[0].ilgili[0].yerlesimIndeksi === 0, `üstüne konamaz ihlali bekleniyordu: ${turler(d)}`);
  const sira = Object.fromEntries(d.araclar[0].yerlesimler.map((q) => [q.kalemId, q.sira]));
  dogrula(sira.A < sira.B, "yeni yükleme sırasında A, üstündeki B'den önce gelmeliydi");

  // Üst yük: B (50 kg), sınırı 30 kg olan D'nin üstüne
  y = temelDuzen();
  y[1] = yer("B", 1200, 600, 2000);
  d = elleDenetle(y);
  dogrula(turler(d) === "ustYuk" && d.ihlaller[0].yerlesimIndeksi === 3, `üst yük ihlali bekleniyordu: ${turler(d)}`);

  // Yalnız zemin: C, D'nin üstüne (aynı zamanda D'nin üst yük sınırı aşılır)
  y = temelDuzen();
  y[2] = yer("C", 1200, 600, 2000);
  d = elleDenetle(y);
  dogrula(turler(d) === "ustYuk,yalnizZemin", `yalnız zemin ve üst yük ihlali bekleniyordu: ${turler(d)}`);

  // Döndürme: dik D yan yatırılır (ihlal); yatayda çeyrek tur (ihlal yok)
  y = temelDuzen();
  y[3] = yer("D", 1200, 0, 2000, [600, 1200, 1000]);
  d = elleDenetle(y);
  dogrula(turler(d) === "donus", `döndürme ihlali bekleniyordu: ${turler(d)}`);
  y = temelDuzen();
  y[3] = yer("D", 1200, 0, 2000, [1000, 600, 1200]);
  dogrula(elleDenetle(y).gecerli, "dik parçanın yatayda çevrilmesi geçerli olmalıydı");

  // Tonaj: araç sınırı 500 kg, yük 590 kg
  d = elleDenetle(temelDuzen(), { maksAgirlik: 500 });
  dogrula(turler(d) === "tonaj" && d.ihlaller[0].yerlesimIndeksi === null, `tonaj ihlali bekleniyordu: ${turler(d)}`);

  // Yükleme sırası denetleyiciden geçer (yeni konumlara göre baştan kurulmuş)
  y = temelDuzen();
  y[1] = yer("B", 1200, 600, 2000);
  const r = elleDenetle(y);
  const sahte = { araclar: r.araclar, sigmayanlar: [], ozet: { toplamParca: 4, yerlesen: 4, aracSayisi: 1, toplamAgirlik: 590, sureSiniri: false } };
  const sorunlar = denetle({ ...elleGirdi, kalemler: elleGirdi.kalemler.map((k) => (k.id === "D" ? { ...k, ustYukSiniri: null } : k)) }, sahte);
  dogrula(sorunlar.length === 0, `yeniden kurulan sıra geçerli olmalıydı: ${sorunlar.slice(0, 3).join(" | ")}`);
}

// Örnek yükün bilinen düzeni: 3 ilaçlama + gübre, tırın sol duvarına yaslı
const ORNEK_ARAC = { ad: "Tır", en: 2500, yukseklik: 2800, uzunluk: 13600, maksAgirlik: 24000 };
const ornekDuzen = () => [
  { kalemId: "ilac", parcaNo: 1, ad: "İlaçlama makinesi 1/3", x: 0, y: 0, z: 0, en: 1600, yukseklik: 1450, uzunluk: 3450 },
  { kalemId: "ilac", parcaNo: 2, ad: "İlaçlama makinesi 2/3", x: 0, y: 0, z: 3450, en: 1600, yukseklik: 1450, uzunluk: 3450 },
  { kalemId: "ilac", parcaNo: 3, ad: "İlaçlama makinesi 3/3", x: 0, y: 0, z: 6900, en: 1600, yukseklik: 1450, uzunluk: 3450 },
  { kalemId: "gubre", parcaNo: 1, ad: "Gübre makinesi", x: 0, y: 0, z: 10350, en: 1500, yukseklik: 1400, uzunluk: 2750 },
];

{
  // Seçim yok: bütün yükün dış kutusu 1600 en, 1450 yükseklik, 13.100 uzunluk.
  // Elle hesap: üst 2800-1450 = 1350, sol 0, sağ 2500-1600 = 900, ön 0, arka 13600-13100 = 500
  const k = kalanBosluk(ORNEK_ARAC, ornekDuzen(), []);
  dogrula(sadeJson(k.duvara) === sadeJson({ ust: 1350, sol: 0, sag: 900, on: 0, arka: 500 }), `tüm yük boşlukları yanlış: ${sadeJson(k.duvara)}`);
  dogrula(Object.values(k.engele).every((e) => e.engel.tur === "duvar"), "seçim yokken engeller duvar olmalıydı");
  dogrula(sadeJson(k.kutu) === sadeJson({ x: 0, y: 0, z: 0, en: 1600, yukseklik: 1450, uzunluk: 13100 }), "dış kutu yanlış");

  // Gübre seçili: duvara üst 1400, sol 0, sağ 1000, ön 10.350, arka 500; önde engel ilaçlama 3/3 (0 mm)
  const g = kalanBosluk(ORNEK_ARAC, ornekDuzen(), [3]);
  dogrula(sadeJson(g.duvara) === sadeJson({ ust: 1400, sol: 0, sag: 1000, on: 10350, arka: 500 }), `gübre boşlukları yanlış: ${sadeJson(g.duvara)}`);
  dogrula(g.engele.on.mm === 0 && g.engele.on.engel.yerlesimIndeksi === 2 && g.engele.on.engel.ad === "İlaçlama makinesi 3/3", "gübrenin önündeki engel ilaçlama 3/3 olmalıydı");
  dogrula(g.engele.sag.mm === 1000 && g.engele.sag.engel.ad === "sağ duvar", "gübrenin sağında duvar 1.000 mm olmalıydı");
  dogrula(g.engele.arka.mm === 500 && g.engele.arka.engel.ad === "kapı", "gübrenin arkasında kapı 500 mm olmalıydı");

  // İki parça birlikte: ilaçlama 3/3 + gübre, önde ilaçlama 2/3
  const c = kalanBosluk(ORNEK_ARAC, ornekDuzen(), [2, 3]);
  dogrula(c.kutu.z === 6900 && c.kutu.uzunluk === 6200 && c.engele.on.engel.yerlesimIndeksi === 1 && c.duvara.sag === 900, "çoklu seçimin ortak kutusu yanlış");

  // Kapı payı 300 mm: arka boşluk 200 mm
  dogrula(kalanBosluk({ ...ORNEK_ARAC, kapiPayiMm: 300 }, ornekDuzen(), []).duvara.arka === 200, "kapı payı düşülmeliydi");
  dogrula(kalanBosluk(ORNEK_ARAC, [], []).kutu === null, "boş araçta kutu null olmalıydı");

  // Gerçek plan: (b) birinci tırda dış kutu bağımsız hesapla aynı
  const a = sonuclar.b.araclar[0];
  const Y = a.yerlesimler;
  const kb = kalanBosluk(a, Y, []);
  const ust = a.yukseklik - Math.max(...Y.map((q) => q.y + q.yukseklik));
  const sag = a.en - Math.max(...Y.map((q) => q.x + q.en));
  const sol = Math.min(...Y.map((q) => q.x));
  dogrula(kb.duvara.ust === ust && kb.duvara.sag === sag && kb.duvara.sol === sol, "(b) planında kalan boşluk bağımsız hesapla uyuşmalıydı");
  notlar.push(`kalanBosluk (b) 1. tır: üst ${kb.duvara.ust}, sol ${kb.duvara.sol}, sağ ${kb.duvara.sag}, arka ${kb.duvara.arka} mm`);
}

{
  // yaslan: gübre sağ duvara 1.000 mm gider
  let r = yaslan(ORNEK_ARAC, ornekDuzen(), [3], "sag");
  dogrula(r.mesafe === 1000 && r.yerlesimler[3].x === 1000 && r.yerlesimler[3].x + 1500 === 2500, "gübre sağ duvara yaslanmalıydı");
  dogrula(r.yerlesimler[0].x === 0, "seçilmeyen parça yerinde kalmalıydı");
  // Önünde ilaçlama varken öne gidemez
  r = yaslan(ORNEK_ARAC, ornekDuzen(), [3], "on");
  dogrula(r.mesafe === 0 && r.yerlesimler[3].z === 10350, "gübre önündeki parçaya dayalı kalmalıydı");
  // Bütün yük kapıya: kapı payı 300 mm aşılmaz
  r = yaslan({ ...ORNEK_ARAC, kapiPayiMm: 300 }, ornekDuzen(), [0, 1, 2, 3], "arka");
  dogrula(r.mesafe === 200 && Math.max(...r.yerlesimler.map((q) => q.z + q.uzunluk)) === 13300, "yük kapı payına kadar gitmeliydi");
  // Aşağı: havadaki B, D'nin üstüne iner
  const y = temelDuzen();
  y[1] = yer("B", 1200, 900, 2000);
  r = yaslan(ELLE_ARAC, y, [1], "asagi");
  dogrula(r.mesafe === 300 && r.yerlesimler[1].y === 600, "havadaki parça alttakinin üstüne inmeliydi");
  // Geçersiz yön
  let hata = null;
  try {
    yaslan(ORNEK_ARAC, ornekDuzen(), [0], "yukari");
  } catch (h) {
    hata = h;
  }
  dogrula(hata instanceof MotorHatasi, "geçersiz yön MotorHatasi vermeliydi");

  // Sınır: gerçek planlarda her parça her yöne itilir; sınır aşılmaz, çakışma oluşmaz
  let toplam = 0;
  let bozuk = 0;
  for (const kod of ["b", "d", "f", "a-pay"]) {
    const s = senaryolar().find((x) => x.kod === kod);
    for (const a of sonuclar[kod].araclar) {
      for (let i = 0; i < a.yerlesimler.length; i++) {
        for (const yon of ["sol", "sag", "on", "arka", "asagi"]) {
          const ry = yaslan(a, a.yerlesimler, [i], yon);
          const q = ry.yerlesimler[i];
          const kullanilabilir = a.uzunluk - a.kapiPayiMm;
          const icinde = q.x >= 0 && q.y >= 0 && q.z >= 0 && q.x + q.en <= a.en && q.y + q.yukseklik <= a.yukseklik && q.z + q.uzunluk <= kullanilabilir;
          const d = motorDenetle(s.girdi, [{ ...a, yerlesimler: ry.yerlesimler }]);
          const yeniSorun = d.ihlaller.some((h) => h.tur === "cakisma" || h.tur === "tasma");
          toplam++;
          if (!icinde || yeniSorun) bozuk++;
        }
      }
    }
  }
  dogrula(bozuk === 0, `yaslan ${toplam} denemenin ${bozuk} tanesinde sınırı aştı ya da çakıştı`);
  notlar.push(`yaslan: ${toplam} itmede sınır aşımı ve çakışma yok.`);
}

{
  // Teslimat sırası uyarısı: küçük numara önce indirilir. E (1. durak) önce, F (2. durak) sonra.
  const tGirdi = {
    arac: ELLE_ARAC,
    cokluArac: false,
    kalemler: [
      { id: "E", ad: "1. durak kolisi", en: 1000, yukseklik: 1000, uzunluk: 1000, agirlik: 50, adet: 1, teslimatSirasi: 1 },
      { id: "F", ad: "2. durak kolisi", en: 1000, yukseklik: 1000, uzunluk: 1000, agirlik: 50, adet: 1, teslimatSirasi: 2 },
    ],
    secenekler: { destekOrani: 0.7 },
  };
  const ty = (id, x, y, z) => ({ kalemId: id, parcaNo: 1, ad: id === "E" ? "1. durak kolisi" : "2. durak kolisi", x, y, z, en: 1000, yukseklik: 1000, uzunluk: 1000, agirlik: 50 });
  const tDen = (yerlesimler) => motorDenetle(tGirdi, [{ ...ELLE_ARAC, no: 1, yerlesimler }]);

  // Doğru düzen: F önde, E kapı tarafında; E'nin F'nin üstünde olması da sorun değil
  dogrula(tDen([ty("F", 0, 0, 0), ty("E", 0, 0, 1000)]).ihlaller.length === 0, "doğru teslimat düzeninde uyarı olmamalıydı");
  dogrula(tDen([ty("F", 0, 0, 0), ty("E", 0, 1000, 0)]).ihlaller.length === 0, "önce indirilecek parça üstteyse uyarı olmamalıydı");
  // Yan yana, yolları kesişmiyor: uyarı yok
  dogrula(tDen([ty("E", 0, 0, 0), ty("F", 1200, 0, 1000)]).ihlaller.length === 0, "yolu kesişmeyen parçalarda uyarı olmamalıydı");

  // F, E'nin kapı yolunda: uyarı (kayıt F'ye, ilgili E)
  let d = tDen([ty("E", 0, 0, 0), ty("F", 0, 0, 1000)]);
  const u = d.ihlaller[0];
  dogrula(
    d.gecerli === true && d.ihlaller.length === 1 && u.tur === "teslimatSirasi" && u.duzey === "uyari" && u.yerlesimIndeksi === 1 &&
      u.ilgili[0].yerlesimIndeksi === 0 && u.mesaj === "Bu parça, daha önce indirilecek 1. durak kolisi parçasının önünü kapatıyor.",
    `kapı yolu uyarısı bekleniyordu: ${sadeJson(d.ihlaller)}`
  );
  // F, E'nin üstünde: uyarı
  d = tDen([ty("E", 0, 0, 0), ty("F", 0, 1000, 0)]);
  dogrula(turler(d) === "teslimatSirasi" && d.gecerli === true && d.ihlaller[0].yerlesimIndeksi === 1, `üstte duran sonraki durak uyarısı bekleniyordu: ${turler(d)}`);
  // Uyarı ve hata birlikte: geçerlilik yalnız hataya bakar
  d = tDen([ty("E", 0, 0, 0), ty("F", 0, 0, 1000), { ...ty("F", 0, 0, 500), parcaNo: 2 }]);
  dogrula(d.gecerli === false && d.ihlaller.some((i) => i.duzey === "uyari") && d.ihlaller.some((i) => i.duzey === "hata"), "hata varken plan geçersiz, uyarı ayrıca görünmeliydi");
}

{
  // ustundekiler: G (taban kasası) üstünde H, onun üstünde I; yanda ikinci G
  const iGirdi = {
    arac: ELLE_ARAC,
    cokluArac: false,
    kalemler: [
      { id: "G", ad: "Taban kasası", en: 1000, yukseklik: 1000, uzunluk: 1000, agirlik: 200, adet: 2 },
      { id: "H", ad: "Üst koli", en: 1000, yukseklik: 500, uzunluk: 1000, agirlik: 50, adet: 1 },
      { id: "I", ad: "En üst koli", en: 800, yukseklik: 400, uzunluk: 800, agirlik: 20, adet: 1 },
    ],
    secenekler: { destekOrani: 0.7 },
  };
  const iy = (id, no, x, y, z) => {
    const k = iGirdi.kalemler.find((q) => q.id === id);
    return { kalemId: id, parcaNo: no, ad: k.ad, x, y, z, en: k.en, yukseklik: k.yukseklik, uzunluk: k.uzunluk, agirlik: k.agirlik };
  };
  // 0 = G1, 1 = H, 2 = I, 3 = G2
  const Y = [iy("G", 1, 0, 0, 0), iy("H", 1, 0, 1000, 0), iy("I", 1, 100, 1500, 100), iy("G", 2, 0, 0, 1500)];
  const iDen = (yerlesimler) => motorDenetle(iGirdi, [{ ...ELLE_ARAC, no: 1, yerlesimler }]);
  dogrula(iDen(Y).gecerli, "istif düzeni geçerli olmalıydı");
  dogrula(sadeJson(ustundekiler(Y, [0])) === "[1,2]", "G1'in üstündekiler H ve I olmalıydı (dolaylı dahil)");
  dogrula(sadeJson(ustundekiler(Y, [1])) === "[2]", "H'nin üstündeki yalnız I olmalıydı");
  dogrula(sadeJson(ustundekiler(Y, [3])) === "[]" && sadeJson(ustundekiler(Y, [])) === "[]", "üstü boş parça ve boş seçim boş liste vermeliydi");
  dogrula(sadeJson(ustundekiler(Y, [0, 1])) === "[2]", "seçili parçalar sonuçta yer almamalıydı");

  // Yalnız G1 itilirse üstündekiler havada kalır; istifle birlikte itilince düzen geçerli
  const yalniz = yaslan(ELLE_ARAC, Y, [0], "sag");
  dogrula(iDen(yalniz.yerlesimler).ihlaller.some((i) => i.tur === "destek"), "yalnız taban itilince üstündekiler desteksiz kalmalıydı");
  const istif = [0, ...ustundekiler(Y, [0])];
  const birlikte = yaslan(ELLE_ARAC, Y, istif, "sag");
  dogrula(birlikte.mesafe === 1400 && iDen(birlikte.yerlesimler).gecerli, "istif birlikte sağ duvara gitmeli ve geçerli kalmalıydı");

  // Gerçek plan: (b) birinci tırda gübrenin üstündekiler iki diskaro
  const a = sonuclar.b.araclar[0];
  const gubre = a.yerlesimler.findIndex((q) => q.kalemId === "gubre");
  const diskolar = a.yerlesimler.map((q, i) => (q.kalemId === "disk" ? i : -1)).filter((i) => i >= 0);
  dogrula(sadeJson(ustundekiler(a.yerlesimler, [gubre])) === sadeJson(diskolar), "(b) gübrenin üstündekiler iki diskaro olmalıydı");
  const sb = senaryolar().find((x) => x.kod === "b");
  const tasindi = yaslan(a, a.yerlesimler, [gubre, ...diskolar], "sag");
  dogrula(motorDenetle(sb.girdi, [{ ...a, yerlesimler: tasindi.yerlesimler }]).gecerli, "(b) gübre istifi birlikte itilince geçerli kalmalıydı");
}

// ---------------------------------------------------------------------------
// Web Worker sarmalayıcısı (tarayıcı yerine sahte "self" ile)
// ---------------------------------------------------------------------------
{
  const mesajlar = [];
  globalThis.self = { postMessage: (m) => mesajlar.push(m) };
  await import("../Istif/web/js/motor/isci.js");
  const girdi = senaryolar()[0].girdi;
  globalThis.self.onmessage({ data: { tur: "planla", id: 7, girdi: { ...girdi, secenekler: hizli } } });
  const son = mesajlar[mesajlar.length - 1];
  dogrula(son && son.tur === "sonuc" && son.id === 7 && son.sonuc.araclar.length === 2, "işçi sonuc mesajı vermeliydi");
  dogrula(mesajlar.some((m) => m.tur === "ilerleme" && m.id === 7), "işçi ilerleme mesajı vermeliydi");
  mesajlar.length = 0;
  globalThis.self.onmessage({ data: { tur: "planla", id: 8, girdi: { arac: {}, kalemler: [] } } });
  dogrula(mesajlar[0]?.tur === "hata" && mesajlar[0].id === 8 && /Araç/.test(mesajlar[0].mesaj), "işçi Türkçe hata mesajı vermeliydi");
  mesajlar.length = 0;
  globalThis.self.onmessage({ data: { tur: "bilinmeyen", id: 9 } });
  dogrula(mesajlar[0]?.tur === "hata" && mesajlar[0].id === 9, "bilinmeyen istek hata vermeliydi");
  // Elle düzenleme istekleri
  mesajlar.length = 0;
  globalThis.self.onmessage({ data: { tur: "kalanBosluk", id: 10, arac: ORNEK_ARAC, yerlesimler: ornekDuzen(), seciliIndeksler: [] } });
  dogrula(mesajlar[0]?.tur === "sonuc" && mesajlar[0].id === 10 && mesajlar[0].sonuc.duvara.ust === 1350, "işçi kalanBosluk sonucu vermeliydi");
  mesajlar.length = 0;
  globalThis.self.onmessage({ data: { tur: "denetle", id: 11, girdi: elleGirdi, araclar: [{ ...ELLE_ARAC, no: 1, yerlesimler: temelDuzen() }] } });
  dogrula(mesajlar[0]?.tur === "sonuc" && mesajlar[0].id === 11 && mesajlar[0].sonuc.gecerli === true, "işçi denetle sonucu vermeliydi");
  mesajlar.length = 0;
  globalThis.self.onmessage({ data: { tur: "yaslan", id: 12, arac: ORNEK_ARAC, yerlesimler: ornekDuzen(), indeksler: [3], yon: "sag" } });
  dogrula(mesajlar[0]?.tur === "sonuc" && mesajlar[0].id === 12 && mesajlar[0].sonuc.mesafe === 1000, "işçi yaslan sonucu vermeliydi");
  mesajlar.length = 0;
  globalThis.self.onmessage({ data: { tur: "yaslan", id: 13, arac: ORNEK_ARAC, yerlesimler: ornekDuzen(), indeksler: [3], yon: "yukari" } });
  dogrula(mesajlar[0]?.tur === "hata" && /Yaslama yönü/.test(mesajlar[0].mesaj), "işçi geçersiz yön için Türkçe hata vermeliydi");
  mesajlar.length = 0;
  globalThis.self.onmessage({ data: { tur: "ustundekiler", id: 14, yerlesimler: sonuclar.b.araclar[0].yerlesimler, indeksler: [] } });
  dogrula(mesajlar[0]?.tur === "sonuc" && mesajlar[0].id === 14 && Array.isArray(mesajlar[0].sonuc), "işçi ustundekiler sonucu vermeliydi");
}

// ---------------------------------------------------------------------------
// Karşılaştırma tablosu
// ---------------------------------------------------------------------------

const m = (v) => (v / 1000).toFixed(2).replace(".", ",");
const ort = (d) => (d.length ? d.reduce((t, v) => t + v, 0) / d.length : 0).toFixed(1).replace(".", ",");
console.log("\nEski PHP motoru ile karşılaştırma (boy m, ortalama doluluk %)");
console.log("Senaryo | PHP araç | PHP boylar          | PHP dol. | JS araç | JS boylar           | JS dol. | JS ms | Not");
for (const t of tablo) {
  const p = t.php;
  const phpBoy = p ? p.boylar.map(m).join(" / ") : "-";
  const not = !p ? "" : t.ayniKural ? (kotuDegil(t.js, p) ? "aynı kural, JS kötü değil" : "aynı kural, JS KÖTÜ") : `PHP ${t.phpKod} (daha gevşek kural)`;
  console.log(
    [
      t.kod.padEnd(7),
      String(p ? p.arac : "-").padEnd(8),
      phpBoy.padEnd(19),
      (p ? ort(p.doluluk) : "-").padEnd(8),
      String(t.js.arac).padEnd(7),
      t.js.boylar.map(m).join(" / ").padEnd(19),
      ort(t.js.doluluk).padEnd(7),
      String(t.js.ms).padEnd(5),
      not,
    ].join(" | ")
  );
}

if (notlar.length) {
  console.log("\nNotlar");
  for (const n of notlar) console.log("- " + n);
}

console.log(`\n${basarili} denetim geçti, ${basarisiz} denetim kaldı.`);
if (basarisiz > 0) process.exitCode = 1;
