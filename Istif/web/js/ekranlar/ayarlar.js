// Ayarlar: dil, tema, animasyonlar, birim, varsayılan araç, güncelleme ve veri (klasör, kütüphaneyi dışa ve içe aktarma).
// Dil ve birim değişince arayüz yeniden yüklenir (açık plan korunur); tema ve animasyon hemen uygulanır.
import { t, DILLER, dilKodu } from '../dil.js';
import { URUN } from '../urun.js';
import { kac } from '../bicim.js';
import { simge } from '../simgeler.js';
import { $, ogeUret, bildirim, diyalog, hataKutusu, siraliGiris } from '../arayuz.js';
import { istek, kabukVar } from '../kopru.js';
import { anahtar } from '../bilesenler.js';
import { durum, ayarDegistir, kutuphaneKaydet, kutuphaneDogrula, tumAraclar } from '../durum.js';
import { VARSAYILAN_ARAC } from '../veri.js';
import { temaAyarla, TEMALAR } from '../tema.js';
import { animasyonAyarla, ANIMASYONLAR, sistemAzHareket } from '../hareket.js';
import { guncellemeSor } from '../eylemler.js';
import { yenidenYukle } from '../taslak.js';
import { surumNotlariAc } from '../surum-notlari.js';

/** Büyük diziyi parça parça base64'e çevirir (tek seferde yayılım yığını taşırır) */
function base64Kodla(baytlar) {
  let ikili = '';
  for (let i = 0; i < baytlar.length; i += 0x8000) ikili += String.fromCharCode(...baytlar.subarray(i, i + 0x8000));
  return btoa(ikili);
}

function bolumlu(ad, secenekler, secili) {
  return `
    <div class="bolumlu" role="radiogroup" aria-label="${kac(t('ayarlar.' + ad))}">
      ${secenekler.map(([deger, metin]) => `
        <label class="bolumlu-secenek">
          <input type="radio" name="${ad}" value="${kac(deger)}" ${deger === secili ? 'checked' : ''}>
          <span>${kac(metin)}</span>
        </label>`).join('')}
    </div>`;
}

