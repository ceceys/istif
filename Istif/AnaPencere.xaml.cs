using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Interop;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;

namespace Istif;

/// <summary>
/// Ana pencere: temaya uyan başlık çubuğu ve tüm alanı kaplayan WebView2.
/// Arayüz https://uygulama.istif/ sanal adresinden, web klasöründen açılır; başka hiçbir adrese gidilmez.
/// </summary>
public partial class AnaPencere : Window
{
    private const string BuyutCizim = "M0.5,0.5 H9.5 V9.5 H0.5 Z";
    private const string GeriYukleCizim = "M0.5,2.5 H7.5 V9.5 H0.5 Z M2.5,2.5 V0.5 H9.5 V7.5 H7.5";
    private const int WM_SETTINGCHANGE = 0x001A;

    private readonly string? _acilacakDosya;
    private readonly TaskCompletionSource _hazir = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Kopru? _kopru;
    private bool _zorlaKapat;
    private bool _gosterildi;
    private bool _buyutUstunde;
    private bool _buyutBasili;
    private IntPtr _tutamac;
    private WindowState? _tamEkranOncesi;

    /// <summary>Arayüz "kaydedilmemiş değişiklik var" dediğinde true.</summary>
    internal bool Kaydedilmemis { get; set; }

    /// <summary>
    /// Yalnız Debug derlemesinde (--pdf-dene "yol"): örnek yük planlanır, PDF bu yola basılır, program kapanır.
    /// </summary>
    internal string? PdfDeneYolu { get; init; }

    /// <summary>
    /// Yalnız Debug derlemesinde (--duzenle-dene "klasör"): örnek yükte elle düzenleme senaryosu oynatılır,
    /// görüntüler ve PDF bu klasöre yazılır, program kapanır.
    /// </summary>
    internal string? DuzenleDeneKlasoru { get; init; }

    public AnaPencere(string? acilacakDosya)
    {
        InitializeComponent();
        _acilacakDosya = acilacakDosya;
        Title = Urun.Ad;
        UrunAdi.Text = Urun.Ad;
        DugmeAdlari();
        StateChanged += (_, _) => DurumGuncelle();
        DpiChanged += (_, _) => DurumGuncelle();
        SourceInitialized += KaynakHazir;
        Tema.Degisti += TemayiUygula;
        Closed += (_, _) => Tema.Degisti -= TemayiUygula;
        TemayiUygula();
        DurumGuncelle();
    }

    // ------------------------------------------------------------------ açılış

    /// <summary>
    /// WebView2 bir pencere tutamacı ister; bu yüzden pencere açılış ekranı sürerken ekranın dışında
    /// görünmez biçimde açılır, arayüz "hazir" diyene kadar (en fazla 8 sn) beklenir.
    /// </summary>
    public async Task HazirlaAsync()
    {
        Left = SystemParameters.VirtualScreenLeft - Width - 400;
        Top = SystemParameters.VirtualScreenTop - Height - 400;
        Show();

        Web.DefaultBackgroundColor = Tema.WebZemin;
        // Arka plandaki tarayıcı ağ işleri kapalı; program yalnız yerel dosyaları açar.
        var argumanlar = "--disable-background-networking --disable-component-update --no-pings";
#if DEBUG
        // Yalnız Debug: kayıt otomasyonu öğe konumlarını CDP ile okur (Chromium bu portu yalnız 127.0.0.1'de açar)
        if (App.HataAyiklamaPortu is { } port) argumanlar += $" --remote-debugging-port={port}";
#endif
        var secenek = new CoreWebView2EnvironmentOptions
        {
            AdditionalBrowserArguments = argumanlar,
            Language = Metinler.Kod,
        };
        var ortam = await CoreWebView2Environment.CreateAsync(null, Depo.WebView2Klasoru, secenek);
        await Web.EnsureCoreWebView2Async(ortam);

        var w = Web.CoreWebView2;
        AyarlariUygula(w.Settings);
        w.SetVirtualHostNameToFolderMapping(
            Urun.SanalAlan, Path.Combine(AppContext.BaseDirectory, "web"), CoreWebView2HostResourceAccessKind.Deny);

        // Ağ güvencesi: sanal adres dışındaki her istek ve gezinme engellenir.
        w.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
        w.WebResourceRequested += (_, e) =>
        {
            if (!IzinliAdres(e.Request.Uri))
                e.Response = w.Environment.CreateWebResourceResponse(null, 403, "Forbidden", "");
        };
        w.NavigationStarting += (_, e) => { if (!IzinliAdres(e.Uri)) e.Cancel = true; };
        w.FrameNavigationStarting += (_, e) => { if (!IzinliAdres(e.Uri)) e.Cancel = true; };
        w.NewWindowRequested += (_, e) => e.Handled = true;
        w.DocumentTitleChanged += (_, _) => BaslikGuncelle(w.DocumentTitle);
        w.ContainsFullScreenElementChanged += (_, _) => TamEkran(w.ContainsFullScreenElement);
        w.ProcessFailed += (_, e) =>
        {
            Gunluk.Yaz($"WebView2 süreci durdu: {e.ProcessFailedKind}");
            Kaydedilmemis = false; // arayüz yanıt veremez; kapatma takılmasın
        };

        _kopru = new Kopru(this, w);
        _kopru.Hazir += () => _hazir.TrySetResult();
        w.NavigationCompleted += (_, e) =>
        {
            // Sayfa yüklendi ama "hazir" gelmezse (ör. betik hatası) açılış en fazla 1,5 sn daha bekler.
            if (!e.IsSuccess) _hazir.TrySetResult();
            else _ = Task.Delay(1500).ContinueWith(_ => _hazir.TrySetResult(), TaskScheduler.Default);
        };
        w.Navigate(Urun.Adres + "index.html");

        await Task.WhenAny(_hazir.Task, Task.Delay(8000));
    }

