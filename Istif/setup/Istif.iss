; İstif kurulum paketi (Inno Setup 6)
; Doğrudan derlenmez; setup\yayinla.ps1 (ya da .github\workflows\build.yml) önce publish alır, sonra şöyle çağırır:
;   ISCC.exe /DAppVersion=1.0.0 /DKaynak=<publish\kurulum> /O<çıktı klasörü> setup\Istif.iss
;
; Kullanıcı başına kurulur (yönetici izni istemez). Başlat menüsü kısayolu, isteğe bağlı masaüstü kısayolu,
; .istif dosya ilişkilendirmesi. Kaldırınca kullanıcı verisi (%APPDATA%\Istif) yerinde kalır; ilişkilendirmenin
; değerleri silinir, anahtarlarda başka programın değeri kalmadıysa anahtarlar da silinir.
; .NET 8 Masaüstü Çalışma Zamanı ve WebView2 Çalışma Zamanı denetlenir; eksikse kurulum durur ve
; indirme sayfası bildirilir. Kurulum kendisi hiçbir şey indirmez.
; Kurulum metinleri setup\diller\<dil>.isl dosyalarındadır; bir dilin dosyası eklenince o dil kendiliğinden girer.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef Kaynak
  #define Kaynak "..\publish\kurulum"
#endif
#define AppName "İstif"
#define AppKisaAd "Istif"
#define AppPublisher "Cuma Ali Dirik"
#define AppURL "https://github.com/ceceys/istif"
#define AppExe "Istif.exe"
#define DosyaTuru "Istif.Plan"

