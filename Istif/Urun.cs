using System.Reflection;

namespace Istif;

/// <summary>
/// Ürün kimliği. Ad, kısa ad ve sürüm csproj'dan (Product, AssemblyName, Version) okunur;
/// adı değiştirmek için yalnız csproj ile web tarafındaki js/urun.js düzenlenir.
/// </summary>
internal static class Urun
{
    private static readonly Assembly Derleme = typeof(Urun).Assembly;

    /// <summary>Görünen ad, ör. "İstif".</summary>
    public static string Ad { get; } =
        Derleme.GetCustomAttribute<AssemblyProductAttribute>()?.Product ?? "Istif";

    /// <summary>ASCII kısa ad, ör. "Istif": kayıt klasörü, sanal alan adı ve güncelleme dosya adları.</summary>
    public static string KisaAd { get; } = Derleme.GetName().Name ?? "Istif";

    public static Version Surum { get; } = UcParcali(Derleme.GetName().Version);

    public static string SurumMetni => $"{Surum.Major}.{Surum.Minor}.{Surum.Build}";

    /// <summary>Plan dosyası uzantısı.</summary>
    public const string Uzanti = ".istif";

    /// <summary>Arayüzün açıldığı sanal alan adı: uygulama.istif</summary>
    public static string SanalAlan { get; } = "uygulama." + KisaAd.ToLowerInvariant();

    public static string Adres => $"https://{SanalAlan}/";

    // Güncelleme kaynağı (GitHub Releases)
    public const string GithubSahip = "ceceys";
    public const string GithubDepo = "istif";

    /// <summary>
    /// Arayüzün varsayılan tarayıcıda açtırabileceği adresler. js/urun.js'deki bağlantılarla aynıdır;
    /// güvenlik sınırı kabuk tarafında olduğu için burada ayrıca tutulur.
    /// </summary>
    public static readonly IReadOnlyList<string> IzinliBaglantilar = new[]
    {
        "https://github.com/ceceys/istif",
        "https://www.linkedin.com/in/cuma-ali-dirik",
    };

    private static HashSet<string>? _katalogBaglantilari;

    /// <summary>
    /// Araç kataloğundaki (web\veri\arac-katalogu.json) kaynak adresleri. Katalog programla gelen yerel dosyadır;
    /// içindeki https adresleri tam eşleşmeyle izinli sayılır, başka adres açılmaz.
    /// </summary>
    public static bool IzinliMi(string url)
    {
        if (IzinliBaglantilar.Contains(url, StringComparer.Ordinal)) return true;
        _katalogBaglantilari ??= KatalogBaglantilari();
        return _katalogBaglantilari.Contains(url);
    }

    private static HashSet<string> KatalogBaglantilari()
    {
        var liste = new HashSet<string>(StringComparer.Ordinal);
        try
        {
            var yol = Path.Combine(AppContext.BaseDirectory, "web", "veri", "arac-katalogu.json");
            using var belge = System.Text.Json.JsonDocument.Parse(File.ReadAllText(yol));
            if (!belge.RootElement.TryGetProperty("kayitlar", out var kayitlar) ||
                kayitlar.ValueKind != System.Text.Json.JsonValueKind.Array) return liste;
            foreach (var k in kayitlar.EnumerateArray())
            {
                if (k.ValueKind != System.Text.Json.JsonValueKind.Object) continue;
                Ekle(liste, k, "kaynak");
                if (k.TryGetProperty("ikinciKaynak", out var ikinci) && ikinci.ValueKind == System.Text.Json.JsonValueKind.Object)
                    Ekle(liste, ikinci, "url");
                if (k.TryGetProperty("ekKaynaklar", out var ek) && ek.ValueKind == System.Text.Json.JsonValueKind.Array)
                    foreach (var e in ek.EnumerateArray()) Ekle(liste, e);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.Text.Json.JsonException)
        {
            Gunluk.Yaz("Araç kataloğu okunamadı: " + ex.Message);
        }
        return liste;
    }

    private static void Ekle(HashSet<string> liste, System.Text.Json.JsonElement oge, string? alan = null)
    {
        var d = oge;
        if (alan is not null && !oge.TryGetProperty(alan, out d)) return;
        if (d.ValueKind != System.Text.Json.JsonValueKind.String) return;
        var s = d.GetString();
        if (s is not null && Uri.TryCreate(s, UriKind.Absolute, out var u) && u.Scheme == Uri.UriSchemeHttps) liste.Add(s);
    }

    private static Version UcParcali(Version? v)
    {
        v ??= new Version(0, 0, 0);
        return new Version(v.Major, v.Minor, Math.Max(0, v.Build));
    }
}
