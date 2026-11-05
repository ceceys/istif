// Ürün kimliği: ad, sürüm ve bağlantılar yalnız burada yazılır.
// Kabuk tarafındaki karşılığı Istif.csproj (Product, AssemblyName, Version) ve Urun.cs'dir.

export const URUN = Object.freeze({
  ad: 'İstif',
  kisaAd: 'istif',            // ASCII: localStorage anahtarları, dosya biçimi
  surum: '1.0.0',
  uzanti: '.istif',           // plan dosyası uzantısı
  gelistiren: 'Cuma Ali Dirik',
  lisans: 'MIT',
  baglantilar: Object.freeze({
    github: 'https://github.com/ceceys/istif',
    linkedin: 'https://www.linkedin.com/in/cuma-ali-dirik',
  }),
});
