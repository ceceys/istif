// PDF yükleme planı: yazdırma biçemiyle (A4 yatay, açık zemin) basılan rapor sayfaları.
// Sayfa 1 özet; her araç için 3B görüntüler ve yükleme sırası tablosu. Uzun tablo sayfaya bölünür,
// başlık satırı her sayfada tekrar eder. Alt bilgi ve sayfa numarası @page kenar kutularıyla basılır.
// Metinler programın dilinde, ölçüler seçili birim sisteminde (metrik / imperial) yazılır.
import { t } from './dil.js';
import { URUN } from './urun.js';
import {
  kac, kg, metre, cm, olcu, sayi, yuzde, tarihSaat, aracOlcusu, olcuBirimi, agirlikBirimi, uzunBirim, uzunSayi, agirlikSayi,
} from './bicim.js';
import { kapidanGecmez } from './durum.js';
import { motorMetni } from './motor-metin.js';

const SEBEPLER = ['olcu', 'agirlik', 'kural', 'sinir'];

function sebepMetni(sebep) {
  return t('plan.uyari.sebep.' + (SEBEPLER.includes(sebep) ? sebep : 'bilinmiyor'));
}

function merkezKonumu(m, L) {
  const fark = m.z - L / 2;
  if (Math.abs(fark) < 50) return t('plan.ozet.ortada');
  return fark < 0 ? t('plan.ozet.onde', { m: metre(Math.abs(fark)) }) : t('plan.ozet.arkada', { m: metre(fark) });
}

function kuralMetni(k) {
  const e = [];
  if (k.ustuneKonabilir === false) e.push(t('plan.kural.ustuneKonamaz'));
  if (k.yalnizZemin) e.push(t('plan.kural.yalnizZemin'));
  if (k.ustuneKonabilir !== false && k.ustYukSiniri != null) e.push(t('plan.kural.ustYuk', { kg: kg(k.ustYukSiniri) }));
  e.push(t('plan.kural.yon', { yon: t('plan.yonler.' + (k.donus || 'serbest')) }));
  if (k.teslimatSirasi > 0) e.push(t('plan.kural.teslimat', { n: k.teslimatSirasi }));
  return e.join(' · ');
}

