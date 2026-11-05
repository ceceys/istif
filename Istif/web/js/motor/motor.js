/*
 * İstif: yerleştirme motoru
 *
 * Tır, kamyon ve konteynere parça yerleşimini hesaplar. Bağımlılığı yoktur;
 * tarayıcıda, Web Worker içinde ve Node'da aynı biçimde çalışır.
 *
 * Yöntem
 *   1) Köşe noktası yöntemi: her yerleşen parça yeni aday köşeler açar
 *      (sağı, üstü, kapı tarafı ve bunların duvara/zemine izdüşümleri).
 *      Yeni parça bu köşelerden birine, kurallar sağlanıyorsa konur.
 *   2) Birden çok başlangıç: farklı sıralama ölçütleri, yön tercihleri ve
 *      yerleştirme düzenleri denenir.
 *   3) Basit iyileştirme: sıra takası, öne alma ve yön değişikliği.
 *   4) Cila: her araç kendi parçalarıyla yeniden denenir.
 *   Arama saatle değil, sayılan iş birimiyle sınırlanır (aday denemeleri ve
 *   taranan kutular). Bütçe parça sayısıyla büyür, rastgelelik girdiden
 *   türeyen sabit tohumla üretilir: aynı girdi her zaman aynı sonucu verir.
 *   Süre sınırı (secenekler.sureButcesiMs) yalnız güvenlik içindir; ona
 *   takılınca ozet.sureSiniri true döner.
 *
 * Amaç sırası: önce sığmayan en az, sonra en az araç, sonra kullanılan
 * araçların toplam iç uzunluğu en kısa (karışık filoda küçük araç yeğlenir),
 * sonra son aracın kullanılan uzunluğu en kısa, sonra ağırlık merkezi ortaya
 * en yakın.
 *
 * Karışık filo (girdi.filo): araçlar plana göre açılır. "sirayla" planında
 * liste sırası izlenir; "enUygun" seçiminde birinci araç listenin ilk tipidir,
 * kalan yük için her tip ayrı plan olarak kısa bir aramayla denenir, kalan
 * bütçe kazanan plana verilir. Eşitlikte listede önce gelen tip kazanır.
 *
 * Eksenler: x genişlik (0 = sol duvar), y yükseklik (0 = taban),
 * z uzunluk (0 = ön duvar, uzunluk = arka kapı). Birimler tamsayı mm ve kg.
 */

export const SURUM = "1.0.0";
/** Bir hesapta en fazla parça sayısı (adetler açıldıktan sonra) */
export const PARCA_SINIRI = 300;
/** Çoklu araçta açılabilecek en fazla araç */
export const ARAC_SINIRI = 300;

/** Güvenlik sınırı: normal yükler buna takılmadan biter */
const VARSAYILAN_SURE_MS = 8000;
const VARSAYILAN_DESTEK = 0.7;
/**
 * İş bütçesi (birim): taban + parça başına pay, üst sınırla.
 * Bir birim kabaca bir aday denemesi ya da taranan bir kutudur.
 */
const ADIM_TABAN = 20000000;
const ADIM_PARCA = 2100000;
const ADIM_UST = 650000000;
/** Her turun sayılmayan sabit işi (puanlama, ortalama, kopyalar) için parça başına pay */
const TUR_PARCA_PAYI = 400;
/** Yeni araç açmanın sabit işi */
const ARAC_KURMA_PAYI = 20000;
/** Karışık filoda planların ön değerlendirmesine ayrılan bütçe payı */
const ON_DEGERLENDIRME_PAYI = 0.25;
/** Nokta anahtarı 16 bitlik alanlara yazıldığı için ölçü üst sınırı */
const OLCU_UST = 65535;

const B16 = 65536;
const B32 = 4294967296;

// Yerleştirme denemesinin sonucu
const UYGUN = 0;
const GEOMETRI = 1; // taşma ya da çakışma
const DESTEK = 2; // altı yeterince dolu değil
const KURAL = 3; // kullanıcı kuralı (yalnız zemin, üstüne konamaz, üst yük, teslimat sırası)

const BOS = [];

/** Motorun kullanıcıya gösterilebilir hatası */
export class MotorHatasi extends Error {
  constructor(mesaj) {
    super(mesaj);
    this.name = "MotorHatasi";
  }
}

const simdi =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? () => performance.now()
    : () => Date.now();

