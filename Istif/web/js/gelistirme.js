// Yalnız geliştirme: web/gelistirme.html bu dosyayı yükler. Adresteki ?dene=... arayüzü ekran görüntüsü
// için belli bir duruma getirir (düğmelere tıklar). ?dil=en, ?tema=acik, ?birim=imperial tarayıcı hafızasındaki
// ayarı açılıştan önce değiştirir. Bu dosya ve gelistirme.html derleme çıktısına ve dağıtıma girmez (Istif.csproj).
import { ornekAc } from './eylemler.js';
import { durum, kalemDuzelt, planDegisti, yeniId } from './durum.js';
import { eslemeAc, excelAl, ornekKitap } from './excel.js';
import { hazirArac, plandaArac } from './veri.js';
import { git } from './yonlendirici.js';

const parametre = new URLSearchParams(location.search);
const dene = parametre.get('dene');

// Ayarlar uygulama açılmadan yazılır (modüller sırayla çalışır: bu dosya uygulama.js'den önce)
{
  const anahtar = 'istif.ayarlar';
  let ayar = {};
  try {
    ayar = JSON.parse(localStorage.getItem(anahtar) || '{}');
  } catch {
    ayar = {};
  }
  for (const ad of ['dil', 'tema', 'birim']) if (parametre.get(ad)) ayar[ad] = parametre.get(ad);
  localStorage.setItem(anahtar, JSON.stringify(ayar));
  // Her açılış temiz başlasın: kalan taslak sorusu ekran görüntüsünü kapatmasın
  localStorage.removeItem('istif.taslak');
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const tikla = (secici) => document.querySelector(secici)?.click();
const alanaYaz = (secici, deger) => {
  const g = document.querySelector(secici);
  if (!g) return;
  g.value = deger;
  g.dispatchEvent(new Event('input', { bubbles: true }));
};

// Worker dosyası bulunamazsa hata kutusu: motor yerine var olmayan bir dosya istenir
if (dene === 'motoryok') {
  const Asil = window.Worker;
  window.Worker = class extends Asil {
    constructor(adres, secenek) {
      super(String(adres).replace('/motor/isci.js', '/motor/yok.js'), secenek);
    }
  };
}

function plandaEkle(kalemler) {
  kalemler.forEach((k) => durum.plan.kalemler.push(kalemDuzelt({ ...k, id: yeniId('k') })));
  planDegisti('kalem');
}

const planla = () => document.dispatchEvent(new CustomEvent('istif:planla'));

async function calistir(ad) {
  switch (ad) {
    case 'gercek': // örnek yük gerçek motorla
    case 'motoryok':
      await ornekAc({ planla: true });
      break;
    case 'palet':
    case 'koli':
    case 'konteyner':
      await ornekAc({ ad, planla: true });
      break;
    case 'arac2':
      await bekle(5000);
      tikla('.arac-sekme[data-i="1"]');
      break;
    case 'yandan':
    case 'ustten':
    case 'arkadan':
      await bekle(5000);
      tikla(`[data-gorunum="${ad}"]`);
      break;
    case 'adim':
      await bekle(5000);
      tikla('[data-oynat="basa"]');
      for (let i = 0; i < 3; i += 1) {
        await bekle(200);
        tikla('[data-oynat="sonraki"]');
      }
      break;
    case 'secim':
      await bekle(5000);
      tikla('tbody tr[data-sira="2"]');
      break;
    case 'kalem':
      await bekle(1200);
      tikla('.kalem[data-id="k2"]');
      break;
    case 'urunsec':
      await bekle(1200);
      tikla('[data-eylem="urundenEkle"]');
      break;
    case 'aracmenu':
      await bekle(1200);
      tikla('.arac-secici-dugme');
      break;
    case 'kapipayi': // kapı payı alanına 50 cm yazılır, gerçek motorla planlanır
    case 'hata': // motorun reddedeceği girdi: kapı payı araç boyundan uzun
      await ornekAc();
      await bekle(800);
      alanaYaz('.arac-alanlari [name="kapiPayi"]', ad === 'hata' ? '2000' : '50');
      await bekle(300);
      planla();
      if (ad === 'kapipayi') {
        await bekle(6000);
        tikla('[data-gorunum="ustten"]');
      }
      break;
    case 'excelgiris': // "Excel'den al" giriş penceresi
      await bekle(800);
      excelAl({ ekle: plandaEkle });
      break;
    case 'excel': // örnek çalışma kitabıyla eşleme penceresi (bir satır hatalı)
      await bekle(800);
      eslemeAc({ ad: 'sevkiyat-listesi.xlsx', base64: await ornekKitap(), ekle: plandaEkle });
      break;
    case 'raporuzun': { // uzun yükleme sırası tablosu: rapor sayfaya bölünür mü, başlık tekrar eder mi
      await ornekAc();
      durum.plan.kalemler = [kalemDuzelt({ id: 'k1', ad: 'Koli', uzunluk: 600, en: 400, yukseklik: 400, agirlik: 15, adet: 90, renk: '#C9CED6' })];
      planDegisti('kalem');
      planla();
      await bekle(5000);
      const { raporKur } = await import('./rapor.js');
      raporKur(durum.plan, []);
      break;
    }
    case 'ayarlar':
      await bekle(300);
      git('ayarlar');
      break;
    case 'katalog': // Araçlar ekranının Gelişmiş sekmesi, panelvanlar süzülmüş
      await bekle(300);
      git('araclar');
      await bekle(500);
      window.istifEkranlari.araclar.sekmeSec('katalog');
      await bekle(200);
      document.querySelector('.katalog [data-suzgec="kategori"]').value = 'panelvan';
      document.querySelector('.katalog [data-suzgec="kategori"]').dispatchEvent(new Event('change'));
      document.querySelector('.katalog-ayrinti')?.setAttribute('open', '');
      break;
    case 'filo': { // örnek yük, Standart Tır + filoda 20' konteyner ve panelvan, en uygun araç seçimi
      await ornekAc();
      await bekle(400);
      const ek = ['konteyner-20', 'panelvan'].map((id) => hazirArac(id)).filter(Boolean).map(plandaArac);
      durum.plan.filo.push(...ek);
      durum.plan.filoSecimi = 'enUygun';
      planDegisti('arac');
      window.istifEkranlari.plan.goster();
      await bekle(300);
      planla();
      await bekle(5500);
      document.querySelector('.filo')?.scrollIntoView({ block: 'center' });
      break;
    }
    case 'yakinlik': // örnek yük, yakınlaştırılmış görünüm ve seçili parça
      await ornekAc({ planla: true });
      await bekle(6000);
      window.istifEkranlari.plan.gorunum()?.odaklan(2);
      break;
    case 'agirlik': { // aks bilgisi girilmiş tır: ağırlık dağılımı şeridi ve aks payları
      await ornekAc();
      await bekle(400);
      durum.plan.arac.aks = { sasiMesafe: 1690, aksMerkezi: 9400 };
      planDegisti('arac');
      window.istifEkranlari.plan.goster();
      await bekle(300);
      planla();
      break;
    }
    default:
      break;
  }
}

function basla() {
  if (dene) calistir(dene).catch((e) => console.error('dene', e));
}

if (document.documentElement.dataset.hazir === '1') basla();
else document.addEventListener('istif:hazir', basla, { once: true });
