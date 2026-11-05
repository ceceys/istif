// Plan ekranının elle düzenleme kipi: 3B'de parça seçme (tık, Ctrl+tık, Shift ile alan), sürükleyerek taşıma
// (Alt ile yükseklik), ok tuşlarıyla kaydırma, R/T/Y ile döndürme, duvara yaslama, otomatik plana dönüş.
// Her değişiklikten sonra motorun denetimi çalışır: hatalı parça kırmızı yanar, özet ve yükleme sırası yenilenir,
// adım geri al geçmişine girer. Kalan boşluk 3B'de ölçü çizgisiyle, yan panelde listeyle gösterilir.
// Motor yalnız js/motor/isci.js üzerinden çağrılır (motor-baglanti.js); konum hesapları duzenleme-hesap.js'tedir.
import { t } from '../dil.js';
import { kac, esnek, mmdenOlcu, olcuBirimi, imperialMi, sayi } from '../bicim.js';
import { simge } from '../simgeler.js';
import { $, $$, bildirim, hataKutusu, diyalogAcikMi } from '../arayuz.js';
import { planDegisti, motorGirdisi, geriAl } from '../durum.js';
import { denetle, kalanBosluk, yaslan, ustundekiler } from '../motor-baglanti.js';
import { motorMetni } from '../motor-metin.js';
import {
  parcaAnahtari, kutu as kutuYap, ortakKutu, kirp, oturt, tasi, dondur, dondurmeIzni,
} from '../duzenleme-hesap.js';

const YONLER = ['ust', 'sol', 'sag', 'on', 'arka'];
const YASLA = ['sol', 'sag', 'on', 'arka', 'asagi'];
const DONDUR = [['R', 'y', 'dondurR'], ['T', 'z', 'dondurT'], ['Y', 'x', 'dondurY']];
const SIMGE = { R: 'dondurYatay', T: 'yanaYatir', Y: 'oneYatir', sol: 'yaslaSol', sag: 'yaslaSag', on: 'yaslaOn', arka: 'yaslaArka', asagi: 'yereIndir' };
/** Canlı denetim aralığı (sürüklerken kare başına değil) */
const CANLI_MS = 60;
const AYAR = 'istif.duzenle';

const kopya = (v) => JSON.parse(JSON.stringify(v));

/** Izgara adımları (mm): metrikte 1, 5, 10 cm; imperial'de 1, 2, 4 inç */
const izgaraAdimlari = () => (imperialMi() ? [25.4, 50.8, 101.6] : [10, 50, 100]);

/** mm → "12,5 cm" (ya da inç) */
const uzunlukMetni = (mm) => `${esnek(mmdenOlcu(mm), 1)} ${olcuBirimi()}`;

function ayarOku() {
  try {
    const v = JSON.parse(localStorage.getItem(AYAR) || '{}');
    return { izgara: [0, 1, 2].includes(v.izgara) ? v.izgara : 1, istif: v.istif !== false };
  } catch {
    return { izgara: 1, istif: true };
  }
}

/**
 * Düzenleyiciyi kurar.
 * @param o plan ekranından: { kok, plan(), aktifArac(), aracSec(i), gorunum(), sonucAraci(a), kalemBul(id), secim(),
 *          secimAyarla(anahtarlar, { kaydir }), sonucYenile(), uyarilariCiz(), ustCiz(), susle(yerlesimler),
 *          isaretler(a), planla({ sorma }), ipucuKapat() }
 */
