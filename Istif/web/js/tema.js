// Tema: koyu, açık ya da sistem (Windows'un uygulama temasını izler).
// Etkin tema html[data-tema="koyu|acik"] ile CSS'e, temaDinle() ile 3B görünüme iletilir.
const sorgu = matchMedia('(prefers-color-scheme: light)');
const dinleyiciler = new Set();
let ayar = 'sistem';

export const TEMALAR = ['sistem', 'koyu', 'acik'];

/** "acik" ya da "koyu" */
export const etkinTema = () => (ayar === 'acik' || (ayar === 'sistem' && sorgu.matches) ? 'acik' : 'koyu');

function uygula() {
  const tema = etkinTema();
  const kok = document.documentElement;
  if (kok.dataset.tema === tema) return;
  // Geçiş sırasında renk animasyonları kapalı; her şey aynı karede değişsin
  kok.classList.add('tema-gecisi');
  kok.dataset.tema = tema;
  kok.style.colorScheme = tema === 'acik' ? 'light' : 'dark';
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', tema === 'acik' ? 'light' : 'dark');
  dinleyiciler.forEach((fn) => fn(tema));
  requestAnimationFrame(() => requestAnimationFrame(() => kok.classList.remove('tema-gecisi')));
}

export function temaAyarla(yeni) {
  ayar = TEMALAR.includes(yeni) ? yeni : 'sistem';
  uygula();
}

/** Etkin tema değişince çağrılır: fn("acik" | "koyu"). Bırakma işlevi döner. */
export function temaDinle(fn) {
  dinleyiciler.add(fn);
  return () => dinleyiciler.delete(fn);
}

sorgu.addEventListener('change', () => {
  if (ayar === 'sistem') uygula();
});
