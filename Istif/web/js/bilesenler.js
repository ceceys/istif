// Tekrar kullanılan küçük arayüz parçaları: sayı alanı, anahtar, kural etiketleri, renk seçici.
import { t } from './dil.js';
import { esnek, kac, kg, sayiOku } from './bicim.js';
import { simge } from './simgeler.js';
import { RENKLER } from './veri.js';
import { $$ } from './arayuz.js';

/**
 * Birimli sayı alanı. Değer kullanıcıya gösterilen birimdedir (cm ya da kg).
 * Yukarı/aşağı ok tuşları 1, Shift ile 10 artırır.
 */
export function sayiAlani({ ad, etiket, deger, birim, ondalik = 1, enAz = 0, ipucu = '', devreDisi = false, kucuk = false }) {
  const metin = deger == null || deger === '' || !Number.isFinite(Number(deger)) ? '' : esnek(Number(deger), ondalik);
  return `
    <label class="alan${kucuk ? ' alan--kucuk' : ''}" data-alan="${ad}">
      <span class="alan-etiket">${kac(etiket)}</span>
      <span class="sayi-girdi${devreDisi ? ' devre-disi' : ''}">
        <input type="text" inputmode="decimal" name="${ad}" value="${kac(metin)}" autocomplete="off" spellcheck="false"
               data-ondalik="${ondalik}" data-enaz="${enAz}" ${devreDisi ? 'disabled' : ''} ${ipucu ? `title="${kac(ipucu)}"` : ''}>
        ${birim ? `<span class="birim">${kac(birim)}</span>` : ''}
      </span>
    </label>`;
}

/** Alanlara ok tuşu adımı ve odaktan çıkınca biçimleme ekler. */
export function sayiAlanlariniBagla(kok, degisti) {
  $$('.sayi-girdi input', kok).forEach((girdi) => {
    if (girdi.dataset.bagli) return;
    girdi.dataset.bagli = '1';
    const ondalik = Number(girdi.dataset.ondalik || 0);
    const enAz = Number(girdi.dataset.enaz || 0);
    girdi.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const simdi = sayiOku(girdi.value);
      const adim = e.shiftKey ? 10 : 1;
      const yeni = Math.max(enAz, (Number.isFinite(simdi) ? simdi : 0) + (e.key === 'ArrowUp' ? adim : -adim));
      girdi.value = esnek(yeni, ondalik);
      girdi.dispatchEvent(new Event('input', { bubbles: true }));
    });
    girdi.addEventListener('blur', () => {
      const v = sayiOku(girdi.value);
      if (Number.isFinite(v)) girdi.value = esnek(v, ondalik);
    });
    if (degisti) girdi.addEventListener('input', () => degisti(girdi.name, sayiOku(girdi.value), girdi));
  });
}

export function alanDegeri(kok, ad) {
  const g = kok.querySelector(`[name="${ad}"]`);
  return g ? sayiOku(g.value) : NaN;
}

export function alanHatasi(kok, ad, metin) {
  const a = kok.querySelector(`[data-alan="${ad}"]`);
  if (!a) return;
  a.classList.toggle('alan--hata', !!metin);
  let m = a.querySelector('.alan-hata');
  if (metin) {
    if (!m) {
      m = document.createElement('span');
      m.className = 'alan-hata';
      a.appendChild(m);
    }
    m.textContent = metin;
  } else if (m) m.remove();
}

/** Açılır-kapanır anahtar (checkbox) */
export function anahtar({ ad, etiket, aciklama = '', acik = false, devreDisi = false }) {
  return `
    <label class="anahtar-satir${devreDisi ? ' devre-disi' : ''}">
      <span class="anahtar">
        <input type="checkbox" name="${ad}" ${acik ? 'checked' : ''} ${devreDisi ? 'disabled' : ''}>
        <span class="anahtar-iz"><span class="anahtar-top"></span></span>
      </span>
      <span class="anahtar-metin">
        <span class="anahtar-etiket">${kac(etiket)}</span>
        ${aciklama ? `<span class="anahtar-aciklama">${kac(aciklama)}</span>` : ''}
      </span>
    </label>`;
}

/** Kalem kural etiketleri: Üstüne konamaz, Yalnız zemin, Üst yük ≤ X kg, Yön, Durak */
export function kuralEtiketleri(k, { yon = true, durak = true } = {}) {
  const e = [];
  if (k.ustuneKonabilir === false) e.push(`<span class="etiket etiket--kirmizi">${simge('ustuneKonamaz', 12)}${kac(t('plan.kural.ustuneKonamaz'))}</span>`);
  if (k.yalnizZemin) e.push(`<span class="etiket etiket--sari">${simge('zemin', 12)}${kac(t('plan.kural.yalnizZemin'))}</span>`);
  if (k.ustuneKonabilir !== false && k.ustYukSiniri != null) {
    e.push(`<span class="etiket etiket--mavi">${simge('agirlik', 12)}${kac(t('plan.kural.ustYuk', { kg: kg(k.ustYukSiniri) }))}</span>`);
  }
  if (yon) e.push(`<span class="etiket">${simge('dondur', 12)}${kac(t('plan.kural.yon', { yon: t('plan.yonler.' + (k.donus || 'serbest')) }))}</span>`);
  if (durak && k.teslimatSirasi > 0) e.push(`<span class="etiket etiket--mor">${simge('durak', 12)}${kac(t('plan.kural.teslimat', { n: k.teslimatSirasi }))}</span>`);
  return e.join('');
}

/** Renk seçici: hazır palet ve özel renk */
export function renkSecici(secili) {
  const hazir = RENKLER.map((r) => `
    <button type="button" class="renk-kutu${r.toLowerCase() === String(secili).toLowerCase() ? ' secili' : ''}" data-renk="${r}" aria-label="${r}">
      <span class="renk-ornek" data-boya="${r}"></span>
    </button>`).join('');
  const ozel = !RENKLER.some((r) => r.toLowerCase() === String(secili).toLowerCase());
  return `
    <div class="renk-secici" role="radiogroup">
      ${hazir}
      <label class="renk-kutu renk-ozel${ozel ? ' secili' : ''}" title="${kac(t('kalem.renk'))}">
        <span class="renk-ornek" data-boya="${ozel ? secili : '#ffffff'}">${simge('renk', 14)}</span>
        <input type="color" value="${kac(secili)}" tabindex="-1">
      </label>
    </div>`;
}

export function renkSeciciBagla(kok, degisti) {
  const kutu = kok.querySelector('.renk-secici');
  if (!kutu) return;
  boyalariUygula(kutu);
  const sec = (renk, oge) => {
    $$('.renk-kutu', kutu).forEach((k) => k.classList.toggle('secili', k === oge));
    degisti(renk);
  };
  $$('button.renk-kutu', kutu).forEach((b) => b.addEventListener('click', () => sec(b.dataset.renk, b)));
  const ozel = kutu.querySelector('.renk-ozel');
  const girdi = ozel.querySelector('input');
  ozel.addEventListener('click', (e) => {
    if (e.target !== girdi) girdi.click();
  });
  girdi.addEventListener('input', () => {
    ozel.querySelector('.renk-ornek').style.background = girdi.value;
    sec(girdi.value, ozel);
  });
}

/** data-boya="#rrggbb" taşıyan öğelere arka plan rengi verir (satır içi stil yazmadan). */
export function boyalariUygula(kok) {
  $$('[data-boya]', kok).forEach((o) => {
    o.style.setProperty('--boya', o.dataset.boya);
  });
}
