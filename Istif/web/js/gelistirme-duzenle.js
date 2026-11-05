// Yalnız Debug: kabuk --duzenle-dene "klasör" ile açılınca elle düzenleme senaryosunu gerçek pencerede oynatır.
// Olaylar 3B tuvaline ve belgeye gönderilir (PointerEvent, KeyboardEvent); düzenleyicinin kendi işleyicileri çalışır.
// Adımlar: düzenleme kipi, seçim, Ctrl ile çoklu seçim, istifi birlikte seçme, sürükleme (hayalet ve canlı ölçü),
// çakışma (kırmızı), geri al / yinele, R ile döndürme, ok tuşları, Page Up, yaslama, kayıt ve açma döngüsü,
// Planla sorusu, PDF, otomatik plana dönüş; konteyner örneğinde T ile yana yatırma, Shift ile alan seçimi,
// seçimsiz yaslama. Her adımın görüntüsü klasöre yazılır (köprünün Debug'a özel goruntuAl isteği). Sonunda denetim
// listesi ekrana basılır ve o da görüntülenir. Bu dosya Release çıktısına ve dağıtıma girmez (Istif.csproj).
import { istek } from './kopru.js';
import { ornekAc } from './eylemler.js';
import { durum, planJson, plandanOku, planiAc, geriAl, yinele, geriAlinabilir } from './durum.js';
import { parcaAnahtari } from './duzenleme-hesap.js';
import { animasyonAyarla } from './hareket.js';
import { git } from './yonlendirici.js';

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

