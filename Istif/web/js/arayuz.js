// Ortak arayüz parçaları: öğe üretme, pencereler (diyalog), bildirimler, sayaç animasyonu.
import { t } from './dil.js';
import { simge } from './simgeler.js';
import { kac } from './bicim.js';
import { azHareket } from './hareket.js';

export const $ = (secici, kok = document) => kok.querySelector(secici);
export const $$ = (secici, kok = document) => Array.from(kok.querySelectorAll(secici));

/** HTML metninden tek öğe üretir. */
export function ogeUret(html) {
  const sablon = document.createElement('template');
  sablon.innerHTML = html.trim();
  return sablon.content.firstElementChild;
}

/** Animasyonlar kapalıysa true (Ayarlar > Animasyonlar; "Sistem" seçiliyse Windows'un ayarı). Ayar hareket.js'te. */
export { azHareket };

// ---------------------------------------------------------------------------
// Diyalog
// ---------------------------------------------------------------------------

let acikDiyaloglar = 0;

/**
 * Ortada açılan pencere. dugmeler: [{ metin, tur: 'birincil'|'ikincil'|'tehlike', deger, kapatmaz }]
 * Döner: { kok, govde, kapat(deger), sonuc: Promise }
 * once(deger) verilirse düğmeye basınca çağrılır; false dönerse pencere açık kalır.
 */
export function diyalog({ baslik, icerik = '', dugmeler = [], genislik = 520, simgeAdi = null, sinif = '', once = null }) {
  const perde = ogeUret(`
    <div class="perde" role="presentation">
      <div class="diyalog ${sinif}" role="dialog" aria-modal="true" aria-labelledby="diyalog-baslik-${acikDiyaloglar}" style="width:min(${genislik}px, calc(100vw - 48px))">
        <header class="diyalog-ust">
          ${simgeAdi ? `<span class="diyalog-simge diyalog-simge--${simgeAdi}">${simge(simgeAdi, 20)}</span>` : ''}
          <h2 id="diyalog-baslik-${acikDiyaloglar}">${kac(baslik)}</h2>
          <button type="button" class="simge-dugme diyalog-kapat" aria-label="${kac(t('genel.kapat'))}">${simge('kapat', 18)}</button>
        </header>
        <div class="diyalog-govde"></div>
        ${dugmeler.length ? '<footer class="diyalog-alt"></footer>' : ''}
      </div>
    </div>`);
  const kutu = $('.diyalog', perde);
  const govde = $('.diyalog-govde', perde);
  if (typeof icerik === 'string') govde.innerHTML = icerik;
  else if (icerik) govde.appendChild(icerik);

  let coz;
  const sonuc = new Promise((r) => (coz = r));
  const oncekiOdak = document.activeElement;
  let kapandi = false;

  function kapat(deger) {
    if (kapandi) return;
    kapandi = true;
    acikDiyaloglar -= 1;
    document.removeEventListener('keydown', tus, true);
    perde.classList.add('kapaniyor');
    const bitir = () => {
      perde.remove();
      if (oncekiOdak && oncekiOdak.focus) oncekiOdak.focus();
    };
    if (azHareket()) bitir();
    else setTimeout(bitir, 160);
    coz(deger);
  }

  const alt = $('.diyalog-alt', perde);
  dugmeler.forEach((d) => {
    const b = ogeUret(`<button type="button" class="dugme dugme--${d.tur || 'ikincil'}">${kac(d.metin)}</button>`);
    b.addEventListener('click', async () => {
      if (once) {
        const izin = await once(d.deger, b);
        if (izin === false) return;
      }
      if (!d.kapatmaz) kapat(d.deger);
    });
    alt.appendChild(b);
  });

  function tus(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      kapat(null);
    } else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
      const birincil = $('.dugme--birincil, .dugme--tehlike', alt || perde);
      if (birincil) {
        e.preventDefault();
        birincil.click();
      }
    } else if (e.key === 'Tab') {
      // Odak pencere içinde kalsın
      const odaklar = $$('button, input, select, textarea, [tabindex]:not([tabindex="-1"])', kutu).filter((o) => !o.disabled && o.offsetParent);
      if (!odaklar.length) return;
      const ilk = odaklar[0];
      const son = odaklar[odaklar.length - 1];
      if (e.shiftKey && document.activeElement === ilk) { e.preventDefault(); son.focus(); }
      else if (!e.shiftKey && document.activeElement === son) { e.preventDefault(); ilk.focus(); }
    }
  }

  $('.diyalog-kapat', perde).addEventListener('click', () => kapat(null));
  perde.addEventListener('mousedown', (e) => { if (e.target === perde) kapat(null); });
  document.addEventListener('keydown', tus, true);
  document.body.appendChild(perde);
  acikDiyaloglar += 1;

  requestAnimationFrame(() => {
    const ilkGirdi = $('input:not([type=hidden]):not([disabled]), select, textarea', govde);
    (ilkGirdi || $('.dugme--birincil', perde) || $('.diyalog-kapat', perde)).focus();
  });

  return { kok: perde, govde, kapat, sonuc };
}

