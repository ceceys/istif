// Uygulamanın girişi: ayarlar, dil, tema, katalog; gezinme şeridi, ekranlar, kısayollar ve kabuk bildirimleri.
// Açılış sırası: ayarlar okunur → dil ve birim seçilir → tema uygulanır → katalog ve kütüphane yüklenir →
// ekranlar kurulur → (dil değişikliğinden sonra) açık plan geri konur ya da kalan taslak sorulur.
import { t, dilAyarla } from './dil.js';
import { URUN } from './urun.js';
import { kac, birimAyarla } from './bicim.js';
import { simge } from './simgeler.js';
import { $, $$, ogeUret, diyalogAcikMi, hataKutusu } from './arayuz.js';
import { animasyonAyarla } from './hareket.js';
import { bildir, istek, dinle as kabukDinle, kabukVar, yerelTohumla } from './kopru.js';
import {
  durum, dinle, kutuphaneYukle, belgeBasligiGuncelle, yeniPlanNesnesi, planiAc, planJson, geriAl, yinele,
} from './durum.js';
import { ornekPlanVerisi, katalogYukle, katalogBilgisi } from './veri.js';
import { temaAyarla } from './tema.js';
import { ekranKaydet, git, aktifEkran, hashtenEkran } from './yonlendirici.js';
import { yeniPlan, ornekAc, planAc, kaydet, kapatmaIstegi, guncellemeSor, acilanPlaniYukle } from './eylemler.js';
import { taslakBaslat, taslakSor, yenidenYuklemedenDon } from './taslak.js';
import { planlarEkraniKur } from './ekranlar/planlar.js';
import { planEkraniKur } from './ekranlar/plan.js';
import { urunlerEkraniKur } from './ekranlar/urunler.js';
import { araclarEkraniKur } from './ekranlar/araclar.js';
import { ayarlarEkraniKur } from './ekranlar/ayarlar.js';
import { hakkindaEkraniKur } from './ekranlar/hakkinda.js';

const GEZINME = [
  { ad: 'planlar', simge: 'planlar', metin: 'gezinme.planlar' },
  { eylem: 'yeni', simge: 'yeni', metin: 'gezinme.yeniPlan' },
  { ad: 'plan', simge: 'kalem', metin: 'gezinme.acikPlan', gizli: true },
  { ad: 'urunler', simge: 'urunler', metin: 'gezinme.urunler' },
  { ad: 'araclar', simge: 'araclar', metin: 'gezinme.araclar' },
];
const GEZINME_ALT = [
  { ad: 'ayarlar', simge: 'ayarlar', metin: 'gezinme.ayarlar' },
  { ad: 'hakkinda', simge: 'hakkinda', metin: 'gezinme.hakkinda' },
];

function gezinmeOgesi(o) {
  const veri = o.ad ? `data-git="${o.ad}"` : `data-eylem="${o.eylem}"`;
  return `
    <button type="button" class="gezinme-oge" ${veri} ${o.gizli ? 'hidden' : ''} title="${kac(t(o.metin))}">
      ${simge(o.simge, 22)}<span>${kac(t(o.metin))}</span>
    </button>`;
}

function iskeletKur() {
  const kok = ogeUret(`
    <div class="uygulama">
      <nav class="gezinme" aria-label="${kac(URUN.ad)}">
        <div class="gezinme-ust">${GEZINME.map(gezinmeOgesi).join('')}</div>
        <div class="gezinme-alt">${GEZINME_ALT.map(gezinmeOgesi).join('')}</div>
        <span class="gezinme-gosterge" aria-hidden="true"></span>
      </nav>
      <main class="icerik"></main>
    </div>`);
  document.body.prepend(kok);
  return kok;
}

