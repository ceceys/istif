// Elle çizilmiş çizgi simgeler: 24×24 ızgara, 1,75 çizgi, yuvarlak uçlar.
const YOLLAR = {
  planlar: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M3.5 11h17"/>',
  yeni: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M12 8v8M8 12h8"/>',
  urunler: '<path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z"/><path d="M4 7.6 12 12l8-4.4M12 12v8.8M8 5.4l8 4.4"/>',
  araclar: '<path d="M2.8 16V6.5h11.2V16"/><path d="M14 9.5h3.8l3 3.3V16h-1.5"/><path d="M8.6 16h6.8M2.8 16h1"/><circle cx="6.3" cy="16.6" r="1.9"/><circle cx="17.3" cy="16.6" r="1.9"/>',
  hakkinda: '<circle cx="12" cy="12" r="8.75"/><path d="M12 11v5.2"/><path d="M12 7.7v.1"/>',
  ekle: '<path d="M12 5v14M5 12h14"/>',
  duzenle: '<path d="M4.5 19.5h3.8L19 8.8l-3.8-3.8L4.5 15.7z"/><path d="m13.3 6.9 3.8 3.8"/>',
  sil: '<path d="M4.5 7h15M10 4h4M6.5 7l.9 12.2a1 1 0 0 0 1 .8h7.2a1 1 0 0 0 1-.8L17.5 7M10 11v5M14 11v5"/>',
  kopyala: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3"/>',
  ara: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.2 4.2"/>',
  kaydet: '<path d="M5 4.5h10.5L19.5 8.5V18.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13a1 1 0 0 1 .5-1z"/><path d="M8 4.5v4.5h6.5V4.5M7.5 19.5v-5.5h9v5.5"/>',
  ac: '<path d="M3.5 18V6.5A1.5 1.5 0 0 1 5 5h4l2 2h6.5A1.5 1.5 0 0 1 19 8.5V10"/><path d="M3.5 18l2.4-6.8A1.5 1.5 0 0 1 7.3 10h13.2a.8.8 0 0 1 .7 1.1L18.6 18z"/>',
  oynat: '<path d="M8 5.8v12.4a.8.8 0 0 0 1.2.7l9.8-6.2a.8.8 0 0 0 0-1.4L9.2 5.1A.8.8 0 0 0 8 5.8z" fill="currentColor"/>',
  durdur: '<rect x="6.5" y="5.5" width="3.8" height="13" rx="1" fill="currentColor"/><rect x="13.7" y="5.5" width="3.8" height="13" rx="1" fill="currentColor"/>',
  onceki: '<path d="M7 5.5v13"/><path d="M18 6.2v11.6a.7.7 0 0 1-1.1.6L9.6 12.6a.7.7 0 0 1 0-1.2l7.3-5.8a.7.7 0 0 1 1.1.6z"/>',
  sonraki: '<path d="M17 5.5v13"/><path d="M6 6.2v11.6a.7.7 0 0 0 1.1.6l7.3-5.8a.7.7 0 0 0 0-1.2L7.1 5.6A.7.7 0 0 0 6 6.2z"/>',
  basa: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
  izometrik: '<path d="M12 3.5 19.5 7.8v8.4L12 20.5l-7.5-4.3V7.8z"/><path d="M4.5 7.8 12 12l7.5-4.2M12 12v8.5"/>',
  yandan: '<rect x="2.5" y="8" width="13.5" height="7.5" rx="1"/><path d="M16 10.5h2.6l2.9 2.6v2.4H16"/><circle cx="6" cy="17.2" r="1.3"/><circle cx="18" cy="17.2" r="1.3"/>',
  ustten: '<rect x="4.5" y="9" width="15" height="11" rx="1.5"/><path d="M12 2.8v4M10 5l2 2 2-2"/><path d="M9.5 9v11M14.5 9v11" opacity=".5"/>',
  arkadan: '<rect x="5" y="4" width="14" height="16" rx="1.5"/><path d="M12 4v16M10 10.5v3M14 10.5v3"/>',
  sigdir: '<path d="M4 9V4.5a.5.5 0 0 1 .5-.5H9M15 4h4.5a.5.5 0 0 1 .5.5V9M20 15v4.5a.5.5 0 0 1-.5.5H15M9 20H4.5a.5.5 0 0 1-.5-.5V15"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
  uyari: '<path d="M10.3 4.6 3 17.4A2 2 0 0 0 4.7 20.4h14.6a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.2M12 16.8v.1"/>',
  bilgi: '<circle cx="12" cy="12" r="8.75"/><path d="M12 11v5.2"/><path d="M12 7.7v.1"/>',
  onay: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  onayDaire: '<circle cx="12" cy="12" r="8.75"/><path d="m8.2 12.3 2.6 2.6 5-5.2"/>',
  hata: '<circle cx="12" cy="12" r="8.75"/><path d="m9 9 6 6M15 9l-6 6"/>',
  kapat: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  kilit: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  yerImi: '<path d="M6.5 4.5h11v16l-5.5-4-5.5 4z"/>',
  hacim: '<path d="M12 3.5 19.5 7.8v8.4L12 20.5l-7.5-4.3V7.8z"/><path d="M4.5 7.8 12 12l7.5-4.2M12 12v8.5"/>',
  agirlik: '<path d="M6.3 9h11.4l2 10.5a1 1 0 0 1-1 1.2H5.3a1 1 0 0 1-1-1.2z"/><circle cx="12" cy="6" r="2.4"/>',
  cetvel: '<path d="M3.2 15.6 15.6 3.2l5.2 5.2L8.4 20.8z"/><path d="m7.4 11.4 2 2M10.4 8.4l2 2M13.4 5.4l2 2"/>',
  merkez: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  katman: '<path d="M12 4 20.5 8.5 12 13 3.5 8.5z"/><path d="M3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
  asagi: '<path d="m6 9 6 6 6-6"/>',
  yukari: '<path d="m6 15 6-6 6 6"/>',
  sag: '<path d="m9 6 6 6-6 6"/>',
  sol: '<path d="m15 6-6 6 6 6"/>',
  planla: '<path d="M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4z"/><path d="M16.75 14v6M13.75 17h6"/>',
  dosya: '<path d="M6 3.5h8l4.5 4.5v12.5a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5v-16.5A.5.5 0 0 1 6 3.5z"/><path d="M14 3.5V8h4.5"/>',
  klasor: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
  dondur: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  zemin: '<path d="M3 19.5h18"/><rect x="7" y="9" width="10" height="10.5" rx="1"/>',
  ustuneKonamaz: '<rect x="5" y="11.5" width="14" height="8.5" rx="1"/><path d="m9.5 3.5 5 5M14.5 3.5l-5 5"/>',
  kod: '<path d="m8.5 7.5-4.5 4.5 4.5 4.5M15.5 7.5l4.5 4.5-4.5 4.5M13.5 5l-3 14"/>',
  kisi: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
  disBaglanti: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13"/><path d="M17 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1H10"/>',
  guncelle: '<path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1"/><path d="M17.5 3.5v3.4h-3.4M6.5 20.5v-3.4h3.4"/>',
  renk: '<circle cx="12" cy="12" r="8.75"/><circle cx="8.5" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="15.5" cy="10" r="1.2"/>',
  kalem: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9.5h8M8 13h5"/>',
  durak: '<path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
  kapi: '<path d="M6 20.5V4.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16M4 20.5h16"/><path d="M14.5 12.2v.1"/>',
  tablo: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
  pdf: '<path d="M6 3.5h8l4.5 4.5v12.5a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5v-16.5A.5.5 0 0 1 6 3.5z"/><path d="M14 3.5V8h4.5"/><path d="M8.5 13.5h7M8.5 16.5h4.5"/>',
  ayarlar: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.4M12 18.1v2.4M3.5 12h2.4M18.1 12h2.4M6 6l1.7 1.7M16.3 16.3 18 18M6 18l1.7-1.7M16.3 7.7 18 6"/><circle cx="12" cy="12" r="6.1"/>',
  geriAl: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5h10a5 5 0 0 1 0 10H11"/>',
  yinele: '<path d="m15 14 4.5-4.5L15 5"/><path d="M19.5 9.5h-10a5 5 0 0 0 0 10H13"/>',
  yakinlas: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.2 4.2M11 8.2v5.6M8.2 11h5.6"/>',
  uzaklas: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.2 4.2M8.2 11h5.6"/>',
  tamEkran: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  tamEkranCik: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
  kamera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.3"/>',
  katalog: '<path d="M5 5.5a2 2 0 0 1 2-2h11v13H7a2 2 0 0 0-2 2z"/><path d="M5 18.5a2 2 0 0 0 2 2h11v-4M9 7.5h5M9 10.5h5"/>',
  tutamak: '<circle cx="9" cy="6.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="6.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="17.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="17.5" r="1.1" fill="currentColor" stroke="none"/>',
  dil: '<circle cx="12" cy="12" r="8.75"/><path d="M3.5 12h17M12 3.25c2.4 2.4 3.5 5.5 3.5 8.75s-1.1 6.35-3.5 8.75c-2.4-2.4-3.5-5.5-3.5-8.75S9.6 5.65 12 3.25z"/>',
  tema: '<circle cx="12" cy="12" r="8.75"/><path d="M12 3.25v17.5a8.75 8.75 0 0 0 0-17.5z" fill="currentColor"/>',
  disari: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 14v4.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V14"/>',
  iceri: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 14v4.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V14"/>',
  dengele: '<path d="M12 4.5v15M7 19.5h10M5 7.5h14M5 7.5l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7.5l-2.5 6a2.5 2.5 0 0 0 5 0z"/>',
  notlar: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M8 8h8M8 11.5h8M8 15h5"/>',
  // Elle düzenleme
  tasi: '<path d="M12 3.5v17M3.5 12h17"/><path d="m9.5 6 2.5-2.5L14.5 6M9.5 18l2.5 2.5 2.5-2.5M6 9.5 3.5 12 6 14.5M18 9.5l2.5 2.5-2.5 2.5"/>',
  dondurYatay: '<path d="M12 3.5v4M12 16.5v4" opacity=".5"/><path d="M19 12c0 2-3.1 3.6-7 3.6S5 14 5 12s3.1-3.6 7-3.6c2.2 0 4.2.5 5.5 1.3"/><path d="m15.4 7.2 2.4 2.4-3.2.9"/>',
  yanaYatir: '<rect x="3.5" y="12.5" width="8" height="8" rx="1"/><path d="M7.5 9.5A8 8 0 0 1 18.5 9"/><path d="m19.8 5.6-1 3.6-3.5-1.1"/><path d="M14 20.5h6.5" opacity=".5"/>',
  oneYatir: '<rect x="4.5" y="4.5" width="9" height="9" rx="1"/><path d="M17.3 7a6.5 6.5 0 0 1-1.5 11.3H9.5"/><path d="m12 15.8-2.5 2.5L12 20.8"/>',
  yaslaSol: '<path d="M4 4v16"/><path d="M20 12H8.5"/><path d="m12 8.5-3.5 3.5 3.5 3.5"/>',
  yaslaSag: '<path d="M20 4v16"/><path d="M4 12h11.5"/><path d="m12 8.5 3.5 3.5-3.5 3.5"/>',
  yaslaOn: '<path d="M4 4h16"/><path d="M12 20V8.5"/><path d="m8.5 12 3.5-3.5 3.5 3.5"/>',
  yaslaArka: '<path d="M4 20h4M10 20h4M16 20h4"/><path d="M12 4v11.5"/><path d="m8.5 12 3.5 3.5 3.5-3.5"/>',
  yereIndir: '<rect x="8" y="3.5" width="8" height="6.5" rx="1"/><path d="M12 12.5v5"/><path d="m9.5 15 2.5 2.5 2.5-2.5"/><path d="M4 20.5h16"/>',
  boslukKapat: '<path d="M3.5 4v16"/><rect x="5.5" y="8" width="5" height="8" rx="1"/><rect x="15" y="8" width="5.5" height="8" rx="1"/><path d="M14 12h-1.5M13.8 10.3 12.1 12l1.7 1.7"/>',
  otomatik: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/><path d="m9.8 15.5 2.2-6 2.2 6M10.6 13.4h2.8"/>',
  izgara: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
};

