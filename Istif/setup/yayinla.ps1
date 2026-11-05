<#
  İstif sürüm dosyalarını üretir: derle, publish, Inno Setup, SHA-256.
  GitHub Actions'taki .github\workflows\build.yml ile aynı adları üretir.

  Çıktılar (sürüm Istif.csproj'daki <Version> değerinden):
    Istif-Setup-<sürüm>.exe   kurulum paketi (kullanıcı başına, .istif ilişkilendirmesi)
    Istif-Setup.exe           aynı paketin sürümsüz kopyası (README'deki "son sürümü indir" bağlantısı için)
    Istif.exe                 taşınabilir tek dosya, kurulumsuz çalışır
    SHA256SUMS.txt            üç dosyanın SHA-256 özeti (program içi güncelleme bunu doğrular)

  Kullanım:
    powershell -ExecutionPolicy Bypass -File setup\yayinla.ps1 [-Cikti <klasör>] [-Iscc <ISCC.exe yolu>]

  Ağa çıkmaz: NuGet paketleri yerel önbellekten geri yüklenir (Istif.csproj: NuGetAudit=false).
  Geliştirme dosyaları (web\gelistirme.html, web\js\gelistirme.js) dağıtıma girmez; betik bunu denetler.
  Çıktı klasöründe aynı adlı dosyaların üzerine yazılır, başka hiçbir şey silinmez.
#>
param(
  [string] $Cikti,
  [string] $Iscc = (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
)

$ErrorActionPreference = 'Stop'
$proje = Split-Path -Parent $PSScriptRoot
$csproj = Join-Path $proje 'Istif.csproj'
$ara = Join-Path $proje 'publish'

if (-not $Cikti) {
  # Depo dışındaki "Dağıtım" klasörü varsa oraya, yoksa publish\dagitim'e
  $dagitim = Join-Path (Split-Path -Parent (Split-Path -Parent $proje)) 'Dağıtım'
  $Cikti = if (Test-Path -LiteralPath $dagitim) { $dagitim } else { Join-Path $ara 'dagitim' }
}
New-Item -ItemType Directory -Force -Path $Cikti | Out-Null
if (-not (Test-Path -LiteralPath $Iscc)) { throw "Inno Setup derleyicisi bulunamadı: $Iscc" }

[xml] $xml = Get-Content -LiteralPath $csproj -Encoding UTF8
$surum = @($xml.Project.PropertyGroup | ForEach-Object { $_.Version } | Where-Object { $_ })[0]
if (-not $surum) { throw 'Istif.csproj içinde <Version> bulunamadı.' }
$kisa = @($xml.Project.PropertyGroup | ForEach-Object { $_.AssemblyName } | Where-Object { $_ })[0]

# Arayüzdeki sürüm (web\js\urun.js) csproj ile aynı olmalı
$urunJs = Get-Content -LiteralPath (Join-Path $proje 'web\js\urun.js') -Raw -Encoding UTF8
if ($urunJs -notmatch "surum:\s*'$([regex]::Escape($surum))'") { throw "web\js\urun.js içindeki sürüm $surum değil." }
Write-Host "Sürüm $surum" -ForegroundColor Cyan

function Calistir([string] $ad, [string[]] $argumanlar) {
  Write-Host "> $ad $($argumanlar -join ' ')" -ForegroundColor DarkGray
  & $ad @argumanlar
  if ($LASTEXITCODE -ne 0) { throw "$ad başarısız oldu (çıkış $LASTEXITCODE)." }
}

# 1. Derleme denetimi: uyarı da hata sayılır
Calistir 'dotnet' @('build', $csproj, '-c', 'Release', '--nologo', '-warnaserror')

# Her yayın kendi boş klasörüne alınır; eski çıktıyla karışmaz, betik hiçbir şey silmez.
# publish\ git dışıdır; eski yayın klasörleri elle silinebilir.
$damga = Get-Date -Format 'yyyyMMdd-HHmmss'
$yayin = Join-Path $ara "$surum-$damga"

# 2. Kurulum için çok dosyalı publish (çerçeveye bağlı, win-x64)
$kurulum = Join-Path $yayin 'kurulum'
Calistir 'dotnet' @('publish', $csproj, '-c', 'Release', '-r', 'win-x64', '--self-contained', 'false',
  '-p:PublishSingleFile=false', '-p:DebugType=none', '-o', $kurulum, '--nologo')

# Geliştirme dosyaları dağıtıma girmemeli
$gelistirme = @(Get-ChildItem -LiteralPath $kurulum -Recurse -File | Where-Object { $_.Name -like 'gelistirme*' })
if ($gelistirme.Count) { throw "Geliştirme dosyası dağıtıma girmiş: $($gelistirme.FullName -join ', ')" }

# 3. Taşınabilir tek dosya: arayüz dosyaları ilk açılışta geçici klasöre açılır
$tek = Join-Path $yayin 'tasinabilir'
Calistir 'dotnet' @('publish', $csproj, '-c', 'Release', '-r', 'win-x64', '--self-contained', 'false',
  '-p:PublishSingleFile=true', '-p:IncludeAllContentForSelfExtract=true', '-p:IncludeNativeLibrariesForSelfExtract=true',
  '-p:DebugType=none', '-o', $tek, '--nologo')
$tasinabilir = Join-Path $Cikti "$kisa.exe"
Copy-Item -LiteralPath (Join-Path $tek "$kisa.exe") -Destination $tasinabilir -Force

# 4. Kurulum paketi ve sürümsüz kopyası
Calistir $Iscc @('/Q', "/DAppVersion=$surum", "/DKaynak=$kurulum", "/O$Cikti", (Join-Path $PSScriptRoot 'Istif.iss'))
$setup = Join-Path $Cikti "$kisa-Setup-$surum.exe"
if (-not (Test-Path -LiteralPath $setup)) { throw "Kurulum dosyası oluşmadı: $setup" }
$setupSabit = Join-Path $Cikti "$kisa-Setup.exe"
Copy-Item -LiteralPath $setup -Destination $setupSabit -Force

# 5. SHA-256 özetleri (sha256sum biçimi: "<özet>  <dosya>")
$satirlar = foreach ($f in @($setup, $setupSabit, $tasinabilir)) {
  $ozet = (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant()
  "$ozet  $(Split-Path -Leaf $f)"
}
$ozetDosyasi = Join-Path $Cikti 'SHA256SUMS.txt'
[IO.File]::WriteAllText($ozetDosyasi, (($satirlar -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))

Write-Host ''
Write-Host "Hazır: $Cikti" -ForegroundColor Green
Get-ChildItem -LiteralPath $Cikti -File | Where-Object { $_.Name -in @("$kisa-Setup-$surum.exe", "$kisa-Setup.exe", "$kisa.exe", 'SHA256SUMS.txt') } |
  Select-Object Name, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 2) } } | Format-Table -AutoSize