    private static void AyarlariUygula(CoreWebView2Settings s)
    {
#if DEBUG
        s.AreDevToolsEnabled = true;
        s.AreDefaultContextMenusEnabled = true;
        s.AreBrowserAcceleratorKeysEnabled = true;
#else
        s.AreDevToolsEnabled = false;
        s.AreDefaultContextMenusEnabled = false;
        s.AreBrowserAcceleratorKeysEnabled = false; // F5, Ctrl+P, Ctrl+F gibi tarayıcı kısayolları
#endif
        s.IsStatusBarEnabled = false;
        s.IsZoomControlEnabled = false;
        s.IsPinchZoomEnabled = false;
        s.IsSwipeNavigationEnabled = false;
        s.IsGeneralAutofillEnabled = false;
        s.IsPasswordAutosaveEnabled = false;
        s.IsReputationCheckingRequired = false;
    }

    private static bool IzinliAdres(string adres)
    {
        if (!Uri.TryCreate(adres, UriKind.Absolute, out var u)) return false;
        return u.Scheme switch
        {
            "data" or "blob" or "about" => true,
            "https" => string.Equals(u.Host, Urun.SanalAlan, StringComparison.OrdinalIgnoreCase),
            _ => false,
        };
    }

    /// <summary>Açılış ekranından sonra pencereyi kayıtlı yerinde (yoksa ortada) gösterir.</summary>
    public void Goster()
    {
        Hide();
        var kayit = Depo.AyarlarOku().Pencere;
        var alan = SystemParameters.WorkArea;
        bool buyuk;
        if (kayit is not null && kayit.Genislik >= MinWidth && kayit.Yukseklik >= MinHeight && EkrandaMi(kayit))
        {
            Left = kayit.Sol;
            Top = kayit.Ust;
            Width = kayit.Genislik;
            Height = kayit.Yukseklik;
            buyuk = kayit.Buyuk;
        }
        else
        {
            Width = Math.Max(MinWidth, Math.Min(1440, alan.Width * 0.94));
            Height = Math.Max(MinHeight, Math.Min(900, alan.Height * 0.94));
            Left = alan.Left + Math.Max(0, (alan.Width - Width) / 2);
            Top = alan.Top + Math.Max(0, (alan.Height - Height) / 2);
            buyuk = alan.Width < 1300 || alan.Height < 820;
        }

        ShowInTaskbar = true;
        ShowActivated = true;
        WindowState = buyuk ? WindowState.Maximized : WindowState.Normal;
        Show();
        Activate();
        _gosterildi = true;

        _kopru?.Bildir(new { tur = "goruldu" });
        if (_acilacakDosya is not null) _kopru?.DosyaAc(_acilacakDosya);
        if (PdfDeneYolu is not null) _kopru?.Bildir(new { tur = "pdfDene", yol = PdfDeneYolu });
        if (DuzenleDeneKlasoru is not null) _kopru?.Bildir(new { tur = "duzenleDene", klasor = DuzenleDeneKlasoru });
    }

    private static bool EkrandaMi(PencereKonumu k)
    {
        var ekran = new Rect(SystemParameters.VirtualScreenLeft, SystemParameters.VirtualScreenTop,
            SystemParameters.VirtualScreenWidth, SystemParameters.VirtualScreenHeight);
        // Başlık çubuğunun bir kısmı görünür olmalı
        var baslik = new Rect(k.Sol + 40, k.Ust, Math.Max(1, k.Genislik - 80), 40);
        return ekran.IntersectsWith(baslik);
    }

