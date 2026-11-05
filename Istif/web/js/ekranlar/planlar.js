// Planlar (açılış) ekranı: karşılama, yeni plan, örnek yük galerisi, açık plan ve son planlar.
import { t } from '../dil.js';
import { kac, kg, sayi, yuzde, goreceTarih } from '../bicim.js';
import { simge, aracCizimi } from '../simgeler.js';
import { $, ogeUret, siraliGiris, hataKutusu } from '../arayuz.js';
import { istek, kabukVar } from '../kopru.js';
import { durum, dinle, planToplamlari } from '../durum.js';
import { ornekPlanVerisi, ORNEKLER } from '../veri.js';
import { yeniPlan, ornekAc, planAc } from '../eylemler.js';
import { git } from '../yonlendirici.js';
import { boyalariUygula } from '../bilesenler.js';

/** Örnek yük kartı: araç, kalem ve parça sayısı, toplam ağırlık */
function ornekKarti(ad) {
  const o = ornekPlanVerisi(ad);
  const top = o.kalemler.reduce((a, k) => ({ parca: a.parca + k.adet, agirlik: a.agirlik + k.agirlik * k.adet }), { parca: 0, agirlik: 0 });
  return `
    <button type="button" class="ornek-kart" data-eylem="ornek" data-ornek="${ad}">
      <span class="ornek-kart-simge">${aracCizimi(o.arac.tur, 40)}</span>
      <span class="ornek-kart-metin">
        <b>${kac(o.ad)}</b>
        <small>${kac([o.arac.ad, kg(top.agirlik)].join(' · '))}</small>
        <small>${kac([t('plan.yuk.kalemSayisi', { n: o.kalemler.length }), t('plan.yuk.parcaSayisi', { n: top.parca })].join(' · '))}</small>
      </span>
      ${simge('sag', 18, 'ornek-kart-ok')}
    </button>`;
}

