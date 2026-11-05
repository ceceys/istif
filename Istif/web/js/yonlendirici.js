// Ekranlar arası geçiş: #/planlar, #/plan, #/urunler, #/araclar, #/hakkinda
// Çıkan ekran solar, gelen ekran hafifçe kayarak belirir (200–300 ms).
import { azHareket } from './arayuz.js';
import { yay } from './durum.js';

const ekranlar = new Map();
let aktif = null;
let gecis = 0;

/** ekran: { kok, goster?(), gizle?() } */
export function ekranKaydet(ad, ekran) {
  ekran.kok.hidden = true;
  ekranlar.set(ad, ekran);
}

export const aktifEkran = () => aktif;

export function git(ad, { gecmis = true } = {}) {
  if (!ekranlar.has(ad)) ad = 'planlar';
  if (ad === aktif) return;
  const onceki = aktif ? ekranlar.get(aktif) : null;
  const sonraki = ekranlar.get(ad);
  aktif = ad;
  const benim = ++gecis;

  if (gecmis && location.hash !== '#/' + ad) history.replaceState(null, '', '#/' + ad);
  yay('ekran', ad);

  if (onceki) {
    onceki.gizle?.();
    if (azHareket()) onceki.kok.hidden = true;
    else {
      onceki.kok.classList.remove('ekran--giris');
      onceki.kok.classList.add('ekran--cikis');
      setTimeout(() => {
        onceki.kok.classList.remove('ekran--cikis');
        if (benim === gecis || ekranlar.get(aktif) !== onceki) onceki.kok.hidden = true;
      }, 150);
    }
  }

  const goster = () => {
    if (benim !== gecis) return;
    sonraki.kok.hidden = false;
    sonraki.kok.classList.remove('ekran--cikis');
    if (!azHareket()) {
      sonraki.kok.classList.remove('ekran--giris');
      void sonraki.kok.offsetWidth;
      sonraki.kok.classList.add('ekran--giris');
    }
    sonraki.goster?.();
  };
  if (onceki && !azHareket()) setTimeout(goster, 110);
  else goster();
}

export function hashtenEkran() {
  const m = /^#\/(\w+)/.exec(location.hash);
  return m ? m[1] : null;
}