/** Tohumlu sözde rastgele sayı (mulberry32): aynı tohum aynı diziyi verir */
function tohumluRastgele(tohum) {
  let a = tohum >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hazırlanmış girdiden tohum (FNV-1a özeti): aynı girdi aynı tohumu verir */
function girdiTohumu(o) {
  let s = [o.oran, o.cokluArac ? 1 : 0, o.filoSecimi].join(",");
  for (const t of o.tipler) s += "#" + [t.W, t.H, t.L, t.Lgercek, t.maxW].join(",");
  for (const p of o.parcalar) {
    s += "|" + [p.en, p.yukseklik, p.uzunluk, p.agirlik, p.donus, p.ustuneKonabilir ? 1 : 0,
      p.yalnizZemin ? 1 : 0, p.sinir, p.grup].join(",");
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function sayi(v, varsayilan) {
  if (v === null || v === undefined || v === "") return varsayilan;
  const n = Number(v);
  return Number.isFinite(n) ? n : varsayilan;
}

function sinirla(v, alt, ust) {
  return v < alt ? alt : v > ust ? ust : v;
}

// ---------------------------------------------------------------------------
// Girdi hazırlığı
// ---------------------------------------------------------------------------

/**
 * Bir parçanın izinli yönleri. Her yön, parçanın araç eksenlerinde
 * kapladığı ölçüdür: w (x, genişlik), h (y, yükseklik), l (z, uzunluk).
 *   0: girilen yön
 *   1: yatayda çeyrek tur (yükseklik aynı kalır)
 *   2..5: yan ya da sırt üstü yatırılmış hâller
 */
function yonleriUret(en, yuk, uz, donus) {
  const tum = [
    [en, yuk, uz],
    [uz, yuk, en],
    [yuk, en, uz],
    [uz, en, yuk],
    [yuk, uz, en],
    [en, uz, yuk],
  ];
  const izin = donus === "sabit" ? [0] : donus === "dik" ? [0, 1] : [0, 1, 2, 3, 4, 5];
  const gorulen = new Set();
  const liste = [];
  for (const i of izin) {
    const [w, h, l] = tum[i];
    const anahtar = w + "x" + h + "x" + l;
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    liste.push({ i, w, h, l });
  }
  return liste;
}

/**
 * Bir araç tipini doğrular ve iç biçime çevirir.
 * L kullanılabilir uzunluktur (kapı payı düşülmüş), Lgercek aracın iç uzunluğu.
 */
function tipHazirla(a, no, filodaMi) {
  const yer = filodaMi ? `Filodaki ${no + 1}. araç` : "Araç";
  if (!a || typeof a !== "object") throw new MotorHatasi(`${yer} bilgisi eksik.`);
  const W = Math.round(sayi(a.en, 0));
  const H = Math.round(sayi(a.yukseklik, 0));
  const L = Math.round(sayi(a.uzunluk, 0));
  if (W <= 0 || H <= 0 || L <= 0) throw new MotorHatasi(`${yer} ölçüleri eksik ya da hatalı.`);
  if (W > OLCU_UST || H > OLCU_UST || L > OLCU_UST) {
    throw new MotorHatasi(`${yer} ölçülerinden biri 65 metreyi aşıyor.`);
  }
  const maxW = Math.max(0, sayi(a.maksAgirlik, 0));
  // Arka kapıda boş bırakılacak pay: yerleşim yalnız uzunluk - pay içinde yapılır
  const kapiPayi = Math.max(0, Math.round(sayi(a.kapiPayiMm, 0)));
  if (kapiPayi >= L) {
    throw new MotorHatasi(filodaMi ? `${yer}: kapı payı araç uzunluğundan kısa olmalı.` : "Kapı payı araç uzunluğundan kısa olmalı.");
  }
  let aks = null;
  let aksGirdi = null;
  if (a.aks && typeof a.aks === "object") {
    const s = sayi(a.aks.sasiMesafe, NaN);
    const m = sayi(a.aks.aksMerkezi, NaN);
    if (Number.isFinite(s) && Number.isFinite(m) && m !== s) {
      aks = { s, a: m };
      aksGirdi = { sasiMesafe: s, aksMerkezi: m };
    }
  }
  return {
    no,
    ad: typeof a.ad === "string" ? a.ad : "",
    W, H, maxW, aks, aksGirdi, kapiPayi,
    L: L - kapiPayi,
    Lgercek: L,
  };
}

/** Bir kalemi okur ve varsayılanları uygular (planla ve denetle ortak kullanır) */
function kalemOku(k, ki) {
  if (!k || typeof k !== "object") return null;
  const ustuneKonabilir = k.ustuneKonabilir !== false;
  // Üstüne konamayan parçada üst yük sınırı anlamsızdır
  const sinirHam = sayi(k.ustYukSiniri, null);
  return {
    adet: Math.max(0, Math.floor(sayi(k.adet, 1))),
    kalemId: k.id !== undefined && k.id !== null && k.id !== "" ? String(k.id) : "k" + (ki + 1),
    ad: (k.ad === undefined || k.ad === null ? "" : String(k.ad)).trim() || "Parça",
    en: Math.round(sayi(k.en, 0)),
    yk: Math.round(sayi(k.yukseklik, 0)),
    uz: Math.round(sayi(k.uzunluk, 0)),
    agirlik: Math.max(0, sayi(k.agirlik, 0)),
    donus: k.donus === "dik" || k.donus === "sabit" ? k.donus : "serbest",
    ustuneKonabilir,
    yalnizZemin: k.yalnizZemin === true,
    sinir: !ustuneKonabilir ? 0 : sinirHam === null ? Infinity : Math.max(0, sinirHam),
    grup: Math.round(sayi(k.teslimatSirasi, 0)),
    renk: typeof k.renk === "string" && k.renk ? k.renk : "#3ABFF0",
  };
}

function hazirla(girdi) {
  if (!girdi || typeof girdi !== "object") throw new MotorHatasi("Hesap için girdi gelmedi.");
  // Filo verilmişse tek araç bilgisi yok sayılır
  const filoVar = Array.isArray(girdi.filo) && girdi.filo.length > 0;
  const tipler = filoVar
    ? girdi.filo.map((a, i) => tipHazirla(a, i, true))
    : [tipHazirla(girdi.arac || {}, 0, false)];

  const sec = girdi.secenekler || {};
  // Güvenlik süresi: arama normalde iş bütçesiyle biter, buna takılmaz
  let sure = sayi(sec.sureButcesiMs, VARSAYILAN_SURE_MS);
  if (!(sure > 0)) sure = VARSAYILAN_SURE_MS;
  sure = sinirla(sure, 20, 120000);
  const oran = sinirla(sayi(sec.destekOrani, VARSAYILAN_DESTEK), 0, 1);

  const o = {
    tipler,
    filoSecimi: sec.filoSecimi === "enUygun" ? "enUygun" : "sirayla",
    // Yerleşim bittikten sonra yükü boyuna dengeye kaydır (aramayı etkilemez)
    dengele: sec.dengele === true,
    sure, oran,
    cokluArac: girdi.cokluArac !== false,
    parcalar: [], // yerleştirilecekler
    elenenler: [], // daha baştan sığmayanlar: { p, sebep }
    toplamParca: 0,
  };

  const kalemler = Array.isArray(girdi.kalemler) ? girdi.kalemler : [];
  let no = 0;
  kalemler.forEach((k, ki) => {
    const km = kalemOku(k, ki);
    if (!km) return;
    const { adet, kalemId, ad, en, yk, uz, agirlik, donus, ustuneKonabilir, yalnizZemin, sinir, grup, renk } = km;
    const olcuGecerli = en > 0 && yk > 0 && uz > 0;
    // Filodaki en az bir araca sığan yönler; araca göre ayrım yerleştirmede yapılır
    const tumYonler = olcuGecerli ? yonleriUret(en, yk, uz, donus) : [];
    const sigar = (y, t) => y.w <= t.W && y.h <= t.H && y.l <= t.L;
    const yonler = tumYonler.filter((y) => tipler.some((t) => sigar(y, t)));
    // Her araç tipi için: ölçüce sığıyor ve tek başına tonajı aşmıyor mu
    const olcuyeUygun = tipler.map((t) => yonler.some((y) => sigar(y, t)));
    const tipUygun = tipler.map((t, i) => olcuyeUygun[i] && (t.maxW <= 0 || agirlik <= t.maxW + 1e-9));
    const imza = [
      yonler.map((y) => y.w + "x" + y.h + "x" + y.l).sort().join(";"),
      agirlik, ustuneKonabilir ? 1 : 0, yalnizZemin ? 1 : 0, sinir, grup,
    ].join("|");

    for (let i = 1; i <= adet; i++) {
      const p = {
        no: no++,
        kalemId,
        parcaNo: i,
        ad: adet > 1 ? `${ad} ${i}/${adet}` : ad,
        renk, en, yukseklik: yk, uzunluk: uz, agirlik, donus,
        ustuneKonabilir, yalnizZemin, sinir, grup, yonler, imza, tipUygun,
        hacim: en * yk * uz,
        taban: en * uz,
        enUzunYatay: Math.max(en, uz),
        enUzunKenar: Math.max(en, yk, uz),
      };
      if (o.parcalar.length + o.elenenler.length >= PARCA_SINIRI) {
        o.elenenler.push({ p, sebep: "sinir" });
      } else if (!olcuGecerli || yonler.length === 0) {
        o.elenenler.push({ p, sebep: "olcu" });
      } else if (!tipUygun.some(Boolean)) {
        o.elenenler.push({ p, sebep: "agirlik" });
      } else {
        o.parcalar.push(p);
      }
    }
  });
  o.toplamParca = no;
  return o;
}

// ---------------------------------------------------------------------------
// Araç ve yerleştirme
// ---------------------------------------------------------------------------

class Kutu {
  constructor(i, p, yon, x, y, z) {
    this.i = i;
    this.p = p;
    this.yon = yon.i;
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = yon.w;
    this.h = yon.h;
    this.l = yon.l;
    this.xe = x + yon.w;
    this.ye = y + yon.h;
    this.ze = z + yon.l;
    this.agirlik = p.agirlik;
    this.ustuneKonabilir = p.ustuneKonabilir;
    this.sinir = p.sinir;
    this.grup = p.grup;
    /** Bu kutunun altında kalan kutular (izdüşüm kesişen ve onların altındakiler) */
    this.alt = BOS;
    /** Bu kutunun üstüne binen toplam ağırlık (güvenli yanda hesap) */
    this.yuk = 0;
  }
}

class Arac {
  /**
   * @param tip     araç tipi (tipHazirla çıktısı)
   * @param oran    en az destek oranı
   * @param yOnce   true: aday köşeler önce yüksekliğe göre (taban önce) sıralanır;
   *                false: önce uzunluğa göre (ön duvardan kapıya) sıralanır
   * @param sayac   iş birimi sayacı { n }: arama bütçesi bununla ölçülür
   */
  constructor(tip, oran, yOnce, sayac) {
    const o = tip;
    this.tip = tip;
    this.W = tip.W;
    this.H = tip.H;
    this.L = tip.L; // kullanılabilir uzunluk (kapı payı düşülmüş)
    this.Lg = tip.Lgercek;
    this.sayac = sayac;
    this.maxW = tip.maxW;
    this.oran = oran;
    this.yOnce = yOnce;
    this.kutular = [];
    this.agirlik = 0;
    this.hacim = 0;
    this.kullanilan = 0;
    this.grupMin = Infinity;
    this.grupMax = -Infinity;
    this.ortalandi = false;

    // Uzunluk ekseninde kova dizini: çakışma denetiminde yalnız yakındaki kutular taranır
    this.kb = Math.max(200, Math.ceil(o.L / 64));
    const kovaSayisi = Math.floor((o.L - 1) / this.kb) + 1;
    this.kovalar = [];
    for (let i = 0; i < kovaSayisi; i++) this.kovalar.push([]);

    const n = PARCA_SINIRI + 1;
    this.damga = new Int32Array(n);
    this.damgaNo = 0;
    this.tampon = new Int32Array(n);
    this.altDamga = new Int32Array(n);
    this.altNo = 0;
    this.altTampon = new Int32Array(n);
    this.altSay = 0;
    this.altGecerli = false;

    /** Aday köşeler: sıralı ve benzersiz sayısal anahtarlar */
    this.noktalar = [0];
    /** Aynı imzalı parça bu araca sığmadıysa, araç değişmedikçe yeniden denenmez */
    this.basarisiz = new Map();
    this.sonRet = GEOMETRI;
  }

  anahtar(x, y, z) {
    return this.yOnce ? y * B32 + z * B16 + x : z * B32 + y * B16 + x;
  }

  /** [z0, z1) aralığındaki kovalarda bulunan kutuların sırasını tampona yazar */
  sorgu(z0, z1) {
    const kb = this.kb;
    const d = ++this.damgaNo;
    const damga = this.damga;
    const t = this.tampon;
    let n = 0;
    const ilk = Math.floor(z0 / kb);
    const son = Math.min(this.kovalar.length - 1, Math.floor((z1 - 1) / kb));
    let gezilen = 0;
    for (let k = ilk; k <= son; k++) {
      const kova = this.kovalar[k];
      gezilen += kova.length + 1;
      for (let j = 0; j < kova.length; j++) {
        const i = kova[j];
        if (damga[i] !== d) {
          damga[i] = d;
          t[n++] = i;
        }
      }
    }
    this.sayac.n += gezilen;
    return n;
  }

  /**
   * Parçayı verilen köşeye verilen yönle koymayı dener; kutuyu eklemez.
   * Uygunsa alt küme altTampon'da hazır kalır.
   */
  dene(p, w, h, l, px, py, pz) {
    const xe = px + w;
    const ye = py + h;
    const ze = pz + l;
    this.altGecerli = false;
    this.altSay = 0;
    this.sayac.n++;
    if (xe > this.W || ye > this.H || ze > this.L) return GEOMETRI;
    if (py > 0 && p.yalnizZemin) return KURAL;

    const K = this.kutular;
    const t = this.tampon;
    const n = this.sorgu(pz, ze);
    this.sayac.n += n; // aşağıdaki döngüler

    // Çakışma. Ayrıca başka bir kutunun altına sokulmaz: forklift önden
    // yükler, üstte duran kutunun altına parça itilmez.
    for (let j = 0; j < n; j++) {
      const b = K[t[j]];
      if (b.x < xe && px < b.xe && b.z < ze && pz < b.ze) {
        if (b.y < ye && py < b.ye) return GEOMETRI;
        if (b.y >= ye) return GEOMETRI;
      }
    }

    if (py > 0) {
      // Destek: tabanın en az "oran" kadarı, üst yüzü tam bu yükseklikte
      // olan kutulara basmalı
      let destek = 0;
      for (let j = 0; j < n; j++) {
        const b = K[t[j]];
        if (b.ye !== py) continue;
        const dx = (xe < b.xe ? xe : b.xe) - (px > b.x ? px : b.x);
        if (dx <= 0) continue;
        const dz = (ze < b.ze ? ze : b.ze) - (pz > b.z ? pz : b.z);
        if (dz <= 0) continue;
        destek += dx * dz;
      }
      if (destek <= 0 || destek < this.oran * w * l - 1e-6) return DESTEK;

      // Alt küme: izdüşümü kesişen alttaki kutular ve onların altındakiler
      const ad = ++this.altNo;
      const AD = this.altDamga;
      const AT = this.altTampon;
      let m = 0;
      for (let j = 0; j < n; j++) {
        const b = K[t[j]];
        if (b.ye > py) continue;
        if (!(b.x < xe && px < b.xe && b.z < ze && pz < b.ze)) continue;
        if (AD[b.i] !== ad) {
          AD[b.i] = ad;
          AT[m++] = b.i;
        }
        const ba = b.alt;
        for (let q = 0; q < ba.length; q++) {
          const c = ba[q];
          if (AD[c] !== ad) {
            AD[c] = ad;
            AT[m++] = c;
          }
        }
      }
      // Üstüne konamaz ve üst yük sınırı: alt kümedeki her kutu, bu parçanın
      // ağırlığını tam olarak taşıyor sayılır (güvenli yanda kalır)
      const w0 = p.agirlik;
      for (let q = 0; q < m; q++) {
        const c = K[AT[q]];
        if (!c.ustuneKonabilir) return KURAL;
        if (c.yuk + w0 > c.sinir + 1e-9) return KURAL;
      }
      this.altSay = m;
      this.altGecerli = true;
    }

    // Teslimat sırası (son giren ilk çıkar). Küçük numara önce boşaltılır.
    // Önce boşaltılacak parçanın kapıya giden yolunda ya da üstünde, sonra
    // boşaltılacak parça olmamalı.
    if (this.grupMin !== Infinity && (this.grupMin !== p.grup || this.grupMax !== p.grup)) {
      this.sayac.n += K.length;
      for (let i = 0; i < K.length; i++) {
        const b = K[i];
        if (b.grup === p.grup) continue;
        const xo = b.x < xe && px < b.xe;
        const yo = b.y < ye && py < b.ye;
        if (b.grup > p.grup) {
          if (xo && yo && b.z >= ze) return KURAL;
        } else {
          if (xo && yo && pz >= b.ze) return KURAL;
          if (this.altGecerli && this.altDamga[b.i] === this.altNo) return KURAL;
        }
      }
    }
    return UYGUN;
  }

  /**
   * Parçayı bu araca yerleştirir.
   * enIyi=false: köşeler sırayla taranır, ilk uygun yer alınır.
   * enIyi=true: bütün köşeler taranır, en iyi anahtarlı yer alınır.
   */
  yerlestir(p, yonler, enIyi) {
    const N = this.noktalar;
    const yOnce = this.yOnce;
    let kural = false;

    const sayac = this.sayac;
    if (!enIyi) {
      for (let i = 0; i < N.length; i++) {
        sayac.n += 3; // köşe çözümü ve yön anahtarları
        const k = N[i];
        const a = Math.floor(k / B32);
        const r = k - a * B32;
        const b = Math.floor(r / B16);
        const x = r - b * B16;
        const y = yOnce ? a : b;
        const z = yOnce ? b : a;
        for (let j = 0; j < yonler.length; j++) {
          const o = yonler[j];
          const s = this.dene(p, o.w, o.h, o.l, x, y, z);
          if (s === UYGUN) {
            this.koy(p, o, x, y, z);
            return true;
          }
          if (s === KURAL) kural = true;
        }
      }
    } else {
      // Uzunluk önce düzende anahtar (bitiş z, y, x): araç boyu en az uzar.
      // Taban önce düzende anahtar (y, bitiş z, x).
      let enAnahtar = Infinity;
      let ex = 0, ey = 0, ez = 0, eo = null, enZe = Infinity;
      let minL = Infinity;
      for (const o of yonler) if (o.l < minL) minL = o.l;
      for (let i = 0; i < N.length; i++) {
        sayac.n += 3; // köşe çözümü ve yön anahtarları
        const k = N[i];
        const a = Math.floor(k / B32);
        const r = k - a * B32;
        const b = Math.floor(r / B16);
        const x = r - b * B16;
        const y = yOnce ? a : b;
        const z = yOnce ? b : a;
        if (eo) {
          if (yOnce) {
            if (y > ey) break;
          } else if (z + minL > enZe) break;
        }
        for (let j = 0; j < yonler.length; j++) {
          const o = yonler[j];
          const ze = z + o.l;
          const an = yOnce ? y * B32 + ze * B16 + x : ze * B32 + y * B16 + x;
          if (an >= enAnahtar) continue;
          const s = this.dene(p, o.w, o.h, o.l, x, y, z);
          if (s === UYGUN) {
            enAnahtar = an;
            ex = x; ey = y; ez = z; eo = o; enZe = ze;
          } else if (s === KURAL) kural = true;
        }
      }
      if (eo) {
        // Alt küme son denemeden kalmış olabilir; seçilen yer için yeniden kurulur
        this.dene(p, eo.w, eo.h, eo.l, ex, ey, ez);
        this.koy(p, eo, ex, ey, ez);
        return true;
      }
    }
    this.sonRet = kural ? KURAL : GEOMETRI;
    return false;
  }

  koy(p, o, x, y, z) {
    const K = this.kutular;
    const i = K.length;
    this.sayac.n += this.noktalar.length + 3 * K.length;
    const b = new Kutu(i, p, o, x, y, z);
    if (this.altGecerli && this.altSay > 0) {
      b.alt = Array.from(this.altTampon.subarray(0, this.altSay));
      for (const c of b.alt) K[c].yuk += p.agirlik;
    }
    K.push(b);
    const kb = this.kb;
    const ilk = Math.floor(z / kb);
    const son = Math.floor((b.ze - 1) / kb);
    for (let k = ilk; k <= son; k++) this.kovalar[k].push(i);
    this.agirlik += p.agirlik;
    this.hacim += b.w * b.h * b.l;
    if (b.ze > this.kullanilan) this.kullanilan = b.ze;
    if (p.grup < this.grupMin) this.grupMin = p.grup;
    if (p.grup > this.grupMax) this.grupMax = p.grup;

    // Yeni kutunun içinde kalan köşeler silinir
    const N = this.noktalar;
    const yOnce = this.yOnce;
    let m = 0;
    for (let j = 0; j < N.length; j++) {
      const k = N[j];
      const a = Math.floor(k / B32);
      const r = k - a * B32;
      const c = Math.floor(r / B16);
      const px = r - c * B16;
      const py = yOnce ? a : c;
      const pz = yOnce ? c : a;
      const icinde = px >= b.x && px < b.xe && py >= b.y && py < b.ye && pz >= b.z && pz < b.ze;
      if (!icinde) N[m++] = k;
    }
    N.length = m;
    this.noktaUret(b);
  }

  /** Yeni kutunun açtığı köşeler ve bunların izdüşümleri */
  noktaUret(b) {
    // Sağı
    if (b.xe < this.W) {
      this.ekle(b.xe, b.y, b.z);
      this.ekle(b.xe, this.asagi(b.xe, b.y, b.z), b.z);
      this.ekle(b.xe, b.y, this.one(b.xe, b.y, b.z));
    }
    // Üstü (yalnız üstüne konabiliyorsa)
    if (b.ye < this.H && b.ustuneKonabilir && b.sinir > 0) {
      this.ekle(b.x, b.ye, b.z);
      this.ekle(this.sola(b.x, b.ye, b.z), b.ye, b.z);
      this.ekle(b.x, b.ye, this.one(b.x, b.ye, b.z));
    }
    // Kapı tarafı
    if (b.ze < this.L) {
      this.ekle(b.x, b.y, b.ze);
      this.ekle(this.sola(b.x, b.y, b.ze), b.y, b.ze);
      this.ekle(b.x, this.asagi(b.x, b.y, b.ze), b.ze);
    }
  }

  ekle(x, y, z) {
    this.sayac.n += 4;
    if (x >= this.W || y >= this.H || z >= this.L) return;
    if (this.icindeMi(x, y, z)) return;
    const k = this.anahtar(x, y, z);
    const N = this.noktalar;
    let lo = 0;
    let hi = N.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (N[m] < k) lo = m + 1;
      else hi = m;
    }
    if (N[lo] === k) return;
    N.splice(lo, 0, k);
  }

  icindeMi(x, y, z) {
    const kova = this.kovalar[Math.floor(z / this.kb)];
    this.sayac.n += kova.length;
    const K = this.kutular;
    for (let j = 0; j < kova.length; j++) {
      const b = K[kova[j]];
      if (x >= b.x && x < b.xe && y >= b.y && y < b.ye && z >= b.z && z < b.ze) return true;
    }
    return false;
  }

  /** Noktadan aşağı inince ilk değilen yüzey (yoksa taban) */
  asagi(x, y, z) {
    const kova = this.kovalar[Math.floor(z / this.kb)];
    this.sayac.n += kova.length;
    const K = this.kutular;
    let en = 0;
    for (let j = 0; j < kova.length; j++) {
      const b = K[kova[j]];
      if (b.ye <= y && b.ye > en && x >= b.x && x < b.xe && z >= b.z && z < b.ze) en = b.ye;
    }
    return en;
  }

  /** Noktadan sola gidince ilk değilen yüzey (yoksa sol duvar) */
  sola(x, y, z) {
    const kova = this.kovalar[Math.floor(z / this.kb)];
    this.sayac.n += kova.length;
    const K = this.kutular;
    let en = 0;
    for (let j = 0; j < kova.length; j++) {
      const b = K[kova[j]];
      if (b.xe <= x && b.xe > en && y >= b.y && y < b.ye && z >= b.z && z < b.ze) en = b.xe;
    }
    return en;
  }

  /** Noktadan ön duvara doğru gidince ilk değilen yüzey (yoksa ön duvar) */
  one(x, y, z) {
    const K = this.kutular;
    let en = 0;
    for (let j = 0; j < K.length; j++) {
      const b = K[j];
      if (b.ze <= z && b.ze > en && x >= b.x && x < b.xe && y >= b.y && y < b.ye) en = b.ze;
    }
    return en;
  }
}

// ---------------------------------------------------------------------------
// Tek çözüm turu
// ---------------------------------------------------------------------------

/**
 * Araç planı: kaçıncı aracın hangi tipte olacağı.
 *   seq: tip numaraları sırayla; tekrar: true ise son tip gerektikçe yinelenir.
 */
function planOlustur(seq, tekrar) {
  return { seq, tekrar, siniri: tekrar ? ARAC_SINIRI : seq.length };
}

function planTipi(plan, k) {
  if (k < plan.seq.length) return plan.seq[k];
  return plan.tekrar ? plan.seq[plan.seq.length - 1] : -1;
}

/**
 * Parçaları verilen sırayla araçlara yerleştirir. Her parça önce açık
 * araçlarda denenir, sığmazsa plandaki sıradaki araç açılır.
 * kesme: güvenlik süresi; bu ana gelinince tur yarıda bırakılır (null döner).
 * Dönen nesnedeki "adim", turun harcadığı iş birimidir.
 */
function coz(o, plan, sira, yonTablosu, mod, kesme) {
  const enIyi = mod === "enIyi" || mod === "zeminEnIyi";
  const yOnce = mod === "zemin" || mod === "zeminEnIyi";
  const araclar = [];
  const sigmayan = [];
  const sayac = { n: 0 };
  const kesmeVar = kesme !== undefined && kesme !== Infinity;

  for (let s = 0; s < sira.length; s++) {
    if (kesmeVar && (s & 7) === 0 && simdi() > kesme) return null;
    const p = sira[s];
    const yonler = yonTablosu[p.no];
    let yerlesti = false;
    let tonaj = false;
    let kural = false;
    for (const a of araclar) {
      sayac.n += 2;
      if (a.maxW > 0 && a.agirlik + p.agirlik > a.maxW + 1e-9) {
        tonaj = true;
        continue;
      }
      const onceki = a.basarisiz.get(p.imza);
      if (onceki !== undefined && onceki[0] === a.kutular.length) {
        if (onceki[1] === KURAL) kural = true;
        continue;
      }
      if (a.yerlestir(p, yonler, enIyi)) {
        yerlesti = true;
        break;
      }
      a.basarisiz.set(p.imza, [a.kutular.length, a.sonRet]);
      if (a.sonRet === KURAL) kural = true;
    }
    if (!yerlesti) {
      // Plandaki sıradaki araçlardan bu parçanın sığabildiği ilkine kadar araç
      // açılır. Aradaki araçlar boş açılır; sonraki parçalar onları kullanabilir.
      let hedef = -1;
      for (let k = araclar.length; k < plan.siniri; k++) {
        const t = planTipi(plan, k);
        if (t < 0) break;
        if (p.tipUygun[t]) {
          hedef = k;
          break;
        }
        // Son tip yineleniyor ve parça ona sığmıyor: ileride de sığmaz
        if (plan.tekrar && k >= plan.seq.length - 1) break;
      }
      if (hedef >= 0) {
        while (araclar.length <= hedef) {
          sayac.n += ARAC_KURMA_PAYI;
          araclar.push(new Arac(o.tipler[planTipi(plan, araclar.length)], o.oran, yOnce, sayac));
        }
        yerlesti = araclar[hedef].yerlestir(p, yonler, enIyi);
      }
    }
    if (!yerlesti) {
      sigmayan.push({ p, sebep: kural ? "kural" : tonaj ? "agirlik" : "sinir" });
    }
  }
  // Hiç parça almamış ara araçlar sonuçtan çıkarılır
  const dolu = araclar.filter((a) => a.kutular.length > 0);
  return { araclar: dolu, sigmayan, puan: null, adim: sayac.n + TUR_PARCA_PAYI * sira.length };
}

// ---------------------------------------------------------------------------
// Ortalama, ağırlık merkezi ve puan
// ---------------------------------------------------------------------------

/** Farklı teslimat gruplarındaki iki kutu arasında kapı yolu ihlali var mı */
function lifoIhlali(b, q) {
  if (b.grup === q.grup) return false;
  if (!(b.x < q.xe && q.x < b.xe && b.y < q.ye && q.y < b.ye)) return false;
  const once = b.grup < q.grup ? b : q;
  const sonra = once === b ? q : b;
  return sonra.z >= once.ze;
}

/**
 * Yanal ortalama. Uzunlukta birbirine değmeyen kesitler ayrı ayrı sağa
 * kaydırılarak ağırlık merkezi ortaya getirilir. Kesit içindeki ilişkiler
 * (çakışma, destek, üstteki yük) aynen korunur; kesitler arasında
 * izdüşüm kesişmesi olmadığından yalnız teslimat sırası yeniden denetlenir.
 */
function ortala(a) {
  if (a.ortalandi) return;
  a.ortalandi = true;
  const K = a.kutular;
  if (K.length === 0) return;
  const sirali = K.slice().sort((p, q) => p.z - q.z);
  const kesitler = [];
  let kesit = [];
  let son = -1;
  for (const b of sirali) {
    if (kesit.length && b.z >= son) {
      kesitler.push(kesit);
      kesit = [];
      son = -1;
    }
    kesit.push(b);
    if (b.ze > son) son = b.ze;
  }
  if (kesit.length) kesitler.push(kesit);

  const gruplu = a.grupMin !== a.grupMax;
  for (const ks of kesitler) {
    let minX = Infinity, maxX = 0, tw = 0, mw = 0, tv = 0, mv = 0;
    for (const b of ks) {
      if (b.x < minX) minX = b.x;
      if (b.xe > maxX) maxX = b.xe;
      const cx = b.x + b.w / 2;
      tw += b.agirlik;
      mw += cx * b.agirlik;
      const v = b.w * b.h * b.l;
      tv += v;
      mv += cx * v;
    }
    const xg = tw > 0 ? mw / tw : mv / tv;
    let s = Math.round(a.W / 2 - xg);
    s = Math.max(-minX, Math.min(a.W - maxX, s));
    if (s === 0) continue;
    for (const b of ks) {
      b.x += s;
      b.xe += s;
    }
    if (gruplu) {
      const icinde = new Set(ks);
      let bozuk = false;
      for (const b of ks) {
        for (const q of K) {
          if (!icinde.has(q) && lifoIhlali(b, q)) {
            bozuk = true;
            break;
          }
        }
        if (bozuk) break;
      }
      if (bozuk) {
        for (const b of ks) {
          b.x -= s;
          b.xe -= s;
        }
      }
    }
  }
}

function agirlikMerkezi(a) {
  let tw = 0, mx = 0, my = 0, mz = 0;
  let tv = 0, vx = 0, vy = 0, vz = 0;
  for (const b of a.kutular) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, cz = b.z + b.l / 2;
    tw += b.agirlik;
    mx += cx * b.agirlik;
    my += cy * b.agirlik;
    mz += cz * b.agirlik;
    const v = b.w * b.h * b.l;
    tv += v;
    vx += cx * v;
    vy += cy * v;
    vz += cz * v;
  }
  if (tw > 0) return { x: mx / tw, y: my / tw, z: mz / tw };
  if (tv > 0) return { x: vx / tv, y: vy / tv, z: vz / tv };
  return { x: a.W / 2, y: 0, z: a.Lg / 2 };
}

/**
 * Boyuna dengeleme. Bütün yük, göreli düzeni bozulmadan uzunluk ekseninde
 * geriye kaydırılır. Hedef: aks bilgisi varsa ağırlık merkezi şasi ile aks
 * grubunun ortasına, yoksa kullanılabilir uzunluğun ortasına gelir.
 * Kaydırma 0 ile (kullanılabilir uzunluk - en arkadaki parçanın bittiği yer)
 * arasında kırpılır. Tek tip kaydırma çakışmayı, desteği, üst yükü ve
 * teslimat sırasını değiştirmez. Dönen değer kaydırma (mm).
 */
function boyunaDengele(a) {
  a.kaydirma = 0;
  if (a.kutular.length === 0) return 0;
  const m = agirlikMerkezi(a);
  const aks = a.tip.aks;
  const hedef = aks ? (aks.s + aks.a) / 2 : a.L / 2;
  let d = Math.round(hedef - m.z);
  d = Math.max(0, Math.min(a.L - a.kullanilan, d));
  if (d > 0) {
    for (const b of a.kutular) {
      b.z += d;
      b.ze += d;
    }
    a.kullanilan += d;
  }
  a.kaydirma = d;
  return d;
}

/** Ağırlık merkezinin aracın ortasından uzaklığı (en ve iç uzunluğa göre oranlı) */
function merkezPuani(a) {
  const m = agirlikMerkezi(a);
  return Math.abs(m.x - a.W / 2) / a.W + Math.abs(m.z - a.Lg / 2) / a.Lg;
}

function puanla(c) {
  let sh = 0;
  for (const s of c.sigmayan) sh += s.p.hacim;
  const n = c.araclar.length;
  let g = 0, tw = 0, t = 0;
  for (const a of c.araclar) {
    ortala(a);
    const w = a.agirlik > 0 ? a.agirlik : 1;
    g += w * merkezPuani(a);
    tw += w;
    t += a.Lg;
  }
  return {
    s: c.sigmayan.length,
    sh,
    a: n,
    t, // kullanılan araçların toplam iç uzunluğu: eşit sayıda araçta kısa araç yeğlenir
    u: n ? c.araclar[n - 1].kullanilan : 0,
    g: tw ? g / tw : 0,
  };
}

/**
 * a puanı b'den iyiyse true. Sıra: sığmayan sayısı ve hacmi, araç sayısı,
 * araçların toplam iç uzunluğu (tek tip filoda araç sayısıyla aynı sırayı
 * verir), son aracın kullanılan uzunluğu, ağırlık merkezi.
 */
function dahaIyi(a, b) {
  if (a.s !== b.s) return a.s < b.s;
  if (a.sh !== b.sh) return a.sh < b.sh;
  if (a.a !== b.a) return a.a < b.a;
  if (a.t !== b.t) return a.t < b.t;
  if (a.u !== b.u) return a.u < b.u;
  return a.g < b.g - 1e-9;
}

// ---------------------------------------------------------------------------
// Sıralama ve yön tercihleri
// ---------------------------------------------------------------------------

const SIRALAMALAR = {
  hacim: (a, b) => b.hacim - a.hacim || b.agirlik - a.agirlik,
  agirlik: (a, b) => b.agirlik - a.agirlik || b.hacim - a.hacim,
  taban: (a, b) => b.taban - a.taban || b.yukseklik - a.yukseklik,
  uzunluk: (a, b) => b.enUzunYatay - a.enUzunYatay || b.hacim - a.hacim,
  kenar: (a, b) => b.enUzunKenar - a.enUzunKenar || b.hacim - a.hacim,
  yukseklik: (a, b) => b.yukseklik - a.yukseklik || b.hacim - a.hacim,
};

const AD_MOD = {
  enIyi: "en kısa boy",
  duvar: "önden duvar örme",
  zeminEnIyi: "önce taban, kısa boy",
  zemin: "önce taban",
};
const AD_SIRA = {
  hacim: "hacme göre",
  agirlik: "ağırlığa göre",
  taban: "taban alanına göre",
  uzunluk: "uzunluğa göre",
  kenar: "en büyük kenara göre",
  yukseklik: "yüksekliğe göre",
};
const AD_YON = { dogal: "girilen yön", boyuna: "boyuna", enine: "enine", alcak: "yatık" };

const MODLAR = ["enIyi", "duvar", "zeminEnIyi", "zemin"];
const SIRA_ADLARI = ["hacim", "agirlik", "taban", "uzunluk", "kenar", "yukseklik"];
const TERCIHLER = ["dogal", "boyuna", "enine", "alcak"];
// [yalnız zemin olanlar önce, üstüne konamayanlar sona]
const BAYRAKLAR = [
  [true, false],
  [true, true],
  [false, true],
  [false, false],
];

/**
 * Teslimat sırası her zaman korunur: büyük numara önce yüklenir.
 * Sonra isteğe bağlı bayraklar, en son seçilen ölçüt gelir.
 */
function siraUret(parcalar, siralama, zeminOnce, konamazSona) {
  const f = SIRALAMALAR[siralama];
  return parcalar.slice().sort((a, b) => {
    if (a.grup !== b.grup) return b.grup - a.grup;
    if (zeminOnce && a.yalnizZemin !== b.yalnizZemin) return a.yalnizZemin ? -1 : 1;
    if (konamazSona && a.ustuneKonabilir !== b.ustuneKonabilir) return a.ustuneKonabilir ? -1 : 1;
    return f(a, b) || a.no - b.no;
  });
}

function yonSirala(p, tercih) {
  const y = p.yonler.slice();
  const dik = (o) => (o.h === p.yukseklik ? 1 : 0);
  if (tercih === "boyuna") y.sort((a, b) => dik(b) - dik(a) || b.l - a.l || a.i - b.i);
  else if (tercih === "enine") y.sort((a, b) => dik(b) - dik(a) || b.w - a.w || a.i - b.i);
  else if (tercih === "alcak") y.sort((a, b) => a.h - b.h || b.l - a.l || a.i - b.i);
  return y;
}

/** Denenecek başlangıçlar, umut verici olanlar önce */
function konfigListesi() {
  const liste = [];
  const ekle = (t, b, s, m) =>
    liste.push({ tercih: t, zeminOnce: b[0], konamazSona: b[1], siralama: s, mod: m });
  for (const s of SIRA_ADLARI) for (const m of MODLAR) ekle("dogal", BAYRAKLAR[0], s, m);
  for (const b of BAYRAKLAR.slice(1)) for (const s of SIRA_ADLARI) for (const m of MODLAR) ekle("dogal", b, s, m);
  for (const t of TERCIHLER.slice(1)) {
    for (const b of BAYRAKLAR) for (const s of SIRA_ADLARI) for (const m of MODLAR) ekle(t, b, s, m);
  }
  return liste;
}

function durumImzasi(mod, sira, yon) {
  let s = mod;
  for (const p of sira) {
    s += "," + p.no + ":";
    for (const o of yon[p.no]) s += o.i;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Arama
// ---------------------------------------------------------------------------

/**
 * Tek bir araç planı için arama.
 * @param plan   planOlustur çıktısı
 * @param butce  bu aramanın iş birimi bütçesi
 * @param iz     ortak izleme: { ilerleme, toplam, onceki, sonBildirim }
 */
function ara(o, plan, butce, t0, iz) {
  const P = o.parcalar;
  const n = P.length;
  // Arama iş birimiyle sınırlanır; saat yalnız güvenlik içindir
  const bitis = t0 + o.sure;
  const rnd = tohumluRastgele(girdiTohumu(o));
  let deneme = 0;
  let adim = 0;
  let sureSiniri = false;

  /** Güvenlik süresi doldu mu (dolarsa sonuç belirlenimci olmaktan çıkar ve işaretlenir) */
  const sureDoldu = () => {
    if (!sureSiniri && simdi() > bitis) sureSiniri = true;
    return sureSiniri;
  };

  const bildir = () => {
    if (!iz.ilerleme) return;
    const t = simdi();
    if (t - iz.sonBildirim < 100) return;
    iz.sonBildirim = t;
    iz.ilerleme(Math.max(0, Math.min(99, Math.round(((iz.onceki + adim) / iz.toplam) * 100))));
  };

  const yonTablolari = {};
  for (const t of TERCIHLER) {
    const tab = new Array(o.toplamParca);
    for (const p of P) tab[p.no] = yonSirala(p, t);
    yonTablolari[t] = tab;
  }

  const degerlendir = (durum, kesme) => {
    const c = coz(o, plan, durum.sira, durum.yon, durum.mod, kesme);
    if (!c) {
      sureSiniri = true;
      return null;
    }
    adim += c.adim;
    deneme++;
    c.puan = puanla(c);
    bildir();
    return c;
  };

  // 1) Başlangıçlar
  const konfigler = konfigListesi();
  const gorulen = new Set();
  const adaylar = [];
  let enIyi = null;
  for (const k of konfigler) {
    if (enIyi && (adim >= butce * 0.45 || sureDoldu())) break;
    const sira = siraUret(P, k.siralama, k.zeminOnce, k.konamazSona);
    const yon = yonTablolari[k.tercih];
    const imza = durumImzasi(k.mod, sira, yon);
    if (gorulen.has(imza)) continue;
    gorulen.add(imza);
    const durum = { mod: k.mod, sira, yon, konfig: k, iyilestirme: 0 };
    const c = degerlendir(durum, enIyi ? bitis : Infinity);
    if (!c) break;
    adaylar.push({ durum, c });
    if (!enIyi || dahaIyi(c.puan, enIyi.c.puan)) enIyi = { durum, c };
  }
  if (!enIyi) return { c: { araclar: [], sigmayan: [], puan: null }, durum: null, deneme, cilali: false, sureSiniri, adim };

  // 2) Yerel iyileştirme: en iyi birkaç başlangıçtan sıra takası
  // Teslimat grupları sırada blok hâlinde durur; takas yalnız blok içinde yapılır
  const grupBas = new Int32Array(n);
  const grupSon = new Int32Array(n);
  {
    const ornek = enIyi.durum.sira;
    let b = 0;
    for (let i = 1; i <= n; i++) {
      if (i === n || ornek[i].grup !== ornek[b].grup) {
        for (let j = b; j < i; j++) {
          grupBas[j] = b;
          grupSon[j] = i;
        }
        b = i;
      }
    }
  }
  const donebilenler = P.filter((p) => p.yonler.length > 1);
  // Aynı imzalı (birebir aynı) iki parçanın yer değiştirmesi sonucu değiştirmez
  const farkliVar = P.some((p) => p.imza !== P[0].imza);

  /** Son araçtaki bir parçayı sırada öne alır: önceki araçlara girme şansı artar */
  const oneAl = (sira, c) => {
    const sonArac = c.araclar.length - 1;
    if (sonArac < 1) return false;
    const sonKume = new Set(c.araclar[sonArac].kutular.map((b) => b.p));
    const secenek = [];
    for (let i = 0; i < n; i++) if (sonKume.has(sira[i]) && i > grupBas[i]) secenek.push(i);
    if (!secenek.length) return false;
    const i = secenek[Math.floor(rnd() * secenek.length)];
    const j = grupBas[i] + Math.floor(rnd() * (i - grupBas[i]));
    const [p] = sira.splice(i, 1);
    sira.splice(j, 0, p);
    return true;
  };

  /** Aynı teslimat grubundaki iki parçayı takas eder ya da birini başka yere taşır */
  const takas = (sira, yerDegistir) => {
    if (n < 2 || !farkliVar) return false;
    for (let deneme = 0; deneme < 8; deneme++) {
      const i = Math.floor(rnd() * n);
      const bas = grupBas[i];
      const boy = grupSon[i] - bas;
      if (boy < 2) continue;
      let j = bas + Math.floor(rnd() * (boy - 1));
      if (j >= i) j++;
      if (sira[i].imza === sira[j].imza) continue;
      if (yerDegistir) {
        const t = sira[i];
        sira[i] = sira[j];
        sira[j] = t;
      } else {
        const [p] = sira.splice(i, 1);
        sira.splice(j, 0, p);
      }
      return true;
    }
    return false;
  };

  /** Bir parçanın yön tercihini değiştirir */
  const yonDegistir = (yon) => {
    if (!donebilenler.length) return null;
    const p = donebilenler[Math.floor(rnd() * donebilenler.length)];
    const yeni = yon.slice();
    const liste = yeni[p.no].slice();
    const k = 1 + Math.floor(rnd() * (liste.length - 1));
    const [y] = liste.splice(k, 1);
    liste.unshift(y);
    yeni[p.no] = liste;
    return yeni;
  };

  const komsu = (durum, c) => {
    const sira = durum.sira.slice();
    let yon = durum.yon;
    const r = rnd();
    const sonuc = () => ({ mod: durum.mod, sira, yon, konfig: durum.konfig, iyilestirme: durum.iyilestirme + 1 });
    if (r < 0.3 && oneAl(sira, c)) return sonuc();
    if (r >= 0.8) {
      const y = yonDegistir(yon);
      if (y) {
        yon = y;
        return sonuc();
      }
    }
    if (takas(sira, r < 0.55)) return sonuc();
    const y = yonDegistir(yon);
    if (y) {
      yon = y;
      return sonuc();
    }
    return null;
  };

  adaylar.sort((a, b) => (dahaIyi(a.c.puan, b.c.puan) ? -1 : dahaIyi(b.c.puan, a.c.puan) ? 1 : 0));
  const yerelSinir = butce * 0.85;
  const durgunSiniri = Math.max(120, 6 * n);
  for (const bas of adaylar.slice(0, 3)) {
    // Değiştirilecek bir şey yoksa (hepsi aynı ve dönmüyor) iyileştirme atlanır
    if (adim >= yerelSinir || sureDoldu() || (!farkliVar && !donebilenler.length)) break;
    let cur = bas.durum;
    let curC = bas.c;
    let durgun = 0;
    while (durgun < durgunSiniri && adim < yerelSinir && !sureDoldu()) {
      const yeni = komsu(cur, curC);
      if (!yeni) break;
      const c = degerlendir(yeni, bitis);
      if (!c) break;
      if (dahaIyi(c.puan, curC.puan)) {
        durgun = 0;
        cur = yeni;
        curC = c;
        if (dahaIyi(c.puan, enIyi.c.puan)) enIyi = { durum: yeni, c };
      } else {
        if (!dahaIyi(curC.puan, c.puan)) {
          cur = yeni;
          curC = c;
        }
        durgun++;
      }
    }
  }

  // 3) Cila: her araç kendi parçalarıyla yeniden denenir.
  // Son araçta önce boy, sonra ağırlık merkezi; diğerlerinde ağırlık merkezi.
  const c = enIyi.c;
  let cilali = false;
  if (c.sigmayan.length === 0 && c.araclar.length > 0) {
    const sonNo = c.araclar.length - 1;
    const sira = [sonNo];
    for (let i = 0; i < sonNo; i++) sira.push(i);
    for (const vi of sira) {
      if (adim >= butce || sureDoldu()) break;
      const sonMu = vi === sonNo;
      const parcalar = c.araclar[vi].kutular.map((b) => b.p);
      // Araç kendi tipiyle, tek başına yeniden kurulur
      const tekPlan = planOlustur([c.araclar[vi].tip.no], false);
      let mevcutU = sonMu ? c.araclar[vi].kullanilan : 0;
      let mevcutG = merkezPuani(c.araclar[vi]);
      const yerelGorulen = new Set();
      for (const k of konfigler) {
        if (adim >= butce || sureDoldu()) break;
        const s = siraUret(parcalar, k.siralama, k.zeminOnce, k.konamazSona);
        const yon = yonTablolari[k.tercih];
        const imza = durumImzasi(k.mod, s, yon);
        if (yerelGorulen.has(imza)) continue;
        yerelGorulen.add(imza);
        const cc = coz(o, tekPlan, s, yon, k.mod, bitis);
        if (!cc) {
          sureSiniri = true;
          break;
        }
        adim += cc.adim;
        deneme++;
        bildir();
        if (cc.sigmayan.length) continue;
        const a = cc.araclar[0];
        ortala(a);
        const u = sonMu ? a.kullanilan : 0;
        const g = merkezPuani(a);
        if (u < mevcutU || (u === mevcutU && g < mevcutG - 1e-9)) {
          c.araclar[vi] = a;
          mevcutU = u;
          mevcutG = g;
          cilali = true;
        }
      }
    }
    if (cilali) c.puan = puanla(c);
  }

  return { c, durum: enIyi.durum, deneme, cilali, sureSiniri, adim, butce };
}

// ---------------------------------------------------------------------------
// Yükleme sırası
// ---------------------------------------------------------------------------

/**
 * Yükleme sırası: ön duvardan kapıya, alttan üste.
 * Kısıtlar: (1) alttaki parça üstündekinden önce yüklenir;
 * (2) bir parçanın kapıya giden yolunda duran parça ondan sonra yüklenir.
 * Kısıtlar içinde en öndeki, en alttaki, en soldaki parça seçilir.
 */
function yuklemeSirasi(K) {
  const n = K.length;
  const sonra = [];
  for (let i = 0; i < n; i++) sonra.push([]);
  const derece = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const a = K[i];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = K[j];
      if (!(a.x < b.xe && b.x < a.xe)) continue;
      const zo = a.z < b.ze && b.z < a.ze;
      const yo = a.y < b.ye && b.y < a.ye;
      if ((zo && a.ye <= b.y) || (yo && b.z >= a.ze)) {
        sonra[i].push(j);
        derece[j]++;
      }
    }
  }
  const once = (a, b) => a.z - b.z || a.y - b.y || a.x - b.x;
  const alindi = new Uint8Array(n);
  const sonuc = [];
  for (let adim = 0; adim < n; adim++) {
    let sec = -1;
    for (let i = 0; i < n; i++) {
      if (alindi[i] || derece[i] > 0) continue;
      if (sec < 0 || once(K[i], K[sec]) < 0) sec = i;
    }
    if (sec < 0) {
      // Döngü olursa (beklenmez) en öndeki seçilir
      for (let i = 0; i < n; i++) {
        if (alindi[i]) continue;
        if (sec < 0 || once(K[i], K[sec]) < 0) sec = i;
      }
    }
    alindi[sec] = 1;
    sonuc.push(K[sec]);
    for (const j of sonra[sec]) derece[j]--;
  }
  return sonuc;
}

// ---------------------------------------------------------------------------
// Çıktı
// ---------------------------------------------------------------------------

function trSayi(n, basamak) {
  const s = Math.abs(n).toFixed(basamak);
  let [tam, kesir] = s.split(".");
  tam = tam.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (kesir) kesir = kesir.replace(/0+$/, "");
  return (n < 0 ? "-" : "") + tam + (kesir ? "," + kesir : "");
}

function yuvarla(n, basamak) {
  const k = Math.pow(10, basamak);
  return Math.round(n * k) / k;
}

function aracCiktisi(a, no, dengele) {
  const o = a.tip; // her araç kendi tipinin değerlerini taşır
  const sira = yuklemeSirasi(a.kutular);
  const yerlesimler = sira.map((b, k) => ({
    sira: k + 1,
    kalemId: b.p.kalemId,
    parcaNo: b.p.parcaNo,
    ad: b.p.ad,
    renk: b.p.renk,
    x: b.x,
    y: b.y,
    z: b.z,
    en: b.w,
    yukseklik: b.h,
    uzunluk: b.l,
    donduruldu: !(b.w === b.p.en && b.h === b.p.yukseklik && b.l === b.p.uzunluk),
    ustte: b.y > 0,
    agirlik: b.p.agirlik,
  }));

  const W = a.agirlik;
  const m = agirlikMerkezi(a);
  let aksYukleri = null;
  const uyarilar = [];
  if (o.aks && W > 0) {
    const aksKg = (W * (m.z - o.aks.s)) / (o.aks.a - o.aks.s);
    const sasiKg = W - aksKg;
    aksYukleri = { sasi: Math.round(sasiKg), aks: Math.round(aksKg) };
    if (sasiKg < -0.5) uyarilar.push("Ağırlık merkezi aks grubunun arkasında kalıyor.");
    // Aks payı eksi: ağırlık merkezi şasi kilidinin önünde. Dengeleme açıksa
    // bu durum çoğunlukla düzelir; düzelmediyse seçenek önerilmez.
    if (aksKg < -0.5) {
      uyarilar.push(
        dengele
          ? "Ağırlık merkezi şasi kilidinin önünde."
          : "Ağırlık merkezi şasi kilidinin önünde; yükü geriye almak için 'Kısa yükü ortala' seçeneğini açın."
      );
    }
  }
  const sapma = m.x - o.W / 2;
  if (Math.abs(sapma) > 0.1 * o.W) {
    uyarilar.push(
      `Yük yanlara dengesiz: ağırlık merkezi ortadan ${trSayi(Math.abs(sapma) / 1000, 2)} m ${sapma < 0 ? "solda" : "sağda"}.`
    );
  }
  if (o.maxW > 0 && W > o.maxW + 1e-9) {
    uyarilar.push(`Tonaj aşılıyor: yük ${trSayi(W, 0)} kg, araç sınırı ${trSayi(o.maxW, 0)} kg.`);
  }
  const kaydirma = a.kaydirma || 0;
  if (kaydirma > 0) {
    const metre = (kaydirma / 1000).toFixed(2).replace(".", ",");
    uyarilar.push(`Yük, ağırlık dengesi için ${metre} m geriye alındı; arkasını kayışla sabitleyin.`);
  }

  // Doluluk aracın gerçek iç hacmine göre (kapı payı dahil)
  const aracHacmi = o.W * o.H * o.Lgercek;
  return {
    no,
    ad: o.ad,
    en: o.W,
    yukseklik: o.H,
    uzunluk: o.Lgercek,
    kapiPayiMm: o.kapiPayi,
    maksAgirlik: o.maxW,
    aks: o.aksGirdi ? { ...o.aksGirdi } : null,
    toplamAgirlik: yuvarla(W, 2),
    hacimDoluluk: yuvarla((a.hacim / aracHacmi) * 100, 1),
    kullanilanUzunluk: a.kullanilan,
    kaydirmaMm: kaydirma,
    agirlikMerkezi: { x: Math.round(m.x), y: Math.round(m.y), z: Math.round(m.z) },
    aksYukleri,
    uyarilar,
    yerlesimler,
  };
}

function stratejiMetni(o, sonuc) {
  if (!sonuc.durum) return "";
  const k = sonuc.durum.konfig;
  let s = `${AD_MOD[k.mod]}, ${AD_SIRA[k.siralama]}, ${AD_YON[k.tercih]}`;
  if (sonuc.durum.iyilestirme > 0) s += `, ${sonuc.durum.iyilestirme} takasla iyileştirildi`;
  if (sonuc.cilali) s += ", araç içi düzen yeniden kuruldu";
  if (sonuc.ikinciTip !== null && sonuc.ikinciTip !== undefined && sonuc.planSayisi > 1) {
    const ad = o.tipler[sonuc.ikinciTip].ad || `${sonuc.ikinciTip + 1}. araç tipi`;
    s += `, kalan yük için en uygun araç: ${ad}`;
  }
  return `${s} (${sonuc.deneme} deneme)`;
}

/**
 * Denenecek araç planları.
 * sirayla: listedeki araçlar sırayla; çoklu araçta son tip yinelenir.
 * enUygun: birinci araç listenin ilk tipi. Çoklu araçta kalan yük için her
 * tip ayrı denenir (o tip gerektikçe yinelenir). Tek seferlik filoda ikinci
 * sıraya her araç ayrı denenir, kalanlar liste sırasıyla gelir.
 * En iyi plan amaç sırasıyla seçilir; eşitlikte listede önce gelen kazanır.
 */
function planlariUret(o) {
  const n = o.tipler.length;
  const tumu = [];
  for (let i = 0; i < n; i++) tumu.push(i);
  if (o.filoSecimi !== "enUygun" || n === 1) {
    return [{ plan: planOlustur(tumu, o.cokluArac), ikinci: null }];
  }
  const liste = [];
  if (o.cokluArac) {
    for (let t = 0; t < n; t++) liste.push({ plan: planOlustur([0, t], true), ikinci: t });
  } else {
    for (let j = 1; j < n; j++) {
      const seq = [0, j];
      for (const i of tumu) if (i !== 0 && i !== j) seq.push(i);
      liste.push({ plan: planOlustur(seq, false), ikinci: j });
    }
  }
  return liste;
}

// ---------------------------------------------------------------------------
// Dış arayüz
// ---------------------------------------------------------------------------

/**
 * Yerleşimi hesaplar.
 * @param girdi  sözleşmedeki girdi
 * @param ayar   isteğe bağlı: { ilerleme(yuzde) } ilerleme bildirimi için
 * @returns      sözleşmedeki çıktı
 */
export function planla(girdi, ayar = {}) {
  const t0 = simdi();
  const o = hazirla(girdi);
  const ilerleme = ayar && typeof ayar.ilerleme === "function" ? ayar.ilerleme : null;

  let sonuc = { c: { araclar: [], sigmayan: [] }, durum: null, deneme: 0, cilali: false, sureSiniri: false };
  if (o.parcalar.length) {
    // Toplam iş bütçesi plan sayısından bağımsızdır: süre plan sayısıyla artmaz
    const toplam = Math.min(ADIM_UST, ADIM_TABAN + ADIM_PARCA * o.parcalar.length);
    const planlar = planlariUret(o);
    const iz = { ilerleme, toplam, onceki: 0, sonBildirim: -Infinity };
    let enIyi = null;
    let deneme = 0;
    let sureSiniri = false;
    const calistir = (pl, butce) => {
      const r = ara(o, pl.plan, butce, t0, iz);
      iz.onceki += r.adim;
      deneme += r.deneme;
      if (r.sureSiniri) sureSiniri = true;
      r.ikinciTip = pl.ikinci;
      return r;
    };
    if (planlar.length === 1) {
      enIyi = calistir(planlar[0], toplam);
    } else {
      // 1) Ön değerlendirme: her plan kısa bir aramayla denenir.
      //    Eşitlikte önceki plan (listede önce gelen tip) kalır.
      const onPay = Math.floor((toplam * ON_DEGERLENDIRME_PAYI) / planlar.length);
      let kazanan = null;
      for (const pl of planlar) {
        const r = calistir(pl, onPay);
        if (r.c.puan && (!enIyi || dahaIyi(r.c.puan, enIyi.c.puan))) {
          enIyi = r;
          kazanan = pl;
        }
        if (sureSiniri) break;
      }
      // 2) Kalan bütçe kazanan plana verilir; ön sonuçtan kötü değilse o alınır
      if (kazanan && !sureSiniri) {
        const r = calistir(kazanan, Math.max(1, toplam - iz.onceki));
        if (r.c.puan && !dahaIyi(enIyi.c.puan, r.c.puan)) enIyi = r;
      }
    }
    if (enIyi) sonuc = { ...enIyi, deneme, sureSiniri, planSayisi: planlar.length };
  }

  const araclar = sonuc.c.araclar.map((a, i) => {
    ortala(a);
    if (o.dengele) boyunaDengele(a);
    return aracCiktisi(a, i + 1, o.dengele);
  });

  const sigmayanHam = o.elenenler.concat(sonuc.c.sigmayan);
  sigmayanHam.sort((a, b) => a.p.no - b.p.no);
  const sigmayanlar = sigmayanHam.map((s) => ({ kalemId: s.p.kalemId, ad: s.p.ad, sebep: s.sebep }));

  let yerlesen = 0;
  let toplamAgirlik = 0;
  for (const a of sonuc.c.araclar) {
    yerlesen += a.kutular.length;
    toplamAgirlik += a.agirlik;
  }
  if (ilerleme) ilerleme(100);

  return {
    araclar,
    sigmayanlar,
    ozet: {
      aracSayisi: araclar.length,
      toplamParca: o.toplamParca,
      yerlesen,
      toplamAgirlik: yuvarla(toplamAgirlik, 2),
      sureMs: Math.round(simdi() - t0),
      sureSiniri: sonuc.sureSiniri === true,
      strateji: stratejiMetni(o, sonuc),
    },
  };
}

// ---------------------------------------------------------------------------
// Elle düzenleme: denetim, kalan boşluk, duvara yaslama
// Arayüzde elle taşınan ya da çevrilen parçalar için. Bütün hesaplar tamsayı
// mm; gelen konumlar yuvarlanır, ızgara adımı (1, 5, 10 cm) motoru ilgilendirmez.
// ---------------------------------------------------------------------------

const YASLAMA_YONLERI = ["sol", "sag", "on", "arka", "asagi"];

/** Yerleşim nesnesinden tamsayı kutu */
function yerlesimKutusu(y, i) {
  const x = Math.round(sayi(y && y.x, 0));
  const yy = Math.round(sayi(y && y.y, 0));
  const z = Math.round(sayi(y && y.z, 0));
  const w = Math.round(sayi(y && y.en, 0));
  const h = Math.round(sayi(y && y.yukseklik, 0));
  const l = Math.round(sayi(y && y.uzunluk, 0));
  return { i, x, y: yy, z, w, h, l, xe: x + w, ye: yy + h, ze: z + l };
}

function kesisir(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

/** Uyarı düzeyindeki ihlal türleri; geri kalanı hatadır */
const UYARI_TURLERI = new Set(["teslimatSirasi"]);

/** Üst ilişkisi: liste[i], i'nin üstündeki parçalar (izdüşüm kesişir, alt yüzü i'nin üst yüzünde ya da yukarıda) */
function ustListesi(K) {
  const n = K.length;
  const liste = [];
  for (let i = 0; i < n; i++) {
    const a = K[i];
    const ustler = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = K[j];
      if (b.y >= a.ye && kesisir(a.x, a.xe, b.x, b.xe) && kesisir(a.z, a.ze, b.z, b.ze)) ustler.push(j);
    }
    liste.push(ustler);
  }
  return liste;
}

/**
 * Başlangıç parçalarının üstünde doğrudan ya da dolaylı duranlar.
 * Bir başlangıç parçası başka bir başlangıcın üstündeyse kümeye o da girer.
 */
function ustKapanisi(ust, baslangiclar) {
  const gor = new Set();
  const yigin = [];
  for (const i of baslangiclar) for (const j of ust[i]) yigin.push(j);
  while (yigin.length) {
    const j = yigin.pop();
    if (gor.has(j)) continue;
    gor.add(j);
    for (const k of ust[j]) yigin.push(k);
  }
  return gor;
}

/** Seçili indeksleri süzer (geçersiz ve yinelenenler atılır) */
function seciliKume(indeksler, n) {
  const k = new Set();
  if (Array.isArray(indeksler)) for (const i of indeksler) if (Number.isInteger(i) && i >= 0 && i < n) k.add(i);
  return k;
}

/**
 * Elle değiştirilmiş yerleşimi baştan denetler ve araçları yeniden hesaplar.
 * @param girdi    planla girdisi (kalem kuralları ve seçenekler buradan okunur)
 * @param araclar  planla çıktısındaki araçlar (konumları elle değişmiş olabilir)
 * @returns { gecerli, ihlaller, araclar }
 *   ihlaller: { aracNo, aracIndeksi, yerlesimIndeksi, kalemId, parcaNo, tur, mesaj, ilgili }
 *     yerlesimIndeksi gelen araçtaki yerleşim dizisinin sırasıdır; tonaj ihlalinde null.
 *   araclar: planla çıktısıyla aynı biçim; yükleme sırası yeni konumlara göre baştan kurulur.
 */
export function denetle(girdi, araclar) {
  if (!girdi || typeof girdi !== "object") throw new MotorHatasi("Denetim için girdi gelmedi.");
  if (!Array.isArray(araclar)) throw new MotorHatasi("Denetlenecek araç listesi gelmedi.");
  const sec = girdi.secenekler || {};
  const oran = sinirla(sayi(sec.destekOrani, VARSAYILAN_DESTEK), 0, 1);
  const dengele = sec.dengele === true;
  const kalemler = new Map();
  (Array.isArray(girdi.kalemler) ? girdi.kalemler : []).forEach((k, ki) => {
    const km = kalemOku(k, ki);
    if (km) kalemler.set(km.kalemId, km);
  });

  const ihlaller = [];
  const cikti = araclar.map((ar, ai) => {
    const tip = tipHazirla(ar, ai, false);
    const no = Number.isInteger(ar.no) ? ar.no : ai + 1;
    const yerlesimler = Array.isArray(ar.yerlesimler) ? ar.yerlesimler : [];

    // Yerleşimleri kalem kurallarıyla birlikte kutulara çevir
    const K = yerlesimler.map((y, i) => {
      const kt = yerlesimKutusu(y, i);
      const km = kalemler.get(String(y && y.kalemId));
      const p = {
        kalemId: String(y && y.kalemId !== undefined ? y.kalemId : ""),
        parcaNo: y && Number.isInteger(y.parcaNo) ? y.parcaNo : i + 1,
        ad: (y && y.ad) || (km && km.ad) || "Parça",
        renk: (y && y.renk) || (km && km.renk) || "#3ABFF0",
        en: km ? km.en : kt.w,
        yukseklik: km ? km.yk : kt.h,
        uzunluk: km ? km.uz : kt.l,
        agirlik: km ? km.agirlik : Math.max(0, sayi(y && y.agirlik, 0)),
        donus: km ? km.donus : "serbest",
        ustuneKonabilir: km ? km.ustuneKonabilir : true,
        yalnizZemin: km ? km.yalnizZemin : false,
        sinir: km ? km.sinir : Infinity,
        grup: km ? km.grup : 0,
      };
      return new Kutu(i, p, { i: 0, w: kt.w, h: kt.h, l: kt.l }, kt.x, kt.y, kt.z);
    });
    const n = K.length;

    const kayit = (tur, b, mesaj, ilgili = []) =>
      ihlaller.push({
        aracNo: no,
        aracIndeksi: ai,
        yerlesimIndeksi: b ? b.i : null,
        kalemId: b ? b.p.kalemId : null,
        parcaNo: b ? b.p.parcaNo : null,
        tur,
        // Teslimat sırası yalnız uyarıdır; diğer bütün türler hatadır
        duzey: UYARI_TURLERI.has(tur) ? "uyari" : "hata",
        mesaj,
        ilgili: ilgili.map((q) => ({ yerlesimIndeksi: q.i, kalemId: q.p.kalemId, parcaNo: q.p.parcaNo, ad: q.p.ad })),
      });

    const ust = ustListesi(K);

    for (let i = 0; i < n; i++) {
      const b = K[i];
      const p = b.p;

      // Taşma (kapı payı dahil)
      if (b.x < 0 || b.y < 0 || b.z < 0 || b.xe > tip.W || b.ye > tip.H || b.ze > tip.Lgercek) {
        kayit("tasma", b, "Araç sınırının dışına taşıyor.");
      } else if (b.ze > tip.L) {
        kayit("tasma", b, "Kapı payına giriyor.");
      }

      // Döndürme kısıtı
      const olculer = [b.w, b.h, b.l];
      const izinli = p.en > 0 && p.yukseklik > 0 && p.uzunluk > 0
        ? yonleriUret(p.en, p.yukseklik, p.uzunluk, p.donus).some((o) => o.w === b.w && o.h === b.h && o.l === b.l)
        : false;
      if (!izinli) {
        const asil = [p.en, p.yukseklik, p.uzunluk].sort((u, v) => u - v).join(",");
        const yer = olculer.slice().sort((u, v) => u - v).join(",");
        const mesaj =
          asil !== yer ? "Ölçüleri kalemin ölçüleriyle uyuşmuyor."
          : p.donus === "sabit" ? "Bu parça döndürülemez."
          : "Bu parça yalnız yatayda çevrilebilir, yan yatırılamaz.";
        kayit("donus", b, mesaj);
      }

      // Çakışma
      const carpan = [];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const q = K[j];
        if (kesisir(b.x, b.xe, q.x, q.xe) && kesisir(b.y, b.ye, q.y, q.ye) && kesisir(b.z, b.ze, q.z, q.ze)) carpan.push(q);
      }
      if (carpan.length) {
        kayit("cakisma", b, carpan.length === 1 ? `${carpan[0].p.ad} ile çakışıyor.` : `${carpan.length} parçayla çakışıyor.`, carpan);
      }

      // Yalnız zemin
      if (b.y > 0 && p.yalnizZemin) kayit("yalnizZemin", b, "Bu parça yalnız tabana konabilir.");

      // Destek: tabanın en az "oran" kadarı, üst yüzü tam bu yükseklikte olan parçalara basmalı
      if (b.y > 0) {
        let destek = 0;
        const altlar = [];
        for (let j = 0; j < n; j++) {
          const q = K[j];
          if (j === i || q.ye !== b.y) continue;
          const dx = Math.min(b.xe, q.xe) - Math.max(b.x, q.x);
          const dz = Math.min(b.ze, q.ze) - Math.max(b.z, q.z);
          if (dx > 0 && dz > 0) {
            destek += dx * dz;
            altlar.push(q);
          }
        }
        const taban = b.w * b.l;
        if (destek <= 0) kayit("destek", b, "Parça havada duruyor.");
        else if (destek < oran * taban - 1e-6) {
          const yuzde = Math.floor((destek / taban) * 100);
          kayit("destek", b, `Altı yeterince dolu değil: tabanın %${yuzde}'i destekli, en az %${Math.round(oran * 100)} gerekir.`, altlar);
        }
      }
    }

    // Üstüne konamaz: ihlal üstteki parçaya yazılır, alttaki "ilgili" olur
    const konamazAlti = new Map();
    for (let i = 0; i < n; i++) {
      if (K[i].p.ustuneKonabilir) continue;
      for (const j of ust[i]) {
        if (!konamazAlti.has(j)) konamazAlti.set(j, []);
        konamazAlti.get(j).push(K[i]);
      }
    }
    for (let j = 0; j < n; j++) {
      const altlar = konamazAlti.get(j);
      if (!altlar) continue;
      const mesaj = altlar.length === 1 ? `Üstüne konamayan parçanın üstünde: ${altlar[0].p.ad}.` : `Üstüne konamayan ${altlar.length} parçanın üstünde.`;
      kayit("ustuneKonamaz", K[j], mesaj, altlar);
    }

    // Üst yük sınırı: üstünde doğrudan ya da dolaylı duran her parça tam ağırlığıyla sayılır
    for (let i = 0; i < n; i++) {
      const b = K[i];
      if (!b.p.ustuneKonabilir || b.p.sinir === Infinity) continue;
      const gor = ustKapanisi(ust, [i]);
      let yuk = 0;
      for (const j of gor) yuk += K[j].agirlik;
      if (yuk > b.p.sinir + 1e-9) {
        kayit("ustYuk", b, `Üstündeki yük ${trSayi(yuk, 0)} kg, sınırı ${trSayi(b.p.sinir, 0)} kg.`, [...gor].map((j) => K[j]));
      }
    }

    // Teslimat sırası (uyarı düzeyi). Küçük numara önce indirilir. Sonra
    // indirilecek parça, önce indirilecek parçanın kapı yolunda (x ve y
    // kesişir, kapı tarafında) ya da üstünde duruyorsa onun önünü kapatır.
    // Kayıt önü kapatan parçaya yazılır; önü kapanan parça "ilgili"de gelir.
    if (K.some((b) => b.p.grup !== K[0].p.grup)) {
      const kapatilan = new Map();
      for (let i = 0; i < n; i++) {
        const a = K[i];
        let ustler = null;
        for (let j = 0; j < n; j++) {
          const b = K[j];
          if (i === j || b.p.grup <= a.p.grup) continue;
          let kapatiyor = kesisir(a.x, a.xe, b.x, b.xe) && kesisir(a.y, a.ye, b.y, b.ye) && b.z >= a.ze;
          if (!kapatiyor) {
            if (!ustler) ustler = ustKapanisi(ust, [i]);
            kapatiyor = ustler.has(j);
          }
          if (kapatiyor) {
            if (!kapatilan.has(j)) kapatilan.set(j, []);
            kapatilan.get(j).push(a);
          }
        }
      }
      for (let j = 0; j < n; j++) {
        const onler = kapatilan.get(j);
        if (!onler) continue;
        const mesaj = onler.length === 1
          ? `Bu parça, daha önce indirilecek ${onler[0].p.ad} parçasının önünü kapatıyor.`
          : `Bu parça, daha önce indirilecek ${onler.length} parçanın önünü kapatıyor.`;
        kayit("teslimatSirasi", K[j], mesaj, onler);
      }
    }

    // Araç nesnesi: planla ile aynı hesaplar (ağırlık merkezi, aks, doluluk, uyarılar, sıra)
    let agirlik = 0;
    let hacim = 0;
    let kullanilan = 0;
    for (const b of K) {
      agirlik += b.agirlik;
      hacim += b.w * b.h * b.l;
      if (b.ze > kullanilan) kullanilan = b.ze;
    }
    if (tip.maxW > 0 && agirlik > tip.maxW + 1e-9) {
      kayit("tonaj", null, `Tonaj aşılıyor: yük ${trSayi(agirlik, 0)} kg, araç sınırı ${trSayi(tip.maxW, 0)} kg.`);
    }
    const a = { tip, W: tip.W, H: tip.H, L: tip.L, Lg: tip.Lgercek, kutular: K, agirlik, hacim, kullanilan, kaydirma: 0 };
    return aracCiktisi(a, no, dengele);
  });

  // Geçerlilik yalnız hata düzeyindeki ihlallere bakar; uyarılar planı geçersiz kılmaz
  return { gecerli: !ihlaller.some((i) => i.duzey === "hata"), ihlaller, araclar: cikti };
}

