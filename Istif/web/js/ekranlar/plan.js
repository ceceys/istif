// Plan ekranı: solda araç ve yük listesi, sağda özet şeridi, 3B görünüm, ağırlık dağılımı, yükleme sırası ve uyarılar.
import { t } from '../dil.js';
import { kac, kg, metre, m3, cm, olcu, sayi, yuzde, olcuBirimi } from '../bicim.js';
import { simge } from '../simgeler.js';
import { $, $$, ogeUret, bildirim, hataKutusu, onayIste, sayacOynat, siraliGiris, azHareket } from '../arayuz.js';
import { kuralEtiketleri, boyalariUygula } from '../bilesenler.js';
import { kalemDuzenle, urunSec } from '../duzenleyiciler.js';
import {
  durum, dinle, planDegisti, motorGirdisi, girdiImzasi, sonucGuncelMi, planToplamlari,
  kutuphaneKaydet, yeniId, kalemDuzelt, kapidanGecmez, geriAl, yinele, geriAlinabilir, yinelenebilir,
} from '../durum.js';
import { planla as motordaPlanla } from '../motor-baglanti.js';
import { motorMetni } from '../motor-metin.js';
import { kaydet, planAc } from '../eylemler.js';
import { excelAl } from '../excel.js';
import { raporKur, raporHazir } from '../rapor.js';
import { istek, kabukVar } from '../kopru.js';
import { etkinTema, temaDinle } from '../tema.js';
import { aracKartiKur } from './arac-karti.js';
import { duzenlemeKur } from './plan-duzenle.js';
import { agirlikDagilimiCiz } from '../agirlik-dagilimi.js';
import { parcaAnahtari } from '../duzenleme-hesap.js';

const GORUNUMLER = ['izometrik', 'yandan', 'ustten', 'arkadan', 'sigdir'];

/** Ekran görüntüsünün zemini (CSS'teki --sahne-zemin'e yakın iki ton) */
const PNG_ZEMIN = { koyu: ['#1F3260', '#0C1429'], acik: ['#FFFFFF', '#E1E7F0'] };

const kopya = (a) => (a ? JSON.parse(JSON.stringify(a)) : a);