export function planlarEkraniKur() {

  const kok = ogeUret(`
    <section class="ekran ekran-planlar">
      <div class="ekran-ic">
        <div class="karsilama">
          <div class="karsilama-metin">
            <p class="ust-baslik">${kac(t('planlar.ust'))}</p>
            <h1>${kac(t('planlar.baslik'))}</h1>
            <p class="karsilama-aciklama">${kac(t('planlar.aciklama'))}</p>
            <div class="karsilama-eylemler">
              <button type="button" class="dugme dugme--birincil dugme--buyuk" data-eylem="yeni">${simge('yeni', 20)}${kac(t('planlar.yeniPlan'))}</button>
              <button type="button" class="dugme dugme--ikincil dugme--buyuk" data-eylem="ac">${simge('ac', 20)}${kac(t('planlar.planAc'))}</button>
            </div>
          </div>
          <div class="karsilama-gorsel" aria-hidden="true">${izometrikCizim()}</div>
        </div>

        <div class="bolum-baslik"><h2>${kac(t('planlar.ornekler'))}</h2><span class="bolum-not">${simge('bilgi', 14)}${kac(t('planlar.orneklerNot'))}</span></div>
        <div class="ornek-galeri"></div>

        <div class="acik-plan" hidden></div>

        <div class="bolum-baslik">
          <h2>${kac(t('planlar.sonPlanlar'))}</h2>
          <span class="sayac-rozet son-sayi" hidden></span>
          ${kabukVar ? '' : `<span class="bolum-not">${simge('bilgi', 14)}${kac(t('planlar.tarayiciNotu'))}</span>`}
        </div>
        <div class="plan-kartlari"></div>
      </div>
    </section>`);

  kok.addEventListener('click', (e) => {
    const eylem = e.target.closest('[data-eylem]')?.dataset.eylem;
    if (eylem === 'yeni') yeniPlan();
    else if (eylem === 'ac') planAc();
    else if (eylem === 'ornek') ornekAc({ ad: e.target.closest('[data-ornek]').dataset.ornek });
    else if (eylem === 'plana-don') git('plan');
  });

  const kartlar = $('.plan-kartlari', kok);

  async function sonPlanlariCiz() {
    let liste = [];
    try {
      liste = (await istek('sonPlanlar')) || [];
    } catch (e) {
      console.warn('Son planlar okunamadı', e);
    }
    $('.son-sayi', kok).hidden = !liste.length;
    $('.son-sayi', kok).textContent = sayi(liste.length);
    if (!liste.length) {
      kartlar.innerHTML = `
        <div class="bos-durum">
          <span class="bos-durum-simge">${simge('planlar', 26)}</span>
          <div class="bos-durum-metin">
            <b>${kac(t('planlar.bosBaslik'))}</b>
            <small>${kac(t('planlar.bosMetin'))}</small>
          </div>
          <ol class="adimlar">
            ${['bir', 'iki', 'uc'].map((a, i) => `
              <li><span class="adim-no">${i + 1}</span><span><b>${kac(t('planlar.adimlar.' + a))}</b><small>${kac(t('planlar.adimlar.' + a + 'Alt'))}</small></span></li>`).join('')}
          </ol>
        </div>`;
      return;
    }
    kartlar.innerHTML = liste.map((k) => {
      const o = k.ozet || {};
      const dosyaAdi = String(k.yol).startsWith('yerel:') ? '' : String(k.yol).split(/[\\/]/).pop();
      const doluluk = Number.isFinite(o.doluluk) ? o.doluluk : null;
      return `
        <div class="plan-kart" role="button" tabindex="0" data-yol="${kac(k.yol)}" title="${kac(dosyaAdi ? k.yol : k.ad)}">
          <div class="plan-kart-ust">
            <span class="plan-kart-cizim">${aracCizimi(o.aracTur || 'tir', 52)}</span>
            <span class="plan-kart-tarih">${kac(goreceTarih(k.tarih))}</span>
          </div>
          <h3>${kac(k.ad)}</h3>
          <p class="plan-kart-arac">${kac(o.aracAd || '')}</p>
          <div class="plan-kart-sayilar">
            ${o.aracSayisi ? `<span>${kac(t('planlar.aracSayisi', { n: o.aracSayisi }))}</span>` : ''}
            ${o.parca ? `<span>${kac(t('plan.yuk.parcaSayisi', { n: o.parca }))}</span>` : ''}
            ${o.agirlik ? `<span>${kac(kg(o.agirlik))}</span>` : ''}
          </div>
          ${doluluk != null ? `
          <div class="plan-kart-doluluk">
            <span class="doluluk-cubuk"><i data-oran="${Math.min(100, doluluk)}"></i></span>
            <span class="doluluk-deger">${kac(yuzde(doluluk))}</span>
          </div>` : ''}
          ${dosyaAdi ? `<span class="plan-kart-dosya">${simge('dosya', 13)}${kac(dosyaAdi)}</span>` : ''}
          ${kabukVar && dosyaAdi ? `<button type="button" class="simge-dugme plan-kart-klasor" data-klasor title="${kac(t('planlar.klasordeGoster'))}" aria-label="${kac(t('planlar.klasordeGoster'))}">${simge('klasor', 16)}</button>` : ''}
        </div>`;
    }).join('');
    kartlar.querySelectorAll('[data-oran]').forEach((i) => (i.style.width = `${i.dataset.oran}%`));
    siraliGiris(kartlar, ':scope > .plan-kart', 40);
  }

  kartlar.addEventListener('click', (e) => {
    const kart = e.target.closest('.plan-kart');
    if (!kart) return;
    if (e.target.closest('[data-klasor]')) {
      istek('dosyaGoster', { yol: kart.dataset.yol }).catch((h) => hataKutusu({ baslik: t('planlar.klasordeGoster'), metin: h.message }));
      return;
    }
    planAc(kart.dataset.yol).then(() => sonPlanlariCiz());
  });
  kartlar.addEventListener('keydown', (e) => {
    const kart = e.target.closest('.plan-kart');
    if (kart && e.target === kart && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      planAc(kart.dataset.yol);
    }
  });

  function acikPlanCiz() {
    const kap = $('.acik-plan', kok);
    const p = durum.plan;
    if (!p || (!p.kalemler.length && !p.yol)) {
      kap.hidden = true;
      return;
    }
    const top = planToplamlari(p);
    kap.hidden = false;
    kap.innerHTML = `
      <span class="acik-plan-cizim">${aracCizimi(p.arac.tur, 56)}</span>
      <div class="acik-plan-metin">
        <small>${kac(t('planlar.acikPlan'))}${p.kaydedilmemis ? ` · <span class="uyari-yazi">${kac(t('plan.kaydedilmedi'))}</span>` : ''}</small>
        <b>${kac(p.ad)}</b>
        <span class="soluk">${kac([p.arac.ad, t('plan.yuk.kalemSayisi', { n: top.kalem }), t('plan.yuk.parcaSayisi', { n: top.parca }), kg(top.agirlik)].join(' · '))}</span>
      </div>
      <button type="button" class="dugme dugme--ikincil" data-eylem="plana-don">${kac(t('planlar.planaDon'))}${simge('sag', 16)}</button>`;
  }

  dinle('planKaydedildi', () => sonPlanlariCiz());
  dinle('planAcildi', () => acikPlanCiz());

  return {
    kok,
    goster() {
      // Örnek adları ve araçları dile ve kataloğa bağlı; ekran her gösterilişte yeniden yazılır
      $('.ornek-galeri', kok).innerHTML = ORNEKLER.map(ornekKarti).join('');
      acikPlanCiz();
      sonPlanlariCiz();
      siraliGiris(kok, '.karsilama-metin > *, .karsilama-gorsel, .ornek-galeri > *', 45);
      boyalariUygula(kok);
    },
  };
}