function gostergeyiTasi() {
  const nav = $('.gezinme');
  const ekran = aktifEkran();
  $$('.gezinme-oge', nav).forEach((b) => {
    b.classList.toggle('secili', b.dataset.git === ekran);
    if (b.dataset.git === ekran) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const secili = $(`.gezinme-oge[data-git="${ekran}"]`, nav);
  const gosterge = $('.gezinme-gosterge', nav);
  if (!secili || secili.hidden) {
    gosterge.style.opacity = '0';
    return;
  }
  const r = secili.getBoundingClientRect();
  const n = nav.getBoundingClientRect();
  gosterge.style.opacity = '1';
  gosterge.style.transform = `translateY(${r.top - n.top + r.height / 2 - 12}px)`;
}

function acikPlanOgesi() {
  const oge = $('.gezinme-oge[data-git="plan"]');
  oge.hidden = !durum.plan;
  if (durum.plan) oge.title = durum.plan.ad;
  gostergeyiTasi();
}

/** Yazı alanında mı? (Ctrl+Z orada alanın kendi geri almasıdır) */
function yaziAlaninda() {
  const o = document.activeElement;
  return !!o && (o.tagName === 'TEXTAREA' || (o.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(o.type)) || o.isContentEditable);
}

function kisayollar(planEkrani) {
  document.addEventListener('keydown', (e) => {
    if (diyalogAcikMi() || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    const tus = e.key.toLowerCase();
    if (tus === 'n') { e.preventDefault(); yeniPlan(); }
    else if (tus === 'o') { e.preventDefault(); planAc(); }
    else if (tus === 's' && durum.plan) { e.preventDefault(); kaydet({ farkli: e.shiftKey }); }
    else if (e.key === 'Enter' && aktifEkran() === 'plan') { e.preventDefault(); planEkrani.planla(); }
    else if (aktifEkran() === 'plan' && !yaziAlaninda() && (tus === 'z' || tus === 'y')) {
      e.preventDefault();
      if (tus === 'y' || e.shiftKey) yinele();
      else geriAl();
    }
  });
}

/** Gezinme şeridinde ↑/↓ ile öğeler arasında dolaşılır */
function gezinmeKlavye(nav) {
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const ogeler = $$('.gezinme-oge', nav).filter((o) => !o.hidden);
    const i = ogeler.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    ogeler[(i + (e.key === 'ArrowDown' ? 1 : -1) + ogeler.length) % ogeler.length].focus();
  });
}

/** .istif dosyası pencereye bırakılınca açılır. */
function birakmaKur() {
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault();
  });
  document.addEventListener('drop', async (e) => {
    const dosya = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!dosya) return;
    e.preventDefault();
    if (!dosya.name.toLowerCase().endsWith(URUN.uzanti)) return;
    try {
      acilanPlaniYukle({ yol: null, json: await dosya.text() });
    } catch (h) {
      hataKutusu({ baslik: t('plan.ac'), metin: h.message });
    }
  });
}

/**
 * Geliştirme kipi (?ornek=1, yalnız tarayıcıda): son planlar listesi boşsa örnek yükten iki plan yazılır.
 * İlki arayuz-ornek/ornek-sonuc.json sonucunu taşır, ikincisi 40' HC konteynerde sonuçsuz plandır.
 */
async function gelistirmeTohumu() {
  const ilk = yeniPlanNesnesi(ornekPlanVerisi());
  try {
    const yanit = await fetch(new URL('../../../arayuz-ornek/ornek-sonuc.json', import.meta.url), { cache: 'no-store' });
    if (yanit.ok) {
      ilk.sonuc = await yanit.json();
      ilk.sonucArac = { ...ilk.arac };
    }
  } catch {
    /* örnek sonuç yoksa plan sonuçsuz kalır */
  }
  const ikinci = yeniPlanNesnesi(ornekPlanVerisi('konteyner'));
  yerelTohumla([ilk, ikinci].map((p) => JSON.parse(planJson(p))));
}

/** Kabuktan (ya da tarayıcıda localStorage'dan) ayarları okur; dil, birim ve tema uygulanır. */
async function ayarlariUygula() {
  let a = {};
  try {
    a = (await istek('ayarlarOku')) || {};
  } catch (e) {
    console.warn('Ayarlar okunamadı', e);
  }
  for (const ad of ['dil', 'tema', 'birim', 'varsayilanArac', 'guncellemeDenetimi', 'animasyon']) {
    if (a[ad] !== undefined) durum.ayarlar[ad] = a[ad];
  }
  animasyonAyarla(durum.ayarlar.animasyon);
  durum.surumBilgisi = { kurulu: !!a.kurulu, veriKlasoru: a.veriKlasoru || null, tarayici: !kabukVar };
  await dilAyarla(durum.ayarlar.dil, a.sistemDili);
  durum.sistemDili = a.sistemDili || (navigator.language || 'en').slice(0, 2);
  birimAyarla(durum.ayarlar.birim);
  temaAyarla(durum.ayarlar.tema);
}

