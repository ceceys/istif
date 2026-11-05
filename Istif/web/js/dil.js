// Metin sözlüğü ve dil seçimi.
// Dil dosyaları js/dil/<kod>.js: düz anahtar-değer, `export default { "anahtar": "metin", ... }`.
// Seçilen dilin dosyası yoksa İngilizceye düşülür; bir anahtar eksikse önce İngilizcesi, sonra Türkçesi kullanılır.
// Çoğul: "anahtar#one", "anahtar#few"… biçimindeki ek anahtarlar Intl.PluralRules ile seçilir (n sayısına göre).
import tr from './dil/tr.js';
import en from './dil/en.js';

/** Desteklenen diller: kod, kendi dilindeki adı, Intl yerel ayarı, yazı yönü. Kabuktaki Metinler.Diller ile aynı sıra. */
export const DILLER = Object.freeze([
  { kod: 'tr', ad: 'Türkçe', yerel: 'tr-TR' },
  { kod: 'en', ad: 'English', yerel: 'en-GB' },
  { kod: 'de', ad: 'Deutsch', yerel: 'de-DE' },
  { kod: 'fr', ad: 'Français', yerel: 'fr-FR' },
  { kod: 'es', ad: 'Español', yerel: 'es-ES' },
  { kod: 'it', ad: 'Italiano', yerel: 'it-IT' },
  { kod: 'pt', ad: 'Português', yerel: 'pt-PT' },
  { kod: 'ru', ad: 'Русский', yerel: 'ru-RU' },
  { kod: 'ar', ad: 'العربية', yerel: 'ar', yon: 'rtl' },
  { kod: 'zh', ad: '中文', yerel: 'zh-CN' },
  { kod: 'ja', ad: '日本語', yerel: 'ja-JP' },
  { kod: 'ko', ad: '한국어', yerel: 'ko-KR' },
]);

const YEDEK = DILLER[1];
let etkin = YEDEK;
let sozluk = en;
let cogul = new Intl.PluralRules(YEDEK.yerel);
let sayiBicimi = new Intl.NumberFormat(YEDEK.yerel, { maximumFractionDigits: 2 });

/** Etkin dil kodu (dosyası bulunan dil). */
export const dilKodu = () => etkin.kod;

/** Intl için yerel ayar, ör. "tr-TR". */
export const yerel = () => etkin.yerel;

/** Tarayıcının (WebView2'de kabuğun bildirdiği) dili desteklenen bir dilse onun kodu, değilse "en". */
export function sistemDili(kabuktan = null) {
  const adaylar = [kabuktan, ...(navigator.languages || []), navigator.language].filter(Boolean);
  for (const a of adaylar) {
    const kod = String(a).slice(0, 2).toLowerCase();
    if (DILLER.some((d) => d.kod === kod)) return kod;
  }
  return YEDEK.kod;
}

async function dosyaYukle(kod) {
  if (kod === 'tr') return tr;
  if (kod === 'en') return en;
  try {
    const m = await import(`./dil/${kod}.js`);
    return m && m.default && typeof m.default === 'object' ? m.default : null;
  } catch {
    return null; // bu dilin çevirisi henüz yok
  }
}

/**
 * Dili seçer. istenen: "sistem" ya da dil kodu. Dosyası yoksa İngilizce yüklenir.
 * Döner: etkin dil kodu.
 */
export async function dilAyarla(istenen, kabukSistemDili = null) {
  let kod = !istenen || istenen === 'sistem' ? sistemDili(kabukSistemDili) : istenen;
  let d = DILLER.find((x) => x.kod === kod) || YEDEK;
  let s = await dosyaYukle(d.kod);
  if (!s) {
    d = YEDEK;
    s = en;
  }
  etkin = d;
  sozluk = s;
  cogul = new Intl.PluralRules(d.yerel);
  sayiBicimi = new Intl.NumberFormat(d.yerel, { maximumFractionDigits: 2 });
  document.documentElement.lang = d.kod;
  document.documentElement.dir = d.yon || 'ltr';
  kod = d.kod;
  return kod;
}

/** Anahtarı önce etkin sözlükte, sonra İngilizcede, sonra Türkçede arar; çoğul eki aynı sözlükten alınır. */
function bul(anahtar, n) {
  for (const s of [sozluk, en, tr]) {
    if (!(anahtar in s)) continue;
    if (n != null && cogul) {
      const ek = s[`${anahtar}#${cogul.select(n)}`];
      if (ek != null) return ek;
    }
    return s[anahtar];
  }
  return null;
}

/**
 * Anahtara karşılık gelen metni döndürür: t('plan.arac.baslik'), t('urunler.sayi', { n: 4 }).
 * {ad} gibi yer tutucular doldurulur; sayılar dilin biçimiyle yazılır. n sayıysa çoğul biçimi seçilir.
 * Bulunamazsa anahtarın kendisi döner, böylece eksik metin ekranda fark edilir.
 */
export function t(anahtar, degerler) {
  const n = degerler && typeof degerler.n === 'number' ? degerler.n : null;
  const deger = bul(anahtar, n);
  if (deger == null) {
    console.warn('Eksik metin:', anahtar);
    return anahtar;
  }
  if (!degerler) return deger;
  return String(deger).replace(/\{(\w+)\}/g, (butun, ad) => {
    if (!(ad in degerler)) return butun;
    const v = degerler[ad];
    return typeof v === 'number' && sayiBicimi ? sayiBicimi.format(v) : String(v);
  });
}

/** Anahtar varsa metni, yoksa null döner (uyarı yazmaz); ör. katalogdaki serbest alt kategori adları için. */
export function tVarsa(anahtar) {
  const v = bul(anahtar, null);
  return v == null ? null : String(v);
}

/** "|" ile ayrılmış liste metni: tListe('excel.evet') → ['evet', 'e', …] */
export function tListe(anahtar) {
  return t(anahtar).split('|').map((s) => s.trim()).filter(Boolean);
}

/** Aynı anahtarın etkin dildeki, İngilizce ve Türkçe listelerinin birleşimi (Excel'de esnek eşleme için). */
export function tListeHepsi(anahtar) {
  const liste = new Set(tListe(anahtar));
  for (const s of [en, tr]) {
    if (s[anahtar]) String(s[anahtar]).split('|').map((x) => x.trim()).filter(Boolean).forEach((x) => liste.add(x));
  }
  return [...liste];
}