    public async Task SessizGuncellemeDenetimiAsync()
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(5)); // açılışı yavaşlatmasın
            var s = await Guncelleyici.SessizDenetleAsync();
            if (s is not null) _kopru?.GuncellemeBildir(s);
        }
        catch (Exception ex)
        {
            Gunluk.Yaz("Sessiz güncelleme denetimi: " + ex.Message);
        }
    }

    // ------------------------------------------------------------------ başlık, tema ve durum

    private void BaslikGuncelle(string belgeBasligi)
    {
        Title = string.IsNullOrWhiteSpace(belgeBasligi) ? Urun.Ad : belgeBasligi;
        // Arayüz başlığı "Plan adı · İstif" biçiminde verir; başlık çubuğunda yalnız plan adı yazılır.
        var ayrac = belgeBasligi.LastIndexOf(" · ", StringComparison.Ordinal);
        BelgeAdi.Text = ayrac > 0 ? belgeBasligi[..ayrac] : "";
    }

    /// <summary>Düğmelerin ipucu ve ekran okuyucu adları (dil değişince yeniden çağrılır).</summary>
    internal void DugmeAdlari()
    {
        void Ad(FrameworkElement d, string metin)
        {
            d.ToolTip = metin;
            AutomationProperties.SetName(d, metin);
        }
        Ad(KucultDugme, Metinler.T("pencere.kucult"));
        Ad(BuyutDugme, Metinler.T(WindowState == WindowState.Maximized ? "pencere.geriYukle" : "pencere.buyut"));
        Ad(KapatDugme, Metinler.T("pencere.kapat"));
    }

    private void TemayiUygula()
    {
        var k = Application.Current.Resources;
        k["BaslikDugmeYazi"] = new SolidColorBrush(Tema.DugmeYazi);
        k["BaslikDugmeYaziUstunde"] = new SolidColorBrush(Tema.DugmeYaziUstunde);
        k["BaslikDugmeUstunde"] = new SolidColorBrush(Tema.DugmeUstunde);
        k["BaslikDugmeBasili"] = new SolidColorBrush(Tema.DugmeBasili);

        BaslikCubugu.Background = new SolidColorBrush(Tema.BaslikZemin);
        UrunAdi.Foreground = new SolidColorBrush(Tema.BaslikYazi);
        BelgeAdi.Foreground = new SolidColorBrush(Tema.BelgeYazi);
        Kok.BorderBrush = new SolidColorBrush(Tema.Kenar);
        Background = new SolidColorBrush(Color.FromRgb(Tema.WebZemin.R, Tema.WebZemin.G, Tema.WebZemin.B));
        BuyutDugme.ClearValue(ForegroundProperty);
        _buyutUstunde = false;
        BuyutDugme.Background = Brushes.Transparent;
        if (Web.CoreWebView2 is not null) Web.DefaultBackgroundColor = Tema.WebZemin;
        if (_tutamac != IntPtr.Zero) Yerel.PencereGorunumu(_tutamac, Tema.Kenar);
    }

    private void DurumGuncelle()
    {
        bool buyuk = WindowState == WindowState.Maximized;
        Kok.Margin = buyuk ? Yerel.BuyukPencereTasmasi(this) : new Thickness(0);
        // Windows 11 kenarı kendisi çizer (DWM kenar rengi); Windows 10'da 1 px kenar bizden.
        Kok.BorderThickness = buyuk || Yerel.Windows11 || _tamEkranOncesi is not null ? new Thickness(0) : new Thickness(1);
        BuyutSimge.Data = Geometry.Parse(buyuk ? GeriYukleCizim : BuyutCizim);
        DugmeAdlari();
    }

    internal void BuyutKucult()
    {
        if (WindowState == WindowState.Maximized) SystemCommands.RestoreWindow(this);
        else SystemCommands.MaximizeWindow(this);
    }

    private void Kucult_Click(object sender, RoutedEventArgs e) => SystemCommands.MinimizeWindow(this);
    private void Buyut_Click(object sender, RoutedEventArgs e) => BuyutKucult();
    private void Kapat_Click(object sender, RoutedEventArgs e) => Close();

    /// <summary>3B görünüm tam ekrana geçince başlık çubuğu gizlenir ve pencere büyür; çıkınca eski hâline döner.</summary>
    private void TamEkran(bool ac)
    {
        if (ac)
        {
            if (_tamEkranOncesi is not null) return;
            _tamEkranOncesi = WindowState;
            BaslikSatiri.Height = new GridLength(0);
            BaslikCubugu.Visibility = Visibility.Collapsed;
            if (WindowState != WindowState.Maximized) WindowState = WindowState.Maximized;
        }
        else
        {
            if (_tamEkranOncesi is not { } onceki) return;
            _tamEkranOncesi = null;
            BaslikSatiri.Height = new GridLength(40);
            BaslikCubugu.Visibility = Visibility.Visible;
            WindowState = onceki;
        }
        DurumGuncelle();
    }

    // ------------------------------------------------------------------ kapanış

    internal void ZorlaKapat()
    {
        _zorlaKapat = true;
        Close();
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        if (!_zorlaKapat && Kaydedilmemis && _kopru is not null)
        {
            e.Cancel = true;
            _kopru.KapatmaIste();
            return;
        }
        if (_gosterildi) KonumuKaydet();
        // Olağan kapanış: otomatik taslak artık gerekmez (çökmeden sonra kalır ve açılışta sorulur)
        Kopru.TaslakSil();
        base.OnClosing(e);
    }

    private void KonumuKaydet()
    {
        if (_tamEkranOncesi is not null) return;
        var r = WindowState == WindowState.Normal ? new Rect(Left, Top, ActualWidth, ActualHeight) : RestoreBounds;
        if (r.IsEmpty || r.Width < MinWidth / 2) return;
        bool buyuk = WindowState == WindowState.Maximized;
        Depo.AyarDegistir(a => a.Pencere = new PencereKonumu
        {
            Sol = r.Left, Ust = r.Top, Genislik = r.Width, Yukseklik = r.Height, Buyuk = buyuk,
        });
    }

    // ------------------------------------------------------------------ Windows 11 yerleşim menüsü, sistem teması

    private void KaynakHazir(object? sender, EventArgs e)
    {
        _tutamac = new WindowInteropHelper(this).Handle;
        Yerel.PencereGorunumu(_tutamac, Tema.Kenar);
        HwndSource.FromHwnd(_tutamac)?.AddHook(PencereKancasi);
    }

    /// <summary>
    /// Büyüt düğmesinin üstündeyken Windows'a "büyüt düğmesi" denir; böylece Windows 11
    /// yerleşim (Snap Layouts) menüsü açılır. Tıklama da burada karşılanır.
    /// Windows'un açık/koyu ayarı değişince ("ImmersiveColorSet") tema yeniden hesaplanır.
    /// </summary>
    private IntPtr PencereKancasi(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        switch (msg)
        {
            case WM_SETTINGCHANGE:
                if (lParam != IntPtr.Zero && Marshal.PtrToStringUni(lParam) == "ImmersiveColorSet") Tema.SistemDegisti();
                break;

            case Yerel.WM_NCHITTEST:
                if (BuyutUzerinde(lParam))
                {
                    BuyutVurgula(true);
                    handled = true;
                    return new IntPtr(Yerel.HTMAXBUTTON);
                }
                BuyutVurgula(false);
                break;

            case Yerel.WM_NCMOUSEMOVE:
                if (wParam.ToInt32() == Yerel.HTMAXBUTTON) Yerel.AyrilisIzle(hwnd);
                break;

            case Yerel.WM_NCMOUSELEAVE:
                _buyutBasili = false;
                BuyutVurgula(false);
                break;

            case Yerel.WM_NCLBUTTONDOWN:
                if (wParam.ToInt32() == Yerel.HTMAXBUTTON)
                {
                    _buyutBasili = true;
                    BuyutDugme.Background = new SolidColorBrush(Tema.DugmeBasili);
                    handled = true;
                }
                break;

            case Yerel.WM_NCLBUTTONUP:
                if (wParam.ToInt32() == Yerel.HTMAXBUTTON)
                {
                    if (_buyutBasili) BuyutKucult();
                    _buyutBasili = false;
                    BuyutVurgula(false);
                    handled = true;
                }
                break;
        }
        return IntPtr.Zero;
    }

    private bool BuyutUzerinde(IntPtr lParam)
    {
        if (!BuyutDugme.IsVisible) return false;
        int x = unchecked((short)(long)lParam);
        int y = unchecked((short)((long)lParam >> 16));
        try
        {
            var p = BuyutDugme.PointFromScreen(new Point(x, y));
            return p.X >= 0 && p.Y >= 0 && p.X < BuyutDugme.ActualWidth && p.Y < BuyutDugme.ActualHeight;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    private void BuyutVurgula(bool ustunde)
    {
        if (_buyutUstunde == ustunde) return;
        _buyutUstunde = ustunde;
        BuyutDugme.Background = ustunde ? new SolidColorBrush(Tema.DugmeUstunde) : Brushes.Transparent;
        BuyutDugme.Foreground = new SolidColorBrush(ustunde ? Tema.DugmeYaziUstunde : Tema.DugmeYazi);
    }
}
