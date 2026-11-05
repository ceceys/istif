using System.Diagnostics;
using System.Net.Http;
using System.Text.Json;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace Istif;

/// <summary>
/// Web arayüzü ile kabuk arasındaki köprü.
/// İstek:  { tur, id, ... }  →  cevap: { tur: "cevap", id, ok, veri | hata }
/// Bildirim (cevapsız), web → kabuk: hazir, durum {kaydedilmemis}, kapatmaAlindi
/// Bildirim, kabuk → web: goruldu, kapatmaIstegi, planAcildi {yol, json}, guncellemeVar {surum, notlar},
///                        guncellemeIlerleme {yuzde}
/// İsteklerin listesi SOZLESME.md'de ("Kabuk ve köprü notları").
/// </summary>
internal sealed class Kopru
{
    private readonly AnaPencere _pencere;
    private readonly CoreWebView2 _web;
    private Guncelleyici.YeniSurum? _bulunanSurum;
    private bool _kapatmaAlindi;

    /// <summary>Arayüz ilk çizimini bitirince tetiklenir.</summary>
    public event Action? Hazir;

    public Kopru(AnaPencere pencere, CoreWebView2 web)
    {
        _pencere = pencere;
        _web = web;
        _web.WebMessageReceived += MesajAlindi;
    }

    public void Bildir(object mesaj)
    {
        try
        {
            _web.PostWebMessageAsJson(JsonSerializer.Serialize(mesaj, Depo.JsonAyar));
        }
        catch (Exception ex) when (ex is InvalidOperationException or System.Runtime.InteropServices.COMException)
        {
            Gunluk.Yaz("Arayüze ileti gönderilemedi: " + ex.Message);
        }
    }

    private async void MesajAlindi(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        // Yalnız kendi sayfamızdan gelen iletiler
        if (!Uri.TryCreate(e.Source, UriKind.Absolute, out var kaynak) ||
            !string.Equals(kaynak.Host, Urun.SanalAlan, StringComparison.OrdinalIgnoreCase)) return;

        JsonElement m;
        try
        {
            using var belge = JsonDocument.Parse(e.WebMessageAsJson);
            m = belge.RootElement.Clone();
        }
        catch (JsonException)
        {
            return;
        }
        if (m.ValueKind != JsonValueKind.Object) return;

        var tur = Metin(m, "tur") ?? "";
        switch (tur)
        {
            case "hazir":
                Hazir?.Invoke();
                return;
            case "durum":
                _pencere.Kaydedilmemis = m.TryGetProperty("kaydedilmemis", out var k) && k.ValueKind == JsonValueKind.True;
                return;
            case "kapatmaAlindi":
                _kapatmaAlindi = true;
                return;
        }

        object? id = m.TryGetProperty("id", out var idEl) ? idEl : null;
        try
        {
            var veri = await IsleAsync(tur, m);
            Bildir(new Dictionary<string, object?> { ["tur"] = "cevap", ["id"] = id, ["ok"] = true, ["veri"] = veri });
        }
        catch (Exception ex)
        {
            Gunluk.Yaz($"İstek '{tur}' başarısız: {ex}");
            Bildir(new Dictionary<string, object?> { ["tur"] = "cevap", ["id"] = id, ["ok"] = false, ["hata"] = HataMetni(ex) });
        }
    }

    private static string HataMetni(Exception ex) => ex switch
    {
        KullaniciHatasi => ex.Message,
        IOException or UnauthorizedAccessException => Metinler.DosyaIslemHatasi + ex.Message,
        HttpRequestException or TaskCanceledException => Metinler.GuncellemeIndirilemedi,
        _ => Metinler.BeklenmeyenHata,
    };

