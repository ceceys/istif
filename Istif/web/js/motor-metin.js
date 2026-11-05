// Motorun Türkçe uyarı ve hata metinlerini arayüzün diline ve birimine çevirir.
// Motor metin döndürür (kod değil); bilinen kalıplar burada eşlenir, tanınmayan metin olduğu gibi gösterilir.
// Motor yeni bir metin eklerse buraya kalıbı ve dil dosyalarına "motor.*" anahtarı eklenir.
import { t } from './dil.js';
import { kg, metre, yuzde } from './bicim.js';

/** Motorun Türkçe sayı biçimini okur: "1.234,5" → 1234.5 */
function trSayi(s) {
  return Number(String(s).replace(/\./g, '').replace(',', '.'));
}

/** "Araç" ya da "Filodaki 2. araç" */
function yer(eslesen) {
  return eslesen && /^Filodaki/.test(eslesen) ? t('motor.filodakiArac', { n: trSayi(eslesen.match(/\d+/)[0]) }) : t('motor.arac');
}

const YER = '(Araç|Filodaki \\d+\\. araç)';

const KALIPLAR = [
  // Uyarılar
  [/^Ağırlık merkezi aks grubunun arkasında kalıyor\.$/, () => t('motor.amAksArkasinda')],
  [/^Ağırlık merkezi şasi kilidinin önünde\.$/, () => t('motor.amSasiOnunde')],
  [/^Ağırlık merkezi şasi kilidinin önünde; yükü geriye almak için .+ seçeneğini açın\.$/, () => t('motor.amSasiOnundeOneri', { secenek: t('plan.arac.dengele') })],
  [/^Yük yanlara dengesiz: ağırlık merkezi ortadan ([\d.,]+) m (solda|sağda)\.$/,
    (m) => t(m[2] === 'solda' ? 'motor.yanSolda' : 'motor.yanSagda', { m: metre(trSayi(m[1]) * 1000) })],
  [/^Tonaj aşılıyor: yük ([\d.,]+) kg, araç sınırı ([\d.,]+) kg\.$/,
    (m) => t('motor.tonaj', { yuk: kg(trSayi(m[1])), sinir: kg(trSayi(m[2])) })],
  [/^Yük, ağırlık dengesi için ([\d.,]+) m geriye alındı; arkasını kayışla sabitleyin\.$/,
    (m) => t('motor.kaydirma', { m: metre(trSayi(m[1]) * 1000) })],
  // Hatalar
  [new RegExp(`^${YER} bilgisi eksik\\.$`), (m) => t('motor.bilgiEksik', { yer: yer(m[1]) })],
  [new RegExp(`^${YER} ölçüleri eksik ya da hatalı\\.$`), (m) => t('motor.olcuHatali', { yer: yer(m[1]) })],
  [new RegExp(`^${YER} ölçülerinden biri 65 metreyi aşıyor\\.$`), (m) => t('motor.olcuBuyuk', { yer: yer(m[1]) })],
  [new RegExp(`^${YER}: kapı payı araç uzunluğundan kısa olmalı\\.$`), (m) => t('motor.kapiPayiUzun', { yer: yer(m[1]) })],
  [/^Kapı payı araç uzunluğundan kısa olmalı\.$/, () => t('motor.kapiPayiUzun', { yer: t('motor.arac') })],
  [/^Hesap için girdi gelmedi\.$/, () => t('motor.girdiYok')],
  [/^Hesaplama sırasında beklenmeyen bir hata oluştu\.$/, () => t('plan.hata.motorHata')],
  // Elle düzenleme (06.11): denetim ihlalleri. Parça adları kullanıcının yazdığı addır, çevrilmez.
  [/^Araç sınırının dışına taşıyor\.$/, () => t('motor.ihlal.tasma')],
  [/^Kapı payına giriyor\.$/, () => t('motor.ihlal.kapiPayi')],
  [/^Ölçüleri kalemin ölçüleriyle uyuşmuyor\.$/, () => t('motor.ihlal.olcuUyusmuyor')],
  [/^Bu parça döndürülemez\.$/, () => t('motor.ihlal.dondurulemez')],
  [/^Bu parça yalnız yatayda çevrilebilir, yan yatırılamaz\.$/, () => t('motor.ihlal.yalnizYatay')],
  [/^(\d+) parçayla çakışıyor\.$/, (m) => t('motor.ihlal.cakismaCok', { n: Number(m[1]) })],
  [/^(.+) ile çakışıyor\.$/, (m) => t('motor.ihlal.cakisma', { ad: m[1] })],
  [/^Bu parça yalnız tabana konabilir\.$/, () => t('motor.ihlal.yalnizZemin')],
  [/^Parça havada duruyor\.$/, () => t('motor.ihlal.havada')],
  [/^Altı yeterince dolu değil: tabanın %(\d+)'i destekli, en az %(\d+) gerekir\.$/,
    (m) => t('motor.ihlal.destek', { destek: yuzde(Number(m[1]), 0), gereken: yuzde(Number(m[2]), 0) })],
  [/^Üstüne konamayan (\d+) parçanın üstünde\.$/, (m) => t('motor.ihlal.ustuneKonamazCok', { n: Number(m[1]) })],
  [/^Üstüne konamayan parçanın üstünde: (.+)\.$/, (m) => t('motor.ihlal.ustuneKonamaz', { ad: m[1] })],
  [/^Üstündeki yük ([\d.,]+) kg, sınırı ([\d.,]+) kg\.$/,
    (m) => t('motor.ihlal.ustYuk', { yuk: kg(trSayi(m[1])), sinir: kg(trSayi(m[2])) })],
  [/^Bu parça, daha önce indirilecek (\d+) parçanın önünü kapatıyor\.$/, (m) => t('motor.ihlal.teslimatCok', { n: Number(m[1]) })],
  [/^Bu parça, daha önce indirilecek (.+) parçasının önünü kapatıyor\.$/, (m) => t('motor.ihlal.teslimat', { ad: m[1] })],
  // Elle düzenleme istek hataları
  [/^Denetim için girdi gelmedi\.$/, () => t('motor.denetimGirdiYok')],
  [/^Denetlenecek araç listesi gelmedi\.$/, () => t('motor.aracListesiYok')],
  [/^Yaslama yönü sol, sag, on, arka ya da asagi olmalı\.$/, () => t('motor.yaslamaYonu')],
  [/^Bilinmeyen istek\.$/, () => t('motor.bilinmeyenIstek')],
];

/** Motor metnini arayüz diline çevirir; tanınmazsa olduğu gibi döner. */
export function motorMetni(metin) {
  const s = String(metin ?? '');
  for (const [kalip, cevir] of KALIPLAR) {
    const m = kalip.exec(s);
    if (m) return cevir(m);
  }
  return s;
}
