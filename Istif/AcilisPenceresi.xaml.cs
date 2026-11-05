using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Animation;

namespace Istif;

/// <summary>
/// Açılış ekranı: simge ölçeklenerek belirir, üzerinden ışık geçer, yanında ad ve alt başlık,
/// altta ilerleme çizgisi. Animasyonlar kapalıysa (Ayarlar > Animasyonlar; "Sistem" seçiliyse Windows'un ayarı)
/// her şey doğrudan görünür.
/// </summary>
public partial class AcilisPenceresi : Window
{
    private readonly bool _hareket = App.Hareketli;

    public AcilisPenceresi()
    {
        InitializeComponent();
        Title = Urun.Ad;
        UrunAdi.Text = Urun.Ad;
        AltBaslik.Text = Metinler.AltBaslik;
        SurumYazi.Text = Metinler.SurumEtiketi(Urun.SurumMetni);
        if (Tema.Acik) AcikTema();
        Loaded += (_, _) => Baslat();
    }

    private static SolidColorBrush Firca(uint argb) => new(Color.FromArgb(
        (byte)(argb >> 24), (byte)(argb >> 16), (byte)(argb >> 8), (byte)argb));

    /// <summary>Açık temada zemin, yazı ve ızgara renkleri (XAML koyu tema renkleriyle yazılıdır).</summary>
    private void AcikTema()
    {
        GolgeZemin.Background = Firca(0xFFFFFFFF);
        Golge.Color = Color.FromRgb(0x3A, 0x48, 0x66);
        Golge.Opacity = 0.28;
        Cerceve.BorderBrush = Firca(0xFFD3DAE6);
        Zemin1.Color = Color.FromRgb(0xFF, 0xFF, 0xFF);
        Zemin2.Color = Color.FromRgb(0xF3, 0xF6, 0xFA);
        Zemin3.Color = Color.FromRgb(0xE6, 0xEB, 0xF3);
        IzgaraKalem.Brush = Firca(0xFF3D4860);
        foreach (var d in new[] { Yazi1, Yazi2, Yazi3, Yazi4 }) d.Color = Color.FromRgb(0x1D, 0x2B, 0x4D);
        YaziIsikRengi.Color = Color.FromRgb(0x0A, 0x76, 0xAB);
        AltBaslik.Foreground = Firca(0xFF3D4860);
        SurumYazi.Foreground = Firca(0xFF5A657A);
        IlerlemeIz.Background = Firca(0x1F0F1830);
    }

    private static DoubleAnimation Anim(double bas, double son, int ms, int gecikme = 0, IEasingFunction? kolay = null) =>
        new(bas, son, TimeSpan.FromMilliseconds(ms))
        {
            BeginTime = TimeSpan.FromMilliseconds(gecikme),
            EasingFunction = kolay ?? new CubicEase { EasingMode = EasingMode.EaseOut },
        };

    private void Baslat()
    {
        if (!_hareket)
        {
            Simge.Opacity = 1;
            SimgeOlcek.ScaleX = SimgeOlcek.ScaleY = 1;
            Yazilar.Opacity = 1;
            YaziKaydir.X = 0;
            IlerlemeOlcek.ScaleX = 0.85;
            return;
        }

        var sekme = new BackEase { Amplitude = 0.28, EasingMode = EasingMode.EaseOut };
        Simge.BeginAnimation(OpacityProperty, Anim(0, 1, 420));
        SimgeOlcek.BeginAnimation(ScaleTransform.ScaleXProperty, Anim(0.78, 1, 720, 0, sekme));
        SimgeOlcek.BeginAnimation(ScaleTransform.ScaleYProperty, Anim(0.78, 1, 720, 0, sekme));

        Yazilar.BeginAnimation(OpacityProperty, Anim(0, 1, 460, 240));
        YaziKaydir.BeginAnimation(TranslateTransform.XProperty, Anim(-10, 0, 560, 240));

        // Işık önce simgenin, hemen ardından yazının üzerinden geçer
        var gidis = new SineEase { EasingMode = EasingMode.EaseInOut };
        SimgeIsik.BeginAnimation(TranslateTransform.XProperty, Anim(-1.3, 1.3, 900, 520, gidis));
        SimgeIsik.BeginAnimation(TranslateTransform.YProperty, Anim(-1.3, 1.3, 900, 520, gidis));
        YaziIsik.BeginAnimation(TranslateTransform.XProperty, Anim(-1.2, 1.2, 900, 860, gidis));

        IlerlemeOlcek.BeginAnimation(ScaleTransform.ScaleXProperty, Anim(0, 0.86, 1350, 150));
    }

    private static Task Bekle(AnimationTimeline anim, Action<AnimationTimeline> baslat)
    {
        var tcs = new TaskCompletionSource();
        anim.Completed += (_, _) => tcs.TrySetResult();
        baslat(anim);
        return tcs.Task;
    }

    /// <summary>İlerleme çizgisini sona taşır.</summary>
    public Task IlerlemeyiBitirAsync()
    {
        if (!_hareket)
        {
            IlerlemeOlcek.ScaleX = 1;
            return Task.CompletedTask;
        }
        var anim = Anim(IlerlemeOlcek.ScaleX, 1, 220);
        return Bekle(anim, a => IlerlemeOlcek.BeginAnimation(ScaleTransform.ScaleXProperty, a));
    }

    /// <summary>Hafifçe küçülerek solar ve kapanır.</summary>
    public async Task KapanAsync()
    {
        if (_hareket)
        {
            var kolay = new CubicEase { EasingMode = EasingMode.EaseIn };
            KapOlcek.BeginAnimation(ScaleTransform.ScaleXProperty, Anim(1, 0.975, 280, 0, kolay));
            KapOlcek.BeginAnimation(ScaleTransform.ScaleYProperty, Anim(1, 0.975, 280, 0, kolay));
            await Bekle(Anim(1, 0, 280, 0, kolay), a => BeginAnimation(OpacityProperty, a));
        }
        Close();
    }
}
