using System.Text.Json;

namespace Istif;

/// <summary>Son açılan ve kaydedilen planlar (en fazla 10): %APPDATA%\Istif\son-planlar.json</summary>
internal static class SonPlanlar
{
    private const int EnFazla = 10;

    internal sealed class Kayit
    {
        public string Yol { get; set; } = "";
        public string Ad { get; set; } = "";
        public DateTime Tarih { get; set; }
        /// <summary>Plan dosyasındaki "ozet" alanı (kartta gösterilir).</summary>
        public JsonElement? Ozet { get; set; }
    }

    private static List<Kayit> Oku() => Depo.NesneOku<List<Kayit>>(Depo.SonPlanlarYolu) ?? new List<Kayit>();

    /// <summary>Diskte hâlâ duran planlar, en yeni başta.</summary>
    public static List<Kayit> Liste() =>
        Oku().Where(k => !string.IsNullOrEmpty(k.Yol) && File.Exists(k.Yol)).Take(EnFazla).ToList();

    public static void Ekle(string yol, string json)
    {
        var tamYol = Path.GetFullPath(yol);
        string ad = Path.GetFileNameWithoutExtension(tamYol);
        JsonElement? ozet = null;
        try
        {
            using var belge = JsonDocument.Parse(json);
            var kok = belge.RootElement;
            if (kok.ValueKind == JsonValueKind.Object)
            {
                if (kok.TryGetProperty("ad", out var a) && a.ValueKind == JsonValueKind.String &&
                    !string.IsNullOrWhiteSpace(a.GetString()))
                    ad = a.GetString()!.Trim();
                if (kok.TryGetProperty("ozet", out var o) && o.ValueKind == JsonValueKind.Object)
                    ozet = o.Clone();
            }
        }
        catch (JsonException)
        {
            // Özet yoksa kart yalnız adla görünür.
        }

        var liste = Oku();
        liste.RemoveAll(k => string.Equals(k.Yol, tamYol, StringComparison.OrdinalIgnoreCase));
        liste.Insert(0, new Kayit { Yol = tamYol, Ad = ad, Tarih = DateTime.Now, Ozet = ozet });
        if (liste.Count > EnFazla) liste.RemoveRange(EnFazla, liste.Count - EnFazla);
        Depo.NesneYaz(Depo.SonPlanlarYolu, liste);
    }

    public static void Cikar(string yol)
    {
        var liste = Oku();
        if (liste.RemoveAll(k => string.Equals(k.Yol, yol, StringComparison.OrdinalIgnoreCase)) > 0)
            Depo.NesneYaz(Depo.SonPlanlarYolu, liste);
    }
}
