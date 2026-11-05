using System.Diagnostics;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;

namespace Istif;

/// <summary>
/// Açılış sırası: açılış ekranı görünür → ana pencere ekran dışında WebView2'yi hazırlar →
/// en az 1,5 sn sonra açılış ekranı solar ve ana pencere yerine gelir.
/// Komut satırı: "plan.istif" dosyayı açar, "--cevrimdisi" güncelleme denetimini kapatır.
/// Yalnız Debug derlemesinde: --pdf-dene "cikti.pdf", --duzenle-dene "klasör", --dil xx, --tema acik|koyu,
/// --animasyon acik|sistem|kapali, --uzak-hata-ayiklama &lt;port&gt;.
/// </summary>
public partial class App : Application
{
    private static readonly TimeSpan EnAzAcilis = TimeSpan.FromMilliseconds(1500);

    /// <summary>Yalnız Debug: bu oturum için dil (kayıtlı ayar değişmez).</summary>
    internal static string? DeneDil { get; private set; }

    /// <summary>Yalnız Debug: bu oturum için tema (kayıtlı ayar değişmez).</summary>
    internal static string? DeneTema { get; private set; }

    /// <summary>Yalnız Debug: WebView2 uzak hata ayıklama (CDP) portu; 127.0.0.1'e bağlanır.</summary>
    internal static int? HataAyiklamaPortu { get; private set; }

    /// <summary>Animasyon ayarının geçerli değerleri (ayarlar.json "animasyon", arayüzde js/hareket.js).</summary>
    internal static readonly string[] Animasyonlar = ["acik", "sistem", "kapali"];

    /// <summary>Yalnız Debug: bu oturum için animasyon ayarı (kayıtlı ayar değişmez).</summary>
    internal static string? DeneAnimasyon { get; private set; }

    /// <summary>
    /// Kabuktaki animasyonlar (açılış ekranı) oynasın mı: "acik" her zaman, "kapali" hiç,
    /// "sistem" Windows'un animasyon efektleri ayarına göre (arayüzdeki prefers-reduced-motion ile aynı ayar).
    /// </summary>
    internal static bool Hareketli { get; private set; } = true;

    private static bool HareketliMi(string ayar) => ayar switch
    {
        "kapali" => false,
        "sistem" => SystemParameters.ClientAreaAnimation,
        _ => true,
    };

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += BeklenmeyenHata;
        AppDomain.CurrentDomain.UnhandledException += (_, a) => Gunluk.Yaz("Beklenmeyen hata: " + a.ExceptionObject);
        TaskScheduler.UnobservedTaskException += (_, a) => { Gunluk.Yaz("Gözlenmeyen görev hatası: " + a.Exception); a.SetObserved(); };

        bool cevrimdisi = e.Args.Any(a => a.Equals("--cevrimdisi", StringComparison.OrdinalIgnoreCase));
        string? dosya = e.Args.FirstOrDefault(a =>
            a.EndsWith(Urun.Uzanti, StringComparison.OrdinalIgnoreCase) && File.Exists(a));
        string? pdfDene = null;
        string? duzenleDene = null;
#if DEBUG
        // Yalnız geliştirme ve kayıt otomasyonu
        string? Deger(string bayrak)
        {
            int i = Array.FindIndex(e.Args, a => a.Equals(bayrak, StringComparison.OrdinalIgnoreCase));
            return i >= 0 && i + 1 < e.Args.Length ? e.Args[i + 1] : null;
        }
        // --pdf-dene "cikti.pdf": örnek yükü planlar, PDF basar ve kapanır
        if (Deger("--pdf-dene") is { } pdf) pdfDene = Path.GetFullPath(pdf);
        if (pdfDene is not null) cevrimdisi = true;
        // --duzenle-dene "klasör": örnek yükte elle düzenleme senaryosu oynatılır, her adımın görüntüsü klasöre yazılır
        if (Deger("--duzenle-dene") is { } dd) duzenleDene = Path.GetFullPath(dd);
        if (duzenleDene is not null) cevrimdisi = true;
        if (Deger("--dil") is { } dil && Metinler.Diller.Contains(dil)) DeneDil = dil;
        if (Deger("--tema") is { } tema && tema is "acik" or "koyu") DeneTema = tema;
        if (Deger("--animasyon") is { } anim && Animasyonlar.Contains(anim)) DeneAnimasyon = anim;
        if (int.TryParse(Deger("--uzak-hata-ayiklama"), out var port) && port is > 1024 and < 65536) HataAyiklamaPortu = port;
#endif

        var ayar = Depo.AyarlarOku();
        Metinler.Ayarla(DeneDil ?? ayar.Dil);
        Tema.Ayarla(DeneTema ?? ayar.Tema);
        Hareketli = HareketliMi(DeneAnimasyon ?? ayar.Animasyon);

        var acilis = new AcilisPenceresi();
        acilis.Show();
        var saat = Stopwatch.StartNew();

        var ana = new AnaPencere(dosya) { PdfDeneYolu = pdfDene, DuzenleDeneKlasoru = duzenleDene };
        try
        {
            await ana.HazirlaAsync();
        }
        catch (WebView2RuntimeNotFoundException ex)
        {
            Gunluk.Yaz("WebView2 bulunamadı: " + ex.Message);
            AcilisHatasi(acilis, ana, Metinler.WebView2Yok);
            return;
        }
        catch (Exception ex)
        {
            Gunluk.Yaz("Açılış hatası: " + ex);
            AcilisHatasi(acilis, ana, Metinler.AcilisHatasi(Depo.GunlukYolu));
            return;
        }

        var kalan = EnAzAcilis - saat.Elapsed;
        if (kalan > TimeSpan.Zero) await Task.Delay(kalan);

        await acilis.IlerlemeyiBitirAsync();
        var kapanis = acilis.KapanAsync();
        await Task.Delay(90); // açılış ekranı solmaya başlarken ana pencere gelsin

        MainWindow = ana;
        ShutdownMode = ShutdownMode.OnMainWindowClose;
        ana.Goster();
        await kapanis;

        if (!cevrimdisi) _ = ana.SessizGuncellemeDenetimiAsync();
    }

    private void AcilisHatasi(AcilisPenceresi acilis, AnaPencere ana, string ileti)
    {
        acilis.Close();
        ana.ZorlaKapat();
        MessageBox.Show(ileti, Urun.Ad, MessageBoxButton.OK, MessageBoxImage.Error);
        Shutdown(1);
    }

    private static void BeklenmeyenHata(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        Gunluk.Yaz("Beklenmeyen arayüz hatası: " + e.Exception);
        e.Handled = true; // tek bir hata yüzünden açık plan kaybolmasın
    }
}