/** CSS content: "..." içine güvenle yazılacak metin */
function cssMetni(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

const BOSLUK_YONLERI = ['ust', 'sol', 'sag', 'on', 'arka'];

/**
 * Raporu belgeye ekler.
 * @param plan        açık plan (sonuçlu; elle düzenlenmişse sonuç yeni yerleşimdir)
 * @param goruntuler  her araç için { izometrik, ustten, yandan } PNG veri adresleri (ya da null)
 * @param aracBilgisi motorun araç çıktısını ölçüleri, adı ve kapı ağzıyla tamamlayan işlev (plan ekranından)
 * @param kalanBosluklar her araç için bütün yükün duvarlara kalan boşluğu { ust, sol, sag, on, arka } (mm) ya da null
 * @param ihlaller    elle düzenlenmiş planın denetim sonucu (motorun denetle çıktısı); boşsa yazılmaz
 * @returns kaldır() işlevi
 */
export function raporKur(plan, goruntuler = [], { aracBilgisi = null, kalanBosluklar = [], ihlaller = [] } = {}) {
  const s = plan.sonuc;
  const arac = plan.sonucArac || plan.arac;
  const bilgi = (a) => (aracBilgisi ? aracBilgisi(a) : { ...arac, ...a });
  const kalemBul = (id) => plan.kalemler.find((k) => k.id === id) || null;
  const toplamParca = s.ozet?.toplamParca ?? plan.kalemler.reduce((a, k) => a + k.adet, 0);
  const yerlesen = s.araclar.reduce((a, x) => a + x.yerlesimler.length, 0);
  const toplamAgirlik = s.araclar.reduce((a, x) => a + (x.toplamAgirlik || 0), 0);
  const filoVar = Array.isArray(arac.filo) && arac.filo.length > 0;

  const baslik = `
    <header class="r-ust">
      <img class="r-simge" src="img/simge-256.png" alt="">
      <div class="r-ust-metin">
        <h1>${kac(plan.ad)}</h1>
        <p>${kac(t('rapor.baslikAlt'))} · ${kac(tarihSaat())}${plan.elleDuzenlendi ? ` · <span class="r-elle">${kac(t('plan.duzenle.elleRozet'))}</span>` : ''}</p>
      </div>
      <div class="r-ust-urun">${kac(URUN.ad)}</div>
    </header>`;

  const kutular = `
    <div class="r-kutular">
      <div><span>${kac(t('rapor.aracTipi'))}</span><b>${kac(arac.ad)}</b>${filoVar ? `<small>${kac(t('rapor.filo', { n: arac.filo.length }))}</small>` : ''}</div>
      <div><span>${kac(t('rapor.icOlcu'))}</span><b>${kac(aracOlcusu(arac))}</b>
        <small>${arac.maksAgirlik ? kac(t('rapor.azamiYuk', { kg: kg(arac.maksAgirlik) })) : kac(t('plan.ozet.sinirYok'))}${arac.kapiPayiMm ? ` · ${kac(t('plan.arac.kapiPayi'))} ${kac(metre(arac.kapiPayiMm))}` : ''}</small></div>
      <div><span>${kac(t('rapor.aracSayisi'))}</span><b>${sayi(s.araclar.length)}</b></div>
      <div><span>${kac(t('rapor.toplamParca'))}</span><b>${kac(t('rapor.toplamParcaDeger', { y: sayi(yerlesen), t: sayi(toplamParca) }))}</b></div>
      <div><span>${kac(t('rapor.toplamAgirlik'))}</span><b>${kac(kg(toplamAgirlik))}</b></div>
    </div>`;

  // Karışık filoda her aracın adı ve ölçüsü ayrıdır; motor her araca kendi değerlerini yazar
  const farkliTip = s.araclar.some((a) => a.ad && a.ad !== s.araclar[0].ad);
  const aracSatirlari = s.araclar.map((a, i) => {
    const b = bilgi(a);
    const maks = a.maksAgirlik ?? b.maksAgirlik ?? 0;
    const m = a.agirlikMerkezi;
    return `
      <tr>
        <td><b>${kac(t('rapor.aracOnEki', { n: a.no ?? i + 1 }))}</b>${farkliTip && b.ad ? ` <small>${kac(b.ad)}</small>` : ''}</td>
        <td class="sag">${sayi(a.yerlesimler.length)}</td>
        <td class="sag">${kac(yuzde(a.hacimDoluluk || 0))}</td>
        <td class="sag">${kac(kg(a.toplamAgirlik || 0))} / ${maks ? kac(kg(maks)) : kac(t('rapor.sinirsiz'))}</td>
        <td class="sag">${kac(metre(a.kullanilanUzunluk || 0))}</td>
        <td>${m ? kac(t('rapor.merkezDeger', { m: metre(m.z), konum: merkezKonumu(m, b.uzunluk) })) : '—'}</td>
        <td class="sag">${a.aksYukleri ? `${kac(kg(a.aksYukleri.sasi))} / ${kac(kg(a.aksYukleri.aks))}` : kac(t('rapor.aksYok'))}</td>
      </tr>`;
  }).join('');

  // Elle düzenlemenin denetimi: hatalar önce, parça adıyla
  const denetim = (ai) => (ihlaller || []).filter((x) => x.aracIndeksi === ai)
    .sort((x, y) => (x.duzey === 'hata' ? 0 : 1) - (y.duzey === 'hata' ? 0 : 1));
  const hataSayisi = new Set((ihlaller || []).filter((x) => x.duzey === 'hata')
    .map((x) => (x.kalemId == null ? `${x.aracIndeksi}|arac` : `${x.aracIndeksi}|${x.kalemId}|${x.parcaNo}`))).size;

  const uyarilar = s.araclar.flatMap((a, i) => {
    const b = bilgi(a);
    const onEk = `<b>${kac(t('rapor.aracOnEki', { n: a.no ?? i + 1 }))}:</b> `;
    const parcaAdi = (x) => a.yerlesimler.find((y) => y.kalemId === x.kalemId && y.parcaNo === x.parcaNo)?.ad || '';
    const elle = denetim(i).map((x) => `<li class="${x.duzey === 'hata' ? 'r-hata' : ''}">${onEk}${x.duzey === 'hata' ? `<b>${kac(t('plan.duzenle.tabloHata'))}:</b> ` : ''}${x.kalemId != null ? `${kac(parcaAdi(x))} · ` : ''}${kac(motorMetni(x.mesaj))}</li>`);
    const motor = (a.uyarilar || []).map((u) => `<li>${onEk}${kac(motorMetni(u))}</li>`);
    const kapi = b.kapi
      ? plan.kalemler.filter((k) => kapidanGecmez(k, b)).map((k) => `<li>${onEk}${kac(t('rapor.kapiUyari', { ad: k.ad, kapi: `${cm(b.kapi.en)} × ${cm(b.kapi.yukseklik)} ${olcuBirimi()}` }))}</li>`)
      : [];
    return elle.concat(motor, kapi);
  });

  // Kalan boşluk: her araçta bütün yükün dış kutusundan duvarlara (kapıda kapı payı düşülmüş)
  const boslukDegeri = (mm) => (mm == null ? '—' : `<span class="${mm < 0 ? 'r-eksi' : ''}">${kac(cm(mm))}</span>`);
  const boslukVar = (kalanBosluklar || []).some(Boolean);
  const boslukSatirlari = s.araclar.map((a, i) => {
    const d = kalanBosluklar[i];
    const b = bilgi(a);
    return `
      <tr>
        <td><b>${kac(t('rapor.aracOnEki', { n: a.no ?? i + 1 }))}</b>${farkliTip && b.ad ? ` <small>${kac(b.ad)}</small>` : ''}</td>
        ${BOSLUK_YONLERI.map((yon) => `<td class="sag">${d ? boslukDegeri(d[yon]) : '—'}</td>`).join('')}
      </tr>`;
  }).join('');
  const boslukTablosu = boslukVar ? `
      <h2>${kac(t('plan.duzenle.bosluk.baslik'))}</h2>
      <p class="r-aciklama">${kac(t('plan.duzenle.rapor.boslukAciklama', { birim: olcuBirimi() }))}</p>
      <table class="r-tablo r-bosluk">
        <thead><tr>
          <th>${kac(t('rapor.sutun.arac'))}</th>
          ${BOSLUK_YONLERI.map((yon) => `<th class="sag">${kac(t('plan.duzenle.bosluk.yon.' + yon))}</th>`).join('')}
        </tr></thead>
        <tbody>${boslukSatirlari}</tbody>
      </table>` : '';
  const aracBoslukSatiri = (i) => {
    const d = kalanBosluklar[i];
    if (!d) return '';
    const v = Object.fromEntries(BOSLUK_YONLERI.map((yon) => [yon, `${cm(d[yon])} ${olcuBirimi()}`]));
    return `<p class="r-arac-bosluk">${kac(t('plan.duzenle.rapor.aracBosluk', v))}</p>`;
  };

  const gruplar = new Map();
  for (const x of s.sigmayanlar || []) {
    const anahtar = `${x.kalemId}|${x.sebep}`;
    const g = gruplar.get(anahtar) || { ad: kalemBul(x.kalemId)?.ad || String(x.ad || '').replace(/\s+\d+\/\d+$/, ''), parca: x.ad, sayi: 0, sebep: x.sebep };
    g.sayi += 1;
    gruplar.set(anahtar, g);
  }
  const sigmayanlar = [...gruplar.values()].map((g) =>
    `<li><b>${kac(g.sayi > 1 ? `${g.ad} × ${sayi(g.sayi)}` : g.parca)}</b> · ${kac(sebepMetni(g.sebep))}</li>`);

  const yukSatirlari = plan.kalemler.map((k) => `
    <tr>
      <td><span class="r-nokta" style="background:${kac(k.renk)}"></span>${kac(k.ad)}${k.referans ? ` <small>${kac(k.referans)}</small>` : ''}</td>
      <td class="sag">${olcu(k.uzunluk, k.en, k.yukseklik)}</td>
      <td class="sag">${kac(kg(k.agirlik))}</td>
      <td class="sag">${sayi(k.adet)}</td>
      <td>${kac(kuralMetni(k))}</td>
    </tr>`).join('');

  const ozetSayfasi = `
    <section class="r-sayfa r-ozet">
      ${baslik}
      ${hataSayisi ? `<div class="r-hata-notu">${kac(t('plan.duzenle.rapor.hataNotu', { n: hataSayisi }))}</div>` : ''}
      ${kutular}
      <h2>${kac(t('rapor.araclarBaslik'))}</h2>
      <table class="r-tablo">
        <thead><tr>
          <th>${kac(t('rapor.sutun.arac'))}</th>
          <th class="sag">${kac(t('rapor.sutun.parca'))}</th>
          <th class="sag">${kac(t('rapor.sutun.doluluk'))}</th>
          <th class="sag">${kac(t('rapor.sutun.agirlik'))}</th>
          <th class="sag">${kac(t('rapor.sutun.uzunluk'))}</th>
          <th>${kac(t('rapor.sutun.merkez'))}</th>
          <th class="sag">${kac(t('rapor.sutun.aks'))}</th>
        </tr></thead>
        <tbody>${aracSatirlari}</tbody>
      </table>
      ${boslukTablosu}
      <div class="r-iki">
        <div class="r-kutu r-kutu--uyari">
          <h3>${kac(t('rapor.uyarilarBaslik'))}</h3>
          ${uyarilar.length ? `<ul>${uyarilar.join('')}</ul>` : `<p>${kac(t('rapor.uyariYok'))}</p>`}
        </div>
        <div class="r-kutu ${sigmayanlar.length ? 'r-kutu--hata' : 'r-kutu--tamam'}">
          <h3>${kac(t('rapor.sigmayanBaslik'))}</h3>
          ${sigmayanlar.length ? `<ul>${sigmayanlar.join('')}</ul>` : `<p>${kac(t('rapor.sigmayanYok'))}</p>`}
        </div>
      </div>
      <h2>${kac(t('rapor.yukListesi'))}</h2>
      <table class="r-tablo">
        <thead><tr>
          <th>${kac(t('rapor.yukSutun.kalem'))}</th>
          <th class="sag">${kac(t('rapor.yukSutun.olcu', { birim: olcuBirimi() }))}</th>
          <th class="sag">${kac(t('rapor.yukSutun.agirlik'))}</th>
          <th class="sag">${kac(t('rapor.yukSutun.adet'))}</th>
          <th>${kac(t('rapor.yukSutun.kurallar'))}</th>
        </tr></thead>
        <tbody>${yukSatirlari}</tbody>
      </table>
    </section>`;

  const aracSayfalari = s.araclar.map((a, i) => {
    const b = bilgi(a);
    const g = goruntuler[i] || {};
    const gorsel = (ad, sinif) => g[ad]
      ? `<figure class="${sinif}"><img src="${g[ad]}" alt=""><figcaption>${kac(t('rapor.gorunumler.' + ad))}</figcaption></figure>`
      : `<figure class="${sinif} r-gorsel-yok"><span>${kac(t('rapor.goruntuYok'))}</span></figure>`;
    const satirlar = [...a.yerlesimler].sort((x, y) => x.sira - y.sira).map((y) => {
      const notlar = [];
      if (y.ustte) notlar.push(t('rapor.notlar.ustte'));
      if (kalemBul(y.kalemId)?.ustuneKonabilir === false) notlar.push(t('rapor.notlar.ustuneKonamaz'));
      if (y.donduruldu) notlar.push(t('rapor.notlar.donduruldu'));
      return `
        <tr>
          <td class="sag r-sira">${sayi(y.sira)}</td>
          <td><span class="r-nokta" style="background:${kac(y.renk || '#3ABFF0')}"></span>${kac(y.ad)}</td>
          <td class="sag">${olcu(y.uzunluk, y.en, y.yukseklik)}</td>
          <td class="sag">${agirlikSayi(y.agirlik)}</td>
          <td class="sag">${uzunSayi(y.z)}</td>
          <td>${kac(notlar.join(' · '))}</td>
        </tr>`;
    }).join('');
    return `
      <section class="r-sayfa r-arac">
        <header class="r-arac-ust">
          <h2>${kac(t('rapor.aracBaslik', { arac: t('plan.arac.baslik'), n: a.no ?? i + 1, t: s.araclar.length, ad: b.ad || arac.ad }))}</h2>
          <p>${kac([
            t('plan.yuk.parcaSayisi', { n: a.yerlesimler.length }),
            kg(a.toplamAgirlik || 0),
            t('rapor.doluluk', { v: yuzde(a.hacimDoluluk || 0) }),
            t('rapor.kullanilanUzunluk', { v: metre(a.kullanilanUzunluk || 0) }),
          ].join(' · '))}</p>
        </header>
        ${aracBoslukSatiri(i)}
        <div class="r-gorseller">
          ${gorsel('izometrik', 'r-gorsel r-gorsel--buyuk')}
          <div class="r-gorsel-kucukler">
            ${gorsel('ustten', 'r-gorsel')}
            ${gorsel('yandan', 'r-gorsel')}
          </div>
        </div>
        <h3 class="r-sira-baslik">${kac(t('rapor.siraBaslik'))}</h3>
        <table class="r-tablo r-sira-tablosu">
          <thead><tr>
            <th class="sag">${kac(t('rapor.siraSutun.sira'))}</th>
            <th>${kac(t('rapor.siraSutun.parca'))}</th>
            <th class="sag">${kac(t('rapor.siraSutun.olcu', { birim: olcuBirimi() }))}</th>
            <th class="sag">${kac(t('rapor.siraSutun.agirlik', { birim: agirlikBirimi() }))}</th>
            <th class="sag">${kac(t('rapor.siraSutun.onden', { birim: uzunBirim() }))}</th>
            <th>${kac(t('rapor.siraSutun.not'))}</th>
          </tr></thead>
          <tbody>${satirlar}</tbody>
        </table>
      </section>`;
  }).join('');

  const kok = document.createElement('div');
  kok.id = 'rapor';
  kok.className = 'rapor';
  kok.innerHTML = ozetSayfasi + aracSayfalari;
  document.body.appendChild(kok);

  // Alt bilgi ve sayfa numarası; metin dil dosyasından geldiği için stil burada yazılır
  const altBilgi = t('rapor.altBilgi', { ad: URUN.ad, surum: URUN.surum });
  const stil = document.createElement('style');
  stil.id = 'rapor-sayfa';
  stil.textContent = `
    @page {
      size: A4 landscape;
      background: #FFFFFF;
      @bottom-left { content: "${cssMetni(altBilgi)}"; font: 7.5pt "Segoe UI", sans-serif; color: #6B7487; vertical-align: top; padding-top: 3mm; }
      @bottom-right { content: "${cssMetni(t('rapor.sayfa'))} " counter(page) " / " counter(pages); font: 7.5pt "Segoe UI", sans-serif; color: #6B7487; vertical-align: top; padding-top: 3mm; }
    }`;
  document.head.appendChild(stil);
  document.documentElement.classList.add('rapor-var');

  return () => {
    kok.remove();
    stil.remove();
    document.documentElement.classList.remove('rapor-var');
  };
}

/** Rapordaki bütün görüntüler çözülene kadar bekler. */
export async function raporHazir(kok = document.getElementById('rapor')) {
  if (!kok) return;
  const resimler = [...kok.querySelectorAll('img')];
  await Promise.all(resimler.map((r) => (r.decode ? r.decode().catch(() => {}) : Promise.resolve())));
}
