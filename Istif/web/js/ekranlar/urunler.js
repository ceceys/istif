// Ürün kütüphanesi: arama, ekleme, düzenleme, silme; ürünlerde varsayılan kurallar tutulur.
import { t, yerel } from '../dil.js';
import { kac, kg, olcu, olcuBirimi } from '../bicim.js';
import { simge } from '../simgeler.js';
import { $, ogeUret, bildirim, hataKutusu, onayIste, siraliGiris } from '../arayuz.js';
import { durum, dinle, kutuphaneKaydet, yeniId, kalemDuzelt, planDegisti, yeniPlanNesnesi, planiAc } from '../durum.js';
import { kalemDuzenle } from '../duzenleyiciler.js';
import { kuralEtiketleri, boyalariUygula } from '../bilesenler.js';
import { git } from '../yonlendirici.js';

export function urunlerEkraniKur() {
  const kok = ogeUret(`
    <section class="ekran ekran-kutuphane ekran-urunler">
      <div class="ekran-ic">
        <header class="ekran-baslik">
          <div>
            <h1>${kac(t('urunler.baslik'))}</h1>
            <p class="ekran-aciklama">${kac(t('urunler.aciklama'))}</p>
          </div>
          <div class="ekran-baslik-eylem">
            <label class="arama">${simge('ara', 16)}<input type="search" placeholder="${kac(t('urunler.ara'))}" autocomplete="off"></label>
            <button type="button" class="dugme dugme--birincil" data-eylem="yeni">${simge('ekle', 18)}${kac(t('urunler.yeni'))}</button>
          </div>
        </header>
        <div class="kart tablo-karti">
          <table class="tablo urun-tablosu">
            <thead><tr>
              <th>${kac(t('urunler.ad'))}</th>
              <th>${kac(t('urunler.referans'))}</th>
              <th class="sag">${kac(t('urunler.olcu', { birim: olcuBirimi() }))}</th>
              <th class="sag">${kac(t('urunler.agirlik'))}</th>
              <th>${kac(t('urunler.kurallar'))}</th>
              <th class="eylem-sutun"></th>
            </tr></thead>
            <tbody></tbody>
          </table>
          <div class="tablo-alt"><span class="soluk urun-sayisi"></span></div>
        </div>
      </div>
    </section>`);

  const arama = $('input[type="search"]', kok);
  const govde = $('tbody', kok);

  function ciz({ giris = false } = {}) {
    const s = arama.value.trim().toLocaleLowerCase(yerel());
    const tum = durum.kutuphane.urunler;
    const urunler = tum.filter((u) => !s || `${u.ad} ${u.referans}`.toLocaleLowerCase(yerel()).includes(s));
    $('.urun-sayisi', kok).textContent = t('urunler.sayi', { n: tum.length });
    if (!urunler.length) {
      govde.innerHTML = `<tr class="bos-satir"><td colspan="6">
        <div class="bos-durum bos-durum--kucuk">${simge('urunler', 24)}<div><b>${kac(tum.length ? t('urunler.bulunamadi') : t('urunler.bos'))}</b>${tum.length ? '' : `<small>${kac(t('urunler.bosAlt'))}</small>`}</div></div>
      </td></tr>`;
      return;
    }
    govde.innerHTML = urunler.map((u) => `
      <tr data-id="${kac(u.id)}">
        <td><span class="parca-ad"><span class="renk-kare" data-boya="${kac(u.renk)}"></span><b>${kac(u.ad)}</b></span></td>
        <td class="soluk">${kac(u.referans || '—')}</td>
        <td class="sag rakam">${olcu(u.uzunluk, u.en, u.yukseklik)}</td>
        <td class="sag rakam">${kac(kg(u.agirlik))}</td>
        <td><div class="etiketler">${kuralEtiketleri(u, { durak: false })}</div></td>
        <td class="eylem-sutun">
          <button type="button" class="dugme dugme--hayalet dugme--kucuk" data-eylem="plana" title="${kac(t('urunler.planaEkle'))}">${simge('ekle', 15)}${kac(t('urunler.planaEkle'))}</button>
          <button type="button" class="simge-dugme" data-eylem="duzenle" title="${kac(t('genel.duzenle'))}" aria-label="${kac(t('genel.duzenle'))}">${simge('duzenle', 16)}</button>
          <button type="button" class="simge-dugme simge-dugme--tehlike" data-eylem="sil" title="${kac(t('genel.sil'))}" aria-label="${kac(t('genel.sil'))}">${simge('sil', 16)}</button>
        </td>
      </tr>`).join('');
    boyalariUygula(govde);
    if (giris) siraliGiris(govde, ':scope > tr', 25);
  }

  async function kaydetVeCiz(bildirimMetni) {
    try {
      await kutuphaneKaydet();
      bildirim(bildirimMetni, { tur: 'basari' });
    } catch (e) {
      hataKutusu({ baslik: t('urunler.baslik'), metin: e.message });
    }
    ciz();
  }

  async function yeniUrun() {
    const r = await kalemDuzenle({ mod: 'urun', siraNo: durum.kutuphane.urunler.length });
    if (!r) return;
    const u = urunNesnesi({ ...r.kalem, id: yeniId('u') });
    durum.kutuphane.urunler.push(u);
    kaydetVeCiz(t('urunler.kaydedildi', { ad: u.ad }));
  }

  async function duzenle(id) {
    const liste = durum.kutuphane.urunler;
    const i = liste.findIndex((u) => u.id === id);
    if (i < 0) return;
    const r = await kalemDuzenle({ kalem: liste[i], mod: 'urun' });
    if (!r) return;
    liste[i] = urunNesnesi({ ...r.kalem, id });
    kaydetVeCiz(t('urunler.kaydedildi', { ad: liste[i].ad }));
  }

  async function sil(id) {
    const u = durum.kutuphane.urunler.find((x) => x.id === id);
    if (!u) return;
    const evet = await onayIste({ baslik: t('urunler.silBaslik'), metin: t('urunler.silMetin', { ad: u.ad }), tamam: t('genel.sil'), tehlike: true, simgeAdi: 'sil' });
    if (!evet) return;
    durum.kutuphane.urunler = durum.kutuphane.urunler.filter((x) => x.id !== id);
    kaydetVeCiz(t('urunler.silindi', { ad: u.ad }));
  }

  function planaEkle(id) {
    const u = durum.kutuphane.urunler.find((x) => x.id === id);
    if (!u) return;
    if (!durum.plan) planiAc(yeniPlanNesnesi());
    durum.plan.kalemler.push(kalemDuzelt({ ...u, id: yeniId('k'), urunId: u.id, adet: 1, teslimatSirasi: 0 }));
    planDegisti('kalem');
    bildirim(t('urunler.planaEklendi', { ad: u.ad }), { tur: 'basari', eylem: { metin: t('planlar.planaDon'), fn: () => git('plan') } });
  }

  kok.addEventListener('click', (e) => {
    const eylem = e.target.closest('[data-eylem]')?.dataset.eylem;
    const id = e.target.closest('tr')?.dataset.id;
    if (eylem === 'yeni') yeniUrun();
    else if (eylem === 'duzenle' && id) duzenle(id);
    else if (eylem === 'sil' && id) sil(id);
    else if (eylem === 'plana' && id) planaEkle(id);
    else if (!eylem && id && e.target.closest('tbody')) duzenle(id);
  });
  arama.addEventListener('input', () => ciz());
  dinle('kutuphane', () => {
    if (!kok.hidden) ciz();
  });

  return {
    kok,
    goster() {
      ciz({ giris: true });
    },
  };
}

/** Plan kalemine özgü alanlar ürüne yazılmaz. */
function urunNesnesi(k) {
  const { adet, teslimatSirasi, urunId, ...u } = kalemDuzelt(k);
  return u;
}