/** Satır içi SVG metni döndürür. */
export function simge(ad, boyut = 20, sinif = '') {
  const yol = YOLLAR[ad] || YOLLAR.bilgi;
  return `<svg class="simge ${sinif}" width="${boyut}" height="${boyut}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${yol}</svg>`;
}

/**
 * Araç türü çizimleri (48×20): tır, kamyon, kamyonet, konteyner.
 * Önü sağda; tekerlekler ve kabin aynı çizgi kalınlığında.
 */
const ARAC_CIZIM = {
  tir: '<path d="M2.5 14.2V4.5h29v9.7"/><path d="M33.5 14.2V8.2h6.2l4.3 3.6v2.4"/><path d="M35.5 8.2v3.4h6"/><path d="M2.5 14.2h3M10.5 14.2h3.6M19 14.2h12.5M31.5 14.2h2M38.5 14.2h1.6"/><circle cx="8" cy="15.4" r="1.9"/><circle cx="16.6" cy="15.4" r="1.9"/><circle cx="36.3" cy="15.4" r="1.9"/><circle cx="42.3" cy="15.4" r="1.9"/>',
  kamyon: '<path d="M4.5 14.2V4.5h24v9.7"/><path d="M29.5 14.2V7.2h6.5l4.5 4v3"/><path d="M31.5 7.2v4h7"/><path d="M4.5 14.2h3.5M12.5 14.2h21M38 14.2h2.5"/><circle cx="10.2" cy="15.4" r="1.9"/><circle cx="35.6" cy="15.4" r="1.9"/>',
  kamyonet: '<path d="M8.5 14.2V6.5h18.5v7.7"/><path d="M27.5 14.2V8.5h5.2l3.8 3.2v2.5"/><path d="M29.3 8.5v3.2h5.5"/><path d="M8.5 14.2h3M15.6 14.2h15.6M34.6 14.2h1.9"/><circle cx="13.5" cy="15.4" r="1.7"/><circle cx="32.8" cy="15.4" r="1.7"/>',
  konteyner: '<rect x="3" y="4" width="42" height="11.5" rx=".6"/><path d="M8 4v11.5M13 4v11.5M18 4v11.5M23 4v11.5M28 4v11.5M33 4v11.5M38 4v11.5" opacity=".45"/><path d="M1.5 17.5h45"/>',
};

export function aracCizimi(tur, genislik = 48) {
  const yol = ARAC_CIZIM[tur] || ARAC_CIZIM.tir;
  const yukseklik = Math.round((genislik * 20) / 48);
  return `<svg class="arac-cizim" width="${genislik}" height="${yukseklik}" viewBox="0 0 48 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${yol}</svg>`;
}