/** Açılış görseli: izometrik dorse içinde sırayla yerine inen kutular (CSS ile canlanır). */
function izometrikCizim() {
  const s = 26;
  const c = Math.cos(Math.PI / 6);
  const P = (x, y, z) => [(x - z) * c * s, (x + z) * 0.5 * s - y * s];
  const nokta = (pts) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const W = 2.5, H = 2.6, L = 8.4;

  const kutular = [
    [0.12, 0, 0.15, 1.45, 1.3, 2.3, '#3ABFF0'],
    [1.62, 0, 0.15, 0.78, 1.05, 1.5, '#C9CED6'],
    [0.12, 1.3, 0.15, 1.45, 0.85, 1.9, '#9D8CF2'],
    [1.62, 1.05, 0.15, 0.78, 0.8, 1.5, '#F2B441'],
    [0.12, 0, 2.6, 2.28, 1.0, 2.1, '#35C48A'],
    [0.5, 1.0, 2.75, 1.4, 0.95, 1.6, '#3ABFF0'],
    [0.12, 0, 4.9, 1.55, 1.35, 1.9, '#C9CED6'],
  ];

  const ton = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  };

  const kutuSvg = ([x0, y0, z0, w, h, l, renk], i) => {
    const x1 = x0 + w, y1 = y0 + h, z1 = z0 + l;
    const ust = nokta([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)]);
    const sag = nokta([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)]);
    const on = nokta([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]);
    return `
      <g class="izo-kutu" style="--i:${i}">
        <polygon points="${sag}" fill="${ton(renk, -0.32)}"/>
        <polygon points="${on}" fill="${ton(renk, -0.1)}"/>
        <polygon points="${ust}" fill="${ton(renk, 0.28)}"/>
        <polyline points="${nokta([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)])}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/>
      </g>`;
  };

  const cizgi = (a, b, sinif = '') => `<line class="${sinif}" x1="${P(...a)[0].toFixed(1)}" y1="${P(...a)[1].toFixed(1)}" x2="${P(...b)[0].toFixed(1)}" y2="${P(...b)[1].toFixed(1)}"/>`;
  const arka = [
    cizgi([0, 0, 0], [W, 0, 0]), cizgi([0, 0, 0], [0, 0, L]), cizgi([0, 0, 0], [0, H, 0]),
    cizgi([0, H, 0], [W, H, 0]), cizgi([0, H, 0], [0, H, L]), cizgi([W, 0, 0], [W, H, 0]),
  ].join('');
  const on = [
    cizgi([W, 0, 0], [W, 0, L]), cizgi([0, 0, L], [W, 0, L]), cizgi([W, 0, L], [W, H, L]),
    cizgi([0, H, L], [W, H, L]), cizgi([W, H, 0], [W, H, L]), cizgi([0, 0, L], [0, H, L]),
  ].join('');
  const taban = nokta([P(0, 0, 0), P(W, 0, 0), P(W, 0, L), P(0, 0, L)]);

  // Cetvel çizgileri (metre)
  const cetvel = [];
  for (let m = 0; m <= 8; m += 1) cetvel.push(cizgi([W + 0.25, 0, m], [W + 0.5, 0, m], 'izo-cetvel'));

  const sirali = kutular
    .map((k, i) => ({ k, i }))
    .sort((a, b) => a.k[0] + a.k[2] + a.k[1] * 0.5 - (b.k[0] + b.k[2] + b.k[1] * 0.5));

  const [minX, minY] = [P(0, 0, L)[0] - 30, P(0, H, 0)[1] - 50];
  const [maxX, maxY] = [P(W + 0.6, 0, 0)[0] + 30, P(W + 0.6, 0, L)[1] + 30];
  return `
    <svg class="izo" viewBox="${minX.toFixed(0)} ${minY.toFixed(0)} ${(maxX - minX).toFixed(0)} ${(maxY - minY).toFixed(0)}" role="img">
      <defs>
        <radialGradient id="izo-isik" cx="50%" cy="60%" r="60%">
          <stop offset="0" stop-color="#3ABFF0" stop-opacity=".16"/>
          <stop offset="1" stop-color="#3ABFF0" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${((minX + maxX) / 2).toFixed(0)}" cy="${(P(W, 0, L / 2)[1] + 10).toFixed(0)}" rx="${((maxX - minX) / 2).toFixed(0)}" ry="${((maxY - minY) / 3).toFixed(0)}" fill="url(#izo-isik)"/>
      <polygon class="izo-taban" points="${taban}"/>
      <g class="izo-cerceve izo-cerceve--arka">${arka}</g>
      ${sirali.map(({ k, i }) => kutuSvg(k, i)).join('')}
      <g class="izo-cerceve">${on}</g>
      <g class="izo-cetvel-grup">${cetvel.join('')}</g>
      <text class="izo-yazi" x="${P(W / 2, H + 0.35, L)[0].toFixed(0)}" y="${P(W / 2, H + 0.35, L)[1].toFixed(0)}">${kac(t('plan.gorunum.kapi'))}</text>
    </svg>`;
}