/**
 * Seçili parçaların üstünde doğrudan ya da dolaylı duran bütün parçalar.
 * "Üstünde": izdüşümü kesişir ve alt yüzü seçili parçanın üst yüzünde ya da
 * daha yukarıda. Arayüz "istifi birlikte taşı" için seçimi bununla genişletir.
 * @returns seçili olmayan parçaların indeksleri, küçükten büyüğe
 */
export function ustundekiler(yerlesimler, indeksler) {
  const K = (Array.isArray(yerlesimler) ? yerlesimler : []).map(yerlesimKutusu);
  const secili = seciliKume(indeksler, K.length);
  if (!secili.size) return [];
  const kume = ustKapanisi(ustListesi(K), [...secili]);
  return [...kume].filter((i) => !secili.has(i)).sort((a, b) => a - b);
}

/** Bir yönde, seçili kutunun önündeki engele uzaklık (engel o yönde değilse null) */
function yondekiMesafe(s, b, yon) {
  const xo = kesisir(s.x, s.xe, b.x, b.xe);
  const yo = kesisir(s.y, s.ye, b.y, b.ye);
  const zo = kesisir(s.z, s.ze, b.z, b.ze);
  switch (yon) {
    case "ust": return b.y >= s.ye && xo && zo ? b.y - s.ye : null;
    case "asagi": return b.ye <= s.y && xo && zo ? s.y - b.ye : null;
    case "sol": return b.xe <= s.x && yo && zo ? s.x - b.xe : null;
    case "sag": return b.x >= s.xe && yo && zo ? b.x - s.xe : null;
    case "on": return b.ze <= s.z && xo && yo ? s.z - b.ze : null;
    case "arka": return b.z >= s.ze && xo && yo ? b.z - s.ze : null;
    default: return null;
  }
}