export async function duzenleDene({ klasor, ekranlar }) {
  const plan = ekranlar.plan;
  const g = () => plan.gorunum();
  const dz = () => plan.duzenleme;
  const sonuclar = [];
  const dene = (ad, kosul, ayrinti = '') => sonuclar.push({ ad, ok: !!kosul, ayrinti: String(ayrinti) });
  addEventListener('error', (e) => dene('betik hatası', false, e.message));
  addEventListener('unhandledrejection', (e) => dene('söz hatası', false, e.reason && e.reason.message));

  const goruntu = async (ad) => {
    await bekle(80);
    try {
      await istek('goruntuAl', { ad });
    } catch (e) {
      dene('görüntü ' + ad, false, e.message);
    }
  };
  const kosulBekle = async (fn, ms = 8000) => {
    const bas = performance.now();
    while (performance.now() - bas < ms) {
      try {
        if (fn()) return true;
      } catch {
        /* henüz hazır değil */
      }
      await bekle(50);
    }
    return false;
  };
  const diyalogDugmesi = async (secici) => {
    await kosulBekle(() => document.querySelector('.perde ' + secici), 3000);
    document.querySelector('.perde ' + secici)?.click();
    await bekle(250);
  };

  // ---- 3B olayları
  const tuval = () => g().renderer.domElement;
  const ekranda = (v) => {
    const w = v.clone().project(g().kamera);
    const r = tuval().getBoundingClientRect();
    return { x: r.left + ((w.x + 1) / 2) * r.width, y: r.top + ((1 - w.y) / 2) * r.height };
  };
  const parca = (anahtar) => g().parcalar.find((p) => p.anahtar === anahtar);
  /** Parçanın ekranda görünen, ışının gerçekten ona çarptığı bir noktası (üst yüz, sonra yan yüzler) */
  const nokta = (anahtar) => {
    const p = parca(anahtar);
    const b = p.boy;
    const adaylar = [
      [0, b.y / 2 - 0.01, 0], [b.x * 0.3, b.y / 2 - 0.01, b.z * 0.3], [-b.x * 0.3, b.y / 2 - 0.01, -b.z * 0.3],
      [b.x / 2 - 0.01, 0, 0], [0, 0, b.z / 2 - 0.01], [b.x / 2 - 0.01, -b.y * 0.3, b.z * 0.3], [0, -b.y * 0.3, b.z / 2 - 0.01],
      [b.x / 2 - 0.01, -b.y * 0.3, -b.z * 0.3], [b.x / 2 - 0.01, b.y * 0.3, 0],
    ];
    let ilk = null;
    for (const [ax, ay, az] of adaylar) {
      const v = p.hedef.clone();
      v.x += ax;
      v.y += ay;
      v.z += az;
      const n = ekranda(v);
      ilk = ilk || n;
      const vurus = g()._vurus({ clientX: n.x, clientY: n.y });
      if (vurus && vurus.p === p) return n;
    }
    dene('görünür nokta ' + anahtar, false, 'ışın çarpmadı');
    return ilk;
  };
  /** Sürüklemenin bitiş noktası: başlangıçta tutulan noktanın dünyada d (m) kaymış hâli */
  const kaymis = (anahtar, n, d) => {
    const v = g()._vurus({ clientX: n.x, clientY: n.y });
    const w = v ? v.nokta.clone() : parca(anahtar).hedef.clone();
    w.x += d.x || 0;
    w.y += d.y || 0;
    w.z += d.z || 0;
    return ekranda(w);
  };
  const olay = (tur, x, y, s = {}) => tuval().dispatchEvent(new PointerEvent(tur, {
    clientX: x, clientY: y, button: 0, buttons: s.basili ? 1 : 0, pointerId: 7, pointerType: 'mouse', isPrimary: true,
    bubbles: true, cancelable: true, composed: true, altKey: !!s.alt, ctrlKey: !!s.ctrl, shiftKey: !!s.shift,
  }));
  const tikla = async (n, s = {}) => {
    olay('pointerdown', n.x, n.y, { ...s, basili: true });
    await bekle(40);
    olay('pointerup', n.x, n.y, s);
    await bekle(160);
  };
  const surukle = async (a, b, { adim = 16, ara = 22, alt = false, shift = false, ortada = null } = {}) => {
    olay('pointerdown', a.x, a.y, { basili: true, alt, shift });
    for (let i = 1; i <= adim; i += 1) {
      const k = i / adim;
      olay('pointermove', a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, { basili: true, alt, shift });
      await bekle(ara);
      if (ortada && i === Math.round(adim * 0.75)) {
        await bekle(160);
        await ortada();
      }
    }
    olay('pointerup', b.x, b.y, { alt, shift });
  };
  const tus = async (key, s = {}) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, shiftKey: !!s.shift, ctrlKey: !!s.ctrl }));
    await bekle(s.bekle ?? 120);
  };
  // Senaryo iki örnekte de 1. araçta çalışır
  const yerlesim = () => durum.plan.sonuc.araclar[0].yerlesimler;
  const yer = (anahtar) => yerlesim().find((y) => parcaAnahtari(y) === anahtar);
  const ustundekiVar = (a) => yerlesim().some((b) => b !== a && b.y === a.y + a.yukseklik
    && b.x < a.x + a.en && a.x < b.x + b.en && b.z < a.z + a.uzunluk && a.z < b.z + b.uzunluk);
  const secim = () => [...g().seciliAnahtarlar];
  const dugme = (secici) => document.querySelector(secici);
  const W = () => durum.plan.sonuc.araclar[0].en;

  // ---------------------------------------------------------------- A: tarım makineleri, 1. araç
  await bekle(1200);
  document.querySelectorAll('.perde .diyalog-kapat').forEach((d) => d.click()); // kalan taslak sorusu
  await ornekAc({ planla: true });
  dene('örnek planlandı', await kosulBekle(() => durum.plan && durum.plan.sonuc && durum.plan.sonuc.araclar.length >= 1, 15000));
  await kosulBekle(() => g() && g().parcalar.length > 0, 6000);
  await bekle(3800);

  dene('Düzenle anahtarı görünür', !dugme('.duzenle-anahtar').hidden);
  dugme('.duzenle-anahtar').click();
  await bekle(800);
  dene('düzenleme kipi açıldı', dz().acik() && !dugme('.duzen-cubugu').hidden);
  dene('kalan boşluk kartı (bütün yük)', /Bütün yük|Whole load/.test(dugme('.bosluk-kart')?.textContent || ''), dugme('.bosluk-kart')?.textContent.replace(/\s+/g, ' ').slice(0, 160));
  dene('3B ölçü çizgileri var', !!g().olcu && g().olcu.levhalar.length >= 2, g().olcu?.levhalar.length);
  await goruntu('4x-01-duzenle-butun-yuk');

  // Hedefler: üstünde parça olmayan bir ilaçlama makinesi (tek), istifli gübre makinesi
  const ilac = yerlesim().filter((y) => y.kalemId === 'k2').map(parcaAnahtari);
  const tek = ilac.slice().sort((a, b) => yer(b).z - yer(a).z)[0]; // kapıya en yakın
  const gubre = 'k1|1';
  const gubreIstifli = ustundekiVar(yer(gubre));

  // Seçim
  await tikla(nokta(tek));
  await bekle(350);
  dene('tıkla: seçildi', secim().length === 1 && secim()[0] === tek, secim().join());
  dene('tablo satırı eş', dugme(`tbody tr[data-anahtar="${tek}"]`)?.classList.contains('secili'));
  const tD = dugme('[data-dondur="T"]');
  dene('dik kalemde T kapalı, nedeni yazıyor', tD.getAttribute('aria-disabled') === 'true' && /dik|upright/.test(tD.title), tD.title);
  dene('dik kalemde R açık', dugme('[data-dondur="R"]').getAttribute('aria-disabled') === 'false');
  await goruntu('4x-02-secim-olcu');

  // Ctrl ile çoklu seçim
  const ikinci = ilac.find((k) => k !== tek);
  await tikla(nokta(ikinci), { ctrl: true });
  await bekle(350);
  dene('Ctrl+tık: seçime eklendi', secim().length === 2, secim().join());
  dene('panel: seçim 2 parça', /2/.test(dugme('.bosluk-kart .bosluk-kapsam')?.textContent || ''), dugme('.bosluk-kart .bosluk-kapsam')?.textContent);
  await goruntu('4x-03-coklu-secim');
  await tikla(nokta(ikinci), { ctrl: true });
  dene('Ctrl+tık: seçimden çıktı', secim().length === 1, secim().join());
  await tus('Escape');
  dene('Esc: seçim bırakıldı', secim().length === 0);

  // İstifi birlikte seç: gübre makinesine basınca üstündeki diskarolar da seçilir; yaslayınca birlikte gider
  if (gubreIstifli) {
    await tikla(nokta(gubre));
    await bekle(400);
    dene('istif birlikte seçildi', secim().length >= 2 && secim().includes(gubre), secim().join());
    await goruntu('4x-04-istif-secimi');
    const ust0 = secim().filter((k) => k !== gubre).map((k) => ({ k, x: yer(k).x }));
    const gx0 = yer(gubre).x;
    dugme('[data-yasla="sol"]').click();
    await bekle(900);
    const dx = yer(gubre).x - gx0;
    dene('istif birlikte yaslandı', dx !== 0 && ust0.every((u) => yer(u.k).x - u.x === dx), `dx ${dx}`);
    geriAl();
    await bekle(700);
    await tus('Escape');
  } else dene('örnekte istif yok', true, 'gübre makinesinin üstü boş');

  // Sürükleme: tek ilaçlama makinesi 50 cm sağa → sağ duvara dayanır
  const s0 = { ...yer(tek) };
  const bas = nokta(tek);
  await tikla(bas);
  await surukle(bas, kaymis(tek, bas, { x: 0.5 }), {
    ortada: async () => {
      dene('sürüklerken hayalet kutu', g().hayalet && g().hayalet.visible);
      await goruntu('4x-05-surukleme');
    },
  });
  await bekle(800);
  const s1 = yer(tek);
  dene('sürükle: x değişti, z aynı', s1.x !== s0.x && s1.z === s0.z, `${s0.x} → ${s1.x}`);
  dene('sürükle: sağ duvara dayandı', s1.x + s1.en === W(), `${s1.x}+${s1.en}`);
  dene('elle düzenlendi işareti', durum.plan.elleDuzenlendi === true && !!durum.plan.otomatikSonuc);
  dene('üst bilgi: Elle düzenlendi', !dugme('.plan-elle').hidden);
  dene('geri alınabilir', geriAlinabilir());

  // Çakışma: orta ilaçlama makinesi öne doğru 1,5 m (komşusunun içine)
  const orta = ilac.slice().sort((a, b) => yer(a).z - yer(b).z)[1];
  const o0 = { ...yer(orta) };
  const ob = nokta(orta);
  await tikla(ob);
  await surukle(ob, kaymis(orta, ob, { z: -1.5 }));
  await bekle(1000);
  const hata = dz().hataSayisi();
  dene('çakışma: hata sayıldı', hata > 0, hata);
  dene('çakışma: üst çubukta "Planda N hata var"', !dugme('.plan-hata').hidden, dugme('.plan-hata').textContent.trim());
  dene('çakışma: panelde çakışma cümlesi', /çakışıyor|Overlaps/.test(dugme('.ihlal-kutu')?.textContent || ''), dugme('.ihlal-kutu')?.textContent.replace(/\s+/g, ' ').slice(0, 140));
  // Renkler doğrusal uzayda: #F0616D ≈ (0,87, 0,12, 0,15)
  dene('çakışma: 3B kırmızı', g().parcalar.some((p) => p.govde.material.emissive.r > 0.8 && p.govde.material.emissive.g < 0.3 && p.govde.material.color.r > 2 * p.govde.material.color.b));
  dene('çakışma: tabloda Hata etiketi', !!dugme('tbody tr.hatali'));
  await goruntu('4x-06-hata-kirmizi');

  // Geri al / yinele
  geriAl();
  await bekle(900);
  dene('geri al: eski yerinde', yer(orta).z === o0.z, `${yer(orta).z} / ${o0.z}`);
  dene('geri al: hata kalktı', dz().hataSayisi() === 0 && dugme('.plan-hata').hidden);
  await goruntu('4x-07-geri-al');
  yinele();
  await bekle(800);
  dene('yinele: çakışma geri geldi', yer(orta).z !== o0.z && dz().hataSayisi() > 0);
  geriAl();
  await bekle(800);

  // Döndürme (R): ilaçlama makinesinin 3,45 m boyu enine sığmaz → taşma hatası
  await tus('Escape');
  await tikla(nokta(tek));
  const d0 = { ...yer(tek) };
  await tus('r', { bekle: 0 });
  await bekle(30);
  await goruntu('4x-08-dondurme-ara');
  await bekle(800);
  const d1 = yer(tek);
  dene('R: en ile uzunluk yer değişti', d1.en === d0.uzunluk && d1.uzunluk === d0.en && d1.yukseklik === d0.yukseklik, `${d0.en}×${d0.uzunluk} → ${d1.en}×${d1.uzunluk}`);
  dene('R: sığmayan dönüş hata verdi', dz().hataSayisi() > 0 && /taşıyor|Sticks out/.test(dugme('.ihlal-kutu')?.textContent || ''));
  await goruntu('4x-09-dondurme-tasma');
  geriAl();
  await bekle(800);
  dene('R geri alındı', yer(tek).en === d0.en);

  // Ok tuşları ve Page Up / Yere indir
  await tikla(nokta(tek));
  const k0 = { ...yer(tek) };
  await tus('ArrowLeft');
  await tus('ArrowLeft');
  await bekle(450);
  const k1 = yer(tek);
  const kayma = Math.abs(k1.x - k0.x) + Math.abs(k1.z - k0.z);
  dene('ok tuşu: iki adım (10 cm) kaydı', kayma === 100 || (kayma > 0 && kayma < 100), `${k0.x},${k0.z} → ${k1.x},${k1.z}`);
  await tus('PageUp', { shift: true });
  await bekle(600);
  dene('Shift+PageUp: 50 cm yükseldi, havada hatası', yer(tek).y === 500 && dz().hataSayisi() > 0, yer(tek).y);
  dugme('[data-yasla="asagi"]').click();
  await bekle(900);
  dene('Yere indir', yer(tek).y === 0, yer(tek).y);

  // Yaslama: sol duvara
  dugme('[data-yasla="sol"]').click();
  await bekle(170);
  await goruntu('4x-10-yaslama-ara');
  await bekle(800);
  dene('Sol duvara yasla', yer(tek).x === 0, yer(tek).x);
  await goruntu('4x-11-yaslama');

  // Kayıt ve açma döngüsü (dosya biçimiyle; diske yazmadan)
  const imza = (a) => JSON.stringify(a.yerlesimler.map((y) => [parcaAnahtari(y), y.x, y.y, y.z, y.en, y.yukseklik, y.uzunluk]).sort());
  const once = imza(durum.plan.sonuc.araclar[0]);
  const json = planJson(durum.plan);
  const okunan = plandanOku(json);
  dene('kayıt: elleDuzenlendi ve otomatikSonuc dosyada', okunan.elleDuzenlendi === true && !!okunan.otomatikSonuc);
  planiAc(okunan, { yol: null, kaydedilmemis: true });
  await bekle(1900);
  dene('açma: yerleşim aynen geldi', once === imza(durum.plan.sonuc.araclar[0]));
  dene('açma: Elle düzenlendi işareti', !dugme('.plan-elle').hidden);
  await goruntu('4x-12-kayit-acildi');

  // Planla sorusu
  if (!dz().acik()) dugme('.duzenle-anahtar').click();
  await bekle(300);
  const p0 = durum.plan.sonuc;
  plan.planla();
  await kosulBekle(() => document.querySelector('.perde'), 3000);
  dene('Planla: soru soruldu', /kaybolacak|will be lost/.test(document.querySelector('.perde')?.textContent || ''));
  await goruntu('4x-13-planla-sorusu');
  await diyalogDugmesi('.dugme--ikincil');
  dene('Planla: vazgeçince sonuç yerinde', durum.plan.sonuc === p0 && durum.plan.elleDuzenlendi);

  // Hatalı planın PDF'i (tek parça havada)
  await tikla(nokta(tek));
  await tus('PageUp', { shift: true });
  await bekle(700);
  try {
    const yol = await plan.pdf({ yol: klasor + '\\4x-pdf.pdf', sor: false });
    dene('PDF basıldı (hatalı plan)', !!yol, yol);
  } catch (e) {
    dene('PDF basıldı (hatalı plan)', false, e.message);
  }
  await bekle(700);

  // Otomatik plana dön ve geri al
  dugme('[data-duzen="otomatik"]').click();
  await bekle(1000);
  const oto = imza(durum.plan.otomatikSonuc.araclar[0]);
  dene('Otomatik plana dön', !durum.plan.elleDuzenlendi && oto === imza(durum.plan.sonuc.araclar[0]) && dz().hataSayisi() === 0);
  geriAl();
  await bekle(800);
  dene('Otomatik dönüş geri alınabilir', durum.plan.elleDuzenlendi === true);

  // ---------------------------------------------------------------- B: konteyner örneği (serbest koliler)
  const acilis = ornekAc({ ad: 'konteyner', planla: true });
  await diyalogDugmesi('.dugme--tehlike'); // kaydedilmemiş değişiklik sorusu
  await acilis;
  dene('konteyner planlandı', await kosulBekle(() => durum.plan.sonuc && durum.plan.kalemler.length === 3, 15000));
  await kosulBekle(() => g().parcalar.length > 40, 6000);
  await bekle(4300);
  if (!dz().acik()) dugme('.duzenle-anahtar').click();
  await bekle(600);

  // T: en üstteki serbest koli yana yatar
  const koli = yerlesim().filter((y) => y.kalemId === 'k3' && !ustundekiVar(y)).sort((a, b) => b.y - a.y || b.z - a.z)[0];
  const ka = parcaAnahtari(koli);
  await tikla(nokta(ka));
  dene('serbest kolide T ve Y açık', dugme('[data-dondur="T"]').getAttribute('aria-disabled') === 'false' && dugme('[data-dondur="Y"]').getAttribute('aria-disabled') === 'false');
  const t0 = { ...koli };
  await tus('t', { bekle: 0 });
  await bekle(30);
  await goruntu('4x-14-yana-yatir-ara');
  await bekle(800);
  const t1 = yer(ka);
  dene('T: en ile yükseklik yer değişti', t1.en === t0.yukseklik && t1.yukseklik === t0.en, `${t0.en}×${t0.yukseklik} → ${t1.en}×${t1.yukseklik}`);
  await goruntu('4x-15-yana-yatir');
  await tus('y', { bekle: 0 });
  await bekle(800);
  const t2 = yer(ka);
  dene('Y: yükseklik ile uzunluk yer değişti', t2.yukseklik === t1.uzunluk && t2.uzunluk === t1.yukseklik, `${t1.yukseklik}×${t1.uzunluk} → ${t2.yukseklik}×${t2.uzunluk}`);

  // Animasyon ölçümü: çizim karelerinde ara değer görülmeli (dönüş açısı, kayma konumu)
  const ornekle = async (fn, ms = 520) => {
    const d = [];
    const bas = performance.now();
    while (performance.now() - bas < ms) {
      d.push(fn());
      await new Promise((r2) => requestAnimationFrame(r2));
    }
    return d;
  };
  const aci = () => {
    const q = parca(ka).grup.quaternion;
    return 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  };
  // Animasyon ayarı (Ayarlar > Animasyonlar): ölçüm "Açık" ile, sonra "Kapalı" ve "Sistem"; kayıtlı ayar değişmez
  const sistemAz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const kayitliAnim = durum.ayarlar.animasyon;
  dene(`bilgi: animasyon ayarı "${kayitliAnim}", Windows'ta animasyonlar ${sistemAz ? 'kapalı' : 'açık'}`, true);
  animasyonAyarla('acik');
  dene('Açık: sistem kapalı olsa da animasyon var', !g().azHareket && !document.documentElement.classList.contains('az-hareket'));
  tus('t', { bekle: 0 });
  const araFoto = goruntu('4x-14b-dondurme-animasyon');
  const acilar = await ornekle(aci);
  await araFoto;
  const araAci = acilar.filter((x) => x > 0.15 && x < 1.42).length;
  dene('dönüş animasyonu: ara açılar çizildi', araAci >= 3, `${araAci} kare, en büyük ${Math.max(...acilar).toFixed(2)} rad`);
  await bekle(300);
  const kx0 = parca(ka).grup.position.x;
  // Sağ duvara dayalıysa önce sola, sonra sağa (her iki yönde de yol olsun)
  const [yon1, yon2] = yer(ka).x + yer(ka).en >= W() - 10 ? ['sol', 'sag'] : ['sag', 'sol'];
  dugme(`[data-yasla="${yon1}"]`).click();
  const xler = await ornekle(() => parca(ka).grup.position.x);
  const kx1 = parca(ka).grup.position.x;
  const araX = xler.filter((x) => Math.abs(x - kx0) > 0.005 && Math.abs(x - kx1) > 0.005).length;
  dene('yaslama animasyonu: kayarak gitti', kx1 !== kx0 && araX >= 2, `${araX} ara kare, ${kx0.toFixed(3)} → ${kx1.toFixed(3)} m`);
  // Kapalı: CSS sınıfı konur, parça anında yerine gider
  animasyonAyarla('kapali');
  dene('Kapalı: html.az-hareket ve 3B animasyonsuz', g().azHareket && document.documentElement.classList.contains('az-hareket'));
  dugme(`[data-yasla="${yon2}"]`).click();
  const xler2 = await ornekle(() => parca(ka).grup.position.x, 400);
  const son2 = parca(ka).grup.position.x;
  const ara2 = xler2.filter((x) => Math.abs(x - kx1) > 0.005 && Math.abs(x - son2) > 0.005).length;
  dene('Kapalı: yaslama anında, ara kare yok', son2 !== kx1 && ara2 === 0, `${ara2} ara kare`);
  animasyonAyarla('sistem');
  dene('Sistem: Windows ayarını izler', g().azHareket === sistemAz && document.documentElement.classList.contains('az-hareket') === sistemAz);
  animasyonAyarla(kayitliAnim);

  // Shift ile alan seçimi
  await tus('Escape');
  const r = tuval().getBoundingClientRect();
  const a = { x: r.left + r.width * 0.36, y: r.top + r.height * 0.36 };
  const b = { x: r.left + r.width * 0.6, y: r.top + r.height * 0.66 };
  await surukle(a, b, { shift: true, ortada: async () => goruntu('4x-16-alan-secimi-ara') });
  await bekle(450);
  dene('Shift+sürükle: alan seçimi', secim().length > 1, secim().length);
  await goruntu('4x-17-alan-secimi');

  // Seçimsiz yaslama: bütün yük kapıya, sonra "Boşluğu kapat" ile öne
  await tus('Escape');
  dugme('[data-yasla="arka"]').click();
  await bekle(1000);
  const a0 = durum.plan.sonuc.araclar[0];
  const enArka = Math.max(...a0.yerlesimler.map((y) => y.z + y.uzunluk));
  dene('seçimsiz arkaya yasla: yük kapıya dayandı', enArka === a0.uzunluk - (a0.kapiPayiMm || 0), enArka);
  await goruntu('4x-18-kapiya-yaslandi');
  dugme('[data-duzen="bosluk"]').click();
  await bekle(1000);
  const enOn = Math.min(...durum.plan.sonuc.araclar[0].yerlesimler.map((y) => y.z));
  dene('Boşluğu kapat: yük öne dayandı', enOn === 0, enOn);
  await goruntu('4x-19-bosluk-kapat');

  // ---------------------------------------------------------------- Ayarlar > Animasyonlar
  git('ayarlar');
  await bekle(900);
  const secili = document.querySelector('.ekran-ayarlar input[name="animasyon"]:checked');
  dene('Ayarlar: Animasyonlar seçimi, kayıtlı ayar işaretli', !!secili && secili.value === durum.ayarlar.animasyon, secili?.value);
  dene('Ayarlar: üç seçenek (Açık / Sistem / Kapalı)', document.querySelectorAll('.ekran-ayarlar input[name="animasyon"]').length === 3);
  await goruntu('4x-18-ayarlar-animasyon');

  // ---------------------------------------------------------------- sonuç
  const kap = document.createElement('div');
  kap.style.cssText = 'position:fixed;inset:16px;z-index:9999;overflow:auto;padding:14px 18px;background:#0b1226;color:#e9edf3;font:12px/1.4 Segoe UI;border:1px solid #3abff0;border-radius:12px;column-count:2;column-gap:28px';
  const gecen = sonuclar.filter((s) => s.ok).length;
  kap.innerHTML = `<h2 style="margin:0 0 8px;column-span:all">Düzenleme denemesi: ${gecen} / ${sonuclar.length} geçti</h2>`
    + sonuclar.map((s) => `<div style="break-inside:avoid;color:${s.ok ? '#35c48a' : '#f0616d'}">${s.ok ? 'GEÇTİ' : 'KALDI'} · ${s.ad}${s.ayrinti ? ` <span style="color:#7e8899">(${s.ayrinti.replace(/</g, '&lt;').slice(0, 120)})</span>` : ''}</div>`).join('');
  document.body.appendChild(kap);
  await goruntu('dene-sonuc');
  await bekle(200);
}