    private async Task<object?> IsleAsync(string tur, JsonElement m)
    {
        switch (tur)
        {
            case "kutuphaneOku":
                return Depo.JsonOku(Depo.KutuphaneYolu);

            case "kutuphaneYaz":
                if (!m.TryGetProperty("veri", out var veri) || veri.ValueKind != JsonValueKind.Object)
                    throw new KullaniciHatasi(Metinler.GecersizVeri);
                Depo.JsonYaz(Depo.KutuphaneYolu, veri);
                return true;

            case "planKaydet":
                return PlanKaydet(m);

            case "planAc":
                return PlanAc(Metin(m, "yol"));

            case "sonPlanlar":
                return SonPlanlar.Liste();

            case "pdfKaydet":
                return await PdfKaydetAsync(m);

            case "dosyaSec":
                return DosyaSec(Metin(m, "filtre"));

            case "dosyaKaydet":
                return DosyaKaydet(m);

            case "dosyaGoster":
                DosyaGoster(Metin(m, "yol"));
                return true;

            case "veriKlasoruAc":
                Directory.CreateDirectory(Depo.Klasor);
                DosyaGoster(Depo.Klasor);
                return true;

            case "taslakYaz":
            {
                var json = JsonMetni(m, "json");
                try { using var _ = JsonDocument.Parse(json); }
                catch (JsonException) { throw new KullaniciHatasi(Metinler.GecersizVeri); }
                if (json.Length > Depo.EnFazlaDosya) throw new KullaniciHatasi(Metinler.DosyaCokBuyuk);
                Depo.GuvenliYaz(Depo.TaslakYolu, json);
                return true;
            }

            case "taslakOku":
                return Depo.JsonOku(Depo.TaslakYolu);

            case "taslakSil":
                TaslakSil();
                return true;

            case "surumNotlari":
                return SurumNotlari(Metin(m, "dil"));

            case "pencere":
                PencereIslemi(Metin(m, "islem"), m.TryGetProperty("zorla", out var z) && z.ValueKind == JsonValueKind.True);
                return true;

            case "baglantiAc":
                BaglantiAc(Metin(m, "url"));
                return true;

            case "ayarlarOku":
            {
                var a = Depo.AyarlarOku();
                return new
                {
                    surum = Urun.SurumMetni,
                    guncellemeDenetimi = a.GuncellemeDenetimi,
                    kurulu = Guncelleyici.Kurulu,
                    // Debug'da --dil / --tema bu oturum için kayıtlı ayarın önüne geçer
                    dil = App.DeneDil ?? a.Dil,
                    tema = App.DeneTema ?? a.Tema,
                    birim = a.Birim,
                    animasyon = App.DeneAnimasyon ?? (App.Animasyonlar.Contains(a.Animasyon) ? a.Animasyon : "acik"),
                    varsayilanArac = a.VarsayilanArac,
                    sistemDili = Metinler.SistemDili,
                    veriKlasoru = Depo.Klasor,
                };
            }

            case "ayarlarYaz":
                AyarlariYaz(m);
                return true;

            case "guncellemeDenetle":
            {
                var s = await Guncelleyici.DenetleAsync();
                _bulunanSurum = s;
                return s is null
                    ? new { durum = "yok" }
                    : new { durum = "yeni", surum = s.NoMetni, notlar = s.Notlar };
            }

            case "guncellemeKur":
                return await GuncellemeKurAsync();

#if DEBUG
            case "goruntuAl":
                return await GoruntuAlAsync(Metin(m, "ad"));
#endif

            default:
                throw new KullaniciHatasi(Metinler.BilinmeyenIstek);
        }
    }

    // ---------------------------------------------------------------- ayarlar, taslak, sürüm notları

    /// <summary>Yalnız gelen ve geçerli olan alanlar yazılır; dil ve tema kabukta hemen uygulanır.</summary>
    private void AyarlariYaz(JsonElement m)
    {
        bool? denetim = m.TryGetProperty("guncellemeDenetimi", out var gd) && gd.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? gd.GetBoolean() : null;
        var dil = Metin(m, "dil");
        if (dil is not null && dil != "sistem" && !Metinler.Diller.Contains(dil)) dil = null;
        var tema = Metin(m, "tema");
        if (tema is not null && !Tema.Ayarlar.Contains(tema)) tema = null;
        var birim = Metin(m, "birim");
        if (birim is not "metrik" and not "imperial") birim = null;
        var animasyon = Metin(m, "animasyon");
        if (animasyon is not null && !App.Animasyonlar.Contains(animasyon)) animasyon = null;
        bool aracVar = m.TryGetProperty("varsayilanArac", out var va) && va.ValueKind is JsonValueKind.String or JsonValueKind.Null;
        var arac = aracVar && va.ValueKind == JsonValueKind.String ? va.GetString() : null;
        if (arac is { Length: > 120 }) aracVar = false;

        Depo.AyarDegistir(a =>
        {
            if (denetim is { } d) a.GuncellemeDenetimi = d;
            if (dil is not null) a.Dil = dil;
            if (tema is not null) a.Tema = tema;
            if (birim is not null) a.Birim = birim;
            if (animasyon is not null) a.Animasyon = animasyon;
            if (aracVar) a.VarsayilanArac = string.IsNullOrWhiteSpace(arac) ? null : arac;
        });
        if (dil is not null)
        {
            Metinler.Ayarla(dil);
            _pencere.DugmeAdlari();
        }
        if (tema is not null) Tema.Ayarla(tema);
    }

