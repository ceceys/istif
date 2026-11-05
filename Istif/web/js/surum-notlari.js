// Sürüm notları penceresi: kabuğa gömülü Resources/Notes.<dil>.md (yoksa İngilizcesi) bölüm bölüm gösterilir.
// Biçim: "1.0.0 — 05.11.2026" başlık satırı, altında "- " maddeleri, bölümler boş satırla ayrılır.
import { t, dilKodu } from './dil.js';
import { kac } from './bicim.js';
import { istek } from './kopru.js';
import { diyalog } from './arayuz.js';

/** Notes.<dil>.md metnini bölümlere ayırır: [{ baslik, maddeler }] */
export function notlariAyristir(metin) {
  const bolumler = [];
  let simdiki = null;
  for (const ham of String(metin || '').replace(/\r/g, '').split('\n')) {
    const satir = ham.trim();
    if (!satir) {
      simdiki = null;
      continue;
    }
    if (satir.startsWith('#')) continue;
    if (!simdiki) {
      simdiki = { baslik: satir, maddeler: [] };
      bolumler.push(simdiki);
    } else simdiki.maddeler.push(satir.replace(/^-\s+/, ''));
  }
  return bolumler;
}

export async function surumNotlariAc() {
  let v = null;
  try {
    v = await istek('surumNotlari', { dil: dilKodu() });
  } catch {
    v = null;
  }
  const bolumler = notlariAyristir(v && v.metin);
  const icerik = bolumler.length
    ? `${v.dil !== dilKodu() ? `<p class="alan-aciklama">${kac(t('notlar.ingilizce'))}</p>` : ''}
       <div class="surum-gecmisi">${bolumler.map((b) => `
         <section class="surum-bolum">
           <h3>${kac(b.baslik)}</h3>
           <ul>${b.maddeler.map((m) => `<li>${kac(m)}</li>`).join('')}</ul>
         </section>`).join('')}</div>`
    : `<p class="diyalog-metin">${kac(t('notlar.yok'))}</p>`;
  return diyalog({
    baslik: t('hakkinda.surumNotlari'),
    icerik,
    simgeAdi: 'notlar',
    genislik: 640,
    sinif: 'diyalog--notlar',
    dugmeler: [{ metin: t('genel.kapat'), tur: 'birincil', deger: true }],
  }).sonuc;
}