/** Bir yönde duvara uzaklık; arka yönde kapı payı düşülmüş kapıya */
function duvaraMesafe(s, tip, yon) {
  switch (yon) {
    case "ust": return tip.H - s.ye;
    case "asagi": return s.y;
    case "sol": return s.x;
    case "sag": return tip.W - s.xe;
    case "on": return s.z;
    case "arka": return tip.L - s.ze;
    default: return 0;
  }
}

const DUVAR_ADLARI = { ust: "tavan", asagi: "taban", sol: "sol duvar", sag: "sağ duvar", on: "ön duvar", arka: "kapı" };

/**
 * Seçili parçaların ortak kutusu için kalan boşluk (mm).
 * Seçim yoksa bütün yükün dış kutusu kullanılır.
 * @returns { kutu, duvara: { ust, sol, sag, on, arka }, engele: { yön: { mm, engel } } }
 *   engel: { tur: "duvar", ad } ya da { tur: "parca", yerlesimIndeksi, kalemId, parcaNo, ad }
 */
export function kalanBosluk(arac, yerlesimler, seciliIndeksler) {
  const tip = tipHazirla(arac || {}, 0, false);
  const liste = Array.isArray(yerlesimler) ? yerlesimler : [];
  const K = liste.map(yerlesimKutusu);
  const secili = seciliKume(seciliIndeksler, K.length);
  const grup = secili.size ? K.filter((b) => secili.has(b.i)) : K;
  if (!grup.length) return { kutu: null, duvara: null, engele: null };

  const S = { x: Infinity, y: Infinity, z: Infinity, xe: -Infinity, ye: -Infinity, ze: -Infinity };
  for (const b of grup) {
    S.x = Math.min(S.x, b.x); S.y = Math.min(S.y, b.y); S.z = Math.min(S.z, b.z);
    S.xe = Math.max(S.xe, b.xe); S.ye = Math.max(S.ye, b.ye); S.ze = Math.max(S.ze, b.ze);
  }
  const digerleri = secili.size ? K.filter((b) => !secili.has(b.i)) : [];

  const duvara = {};
  const engele = {};
  for (const yon of ["ust", "sol", "sag", "on", "arka"]) {
    const mm = duvaraMesafe(S, tip, yon);
    duvara[yon] = mm;
    let enIyi = { mm, engel: { tur: "duvar", ad: DUVAR_ADLARI[yon] } };
    for (const b of digerleri) {
      const d = yondekiMesafe(S, b, yon);
      if (d !== null && d <= enIyi.mm) {
        const y = liste[b.i] || {};
        enIyi = { mm: d, engel: { tur: "parca", yerlesimIndeksi: b.i, kalemId: y.kalemId, parcaNo: y.parcaNo, ad: y.ad } };
      }
    }
    engele[yon] = enIyi;
  }
  return {
    kutu: { x: S.x, y: S.y, z: S.z, en: S.xe - S.x, yukseklik: S.ye - S.y, uzunluk: S.ze - S.z },
    duvara,
    engele,
  };
}