[Setup]
AppId={{2C924437-C9EB-431E-B155-1BC6AC93821B}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
AppUpdatesURL={#AppURL}/releases
DefaultDirName={autopf}\{#AppKisaAd}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\publish\dagitim
OutputBaseFilename={#AppKisaAd}-Setup-{#AppVersion}
SetupIconFile=..\Assets\uygulama.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName} {#AppVersion}
VersionInfoVersion={#AppVersion}
VersionInfoProductName={#AppName}
VersionInfoDescription={#AppName} Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
CloseApplications=yes
RestartApplications=no
ChangesAssociations=yes
LicenseFile=..\..\LICENSE
ShowLanguageDialog=auto

[Languages]
; Türkçe ve İngilizce her zaman; öteki diller yalnız çevirisi (diller\<kod>.isl) ve Inno Setup'ın kendi
; ileti dosyası varsa girer. Kurulum dili Windows'un arayüz diline göre seçilir.
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl,diller\tr.isl"
Name: "english"; MessagesFile: "compiler:Default.isl,diller\en.isl"
#if FileExists(AddBackslash(SourcePath) + "diller\de.isl")
#ifexist "compiler:Languages\German.isl"
Name: "german"; MessagesFile: "compiler:Languages\German.isl,diller\de.isl"
#endif
#endif
#if FileExists(AddBackslash(SourcePath) + "diller\fr.isl")
#ifexist "compiler:Languages\French.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl,diller\fr.isl"
#endif
#endif
#if FileExists(AddBackslash(SourcePath) + "diller\es.isl")
#ifexist "compiler:Languages\Spanish.isl"
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl,diller\es.isl"
#endif
#endif
#if FileExists(AddBackslash(SourcePath) + "diller\it.isl")
#ifexist "compiler:Languages\Italian.isl"
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl,diller\it.isl"
#endif
#endif
#if FileExists(AddBackslash(SourcePath) + "diller\pt.isl")
#ifexist "compiler:Languages\Portuguese.isl"
Name: "portuguese"; MessagesFile: "compiler:Languages\Portuguese.isl,diller\pt.isl"
#endif
#endif
#if FileExists(AddBackslash(SourcePath) + "diller\ru.isl")
#ifexist "compiler:Languages\Russian.isl"
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl,diller\ru.isl"
#endif
#endif
#if FileExists(AddBackslash(SourcePath) + "diller\ar.isl")
#ifexist "compiler:Languages\Arabic.isl"
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl,diller\ar.isl"
#endif
#endif
#if FileExists(AddBackslash(SourcePath) + "diller\zh.isl")
#ifexist "compiler:Languages\ChineseSimplified.isl"
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl,diller\zh.isl"
#endif
#endif
#if FileExists(AddBackslash(SourcePath) + "diller\ja.isl")
#ifexist "compiler:Languages\Japanese.isl"
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl,diller\ja.isl"
#endif
#endif
#if FileExists(AddBackslash(SourcePath) + "diller\ko.isl")
#ifexist "compiler:Languages\Korean.isl"
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl,diller\ko.isl"
#endif
#endif

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#Kaynak}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Registry]
; .istif dosya ilişkilendirmesi (kullanıcı başına kurulumda HKCU\Software\Classes altına yazılır).
; Kaldırınca değer silinir; anahtar boş kaldıysa (başka programın değeri yoksa) anahtar da silinir.
Root: HKA; Subkey: "Software\Classes\.istif"; ValueType: string; ValueName: ""; ValueData: "{#DosyaTuru}"; Flags: uninsdeletevalue uninsdeletekeyifempty
Root: HKA; Subkey: "Software\Classes\.istif\OpenWithProgids"; ValueType: string; ValueName: "{#DosyaTuru}"; ValueData: ""; Flags: uninsdeletevalue uninsdeletekeyifempty
Root: HKA; Subkey: "Software\Classes\{#DosyaTuru}"; ValueType: string; ValueName: ""; ValueData: "{cm:DosyaTuruAdi}"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\{#DosyaTuru}\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#AppExe},0"
Root: HKA; Subkey: "Software\Classes\{#DosyaTuru}\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExe}"" ""%1"""

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
; Program içi güncelleme sessiz kurar ve /YENIDENAC=1 verir; bitince program yeniden açılır
Filename: "{app}\{#AppExe}"; Flags: nowait; Check: YenidenAcilsin

[Code]
const
  WebView2Anahtari = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function DotNetMasaustuVar(): Boolean;
var
  Bul: TFindRec;
begin
  Result := False;
  if FindFirst(ExpandConstant('{commonpf64}\dotnet\shared\Microsoft.WindowsDesktop.App\8.*'), Bul) then
  begin
    try
      repeat
        if (Bul.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0 then Result := True;
      until Result or (not FindNext(Bul));
    finally
      FindClose(Bul);
    end;
  end;
end;

function SurumGecerli(const Surum: String): Boolean;
begin
  Result := (Surum <> '') and (Surum <> '0.0.0.0');
end;

function WebView2Var(): Boolean;
var
  Surum: String;
begin
  Result :=
    (RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\' + WebView2Anahtari, 'pv', Surum) and SurumGecerli(Surum)) or
    (RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\' + WebView2Anahtari, 'pv', Surum) and SurumGecerli(Surum)) or
    (RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\' + WebView2Anahtari, 'pv', Surum) and SurumGecerli(Surum));
end;

function YenidenAcilsin(): Boolean;
begin
  Result := WizardSilent() and (ExpandConstant('{param:YENIDENAC|0}') = '1');
end;

procedure SayfayiAc(const Adres: String);
var
  Kod: Integer;
begin
  ShellExec('open', Adres, '', '', SW_SHOWNORMAL, ewNoWait, Kod);
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if not DotNetMasaustuVar() then
  begin
    if SuppressibleMsgBox(CustomMessage('DotNetYok'), mbError, MB_YESNO, IDNO) = IDYES then
      SayfayiAc('https://dotnet.microsoft.com/download/dotnet/8.0');
    Result := False;
    exit;
  end;
  if not WebView2Var() then
  begin
    if SuppressibleMsgBox(CustomMessage('WebView2Yok'), mbError, MB_YESNO, IDNO) = IDYES then
      SayfayiAc('https://developer.microsoft.com/microsoft-edge/webview2/');
    Result := False;
  end;
end;
