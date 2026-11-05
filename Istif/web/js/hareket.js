// Animasyon tercihi: "acik" (her zaman), "sistem" (Windows'un animasyon efektleri ayarı, prefers-reduced-motion)
// ya da "kapali". Varsayılan "acik": Windows'ta animasyonlar kapalı olsa da program hareketli çalışır.
// Etkin durum html.az-hareket sınıfıyla CSS'e (temel.css), azHareket() ile koda (3B, düzenleme, sayaçlar, ekran
// geçişleri) iletilir. Kabuk aynı ayarı açılış ekranında uygular (ayarlar.json "animasyon").
const sorgu = matchMedia('(prefers-reduced-motion: reduce)');
let ayar = 'acik';

export const ANIMASYONLAR = ['acik', 'sistem', 'kapali'];

/** Animasyonlar kapalı mı (ayar "kapali" ya da "sistem" seçiliyken Windows'ta kapalı) */
export const azHareket = () => ayar === 'kapali' || (ayar === 'sistem' && sorgu.matches);

/** Windows (ya da tarayıcı) azaltılmış hareket istiyor mu; Ayarlar ekranındaki not için */
export const sistemAzHareket = () => sorgu.matches;

function uygula() {
  document.documentElement.classList.toggle('az-hareket', azHareket());
}

export function animasyonAyarla(yeni) {
  ayar = ANIMASYONLAR.includes(yeni) ? yeni : 'acik';
  uygula();
}

sorgu.addEventListener('change', () => {
  if (ayar === 'sistem') uygula();
});

uygula();
