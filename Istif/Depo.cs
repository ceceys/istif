using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Istif;

/// <summary>
/// Kayıt yerleri ve dosya yazma. Kütüphane, son planlar ve ayarlar %APPDATA%\Istif\ altında;
/// WebView2 önbelleği ve günlük %LOCALAPPDATA%\Istif\ altında durur.
/// </summary>
internal static class Depo
{
    public static readonly JsonSerializerOptions JsonAyar = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping, // Türkçe harfler okunur kalsın
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    private static readonly UTF8Encoding Utf8 = new(encoderShouldEmitUTF8Identifier: false);

    public const long EnFazlaDosya = 50L * 1024 * 1024;

    public static string Klasor { get; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), Urun.KisaAd);

    public static string YerelKlasor { get; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Urun.KisaAd);

    public static string KutuphaneYolu => Path.Combine(Klasor, "kutuphane.json");
    public static string SonPlanlarYolu => Path.Combine(Klasor, "son-planlar.json");
    public static string AyarlarYolu => Path.Combine(Klasor, "ayarlar.json");

    /// <summary>Açık planın otomatik taslağı; program olağan kapanınca silinir, çökmeden sonra kalır.</summary>
    public static string TaslakYolu => Path.Combine(Klasor, "taslak.json");
    public static string WebView2Klasoru => Path.Combine(YerelKlasor, "WebView2");
    public static string GunlukYolu => Path.Combine(YerelKlasor, "gunluk.txt");

    /// <summary>Önce geçici dosyaya yazar, sonra yerine taşır; yarıda kalan yazma eski dosyayı bozmaz.</summary>
    public static void GuvenliYaz(string yol, string icerik)
    {
        var klasor = Path.GetDirectoryName(Path.GetFullPath(yol))!;
        Directory.CreateDirectory(klasor);
        var gecici = Path.Combine(klasor, "." + Path.GetFileName(yol) + ".yaziliyor");
        File.WriteAllText(gecici, icerik, Utf8);
        File.Move(gecici, yol, overwrite: true);
    }

    public static string MetinOku(string yol)
    {
        var bilgi = new FileInfo(yol);
        if (bilgi.Length > EnFazlaDosya) throw new KullaniciHatasi(Metinler.DosyaCokBuyuk);
        return File.ReadAllText(yol, Encoding.UTF8);
    }

    /// <summary>JSON dosyasını okur; yoksa ya da bozuksa null döner.</summary>
    public static JsonElement? JsonOku(string yol)
    {
        try
        {
            if (!File.Exists(yol)) return null;
            using var belge = JsonDocument.Parse(MetinOku(yol));
            return belge.RootElement.Clone();
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            Gunluk.Yaz($"Okunamadı: {yol}: {ex.Message}");
            return null;
        }
    }

    public static void JsonYaz(string yol, JsonElement veri) =>
        GuvenliYaz(yol, JsonSerializer.Serialize(veri, JsonAyar));

    public static T? NesneOku<T>(string yol) where T : class
    {
        try
        {
            return File.Exists(yol) ? JsonSerializer.Deserialize<T>(MetinOku(yol), JsonAyar) : null;
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException or NotSupportedException)
        {
            Gunluk.Yaz($"Okunamadı: {yol}: {ex.Message}");
            return null;
        }
    }

    public static void NesneYaz<T>(string yol, T nesne)
    {
        try
        {
            GuvenliYaz(yol, JsonSerializer.Serialize(nesne, JsonAyar));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Gunluk.Yaz($"Yazılamadı: {yol}: {ex.Message}");
        }
    }

    public static Ayarlar AyarlarOku() => NesneOku<Ayarlar>(AyarlarYolu) ?? new Ayarlar();

    public static void AyarlarYaz(Ayarlar a) => NesneYaz(AyarlarYolu, a);

    /// <summary>Ayarları okuyup değiştirir ve yazar.</summary>
    public static void AyarDegistir(Action<Ayarlar> degistir)
    {
        var a = AyarlarOku();
        degistir(a);
        AyarlarYaz(a);
    }
}

/// <summary>%APPDATA%\Istif\ayarlar.json</summary>
internal sealed class Ayarlar
{
    public bool GuncellemeDenetimi { get; set; } = true;
    public DateTime? SonGuncellemeDenetimi { get; set; }
    public string? SonKlasor { get; set; }
    public PencereKonumu? Pencere { get; set; }

    /// <summary>"sistem" ya da dil kodu (tr, en, de…).</summary>
    public string Dil { get; set; } = "sistem";

    /// <summary>"sistem", "koyu" ya da "acik".</summary>
    public string Tema { get; set; } = "sistem";

    /// <summary>"metrik" (cm, kg) ya da "imperial" (in, lb). Motor her zaman mm ve kg ile çalışır.</summary>
    public string Birim { get; set; } = "metrik";

    /// <summary>
    /// "acik" (her zaman), "sistem" (Windows'un animasyon efektleri ayarı) ya da "kapali".
    /// Varsayılan "acik": Windows'ta animasyonlar kapalı olsa da program hareketli çalışır.
    /// </summary>
    public string Animasyon { get; set; } = "acik";

    /// <summary>Yeni planda seçili gelen araç (hazır tip ya da kütüphanedeki araç kimliği); null = Standart Tır.</summary>
    public string? VarsayilanArac { get; set; }
}

internal sealed class PencereKonumu
{
    public double Sol { get; set; }
    public double Ust { get; set; }
    public double Genislik { get; set; }
    public double Yukseklik { get; set; }
    public bool Buyuk { get; set; }
}

/// <summary>İletisi doğrudan kullanıcıya gösterilebilecek hata.</summary>
internal sealed class KullaniciHatasi(string ileti) : Exception(ileti);
