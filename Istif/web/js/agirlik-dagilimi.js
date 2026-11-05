// Uzunluk boyunca ağırlık dağılımı: her parçanın ağırlığı kapladığı uzunluğa eşit yayılır ve dilimlerde toplanır
// (yükseklik ve en önemsenmez). Çubuklar metre başına yükü gösterir. Ağırlık merkezi, aracın ortası, kapı payı,
// şasi kilidi ve aks grubu konumları ile motorun tahmini aks payları işaretlenir.
import { t } from './dil.js';
import { kac, kg, metre, sayi, kgdanAgirlik, agirlikBirimi, uzunBirim, imperialMi } from './bicim.js';
import { simge } from './simgeler.js';

const DILIM_SAYISI = 56;

/** Dilimlerdeki yük (kg) ve dilim boyu (mm) */
export function dagilimHesapla(yerlesimler, L) {
  const n = DILIM_SAYISI;
  const boy = L / n;
  const dilim = new Array(n).fill(0);
  for (const y of yerlesimler) {
    if (!(y.uzunluk > 0)) continue;
    const yogunluk = (y.agirlik || 0) / y.uzunluk; // kg/mm
    const bas = Math.max(0, y.z);
    const son = Math.min(L, y.z + y.uzunluk);
    for (let i = Math.floor(bas / boy); i < n && i * boy < son; i += 1) {
      const ortak = Math.min(son, (i + 1) * boy) - Math.max(bas, i * boy);
      if (ortak > 0) dilim[i] += ortak * yogunluk;
    }
  }
  return { dilim, boy };
}

const yuzdeKonum = (z, L) => Math.max(0, Math.min(100, (z / L) * 100));

/**
 * Şeridi çizer. a: motorun araç çıktısı, arac: ölçüleri tamamlanmış araç ({ uzunluk, kapiPayiMm, aks }).
 * Sonuç yoksa şerit gizlenir.
 */
export function agirlikDagilimiCiz(kap, a, arac) {
  if (!a || !arac || !(arac.uzunluk > 0) || !a.yerlesimler.length) {
    kap.hidden = true;
    kap.innerHTML = '';
    return;
  }
  kap.hidden = false;
  const L = arac.uzunluk;
  const { dilim, boy } = dagilimHesapla(a.yerlesimler, L);
  const metreBasina = dilim.map((kgDilim) => kgDilim / (boy / 1000));
  const enCok = Math.max(1, ...metreBasina);
  const genislik = 1000 / dilim.length;

  const cubuklar = metreBasina.map((v, i) => {
    if (v <= 0) return '';
    const y = 40 - (v / enCok) * 36;
    const bas = (i * boy) / 1000;
    return `<rect class="agirlik-cubuk" x="${(i * genislik + 0.6).toFixed(1)}" y="${y.toFixed(2)}" width="${(genislik - 1.2).toFixed(1)}" height="${(40 - y).toFixed(2)}"><title>${kac(t('plan.agirlik.dilim', { bas: metre(bas * 1000), son: metre((bas * 1000) + boy), yuk: kg(dilim[i]) }))}</title></rect>`;
  }).join('');

  const pay = arac.kapiPayiMm > 0 ? `<rect class="agirlik-pay" x="${((1 - arac.kapiPayiMm / L) * 1000).toFixed(1)}" y="0" width="${((arac.kapiPayiMm / L) * 1000).toFixed(1)}" height="40"/>` : '';

  const isaretler = [];
  isaretler.push(`<span class="agirlik-orta" style="left:${yuzdeKonum(L / 2, L)}%" title="${kac(t('plan.agirlik.orta'))}"></span>`);
  const m = a.agirlikMerkezi;
  if (m && Number.isFinite(m.z)) {
    isaretler.push(`<span class="agirlik-isaret agirlik-isaret--merkez" style="left:${yuzdeKonum(m.z, L)}%"><i></i><b>${kac(t('plan.agirlik.merkez', { m: metre(m.z) }))}</b></span>`);
  }
  const aks = a.aks || arac.aks;
  if (aks && aks.sasiMesafe != null && aks.aksMerkezi != null) {
    const ay = a.aksYukleri;
    isaretler.push(`<span class="agirlik-isaret agirlik-isaret--aks" style="left:${yuzdeKonum(aks.sasiMesafe, L)}%"><i></i><b>${kac(ay ? t('plan.agirlik.sasiPay', { kg: kg(ay.sasi) }) : t('plan.agirlik.sasi'))}</b></span>`);
    isaretler.push(`<span class="agirlik-isaret agirlik-isaret--aks" style="left:${yuzdeKonum(aks.aksMerkezi, L)}%"><i></i><b>${kac(ay ? t('plan.agirlik.aksPay', { kg: kg(ay.aks) }) : t('plan.agirlik.aks'))}</b></span>`);
  }

  const enCokGosterim = imperialMi()
    ? `${sayi(kgdanAgirlik(enCok) * 0.3048)} ${agirlikBirimi()}/${uzunBirim()}`
    : `${sayi(enCok)} ${agirlikBirimi()}/${uzunBirim()}`;

  kap.innerHTML = `
    <div class="agirlik-baslik">
      <span class="agirlik-ad">${simge('agirlik', 14)}${kac(t('plan.agirlik.baslik'))}</span>
      <small class="soluk">${kac(t('plan.agirlik.enCok', { v: enCokGosterim }))}</small>
      ${a.aksYukleri ? '' : `<small class="soluk agirlik-not">${kac(aks ? '' : t('plan.agirlik.aksYok'))}</small>`}
    </div>
    <div class="agirlik-cizim" role="img" aria-label="${kac(t('plan.agirlik.baslik'))}">
      <svg viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
        <line class="agirlik-taban" x1="0" y1="40" x2="1000" y2="40"/>
        ${pay}${cubuklar}
      </svg>
      ${isaretler.join('')}
    </div>
    <div class="agirlik-eksen"><span>${kac(t('plan.agirlik.on'))}</span><span>${kac(metre(L))}</span><span>${kac(t('plan.gorunum.kapi'))}</span></div>`;
}
