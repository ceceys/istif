// 3B görünüm: araç, yük parçaları, kamera görünümleri, yakınlaştırma, adım adım yükleme, seçim ve ipucu.
// Parçalar sırayla düşer ve hafifçe sekerek oturur. Ayarlar > Animasyonlar kapalıysa (ya da "Sistem" seçiliyken
// Windows'ta animasyonlar kapalıysa) animasyonsuz çalışır.
// Açık temada zemin ızgarası, çizgiler ve yazılar açık zeminde okunur renklere geçer.
// Elle düzenleme kipinde: çoklu seçim, sürükleme (taban düzleminde, Alt ile yükseklikte), Shift ile alan seçimi,
// konuma süzülme ve 90° dönüş animasyonları, hatalı parçanın kırmızı yanması, kalan boşluk ölçü çizgileri.
// Konum ve seçim hesabı ekranda değil, plan ekranındaki düzenleyicide yapılır; burası çizer ve olayları bildirir.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { aracModeliKur } from './arac-modeli.js';
import { ustYuzDokusu, ustYuzBirak, yaziDokusu, isikHavuzuDokusu } from './dokular.js';
import { metre, kg } from '../bicim.js';
import { t } from '../dil.js';
import { parcaAnahtari, donusEkseni } from '../duzenleme-hesap.js';
import { azHareket } from '../hareket.js';

const MM = 0.001;
const VURGU = new THREE.Color(0x3abff0);
const KIRMIZI = new THREE.Color(0xf0616d);
const SARI_RENK = new THREE.Color(0xf2b441);
const SIYAH = new THREE.Color(0x000000);
const EKSENLER = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
/** Ölçü yazılarının ekrandaki yüksekliği (px) */
const OLCU_YAZI_PX = 23;

/** Yerleşimin (mm) merkezi, metre */
const merkezi = (y) => new THREE.Vector3((y.x + y.en / 2) * MM, (y.y + y.yukseklik / 2) * MM, (y.z + y.uzunluk / 2) * MM);
const koyuKenar = (renk) => renk.clone().multiplyScalar(0.42);

/** Kameradan hedefe değil, hedeften kameraya doğru birim yönler */
const YONLER = {
  izometrik: new THREE.Vector3(1.35, 0.8, 0.82).normalize(),
  yandan: new THREE.Vector3(1, 0.07, 0.0).normalize(),
  ustten: new THREE.Vector3(0.02, 1, 0).normalize(),
  arkadan: new THREE.Vector3(0.0, 0.2, 1).normalize(),
};

const kolay = {
  icDisKup: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  disKup: (k) => 1 - Math.pow(1 - k, 3),
  /** Yerçekimi gibi hızlanan iniş */
  icKare: (k) => k * k,
  /** Düşüş: hızlanarak iner, oturunca küçük bir sekme yapar */
  dusus: (k) => {
    const kirilma = 0.7;
    if (k < kirilma) {
      const u = k / kirilma;
      return u * u;
    }
    const u = (k - kirilma) / (1 - kirilma);
    return 1 - Math.sin(u * Math.PI) * 0.045 * (1 - u * 0.5);
  },
};


export class Gorunum3B {
  /**
   * @param kap   tuvalin yerleşeceği öğe
   * @param geri  { parcaTiklandi(anahtar|null, { ctrl }), ustunde(parca|null, x, y), adimDegisti(adim, toplam),
   *                oynatmaDegisti(bool), yakinlikDegisti(0..1),
   *                düzenleme kipinde: duzenleBasildi(anahtar, { ctrl }), duzenleSurukleBasla(), duzenleSurukle(dMm, { alt }),
   *                duzenleBirak(), duzenleTiklandi(anahtar, { ctrl }), duzenleIptal(basladiMi), alanSecildi(anahtarlar, { ctrl }) }
   * @param secenek { acikTema }
   */
  constructor(kap, geri = {}, { acikTema = false } = {}) {
    this.kap = kap;
    this.geri = geri;
    this.acikTema = acikTema;
    this.sonYakinlik = -1;
    this.parcalar = [];
    this.adim = 0;
    /** Odaktaki tek parça (düzenleme dışında seçilince ötekiler soluklaşır) */
    this.secili = null;
    /** Seçili parçalar (çoklu seçim) */
    this.secililer = new Set();
    this._secimAnahtarlari = new Set();
    this._odak = true;
    /** anahtar → 'hata' | 'uyari' */
    this._ihlalHaritasi = new Map();
    this.cerceveler = [];
    this.duzenleme = false;
    this.surukleme = null;
    this.alan = null;
    this._olcuDokulari = new Map();
    this._olcuBilgisi = null;
    this._sonIsaretler = null;
    this.ustteki = null;
    this.tweenler = [];
    this.kirli = true;
    this.etkin = true;
    this.girisYapildi = false;
    this.model = null;
    this.isaretler = null;
    this.gorunumAdi = 'izometrik';

    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x000000, 0);
    this.renderer = r;
    this.anizotropi = Math.min(8, r.capabilities.getMaxAnisotropy());
    r.domElement.classList.add('sahne-tuval');
    r.domElement.setAttribute('tabindex', '0');
    kap.appendChild(r.domElement);

    this.sahne = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.ortam = pmrem.fromScene(new RoomEnvironment(r), 0.04).texture;
    this.sahne.environment = this.ortam;
    pmrem.dispose();

    this.sahne.add(new THREE.HemisphereLight(0xcfe0ff, 0x0b1222, 0.6));
    const gunes = new THREE.DirectionalLight(0xffffff, 2.2);
    gunes.castShadow = true;
    gunes.shadow.mapSize.set(2048, 2048);
    gunes.shadow.bias = -0.0004;
    gunes.shadow.normalBias = 0.02;
    this.gunes = gunes;
    this.sahne.add(gunes, gunes.target);

    this.kamera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
    this.kamera.position.set(18, 12, 24);
    this.kontrol = new OrbitControls(this.kamera, r.domElement);
    this.kontrol.enableDamping = true;
    this.kontrol.dampingFactor = 0.085;
    this.kontrol.rotateSpeed = 0.7;
    this.kontrol.zoomSpeed = 0.9;
    this.kontrol.screenSpacePanning = true;
    this.kontrol.minDistance = 1.5;
    this.kontrol.maxDistance = 90;
    this.kontrol.maxPolarAngle = Math.PI * 0.49;

    this.zeminGrubu = new THREE.Group();
    this.aracGrubu = new THREE.Group();
    this.yukGrubu = new THREE.Group();
    /** Düzenleme çizimleri: ölçü çizgileri ve sürükleme hayaleti (rapor görüntüsünde gizlenir) */
    this.duzenGrubu = new THREE.Group();
    this.sahne.add(this.zeminGrubu, this.aracGrubu, this.yukGrubu, this.duzenGrubu);
    this.cerceveMat = new THREE.LineBasicMaterial({ color: VURGU, transparent: true, opacity: 1, depthTest: false });