    /// <summary>Program olağan kapanınca ya da kullanıcı taslağı geri yüklemeyince silinir.</summary>
    public static void TaslakSil()
    {
        try
        {
            if (File.Exists(Depo.TaslakYolu)) File.Delete(Depo.TaslakYolu);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Gunluk.Yaz("Taslak silinemedi: " + ex.Message);
        }
    }

    /// <summary>Gömülü Resources\Notes.&lt;dil&gt;.md; yoksa İngilizcesi.</summary>
    private static object? SurumNotlari(string? dil)
    {
        foreach (var kod in new[] { Metinler.Coz(dil), "en" }.Distinct())
        {
            using var akis = typeof(Kopru).Assembly.GetManifestResourceStream($"Istif.Resources.Notes.{kod}.md");
            if (akis is null) continue;
            using var okuyucu = new StreamReader(akis, System.Text.Encoding.UTF8);
            return new { dil = kod, metin = okuyucu.ReadToEnd() };
        }
        return null;
    }

    // ---------------------------------------------------------------- planlar

    private object? PlanKaydet(JsonElement m)
    {
        var json = JsonMetni(m, "json");
        // Bozuk içerik diske yazılmasın
        try { using var _ = JsonDocument.Parse(json); }
        catch (JsonException) { throw new KullaniciHatasi(Metinler.GecersizVeri); }

        var yol = Metin(m, "yol");
        bool dogrudan = yol is not null && UzantiDogru(yol) && Path.IsPathFullyQualified(yol) &&
                        Directory.Exists(Path.GetDirectoryName(yol));
        if (!dogrudan)
        {
            var pencere = new SaveFileDialog
            {
                Title = Metinler.PlanKaydetBaslik,
                Filter = Metinler.PlanFiltresi,
                DefaultExt = Urun.Uzanti,
                AddExtension = true,
                OverwritePrompt = true,
                FileName = DosyaAdi(Metin(m, "onerilenAd") ?? Metinler.VarsayilanPlanAdi, Urun.Uzanti),
                InitialDirectory = BaslangicKlasoru(),
            };
            if (pencere.ShowDialog(_pencere) != true) return null; // vazgeçildi
            yol = pencere.FileName;
        }

        Depo.GuvenliYaz(yol!, json);
        Depo.AyarDegistir(a => a.SonKlasor = Path.GetDirectoryName(yol));
        SonPlanlar.Ekle(yol!, json);
        return new { yol };
    }

    /// <summary>Yol verilirse doğrudan açar (son planlar), verilmezse Aç penceresi gösterir.</summary>
    public object? PlanAc(string? yol)
    {
        if (yol is null)
        {
            var pencere = new OpenFileDialog
            {
                Title = Metinler.PlanAcBaslik,
                Filter = Metinler.PlanFiltresi,
                CheckFileExists = true,
                InitialDirectory = BaslangicKlasoru(),
            };
            if (pencere.ShowDialog(_pencere) != true) return null;
            yol = pencere.FileName;
        }
        else if (!UzantiDogru(yol) || !Path.IsPathFullyQualified(yol))
        {
            throw new KullaniciHatasi(Metinler.GecersizPlan);
        }

        if (!File.Exists(yol))
        {
            SonPlanlar.Cikar(yol);
            throw new KullaniciHatasi(Metinler.DosyaBulunamadi);
        }

        var json = Depo.MetinOku(yol);
        try { using var _ = JsonDocument.Parse(json); }
        catch (JsonException) { throw new KullaniciHatasi(Metinler.GecersizPlan); }

        Depo.AyarDegistir(a => a.SonKlasor = Path.GetDirectoryName(yol));
        SonPlanlar.Ekle(yol, json);
        return new { yol, json };
    }

    /// <summary>Komut satırından verilen plan dosyasını arayüze gönderir.</summary>
    public void DosyaAc(string yol)
    {
        try
        {
            if (PlanAc(yol) is { } veri) Bildir(new { tur = "planAcildi", veri });
        }
        catch (Exception ex)
        {
            Gunluk.Yaz($"Plan açılamadı: {yol}: {ex.Message}");
        }
    }