async function basla() {
  await ayarlariUygula();
  await katalogYukle();
  belgeBasligiGuncelle();
  const kok = iskeletKur();
  const icerik = $('.icerik', kok);

  const ekranlar = {
    planlar: planlarEkraniKur(),
    plan: planEkraniKur(),
    urunler: urunlerEkraniKur(),
    araclar: araclarEkraniKur(),
    ayarlar: ayarlarEkraniKur(),
    hakkinda: hakkindaEkraniKur(),
  };
  for (const [ad, ekran] of Object.entries(ekranlar)) {
    icerik.appendChild(ekran.kok);
    ekranKaydet(ad, ekran);
  }
  // Geliştirme sayfası ve ekran görüntüsü otomasyonu ekranlara buradan ulaşır
  window.istifEkranlari = ekranlar;

  // Gezinme
  const nav = $('.gezinme', kok);
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('.gezinme-oge');
    if (!b) return;
    if (b.dataset.eylem === 'yeni') yeniPlan();
    else git(b.dataset.git);
  });
  gezinmeKlavye(nav);
  dinle('ekran', () => requestAnimationFrame(gostergeyiTasi));
  dinle('planAcildi', acikPlanOgesi);
  window.addEventListener('resize', gostergeyiTasi);
  window.addEventListener('hashchange', () => {
    const ad = hashtenEkran();
    if (ad === 'plan' && !durum.plan) planiAc(yeniPlanNesnesi());
    if (ad) git(ad, { gecmis: false });
  });

  kisayollar(ekranlar.plan);
  birakmaKur();

  // Kabuk bildirimleri
  kabukDinle('kapatmaIstegi', () => kapatmaIstegi());
  kabukDinle('planAcildi', (m) => m.veri && acilanPlaniYukle(m.veri));
  kabukDinle('guncellemeVar', (m) => guncellemeSor(m));
  // Yalnız kabuğun Debug derlemesindeki --pdf-dene bayrağıyla gelir: örnek yükü planla, PDF bas, kapan
  kabukDinle('pdfDene', async (m) => {
    await ornekAc();
    await ekranlar.plan.planla();
    await ekranlar.plan.pdf({ yol: m.yol, sor: false });
    istek('pencere', { islem: 'kapat', zorla: true });
  });
  // Yalnız Debug derlemesinde --duzenle-dene ile gelir: elle düzenleme senaryosu (dosyası yalnız Debug çıktısında)
  kabukDinle('duzenleDene', async (m) => {
    try {
      const { duzenleDene } = await import('./gelistirme-duzenle.js');
      await duzenleDene({ klasor: m.klasor, ekranlar });
    } catch (e) {
      console.error('Düzenleme denemesi', e);
    }
    istek('pencere', { islem: 'kapat', zorla: true });
  });

  await kutuphaneYukle();

  if (durum.gelistirme) await gelistirmeTohumu();

  // İlk ekran: dil değişikliğinden sonra kalınan yer; yoksa adres; açık plan yoksa taslak sorulur
  const donus = yenidenYuklemedenDon();
  const ilk = donus?.ekran || hashtenEkran();
  if (ilk === 'plan') {
    if (!durum.plan && durum.gelistirme) await ornekAc({ planla: true });
    else {
      if (!durum.plan) planiAc(yeniPlanNesnesi());
      git('plan');
    }
  } else git(ilk || 'planlar');
  taslakBaslat();

  // Geliştirme sayfası (gelistirme.html) bunu bekler
  document.documentElement.dataset.hazir = '1';
  document.dispatchEvent(new CustomEvent('istif:hazir'));

  // Kabuk açılış ekranını kapatabilir. Pencere o sırada ekran dışında beklediği için
  // çizim karesi (requestAnimationFrame) gelmeyebilir; zamanlayıcı kullanılır.
  setTimeout(() => {
    bildir('hazir');
    if (!kabukVar || donus) document.body.classList.remove('bekliyor');
  }, 0);
  const gorunur = () => document.body.classList.remove('bekliyor');
  kabukDinle('goruldu', gorunur);
  setTimeout(gorunur, 2500);

  if (katalogBilgisi().hata) {
    hataKutusu({ baslik: t('katalog.baslik'), metin: t('katalog.acilamadi'), ayrinti: String(katalogBilgisi().hata) });
  }
  // Çökmeden kalan taslak: pencere göründükten sonra sorulur
  if (!donus) setTimeout(() => taslakSor().then((geri) => geri && git('plan')), kabukVar ? 900 : 300);
}

basla().catch((e) => {
  console.error(e);
  document.body.classList.remove('bekliyor');
  hataKutusu({ baslik: URUN.ad, metin: t('genel.bilinmeyenHata'), ayrinti: String(e && e.stack ? e.stack : e) });
});