    this.isin = new THREE.Raycaster();
    this.fare = new THREE.Vector2();
    this._olaylar();
    this._boyutla();
    this.gozlemci = new ResizeObserver(() => this._boyutla());
    this.gozlemci.observe(kap);
    this._dongu = this._dongu.bind(this);
    this.istek = requestAnimationFrame(this._dongu);
  }

  get azHareket() {
    return azHareket();
  }

  // ------------------------------------------------------------------ araç

  /** Araç modelini kurar. arac: { tur, en, yukseklik, uzunluk, aks, kapiPayiMm } (mm) */
  aracKur(arac) {
    const anahtar = JSON.stringify([arac.tur, arac.en, arac.yukseklik, arac.uzunluk, arac.aks, arac.kapiPayiMm]);
    if (this.model && this.modelAnahtar === anahtar) return;
    if (this.model) {
      this.aracGrubu.remove(this.model.grup);
      this.model.temizle();
    }
    this.model = aracModeliKur(arac, { anizotropi: this.anizotropi });
    this.model.zeminModu?.(this.acikTema);
    this.modelAnahtar = anahtar;
    this.aracGrubu.add(this.model.grup);
    this._zeminKur();
    this._isikAyarla();
    if (!this.girisYapildi) this._giris();
    else this.gorunum(this.gorunumAdi, { sure: 600 });
    this.kirli = true;
  }

  _zeminKur() {
    this.zeminGrubu.children.slice().forEach((c) => {
      this.zeminGrubu.remove(c);
      c.geometry?.dispose();
      c.material?.map?.dispose();
      c.material?.dispose();
    });
    const { W, L, zeminY } = this.model;
    const cx = W / 2;
    const cz = L / 2 - 1;
    const yaricap = Math.max(14, L / 2 + 9);

    const havuz = new THREE.Mesh(
      new THREE.PlaneGeometry(yaricap * 2.2, yaricap * 2.2),
      new THREE.MeshBasicMaterial({ map: isikHavuzuDokusu(), transparent: true, depthWrite: false, toneMapped: false })
    );
    havuz.rotation.x = -Math.PI / 2;
    havuz.position.set(cx, zeminY - 0.002, cz);
    havuz.name = 'havuz';
    havuz.visible = !this.acikTema;
    this.zeminGrubu.add(havuz);

    const golge = new THREE.Mesh(
      new THREE.PlaneGeometry(yaricap * 2.4, yaricap * 2.4),
      new THREE.ShadowMaterial({ color: 0x01040c, opacity: this.acikTema ? 0.22 : 0.42, depthWrite: false })
    );
    golge.rotation.x = -Math.PI / 2;
    golge.position.set(cx, zeminY + 0.001, cz);
    golge.receiveShadow = true;
    this.zeminGrubu.add(golge);

    // Soluk ızgara: merkezden uzaklaştıkça kaybolur (köşe başına renk + saydamlık)
    const konum = [];
    const renk = [];
    const r = Math.ceil(yaricap);
    const [ir, ig, ib, ia] = this.acikTema ? [0.24, 0.31, 0.45, 0.3] : [0.56, 0.66, 0.82, 0.22];
    const ekle = (x1, z1, x2, z2) => {
      const parca = 12;
      for (let i = 0; i < parca; i += 1) {
        const a = i / parca;
        const b = (i + 1) / parca;
        const ax = x1 + (x2 - x1) * a, az = z1 + (z2 - z1) * a;
        const bx = x1 + (x2 - x1) * b, bz = z1 + (z2 - z1) * b;
        for (const [x, z] of [[ax, az], [bx, bz]]) {
          const d = Math.hypot(x - cx, z - cz) / yaricap;
          const s = Math.max(0, 1 - d) ** 1.6 * ia;
          konum.push(x, zeminY + 0.003, z);
          renk.push(ir, ig, ib, s);
        }
      }
    };
    for (let i = -r; i <= r; i += 1) {
      ekle(cx + i, cz - r, cx + i, cz + r);
      ekle(cx - r, cz + i, cx + r, cz + i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(konum, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(renk, 4));
    const izgara = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    this.zeminGrubu.add(izgara);
  }

  _isikAyarla() {
    const s = this.model.sinir;
    const merkez = s.getCenter(new THREE.Vector3());
    const boyut = s.getSize(new THREE.Vector3());
    this.gunes.position.copy(merkez).add(new THREE.Vector3(6, 16, 9));
    this.gunes.target.position.copy(merkez);
    const yari = Math.max(boyut.x, boyut.z) / 2 + 3;
    const k = this.gunes.shadow.camera;
    k.left = -yari; k.right = yari; k.top = yari; k.bottom = -yari;
    k.near = 1; k.far = 60;
    k.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ yük

  /**
   * Parçaları kurar. yerlesimler sözleşmedeki biçimdedir (mm); her öğeye ayrıca
   * { etiket: kalem adı, ustuneKonabilir } eklenmiş olabilir.
   * animasyon: 'dusus' (sırayla düşer), 'hizli' (kısa düşüş) ya da 'yok'
   */
  yukleriKur(yerlesimler, { animasyon = 'dusus', isaretler = null } = {}) {
    this.durdur();
    this._tweenIptal('parca');
    this._tweenIptal('konum');
    this._tweenIptal('sars');
    this._parcalariTemizle();
    const sirali = [...yerlesimler].sort((a, b) => a.sira - b.sira);
    this._geoOnbellek = new Map();

    for (const y of sirali) {
      const geo = this._geometri(y);
      const renk = new THREE.Color(y.renk || '#3ABFF0');
      const govdeMat = new THREE.MeshStandardMaterial({ color: renk, metalness: 0.06, roughness: 0.52, envMapIntensity: 0.9 });
      const govde = new THREE.Mesh(geo.govde, govdeMat);
      govde.castShadow = true;
      govde.receiveShadow = true;

      const kenarMat = new THREE.LineBasicMaterial({ color: koyuKenar(renk), transparent: true, opacity: 0.9 });
      const kenar = new THREE.LineSegments(geo.kenar, kenarMat);

      const doku = this._ustDokusu(y);
      const ustMat = new THREE.MeshBasicMaterial({ map: doku, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const ust = new THREE.Mesh(geo.ust, ustMat);
      ust.position.y = (y.yukseklik * MM) / 2 + 0.002;

      const grup = new THREE.Group();
      grup.add(govde, kenar, ust);
      const hedef = merkezi(y);
      grup.position.copy(hedef);
      grup.visible = false;
      this.yukGrubu.add(grup);
      const p = {
        veri: y, anahtar: parcaAnahtari(y), grup, govde, kenar, ust, doku, hedef, renk,
        boy: new THREE.Vector3(y.en * MM, y.yukseklik * MM, y.uzunluk * MM), saydamlik: 1,
      };
      govde.userData.parca = p;
      this.parcalar.push(p);
    }
    this._isaretleriKur(isaretler);
    // Seçim ve ihlal anahtarla tutulur; yeniden kurulan parçalara geri uygulanır
    this.secililer = new Set(this.parcalar.filter((p) => this._secimAnahtarlari.has(p.anahtar)));
    this.secili = this._odak && this.secililer.size === 1 ? [...this.secililer][0] : null;
    this.parcalar.forEach((p) => this._parcaRenkleri(p));
    this._secimCerceveleri();

    const n = this.parcalar.length;
    if (!n) {
      this.adim = 0;
      this.geri.adimDegisti?.(0, 0);
      this.kirli = true;
      return;
    }
    if (animasyon === 'yok' || this.azHareket) {
      this.parcalar.forEach((p) => (p.grup.visible = true));
      this.adim = n;
      this._isaretleriGoster(true);
    } else {
      const aralik = animasyon === 'hizli' ? Math.min(60, 900 / n) : Math.min(170, 2400 / n);
      const sure = animasyon === 'hizli' ? 380 : 560;
      this.parcalar.forEach((p, i) => this._dusur(p, i * aralik + 120, sure));
      this.adim = n;
      this._isaretleriGoster(false);
      this._tween({ etiket: 'parca', gecikme: (n - 1) * aralik + sure + 200, sure: 400, adim: (k) => this._isaretSaydamlik(k) });
    }
    this.geri.adimDegisti?.(this.adim, n);
    this.kirli = true;
  }

  /** Ölçüye göre paylaşılan geometriler (gövde, kenar, üst yüz levhası) */
  _geometri(y) {
    const anahtar = `${y.en}|${y.yukseklik}|${y.uzunluk}`;
    let geo = this._geoOnbellek.get(anahtar);
    if (geo) return geo;
    const en = y.en * MM;
    const yk = y.yukseklik * MM;
    const uz = y.uzunluk * MM;
    const r = Math.min(0.03, Math.min(en, yk, uz) * 0.08);
    // Üst yüz levhası: yazı uzunluk boyunca öne (kabine) doğru akar, üstü sol duvara bakar;
    // böylece izometrik, yandan ve üstten görünümde düz okunur.
    const ust = new THREE.PlaneGeometry(Math.max(0.01, uz - r * 2), Math.max(0.01, en - r * 2));
    ust.rotateX(-Math.PI / 2);
    ust.rotateY(Math.PI / 2);
    geo = {
      govde: new RoundedBoxGeometry(en, yk, uz, 2, r),
      kenar: new THREE.EdgesGeometry(new THREE.BoxGeometry(en, yk, uz)),
      ust,
    };
    this._geoOnbellek.set(anahtar, geo);
    return geo;
  }

  _ustDokusu(y) {
    return ustYuzDokusu({
      ad: y.etiket || y.ad,
      capraz: y.ustuneKonabilir === false,
      genM: y.uzunluk * MM,
      yukM: y.en * MM,
      anizotropi: this.anizotropi,
    });
  }

  /** Ölçüsü değişen (döndürülen) parçanın gövdesi, kenarı ve üst yüzü yeni ölçüyle kurulur; grup yerinde kalır. */
  _parcaGovdesiYenile(p) {
    const y = p.veri;
    const geo = this._geometri(y);
    p.govde.geometry = geo.govde;
    p.kenar.geometry = geo.kenar;
    p.ust.geometry = geo.ust;
    p.ust.position.y = (y.yukseklik * MM) / 2 + 0.002;
    const yeni = this._ustDokusu(y);
    ustYuzBirak(p.doku);
    p.doku = yeni;
    p.ust.material.map = yeni;
    p.ust.material.needsUpdate = true;
    p.boy.set(y.en * MM, y.yukseklik * MM, y.uzunluk * MM);
    p.grup.quaternion.identity();
  }

  _parcalariTemizle() {
    this.secili = null;
    this.ustteki = null;
    this.secililer = new Set();
    this._cerceveleriTemizle();
    for (const p of this.parcalar) {
      this.yukGrubu.remove(p.grup);
      p.govde.material.dispose();
      p.kenar.material.dispose();
      p.ust.material.dispose();
      ustYuzBirak(p.doku);
    }
    if (this._geoOnbellek) {
      for (const g of this._geoOnbellek.values()) {
        g.govde.dispose();
        g.kenar.dispose();
        g.ust.dispose();
      }
    }
    this._geoOnbellek = null;
    this.parcalar = [];
    this._isaretleriTemizle();
  }

  _saydam(p, a) {
    p.saydamlik = a;
    const saydam = a < 0.999;
    const m = p.govde.material;
    if (m.transparent !== saydam) {
      m.transparent = saydam;
      m.needsUpdate = true;
    }
    m.opacity = a;
    p.govde.material.depthWrite = a > 0.6;
    p.kenar.material.opacity = 0.9 * a;
    p.ust.material.opacity = a;
  }

  _dusur(p, gecikme, sure) {
    const hedefY = p.hedef.y;
    const basY = hedefY + 1.5 + p.boy.y * 0.35;
    p.grup.visible = false;
    this._tween({
      etiket: 'parca',
      gecikme,
      sure,
      basla: () => {
        p.grup.visible = true;
        p.grup.position.y = basY;
        this._saydam(p, 0);
      },
      adim: (k) => {
        p.grup.position.y = basY + (hedefY - basY) * kolay.dusus(k);
        this._saydam(p, Math.min(1, k / 0.3) * this._odakSaydamligi(p));
      },
      bitti: () => {
        p.grup.position.y = hedefY;
        this._saydam(p, this._odakSaydamligi(p));
        this._iz(p);
      },
    });
  }

  /** Parça oturunca tabanında genişleyip sönen ince çerçeve */
  _iz(p) {
    if (this.azHareket) return;
    const { x, z } = p.hedef;
    const y = p.hedef.y - p.boy.y / 2 + 0.004;
    const gx = p.boy.x / 2;
    const gz = p.boy.z / 2;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-gx, 0, -gz), new THREE.Vector3(gx, 0, -gz),
      new THREE.Vector3(gx, 0, gz), new THREE.Vector3(-gx, 0, gz),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: VURGU, transparent: true, opacity: 0.8, depthWrite: false });
    const cerceve = new THREE.LineLoop(geo, mat);
    cerceve.position.set(x, y, z);
    this.yukGrubu.add(cerceve);
    this._tween({
      sure: 480,
      adim: (k) => {
        const s = 1 + kolay.disKup(k) * 0.12;
        cerceve.scale.set(s, 1, s);
        mat.opacity = 0.8 * (1 - k);
      },
      bitti: () => {
        this.yukGrubu.remove(cerceve);
        geo.dispose();
        mat.dispose();
      },
    });
  }

  // ------------------------------------------------------------------ ağırlık merkezi ve kullanılan uzunluk

  _isaretleriKur(bilgi) {
    this._isaretleriTemizle();
    this._sonIsaretler = bilgi;
    if (!bilgi || !this.model) return;
    const g = new THREE.Group();
    const malz = [];
    const dokular = [];
    const { W } = this.model;

    if (bilgi.agirlikMerkezi) {
      const m = bilgi.agirlikMerkezi;
      const x = m.x * MM, y = m.y * MM, z = m.z * MM;
      const cizgiMat = new THREE.LineDashedMaterial({ color: VURGU, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.9, depthTest: false });
      const cizgi = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0.01, z), new THREE.Vector3(x, y, z)]), cizgiMat);
      cizgi.computeLineDistances();
      cizgi.renderOrder = 6;
      const tasMat = new THREE.MeshBasicMaterial({ color: VURGU, transparent: true, depthTest: false, toneMapped: false });
      const tas = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), tasMat);
      tas.position.set(x, y, z);
      tas.renderOrder = 7;
      const halkaMat = new THREE.MeshBasicMaterial({ color: VURGU, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide, toneMapped: false });
      const halka = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 40), halkaMat);
      halka.rotation.x = -Math.PI / 2;
      halka.position.set(x, 0.012, z);
      halka.renderOrder = 6;
      const { doku, oran } = yaziDokusu(t('plan.gorunum.agirlikMerkezi'), { renk: '#E9F7FE', zemin: 'rgba(9,16,34,0.82)', kenar: 'rgba(58,191,240,0.8)', boyut: 40, dolgu: 0.55 });
      const levhaMat = new THREE.SpriteMaterial({ map: doku, transparent: true, depthTest: false, toneMapped: false });
      const levha = new THREE.Sprite(levhaMat);
      levha.scale.set(0.34 * oran, 0.34, 1);
      levha.center.set(0, 0.5);
      levha.position.set(x + 0.2, y, z);
      levha.renderOrder = 8;
      g.add(cizgi, tas, halka, levha);
      malz.push(cizgiMat, tasMat, halkaMat, levhaMat);
      dokular.push(doku);
    }

    if (bilgi.kullanilanUzunluk > 0) {
      const z = bilgi.kullanilanUzunluk * MM;
      const mat = new THREE.LineBasicMaterial({ color: VURGU, transparent: true, opacity: 0.95, depthTest: false });
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.012, z), new THREE.Vector3(W + 0.46, 0.012, z),
        new THREE.Vector3(W + 0.24, 0.012, 0), new THREE.Vector3(W + 0.24, 0.012, z),
      ]);
      const cizgi = new THREE.LineSegments(geo, mat);
      cizgi.renderOrder = 6;
      const { doku, oran } = yaziDokusu(metre(bilgi.kullanilanUzunluk), { renk: '#06223A', zemin: 'rgba(58,191,240,0.95)', boyut: 40, kalin: 700, dolgu: 0.5 });
      const levhaMat = new THREE.MeshBasicMaterial({ map: doku, transparent: true, depthTest: false, toneMapped: false });
      const yuk = 0.24;
      const levha = new THREE.Mesh(new THREE.PlaneGeometry(yuk * oran, yuk), levhaMat);
      levha.rotation.x = -Math.PI / 2;
      levha.position.set(W + 0.5 + (yuk * oran) / 2, 0.014, z - yuk * 0.9);
      levha.renderOrder = 7;
      g.add(cizgi, levha);
      malz.push(mat, levhaMat);
      dokular.push(doku);
    }

    // Şasi kilidi ve aks grubu: konum ve (varsa) motorun tahmini yük payı, sarı levhalarla
    const aks = bilgi.aks;
    if (aks && aks.sasiMesafe != null && aks.aksMerkezi != null) {
      const ay = bilgi.aksYukleri;
      const SARI = new THREE.Color(0xf2b441);
      const etiketler = [
        [aks.sasiMesafe, ay ? t('plan.agirlik.sasiPay', { kg: kg(ay.sasi) }) : t('plan.agirlik.sasi')],
        [aks.aksMerkezi, ay ? t('plan.agirlik.aksPay', { kg: kg(ay.aks) }) : t('plan.agirlik.aks')],
      ];
      for (const [zMm, metin] of etiketler) {
        const z = zMm * MM;
        const cizgiMat = new THREE.LineBasicMaterial({ color: SARI, transparent: true, opacity: 0.95, depthTest: false });
        const cizgi = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(W * 0.5, -0.02, z), new THREE.Vector3(W + 0.05, -0.02, z), new THREE.Vector3(W + 0.32, -0.32, z),
        ]), cizgiMat);
        cizgi.renderOrder = 6;
        const { doku, oran } = yaziDokusu(metin, { renk: '#2A1A00', zemin: 'rgba(242, 180, 65, 0.95)', boyut: 40, kalin: 700, dolgu: 0.5 });
        const levhaMat = new THREE.SpriteMaterial({ map: doku, transparent: true, depthTest: false, toneMapped: false });
        const levha = new THREE.Sprite(levhaMat);
        levha.scale.set(0.3 * oran, 0.3, 1);
        levha.center.set(0, 0.5);
        levha.position.set(W + 0.36, -0.32, z);
        levha.renderOrder = 8;
        g.add(cizgi, levha);
        malz.push(cizgiMat, levhaMat);
        dokular.push(doku);
      }
    }

    this.yukGrubu.add(g);
    this.isaretler = { g, malz, dokular, temel: malz.map((m) => m.opacity) };
  }

  _isaretleriTemizle() {
    if (!this.isaretler) return;
    this.yukGrubu.remove(this.isaretler.g);
    this.isaretler.g.traverse((o) => o.geometry && o.geometry.dispose());
    this.isaretler.malz.forEach((m) => m.dispose());
    this.isaretler.dokular.forEach((d) => d.dispose());
    this.isaretler = null;
  }

  _isaretSaydamlik(k) {
    if (!this.isaretler) return;
    this.isaretler.g.visible = k > 0;
    this.isaretler.malz.forEach((m, i) => (m.opacity = this.isaretler.temel[i] * k));
  }

  _isaretleriGoster(acik) {
    if (this.isaretler) this._isaretSaydamlik(acik ? 1 : 0);
  }

  // ------------------------------------------------------------------ adım adım

  /** İlk n parçayı gösterir (yükleme sırasına göre). */
  adimaGit(n, { animasyon = true } = {}) {
    const toplam = this.parcalar.length;
    n = Math.max(0, Math.min(toplam, Math.round(n)));
    this._tweenIptal('parca');
    if (n > this.adim && animasyon && !this.azHareket) {
      for (let i = 0; i < this.adim; i += 1) this._yerinde(this.parcalar[i], true);
      const fark = n - this.adim;
      for (let i = this.adim; i < n; i += 1) this._dusur(this.parcalar[i], (i - this.adim) * Math.min(120, 600 / fark), 520);
      this._parlat(this.parcalar[n - 1]);
    } else {
      this.parcalar.forEach((p, i) => this._yerinde(p, i < n));
    }
    this.adim = n;
    this._isaretleriGoster(n === toplam);
    this.geri.adimDegisti?.(n, toplam);
    this.kirli = true;
  }

  _yerinde(p, gorunur) {
    p.grup.visible = gorunur;
    p.grup.position.copy(p.hedef);
    this._saydam(p, this._odakSaydamligi(p));
  }

  /** Son yerleşen parçanın kenarları kısa süre camgöbeği parlar */
  _parlat(p) {
    if (!p || this.azHareket) return;
    const asil = p.renk.clone().multiplyScalar(0.42);
    this._tween({
      gecikme: 380,
      sure: 900,
      adim: (k) => {
        p.kenar.material.color.copy(VURGU).lerp(asil, kolay.disKup(k));
      },
      bitti: () => this._parcaRenkleri(p),
    });
  }

  oynat() {
    const toplam = this.parcalar.length;
    if (!toplam) return;
    if (this.adim >= toplam) this.adimaGit(0, { animasyon: false });
    this.oynuyor = true;
    this.geri.oynatmaDegisti?.(true);
    const ilerle = () => {
      if (!this.oynuyor) return;
      if (this.adim >= this.parcalar.length) {
        this.durdur();
        return;
      }
      this.adimaGit(this.adim + 1);
      this.zamanlayici = setTimeout(ilerle, this.azHareket ? 450 : 700);
    };
    this.zamanlayici = setTimeout(ilerle, 150);
  }

  durdur() {
    clearTimeout(this.zamanlayici);
    if (this.oynuyor) {
      this.oynuyor = false;
      this.geri.oynatmaDegisti?.(false);
    }
  }

  // ------------------------------------------------------------------ seçim ve vurgu

  /** Yükleme sırasına göre tek parça seçer (null: seçim yok); seçilmeyenler soluklaşır */
  sec(sira) {
    const p = sira == null ? null : this.parcalar.find((x) => x.veri.sira === sira);
    this.secimAyarla(p ? [p.anahtar] : [], { odak: true });
  }

  /**
   * Seçimi anahtarlarla kurar. odak: tek parça seçiliyken ötekiler soluklaşır (düzenleme dışında);
   * düzenleme kipinde engelleri görmek için soluklaşmaz.
   */
  secimAyarla(anahtarlar, { odak = !this.duzenleme } = {}) {
    this._secimAnahtarlari = new Set(anahtarlar);
    this._odak = odak;
    this.secililer = new Set(this.parcalar.filter((p) => this._secimAnahtarlari.has(p.anahtar)));
    this.secili = odak && this.secililer.size === 1 ? [...this.secililer][0] : null;
    for (const p of this.parcalar) {
      this._parcaRenkleri(p);
      if (p.grup.visible) this._saydam(p, this._odakSaydamligi(p));
    }
    this._secimCerceveleri();
    this.kirli = true;
  }

  get seciliAnahtarlar() {
    return [...this._secimAnahtarlari];
  }

  _odakSaydamligi(p) {
    return this.secili && this.secili !== p ? 0.32 : 1;
  }

  /** Gövde ışıması ve kenar rengi: hata kırmızı, uyarı sarı, seçili camgöbeği, fare üstündeyse hafif */
  _parcaRenkleri(p) {
    const secili = this.secililer.has(p);
    const ihlal = this._ihlalHaritasi.get(p.anahtar) || null;
    const m = p.govde.material;
    // Hatalı parçanın kendi rengi de kırmızıya çekilir; mavi parça pembeye değil kırmızıya döner
    m.color.copy(p.renk);
    if (ihlal === 'hata') m.color.lerp(KIRMIZI, 0.8);
    else if (ihlal === 'uyari') m.color.lerp(SARI_RENK, 0.45);
    if (ihlal === 'hata') {
      m.emissive.copy(KIRMIZI);
      m.emissiveIntensity = secili ? 0.55 : 0.42;
    } else if (ihlal === 'uyari') {
      m.emissive.copy(SARI_RENK);
      m.emissiveIntensity = secili ? 0.34 : 0.24;
    } else if (secili) {
      m.emissive.copy(p.renk);
      m.emissiveIntensity = 0.28;
    } else if (p === this.ustteki) {
      m.emissive.copy(p.renk);
      m.emissiveIntensity = 0.16;
    } else {
      m.emissive.copy(SIYAH);
      m.emissiveIntensity = 0;
    }
    p.kenar.material.color.copy(ihlal === 'hata' ? KIRMIZI : ihlal === 'uyari' ? SARI_RENK : secili ? VURGU : koyuKenar(p.renk));
  }

  _cerceveleriTemizle() {
    for (const c of this.cerceveler) {
      c.parent?.remove(c);
      c.geometry.dispose();
    }
    this.cerceveler = [];
  }

  /** Seçili her parçanın çevresinde ince camgöbeği çerçeve (hatalıysa kırmızı) */
  _secimCerceveleri() {
    this._cerceveleriTemizle();
    for (const p of this.secililer) {
      const b = p.boy;
      const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(b.x + 0.03, b.y + 0.03, b.z + 0.03));
      const hata = this._ihlalHaritasi.get(p.anahtar) === 'hata';
      const c = new THREE.LineSegments(geo, hata ? this._kirmiziCerceveMat() : this.cerceveMat);
      c.renderOrder = 9;
      p.grup.add(c);
      this.cerceveler.push(c);
    }
  }

  _kirmiziCerceveMat() {
    if (!this._kirmiziMat) this._kirmiziMat = new THREE.LineBasicMaterial({ color: KIRMIZI, transparent: true, opacity: 1, depthTest: false });
    return this._kirmiziMat;
  }

  _ustundeAyarla(p) {
    if (this.ustteki === p) return;
    const eski = this.ustteki;
    this.ustteki = p;
    if (eski) this._parcaRenkleri(eski);
    if (p) this._parcaRenkleri(p);
    this.renderer.domElement.style.cursor = p ? (this.duzenleme ? 'grab' : 'pointer') : '';
    this.kirli = true;
  }

  /**
   * İhlal renkleri: harita anahtar → 'hata' | 'uyari'. sars: yeni hatalı olan parçaların anahtarları (hafif sarsıntı),
   * gecikme: sarsıntı konum animasyonu bitince başlasın diye.
   */
  ihlalleriAyarla(harita, { sars = null, gecikme = 0 } = {}) {
    this._ihlalHaritasi = harita instanceof Map ? harita : new Map();
    for (const p of this.parcalar) this._parcaRenkleri(p);
    this._secimCerceveleri();
    if (sars && sars.size && !this.azHareket) {
      for (const p of this.parcalar) if (sars.has(p.anahtar)) this._sars(p, gecikme);
    }
    this.kirli = true;
  }

  /** Hatalı parça yanlara hafifçe sarsılır (yaklaşık 2 cm, 340 ms) */
  _sars(p, gecikme = 0) {
    let x0 = 0;
    this._tween({
      etiket: 'sars',
      parca: p,
      gecikme,
      sure: 340,
      basla: () => {
        x0 = p.hedef.x;
      },
      adim: (k) => {
        p.grup.position.x = x0 + Math.sin(k * Math.PI * 5) * 0.018 * (1 - k);
      },
      bitti: () => {
        p.grup.position.x = x0;
      },
      iptal: () => {
        p.grup.position.x = p.hedef.x;
      },
    });
  }

  /** Ekrandaki noktadan ışın: ilk görünür parça ve vurulan nokta */
  _vurus(e) {
    const el = this.renderer.domElement;
    const r = el.getBoundingClientRect();
    this.fare.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.isin.setFromCamera(this.fare, this.kamera);
    const hedefler = this.parcalar.filter((p) => p.grup.visible).map((p) => p.govde);
    const v = this.isin.intersectObjects(hedefler, false)[0];
    return v ? { p: v.object.userData.parca, nokta: v.point.clone() } : null;
  }

  _olaylar() {
    const el = this.renderer.domElement;
    let basma = null;
    let bekleyenHareket = null;
    const isinAt = (e) => this._vurus(e)?.p || null;

    el.addEventListener('pointermove', (e) => {
      if (this.surukleme) {
        this._surukleHareket(e);
        return;
      }
      if (this.alan) {
        this._alanCiz(e);
        return;
      }
      if (e.buttons) {
        this.geri.ustunde?.(null);
        return;
      }
      bekleyenHareket = e;
      if (this._hareketIstegi) return;
      this._hareketIstegi = requestAnimationFrame(() => {
        this._hareketIstegi = 0;
        if (this.surukleme || this.alan) return;
        const ev = bekleyenHareket;
        const p = isinAt(ev);
        this._ustundeAyarla(p);
        this.geri.ustunde?.(p ? p.veri : null, ev.clientX, ev.clientY);
      });
    });
    el.addEventListener('pointerleave', () => {
      if (this.surukleme || this.alan) return;
      this._ustundeAyarla(null);
      this.geri.ustunde?.(null);
    });
    // Düzenleme kipinde sol tuş: parçada sürükleme başlar, Shift ile alan seçilir. Yakalama evresinde dinlenir;
    // böylece kamera denetimi (OrbitControls) basmayı görmeden kapatılır, boş yerde sürükleme yine kamerayı döndürür.
    this.kap.addEventListener('pointerdown', (e) => {
      if (!this.duzenleme || e.button !== 0 || e.target !== el) return;
      if (e.shiftKey) {
        this._alanBasla(e);
        return;
      }
      const v = this._vurus(e);
      if (v) this._surukleBasla(e, v);
    }, true);
    el.addEventListener('pointerdown', (e) => {
      basma = { x: e.clientX, y: e.clientY, zaman: performance.now(), tus: e.button };
    });
    el.addEventListener('pointerup', (e) => {
      if (this.surukleme) {
        basma = null;
        this._surukleBitir(e);
        return;
      }
      if (this.alan) {
        basma = null;
        this._alanBitir(e);
        return;
      }
      if (!basma || basma.tus !== 0) return;
      const kayma = Math.hypot(e.clientX - basma.x, e.clientY - basma.y);
      const sure = performance.now() - basma.zaman;
      basma = null;
      if (kayma > 5 || sure > 500) return;
      const p = isinAt(e);
      this.geri.parcaTiklandi?.(p ? p.anahtar : null, { ctrl: e.ctrlKey || e.metaKey });
    });
    el.addEventListener('pointercancel', () => {
      if (this.surukleme) this.surukleIptal();
      if (this.alan) this._alanKapat();
    });
    // Çift tık: parçaya odaklanır; boş yere çift tık bütün aracı sığdırır
    el.addEventListener('dblclick', (e) => {
      const p = isinAt(e);
      if (p) this.odaklan(p.veri.sira, { sec: !this.duzenleme });
      else this.gorunum('sigdir');
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        if (this.duzenleme) return;
        e.preventDefault();
        if (this.oynuyor) this.durdur();
        else this.oynat();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.yakinlastir(0.08);
      } else if (e.key === '-') {
        e.preventDefault();
        this.yakinlastir(-0.08);
      }
    });
    this.kontrol.addEventListener('start', () => {
      this._tweenIptal('kamera');
      this.elleDegisti = true;
    });
  }

  // ------------------------------------------------------------------ elle düzenleme

  /** Düzenleme kipi: bütün parçalar görünür, oynatma durur; kapanınca ölçü çizgileri ve hayalet kalkar */
  duzenlemeKipi(acik) {
    if (this.duzenleme === acik) return;
    this.duzenleme = acik;
    this.durdur();
    if (!acik) {
      this.surukleIptal();
      this._alanKapat();
      this.hayaletAyarla(null);
      this.olculeriAyarla(null);
    }
    if (this.parcalar.length && this.adim < this.parcalar.length) this.adimaGit(this.parcalar.length, { animasyon: false });
    this.renderer.domElement.classList.toggle('duzenleme', acik);
    this.kirli = true;
  }

  _parcaTweenIptal(p) {
    this.tweenler = this.tweenler.filter((tw) => {
      if (tw.parca !== p) return true;
      tw.iptal?.();
      return false;
    });
  }

  /**
   * Parçaları yeni konum ve ölçülerine götürür (anahtarla eşlenir); her biri o an göründüğü yerden kayar.
   * Ölçüsü bir eksende çeyrek tur değişen parça o eksende döner.
   * sure: ms. yol: anahtar → ara yerleşim; parça önce oraya kayar (sure), sonra iner (sure2).
   * dondurme: { eksen, pivot0, pivot1 (mm), anahtarlar }: bu parçalar ortak merkez çevresinde birlikte döner.
   * Animasyonlar kapalıysa (azHareket) yer değişimi anında olur.
   */
  konumlariGuncelle(yerlesimler, { sure = 180, yol = null, sure2 = 0, dondurme = null } = {}) {
    const yeni = new Map(yerlesimler.map((y) => [parcaAnahtari(y), y]));
    if (yeni.size !== this.parcalar.length || this.parcalar.some((p) => !yeni.has(p.anahtar))) {
      // Parça kümesi değişti: baştan kurulur
      this.yukleriKur(yerlesimler, { animasyon: 'yok', isaretler: this._sonIsaretler });
      return;
    }
    const hareketsiz = this.azHareket;
    const donenler = new Set(dondurme?.anahtarlar || []);
    const mVek = (v) => (v ? new THREE.Vector3(v.x * MM, v.y * MM, v.z * MM) : null);
    const c0 = mVek(dondurme?.pivot0);
    const c1 = mVek(dondurme?.pivot1);
    for (const p of this.parcalar) {
      const y = { ...p.veri, ...yeni.get(p.anahtar) };
      const eksen = donusEkseni(p.veri, y);
      const boyDegisti = y.en !== p.veri.en || y.yukseklik !== p.veri.yukseklik || y.uzunluk !== p.veri.uzunluk;
      const bas = p.grup.position.clone();
      p.veri = y;
      p.hedef.copy(merkezi(y));
      if (boyDegisti) this._parcaGovdesiYenile(p);
      if (!boyDegisti && bas.distanceToSquared(p.hedef) < 1e-10) continue;
      this._parcaTweenIptal(p);
      const araY = yol ? yol.get(p.anahtar) : null;
      const ara = araY ? merkezi(araY) : null;
      const t1 = hareketsiz ? 0 : sure;
      const t2 = hareketsiz || !ara ? 0 : sure2;
      if (!t1 && !t2) {
        p.grup.position.copy(p.hedef);
        continue;
      }
      const eks = boyDegisti && eksen ? EKSENLER[eksen] : null;
      const grupDon = !!(eks && c0 && c1 && donenler.has(p.anahtar));
      const goreli = grupDon ? p.hedef.clone().sub(c1) : null;
      const q = new THREE.Quaternion();
      const ck = new THREE.Vector3();
      // Dönen parça yeni ölçüsüyle kuruldu; başta çeyrek tur geride, yani eski görünümünde durur
      if (eks) p.grup.quaternion.setFromAxisAngle(eks, -Math.PI / 2);
      const toplam = t1 + t2;
      const oran = t1 / toplam;
      this._tween({
        etiket: 'konum',
        parca: p,
        sure: toplam,
        adim: (k) => {
          if (ara && t2) {
            if (k < oran) p.grup.position.lerpVectors(bas, ara, kolay.disKup(k / oran));
            else p.grup.position.lerpVectors(ara, p.hedef, kolay.icKare((k - oran) / (1 - oran)));
            return;
          }
          if (!eks) {
            p.grup.position.lerpVectors(bas, ara || p.hedef, kolay.disKup(k));
            return;
          }
          const e = kolay.icDisKup(k);
          q.setFromAxisAngle(eks, (-Math.PI / 2) * (1 - e));
          p.grup.quaternion.copy(q);
          if (grupDon) {
            ck.lerpVectors(c0, c1, e);
            p.grup.position.copy(goreli).applyQuaternion(q).add(ck);
          } else p.grup.position.lerpVectors(bas, p.hedef, e);
        },
        bitti: () => {
          p.grup.position.copy(p.hedef);
          p.grup.quaternion.identity();
        },
        iptal: () => p.grup.quaternion.identity(),
      });
    }
    this.parcalar.sort((a, b) => a.veri.sira - b.veri.sira);
    this._secimCerceveleri();
    this.kirli = true;
  }

  /** Konum değişmeden parça bilgileri (yükleme sırası, notlar) ve ağırlık merkezi işaretleri yenilenir */
  verileriGuncelle(yerlesimler, { isaretler } = {}) {
    const yeni = new Map(yerlesimler.map((y) => [parcaAnahtari(y), y]));
    for (const p of this.parcalar) {
      const y = yeni.get(p.anahtar);
      if (y) p.veri = { ...p.veri, ...y };
    }
    this.parcalar.sort((a, b) => a.veri.sira - b.veri.sira);
    if (isaretler !== undefined) {
      this._isaretleriKur(isaretler);
      this._isaretleriGoster(this.adim >= this.parcalar.length);
    }
    this.geri.adimDegisti?.(this.adim, this.parcalar.length);
    this.kirli = true;
  }

  // ------------------------------------------------------------------ sürükleme ve alan seçimi

  /** Sürükleme düzlemi: tabanda yatay; Alt ile kameraya bakan dikey düzlem */
  _surukleDuzlemi(nokta, dikey) {
    const n = dikey ? this.kamera.position.clone().sub(nokta).setY(0) : new THREE.Vector3(0, 1, 0);
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(n.normalize(), nokta);
  }

  _duzlemKesisim(e, duzlem) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.fare.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.isin.setFromCamera(this.fare, this.kamera);
    return this.isin.ray.intersectPlane(duzlem, new THREE.Vector3());
  }

  _surukleBasla(e, v) {
    const el = this.renderer.domElement;
    this.kontrol.enabled = false;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* yakalanamasa da sürükleme sürer */
    }
    const dikey = e.altKey;
    this.surukleme = {
      p: v.p,
      x: e.clientX,
      y: e.clientY,
      basladi: false,
      ctrl: e.ctrlKey || e.metaKey,
      dikey,
      capa: v.nokta.clone(),
      duzlem: this._surukleDuzlemi(v.nokta, dikey),
      bas: v.nokta.clone(),
      kayit: new THREE.Vector3(),
      etkin: new THREE.Vector3(),
      pointerId: e.pointerId,
    };
    this._ustundeAyarla(null);
    this.geri.ustunde?.(null);
    this.geri.duzenleBasildi?.(v.p.anahtar, { ctrl: this.surukleme.ctrl });
  }

  _surukleHareket(e) {
    const s = this.surukleme;
    if (!s.basladi) {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 4) return;
      s.basladi = true;
      this.renderer.domElement.style.cursor = 'grabbing';
      this.geri.duzenleSurukleBasla?.();
    }
    if (e.altKey !== s.dikey) {
      // Eksen değişti: parça o an nerede duruyorsa yeni düzlemle oradan sürer
      s.kayit.copy(s.etkin);
      s.dikey = e.altKey;
      const nokta = s.capa.clone().add(s.kayit);
      s.duzlem = this._surukleDuzlemi(nokta, s.dikey);
      s.bas = this._duzlemKesisim(e, s.duzlem) || nokta;
    }
    const k = this._duzlemKesisim(e, s.duzlem);
    if (!k) return;
    const f = k.sub(s.bas);
    const d = s.dikey
      ? new THREE.Vector3(s.kayit.x, s.kayit.y + f.y, s.kayit.z)
      : new THREE.Vector3(s.kayit.x + f.x, s.kayit.y, s.kayit.z + f.z);
    this.geri.duzenleSurukle?.({ x: d.x / MM, y: d.y / MM, z: d.z / MM }, { alt: s.dikey });
  }

  _isaretciBirak(pointerId) {
    const el = this.renderer.domElement;
    try {
      el.releasePointerCapture(pointerId);
    } catch {
      /* zaten bırakılmış */
    }
    this.kontrol.enabled = true;
    el.style.cursor = '';
  }

  _surukleBitir() {
    const s = this.surukleme;
    this.surukleme = null;
    this._isaretciBirak(s.pointerId);
    if (s.basladi) this.geri.duzenleBirak?.();
    else this.geri.duzenleTiklandi?.(s.p.anahtar, { ctrl: s.ctrl });
  }

  /** Sürüklemeyi bırakır (Esc); parçaları eski yerine götürmek düzenleyicinin işidir */
  surukleIptal() {
    const s = this.surukleme;
    if (!s) return;
    this.surukleme = null;
    this._isaretciBirak(s.pointerId);
    this.geri.duzenleIptal?.(s.basladi);
  }

  get surukleniyor() {
    return !!(this.surukleme && this.surukleme.basladi);
  }

  /** Sürüklenen parçaları yerleşik konumlarından d (mm) kadar kaymış gösterir (animasyonsuz) */
  surukleOnizle(anahtarlar, d) {
    const kume = new Set(anahtarlar);
    const v = new THREE.Vector3(d.x * MM, d.y * MM, d.z * MM);
    if (this.surukleme) this.surukleme.etkin.copy(v);
    for (const p of this.parcalar) {
      if (!kume.has(p.anahtar)) continue;
      this._parcaTweenIptal(p);
      p.grup.position.copy(p.hedef).add(v);
    }
    this.kirli = true;
  }

  /** Sürüklemede ızgaraya oturacağı yer: ince camgöbeği kutu (mm cinsinden { x, y, z, xe, ye, ze } ya da null) */
  hayaletAyarla(k) {
    if (!k) {
      if (this.hayalet && this.hayalet.visible) {
        this.hayalet.visible = false;
        this.kirli = true;
      }
      return;
    }
    if (!this.hayalet) {
      const g = new THREE.Group();
      const dolgu = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: VURGU, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false })
      );
      dolgu.renderOrder = 7;
      const kenar = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
        new THREE.LineBasicMaterial({ color: VURGU, transparent: true, opacity: 0.85, depthTest: false, toneMapped: false })
      );
      kenar.renderOrder = 8;
      g.add(dolgu, kenar);
      this.duzenGrubu.add(g);
      this.hayalet = g;
    }
    this.hayalet.visible = true;
    this.hayalet.scale.set(Math.max(0.001, (k.xe - k.x) * MM), Math.max(0.001, (k.ye - k.y) * MM), Math.max(0.001, (k.ze - k.z) * MM));
    this.hayalet.position.set(((k.x + k.xe) / 2) * MM, ((k.y + k.ye) / 2) * MM, ((k.z + k.ze) / 2) * MM);
    this.kirli = true;
  }

  _alanBasla(e) {
    const el = this.renderer.domElement;
    this.kontrol.enabled = false;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* yakalanamasa da seçim sürer */
    }
    const div = document.createElement('div');
    div.className = 'alan-secim';
    this.kap.appendChild(div);
    this.alan = { x: e.clientX, y: e.clientY, div, ctrl: e.ctrlKey || e.metaKey, pointerId: e.pointerId };
    this._ustundeAyarla(null);
    this.geri.ustunde?.(null);
    this._alanCiz(e);
  }

  _alanCiz(e) {
    const a = this.alan;
    const r = this.kap.getBoundingClientRect();
    a.div.style.transform = `translate(${Math.min(a.x, e.clientX) - r.left}px, ${Math.min(a.y, e.clientY) - r.top}px)`;
    a.div.style.width = `${Math.abs(e.clientX - a.x)}px`;
    a.div.style.height = `${Math.abs(e.clientY - a.y)}px`;
  }

  _alanKapat() {
    const a = this.alan;
    if (!a) return;
    this.alan = null;
    a.div.remove();
    this._isaretciBirak(a.pointerId);
  }

  _alanBitir(e) {
    const a = this.alan;
    this._alanKapat();
    const sol = Math.min(a.x, e.clientX);
    const sag = Math.max(a.x, e.clientX);
    const ust = Math.min(a.y, e.clientY);
    const alt = Math.max(a.y, e.clientY);
    if (sag - sol < 5 && alt - ust < 5) {
      // Shift ile tıklama: parça seçime eklenir ya da çıkarılır
      const p = this._vurus(e)?.p;
      if (p) this.geri.parcaTiklandi?.(p.anahtar, { ctrl: true });
      return;
    }
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    const anahtarlar = this.parcalar.filter((p) => {
      if (!p.grup.visible) return false;
      v.copy(p.hedef).project(this.kamera);
      if (v.z < -1 || v.z > 1) return false;
      const sx = r.left + ((v.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - v.y) / 2) * r.height;
      return sx >= sol && sx <= sag && sy >= ust && sy <= alt;
    }).map((p) => p.anahtar);
    this.geri.alanSecildi?.(anahtarlar, { ctrl: a.ctrl });
  }

  /**
   * Ok tuşlarının araçtaki karşılığı: ekranın sağına ve yukarısına (uzağa) en çok düşen yatay eksen.
   * Döner: { sag: { eksen: 'x'|'z', isaret }, ileri: { eksen, isaret } }
   */
  ekranYonleri() {
    const sag = new THREE.Vector3(1, 0, 0).applyQuaternion(this.kamera.quaternion).setY(0);
    let ileri = new THREE.Vector3(0, 1, 0).applyQuaternion(this.kamera.quaternion).setY(0);
    if (ileri.lengthSq() < 1e-4) ileri = new THREE.Vector3(0, 0, -1).applyQuaternion(this.kamera.quaternion).setY(0);
    const eksen = (v) => (Math.abs(v.x) >= Math.abs(v.z) ? { eksen: 'x', isaret: v.x >= 0 ? 1 : -1 } : { eksen: 'z', isaret: v.z >= 0 ? 1 : -1 });
    const a = eksen(sag);
    let b = eksen(ileri);
    if (a.eksen === b.eksen) b = a.eksen === 'x' ? { eksen: 'z', isaret: ileri.z >= 0 ? 1 : -1 } : { eksen: 'x', isaret: ileri.x >= 0 ? 1 : -1 };
    return { sag: a, ileri: b };
  }

  // ------------------------------------------------------------------ kalan boşluk ölçü çizgileri

  /**
   * Seçimin (ya da bütün yükün) kutusundan duvara ya da en yakın parçaya kalan boşluk çizgileri.
   * bilgi: { kutu: { x, y, z, xe, ye, ze } (mm), cizgiler: [{ yon: 'ust'|'sol'|'sag'|'on'|'arka', mm, metin, parca }] }
   * ya da null. belir: çizgiler kısa bir sürede belirerek açılır.
   */
  olculeriAyarla(bilgi, { belir = false } = {}) {
    this._olcuTemizle();
    this._olcuBilgisi = bilgi;
    if (!bilgi || !bilgi.kutu) {
      this.kirli = true;
      return;
    }
    const V = THREE.Vector3;
    const k = bilgi.kutu;
    const ust = k.ye * MM;
    const mx = ((k.x + k.xe) / 2) * MM;
    const mz = ((k.z + k.ze) / 2) * MM;
    // Yan çizgiler kutunun boyunca farklı yerlerden çıkar: yazılar üst üste toplanmasın
    const zSol = (k.z + (k.ze - k.z) * 0.3) * MM;
    const zSag = (k.z + (k.ze - k.z) * 0.7) * MM;
    const tik = 0.06;
    const duvar = [];
    const parca = [];
    const g = new THREE.Group();
    const levhalar = [];
    const kullanilan = new Set();
    for (const c of bilgi.cizgiler) {
      if (!(c.mm > 0)) continue;
      const m = c.mm * MM;
      let a;
      let b;
      let ty;
      if (c.yon === 'ust') [a, b, ty] = [new V(mx, ust, mz), new V(mx, ust + m, mz), new V(1, 0, 0)];
      else if (c.yon === 'sol') [a, b, ty] = [new V(k.x * MM, ust, zSol), new V(k.x * MM - m, ust, zSol), new V(0, 0, 1)];
      else if (c.yon === 'sag') [a, b, ty] = [new V(k.xe * MM, ust, zSag), new V(k.xe * MM + m, ust, zSag), new V(0, 0, 1)];
      else if (c.yon === 'on') [a, b, ty] = [new V(mx, ust, k.z * MM), new V(mx, ust, k.z * MM - m), new V(1, 0, 0)];
      else if (c.yon === 'arka') [a, b, ty] = [new V(mx, ust, k.ze * MM), new V(mx, ust, k.ze * MM + m), new V(1, 0, 0)];
      else continue;
      const liste = c.parca ? parca : duvar;
      liste.push(a.x, a.y, a.z, b.x, b.y, b.z);
      for (const u of [a, b]) liste.push(u.x - ty.x * tik, u.y - ty.y * tik, u.z - ty.z * tik, u.x + ty.x * tik, u.y + ty.y * tik, u.z + ty.z * tik);
      const anahtar = `${c.metin}|${c.parca ? 1 : 0}`;
      kullanilan.add(anahtar);
      const { doku, oran } = this._olcuDokusu(c.metin, c.parca, anahtar);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: doku, transparent: true, depthTest: false, toneMapped: false, sizeAttenuation: false }));
      sp.position.copy(a).lerp(b, 0.5);
      sp.userData.oran = oran;
      sp.renderOrder = 12;
      g.add(sp);
      levhalar.push(sp);
    }
    const malz = [];
    const cizgiEkle = (konum, renk, opaklik) => {
      if (!konum.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(konum, 3));
      const mat = new THREE.LineBasicMaterial({ color: renk, transparent: true, opacity: opaklik, depthTest: false, toneMapped: false });
      const l = new THREE.LineSegments(geo, mat);
      l.renderOrder = 11;
      g.add(l);
      malz.push(mat);
    };
    cizgiEkle(duvar, VURGU, 1);
    cizgiEkle(parca, this.acikTema ? 0x3d4860 : 0xdfe8f5, 0.95);
    // Ölçülen kutunun kesik çizgili dış hattı (tek parçada seçim çerçevesi zaten var)
    if (bilgi.cerceve !== false) {
      const kenar = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry((k.xe - k.x) * MM + 0.02, (k.ye - k.y) * MM + 0.02, (k.ze - k.z) * MM + 0.02)),
        new THREE.LineDashedMaterial({ color: VURGU, dashSize: 0.1, gapSize: 0.07, transparent: true, opacity: 0.7, depthTest: false, toneMapped: false })
      );
      kenar.computeLineDistances();
      kenar.position.set(mx, ((k.y + k.ye) / 2) * MM, mz);
      kenar.renderOrder = 10;
      g.add(kenar);
      malz.push(kenar.material);
    }
    levhalar.forEach((sp) => malz.push(sp.material));
    this.duzenGrubu.add(g);
    this.olcu = { g, malz, levhalar, temel: malz.map((m) => m.opacity) };
    this._olcuYaziOlcegi();
    this._olcuDokuAyikla(kullanilan);
    if (belir && !this.azHareket) {
      this._tweenIptal('olcu');
      const o = this.olcu;
      o.malz.forEach((m) => (m.opacity = 0));
      this._tween({
        etiket: 'olcu',
        sure: 240,
        adim: (s) => {
          if (this.olcu !== o) return;
          const e = kolay.disKup(s);
          o.malz.forEach((m, i) => (m.opacity = o.temel[i] * e));
        },
      });
    }
    this.kirli = true;
  }

  /**
   * Ölçü yazıları ekranda çakışırsa sonraki yazı yukarı, aşağı ya da yana kayar (yazı boyu kadar).
   * Kamera her değiştiğinde, çizimden hemen önce çalışır; beş yazı için ucuzdur.
   */
  _olcuCakismaCoz() {
    if (!this.olcu || !this.olcu.levhalar.length || !this.genislik) return;
    const v = new THREE.Vector3();
    const yerlesen = [];
    const h = OLCU_YAZI_PX;
    const adaylar = [[0, 0], [0, -1.15], [0, 1.15], [0.6, -1.15], [-0.6, 1.15], [0, -2.3], [0, 2.3], [1.05, 0], [-1.05, 0]];
    for (const sp of this.olcu.levhalar) {
      v.copy(sp.position).project(this.kamera);
      const px = ((v.x + 1) / 2) * this.genislik;
      const py = ((1 - v.y) / 2) * this.yukseklik;
      const w = h * sp.userData.oran;
      const kutu = ([ax, ay]) => {
        const x0 = px + ax * w - w / 2;
        const y0 = py + ay * h - h / 2;
        return { x0, y0, x1: x0 + w + 4, y1: y0 + h + 3 };
      };
      const bos = (b) => !yerlesen.some((q) => b.x0 < q.x1 && q.x0 < b.x1 && b.y0 < q.y1 && q.y0 < b.y1);
      const sec = adaylar.find((a) => bos(kutu(a))) || adaylar[0];
      yerlesen.push(kutu(sec));
      // Sprite merkezi kendi boyu cinsinden kaydırılır: x sağa, y ekranda aşağı
      sp.center.set(0.5 - sec[0], 0.5 + sec[1]);
    }
  }

  /** Ölçü yazıları ekranda sabit boyda kalır (uzaklıktan bağımsız) */
  _olcuYaziOlcegi() {
    if (!this.olcu || !this.yukseklik) return;
    const h = (OLCU_YAZI_PX / this.yukseklik) * 2 * Math.tan(THREE.MathUtils.degToRad(this.kamera.fov / 2));
    for (const sp of this.olcu.levhalar) sp.scale.set(h * sp.userData.oran, h, 1);
  }

  _olcuDokusu(metin, parca, anahtar) {
    let d = this._olcuDokulari.get(anahtar);
    if (!d) {
      d = yaziDokusu(metin, {
        renk: '#FFFFFF',
        zemin: parca ? 'rgba(40, 48, 70, 0.92)' : 'rgba(9, 16, 34, 0.9)',
        kenar: parca ? 'rgba(201, 206, 214, 0.7)' : 'rgba(58, 191, 240, 0.95)',
        boyut: 40,
        kalin: 700,
        dolgu: 0.5,
      });
      this._olcuDokulari.set(anahtar, d);
    }
    return d;
  }

  /** Yazı dokusu önbelleği büyüyünce (sürüklemede her ölçü yeni yazıdır) kullanılmayanlar atılır */
  _olcuDokuAyikla(kullanilan) {
    if (this._olcuDokulari.size < 160) return;
    for (const [a, d] of this._olcuDokulari) {
      if (kullanilan.has(a)) continue;
      d.doku.dispose();
      this._olcuDokulari.delete(a);
    }
  }

  _olcuTemizle() {
    this._tweenIptal('olcu');
    if (!this.olcu) return;
    this.duzenGrubu.remove(this.olcu.g);
    // Sprite geometrisi bütün sprite'larda ortaktır, bırakılmaz
    this.olcu.g.traverse((o) => o.geometry && !o.isSprite && o.geometry.dispose());
    this.olcu.malz.forEach((m) => m.dispose());
    this.olcu = null;
  }

  // ------------------------------------------------------------------ yakınlaştırma ve odak

  /** 0 (en uzak) ile 1 (en yakın) arası, uzaklığın logaritmasıyla */
  yakinlik() {
    const d = this.kamera.position.distanceTo(this.kontrol.target);
    const a = Math.log(this.kontrol.minDistance);
    const b = Math.log(this.kontrol.maxDistance);
    return Math.max(0, Math.min(1, 1 - (Math.log(Math.max(d, 1e-3)) - a) / (b - a)));
  }

  /** Kamerayı bakış yönünü koruyarak verilen yakınlığa getirir */
  yakinlikAyarla(v, { sure = 0 } = {}) {
    const a = Math.log(this.kontrol.minDistance);
    const b = Math.log(this.kontrol.maxDistance);
    const d = Math.exp(b - Math.max(0, Math.min(1, v)) * (b - a));
    const hedef = this.kontrol.target.clone();
    const yon = this.kamera.position.clone().sub(hedef).normalize();
    this.elleDegisti = true;
    this._kameraGit(hedef.clone().addScaledVector(yon, d), hedef, this.azHareket ? 0 : sure);
  }

  /** Düğmeler ve klavye: adım kadar yaklaşır (+) ya da uzaklaşır (−) */
  yakinlastir(adim) {
    this.yakinlikAyarla(this.yakinlik() + adim, { sure: 260 });
  }

  /** Parçayı ortalar ve yakınlaşır; sec ise parça seçilir (seçimi plan ekranı kurar, tablo da aynı satırı seçer) */
  odaklan(sira, { sec = true } = {}) {
    const p = this.parcalar.find((x) => x.veri.sira === sira);
    if (!p) return;
    if (sec) this.geri.parcaTiklandi?.(p.anahtar, { ctrl: false });
    const kutu = new THREE.Box3().setFromCenterAndSize(p.hedef, p.boy);
    const yon = this.kamera.position.clone().sub(this.kontrol.target).normalize();
    const { konum, hedef } = this._kadraj(yon, kutu, 2.4);
    this.elleDegisti = true;
    this._kameraGit(konum, hedef, this.azHareket ? 0 : 650);
  }

  _yakinlikBildir() {
    if (!this.geri.yakinlikDegisti) return;
    const v = this.yakinlik();
    if (Math.abs(v - this.sonYakinlik) < 0.002) return;
    this.sonYakinlik = v;
    this.geri.yakinlikDegisti(v);
  }

  // ------------------------------------------------------------------ tema ve görüntü

  /** Açık temada ızgara, çizgi ve yazı renkleri açık zemine göre */
  temaAyarla(acik) {
    if (this.acikTema === acik) return;
    this.acikTema = acik;
    this.model?.zeminModu?.(acik);
    if (this.model) this._zeminKur();
    this.kirli = true;
  }

  /**
   * Ekrandaki görünümün PNG'si: aynı kamera ve adım, verilen ölçekte, tema zemini dolu.
   * zemin: [üst renk, alt renk]
   */
  ekranGoruntusu({ olcek = 2, zemin = ['#1C2D57', '#0E172E'] } = {}) {
    const r = this.renderer;
    const eskiOran = r.getPixelRatio();
    const boyut = r.getSize(new THREE.Vector2());
    r.setPixelRatio(olcek);
    r.setSize(boyut.x, boyut.y, false);
    r.render(this.sahne, this.kamera);
    const tuval = document.createElement('canvas');
    tuval.width = r.domElement.width;
    tuval.height = r.domElement.height;
    const x = tuval.getContext('2d');
    const egim = x.createLinearGradient(0, 0, 0, tuval.height);
    egim.addColorStop(0, zemin[0]);
    egim.addColorStop(1, zemin[1]);
    x.fillStyle = egim;
    x.fillRect(0, 0, tuval.width, tuval.height);
    x.drawImage(r.domElement, 0, 0);
    r.setPixelRatio(eskiOran);
    r.setSize(boyut.x, boyut.y, false);
    r.render(this.sahne, this.kamera);
    return tuval.toDataURL('image/png');
  }

  // ------------------------------------------------------------------ kamera

  _sinir() {
    const k = new THREE.Box3();
    if (this.model) k.union(this.model.sinir);
    if (k.isEmpty()) k.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    return k;
  }

  /** Kutuyu verilen yönden kadraja tam sığdıran kamera konumu */
  _kadraj(yon, kutu, pay = 1.08) {
    const merkez = kutu.getCenter(new THREE.Vector3());
    const ileri = yon.clone().negate();
    const sag = new THREE.Vector3().crossVectors(ileri, new THREE.Vector3(0, 1, 0)).normalize();
    const yukari = new THREE.Vector3().crossVectors(sag, ileri).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.kamera.fov / 2));
    const tanH = tanV * this.kamera.aspect;
    let uzaklik = 0;
    for (let i = 0; i < 8; i += 1) {
      const kose = new THREE.Vector3(
        i & 1 ? kutu.max.x : kutu.min.x,
        i & 2 ? kutu.max.y : kutu.min.y,
        i & 4 ? kutu.max.z : kutu.min.z
      ).sub(merkez);
      const d = kose.dot(yon);
      uzaklik = Math.max(uzaklik, d + Math.abs(kose.dot(sag)) / tanH, d + Math.abs(kose.dot(yukari)) / tanV);
    }
    uzaklik *= pay;
    return { konum: merkez.clone().addScaledVector(yon, uzaklik), hedef: merkez };
  }

  /** Görünüm düğmeleri: izometrik, yandan, üstten, arkadan, sigdir */
  gorunum(ad, { sure = 750 } = {}) {
    let yon;
    if (ad === 'sigdir') {
      yon = this.kamera.position.clone().sub(this.kontrol.target).normalize();
    } else {
      yon = YONLER[ad] || YONLER.izometrik;
      this.gorunumAdi = ad;
    }
    this.elleDegisti = false;
    const { konum, hedef } = this._kadraj(yon, this._sinir(), this._pay(ad === 'sigdir' ? this.gorunumAdi : ad));
    this._kameraGit(konum, hedef, this.azHareket ? 0 : sure);
  }

  _kameraGit(konum, hedef, sure, kolaylik = kolay.icDisKup) {
    this._tweenIptal('kamera');
    if (!sure) {
      this.kamera.position.copy(konum);
      this.kontrol.target.copy(hedef);
      this.kontrol.update();
      this.kirli = true;
      return;
    }
    const basHedef = this.kontrol.target.clone();
    const s1 = new THREE.Spherical().setFromVector3(this.kamera.position.clone().sub(basHedef));
    const s2 = new THREE.Spherical().setFromVector3(konum.clone().sub(hedef));
    let dT = s2.theta - s1.theta;
    if (dT > Math.PI) dT -= Math.PI * 2;
    if (dT < -Math.PI) dT += Math.PI * 2;
    const ara = new THREE.Spherical();
    const h = new THREE.Vector3();
    this.kontrol.enableDamping = false;
    this._tween({
      etiket: 'kamera',
      sure,
      adim: (k) => {
        const e = kolaylik(k);
        ara.set(s1.radius + (s2.radius - s1.radius) * e, s1.phi + (s2.phi - s1.phi) * e, s1.theta + dT * e);
        h.lerpVectors(basHedef, hedef, e);
        this.kontrol.target.copy(h);
        this.kamera.position.setFromSpherical(ara).add(h);
        this.kamera.lookAt(h);
      },
      bitti: () => {
        this.kontrol.enableDamping = true;
        this.kontrol.update();
      },
      iptal: () => {
        this.kontrol.enableDamping = true;
      },
    });
  }

  /** İlk açılışta kamera yukarıdan ve uzaktan araca süzülerek gelir */
  _giris() {
    if (!this.model || !this.genislik) return;
    this.girisYapildi = true;
    this.gorunumAdi = 'izometrik';
    const { konum, hedef } = this._kadraj(YONLER.izometrik, this._sinir(), 1.0);
    if (this.azHareket) {
      this._kameraGit(konum, hedef, 0);
      return;
    }
    const s = new THREE.Spherical().setFromVector3(konum.clone().sub(hedef));
    s.radius *= 2.1;
    s.theta -= 1.0;
    s.phi = Math.max(0.25, s.phi * 0.55);
    this.kamera.position.setFromSpherical(s).add(hedef);
    this.kontrol.target.copy(hedef);
    this.kamera.lookAt(hedef);
    this._kameraGit(konum, hedef, 1800, kolay.disKup);
  }

  // ------------------------------------------------------------------ döngü

  _tween(tw) {
    tw.bas = performance.now() + (tw.gecikme || 0);
    this.tweenler.push(tw);
    this.kirli = true;
  }

  _tweenIptal(etiket) {
    this.tweenler = this.tweenler.filter((tw) => {
      if (tw.etiket !== etiket) return true;
      tw.iptal?.();
      return false;
    });
  }

  _tweenleriIsle(an) {
    if (!this.tweenler.length) return false;
    const liste = this.tweenler;
    this.tweenler = []; // işlenirken eklenen yeni tweenler buraya düşer
    const kalan = [];
    for (const tw of liste) {
      if (an < tw.bas) {
        kalan.push(tw);
        continue;
      }
      if (!tw.basladi) {
        tw.basladi = true;
        tw.basla?.();
      }
      const k = tw.sure > 0 ? Math.min(1, (an - tw.bas) / tw.sure) : 1;
      tw.adim?.(k);
      if (k < 1) kalan.push(tw);
      else tw.bitti?.();
    }
    this.tweenler = kalan.concat(this.tweenler);
    return true;
  }

  _dongu(an) {
    this.istek = requestAnimationFrame(this._dongu);
    if (!this.etkin || !this.genislik) return;
    const tweenVar = this._tweenleriIsle(an);
    const kontrolDegisti = this.kontrol.update();
    if (tweenVar || kontrolDegisti || this.kirli) {
      this.kirli = false;
      this._olcuCakismaCoz();
      this.renderer.render(this.sahne, this.kamera);
      this._yakinlikBildir();
    }
  }

  _boyutla() {
    const g = this.kap.clientWidth;
    const y = this.kap.clientHeight;
    if (!g || !y) return;
    if (g === this.genislik && y === this.yukseklik) return;
    this.genislik = g;
    this.yukseklik = y;
    this.renderer.setSize(g, y, false);
    this.kamera.aspect = g / y;
    this.kamera.updateProjectionMatrix();
    this._olcuYaziOlcegi();
    this.kirli = true;
    if (!this.girisYapildi && this.model) this._giris();
    else if (this.model && !this.elleDegisti && !this.tweenler.some((tw) => tw.etiket === 'kamera')) {
      // Kullanıcı kamerayı oynatmadıysa yeni boyuta göre yeniden sığdır
      const { konum, hedef } = this._kadraj(YONLER[this.gorunumAdi] || YONLER.izometrik, this._sinir(), this._pay(this.gorunumAdi));
      this.kamera.position.copy(konum);
      this.kontrol.target.copy(hedef);
      this.kontrol.update();
    }
    // Boyut değişince tuval temizlenir; boş kare görünmesin diye hemen çizilir
    if (this.etkin) this.renderer.render(this.sahne, this.kamera);
  }

  _pay(ad) {
    return { izometrik: 1.0, yandan: 1.1, ustten: 1.1, arkadan: 1.35 }[ad] || 1.06;
  }

  /** Görünüm gizliyken çizimi durdurur */
  etkinlestir(acik) {
    this.etkin = acik;
    if (acik) {
      this._boyutla();
      this.kirli = true;
    }
  }

  /**
   * Rapor için açık zeminli görüntü: bütün parçalar yerinde, seçim yok, verilen görünüm ve boyut.
   * Ekrandaki görünüm (boyut, kamera, adım, seçim) aynı karede geri yüklenir; ekranda titreme olmaz.
   * Döner: PNG veri adresi
   */
  goruntuAl(ad = 'izometrik', { genislik = 1600, yukseklik = 860 } = {}) {
    if (!this.model) return null;
    const r = this.renderer;
    const eski = {
      boyut: r.getSize(new THREE.Vector2()),
      oran: r.getPixelRatio(),
      konum: this.kamera.position.clone(),
      hedef: this.kontrol.target.clone(),
      adim: this.adim,
      secim: [...this._secimAnahtarlari],
      odak: this._odak,
      ihlal: this._ihlalHaritasi,
    };
    this._tweenIptal('parca');
    this._tweenIptal('kamera');
    this._tweenIptal('konum');
    this._tweenIptal('sars');
    // Raporda düzenleme izleri (seçim, kırmızı ihlal, ölçü çizgisi) görünmez
    this._ihlalHaritasi = new Map();
    this.secimAyarla([], { odak: true });
    this.duzenGrubu.visible = false;
    this.parcalar.forEach((p) => {
      this._yerinde(p, true);
      p.grup.quaternion.identity();
    });
    this._isaretleriGoster(true);

    const havuz = this.zeminGrubu.getObjectByName('havuz');
    if (havuz) havuz.visible = false;
    this.model.zeminModu?.(true);
    r.setClearColor(0xffffff, 1);
    r.setPixelRatio(1);
    r.setSize(genislik, yukseklik, false);
    this.kamera.aspect = genislik / yukseklik;
    this.kamera.updateProjectionMatrix();
    const { konum, hedef } = this._kadraj(YONLER[ad] || YONLER.izometrik, this._sinir(), this._pay(ad) * 0.98);
    this.kamera.position.copy(konum);
    this.kamera.lookAt(hedef);
    r.render(this.sahne, this.kamera);
    const veri = r.domElement.toDataURL('image/png');

    // Geri yükle
    if (havuz) havuz.visible = !this.acikTema;
    this.model.zeminModu?.(this.acikTema);
    r.setClearColor(0x000000, 0);
    r.setPixelRatio(eski.oran);
    r.setSize(eski.boyut.x, eski.boyut.y, false);
    this.kamera.aspect = eski.boyut.x / Math.max(1, eski.boyut.y);
    this.kamera.updateProjectionMatrix();
    this.kamera.position.copy(eski.konum);
    this.kontrol.target.copy(eski.hedef);
    this.kamera.lookAt(eski.hedef);
    this.adimaGit(eski.adim, { animasyon: false });
    this.duzenGrubu.visible = true;
    this._ihlalHaritasi = eski.ihlal;
    this.secimAyarla(eski.secim, { odak: eski.odak });
    r.render(this.sahne, this.kamera);
    this.kirli = true;
    return veri;
  }

  yokEt() {
    cancelAnimationFrame(this.istek);
    this.durdur();
    this.gozlemci.disconnect();
    this._parcalariTemizle();
    this._olcuTemizle();
    this._olcuDokulari.forEach((d) => d.doku.dispose());
    this._olcuDokulari.clear();
    if (this.hayalet) {
      this.hayalet.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
    }
    this.cerceveMat.dispose();
    this._kirmiziMat?.dispose();
    if (this.model) this.model.temizle();
    this.ortam.dispose();
    this.kontrol.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