export function duzenlemeKur(o) {
  const ayar = ayarOku();
  let acik = false;
  let izgara = ayar.izgara;
  let istif = ayar.istif;
  /** Son denetimin ihlalleri (bütün araçlar) */
  let ihlaller = [];
  let denetimNo = 0;
  let boslukNo = 0;
  let secimNo = 0;
  let bosluk = null;
  let olcuAcik = false;
  let surukleme = null;
  let canli = { zaman: 0, saat: 0, calisiyor: false, bekliyor: false };
  let kuyruk = Promise.resolve();
  let kuyrukta = 0;

  const kap = o.kok.querySelector('.sahne-kap');
  const anahtarDugme = o.kok.querySelector('.duzenle-anahtar');
  const cubuk = o.kok.querySelector('.duzen-cubugu');
  cubuk.innerHTML = cubukHtml();

  const izgaraMm = () => izgaraAdimlari()[izgara];

  function ayarYaz() {
    try {
      localStorage.setItem(AYAR, JSON.stringify({ izgara, istif }));
    } catch {
      /* hafıza yoksa oturumluk kalır */
    }
  }

  // ------------------------------------------------------------------ yardımcılar

  function aktif() {
    const p = o.plan();
    const s = p && p.sonuc;
    if (!s || !s.araclar.length) return null;
    const ai = Math.min(o.aktifArac(), s.araclar.length - 1);
    return { p, ai, a: s.araclar[ai] };
  }

  /** Motorun yaslama ve boşluk hesabı için aracın ölçüleri (sonuçtaki araç, eksik alan plandan) */
  function aracOlcu(a) {
    const b = o.sonucAraci(a);
    return { ad: b.ad, en: b.en, yukseklik: b.yukseklik, uzunluk: b.uzunluk, kapiPayiMm: b.kapiPayiMm || 0, maksAgirlik: b.maksAgirlik || 0 };
  }

  const indeksHaritasi = (y) => new Map(y.map((x, i) => [parcaAnahtari(x), i]));

  function seciliIndeksler(y) {
    const h = indeksHaritasi(y);
    return [...o.secim()].map((k) => h.get(k)).filter((i) => i != null).sort((a, b) => a - b);
  }

  /** "İstifi birlikte seç" açıksa seçime üstündeki parçalar eklenir */
  async function istifle(y, ind) {
    if (!istif || !ind.length) return ind;
    try {
      const ek = await ustundekiler(y, ind);
      return [...new Set([...ind, ...ek])].sort((a, b) => a - b);
    } catch {
      return ind;
    }
  }

  /** Seçim: hemen kurulur, istif açıksa üstündekiler gelince genişler */
  async function secimeKoy(anahtarlar, { ekle = false, kaydir = true } = {}) {
    const no = ++secimNo;
    const temel = ekle ? [...new Set([...o.secim(), ...anahtarlar])] : [...anahtarlar];
    o.secimAyarla(temel, { kaydir });
    const ak = aktif();
    if (!istif || !ak || !anahtarlar.length) return;
    const y = ak.a.yerlesimler;
    const h = indeksHaritasi(y);
    const ind = anahtarlar.map((k) => h.get(k)).filter((i) => i != null);
    const genis = await istifle(y, ind);
    if (no !== secimNo || aktif()?.a !== ak.a || genis.length === ind.length) return;
    o.secimAyarla([...new Set([...o.secim(), ...genis.map((i) => parcaAnahtari(y[i]))])], { kaydir: false });
  }

  function secimDegistir(anahtar, { ctrl = false } = {}) {
    if (!anahtar) {
      if (!ctrl) o.secimAyarla([]);
      return;
    }
    if (ctrl && o.secim().has(anahtar)) o.secimAyarla([...o.secim()].filter((k) => k !== anahtar), { kaydir: false });
    else secimeKoy([anahtar], { ekle: ctrl });
  }

  /** Elle işlemler sırayla yürür; ok tuşu basılı tutulunca kuyruk şişmesin */
  function sirayaKoy(fn, { sinir = Infinity } = {}) {
    if (kuyrukta >= sinir) return kuyruk;
    kuyrukta += 1;
    kuyruk = kuyruk
      .then(fn)
      .catch((e) => hataKutusu({ baslik: t('plan.duzenle.uygulanamadi'), metin: e.message || t('genel.bilinmeyenHata'), ayrinti: e.ayrinti || '' }))
      .finally(() => {
        kuyrukta -= 1;
      });
    return kuyruk;
  }

  // ------------------------------------------------------------------ ihlaller

  /** Etkin araçtaki ihlallerin haritası: anahtar → 'hata' | 'uyari' */
  function ihlalHaritasi(ai, liste = ihlaller) {
    const h = new Map();
    for (const i of liste) {
      if (i.aracIndeksi !== ai || i.kalemId == null) continue;
      const k = `${i.kalemId}|${i.parcaNo}`;
      if (i.duzey === 'hata') h.set(k, 'hata');
      else if (!h.has(k)) h.set(k, 'uyari');
    }
    return h;
  }

  /** Hata sayısı: hatalı parça başına bir, araç geneli (tonaj) ayrıca */
  function hataSayisi(liste = ihlaller) {
    const parcalar = new Set();
    let genel = 0;
    for (const i of liste) {
      if (i.duzey !== 'hata') continue;
      if (i.kalemId == null) genel += 1;
      else parcalar.add(`${i.aracIndeksi}|${i.kalemId}|${i.parcaNo}`);
    }
    return parcalar.size + genel;
  }

  function ihlalGoster({ liste = ihlaller, sars = null, gecikme = 0 } = {}) {
    const g = o.gorunum();
    const ak = aktif();
    if (!g) return;
    g.ihlalleriAyarla(acik && ak ? ihlalHaritasi(ak.ai, liste) : new Map(), { sars, gecikme });
  }

  /** Açık sonucu baştan denetler (yalnız ihlaller; yerleşim değişmez) */
  async function denetimYap() {
    const p = o.plan();
    if (!p || !p.sonuc || !p.sonuc.araclar.length) {
      ihlaller = [];
      ihlalGoster();
      return;
    }
    const no = ++denetimNo;
    let d;
    try {
      d = await denetle(motorGirdisi(p), p.sonuc.araclar);
    } catch (e) {
      console.warn('Denetim yapılamadı', e);
      return;
    }
    if (no !== denetimNo || o.plan() !== p) return;
    ihlaller = d.ihlaller || [];
    ihlalGoster();
    o.uyarilariCiz();
    o.ustCiz();
    o.tabloCiz();
  }

  // ------------------------------------------------------------------ değişikliği uygula

  /**
   * Etkin aracın yeni yerleşimini uygular: 3B animasyon hemen başlar, motor denetler, sonuç plana yazılır,
   * özet ve sıra yenilenir, adım geçmişe girer.
   */
  async function uygula(yeni, { tur = 'elle', animasyon = { sure: 180 }, sure = 180 } = {}) {
    const ak = aktif();
    if (!ak) return;
    const { p, ai } = ak;
    const g = o.gorunum();
    if (g && animasyon) g.konumlariGuncelle(o.susle(yeni), animasyon);
    const araclar = p.sonuc.araclar.map((a, i) => (i === ai ? { ...a, yerlesimler: yeni } : a));
    const no = ++denetimNo;
    let d;
    try {
      d = await denetle(motorGirdisi(p), araclar);
    } catch (e) {
      // Eski yerleşime geri dönülür
      g?.konumlariGuncelle(o.susle(p.sonuc.araclar[ai].yerlesimler), { sure: 160 });
      throw e;
    }
    if (o.plan() !== p || !p.sonuc) return;
    const onceki = new Set([...ihlalHaritasi(ai)].filter(([, d2]) => d2 === 'hata').map(([k]) => k));
    if (!p.elleDuzenlendi) p.otomatikSonuc = kopya(p.sonuc);
    p.sonuc = { ...p.sonuc, araclar: d.araclar };
    p.elleDuzenlendi = true;
    if (no === denetimNo) ihlaller = d.ihlaller || [];
    planDegisti(tur);
    o.sonucYenile();
    const a = d.araclar[ai];
    g?.verileriGuncelle(o.susle(a.yerlesimler), { isaretler: o.isaretler(a) });
    const yeniHata = new Set([...ihlalHaritasi(ai)].filter(([k, d2]) => d2 === 'hata' && !onceki.has(k)).map(([k]) => k));
    ihlalGoster({ sars: yeniHata, gecikme: sure });
    boslukYenile();
    cubukGuncelle();
  }

  // ------------------------------------------------------------------ kalan boşluk

  async function boslukYenile({ belir = false, yerlesimler = null, indeksler = null } = {}) {
    const ak = aktif();
    const no = ++boslukNo;
    if (!ak) {
      bosluk = null;
      boslukCiz();
      return;
    }
    const y = yerlesimler || ak.a.yerlesimler;
    const ind = indeksler || seciliIndeksler(y);
    let r;
    try {
      r = await kalanBosluk(aracOlcu(ak.a), y, ind);
    } catch (e) {
      console.warn('Kalan boşluk hesaplanamadı', e);
      return;
    }
    if (no !== boslukNo) return;
    bosluk = r && r.kutu ? { ...r, sayi: ind.length, kapiPayi: aracOlcu(ak.a).kapiPayiMm } : null;
    boslukCiz({ belir });
  }

  function olcuBilgisi(b) {
    if (!b || !b.kutu) return null;
    const k = b.kutu;
    return {
      kutu: { x: k.x, y: k.y, z: k.z, xe: k.x + k.en, ye: k.y + k.yukseklik, ze: k.z + k.uzunluk },
      cizgiler: YONLER.map((yon) => {
        const e = b.engele[yon];
        return { yon, mm: e.mm, metin: uzunlukMetni(e.mm), parca: e.engel && e.engel.tur === 'parca' };
      }),
      // Tek parçada seçim çerçevesi var; ölçülen kutu ayrıca çizilmez
      cerceve: b.sayi !== 1,
    };
  }

  function boslukCiz({ belir = false } = {}) {
    const kart = $('.bosluk-kart', o.kok);
    if (kart) kart.outerHTML = boslukKartiHtml();
    const g = o.gorunum();
    if (!g) return;
    if (acik) {
      g.olculeriAyarla(olcuBilgisi(bosluk), { belir: belir || !olcuAcik });
      olcuAcik = !!bosluk;
    } else {
      g.olculeriAyarla(null);
      olcuAcik = false;
    }
  }

  function boslukKartiHtml() {
    const b = bosluk;
    const secimli = !!(b && b.sayi);
    const kapsam = !b ? '' : secimli ? t('plan.duzenle.bosluk.secim', { n: b.sayi }) : t('plan.duzenle.bosluk.butunYuk');
    if (!b) {
      return `<section class="durum-kutu durum-kutu--notr bosluk-kart">${simge('cetvel', 17)}<p>${kac(t('plan.duzenle.bosluk.bos'))}</p></section>`;
    }
    const deger = (mm) => `<span class="${mm < 0 ? 'eksi' : mm === 0 ? 'sifir' : ''}">${kac(uzunlukMetni(mm))}</span>`;
    const satirlar = YONLER.map((yon) => {
      const e = b.engele[yon];
      const engelAdi = e.engel && e.engel.tur === 'parca' ? e.engel.ad : t('plan.duzenle.bosluk.duvar.' + yon);
      return `
        <tr>
          <th>${kac(t('plan.duzenle.bosluk.yon.' + yon))}</th>
          <td class="sag">${deger(b.duvara[yon])}</td>
          ${secimli ? `<td class="sag">${deger(e.mm)}</td><td class="bosluk-engel" title="${kac(engelAdi)}">${kac(engelAdi)}</td>` : ''}
        </tr>`;
    }).join('');
    return `
      <section class="durum-kutu durum-kutu--bilgi bosluk-kart">
        <h3>${simge('cetvel', 17)}${kac(t('plan.duzenle.bosluk.baslik'))}<span class="bosluk-kapsam">${kac(kapsam)}</span></h3>
        <table class="bosluk-tablo${secimli ? ' bosluk-tablo--secim' : ''}">
          ${secimli ? '<colgroup><col class="bosluk-c-yon"><col class="bosluk-c-duvar"><col class="bosluk-c-engel"><col></colgroup>' : ''}
          ${secimli ? `<thead><tr><th></th><th class="sag">${kac(t('plan.duzenle.bosluk.duvara'))}</th><th class="sag" colspan="2">${kac(t('plan.duzenle.bosluk.engele'))}</th></tr></thead>` : ''}
          <tbody>${satirlar}</tbody>
        </table>
        ${b.kapiPayi > 0 ? `<p class="bosluk-not">${kac(t('plan.duzenle.bosluk.kapiPayiNotu'))}</p>` : ''}
      </section>`;
  }

  // ------------------------------------------------------------------ eylemler

  async function dondurEylem(tus) {
    const [, eksen] = DONDUR.find(([k]) => k === tus);
    sirayaKoy(async () => {
      const ak = aktif();
      if (!ak) return;
      const y = ak.a.yerlesimler;
      const ind = await istifle(y, seciliIndeksler(y));
      const izin = dondurmeIzni(ind.map((i) => kalemKurali(y[i])), eksen);
      if (!izin.izin) {
        bildirim(izinMetni(izin), { tur: 'uyari' });
        return;
      }
      const r = dondur(y, ind, eksen, aracOlcu(ak.a));
      const anahtarlar = ind.map((i) => parcaAnahtari(y[i]));
      await uygula(r.yerlesimler, { animasyon: { sure: 250, dondurme: { eksen, pivot0: r.pivot0, pivot1: r.pivot1, anahtarlar } }, sure: 250 });
    });
  }

  async function yaslaEylem(yon) {
    sirayaKoy(async () => {
      const ak = aktif();
      if (!ak) return;
      const y = ak.a.yerlesimler;
      let ind = await istifle(y, seciliIndeksler(y));
      if (!ind.length) ind = y.map((_, i) => i); // seçim yoksa bütün yük
      const r = await yaslan(aracOlcu(ak.a), y, ind, yon);
      if (!(r.mesafe > 0)) {
        bildirim(t('plan.duzenle.yerYok'), { tur: 'bilgi', sure: 2200 });
        return;
      }
      // Kayma süresi mesafeyle biraz uzar: kısa itme çabuk, uzun itme sakin
      const sure = Math.round(Math.min(460, 170 + Math.sqrt(r.mesafe) * 4));
      await uygula(r.yerlesimler, { animasyon: { sure }, sure });
    });
  }

  function klavyeTasi(eksen, isaret, carpan) {
    sirayaKoy(async () => {
      const ak = aktif();
      if (!ak) return;
      const y = ak.a.yerlesimler;
      const ind = await istifle(y, seciliIndeksler(y));
      if (!ind.length) {
        bildirim(t('plan.duzenle.onceSec'), { tur: 'bilgi', sure: 2200 });
        return;
      }
      const d = { x: 0, y: 0, z: 0 };
      d[eksen] = izgaraMm() * carpan * isaret;
      const k = kirp(ortakKutu(y, ind), d, aracOlcu(ak.a));
      const dd = { x: Math.round(k.x), y: Math.round(k.y), z: Math.round(k.z) };
      if (!dd.x && !dd.y && !dd.z) return;
      await uygula(tasi(y, ind, dd), { tur: 'elleKlavye', animasyon: { sure: 110 }, sure: 110 });
    }, { sinir: 3 });
  }

  function otomatigeDon() {
    sirayaKoy(async () => {
      const p = o.plan();
      if (!p || !p.sonuc || !p.elleDuzenlendi) return;
      if (!p.otomatikSonuc || p.otomatikSonuc.araclar.length !== p.sonuc.araclar.length) {
        await o.planla({ sorma: true });
        return;
      }
      const ak = aktif();
      p.sonuc = kopya(p.otomatikSonuc);
      p.elleDuzenlendi = false;
      ihlaller = [];
      denetimNo += 1;
      planDegisti('elle');
      o.sonucYenile();
      const a = p.sonuc.araclar[ak.ai];
      const g = o.gorunum();
      g?.konumlariGuncelle(o.susle(a.yerlesimler), { sure: 320 });
      g?.verileriGuncelle(o.susle(a.yerlesimler), { isaretler: o.isaretler(a) });
      ihlalGoster();
      boslukYenile();
      cubukGuncelle();
      if (acik) denetimYap();
      bildirim(t('plan.duzenle.otomatigeDonuldu'), { tur: 'basari', eylem: { metin: t('plan.geriAl'), fn: () => geriAl() } });
    });
  }

  function kalemKurali(y) {
    const k = o.kalemBul(y.kalemId);
    return { ad: k ? k.ad : String(y.ad || ''), donus: k ? k.donus : 'serbest' };
  }

  function izinMetni(izin) {
    if (izin.sebep === 'secimYok') return t('plan.duzenle.dondurSecimYok');
    if (izin.sebep === 'sabit') return t('plan.duzenle.dondurSabit', { ad: izin.ad });
    if (izin.sebep === 'dik') return t('plan.duzenle.dondurDik', { ad: izin.ad });
    return '';
  }

  // ------------------------------------------------------------------ sürükleme (3B'den gelen olaylar)

  function surukleTemizle() {
    clearTimeout(canli.saat);
    canli = { zaman: 0, saat: 0, calisiyor: false, bekliyor: false };
    surukleme = null;
    o.gorunum()?.hayaletAyarla(null);
  }

  const geri = {
    tiklandi(anahtar, { ctrl = false } = {}) {
      secimDegistir(anahtar, { ctrl });
    },

    basildi(anahtar, { ctrl = false } = {}) {
      const ak = aktif();
      surukleTemizle();
      if (!ak) return;
      let daralt = null;
      if (ctrl) {
        if (o.secim().has(anahtar)) {
          // Ctrl ile seçili parçaya basmak onu seçimden çıkarır; sürükleme olmaz
          o.secimAyarla([...o.secim()].filter((k) => k !== anahtar), { kaydir: false });
          surukleme = { yok: true };
          return;
        }
        secimeKoy([anahtar], { ekle: true });
      } else if (!o.secim().has(anahtar)) secimeKoy([anahtar]);
      else daralt = anahtar; // seçili gruba basıldı: sürüklenmezse yalnız bu parça seçili kalır
      surukleme = {
        daralt,
        baslangic: ak.a.yerlesimler.map((y) => ({ ...y })),
        arac: aracOlcu(ak.a),
        a: ak.a,
        hedef: null,
        ind: [],
      };
    },

    basladi() {
      o.ipucuKapat();
      kap.classList.add('surukleniyor');
    },

    suruklendi(dHam) {
      const s = surukleme;
      if (!s || s.yok) return;
      const ak = aktif();
      if (!ak || ak.a !== s.a) return;
      const anahtarlar = [...o.secim()];
      const h = indeksHaritasi(s.baslangic);
      const ind = anahtarlar.map((k) => h.get(k)).filter((i) => i != null);
      if (!ind.length) return;
      const k = ortakKutu(s.baslangic, ind);
      const kume = new Set(ind);
      const digerleri = s.baslangic.filter((_, i) => !kume.has(i)).map(kutuYap);
      const onizleme = kirp(k, dHam, s.arac);
      const hedef = oturt(k, dHam, izgaraMm(), digerleri, s.arac, { x: dHam.x !== 0, y: dHam.y !== 0, z: dHam.z !== 0 });
      const g = o.gorunum();
      g.surukleOnizle(anahtarlar, onizleme);
      g.hayaletAyarla({ x: k.x + hedef.x, y: k.y + hedef.y, z: k.z + hedef.z, xe: k.xe + hedef.x, ye: k.ye + hedef.y, ze: k.ze + hedef.z });
      s.hedef = hedef;
      s.ind = ind;
      canliIste();
    },

    async birakildi() {
      const s = surukleme;
      kap.classList.remove('surukleniyor');
      surukleTemizle();
      if (!s || s.yok) return;
      const ak = aktif();
      if (!ak || ak.a !== s.a) return;
      if (!s.hedef || (!s.hedef.x && !s.hedef.y && !s.hedef.z)) {
        // Yer değişmedi: önizleme yerine süzülür
        o.gorunum()?.konumlariGuncelle(o.susle(ak.a.yerlesimler), { sure: 150 });
        ihlalGoster();
        boslukYenile();
        return;
      }
      sirayaKoy(async () => {
        const ara = tasi(s.baslangic, s.ind, s.hedef);
        // Bırakılan kutu alttaki yüzeye oturur
        let son = ara;
        let dusus = 0;
        try {
          const r = await yaslan(s.arac, ara, s.ind, 'asagi');
          son = r.yerlesimler;
          dusus = r.mesafe || 0;
        } catch {
          /* yaslanamazsa bırakıldığı yerde kalır */
        }
        const yol = new Map(s.ind.map((i) => [parcaAnahtari(ara[i]), ara[i]]));
        const sure2 = dusus > 0 ? Math.round(Math.min(380, 110 + Math.sqrt(dusus) * 4.5)) : 0;
        await uygula(son, { animasyon: { sure: 150, yol, sure2 }, sure: 150 + sure2 });
      });
    },

    birakmadanCikti(anahtar, { ctrl = false } = {}) {
      const s = surukleme;
      surukleTemizle();
      if (!ctrl && s && s.daralt) secimeKoy([s.daralt]);
    },

    iptal(basladi) {
      kap.classList.remove('surukleniyor');
      surukleTemizle();
      const ak = aktif();
      if (basladi && ak) o.gorunum()?.konumlariGuncelle(o.susle(ak.a.yerlesimler), { sure: 160 });
      ihlalGoster();
      boslukYenile();
    },

    alanSecildi(anahtarlar, { ctrl = false } = {}) {
      secimeKoy(anahtarlar, { ekle: ctrl, kaydir: true });
    },
  };

  /** Sürüklerken denetim ve kalan boşluk en çok 60 ms'de bir istenir; biri sürerken yenisi beklemez, sonra gelir */
  function canliIste() {
    if (canli.calisiyor) {
      canli.bekliyor = true;
      return;
    }
    if (canli.saat) return;
    const gecen = performance.now() - canli.zaman;
    canli.saat = setTimeout(() => {
      canli.saat = 0;
      canliCalistir();
    }, Math.max(0, CANLI_MS - gecen));
  }

  async function canliCalistir() {
    const s = surukleme;
    if (!s || !s.hedef) return;
    const ak = aktif();
    if (!ak) return;
    canli.zaman = performance.now();
    canli.calisiyor = true;
    const yeni = tasi(s.baslangic, s.ind, s.hedef);
    const araclar = ak.p.sonuc.araclar.map((a, i) => (i === ak.ai ? { ...a, yerlesimler: yeni } : a));
    try {
      const [d, b] = await Promise.all([denetle(motorGirdisi(ak.p), araclar), kalanBosluk(s.arac, yeni, s.ind)]);
      if (surukleme !== s) return;
      ihlalGoster({ liste: d.ihlaller || [] });
      bosluk = b && b.kutu ? { ...b, sayi: s.ind.length, kapiPayi: s.arac.kapiPayiMm } : null;
      boslukCiz();
    } catch (e) {
      console.warn('Canlı denetim yapılamadı', e);
    } finally {
      canli.calisiyor = false;
      if (canli.bekliyor && surukleme === s) {
        canli.bekliyor = false;
        canliIste();
      }
    }
  }

  // ------------------------------------------------------------------ klavye

  function tus(e) {
    if (!acik || o.kok.hidden || diyalogAcikMi() || e.defaultPrevented) return;
    const hedef = e.target;
    if (hedef && hedef.closest && hedef.closest('input, select, textarea, .plan-sol, .arac-sekmeleri, .plan-ust, .gorunum-cubugu')) return;
    const g = o.gorunum();
    if (e.key === 'Alt' && g && g.surukleme) {
      e.preventDefault(); // Alt'ın pencere menüsünü açması engellenir; eksen fareyle değişir
      return;
    }
    if (e.key === 'Escape') {
      if (g && g.surukleme) g.surukleIptal();
      else if (o.secim().size) o.secimAyarla([]);
      else return;
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (g && g.surukleme) return;
    const harf = e.key.length === 1 ? e.key.toLowerCase() : '';
    const don = DONDUR.find(([k]) => k.toLowerCase() === harf);
    if (don) {
      e.preventDefault();
      if (!e.repeat) dondurEylem(don[0]);
      return;
    }
    const oklar = { ArrowRight: ['sag', 1], ArrowLeft: ['sag', -1], ArrowUp: ['ileri', 1], ArrowDown: ['ileri', -1] };
    if (oklar[e.key] && g) {
      e.preventDefault();
      const [yon, isaret] = oklar[e.key];
      const ey = g.ekranYonleri()[yon];
      klavyeTasi(ey.eksen, ey.isaret * isaret, e.shiftKey ? 10 : 1);
      return;
    }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      klavyeTasi('y', e.key === 'PageUp' ? 1 : -1, e.shiftKey ? 10 : 1);
    }
  }
  document.addEventListener('keydown', tus);

  // ------------------------------------------------------------------ çubuk ve anahtar

  function cubukHtml() {
    const dugme = (veri, simgeAdi, baslik, ek = '') =>
      `<button type="button" class="duzen-dugme" ${veri} title="${kac(baslik)}" aria-label="${kac(baslik)}">${simge(simgeAdi, 18)}${ek}</button>`;
    return `
      <span class="duzen-secim" aria-live="polite"><b class="duzen-secim-sayi">0</b><span class="duzen-secim-metin"></span></span>
      <span class="duzen-ayrac"></span>
      <div class="duzen-grup" role="group" aria-label="${kac(t('plan.duzenle.dondurBaslik'))}">
        ${DONDUR.map(([k, , ad]) => dugme(`data-dondur="${k}"`, SIMGE[k], `${t('plan.duzenle.' + ad)} (${k})`, `<kbd>${k}</kbd>`)).join('')}
      </div>
      <span class="duzen-ayrac"></span>
      <div class="duzen-grup" role="group" aria-label="${kac(t('plan.duzenle.yaslaBaslik'))}">
        ${YASLA.map((y) => dugme(`data-yasla="${y}"`, SIMGE[y], t('plan.duzenle.yasla.' + y))).join('')}
      </div>
      <span class="duzen-ayrac"></span>
      <button type="button" class="duzen-dugme duzen-dugme--metin" data-duzen="bosluk" title="${kac(t('plan.duzenle.boslukKapatAciklama'))}">${simge('boslukKapat', 18)}<span>${kac(t('plan.duzenle.boslukKapat'))}</span></button>
      <span class="duzen-ayrac"></span>
      <div class="duzen-izgara" role="radiogroup" aria-label="${kac(t('plan.duzenle.izgara'))}" title="${kac(t('plan.duzenle.izgaraAciklama'))}">
        ${simge('izgara', 16)}
        ${izgaraAdimlari().map((mm, i) => `<button type="button" role="radio" data-izgara="${i}" aria-checked="${i === izgara}">${kac(esnek(mmdenOlcu(mm), 1))}</button>`).join('')}
        <span class="duzen-birim">${kac(olcuBirimi())}</span>
      </div>
      <button type="button" class="duzen-dugme duzen-dugme--metin duzen-istif" data-duzen="istif" aria-pressed="${istif}" title="${kac(t('plan.duzenle.istifAciklama'))}">${simge('katman', 17)}<span>${kac(t('plan.duzenle.istif'))}</span></button>
      <span class="duzen-ayrac"></span>
      <button type="button" class="duzen-dugme duzen-dugme--metin" data-duzen="otomatik" title="${kac(t('plan.duzenle.otomatikAciklama'))}">${simge('otomatik', 17)}<span>${kac(t('plan.duzenle.otomatik'))}</span></button>`;
  }

  /** Kapalı düğme gri görünür, title nedenini yazar (disabled yerine aria-disabled: üstüne gelince ipucu görünsün) */
  function dugmeDurumu(d, kapali, neden) {
    d.setAttribute('aria-disabled', kapali ? 'true' : 'false');
    d.classList.toggle('kapali', kapali);
    d.title = kapali && neden ? neden : d.dataset.baslik || d.title;
  }

  // İlk başlıklar saklanır (neden metni kalkınca geri gelsin)
  $$('.duzen-dugme', cubuk).forEach((d) => (d.dataset.baslik = d.title));

  function cubukGuncelle() {
    const ak = aktif();
    const n = o.secim().size;
    $('.duzen-secim-sayi', cubuk).textContent = sayi(n);
    $('.duzen-secim-metin', cubuk).textContent = n ? t('plan.duzenle.secili', { n }) : t('plan.duzenle.secimYok');
    cubuk.classList.toggle('secimsiz', !n);
    const y = ak ? ak.a.yerlesimler : [];
    const kurallar = ak ? seciliIndeksler(y).map((i) => kalemKurali(y[i])) : [];
    for (const [k, eksen] of DONDUR) {
      const izin = dondurmeIzni(kurallar, eksen);
      dugmeDurumu($(`[data-dondur="${k}"]`, cubuk), !izin.izin, izinMetni(izin));
    }
    const p = o.plan();
    dugmeDurumu($('[data-duzen="otomatik"]', cubuk), !(p && p.elleDuzenlendi), t('plan.duzenle.otomatikYok'));
    $$('[data-izgara]', cubuk).forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.izgara) === izgara)));
    $('[data-duzen="istif"]', cubuk).setAttribute('aria-pressed', String(istif));
  }

  cubuk.addEventListener('click', (e) => {
    const d = e.target.closest('button');
    if (!d || d.getAttribute('aria-disabled') === 'true') return;
    if (d.dataset.dondur) dondurEylem(d.dataset.dondur);
    else if (d.dataset.yasla) yaslaEylem(d.dataset.yasla);
    else if (d.dataset.izgara != null) {
      izgara = Number(d.dataset.izgara);
      ayarYaz();
      cubukGuncelle();
    } else if (d.dataset.duzen === 'bosluk') yaslaEylem('on');
    else if (d.dataset.duzen === 'istif') {
      istif = !istif;
      ayarYaz();
      cubukGuncelle();
      if (istif && o.secim().size) secimeKoy([...o.secim()], { kaydir: false });
    } else if (d.dataset.duzen === 'otomatik') otomatigeDon();
  });

  anahtarDugme.addEventListener('click', () => (acik ? kapat() : ac()));

  function anahtarCiz() {
    anahtarDugme.hidden = !aktif();
    anahtarDugme.setAttribute('aria-pressed', String(acik));
    anahtarDugme.classList.toggle('acik', acik);
  }

  function ac() {
    if (acik || !aktif() || !o.gorunum()) return;
    acik = true;
    kap.classList.add('duzenleme-acik');
    cubuk.hidden = false;
    const g = o.gorunum();
    g.duzenlemeKipi(true);
    g.secimAyarla([...o.secim()], { odak: false });
    anahtarCiz();
    cubukGuncelle();
    o.uyarilariCiz();
    ihlalGoster();
    boslukYenile({ belir: true });
    denetimYap();
    o.kontrolIpucu();
  }

  function kapat() {
    if (!acik) return;
    acik = false;
    surukleTemizle();
    kap.classList.remove('duzenleme-acik', 'surukleniyor');
    cubuk.hidden = true;
    const g = o.gorunum();
    g?.duzenlemeKipi(false);
    g?.ihlalleriAyarla(new Map());
    // Düzenleme dışında tek parça seçilir
    if (o.secim().size > 1) o.secimAyarla([]);
    else g?.secimAyarla([...o.secim()], { odak: true });
    olcuAcik = false;
    anahtarCiz();
    o.uyarilariCiz();
    o.kontrolIpucu();
  }

  /** Etkin araçtaki parçayı seçer ve kamerayı ona çevirir (hata listesinden) */
  function parcayaGit(anahtar) {
    const a = aktif()?.a;
    const y = a && a.yerlesimler.find((x) => parcaAnahtari(x) === anahtar);
    if (!y) return;
    if (!acik) ac();
    o.secimAyarla([anahtar], { kaydir: true });
    o.gorunum()?.odaklan(y.sira, { sec: false });
  }

  // ------------------------------------------------------------------ plan ekranına açılan arayüz

  return {
    geri,
    acik: () => acik,
    ac,
    kapat,

    /** Yeni sonuç ya da yeniden kurulan sahne (planla, sekme, plan açılışı) */
    sahneKuruldu() {
      surukleTemizle();
      anahtarCiz();
      if (!aktif()) {
        if (acik) kapat();
        return;
      }
      if (acik) {
        o.gorunum()?.duzenlemeKipi(true);
        ihlalGoster();
        boslukYenile({ belir: true });
      } else boslukYenile();
      cubukGuncelle();
    },

    /** Planla yeni sonuç verdi */
    sonucYenilendi() {
      ihlaller = [];
      denetimNo += 1;
      if (acik) denetimYap();
    },

    /** Plan açıldı: elle düzenlenmişse hataları görmek için denetlenir */
    planAcildi() {
      ihlaller = [];
      bosluk = null;
      denetimNo += 1;
      const p = o.plan();
      if (p && p.sonuc && p.elleDuzenlendi) denetimYap();
    },

    /** Geri al / yinele yerleşimi değiştirdi: parçalar eski yerine süzülür */
    gecmisUygulandi() {
      const ak = aktif();
      o.gorunum()?.surukleIptal();
      surukleTemizle();
      if (!ak) return;
      o.sonucYenile();
      const g = o.gorunum();
      g?.konumlariGuncelle(o.susle(ak.a.yerlesimler), { sure: 260 });
      g?.verileriGuncelle(o.susle(ak.a.yerlesimler), { isaretler: o.isaretler(ak.a) });
      denetimYap();
      boslukYenile();
      cubukGuncelle();
    },

    /** Girdi değişti: kalem kuralları denetimi etkiler */
    girdiDegisti(ne) {
      const p = o.plan();
      if (ne === 'kalem' && p && p.sonuc && (acik || p.elleDuzenlendi)) denetimYap();
      cubukGuncelle();
    },

    /** Seçim değişti (3B, tablo ya da düzenleyici) */
    secimDegisti() {
      if (!aktif()) return;
      cubukGuncelle();
      boslukYenile({ belir: acik });
    },

    tiklandi: (anahtar, s) => geri.tiklandi(anahtar, s),

    /** Etkin araçta parçanın ihlali: 'hata' | 'uyari' | null */
    parcaIhlali(anahtar) {
      const ak = aktif();
      return ak ? ihlalHaritasi(ak.ai).get(anahtar) || null : null;
    },

    hataSayisi: () => hataSayisi(),

    /** İlk hatalı parçaya gider: araç sekmesi seçilir, düzenleme açılır, parça seçilip kameraya alınır */
    ilkHataya() {
      const ilk = ihlaller.find((i) => i.duzey === 'hata');
      if (!ilk) return;
      if (ilk.aracIndeksi !== o.aktifArac()) o.aracSec(ilk.aracIndeksi);
      if (!acik) ac();
      if (ilk.kalemId != null) parcayaGit(`${ilk.kalemId}|${ilk.parcaNo}`);
    },

    parcayaGit: (anahtar) => parcayaGit(anahtar),

    /** Yan paneldeki ihlal kutuları (etkin araç) */
    ihlalHtml() {
      const ak = aktif();
      if (!ak) return '';
      const liste = ihlaller.filter((i) => i.aracIndeksi === ak.ai);
      if (!liste.length) return '';
      const satir = (i) => {
        const anahtar = i.kalemId != null ? `${i.kalemId}|${i.parcaNo}` : '';
        const y = anahtar ? ak.a.yerlesimler.find((x) => parcaAnahtari(x) === anahtar) : null;
        const ad = y ? y.ad : t('plan.arac.baslik');
        return `<li${anahtar ? ` data-anahtar="${kac(anahtar)}" tabindex="0"` : ''}><b>${kac(ad)}</b><span>${kac(motorMetni(i.mesaj))}</span></li>`;
      };
      const hatalar = liste.filter((i) => i.duzey === 'hata');
      const uyarilar = liste.filter((i) => i.duzey !== 'hata');
      const n = hataSayisi(liste);
      return (hatalar.length
        ? `<div class="durum-kutu durum-kutu--hata ihlal-kutu">
             <h3>${simge('hata', 17)}${kac(t('plan.duzenle.hataBaslik'))}<span class="sayac-rozet">${sayi(n)}</span></h3>
             <ul>${hatalar.map(satir).join('')}</ul>
           </div>` : '')
        + (uyarilar.length
          ? `<div class="durum-kutu durum-kutu--uyari ihlal-kutu">
               <h3>${simge('durak', 17)}${kac(t('plan.duzenle.uyariBaslik'))}<span class="sayac-rozet">${sayi(uyarilar.length)}</span></h3>
               <ul>${uyarilar.map(satir).join('')}</ul>
             </div>` : '');
    },

    boslukHtml: () => boslukKartiHtml(),

    /** PDF için: her aracın kalan boşluğu (bütün yük) ve elle düzenlenmişse güncel ihlaller */
    async raporVerisi() {
      const p = o.plan();
      if (!p || !p.sonuc) return { kalanBosluklar: [], ihlaller: [] };
      const kalanBosluklar = await Promise.all(p.sonuc.araclar.map((a) =>
        kalanBosluk(aracOlcu(a), a.yerlesimler, []).then((r) => (r && r.duvara ? r.duvara : null)).catch(() => null)));
      let liste = [];
      if (p.elleDuzenlendi) {
        try {
          liste = (await denetle(motorGirdisi(p), p.sonuc.araclar)).ihlaller || [];
        } catch {
          liste = ihlaller;
        }
      }
      return { kalanBosluklar, ihlaller: liste };
    },
  };
}
