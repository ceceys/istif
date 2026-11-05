using System.Text;

namespace Istif;

/// <summary>Basit hata günlüğü: %LOCALAPPDATA%\Istif\gunluk.txt (512 KB'ı geçince eskisi .eski olur).</summary>
internal static class Gunluk
{
    private static readonly object Kilit = new();
    private const long EnFazlaBoyut = 512 * 1024;

    public static void Yaz(string metin)
    {
        try
        {
            lock (Kilit)
            {
                var yol = Depo.GunlukYolu;
                Directory.CreateDirectory(Path.GetDirectoryName(yol)!);
                var bilgi = new FileInfo(yol);
                if (bilgi.Exists && bilgi.Length > EnFazlaBoyut)
                    File.Move(yol, yol + ".eski", overwrite: true);
                File.AppendAllText(yol, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss}  {metin}{Environment.NewLine}", Encoding.UTF8);
            }
        }
        catch
        {
            // Günlük yazılamıyorsa programı durdurmaya değmez.
        }
    }
}