    // ---------------------------------------------------------------- PDF, Gezgin, pencere, bağlantı

    /// <summary>
    /// Yol, --duzenle-dene klasörünün doğrudan içinde ve verilen uzantıda mı? (Yalnız Debug'da klasör vardır;
    /// Release'de her zaman false.) Ad yalnız küçük harf, rakam ve tireden oluşur.
    /// </summary>
    private bool DenemeKlasorundeMi(string yol, string uzanti)
    {
        var klasor = _pencere.DuzenleDeneKlasoru;
        if (klasor is null) return false;
        var tam = Path.GetFullPath(yol);
        var ad = Path.GetFileNameWithoutExtension(tam);
        return string.Equals(Path.GetDirectoryName(tam), Path.GetFullPath(klasor), StringComparison.OrdinalIgnoreCase)
            && string.Equals(Path.GetExtension(tam), uzanti, StringComparison.OrdinalIgnoreCase)
            && ad.Length is > 0 and <= 60 && ad.All(c => c is (>= 'a' and <= 'z') or (>= '0' and <= '9') or '-');
    }

#if DEBUG
    /// <summary>
    /// Yalnız Debug, --duzenle-dene: arayüzün o anki görüntüsü (WebView2'nin kendi çizimi) deneme klasörüne PNG yazılır.
    /// </summary>
    private async Task<object?> GoruntuAlAsync(string? ad)
    {
        var klasor = _pencere.DuzenleDeneKlasoru;
        if (klasor is null || ad is null) throw new KullaniciHatasi(Metinler.BilinmeyenIstek);
        var yol = Path.Combine(klasor, ad + ".png");
        if (!DenemeKlasorundeMi(yol, ".png")) throw new KullaniciHatasi(Metinler.GecersizVeri);
        Directory.CreateDirectory(klasor);
        await using (var akis = File.Create(yol))
        {
            await _web.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, akis);
        }
        return new { yol };
    }