export const diyalogAcikMi = () => acikDiyaloglar > 0;

/** Evet/hayır sorusu. */
export async function onayIste({ baslik, metin, tamam = t('genel.tamam'), iptal = t('genel.vazgec'), tehlike = false, simgeAdi = 'uyari' }) {
  const d = diyalog({
    baslik,
    icerik: `<p class="diyalog-metin">${kac(metin)}</p>`,
    simgeAdi,
    genislik: 440,
    dugmeler: [
      { metin: iptal, tur: 'ikincil', deger: false },
      { metin: tamam, tur: tehlike ? 'tehlike' : 'birincil', deger: true },
    ],
  });
  return (await d.sonuc) === true;
}

/** Hata kutusu: sade ileti, isteğe bağlı açılır teknik ayrıntı. */
export function hataKutusu({ baslik, metin, ayrinti }) {
  const icerik = `
    <p class="diyalog-metin">${kac(metin)}</p>
    ${ayrinti ? `<details class="ayrinti"><summary>${kac(t('plan.hata.ayrinti'))}</summary><pre>${kac(ayrinti)}</pre></details>` : ''}`;
  return diyalog({
    baslik,
    icerik,
    simgeAdi: 'hata',
    sinif: 'diyalog--hata',
    genislik: 480,
    dugmeler: [{ metin: t('genel.tamam'), tur: 'birincil', deger: true }],
  }).sonuc;
}

// ---------------------------------------------------------------------------
// Bildirim (sağ alttan kayan kısa ileti)
// ---------------------------------------------------------------------------

export function bildirim(metin, { tur = 'bilgi', eylem = null, sure = 3800 } = {}) {
  let kap = $('#bildirimler');
  if (!kap) {
    kap = ogeUret('<div id="bildirimler" aria-live="polite"></div>');
    document.body.appendChild(kap);
  }
  const simgeAdi = { basari: 'onayDaire', hata: 'hata', uyari: 'uyari', bilgi: 'bilgi' }[tur] || 'bilgi';
  const b = ogeUret(`
    <div class="bildirim bildirim--${tur}" role="status">
      ${simge(simgeAdi, 18)}
      <span class="bildirim-metin">${kac(metin)}</span>
      ${eylem ? `<button type="button" class="bildirim-eylem">${kac(eylem.metin)}</button>` : ''}
    </div>`);
  let zaman;
  const kaldir = () => {
    clearTimeout(zaman);
    b.classList.add('gidiyor');
    setTimeout(() => b.remove(), azHareket() ? 0 : 220);
  };
  if (eylem) {
    $('.bildirim-eylem', b).addEventListener('click', () => {
      eylem.fn();
      kaldir();
    });
  }
  b.addEventListener('mouseenter', () => clearTimeout(zaman));
  b.addEventListener('mouseleave', () => (zaman = setTimeout(kaldir, 1600)));
  kap.appendChild(b);
  zaman = setTimeout(kaldir, sure);
  return kaldir;
}

// ---------------------------------------------------------------------------
// Sayaç: sayılar sayarak yükselir
// ---------------------------------------------------------------------------

const sayaclar = new WeakMap();

export function sayacOynat(oge, hedef, bicimle, sure = 900) {
  if (!oge) return;
  const onceki = sayaclar.get(oge);
  if (onceki) cancelAnimationFrame(onceki.istek);
  if (!Number.isFinite(hedef)) {
    oge.textContent = bicimle(hedef);
    return;
  }
  if (azHareket()) {
    oge.textContent = bicimle(hedef);
    return;
  }
  const bas = performance.now();
  const kayit = { istek: 0 };
  sayaclar.set(oge, kayit);
  const adim = (an) => {
    const k = Math.min(1, (an - bas) / sure);
    const e = 1 - Math.pow(1 - k, 3);
    oge.textContent = bicimle(hedef * e);
    if (k < 1) kayit.istek = requestAnimationFrame(adim);
  };
  kayit.istek = requestAnimationFrame(adim);
}

/** Bir kapsayıcının çocuklarına sırayla giriş animasyonu verir. */
export function siraliGiris(kap, secici = ':scope > *', aralik = 35) {
  if (azHareket()) return;
  $$(secici, kap).forEach((o, i) => {
    o.style.setProperty('--gecikme', `${Math.min(i, 12) * aralik}ms`);
    o.classList.remove('giris');
    void o.offsetWidth;
    o.classList.add('giris');
    // Animasyon bitince sınıf kalkar; öğe ayrı katmanda kalmasın
    o.addEventListener('animationend', () => o.classList.remove('giris'), { once: true });
  });
}
