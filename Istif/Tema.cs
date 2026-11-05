using System.Windows.Media;
using Microsoft.Win32;

namespace Istif;

/// <summary>
/// Kabuğun teması: başlık çubuğu, açılış ekranı, pencere kenarı ve WebView2 zemini.
/// Ayar "sistem", "koyu" ya da "acik"; "sistem" Windows'un uygulama temasını izler.
/// Arayüz (web) aynı ayarı kendisi uygular; "sistem" seçiliyken o da prefers-color-scheme ile Windows'u izler.
/// </summary>
internal static class Tema
{
    public static readonly IReadOnlyList<string> Ayarlar = new[] { "sistem", "koyu", "acik" };

    private const string KisiselAnahtar = @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";

    /// <summary>Kullanıcının seçimi.</summary>
    public static string Ayar { get; private set; } = "sistem";

    /// <summary>Etkin tema açık mı?</summary>
    public static bool Acik { get; private set; }

    /// <summary>Etkin tema değişince tetiklenir.</summary>
    public static event Action? Degisti;

    public static void Ayarla(string? ayar)
    {
        Ayar = ayar is not null && Ayarlar.Contains(ayar) ? ayar : "sistem";
        Hesapla();
    }

    /// <summary>Windows'un renk ayarı değişince (WM_SETTINGCHANGE "ImmersiveColorSet") çağrılır.</summary>
    public static void SistemDegisti()
    {
        if (Ayar == "sistem") Hesapla();
    }

    private static void Hesapla()
    {
        bool acik = Ayar switch
        {
            "acik" => true,
            "koyu" => false,
            _ => SistemAcikMi(),
        };
        if (acik == Acik && _hesaplandi) return;
        _hesaplandi = true;
        Acik = acik;
        Degisti?.Invoke();
    }

    private static bool _hesaplandi;

    /// <summary>Windows uygulamalar için açık temada mı? (yalnız okunur; değer yoksa koyu sayılır)</summary>
    private static bool SistemAcikMi()
    {
        try
        {
            using var anahtar = Registry.CurrentUser.OpenSubKey(KisiselAnahtar);
            return anahtar?.GetValue("AppsUseLightTheme") is int deger && deger != 0;
        }
        catch (Exception ex) when (ex is System.Security.SecurityException or UnauthorizedAccessException or IOException)
        {
            return false;
        }
    }

    // ---------------------------------------------------------------- renkler

    /// <summary>Başlık çubuğu zemini.</summary>
    public static Color BaslikZemin => Acik ? Color.FromRgb(0xFF, 0xFF, 0xFF) : Color.FromRgb(0x1D, 0x2B, 0x4D);

    /// <summary>Ürün adı.</summary>
    public static Color BaslikYazi => Acik ? Color.FromRgb(0x14, 0x1C, 0x30) : Color.FromRgb(0xF2, 0xF4, 0xF7);

    /// <summary>Belge adı (başlık çubuğunda soluk yazı).</summary>
    public static Color BelgeYazi => Acik ? Color.FromRgb(0x5A, 0x65, 0x7A) : Color.FromRgb(0x8A, 0x92, 0x9E);

    /// <summary>Başlık düğmelerinin simge rengi ve üstüne gelince.</summary>
    public static Color DugmeYazi => Acik ? Color.FromRgb(0x3D, 0x48, 0x60) : Color.FromRgb(0xC9, 0xCE, 0xD6);
    public static Color DugmeYaziUstunde => Acik ? Color.FromRgb(0x14, 0x1C, 0x30) : Colors.White;
    public static Color DugmeUstunde => Acik ? Color.FromArgb(0x14, 0x0F, 0x18, 0x30) : Color.FromArgb(0x1A, 0xFF, 0xFF, 0xFF);
    public static Color DugmeBasili => Acik ? Color.FromArgb(0x24, 0x0F, 0x18, 0x30) : Color.FromArgb(0x29, 0xFF, 0xFF, 0xFF);

    /// <summary>Pencere kenarı (Windows 10'da çizilen 1 px, Windows 11'de DWM kenar rengi).</summary>
    public static Color Kenar => Acik ? Color.FromRgb(0xC9, 0xD1, 0xDE) : Color.FromRgb(0x2A, 0x3A, 0x63);

    /// <summary>Arayüz yüklenene kadar görünen zemin; web'deki --zemin ile aynı.</summary>
    public static System.Drawing.Color WebZemin => Acik
        ? System.Drawing.Color.FromArgb(255, 0xF3, 0xF5, 0xF9)
        : System.Drawing.Color.FromArgb(255, 0x0F, 0x18, 0x30);
}