/**
 * Seçili parçaları birlikte, belirtilen yöne çakışmadan gidebildikleri en
 * uzak yere iter. "arka" yönünde kapı payı aşılmaz. Seçili olmayan parçalar
 * yerinde kalır; seçili parçanın üstündeki seçilmemiş parça taşınmaz.
 * @param yon  "sol" | "sag" | "on" | "arka" | "asagi"
 * @returns { yerlesimler, mesafe }  yerlesimler: yeni dizi (yalnız seçililerin konumu değişir;
 *   yükleme sırası için ardından denetle çağrılmalı), mesafe: itilen mm
 */
export function yaslan(arac, yerlesimler, indeksler, yon) {
  if (!YASLAMA_YONLERI.includes(yon)) throw new MotorHatasi("Yaslama yönü sol, sag, on, arka ya da asagi olmalı.");
  const tip = tipHazirla(arac || {}, 0, false);
  const liste = Array.isArray(yerlesimler) ? yerlesimler : [];
  const K = liste.map(yerlesimKutusu);
  const secili = seciliKume(indeksler, K.length);
  const kopya = liste.map((y) => ({ ...y }));
  if (!secili.size) return { yerlesimler: kopya, mesafe: 0 };

  let d = Infinity;
  for (const s of K) {
    if (!secili.has(s.i)) continue;
    d = Math.min(d, duvaraMesafe(s, tip, yon));
    for (const b of K) {
      if (secili.has(b.i)) continue;
      const m = yondekiMesafe(s, b, yon);
      if (m !== null) d = Math.min(d, m);
    }
  }
  d = Math.max(0, d);
  if (d > 0) {
    const eksen = yon === "sol" || yon === "sag" ? "x" : yon === "asagi" ? "y" : "z";
    const isaret = yon === "sag" || yon === "arka" ? 1 : -1;
    for (const i of secili) {
      const k = K[i];
      kopya[i].x = k.x;
      kopya[i].y = k.y;
      kopya[i].z = k.z;
      kopya[i][eksen] = k[eksen] + isaret * d;
    }
  }
  return { yerlesimler: kopya, mesafe: d };
}
