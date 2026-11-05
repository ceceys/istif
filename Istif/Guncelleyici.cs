using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Istif;

/// <summary>
/// GitHub Releases üzerinden program içi güncelleme. Programın ağa çıktığı tek yer burasıdır.
/// Akış: releases/latest → sürüm karşılaştır → kullanıcıya sor → dosyayı indir →
/// SHA256SUMS.txt ile doğrula → kur → program yeniden açılır.
/// Depo ya da sürüm henüz yoksa (404) veya ağ yoksa sessizce "güncelleme yok" sayılır.
/// </summary>
internal static class Guncelleyici
{
    private static string DepoAdresi => $"https://api.github.com/repos/{Urun.GithubSahip}/{Urun.GithubDepo}";
    private static string SonSurumAdresi => DepoAdresi + "/releases/latest";

    private const long EnFazlaIndirme = 300L * 1024 * 1024;
    private static readonly TimeSpan DenetimAraligi = TimeSpan.FromHours(24);

    public sealed record YeniSurum(
        Version No, string Etiket, string? KurulumAdresi, string? TasinabilirAdresi, string? OzetAdresi, string Notlar)
    {
        public string NoMetni => $"{No.Major}.{No.Minor}.{No.Build}";
    }

    /// <summary>Kurulum paketiyle mi kuruldu (yanında kaldırıcı var), yoksa taşınabilir exe mi?</summary>
    public static bool Kurulu =>
        Directory.EnumerateFiles(AppContext.BaseDirectory, "unins*.exe").Any();

    // GitHub sürümündeki varlık adları (.github/workflows/build.yml ve setup\yayinla.ps1 bu adlarla üretir):
    //   Istif-Setup-1.2.0.exe   kurulum paketi (sürümsüz Istif-Setup.exe kopyası README bağlantısı içindir)
    //   Istif.exe               taşınabilir tek dosya
    //   SHA256SUMS.txt          özetler
    private static string KurulumOneki => $"{Urun.KisaAd}-Setup-";
    private static string TasinabilirAd => $"{Urun.KisaAd}.exe";
    private const string OzetDosyasi = "SHA256SUMS.txt";

    /// <summary>Sürüm notları depoda bu klasörde, Notes.&lt;dil&gt;.md adıyla durur.</summary>
    private const string NotKlasoru = "Istif/Resources";