export function planEkraniKur() {
  const kok = ogeUret(`
    <section class="ekran ekran-plan" aria-label="${kac(t('gezinme.acikPlan'))}">
      <header class="plan-ust">
        <div class="plan-ad-kap">
          <input class="plan-ad" type="text" maxlength="80" spellcheck="false" aria-label="${kac(t('plan.adYerTutucu'))}" placeholder="${kac(t('plan.adYerTutucu'))}">
          <span class="plan-durum"><span class="nokta"></span><span class="plan-durum-metin"></span></span>
          <span class="plan-elle" hidden>${simge('tasi', 14)}<span>${kac(t('plan.duzenle.elleRozet'))}</span></span>
          <button type="button" class="plan-hata" hidden title="${kac(t('plan.duzenle.hataVarAciklama'))}">${simge('hata', 15)}<span></span></button>
        </div>
        <div class="plan-eylemler">
          <button type="button" class="simge-dugme" data-eylem="geriAl" title="${kac(t('plan.geriAl'))} (Ctrl+Z)" aria-label="${kac(t('plan.geriAl'))}" disabled>${simge('geriAl', 18)}</button>
          <button type="button" class="simge-dugme" data-eylem="yinele" title="${kac(t('plan.yinele'))} (Ctrl+Y)" aria-label="${kac(t('plan.yinele'))}" disabled>${simge('yinele', 18)}</button>
          <span class="dikey-ayrac"></span>
          <button type="button" class="dugme dugme--hayalet" data-eylem="ac">${simge('ac', 18)}<span>${kac(t('plan.ac'))}</span></button>
          <button type="button" class="dugme dugme--ikincil" data-eylem="farkli">${simge('kopyala', 18)}<span>${kac(t('plan.farkliKaydet'))}</span></button>
          <button type="button" class="dugme dugme--ikincil" data-eylem="kaydet">${simge('kaydet', 18)}<span>${kac(t('plan.kaydet'))}</span></button>
          <button type="button" class="dugme dugme--ikincil pdf-dugme" data-eylem="pdf" disabled>${simge('pdf', 18)}<span>${kac(t('rapor.dugme'))}</span></button>
        </div>
      </header>

      <div class="plan-govde">
        <aside class="plan-sol">
          <div class="plan-sol-kaydir">
            <section class="kart arac-karti"></section>

            <section class="kart yuk-karti">
              <header class="kart-baslik">
                <h2>${simge('urunler', 18)}${kac(t('plan.yuk.baslik'))}</h2>
                <span class="sayac-rozet kalem-sayisi">0</span>
              </header>
              <p class="olcu-notu">${kac(t('plan.yuk.olcuNotu', { birim: olcuBirimi() }))}</p>
              <ul class="kalem-listesi"></ul>
              <div class="yuk-eylemler">
                <button type="button" class="dugme dugme--ikincil" data-eylem="kalemEkle">${simge('ekle', 16)}${kac(t('plan.yuk.ekle'))}</button>
                <button type="button" class="dugme dugme--hayalet" data-eylem="urundenEkle">${simge('urunler', 16)}${kac(t('plan.yuk.urunlerdenEkle'))}</button>
                <button type="button" class="dugme dugme--hayalet" data-eylem="excelden">${simge('tablo', 16)}${kac(t('plan.yuk.excelden'))}</button>
              </div>
            </section>
          </div>

          <div class="plan-sol-alt">
            <div class="yuk-ozeti"><span class="yuk-ozeti-sol"></span><span class="yuk-ozeti-sag soluk"></span></div>
            <button type="button" class="planla-dugme">
              <span class="planla-ilerleme"></span>
              <span class="planla-icerik">${simge('planla', 18)}<span class="planla-metin">${kac(t('plan.planla'))}</span></span>
              <kbd class="planla-kisayol">Ctrl ↵</kbd>
            </button>
          </div>
        </aside>

        <div class="plan-sag">
          <div class="ozet-serit">
            ${ozetKutusu('arac', 'araclar', t('plan.ozet.aracSayisi'), false)}
            ${ozetKutusu('hacim', 'hacim', t('plan.ozet.hacim'), true)}
            ${ozetKutusu('agirlik', 'agirlik', t('plan.ozet.agirlik'), true)}
            ${ozetKutusu('uzunluk', 'cetvel', t('plan.ozet.uzunluk'), true)}
            ${ozetKutusu('merkez', 'merkez', t('plan.ozet.merkez'), false)}
          </div>

          <div class="sahne-kap">
            <div class="sahne-tuval-kap"></div>
            <div class="sahne-ust">
              <div class="arac-sekmeleri" role="tablist" hidden></div>
              <div class="sahne-rozetler"></div>
              <button type="button" class="duzenle-anahtar" aria-pressed="false" hidden title="${kac(t('plan.duzenle.anahtarAciklama'))}">
                ${simge('tasi', 16)}<span class="duzenle-anahtar-metin">${kac(t('plan.duzenle.anahtar'))}</span><span class="mini-anahtar" aria-hidden="true"><i></i></span>
              </button>
              <div class="gorunum-cubugu" role="toolbar" aria-label="${kac(t('plan.gorunum.baslik'))}">
                ${GORUNUMLER.map((g) => `
                  <button type="button" class="gorunum-dugme${g === 'izometrik' ? ' secili' : ''}" data-gorunum="${g}" title="${kac(t('plan.gorunum.' + g))}">
                    ${simge(g, 17)}<span>${kac(t('plan.gorunum.' + g))}</span>
                  </button>`).join('')}
              </div>
            </div>
            <div class="sahne-araclari" role="toolbar" aria-label="${kac(t('plan.gorunum.araclar'))}">
              <button type="button" class="simge-dugme" data-sahne="yakin" title="${kac(t('plan.gorunum.yakinlastir'))} (+)" aria-label="${kac(t('plan.gorunum.yakinlastir'))}">${simge('yakinlas', 17)}</button>
              <input type="range" class="yakinlik-cubugu" min="0" max="100" step="1" value="50" aria-label="${kac(t('plan.gorunum.yakinlik'))}">
              <button type="button" class="simge-dugme" data-sahne="uzak" title="${kac(t('plan.gorunum.uzaklastir'))} (−)" aria-label="${kac(t('plan.gorunum.uzaklastir'))}">${simge('uzaklas', 17)}</button>
              <span class="yatay-ayrac"></span>
              <button type="button" class="simge-dugme" data-sahne="png" title="${kac(t('plan.gorunum.png'))}" aria-label="${kac(t('plan.gorunum.png'))}">${simge('kamera', 17)}</button>
              <button type="button" class="simge-dugme" data-sahne="tamEkran" title="${kac(t('plan.gorunum.tamEkran'))}" aria-label="${kac(t('plan.gorunum.tamEkran'))}">${simge('tamEkran', 17)}</button>
            </div>
            <div class="sahne-bos">
              <span class="sahne-bos-simge">${simge('planla', 22)}</span>
              <div><b>${kac(t('plan.gorunum.bosIpucu'))}</b><small>${kac(t('plan.gorunum.bosIpucuAlt'))}</small></div>
            </div>
            <div class="sahne-hata" hidden>${simge('uyari', 20)}<span>${kac(t('plan.gorunum.webglYok'))}</span></div>
            <div class="oynatici" hidden>
              <button type="button" class="simge-dugme" data-oynat="basa" title="${kac(t('plan.gorunum.bas'))}" aria-label="${kac(t('plan.gorunum.bas'))}">${simge('basa', 17)}</button>
              <button type="button" class="simge-dugme" data-oynat="onceki" title="${kac(t('plan.gorunum.geri'))}" aria-label="${kac(t('plan.gorunum.geri'))}">${simge('onceki', 17)}</button>
              <button type="button" class="oynat-dugme" data-oynat="oynat" title="${kac(t('plan.gorunum.oynat'))}" aria-label="${kac(t('plan.gorunum.oynat'))}">${simge('oynat', 18)}</button>
              <button type="button" class="simge-dugme" data-oynat="sonraki" title="${kac(t('plan.gorunum.ileri'))}" aria-label="${kac(t('plan.gorunum.ileri'))}">${simge('sonraki', 17)}</button>
              <input type="range" class="adim-cubugu" min="0" max="0" value="0" step="1" aria-label="${kac(t('plan.sira.baslik'))}">
              <span class="adim-metin"></span>
            </div>
            <div class="duzen-cubugu" role="toolbar" aria-label="${kac(t('plan.duzenle.cubuk'))}" hidden></div>
            <div class="kontrol-ipucu">${kac(t('plan.gorunum.kontrolIpucu'))}</div>
            <div class="sahne-ipucu" hidden></div>
          </div>

          <div class="agirlik-serit" hidden></div>

          <div class="alt-panel">
            <section class="kart sira-karti">
              <header class="kart-baslik">
                <h2>${simge('katman', 18)}${kac(t('plan.sira.baslik'))}</h2>
                <span class="soluk sira-sayi"></span>
              </header>
              <div class="tablo-kap">
                <table class="tablo sira-tablosu">
                  <thead><tr>
                    <th class="sag">${kac(t('plan.sira.sira'))}</th>
                    <th>${kac(t('plan.sira.parca'))}</th>
                    <th class="sag">${kac(t('plan.sira.olcu', { birim: olcuBirimi() }))}</th>
                    <th class="sag">${kac(t('plan.sira.agirlik'))}</th>
                    <th class="sag">${kac(t('plan.sira.konum'))}</th>
                    <th>${kac(t('plan.sira.not'))}</th>
                  </tr></thead>
                  <tbody></tbody>
                </table>
                <p class="tablo-bos">${kac(t('plan.sira.bos'))}</p>
              </div>
            </section>
            <section class="uyari-sutun" aria-live="polite"></section>
          </div>
        </div>
      </div>
    </section>`);

  // ------------------------------------------------------------------ durum

  let gorunum = null;
  let gorunumDenendi = false;
  let aktifArac = 0;
  let hesaplaniyor = false;
  /** Seçili parçaların anahtarları (kalemId|parcaNo); düzenleme dışında en çok bir parça */
  let secim = new Set();
  let aracGuncellemeSaati = 0;
  let ilkGosterim = true;

  const plan = () => durum.plan;
  const el = (s) => $(s, kok);
  const aracKarti = aracKartiKur(el('.arac-karti'));

  // Elle düzenleme (3B'de taşıma, döndürme, yaslama, kalan boşluk, anlık denetim)
  const duzenleme = duzenlemeKur({
    kok,
    plan,
    aktifArac: () => aktifArac,
    aracSec: (i) => sekmeSec(i),
    gorunum: () => gorunum,
    sonucAraci: (a) => sonucAraci(a),
    kalemBul: (id) => kalemBul(id),
    secim: () => secim,
    secimAyarla: (anahtarlar, s) => secimAyarla(anahtarlar, s),
    sonucYenile: () => sonucYenile(),
    uyarilariCiz: () => uyarilariCiz(),
    tabloCiz: () => tabloCiz(),
    ustCiz: () => ustCiz(),
    susle: (y) => susle(y),
    isaretler: (a) => isaretBilgisi(a),
    planla: (s) => planlaTikla(s),
    ipucuKapat: () => (ipucu.hidden = true),
    kontrolIpucu: () => {
      el('.kontrol-ipucu').textContent = t(duzenleme.acik() ? 'plan.duzenle.kontrolIpucu' : 'plan.gorunum.kontrolIpucu');
    },
  });
  el('.plan-hata').addEventListener('click', () => duzenleme.ilkHataya());

  // ------------------------------------------------------------------ üst çubuk

  const adGirdisi = el('.plan-ad');
  adGirdisi.addEventListener('input', () => {
    plan().ad = adGirdisi.value.trim() || t('plan.yeniAd');
    planDegisti('ad');
  });
  adGirdisi.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') adGirdisi.blur();
  });
  el('[data-eylem="kaydet"]').addEventListener('click', () => kaydet());
  el('[data-eylem="farkli"]').addEventListener('click', () => kaydet({ farkli: true }));
  el('[data-eylem="ac"]').addEventListener('click', () => planAc());
  el('[data-eylem="geriAl"]').addEventListener('click', () => geriAl());
  el('[data-eylem="yinele"]').addEventListener('click', () => yinele());

  function ustCiz() {
    const p = plan();
    if (document.activeElement !== adGirdisi) adGirdisi.value = p.ad;
    const durumEl = el('.plan-durum');
    durumEl.classList.toggle('kaydedilmedi', p.kaydedilmemis);
    el('.plan-durum-metin').textContent = p.kaydedilmemis ? t('plan.kaydedilmedi') : (p.yol ? t('plan.kaydedildi') : '');
    durumEl.title = p.yol && !String(p.yol).startsWith('yerel:') ? p.yol : '';
    // Elle düzenlenmiş plan üst bilgide işaretlenir; hata varsa kaydetme ve PDF yine çalışır, burada uyarılır
    el('.plan-elle').hidden = !(p.sonuc && p.elleDuzenlendi);
    const hata = p.sonuc ? duzenleme.hataSayisi() : 0;
    const hataEl = el('.plan-hata');
    hataEl.hidden = !hata;
    if (hata) $('span', hataEl).textContent = t('plan.duzenle.hataVar', { n: hata });
    gecmisDugmeleri();
  }

  function gecmisDugmeleri() {
    el('[data-eylem="geriAl"]').disabled = !geriAlinabilir();
    el('[data-eylem="yinele"]').disabled = !yinelenebilir();
  }

  // ------------------------------------------------------------------ yük listesi

  const liste = el('.kalem-listesi');

  function kalemListesiCiz({ giris = false } = {}) {
    const p = plan();
    el('.kalem-sayisi').textContent = sayi(p.kalemler.length);
    if (!p.kalemler.length) {
      liste.innerHTML = `
        <li class="liste-bos">
          ${simge('urunler', 28)}
          <b>${kac(t('plan.yuk.bos'))}</b>
          <small>${kac(t('plan.yuk.bosAlt'))}</small>
        </li>`;
    } else {
      liste.innerHTML = p.kalemler.map((k) => `
        <li class="kalem" data-id="${kac(k.id)}" tabindex="0">
          <span class="kalem-renk" data-boya="${kac(k.renk)}"></span>
          <div class="kalem-govde">
            <div class="kalem-ust"><span class="kalem-ad">${kac(k.ad)}</span><span class="kalem-adet">× ${sayi(k.adet)}</span></div>
            <div class="kalem-olcu">${olcu(k.uzunluk, k.en, k.yukseklik)} ${kac(olcuBirimi())} · ${kac(kg(k.agirlik))}</div>
            <div class="etiketler">${kapidanGecmez(k, p.arac) ? `<span class="etiket etiket--kirmizi" title="${kac(t('plan.kapi.aciklama'))}">${simge('kapi', 12)}${kac(t('plan.kapi.gecmez'))}</span>` : ''}${kuralEtiketleri(k)}</div>
          </div>
          <div class="kalem-eylemler">
            <button type="button" class="simge-dugme" data-eylem="duzenle" title="${kac(t('genel.duzenle'))}" aria-label="${kac(t('genel.duzenle'))}">${simge('duzenle', 16)}</button>
            <button type="button" class="simge-dugme simge-dugme--tehlike" data-eylem="sil" title="${kac(t('genel.sil'))}" aria-label="${kac(t('genel.sil'))}">${simge('sil', 16)}</button>
          </div>
        </li>`).join('');
      boyalariUygula(liste);
      if (giris) siraliGiris(liste, ':scope > .kalem', 30);
    }
    yukOzetiCiz();
  }

  function yukOzetiCiz() {
    const top = planToplamlari(plan());
    el('.yuk-ozeti-sol').textContent = [
      t('plan.yuk.kalemSayisi', { n: top.kalem }), t('plan.yuk.parcaSayisi', { n: top.parca }), kg(top.agirlik),
    ].join(' · ');
    el('.yuk-ozeti-sag').textContent = top.parca ? t('plan.yuk.toplamHacim', { v: m3(top.hacim) }) : '';
  }

  async function kalemDuzenleAc(id) {
    const p = plan();
    const i = p.kalemler.findIndex((k) => k.id === id);
    if (i < 0) return;
    const r = await kalemDuzenle({ kalem: p.kalemler[i], mod: 'plan' });
    if (!r) return;
    p.kalemler[i] = kalemDuzelt(r.kalem);
    planDegisti('kalem');
  }

  async function kalemEkleAc() {
    const p = plan();
    const r = await kalemDuzenle({ mod: 'plan', siraNo: p.kalemler.length });
    if (!r) return;
    const k = kalemDuzelt({ ...r.kalem, id: yeniId('k') });
    if (r.urunlereKaydet) {
      const urun = { ...k, id: yeniId('u') };
      delete urun.adet;
      delete urun.teslimatSirasi;
      delete urun.urunId;
      durum.kutuphane.urunler.push(urun);
      k.urunId = urun.id;
      kutuphaneKaydet().catch((e) => hataKutusu({ baslik: t('urunler.baslik'), metin: e.message }));
    }
    p.kalemler.push(k);
    planDegisti('kalem');
    liste.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: azHareket() ? 'auto' : 'smooth' });
  }

  function kalemSil(id) {
    const p = plan();
    const i = p.kalemler.findIndex((k) => k.id === id);
    if (i < 0) return;
    const [silinen] = p.kalemler.splice(i, 1);
    planDegisti('kalem');
    bildirim(t('plan.yuk.silindi', { ad: silinen.ad }), {
      eylem: {
        metin: t('plan.yuk.geriAl'),
        fn: () => {
          plan().kalemler.splice(Math.min(i, plan().kalemler.length), 0, silinen);
          planDegisti('kalem');
        },
      },
      sure: 6000,
    });
  }

  liste.addEventListener('click', (e) => {
    const satir = e.target.closest('.kalem');
    if (!satir) return;
    const eylem = e.target.closest('[data-eylem]')?.dataset.eylem;
    if (eylem === 'sil') kalemSil(satir.dataset.id);
    else kalemDuzenleAc(satir.dataset.id);
  });
  liste.addEventListener('keydown', (e) => {
    const satir = e.target.closest('.kalem');
    if (!satir || e.target !== satir) return;
    if (e.key === 'Enter') kalemDuzenleAc(satir.dataset.id);
    if (e.key === 'Delete') kalemSil(satir.dataset.id);
    if (e.key === 'ArrowDown') { e.preventDefault(); satir.nextElementSibling?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); satir.previousElementSibling?.focus(); }
  });
  el('[data-eylem="kalemEkle"]').addEventListener('click', kalemEkleAc);
  el('[data-eylem="urundenEkle"]').addEventListener('click', () =>
    urunSec({
      ekle: (urun, adet) => {
        plan().kalemler.push(kalemDuzelt({ ...urun, id: yeniId('k'), urunId: urun.id, adet, teslimatSirasi: 0 }));
        planDegisti('kalem');
      },
    })
  );
  el('[data-eylem="excelden"]').addEventListener('click', () =>
    excelAl({
      renkBasi: plan().kalemler.length,
      ekle: (kalemler) => {
        kalemler.forEach((k) => plan().kalemler.push(kalemDuzelt({ ...k, id: yeniId('k') })));
        planDegisti('kalem');
      },
    })
  );

  // ------------------------------------------------------------------ PDF yükleme planı

  const pdfDugme = el('[data-eylem="pdf"]');
  pdfDugme.addEventListener('click', () => pdfOlustur());

  /** Her araç için açık zeminli izometrik, üstten ve yandan görüntü; 3B yoksa boş. */
  async function raporGoruntuleri() {
    await gorunumSozu.catch(() => {});
    const s = plan().sonuc;
    if (!gorunum || !s) return [];
    const onceki = aktifArac;
    const goruntuler = [];
    for (let i = 0; i < s.araclar.length; i += 1) {
      aktifArac = i;
      sahneyiGuncelle({ animasyon: 'yok' });
      goruntuler.push({
        izometrik: gorunum.goruntuAl('izometrik', { genislik: 1680, yukseklik: 860 }),
        ustten: gorunum.goruntuAl('ustten', { genislik: 1000, yukseklik: 420 }),
        yandan: gorunum.goruntuAl('yandan', { genislik: 1000, yukseklik: 420 }),
      });
      await new Promise((r) => setTimeout(r, 0)); // arayüz nefes alsın
    }
    aktifArac = onceki;
    sahneyiGuncelle({ animasyon: 'yok' });
    return goruntuler;
  }

  /**
   * PDF yükleme planı. yol verilirse (yalnız kabuğun deneme kipinde kabul edilir) pencere açılmaz.
   * Döner: kaydedilen yol ya da null
   */
  async function pdfOlustur({ yol = null, sor = true } = {}) {
    const p = plan();
    if (!p || !p.sonuc || !p.sonuc.araclar.length) {
      bildirim(t('rapor.oncePlanla'), { tur: 'uyari' });
      return null;
    }
    if (sor && !sonucGuncelMi(p)) {
      const devam = await onayIste({ baslik: t('rapor.eskiBaslik'), metin: t('rapor.eskiMetin'), tamam: t('rapor.eskiDevam') });
      if (!devam) return null;
    }
    pdfDugme.disabled = true;
    pdfDugme.classList.add('calisiyor');
    pdfDugme.querySelector('span').textContent = t('rapor.hazirlaniyor');
    let kaldir = null;
    try {
      const goruntuler = await raporGoruntuleri();
      // Kalan boşluk tablosu ve (elle düzenlenmişse) denetim sonucu
      const { kalanBosluklar, ihlaller } = await duzenleme.raporVerisi();
      kaldir = raporKur(p, goruntuler, { aracBilgisi: sonucAraci, kalanBosluklar, ihlaller });
      await raporHazir();
      const cevap = await istek('pdfKaydet', { onerilenAd: t('rapor.dosyaAdi', { ad: p.ad }), yatay: true, ...(yol ? { yol } : {}) });
      if (cevap && cevap.yol) {
        bildirim(t('rapor.kaydedildi'), {
          tur: 'basari',
          eylem: kabukVar ? { metin: t('planlar.klasordeGoster'), fn: () => istek('dosyaGoster', { yol: cevap.yol }).catch(() => {}) } : null,
        });
        return cevap.yol;
      }
      return null;
    } catch (e) {
      hataKutusu({ baslik: t('rapor.hata'), metin: e.message || t('genel.bilinmeyenHata') });
      return null;
    } finally {
      if (kaldir) kaldir();
      pdfDugme.classList.remove('calisiyor');
      pdfDugme.querySelector('span').textContent = t('rapor.dugme');
      pdfDugmesiniGuncelle();
    }
  }

  function pdfDugmesiniGuncelle() {
    const p = plan();
    pdfDugme.disabled = !(p && p.sonuc && p.sonuc.araclar.length);
  }

  // ------------------------------------------------------------------ planla

  const planlaDugme = el('.planla-dugme');
  planlaDugme.addEventListener('click', () => planlaTikla());

  function planlaDurumu(hesap, yuzdeDeger = null) {
    planlaDugme.classList.toggle('hesaplaniyor', hesap);
    planlaDugme.classList.toggle('belirsiz', hesap && yuzdeDeger == null);
    planlaDugme.disabled = hesap;
    const ilerleme = el('.planla-ilerleme');
    if (!hesap) {
      // Bitince dolgu geri akmadan kaybolsun
      ilerleme.style.transition = 'none';
      ilerleme.style.width = '0%';
      void ilerleme.offsetWidth;
      ilerleme.style.transition = '';
    } else ilerleme.style.width = yuzdeDeger != null ? `${Math.max(4, yuzdeDeger)}%` : '0%';
    el('.planla-metin').textContent = !hesap
      ? t('plan.planla')
      : yuzdeDeger == null ? t('plan.hesaplaniyor') : t('plan.hesaplaniyorYuzde', { y: Math.round(yuzdeDeger) });
  }

  function dogrula(p) {
    for (const a of [p.arac, ...p.filo]) {
      if (!(a.uzunluk > 0 && a.en > 0 && a.yukseklik > 0)) return t('plan.dogrulama.aracOlcu');
    }
    if (!p.kalemler.length) return t('plan.dogrulama.kalemYok');
    const eksik = p.kalemler.find((k) => !(k.uzunluk > 0 && k.en > 0 && k.yukseklik > 0));
    if (eksik) return t('plan.dogrulama.kalemOlcu', { ad: eksik.ad });
    return null;
  }

  /** sorma: elle düzenlenmiş planda soru sorulmaz ("Otomatik plana dön" ilk sonucu bulamazsa) */
  async function planlaTikla({ sorma = false } = {}) {
    if (hesaplaniyor || !plan()) return;
    const p = plan();
    const hata = dogrula(p);
    if (hata) {
      bildirim(hata, { tur: 'uyari' });
      return;
    }
    if (p.sonuc && p.elleDuzenlendi && !sorma) {
      const devam = await onayIste({
        baslik: t('plan.duzenle.planlaBaslik'),
        metin: t('plan.duzenle.planlaSoru'),
        tamam: t('plan.duzenle.planlaDevam'),
        tehlike: true,
      });
      if (!devam || plan() !== p) return;
    }
    hesaplaniyor = true;
    planlaDurumu(true);
    const girdi = motorGirdisi(p);
    const bas = performance.now();
    try {
      const sonuc = await motordaPlanla(girdi, (y) => planlaDurumu(true, y));
      // Çok kısa süren hesapta düğme bir an görünsün
      const kalan = 450 - (performance.now() - bas);
      if (kalan > 0) await new Promise((r) => setTimeout(r, kalan));
      if (plan() !== p) return;
      p.sonuc = sonuc;
      p.sonucImza = girdiImzasi(girdi);
      p.sonucArac = { ...kopya(p.arac), filo: p.filo.map(kopya) };
      // Yeni hesap elle yapılan değişiklikleri siler
      p.elleDuzenlendi = false;
      p.otomatikSonuc = null;
      aktifArac = 0;
      secim = new Set();
      duzenleme.sonucYenilendi();
      planDegisti('sonuc');
      sonucCiz({ animasyon: 'dusus' });
    } catch (e) {
      hataKutusu({ baslik: t('plan.hata.baslik'), metin: e.message || t('genel.bilinmeyenHata'), ayrinti: e.ayrinti || '' });
    } finally {
      hesaplaniyor = false;
      planlaDurumu(false);
    }
  }
  document.addEventListener('istif:planla', () => planlaTikla());

  // ------------------------------------------------------------------ 3B görünüm

  const sahneKap = el('.sahne-kap');
  const ipucu = el('.sahne-ipucu');
  const oynatici = el('.oynatici');
  const adimCubugu = el('.adim-cubugu');
  const yakinlikCubugu = el('.yakinlik-cubugu');

  let gorunumHazirOldu;
  let gorunumHazirDegil;
  /** 3B görünüm kurulunca (ya da kurulamayınca) çözülür */
  const gorunumSozu = new Promise((coz, reddet) => {
    gorunumHazirOldu = coz;
    gorunumHazirDegil = reddet;
  });
  gorunumSozu.catch(() => {}); // 3B açılamazsa rapor görüntüsüz hazırlanır

  function gorunumHazirla() {
    if (gorunum || gorunumDenendi) return;
    gorunumDenendi = true;
    import('../gorunum3d/sahne.js')
      .then(({ Gorunum3B }) => {
        const dg = duzenleme.geri;
        gorunum = new Gorunum3B(el('.sahne-tuval-kap'), {
          parcaTiklandi: (anahtar, s) => parcaTiklandi(anahtar, s),
          duzenleBasildi: dg.basildi,
          duzenleSurukleBasla: dg.basladi,
          duzenleSurukle: dg.suruklendi,
          duzenleBirak: dg.birakildi,
          duzenleTiklandi: dg.birakmadanCikti,
          duzenleIptal: dg.iptal,
          alanSecildi: dg.alanSecildi,
          ustunde: ipucuGoster,
          adimDegisti,
          oynatmaDegisti: (oynuyor) => {
            const d = $('[data-oynat="oynat"]', oynatici);
            d.innerHTML = simge(oynuyor ? 'durdur' : 'oynat', 18);
            d.title = t(oynuyor ? 'plan.gorunum.durdur' : 'plan.gorunum.oynat');
            d.setAttribute('aria-label', d.title);
            d.classList.toggle('oynuyor', oynuyor);
          },
          yakinlikDegisti: (v) => {
            if (document.activeElement !== yakinlikCubugu) yakinlikCubugu.value = String(Math.round(v * 100));
          },
        }, { acikTema: etkinTema() === 'acik' });
        sahneyiGuncelle({ animasyon: plan()?.sonuc ? 'dusus' : 'yok' });
        gorunumHazirOldu();
      })
      .catch((e) => {
        console.error('3B görünüm açılamadı', e);
        el('.sahne-hata').hidden = false;
        sahneKap.classList.add('webgl-yok');
        gorunumHazirDegil(e);
      });
  }
  temaDinle((tema) => gorunum?.temaAyarla(tema === 'acik'));

  function aracBilgisi(a) {
    return { tur: a.tur, en: a.en, yukseklik: a.yukseklik, uzunluk: a.uzunluk, aks: a.aks, kapiPayiMm: a.kapiPayiMm || 0 };
  }

  /**
   * Sonuçtaki bir aracın ölçüleri: motor her araca kendi ölçüsünü ve adını yazar (karışık filoda araçlar farklıdır).
   * Tür (3B modeli), kapı ağzı ve kaynak, hesap anındaki plan aracıyla (ana araç ya da filodaki araç) eşlenerek alınır.
   */
  function sonucAraci(a) {
    const temel = plan().sonucArac || plan().arac;
    const adaylar = [temel, ...(temel.filo || [])];
    const ayni = (c) => a && c.en === a.en && c.yukseklik === a.yukseklik && c.uzunluk === a.uzunluk;
    const eslesen = (a && (adaylar.find((c) => ayni(c) && c.ad === a.ad) || adaylar.find(ayni))) || temel;
    const sec = (ad) => (a && a[ad] != null ? a[ad] : eslesen[ad]);
    return {
      ad: sec('ad'),
      tur: eslesen.tur,
      en: sec('en'),
      yukseklik: sec('yukseklik'),
      uzunluk: sec('uzunluk'),
      maksAgirlik: sec('maksAgirlik'),
      kapiPayiMm: sec('kapiPayiMm') || 0,
      aks: a && a.aks !== undefined ? a.aks : eslesen.aks,
      kapi: eslesen.kapi || null,
    };
  }

  function kalemBul(id) {
    return plan().kalemler.find((k) => k.id === id) || null;
  }

  function parcaEtiketi(y) {
    const k = kalemBul(y.kalemId);
    return k ? k.ad : String(y.ad || '').replace(/\s+\d+\/\d+$/, '');
  }

  function aktifSonucAraci() {
    const s = plan().sonuc;
    return s && s.araclar.length ? s.araclar[Math.min(aktifArac, s.araclar.length - 1)] : null;
  }

  /** 3B'ye giden yerleşim: parça üst yüzünde kalem adı, "üstüne konamaz" çapraz çizgisi */
  function susle(yerlesimler) {
    return yerlesimler.map((y) => ({
      ...y,
      etiket: parcaEtiketi(y),
      ustuneKonabilir: kalemBul(y.kalemId)?.ustuneKonabilir !== false,
    }));
  }

  /** Ağırlık merkezi, kullanılan uzunluk ve aks işaretleri */
  function isaretBilgisi(a) {
    const arac = sonucAraci(a);
    return { agirlikMerkezi: a.agirlikMerkezi, kullanilanUzunluk: a.kullanilanUzunluk, aks: arac.aks, aksYukleri: a.aksYukleri };
  }

  function sahneyiGuncelle({ animasyon = 'yok' } = {}) {
    const p = plan();
    if (!gorunum || !p) return;
    const a = aktifSonucAraci();
    if (a) {
      const arac = sonucAraci(a);
      gorunum.aracKur(aracBilgisi(arac));
      gorunum.yukleriKur(susle(a.yerlesimler), { animasyon, isaretler: isaretBilgisi(a) });
      gorunum.secimAyarla([...secim], { odak: !duzenleme.acik() });
    } else {
      gorunum.aracKur(aracBilgisi(p.arac));
      gorunum.yukleriKur([], { animasyon: 'yok' });
    }
    duzenleme.sahneKuruldu();
  }

  function adimDegisti(adim, toplam) {
    oynatici.hidden = !toplam;
    sahneKap.classList.toggle('oynatici-var', !!toplam);
    adimCubugu.max = String(toplam);
    adimCubugu.value = String(adim);
    adimCubugu.style.setProperty('--dolu', toplam ? `${(adim / toplam) * 100}%` : '0%');
    el('.adim-metin').textContent = t('plan.gorunum.adim', { a: adim, t: toplam });
    $$('tbody tr', kok).forEach((tr) => {
      const sira = Number(tr.dataset.sira);
      tr.classList.toggle('bekliyor', sira > adim);
      tr.classList.toggle('simdiki', sira === adim && adim < toplam);
    });
  }

  oynatici.addEventListener('click', (e) => {
    const d = e.target.closest('[data-oynat]');
    if (!d || !gorunum) return;
    const ne = d.dataset.oynat;
    if (ne === 'oynat') gorunum.oynuyor ? gorunum.durdur() : gorunum.oynat();
    else {
      gorunum.durdur();
      if (ne === 'basa') gorunum.adimaGit(0, { animasyon: false });
      if (ne === 'onceki') gorunum.adimaGit(gorunum.adim - 1, { animasyon: false });
      if (ne === 'sonraki') gorunum.adimaGit(gorunum.adim + 1);
    }
  });
  adimCubugu.addEventListener('input', () => {
    if (!gorunum) return;
    gorunum.durdur();
    gorunum.adimaGit(Number(adimCubugu.value), { animasyon: false });
  });

  el('.gorunum-cubugu').addEventListener('click', (e) => {
    const d = e.target.closest('[data-gorunum]');
    if (!d || !gorunum) return;
    const g = d.dataset.gorunum;
    if (g !== 'sigdir') $$('.gorunum-dugme', kok).forEach((b) => b.classList.toggle('secili', b === d));
    gorunum.gorunum(g);
  });

  // Yakınlaştırma, PNG ve tam ekran
  el('.sahne-araclari').addEventListener('click', (e) => {
    const d = e.target.closest('[data-sahne]');
    if (!d || !gorunum) return;
    const ne = d.dataset.sahne;
    if (ne === 'yakin') gorunum.yakinlastir(0.08);
    else if (ne === 'uzak') gorunum.yakinlastir(-0.08);
    else if (ne === 'png') pngKaydet();
    else if (ne === 'tamEkran') tamEkran();
  });
  yakinlikCubugu.addEventListener('input', () => gorunum?.yakinlikAyarla(Number(yakinlikCubugu.value) / 100));

  async function pngKaydet() {
    const p = plan();
    let veri;
    try {
      veri = gorunum.ekranGoruntusu({ olcek: 2, zemin: PNG_ZEMIN[etkinTema()] });
    } catch (e) {
      hataKutusu({ baslik: t('plan.gorunum.png'), metin: e.message || t('genel.bilinmeyenHata') });
      return;
    }
    const a = aktifSonucAraci();
    const ek = a && p.sonuc.araclar.length > 1 ? ` - ${t('plan.gorunum.aracSekme', { n: a.no ?? aktifArac + 1 })}` : '';
    try {
      const cevap = await istek('dosyaKaydet', { onerilenAd: t('plan.gorunum.pngAdi', { ad: p.ad + ek }), base64: veri.split(',')[1], filtre: 'png' });
      if (cevap && cevap.yol) {
        bildirim(t('plan.gorunum.pngKaydedildi'), {
          tur: 'basari',
          eylem: kabukVar ? { metin: t('planlar.klasordeGoster'), fn: () => istek('dosyaGoster', { yol: cevap.yol }).catch(() => {}) } : null,
        });
      }
    } catch (e) {
      hataKutusu({ baslik: t('plan.gorunum.png'), metin: e.message });
    }
  }

  function tamEkran() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else sahneKap.requestFullscreen().catch((e) => hataKutusu({ baslik: t('plan.gorunum.tamEkran'), metin: e.message }));
  }
  document.addEventListener('fullscreenchange', () => {
    const acik = document.fullscreenElement === sahneKap;
    const d = $('[data-sahne="tamEkran"]', kok);
    d.innerHTML = simge(acik ? 'tamEkranCik' : 'tamEkran', 17);
    d.title = t(acik ? 'plan.gorunum.tamEkranCik' : 'plan.gorunum.tamEkran');
    d.setAttribute('aria-label', d.title);
    sahneKap.classList.toggle('tam-ekran', acik);
  });

  function ipucuGoster(y, x, yy) {
    if (!y) {
      ipucu.hidden = true;
      return;
    }
    const notlar = [];
    if (y.ustte) notlar.push(t('plan.ipucu.ustte'));
    if (y.donduruldu) notlar.push(t('plan.ipucu.donduruldu'));
    ipucu.innerHTML = `
      <div class="ipucu-baslik"><span class="nokta" data-boya="${kac(y.renk)}"></span>${kac(y.ad)}</div>
      <dl>
        <dt>${kac(t('plan.ipucu.olcu'))}</dt><dd>${olcu(y.uzunluk, y.en, y.yukseklik)} ${kac(olcuBirimi())}</dd>
        <dt>${kac(t('plan.ipucu.agirlik'))}</dt><dd>${kac(kg(y.agirlik))}</dd>
        <dt>${kac(t('plan.ipucu.sira'))}</dt><dd>${sayi(y.sira)}</dd>
        <dt>${kac(t('plan.ipucu.konum'))}</dt><dd>${kac(t('plan.ipucu.konumDegeri', { m: metre(y.z), y: metre(y.y) }))}</dd>
      </dl>
      ${notlar.length ? `<div class="ipucu-not">${notlar.map(kac).join(' · ')}</div>` : ''}`;
    boyalariUygula(ipucu);
    ipucu.hidden = false;
    const r = sahneKap.getBoundingClientRect();
    const g = ipucu.offsetWidth;
    const h = ipucu.offsetHeight;
    let sol = x - r.left + 16;
    let ust = yy - r.top + 16;
    if (sol + g > r.width - 8) sol = x - r.left - g - 16;
    if (ust + h > r.height - 8) ust = yy - r.top - h - 16;
    ipucu.style.transform = `translate(${Math.max(8, sol)}px, ${Math.max(8, ust)}px)`;
  }

  // ------------------------------------------------------------------ sonuç: sekmeler, özet, tablo, uyarılar

  function sonucCiz({ animasyon = 'yok' } = {}) {
    const p = plan();
    const s = p.sonuc;
    const var_ = !!(s && s.araclar.length);
    sahneKap.classList.toggle('sonuclu', var_);
    el('.sahne-bos').hidden = var_;
    sekmeleriCiz();
    ozetCiz({ animasyon: animasyon !== 'yok' });
    agirlikCiz();
    tabloCiz();
    uyarilariCiz();
    rozetleriCiz();
    sahneyiGuncelle({ animasyon });
  }

  /** Elle düzenlemeden sonra: 3B dışında her şey (özet, ağırlık, sıra, sekmeler, uyarılar) yeni yerleşimle */
  function sonucYenile() {
    sekmeleriCiz();
    ozetCiz();
    agirlikCiz();
    tabloCiz();
    uyarilariCiz();
    rozetleriCiz();
    ustCiz();
  }

  function agirlikCiz() {
    const a = aktifSonucAraci();
    agirlikDagilimiCiz(el('.agirlik-serit'), a, a ? sonucAraci(a) : null);
  }

  function sekmeleriCiz() {
    const s = plan().sonuc;
    const kap = el('.arac-sekmeleri');
    const n = s ? s.araclar.length : 0;
    kap.hidden = n < 2;
    if (n < 2) return;
    kap.innerHTML = s.araclar.map((a, i) => `
      <button type="button" role="tab" class="arac-sekme${i === aktifArac ? ' secili' : ''}" data-i="${i}" aria-selected="${i === aktifArac}" title="${kac(sonucAraci(a).ad)}">
        <span>${kac(t('plan.gorunum.aracSekme', { n: a.no ?? i + 1 }))}</span>
        <span class="arac-sekme-tip">${kac(sonucAraci(a).ad)}</span>
        <small>${kac(yuzde(a.hacimDoluluk || 0, 0))}</small>
      </button>`).join('');
  }
  el('.arac-sekmeleri').addEventListener('click', (e) => {
    const b = e.target.closest('.arac-sekme');
    if (!b) return;
    sekmeSec(Number(b.dataset.i));
  });
  el('.arac-sekmeleri').addEventListener('keydown', (e) => {
    const n = plan()?.sonuc?.araclar.length || 0;
    if (!n || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    e.preventDefault();
    const ileri = (e.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl');
    sekmeSec((aktifArac + (ileri ? 1 : -1) + n) % n);
    $(`.arac-sekme[data-i="${aktifArac}"]`, kok)?.focus();
  });

  function sekmeSec(i) {
    if (i === aktifArac) return;
    gorunum?.surukleIptal();
    aktifArac = i;
    secim = new Set();
    gorunum?.secimAyarla([]);
    sekmeleriCiz();
    ozetCiz({ animasyon: true });
    agirlikCiz();
    tabloCiz();
    uyarilariCiz();
    sahneyiGuncelle({ animasyon: 'hizli' });
  }

  function ozetKutusuYaz(ad, { deger, bicim, alt = '', alt2 = '', cubuk = null, cubukDurum = '', animasyon }) {
    const k = el(`[data-ozet="${ad}"]`);
    const d = $('.ozet-deger', k);
    if (deger == null) d.textContent = t('plan.ozet.bos');
    else if (animasyon) sayacOynat(d, deger, bicim);
    else d.textContent = bicim(deger);
    $('.ozet-alt', k).textContent = alt;
    const a2 = $('.ozet-alt2', k);
    if (a2) {
      a2.textContent = alt2;
      a2.hidden = !alt2;
    }
    const c = $('.ozet-cubuk', k);
    if (c) {
      c.hidden = cubuk == null;
      const ic = $('i', c);
      ic.style.width = `${Math.max(0, Math.min(100, cubuk || 0))}%`;
      c.dataset.durum = cubukDurum;
    }
  }

  function ozetCiz({ animasyon = false } = {}) {
    const p = plan();
    const s = p.sonuc;
    const kutular = ['arac', 'hacim', 'agirlik', 'uzunluk', 'merkez'];
    if (!s || !s.araclar.length) {
      kutular.forEach((ad) => ozetKutusuYaz(ad, { deger: null, bicim: String, alt: '' }));
      $$('.ozet-birim', kok).forEach((b) => (b.textContent = ''));
      el('.ozet-serit').classList.add('bos');
      return;
    }
    el('.ozet-serit').classList.remove('bos');
    const a = aktifSonucAraci();
    const arac = sonucAraci(a);
    const L = arac.uzunluk;
    const kullanilabilir = Math.max(1, L - (arac.kapiPayiMm || 0));
    const toplamHacim = arac.en * arac.yukseklik * kullanilabilir;
    const doluHacim = a.yerlesimler.reduce((tp, y) => tp + y.en * y.yukseklik * y.uzunluk, 0);

    ozetKutusuYaz('arac', {
      deger: s.araclar.length, bicim: (v) => sayi(Math.round(v)),
      alt: arac.ad,
      alt2: s.araclar.length > 1 ? t('plan.gorunum.aracSekme', { n: a.no ?? aktifArac + 1 }) : '',
      animasyon,
    });
    ozetKutusuYaz('hacim', {
      deger: a.hacimDoluluk || 0, bicim: (v) => yuzde(v),
      alt: t('plan.ozet.hacimAlt', { dolu: m3(doluHacim), toplam: m3(toplamHacim) }),
      cubuk: a.hacimDoluluk || 0, animasyon,
    });
    const maks = a.maksAgirlik ?? arac.maksAgirlik ?? 0;
    const oran = maks > 0 ? (a.toplamAgirlik / maks) * 100 : null;
    ozetKutusuYaz('agirlik', {
      deger: a.toplamAgirlik || 0, bicim: (v) => kg(v),
      alt: maks > 0 ? t('plan.ozet.sinir', { kg: kg(maks) }) : t('plan.ozet.sinirYok'),
      cubuk: oran, cubukDurum: oran == null ? '' : oran > 100 ? 'asim' : oran > 90 ? 'sinirda' : '',
      animasyon,
    });
    ozetKutusuYaz('uzunluk', {
      deger: a.kullanilanUzunluk || 0, bicim: (v) => metre(v),
      alt: t('plan.ozet.uzunlukAlt', { toplam: metre(L), bos: metre(Math.max(0, L - (a.kullanilanUzunluk || 0))) }),
      cubuk: ((a.kullanilanUzunluk || 0) / L) * 100, animasyon,
    });
    const m = a.agirlikMerkezi;
    if (m && Number.isFinite(m.z)) {
      const fark = m.z - L / 2;
      const alt = Math.abs(fark) < 50 ? t('plan.ozet.ortada')
        : fark < 0 ? t('plan.ozet.onde', { m: metre(Math.abs(fark)) }) : t('plan.ozet.arkada', { m: metre(fark) });
      const aks = a.aksYukleri ? t('plan.ozet.aks', { s: kg(a.aksYukleri.sasi), a: kg(a.aksYukleri.aks) }) : '';
      ozetKutusuYaz('merkez', { deger: m.z, bicim: (v) => `${metre(v)}`, alt, alt2: aks, animasyon });
      el('[data-ozet="merkez"]').title = aks ? t('plan.ozet.aksTahmini') : '';
      $('.ozet-birim', el('[data-ozet="merkez"]')).textContent = t('plan.ozet.onden');
    } else {
      ozetKutusuYaz('merkez', { deger: null, bicim: String });
    }
  }

  function tabloCiz() {
    const govde = $('tbody', kok);
    const a = aktifSonucAraci();
    el('.tablo-bos').hidden = !!a;
    el('.sira-sayi').textContent = a ? t('plan.sira.alt', { n: a.yerlesimler.length }) : '';
    if (!a) {
      govde.innerHTML = '';
      return;
    }
    const sirali = [...a.yerlesimler].sort((x, y) => x.sira - y.sira);
    govde.innerHTML = sirali.map((y) => {
      const anahtar = parcaAnahtari(y);
      const ihlal = duzenleme.parcaIhlali(anahtar);
      const sinif = [secim.has(anahtar) ? 'secili' : '', ihlal === 'hata' ? 'hatali' : ''].filter(Boolean).join(' ');
      return `
      <tr data-sira="${y.sira}" data-anahtar="${kac(anahtar)}" tabindex="-1"${sinif ? ` class="${sinif}"` : ''}>
        <td class="sag sira-no">${sayi(y.sira)}</td>
        <td><span class="parca-ad"><span class="nokta" data-boya="${kac(y.renk)}"></span>${kac(y.ad)}</span></td>
        <td class="sag rakam">${olcu(y.uzunluk, y.en, y.yukseklik)}</td>
        <td class="sag rakam">${kac(kg(y.agirlik))}</td>
        <td class="sag rakam">${kac(metre(y.z))}</td>
        <td class="notlar">${ihlal === 'hata' ? `<span class="etiket etiket--kirmizi">${simge('hata', 12)}${kac(t('plan.duzenle.tabloHata'))}</span>` : ihlal === 'uyari' ? `<span class="etiket etiket--sari">${simge('uyari', 12)}${kac(t('plan.duzenle.tabloUyari'))}</span>` : ''}${y.ustte ? `<span class="etiket etiket--mavi">${kac(t('plan.sira.ustte'))}</span>` : ''}${y.donduruldu ? `<span class="etiket">${simge('dondur', 12)}${kac(t('plan.sira.donduruldu'))}</span>` : ''}</td>
      </tr>`;
    }).join('');
    boyalariUygula(govde);
    if (gorunum) adimDegisti(gorunum.adim, gorunum.parcalar.length);
  }

  /**
   * Seçimi kurar: tablo satırları, 3B ve düzenleyici (kalan boşluk, düğmeler) birlikte izler.
   * kaydir: ilk seçili satır görünür alana kaydırılır.
   */
  function secimAyarla(anahtarlar, { kaydir = false } = {}) {
    secim = new Set(anahtarlar);
    const satirlar = $$('tbody tr', kok);
    satirlar.forEach((tr) => tr.classList.toggle('secili', secim.has(tr.dataset.anahtar)));
    gorunum?.secimAyarla([...secim], { odak: !duzenleme.acik() });
    if (kaydir && secim.size) {
      satirlar.find((tr) => secim.has(tr.dataset.anahtar))?.scrollIntoView({ block: 'nearest', behavior: azHareket() ? 'auto' : 'smooth' });
    }
    duzenleme.secimDegisti();
  }

  /** 3B'de tıklanan parça: düzenlemede Ctrl ile seçime eklenir/çıkar, dışında tek parça seçilir */
  function parcaTiklandi(anahtar, { ctrl = false } = {}) {
    if (duzenleme.acik()) duzenleme.tiklandi(anahtar, { ctrl });
    else secimAyarla(anahtar ? [anahtar] : [], { kaydir: true });
  }

  $('tbody', kok).addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const anahtar = tr.dataset.anahtar;
    if (duzenleme.acik()) duzenleme.tiklandi(anahtar, { ctrl: e.ctrlKey || e.metaKey });
    else secimAyarla(secim.has(anahtar) && secim.size === 1 ? [] : [anahtar]);
  });
  $('tbody', kok).addEventListener('dblclick', (e) => {
    const tr = e.target.closest('tr');
    if (tr && gorunum) gorunum.odaklan(Number(tr.dataset.sira), { sec: !duzenleme.acik() });
  });

  function sebepMetni(sebep) {
    return t('plan.uyari.sebep.' + (['olcu', 'agirlik', 'kural', 'sinir'].includes(sebep) ? sebep : 'bilinmiyor'));
  }

  /** Kapı ağzından geçmeyen kalemler (motorda değil, arayüzde basit denetim) */
  function kapiUyariKutusu(araclar) {
    const p = plan();
    const satirlar = [];
    for (const arac of araclar) {
      if (!arac || !arac.kapi) continue;
      for (const k of p.kalemler) {
        if (kapidanGecmez(k, arac)) satirlar.push({ ad: k.ad, arac: arac.ad, kapi: `${cm(arac.kapi.en)} × ${cm(arac.kapi.yukseklik)} ${olcuBirimi()}` });
      }
    }
    if (!satirlar.length) return '';
    return `<div class="durum-kutu durum-kutu--uyari">
      <h3>${simge('kapi', 17)}${kac(t('plan.kapi.baslik'))}<span class="sayac-rozet">${sayi(satirlar.length)}</span></h3>
      <ul>${satirlar.map((s) => `<li><b>${kac(s.ad)}</b><span>${kac(t('plan.kapi.satir', { arac: s.arac, kapi: s.kapi }))}</span></li>`).join('')}</ul>
    </div>`;
  }

  function uyarilariCiz() {
    const p = plan();
    const s = p.sonuc;
    const kap = el('.uyari-sutun');
    if (!s || !s.araclar) {
      kap.innerHTML = kapiUyariKutusu([p.arac, ...p.filo]) +
        `<div class="durum-kutu durum-kutu--notr">${simge('bilgi', 18)}<p>${kac(t('plan.uyari.bekliyor'))}</p></div>`;
      return;
    }
    const a = aktifSonucAraci();
    const uyarilar = a ? (a.uyarilar || []).map(motorMetni) : [];
    const sigmayan = s.sigmayanlar || [];

    // Sığmayanlar kalem ve sebebe göre toplanır
    const gruplar = new Map();
    for (const x of sigmayan) {
      const anahtarAd = `${x.kalemId}|${x.sebep}`;
      const g = gruplar.get(anahtarAd) || { ad: kalemBul(x.kalemId)?.ad || String(x.ad || '').replace(/\s+\d+\/\d+$/, ''), parca: x.ad, sayi: 0, sebep: x.sebep };
      g.sayi += 1;
      gruplar.set(anahtarAd, g);
    }

    const uyariKutusu = uyarilar.length
      ? `<div class="durum-kutu durum-kutu--uyari">
           <h3>${simge('uyari', 17)}${kac(t('plan.uyari.baslik'))}<span class="sayac-rozet">${sayi(uyarilar.length)}</span></h3>
           <ul>${uyarilar.map((u) => `<li>${kac(u)}</li>`).join('')}</ul>
         </div>`
      : `<div class="durum-kutu durum-kutu--sakin">${simge('onayDaire', 17)}<p>${kac(t('plan.uyari.yok'))}</p></div>`;

    const sigmayanKutusu = sigmayan.length
      ? `<div class="durum-kutu durum-kutu--hata">
           <h3>${simge('hata', 17)}${kac(t('plan.uyari.sigmayanBaslik'))}<span class="sayac-rozet">${sayi(sigmayan.length)}</span></h3>
           <ul>${[...gruplar.values()].map((g) => `
             <li><b>${kac(g.sayi > 1 ? `${g.ad} × ${sayi(g.sayi)}` : g.parca)}</b><span>${kac(sebepMetni(g.sebep))}</span></li>`).join('')}
           </ul>
         </div>`
      : `<div class="durum-kutu durum-kutu--basari">${simge('onayDaire', 17)}<p>${kac(t('plan.uyari.sigmayanYok'))}</p></div>`;

    const sureNotu = s.ozet && s.ozet.sureSiniri
      ? `<div class="durum-kutu durum-kutu--bilgi">${simge('bilgi', 17)}<p>${kac(t('plan.uyari.sureSiniri'))}</p></div>`
      : '';

    // Elle düzenleme: hatalar en üstte; kalan boşluk düzenlerken üstte, değilken altta
    const ihlal = duzenleme.ihlalHtml();
    const bosluk = a ? duzenleme.boslukHtml() : '';
    const motor = sigmayanKutusu + kapiUyariKutusu(a ? [sonucAraci(a)] : []) + uyariKutusu + sureNotu;
    kap.innerHTML = duzenleme.acik() ? ihlal + bosluk + motor : ihlal + motor + bosluk;
  }

  // Hata listesindeki parçaya tıklayınca 3B'de seçilir ve kameraya alınır
  el('.uyari-sutun').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-anahtar]');
    if (li) duzenleme.parcayaGit(li.dataset.anahtar);
  });
  el('.uyari-sutun').addEventListener('keydown', (e) => {
    const li = e.target.closest('li[data-anahtar]');
    if (li && e.key === 'Enter') duzenleme.parcayaGit(li.dataset.anahtar);
  });

  function rozetleriCiz() {
    const p = plan();
    const kap = el('.sahne-rozetler');
    const parcalar = [];
    if (p.sonuc && !sonucGuncelMi(p)) {
      parcalar.push(`<span class="sahne-rozet sahne-rozet--uyari">${simge('uyari', 15)}${kac(t('plan.gorunum.eskiSonuc'))}</span>`);
    }
    if (p.sonuc && p.sonuc.ozet && p.sonuc.ozet.ornek) {
      parcalar.push(`<span class="sahne-rozet">${simge('bilgi', 15)}${kac(t('plan.gorunum.ornekSonuc'))}</span>`);
    }
    kap.innerHTML = parcalar.join('');
    planlaDugme.classList.toggle('dikkat', !!p.sonuc && !sonucGuncelMi(p));
    if (!pdfDugme.classList.contains('calisiyor')) pdfDugmesiniGuncelle();
  }

  // ------------------------------------------------------------------ olaylar

  function hepsiniCiz({ giris = false } = {}) {
    if (!plan()) return;
    ustCiz();
    aracKarti.ciz();
    kalemListesiCiz({ giris });
    sonucCiz({ animasyon: plan().sonuc ? 'hizli' : 'yok' });
  }

  dinle('planAcildi', () => {
    gorunum?.surukleIptal();
    aktifArac = 0;
    secim = new Set();
    gorunum?.secimAyarla([]);
    duzenleme.planAcildi();
    hepsiniCiz({ giris: true });
  });
  dinle('planYenile', (detay) => {
    // Geri al / yinele: girdiler değişti; elle düzenleme adımıysa parçalar eski yerine süzülür
    if (kok.hidden) return;
    ustCiz();
    aracKarti.ciz();
    kalemListesiCiz();
    rozetleriCiz();
    uyarilariCiz();
    if (!plan().sonuc) sahneyiGuncelle({ animasyon: 'yok' });
    else if (detay && detay.elleDegisti) duzenleme.gecmisUygulandi();
  });
  dinle('gecmis', () => gecmisDugmeleri());
  dinle('planDegisti', (ne) => {
    if (!plan()) return;
    ustCiz();
    if (ne !== 'sonuc') rozetleriCiz();
    duzenleme.girdiDegisti(ne);
    if (ne === 'kalem') {
      kalemListesiCiz();
      if (!plan().sonuc) uyarilariCiz();
    }
    if (ne === 'arac' || ne === 'aracAlani') {
      if (ne === 'arac') {
        aracKarti.ciz();
        kalemListesiCiz();
        if (!plan().sonuc) uyarilariCiz();
      }
      // Sonuç yokken 3B'deki araç ölçüleri izler
      if (!plan().sonuc) {
        clearTimeout(aracGuncellemeSaati);
        aracGuncellemeSaati = setTimeout(() => sahneyiGuncelle({ animasyon: 'yok' }), 250);
      }
    }
  });
  dinle('planKaydedildi', () => ustCiz());

  return {
    kok,
    goster() {
      if (!plan()) return;
      gorunumHazirla();
      gorunum?.etkinlestir(true);
      if (ilkGosterim) {
        ilkGosterim = false;
        hepsiniCiz({ giris: true });
      } else {
        ustCiz();
      }
    },
    gizle() {
      gorunum?.surukleIptal();
      gorunum?.durdur();
      gorunum?.etkinlestir(false);
      ipucu.hidden = true;
      aracKarti.menuKapat();
      if (document.fullscreenElement === sahneKap) document.exitFullscreen().catch(() => {});
    },
    planla: planlaTikla,
    pdf: pdfOlustur,
    /** Geliştirme ve ekran görüntüsü için */
    gorunum: () => gorunum,
    sekmeSec,
    duzenleme,
    secimAyarla,
  };
}

function ozetKutusu(ad, simgeAdi, etiket, cubuk) {
  return `
    <div class="ozet-kutu" data-ozet="${ad}">
      <span class="ozet-etiket">${simge(simgeAdi, 15)}${kac(etiket)}</span>
      <span class="ozet-satir"><span class="ozet-deger">—</span><span class="ozet-birim"></span></span>
      <span class="ozet-alt"></span>
      <span class="ozet-alt2" hidden></span>
      ${cubuk ? '<span class="ozet-cubuk" hidden><i></i></span>' : ''}
    </div>`;
}