#endif

    /// <summary>
    /// O anki sayfayı yazdırma biçemiyle A4 PDF'e basar. "yol" yalnız Debug derlemesinde, komut satırındaki
    /// --pdf-dene yoluyla aynıysa kabul edilir; aksi hâlde Kaydet penceresi açılır.
    /// </summary>
    private async Task<object?> PdfKaydetAsync(JsonElement m)
    {
        string? hedef = null;
        var istenen = Metin(m, "yol");
        if (istenen is not null && _pencere.PdfDeneYolu is not null &&
            string.Equals(Path.GetFullPath(istenen), Path.GetFullPath(_pencere.PdfDeneYolu), StringComparison.OrdinalIgnoreCase))
        {
            hedef = _pencere.PdfDeneYolu;
            Directory.CreateDirectory(Path.GetDirectoryName(hedef)!);
        }
        else if (istenen is not null && DenemeKlasorundeMi(istenen, ".pdf"))
        {
            // Yalnız Debug, --duzenle-dene: senaryonun PDF'i deneme klasörüne
            hedef = Path.GetFullPath(istenen);
        }
        else
        {
            var pencere = new SaveFileDialog
            {
                Title = Metinler.PdfKaydetBaslik,
                Filter = Metinler.PdfFiltresi,
                DefaultExt = ".pdf",
                AddExtension = true,
                OverwritePrompt = true,
                FileName = DosyaAdi(Metin(m, "onerilenAd") ?? Metinler.VarsayilanPlanAdi, ".pdf"),
                InitialDirectory = BaslangicKlasoru(),
            };
            if (pencere.ShowDialog(_pencere) != true) return null;
            hedef = pencere.FileName;
        }

        var ayar = _web.Environment.CreatePrintSettings();
        ayar.ShouldPrintBackgrounds = true;
        ayar.ShouldPrintHeaderAndFooter = false; // alt bilgi ve sayfa numarası sayfanın kendi @page kurallarından
        ayar.Orientation = m.TryGetProperty("yatay", out var y) && y.ValueKind == JsonValueKind.True
            ? CoreWebView2PrintOrientation.Landscape
            : CoreWebView2PrintOrientation.Portrait;
        // A4 (inç); yön yatay seçilince genişlik ve yükseklik yer değiştirir
        ayar.PageWidth = 8.27;
        ayar.PageHeight = 11.69;
        ayar.MarginTop = 0.43;
        ayar.MarginBottom = 0.6;
        ayar.MarginLeft = 0.47;
        ayar.MarginRight = 0.47;

        // Sayfa kenarları WebView2'nin zemin rengiyle (koyu lacivert) boyanmasın; basım süresince beyaz
        var zemin = _pencere.Web.DefaultBackgroundColor;
        _pencere.Web.DefaultBackgroundColor = System.Drawing.Color.White;
        try
        {
            if (!await _web.PrintToPdfAsync(hedef, ayar)) throw new KullaniciHatasi(Metinler.PdfOlusmadi);
        }
        finally
        {
            _pencere.Web.DefaultBackgroundColor = zemin;
        }
        return new { yol = hedef };
    }

    // ---------------------------------------------------------------- dosya seçme ve kaydetme (Excel)

    private const long EnFazlaTablo = 20L * 1024 * 1024;

    /// <summary>Excel/CSV ("tablo") ya da kütüphane JSON'u ("json") seçtirir; içerik base64 döner: { ad, base64 }</summary>
    private object? DosyaSec(string? filtre)
    {
        var (baslik, suzgec) = filtre switch
        {
            "tablo" or null => (Metinler.TabloAcBaslik, Metinler.TabloFiltresi),
            "json" => (Metinler.JsonAcBaslik, Metinler.JsonFiltresi),
            _ => throw new KullaniciHatasi(Metinler.BilinmeyenIstek),
        };
        var pencere = new OpenFileDialog
        {
            Title = baslik,
            Filter = suzgec,
            CheckFileExists = true,
            InitialDirectory = BaslangicKlasoru(),
        };
        if (pencere.ShowDialog(_pencere) != true) return null;
        var bilgi = new FileInfo(pencere.FileName);
        if (bilgi.Length > EnFazlaTablo) throw new KullaniciHatasi(Metinler.DosyaCokBuyuk);
        var baytlar = File.ReadAllBytes(pencere.FileName);
        return new { ad = bilgi.Name, base64 = Convert.ToBase64String(baytlar) };
    }

    /// <summary>Arayüzün ürettiği dosyayı (Excel şablonu, kütüphane yedeği, 3B görüntü) Kaydet penceresiyle yazar.</summary>
    private object? DosyaKaydet(JsonElement m)
    {
        var (suzgec, uzanti) = Metin(m, "filtre") switch
        {
            "xlsx" => (Metinler.XlsxFiltresi, ".xlsx"),
            "json" => (Metinler.JsonFiltresi, ".json"),
            "png" => (Metinler.PngFiltresi, ".png"),
            _ => throw new KullaniciHatasi(Metinler.BilinmeyenIstek),
        };
        var b64 = Metin(m, "base64") ?? throw new KullaniciHatasi(Metinler.GecersizVeri);
        byte[] baytlar;
        try { baytlar = Convert.FromBase64String(b64); }
        catch (FormatException) { throw new KullaniciHatasi(Metinler.GecersizVeri); }
        if (baytlar.LongLength > EnFazlaTablo) throw new KullaniciHatasi(Metinler.DosyaCokBuyuk);

        var pencere = new SaveFileDialog
        {
            Title = Metinler.DosyaKaydetBaslik,
            Filter = suzgec,
            DefaultExt = uzanti,
            AddExtension = true,
            OverwritePrompt = true,
            FileName = DosyaAdi(Metin(m, "onerilenAd") ?? "dosya", uzanti),
            InitialDirectory = BaslangicKlasoru(),
        };
        if (pencere.ShowDialog(_pencere) != true) return null;
        File.WriteAllBytes(pencere.FileName, baytlar);
        return new { yol = pencere.FileName };
    }

    private static void DosyaGoster(string? yol)
    {
        if (string.IsNullOrEmpty(yol) || !Path.IsPathFullyQualified(yol)) throw new KullaniciHatasi(Metinler.DosyaBulunamadi);
        if (File.Exists(yol))
            Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{yol}\"") { UseShellExecute = true });
        else if (Directory.Exists(yol))
            Process.Start(new ProcessStartInfo("explorer.exe", $"\"{yol}\"") { UseShellExecute = true });
        else
            throw new KullaniciHatasi(Metinler.DosyaBulunamadi);
    }

    private void PencereIslemi(string? islem, bool zorla)
    {
        switch (islem)
        {
            case "kucult": _pencere.WindowState = WindowState.Minimized; break;
            case "buyut": _pencere.BuyutKucult(); break;
            case "kapat":
                // Önce cevap arayüze gitsin, sonra pencere kapansın
                _pencere.Dispatcher.BeginInvoke(() =>
                {
                    if (zorla) _pencere.ZorlaKapat();
                    else _pencere.Close();
                }, System.Windows.Threading.DispatcherPriority.Background);
                break;
            default: throw new KullaniciHatasi(Metinler.BilinmeyenIstek);
        }
    }

    /// <summary>
    /// Yalnız izinli adresler varsayılan tarayıcıda açılır: Urun.IzinliBaglantilar (GitHub, LinkedIn) ve
    /// araç kataloğundaki kaynak adresleri (tam eşleşme).
    /// </summary>
    private static void BaglantiAc(string? url)
    {
        if (url is null || !Urun.IzinliMi(url))
            throw new KullaniciHatasi(Metinler.IzinsizBaglanti);
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }

    // ---------------------------------------------------------------- kapatma ve güncelleme

    /// <summary>
    /// Kaydedilmemiş değişiklik varken pencere kapatılmak istenince arayüze sorulur.
    /// Arayüz 2 sn içinde cevap vermezse Windows ileti kutusuyla sorulur.
    /// </summary>
    public void KapatmaIste()
    {
        _kapatmaAlindi = false;
        Bildir(new { tur = "kapatmaIstegi" });
        var saat = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        saat.Tick += (_, _) =>
        {
            saat.Stop();
            if (_kapatmaAlindi) return;
            var cevap = MessageBox.Show(_pencere, Metinler.KaydedilmemisCikis, Urun.Ad,
                MessageBoxButton.YesNo, MessageBoxImage.Warning, MessageBoxResult.No);
            if (cevap == MessageBoxResult.Yes) _pencere.ZorlaKapat();
        };
        saat.Start();
    }

    public void GuncellemeBildir(Guncelleyici.YeniSurum s)
    {
        _bulunanSurum = s;
        Bildir(new { tur = "guncellemeVar", surum = s.NoMetni, notlar = s.Notlar });
    }

    private async Task<object?> GuncellemeKurAsync()
    {
        var s = _bulunanSurum ?? await Guncelleyici.DenetleAsync();
        if (s is null) throw new KullaniciHatasi(Metinler.GuncellemeYok);

        var ilerleme = new Progress<int>(y => Bildir(new { tur = "guncellemeIlerleme", yuzde = y }));
        var dosya = await Guncelleyici.IndirAsync(s, ilerleme);
        Guncelleyici.Kur(dosya);

        // Cevap arayüze ulaşsın, sonra kapan
        _ = Task.Delay(600).ContinueWith(_ => _pencere.ZorlaKapat(), TaskScheduler.FromCurrentSynchronizationContext());
        return new { durum = "kuruluyor" };
    }

    // ---------------------------------------------------------------- yardımcılar

    private static string? Metin(JsonElement m, string ad) =>
        m.TryGetProperty(ad, out var d) && d.ValueKind == JsonValueKind.String ? d.GetString() : null;

    /// <summary>"json" alanı metin ya da nesne olabilir; ikisi de metne çevrilir.</summary>
    private static string JsonMetni(JsonElement m, string ad)
    {
        if (!m.TryGetProperty(ad, out var d)) throw new KullaniciHatasi(Metinler.GecersizVeri);
        return d.ValueKind switch
        {
            JsonValueKind.String => d.GetString() ?? "",
            JsonValueKind.Object => JsonSerializer.Serialize(d, Depo.JsonAyar),
            _ => throw new KullaniciHatasi(Metinler.GecersizVeri),
        };
    }

    private static bool UzantiDogru(string yol) =>
        string.Equals(Path.GetExtension(yol), Urun.Uzanti, StringComparison.OrdinalIgnoreCase);

    private static string DosyaAdi(string oneri, string uzanti)
    {
        var temiz = string.Concat(oneri.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '-' : c)).Trim().Trim('.');
        if (temiz.Length == 0) temiz = Metinler.VarsayilanPlanAdi;
        if (temiz.Length > 120) temiz = temiz[..120];
        return temiz.EndsWith(uzanti, StringComparison.OrdinalIgnoreCase) ? temiz : temiz + uzanti;
    }

    private static string BaslangicKlasoru()
    {
        var son = Depo.AyarlarOku().SonKlasor;
        return !string.IsNullOrEmpty(son) && Directory.Exists(son)
            ? son
            : Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
    }
}