export function ayarlarEkraniKur() {
  const kok = ogeUret(`
    <section class="ekran ekran-ayarlar">
      <div class="ekran-ic ayarlar-ic">
        <header class="ekran-baslik">
          <div>
            <h1>${kac(t('ayarlar.baslik'))}</h1>
            <p class="ekran-aciklama">${kac(t('ayarlar.aciklama'))}</p>
          </div>
        </header>
        <div class="ayarlar-izgara"></div>
      </div>
    </section>`);

  const izgara = $('.ayarlar-izgara', kok);

  function ciz() {
    const a = durum.ayarlar;
    const sistemAdi = DILLER.find((d) => d.kod === durum.sistemDili)?.ad || 'English';
    const dilCevrilmedi = a.dil !== 'sistem' && a.dil !== dilKodu();
    const araclar = tumAraclar();
    const varsayilan = a.varsayilanArac && araclar.some((x) => x.id === a.varsayilanArac) ? a.varsayilanArac : VARSAYILAN_ARAC;
    izgara.innerHTML = `
      <section class="kart ayar-kart">
        <h2 class="kart-alt-baslik">${simge('tema', 15)}${kac(t('ayarlar.gorunum'))}</h2>
        <label class="ayar-satir">
          <span class="ayar-etiket">${simge('dil', 16)}<span><b>${kac(t('ayarlar.dil'))}</b><small>${kac(t('ayarlar.dilAciklama'))}</small></span></span>
          <select class="secim" name="dil">
            <option value="sistem" ${a.dil === 'sistem' ? 'selected' : ''}>${kac(t('ayarlar.sistemDili', { dil: sistemAdi }))}</option>
            ${DILLER.map((d) => `<option value="${d.kod}" lang="${d.kod}" ${a.dil === d.kod ? 'selected' : ''}>${kac(d.ad)}</option>`).join('')}
          </select>
        </label>
        ${dilCevrilmedi ? `<p class="ayar-not">${simge('bilgi', 13)}${kac(t('ayarlar.ceviriYok'))}</p>` : ''}
        <div class="ayar-satir">
          <span class="ayar-etiket">${simge('tema', 16)}<span><b>${kac(t('ayarlar.tema'))}</b><small>${kac(t('ayarlar.temaAciklama'))}</small></span></span>
          ${bolumlu('tema', TEMALAR.map((k) => [k, t('ayarlar.temalar.' + k)]), a.tema)}
        </div>
        <div class="ayar-satir">
          <span class="ayar-etiket">${simge('oynat', 16)}<span><b>${kac(t('ayarlar.animasyon'))}</b><small>${kac(t('ayarlar.animasyonAciklama'))}</small></span></span>
          ${bolumlu('animasyon', ANIMASYONLAR.map((k) => [k, t('ayarlar.animasyonlar.' + k)]), ANIMASYONLAR.includes(a.animasyon) ? a.animasyon : 'acik')}
        </div>
        <p class="ayar-not animasyon-notu" ${a.animasyon === 'sistem' && sistemAzHareket() ? '' : 'hidden'}>${simge('bilgi', 13)}${kac(t('ayarlar.animasyonSistemKapali'))}</p>
        <div class="ayar-satir">
          <span class="ayar-etiket">${simge('cetvel', 16)}<span><b>${kac(t('ayarlar.birim'))}</b><small>${kac(t('ayarlar.birimAciklama'))}</small></span></span>
          ${bolumlu('birim', [['metrik', t('ayarlar.birimler.metrik')], ['imperial', t('ayarlar.birimler.imperial')]], a.birim)}
        </div>
      </section>

      <section class="kart ayar-kart">
        <h2 class="kart-alt-baslik">${simge('araclar', 15)}${kac(t('ayarlar.planlama'))}</h2>
        <label class="ayar-satir">
          <span class="ayar-etiket">${simge('araclar', 16)}<span><b>${kac(t('ayarlar.varsayilanArac'))}</b><small>${kac(t('ayarlar.varsayilanAracAciklama'))}</small></span></span>
          <select class="secim" name="varsayilanArac">
            ${araclar.length ? `
              <optgroup label="${kac(t('plan.arac.hazirTipler'))}">${araclar.filter((x) => x.hazir).map((x) => `<option value="${kac(x.id)}" ${x.id === varsayilan ? 'selected' : ''}>${kac(x.ad)}</option>`).join('')}</optgroup>
              ${araclar.some((x) => !x.hazir) ? `<optgroup label="${kac(t('plan.arac.araclarim'))}">${araclar.filter((x) => !x.hazir).map((x) => `<option value="${kac(x.id)}" ${x.id === varsayilan ? 'selected' : ''}>${kac(x.ad)}</option>`).join('')}</optgroup>` : ''}`
              : `<option value="">—</option>`}
          </select>
        </label>
      </section>

      <section class="kart ayar-kart">
        <h2 class="kart-alt-baslik">${simge('guncelle', 15)}${kac(t('ayarlar.guncellemeler'))}</h2>
        <div class="ayar-satir">
          <span class="ayar-etiket">${simge('bilgi', 16)}<span><b>${kac(t('hakkinda.surum', { s: URUN.surum }))}</b>${kabukVar ? `<small>${kac(durum.surumBilgisi.kurulu ? t('ayarlar.kurulu') : t('ayarlar.tasinabilir'))}</small>` : ''}</span></span>
          <button type="button" class="dugme dugme--hayalet" data-eylem="notlar">${simge('notlar', 16)}${kac(t('hakkinda.notlariAc'))}</button>
        </div>
        ${kabukVar ? `
        ${anahtar({ ad: 'guncellemeDenetimi', etiket: t('hakkinda.acilistaDenetle'), aciklama: t('ayarlar.guncellemeAciklama'), acik: a.guncellemeDenetimi !== false })}
        <div class="guncelleme-satir">
          <button type="button" class="dugme dugme--ikincil" data-eylem="denetle">${simge('guncelle', 17)}<span>${kac(t('hakkinda.denetle'))}</span></button>
          <span class="guncelleme-sonuc soluk" aria-live="polite"></span>
        </div>` : `<p class="ayar-not">${simge('bilgi', 13)}${kac(t('hakkinda.tarayicida'))}</p>`}
      </section>

      <section class="kart ayar-kart">
        <h2 class="kart-alt-baslik">${simge('klasor', 15)}${kac(t('ayarlar.veri'))}</h2>
        <p class="ayar-not">${simge('bilgi', 13)}${kac(kabukVar ? t('ayarlar.veriAciklama', { yol: durum.surumBilgisi.veriKlasoru || '' }) : t('planlar.tarayiciNotu'))}</p>
        <div class="ayar-dugmeler">
          ${kabukVar ? `<button type="button" class="dugme dugme--ikincil" data-eylem="klasor">${simge('klasor', 16)}${kac(t('ayarlar.klasorAc'))}</button>` : ''}
          <button type="button" class="dugme dugme--ikincil" data-eylem="disari">${simge('disari', 16)}${kac(t('ayarlar.disariAktar'))}</button>
          <button type="button" class="dugme dugme--ikincil" data-eylem="iceri">${simge('iceri', 16)}${kac(t('ayarlar.iceriAktar'))}</button>
        </div>
        <p class="soluk ayar-sayilar">${kac(t('ayarlar.kutuphaneSayisi', { urun: durum.kutuphane.urunler.length, arac: durum.kutuphane.araclar.length }))}</p>
      </section>`;
  }

  async function degistir(degisiklik, { yeniden = false } = {}) {
    try {
      await ayarDegistir(degisiklik);
    } catch (e) {
      hataKutusu({ baslik: t('ayarlar.baslik'), metin: e.message });
      return;
    }
    if (yeniden) yenidenYukle();
  }

  izgara.addEventListener('change', (e) => {
    const g = e.target;
    if (g.name === 'dil') degistir({ dil: g.value }, { yeniden: true });
    else if (g.name === 'birim') degistir({ birim: g.value }, { yeniden: true });
    else if (g.name === 'tema') {
      temaAyarla(g.value);
      degistir({ tema: g.value });
    } else if (g.name === 'animasyon') {
      // Hemen uygulanır; açılış ekranı bir sonraki açılışta aynı ayarı kullanır
      animasyonAyarla(g.value);
      $('.animasyon-notu', izgara).hidden = !(g.value === 'sistem' && sistemAzHareket());
      degistir({ animasyon: g.value });
    } else if (g.name === 'varsayilanArac') {
      degistir({ varsayilanArac: g.value || null });
      bildirim(t('ayarlar.varsayilanKaydedildi'), { tur: 'basari' });
    } else if (g.name === 'guncellemeDenetimi') degistir({ guncellemeDenetimi: g.checked });
  });

  izgara.addEventListener('click', (e) => {
    const eylem = e.target.closest('[data-eylem]')?.dataset.eylem;
    if (eylem === 'notlar') surumNotlariAc();
    else if (eylem === 'denetle') denetle(e.target.closest('[data-eylem]'));
    else if (eylem === 'klasor') istek('veriKlasoruAc').catch((h) => hataKutusu({ baslik: t('ayarlar.klasorAc'), metin: h.message }));
    else if (eylem === 'disari') disariAktar();
    else if (eylem === 'iceri') iceriAktar();
  });

  async function denetle(d) {
    const sonuc = $('.guncelleme-sonuc', izgara);
    d.disabled = true;
    d.querySelector('span').textContent = t('hakkinda.denetleniyor');
    d.classList.add('donuyor');
    sonuc.textContent = '';
    try {
      const r = await istek('guncellemeDenetle');
      if (r && r.durum === 'yeni') guncellemeSor({ surum: r.surum, notlar: r.notlar });
      else sonuc.textContent = t('hakkinda.guncel');
    } catch (h) {
      hataKutusu({ baslik: t('ayarlar.guncellemeler'), metin: h.message });
    } finally {
      d.disabled = false;
      d.classList.remove('donuyor');
      d.querySelector('span').textContent = t('hakkinda.denetle');
    }
  }

  async function disariAktar() {
    const json = JSON.stringify({ bicim: `${URUN.kisaAd}-kutuphane`, uygulama: `${URUN.ad} ${URUN.surum}`, ...durum.kutuphane }, null, 2);
    const base64 = base64Kodla(new TextEncoder().encode(json));
    try {
      const cevap = await istek('dosyaKaydet', { onerilenAd: t('ayarlar.kutuphaneDosyaAdi'), base64, filtre: 'json' });
      if (cevap) bildirim(t('ayarlar.disariAktarildi'), { tur: 'basari' });
    } catch (h) {
      hataKutusu({ baslik: t('ayarlar.disariAktar'), metin: h.message });
    }
  }

  async function iceriAktar() {
    let dosya;
    try {
      dosya = await istek('dosyaSec', { filtre: 'json' });
    } catch (h) {
      hataKutusu({ baslik: t('ayarlar.iceriAktar'), metin: h.message });
      return;
    }
    if (!dosya) return;
    let veri = null;
    try {
      const baytlar = Uint8Array.from(atob(dosya.base64), (c) => c.charCodeAt(0));
      veri = kutuphaneDogrula(JSON.parse(new TextDecoder().decode(baytlar)));
    } catch {
      veri = null;
    }
    if (!veri) {
      hataKutusu({ baslik: t('ayarlar.iceriAktar'), metin: t('ayarlar.gecersizKutuphane') });
      return;
    }
    const d = diyalog({
      baslik: t('ayarlar.iceriAktar'),
      icerik: `<p class="diyalog-metin">${kac(t('ayarlar.iceriSoru', { urun: veri.urunler.length, arac: veri.araclar.length }))}</p>`,
      simgeAdi: 'iceri',
      genislik: 500,
      dugmeler: [
        { metin: t('genel.vazgec'), tur: 'ikincil', deger: null },
        { metin: t('ayarlar.degistir'), tur: 'ikincil', deger: 'degistir' },
        { metin: t('ayarlar.birlestir'), tur: 'birincil', deger: 'birlestir' },
      ],
    });
    const secim = await d.sonuc;
    if (!secim) return;
    if (secim === 'degistir') durum.kutuphane = veri;
    else {
      const birlestir = (eski, yeni) => {
        const harita = new Map(eski.map((x) => [x.id, x]));
        yeni.forEach((x) => harita.set(x.id, x));
        return [...harita.values()];
      };
      durum.kutuphane = {
        ...durum.kutuphane,
        urunler: birlestir(durum.kutuphane.urunler, veri.urunler),
        araclar: birlestir(durum.kutuphane.araclar, veri.araclar),
      };
    }
    try {
      await kutuphaneKaydet();
      bildirim(t('ayarlar.iceriAktarildi', { urun: veri.urunler.length, arac: veri.araclar.length }), { tur: 'basari' });
    } catch (h) {
      hataKutusu({ baslik: t('ayarlar.iceriAktar'), metin: h.message });
    }
    ciz();
  }

  return {
    kok,
    goster() {
      ciz();
      siraliGiris(izgara, ':scope > .kart', 45);
    },
  };
}

