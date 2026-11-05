using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Media;

namespace Istif;

/// <summary>Çerçevesiz pencere için gereken birkaç Windows çağrısı.</summary>
internal static partial class Yerel
{
    public const int WM_NCHITTEST = 0x0084;
    public const int WM_NCMOUSEMOVE = 0x00A0;
    public const int WM_NCLBUTTONDOWN = 0x00A1;
    public const int WM_NCLBUTTONUP = 0x00A2;
    public const int WM_NCMOUSELEAVE = 0x02A2;
    public const int HTMAXBUTTON = 9;

    private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
    private const int DWMWA_BORDER_COLOR = 34;
    private const int DWMWCP_ROUND = 2;
    private const int SM_CXSIZEFRAME = 32;
    private const int SM_CYSIZEFRAME = 33;
    private const int SM_CXPADDEDBORDER = 92;

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetricsForDpi(int index, uint dpi);

    [StructLayout(LayoutKind.Sequential)]
    private struct TRACKMOUSEEVENT
    {
        public int cbSize;
        public uint dwFlags;
        public IntPtr hwndTrack;
        public uint dwHoverTime;
    }

    private const uint TME_LEAVE = 0x2;
    private const uint TME_NONCLIENT = 0x10;

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TrackMouseEvent(ref TRACKMOUSEEVENT olay);

    /// <summary>İmleç pencerenin çerçeve alanından çıkınca WM_NCMOUSELEAVE gelsin.</summary>
    public static void AyrilisIzle(IntPtr hwnd)
    {
        var t = new TRACKMOUSEEVENT
        {
            cbSize = Marshal.SizeOf<TRACKMOUSEEVENT>(),
            dwFlags = TME_LEAVE | TME_NONCLIENT,
            hwndTrack = hwnd,
        };
        TrackMouseEvent(ref t);
    }

    /// <summary>Windows 11 ve sonrası mı? (yuvarlak köşe ve kenar rengi desteği)</summary>
    public static bool Windows11 { get; } = Environment.OSVersion.Version.Build >= 22000;

    /// <summary>Windows 11'de pencere köşelerini yuvarlatır ve kenar çizgisini verilen renge boyar.</summary>
    public static void PencereGorunumu(IntPtr hwnd, Color kenar)
    {
        if (!Windows11) return;
        try
        {
            int kose = DWMWCP_ROUND;
            DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ref kose, sizeof(int));
            int renk = kenar.R | (kenar.G << 8) | (kenar.B << 16);
            DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, ref renk, sizeof(int));
        }
        catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException)
        {
            // Eski sistemde sessizce geç.
        }
    }

    /// <summary>
    /// Büyütülmüş çerçevesiz pencere ekranın dışına çerçeve kalınlığı kadar taşar;
    /// bu taşmayı kapatmak için gereken iç boşluk (DIP).
    /// </summary>
    public static Thickness BuyukPencereTasmasi(Visual gorsel)
    {
        try
        {
            var dpi = VisualTreeHelper.GetDpi(gorsel);
            uint d = (uint)Math.Round(96 * dpi.DpiScaleX);
            int pad = GetSystemMetricsForDpi(SM_CXPADDEDBORDER, d);
            double x = (GetSystemMetricsForDpi(SM_CXSIZEFRAME, d) + pad) / dpi.DpiScaleX;
            double y = (GetSystemMetricsForDpi(SM_CYSIZEFRAME, d) + pad) / dpi.DpiScaleY;
            return new Thickness(x, y, x, y);
        }
        catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException)
        {
            return new Thickness(7);
        }
    }
}
