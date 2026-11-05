// Hakkında: ad, sürüm, geliştiren, bağlantılar, lisans, açık kaynaklar, sürüm notları, kısayollar, uyarı.
import { t } from '../dil.js';
import { URUN } from '../urun.js';
import { kac } from '../bicim.js';
import { simge } from '../simgeler.js';
import { ogeUret, hataKutusu, siraliGiris } from '../arayuz.js';
import { istek } from '../kopru.js';
import { git } from '../yonlendirici.js';
import { surumNotlariAc } from '../surum-notlari.js';

/** Kullanılan açık kaynaklar: ad, lisans, ne için (dil anahtarı) */
const BILESENLER = [
  ['three.js', 'MIT', 'hakkinda.bilesen.threejs'],
  ['SheetJS', 'Apache-2.0', 'hakkinda.bilesen.sheetjs'],
  ['Microsoft WebView2 SDK', 'BSD-3-Clause', 'hakkinda.bilesen.webview2'],
];

/** Kısayollar: tuşlar (dil anahtarı ya da sabit) ve açıklama */
const KISAYOLLAR = [
  [['tus.ctrl', 'N'], 'kisayol.yeniPlan'],
  [['tus.ctrl', 'O'], 'kisayol.planAc'],
  [['tus.ctrl', 'S'], 'kisayol.kaydet'],
  [['tus.ctrl', 'tus.enter'], 'kisayol.planla'],
  [['tus.ctrl', 'Z'], 'kisayol.geriAl'],
  [['tus.ctrl', 'Y'], 'kisayol.yinele'],
  [['tus.bosluk'], 'kisayol.oynat'],
  [['+', '−'], 'kisayol.yakinlastir'],
];

const tus = (k) => (k.startsWith('tus.') ? t(k) : k);

export function hakkindaEkraniKur() {
  const kok = ogeUret(`
    <section class="ekran ekran-hakkinda">
      <div class="ekran-ic hakkinda-ic">
        <div class="hakkinda-kimlik">
          <img class="hakkinda-simge" src="img/simge-256.png" alt="" width="112" height="112">
          <div>
            <h1>${kac(URUN.ad)}</h1>
            <p class="hakkinda-alt">${kac(t('hakkinda.altBaslik'))}</p>
            <p class="hakkinda-surum"><span class="rozet">${kac(t('hakkinda.surum', { s: URUN.surum }))}</span><span class="rozet rozet--yesil">${kac(t('hakkinda.lisans'))}</span></p>
          </div>
        </div>

        <div class="hakkinda-izgara">
          <section class="kart">
            <h2 class="kart-alt-baslik">${kac(t('hakkinda.gelistiren'))}</h2>
            <p class="gelistiren">${kac(URUN.gelistiren)}</p>
            <div class="baglantilar">
              <button type="button" class="baglanti" data-url="${kac(URUN.baglantilar.github)}">
                ${simge('kod', 18)}<span><b>${kac(t('hakkinda.github'))}</b><small>${kac(URUN.baglantilar.github.replace('https://', ''))}</small></span>${simge('disBaglanti', 15)}
              </button>
              <button type="button" class="baglanti" data-url="${kac(URUN.baglantilar.linkedin)}">
                ${simge('kisi', 18)}<span><b>${kac(t('hakkinda.linkedin'))}</b><small>${kac(URUN.baglantilar.linkedin.replace('https://www.', ''))}</small></span>${simge('disBaglanti', 15)}
              </button>
            </div>
            <p class="lisans-satiri">${simge('dosya', 14)}<span><b>${kac(t('hakkinda.lisans'))}</b> · ${kac(t('hakkinda.lisansAciklama'))}</span></p>
          </section>

          <section class="kart">
            <h2 class="kart-alt-baslik">${kac(t('hakkinda.acikKaynak'))}</h2>
            <ul class="bilesen-listesi">
              ${BILESENLER.map(([ad, lisans, ne]) => `
                <li><span><b>${kac(ad)}</b><small>${kac(t(ne))}</small></span><span class="rozet">${kac(lisans)}</span></li>`).join('')}
            </ul>
          </section>

          <section class="kart">
            <h2 class="kart-alt-baslik">${kac(t('hakkinda.surumNotlari'))}</h2>
            <p class="soluk hakkinda-not">${kac(t('hakkinda.surumNotlariAciklama'))}</p>
            <div class="hakkinda-eylemler">
              <button type="button" class="dugme dugme--ikincil" data-eylem="notlar">${simge('notlar', 17)}${kac(t('hakkinda.notlariAc'))}</button>
              <button type="button" class="dugme dugme--hayalet" data-eylem="ayarlar">${simge('ayarlar', 17)}${kac(t('hakkinda.guncellemeAyarlari'))}</button>
            </div>
          </section>

          <section class="kart">
            <h2 class="kart-alt-baslik">${kac(t('hakkinda.kisayollar'))}</h2>
            <dl class="kisayollar">
              ${KISAYOLLAR.map(([tuslar, ne]) => `<div><dt>${tuslar.map((k) => `<kbd>${kac(tus(k))}</kbd>`).join(' + ')}</dt><dd>${kac(t(ne))}</dd></div>`).join('')}
            </dl>
          </section>
        </div>

        <div class="durum-kutu durum-kutu--uyari hakkinda-uyari">
          ${simge('uyari', 18)}<p>${kac(t('hakkinda.uyari'))}</p>
        </div>
        <p class="telif">Copyright (c) 2026 ${kac(URUN.gelistiren)} · ${kac(URUN.ad)} ${kac(URUN.surum)}</p>
      </div>
    </section>`);

  kok.addEventListener('click', (e) => {
    const url = e.target.closest('[data-url]')?.dataset.url;
    if (url) {
      istek('baglantiAc', { url }).catch((h) => hataKutusu({ baslik: URUN.ad, metin: h.message }));
      return;
    }
    const eylem = e.target.closest('[data-eylem]')?.dataset.eylem;
    if (eylem === 'notlar') surumNotlariAc();
    else if (eylem === 'ayarlar') git('ayarlar');
  });

  return {
    kok,
    goster() {
      siraliGiris(kok, '.hakkinda-kimlik, .hakkinda-izgara > .kart, .hakkinda-uyari', 45);
    },
  };
}