    private static HttpClient Istemci()
    {
        var c = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        c.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue(Urun.KisaAd, Urun.SurumMetni));
        c.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        return c;
    }

    /// <summary>Açılışta çağrılır: ayar açıksa ve son denetimden 24 saat geçtiyse denetler.</summary>
    public static async Task<YeniSurum?> SessizDenetleAsync()
    {
        var ayar = Depo.AyarlarOku();
        if (!ayar.GuncellemeDenetimi) return null;
        var simdi = DateTime.Now;
        if (ayar.SonGuncellemeDenetimi is { } son && son <= simdi && simdi - son < DenetimAraligi) return null;
        Depo.AyarDegistir(a => a.SonGuncellemeDenetimi = simdi);
        return await DenetleAsync();
    }

    /// <returns>Daha yeni bir sürüm varsa onu; yoksa ya da denetlenemediyse null.</returns>
    public static async Task<YeniSurum?> DenetleAsync(CancellationToken ct = default)
    {
        try
        {
            using var http = Istemci();
            using var yanit = await http.GetAsync(SonSurumAdresi, ct);
            if (yanit.StatusCode == HttpStatusCode.NotFound) return null; // depo ya da sürüm henüz yok
            if (!yanit.IsSuccessStatusCode)
            {
                Gunluk.Yaz($"Güncelleme denetimi: HTTP {(int)yanit.StatusCode}");
                return null;
            }

            using var belge = JsonDocument.Parse(await yanit.Content.ReadAsStringAsync(ct));
            var kok = belge.RootElement;
            var etiket = kok.GetProperty("tag_name").GetString() ?? "";
            if (!Version.TryParse(etiket.TrimStart('v', 'V'), out var no)) return null;
            no = new Version(no.Major, no.Minor, Math.Max(0, no.Build));
            if (no <= Urun.Surum) return null;

            string? kurulum = null, tasinabilir = null, ozet = null;
            if (kok.TryGetProperty("assets", out var dosyalar))
            {
                foreach (var d in dosyalar.EnumerateArray())
                {
                    var ad = d.GetProperty("name").GetString() ?? "";
                    var adres = d.GetProperty("browser_download_url").GetString();
                    if (adres is null || !adres.StartsWith("https://", StringComparison.Ordinal)) continue;
                    if (ad.StartsWith(KurulumOneki, StringComparison.OrdinalIgnoreCase) &&
                        ad.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) kurulum = adres;
                    else if (ad.Equals(TasinabilirAd, StringComparison.OrdinalIgnoreCase)) tasinabilir = adres;
                    else if (ad.Equals(OzetDosyasi, StringComparison.OrdinalIgnoreCase)) ozet = adres;
                }
            }

            var notlar = await NotlariAlAsync(http, etiket, no, ct)
                ?? DuzMetin(kok.TryGetProperty("body", out var govde) ? govde.GetString() ?? "" : "");
            return new YeniSurum(no, etiket, kurulum, tasinabilir, ozet, notlar);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException
                                       or InvalidOperationException or KeyNotFoundException)
        {
            Gunluk.Yaz("Güncelleme denetlenemedi: " + ex.Message);
            return null;
        }
    }

    /// <summary>
    /// Yeni sürümün notları programın dilinde: o sürümün etiketindeki Notes.&lt;dil&gt;.md dosyasının ilk bölümü
    /// (yoksa İngilizcesi). Böylece GitHub'daki sürüm açıklaması ne olursa olsun çevrili notlar gösterilir.
    /// Bulunamazsa null; çağıran sürüm açıklamasına döner.
    /// </summary>
    private static async Task<string?> NotlariAlAsync(HttpClient http, string etiket, Version no, CancellationToken ct)
    {
        foreach (var kod in new[] { Metinler.Kod, "en" }.Distinct())
        {
            try
            {
                var adres = $"{DepoAdresi}/contents/{NotKlasoru}/Notes.{kod}.md?ref={Uri.EscapeDataString(etiket)}";
                using var yanit = await http.GetAsync(adres, ct);
                if (!yanit.IsSuccessStatusCode) continue;
                using var belge = JsonDocument.Parse(await yanit.Content.ReadAsStringAsync(ct));
                var b64 = belge.RootElement.GetProperty("content").GetString();
                if (string.IsNullOrEmpty(b64)) continue;
                var metin = Encoding.UTF8.GetString(Convert.FromBase64String(b64.Replace("\n", "")));
                var bolum = SurumBolumu(metin, $"{no.Major}.{no.Minor}.{no.Build}");
                if (!string.IsNullOrWhiteSpace(bolum)) return bolum;
            }
            catch (Exception ex) when (ex is HttpRequestException or JsonException or FormatException
                                           or KeyNotFoundException or InvalidOperationException)
            {
                Gunluk.Yaz($"Sürüm notu alınamadı ({kod}): {ex.Message}");
            }
        }
        return null;
    }

    /// <summary>
    /// Notes.&lt;dil&gt;.md biçimi: "1.1.0 — tarih" başlığı, altında "- " maddeleri; bölümler boş satırla ayrılır.
    /// İlk bölüm istenen sürümün değilse boş döner.
    /// </summary>
    public static string SurumBolumu(string metin, string surum)
    {
        var satirlar = metin.Replace("\r", "").Split('\n');
        int i = 0;
        while (i < satirlar.Length && (string.IsNullOrWhiteSpace(satirlar[i]) || satirlar[i].TrimStart().StartsWith('#'))) i++;
        if (i >= satirlar.Length || !satirlar[i].TrimStart().StartsWith(surum, StringComparison.Ordinal)) return "";
        var maddeler = new List<string>();
        for (i++; i < satirlar.Length && !string.IsNullOrWhiteSpace(satirlar[i]); i++)
        {
            var s = satirlar[i].Trim();
            maddeler.Add(s.StartsWith("- ", StringComparison.Ordinal) ? "•  " + s[2..] : s);
        }
        return string.Join("\n", maddeler);
    }

    /// <summary>Markdown sürüm açıklamasını düz metne çevirir (yedek yol).</summary>
    public static string DuzMetin(string markdown)
    {
        var s = markdown.Replace("\r", "");
        s = Regex.Replace(s, @"\[([^\]]+)\]\([^)]+\)", "$1");                // [metin](adres) → metin
        s = Regex.Replace(s, @"(\*\*|__|`)", "");                            // kalın, kod
        s = Regex.Replace(s, @"^#{1,6}\s*", "", RegexOptions.Multiline);     // başlıklar
        s = Regex.Replace(s, @"^\s*[-*]\s+", "•  ", RegexOptions.Multiline); // maddeler
        s = Regex.Replace(s, @"\n{3,}", "\n\n").Trim();
        return s.Length <= 4000 ? s : s[..4000] + "…";
    }

    /// <summary>Uygun dosyayı geçici klasöre indirir ve SHA-256 özetini doğrular. Özet dosyası yoksa reddeder.</summary>
    public static async Task<string> IndirAsync(YeniSurum s, IProgress<int>? ilerleme, CancellationToken ct = default)
    {
        bool kurulumla = Kurulu && s.KurulumAdresi is not null;
        var adres = kurulumla ? s.KurulumAdresi : (s.TasinabilirAdresi ?? s.KurulumAdresi);
        if (adres is null) throw new KullaniciHatasi(Metinler.T("guncelleme.dosyaYok"));
        if (s.OzetAdresi is null) throw new KullaniciHatasi(Metinler.T("guncelleme.ozetYok"));

        var dosyaAdi = Path.GetFileName(new Uri(adres).AbsolutePath);
        var klasor = Path.Combine(Path.GetTempPath(), Urun.KisaAd + "-Guncelleme");
        Directory.CreateDirectory(klasor);
        var hedef = Path.Combine(klasor, dosyaAdi);

        using var http = Istemci();

        // Beklenen özet
        var ozetler = await http.GetStringAsync(s.OzetAdresi, ct);
        string? beklenen = null;
        foreach (var satir in ozetler.Split('\n'))
        {
            var p = satir.Trim().Split(new[] { ' ', '*' }, StringSplitOptions.RemoveEmptyEntries);
            if (p.Length >= 2 && p[^1].Equals(dosyaAdi, StringComparison.OrdinalIgnoreCase)) { beklenen = p[0]; break; }
        }
        if (beklenen is null) throw new KullaniciHatasi(Metinler.F("guncelleme.ozetListedeYok", dosyaAdi));

        // Dosya
        using (var yanit = await http.GetAsync(adres, HttpCompletionOption.ResponseHeadersRead, ct))
        {
            yanit.EnsureSuccessStatusCode();
            var toplam = yanit.Content.Headers.ContentLength;
            if (toplam is > EnFazlaIndirme) throw new KullaniciHatasi(Metinler.T("guncelleme.cokBuyuk"));
            await using var kaynak = await yanit.Content.ReadAsStreamAsync(ct);
            await using var yazilan = File.Create(hedef);
            var tampon = new byte[81920];
            long okunan = 0;
            int n, sonYuzde = -1;
            while ((n = await kaynak.ReadAsync(tampon, ct)) > 0)
            {
                okunan += n;
                if (okunan > EnFazlaIndirme) throw new KullaniciHatasi(Metinler.T("guncelleme.cokBuyuk"));
                await yazilan.WriteAsync(tampon.AsMemory(0, n), ct);
                if (toplam is > 0)
                {
                    int yuzde = (int)(okunan * 100 / toplam.Value);
                    if (yuzde != sonYuzde) { sonYuzde = yuzde; ilerleme?.Report(yuzde); }
                }
            }
        }

        await using (var fs = File.OpenRead(hedef))
        {
            var gercek = Convert.ToHexString(await SHA256.HashDataAsync(fs, ct));
            if (!gercek.Equals(beklenen, StringComparison.OrdinalIgnoreCase))
            {
                fs.Close();
                File.Delete(hedef);
                throw new KullaniciHatasi(Metinler.T("guncelleme.ozetUyusmuyor"));
            }
        }
        return hedef;
    }

    /// <summary>
    /// İndirilen dosyayı kurar: kurulum paketi sessiz çalışır, taşınabilir exe kendini değiştirir.
    /// Çağırdıktan sonra program kapanmalıdır.
    /// </summary>
    public static void Kur(string dosya)
    {
        if (Path.GetFileName(dosya).StartsWith(KurulumOneki, StringComparison.OrdinalIgnoreCase))
        {
            Process.Start(new ProcessStartInfo(dosya)
            {
                UseShellExecute = true,
                // /YENIDENAC=1: kurulum bitince program yeniden açılır (setup\Istif.iss)
                Arguments = "/VERYSILENT /SUPPRESSMSGBOXES /CLOSEAPPLICATIONS /NORESTART /YENIDENAC=1",
            });
            return;
        }

        // Taşınabilir: programın kapanmasını bekle, üzerine yaz, yeniden başlat
        var exe = Environment.ProcessPath ?? throw new KullaniciHatasi(Metinler.T("guncelleme.yolYok"));
        var pid = Environment.ProcessId;
        var betik = Path.Combine(Path.GetDirectoryName(dosya)!, "guncellemeyi-uygula.cmd");
        var icerik = new StringBuilder()
            .AppendLine("@echo off")
            .AppendLine("chcp 65001 >nul")
            .AppendLine(":bekle")
            .AppendLine($"tasklist /FI \"PID eq {pid}\" 2>nul | find \"{pid}\" >nul && (timeout /t 1 /nobreak >nul & goto bekle)")
            .AppendLine($"copy /y \"{dosya}\" \"{exe}\" >nul")
            .AppendLine($"start \"\" \"{exe}\"")
            .AppendLine($"del \"{dosya}\" >nul 2>&1")
            .AppendLine("del \"%~f0\"")
            .ToString();
        File.WriteAllText(betik, icerik, new UTF8Encoding(false));
        Process.Start(new ProcessStartInfo("cmd.exe", $"/c \"{betik}\"") { UseShellExecute = false, CreateNoWindow = true });
    }
}
