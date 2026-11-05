using System.Globalization;
using System.Text.Json;

namespace Istif;

/// <summary>
/// Kabuk tarafında kullanıcıya görünen metinler (açılış ekranı, pencereler, ileti kutuları).
/// Metinler Resources\Strings.&lt;dil&gt;.json dosyalarından okunur (derlemeye gömülü, düz anahtar-değer).
/// Seçilen dilin dosyası ya da anahtarı yoksa İngilizceye, o da yoksa Türkçeye düşülür.
/// Arayüzün kendi metinleri web\js\dil\&lt;dil&gt;.js dosyalarındadır.
/// </summary>
internal static class Metinler
{
    /// <summary>Desteklenen diller; arayüzdeki js/dil.js listesiyle aynı sırada.</summary>
    public static readonly IReadOnlyList<string> Diller = new[]
    {
        "tr", "en", "de", "fr", "es", "it", "pt", "ru", "ar", "zh", "ja", "ko",
    };

    private const string Yedek = "en";
    private static readonly Dictionary<string, string> Ingilizce = Yukle(Yedek);
    private static readonly Dictionary<string, string> Turkce = Yukle("tr");
    private static Dictionary<string, string> _metinler = Ingilizce;

    /// <summary>Etkin dil kodu (dosyası bulunan dil).</summary>
    public static string Kod { get; private set; } = Yedek;

    /// <summary>"sistem" ya da bilinmeyen kodu Windows'un arayüz diline göre gerçek bir koda çevirir.</summary>
    public static string Coz(string? ayar)
    {
        if (string.IsNullOrWhiteSpace(ayar) || ayar == "sistem")
        {
            var sistem = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
            return Diller.Contains(sistem) ? sistem : Yedek;
        }
        return Diller.Contains(ayar) ? ayar : Yedek;
    }

    /// <summary>Windows'un arayüz dili desteklenen bir dilse onun kodu, değilse "en".</summary>
    public static string SistemDili => Coz("sistem");

    public static void Ayarla(string? ayar)
    {
        var kod = Coz(ayar);
        var sozluk = kod switch
        {
            "en" => Ingilizce,
            "tr" => Turkce,
            _ => Yukle(kod),
        };
        if (sozluk.Count == 0)
        {
            kod = Yedek;
            sozluk = Ingilizce;
        }
        _metinler = sozluk;
        Kod = kod;
    }

    public static string T(string anahtar)
    {
        if (_metinler.TryGetValue(anahtar, out var v) && !string.IsNullOrEmpty(v)) return v;
        if (Ingilizce.TryGetValue(anahtar, out v) && !string.IsNullOrEmpty(v)) return v;
        if (Turkce.TryGetValue(anahtar, out v) && !string.IsNullOrEmpty(v)) return v;
        return anahtar;
    }

    public static string F(string anahtar, params object?[] degerler)
    {
        var bicim = T(anahtar);
        try { return string.Format(CultureInfo.CurrentCulture, bicim, degerler); }
        catch (FormatException) { return bicim; }
    }

    private static Dictionary<string, string> Yukle(string kod)
    {
        try
        {
            using var akis = typeof(Metinler).Assembly.GetManifestResourceStream($"Istif.Resources.Strings.{kod}.json");
            if (akis is null) return new Dictionary<string, string>();
            return JsonSerializer.Deserialize<Dictionary<string, string>>(akis) ?? new Dictionary<string, string>();
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            Gunluk.Yaz($"Dil dosyası okunamadı ({kod}): {ex.Message}");
            return new Dictionary<string, string>();
        }
    }

    // ---------------------------------------------------------------- kısa yollar

    public static string AltBaslik => T("acilis.altBaslik");
    public static string SurumEtiketi(string surum) => F("acilis.surum", surum);

    // Dosya pencereleri
    public static string PlanFiltresi => F("dosya.planFiltresi", Urun.Ad, Urun.Uzanti);
    public static string PdfFiltresi => T("dosya.pdfFiltresi");
    public static string PlanKaydetBaslik => T("dosya.planKaydetBaslik");
    public static string PlanAcBaslik => T("dosya.planAcBaslik");
    public static string PdfKaydetBaslik => T("dosya.pdfKaydetBaslik");
    public static string VarsayilanPlanAdi => T("dosya.varsayilanPlanAdi");
    public static string TabloFiltresi => T("dosya.tabloFiltresi");
    public static string XlsxFiltresi => T("dosya.xlsxFiltresi");
    public static string JsonFiltresi => T("dosya.jsonFiltresi");
    public static string PngFiltresi => T("dosya.pngFiltresi");
    public static string TabloAcBaslik => T("dosya.tabloAcBaslik");
    public static string JsonAcBaslik => T("dosya.jsonAcBaslik");
    public static string DosyaKaydetBaslik => T("dosya.kaydetBaslik");

    // Hatalar (arayüze döner)
    public static string DosyaBulunamadi => T("hata.dosyaBulunamadi");
    public static string GecersizPlan => T("hata.gecersizPlan");
    public static string DosyaCokBuyuk => T("hata.dosyaCokBuyuk");
    public static string DosyaIslemHatasi => T("hata.dosyaIslem");
    public static string GecersizVeri => T("hata.gecersizVeri");
    public static string GuncellemeIndirilemedi => T("hata.guncellemeIndirilemedi");
    public static string PdfOlusmadi => T("hata.pdfOlusmadi");
    public static string IzinsizBaglanti => T("hata.izinsizBaglanti");
    public static string BilinmeyenIstek => T("hata.bilinmeyenIstek");
    public static string BeklenmeyenHata => T("hata.beklenmeyen");
    public static string GuncellemeYok => T("hata.guncellemeYok");

    // İleti kutuları
    public static string WebView2Yok => T("ileti.webView2Yok");
    public static string AcilisHatasi(string gunlukYolu) => F("ileti.acilisHatasi", gunlukYolu);
    public static string KaydedilmemisCikis => T("ileti.kaydedilmemisCikis");
}
