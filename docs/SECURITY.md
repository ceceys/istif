# Security notes

İstif is a local desktop tool. Plans, the product and vehicle library and the settings stay on the computer. There is no telemetry and nothing is uploaded.

## Network access

The program's **only network access** is the update check against GitHub (HTTPS only):

- `api.github.com/repos/ceceys/istif/releases/latest` to read the latest version,
- `api.github.com/repos/ceceys/istif/contents/Istif/Resources/Notes.<lang>.md` at the release tag for the release notes,
- the release download URLs on `github.com` when the user agrees to install.

The check runs at most once a day after start and can be turned off in Settings. `Istif.exe --cevrimdisi` starts without it. Source links in the vehicle catalogue are not fetched by the program; they open in the default browser when the user clicks them.

## Updates

- The latest release tag is compared with the program version; only assets served from `https://` are considered.
- A download is accepted only if the release contains `SHA256SUMS.txt` (created by the GitHub Actions workflow) and the file's SHA-256 matches its line there. Otherwise the file is deleted and nothing is installed. Downloads are capped at 300 MB.
- Nothing is installed without the user confirming in the app. The installer runs with Inno Setup's silent switches; a portable copy replaces itself after the program exits.

## Embedded browser (WebView2)

- The interface is served from the local `web` folder through the virtual host `https://uygulama.istif/`. Every other request and navigation is blocked in the shell; new windows are not opened.
- The page has a strict Content Security Policy: scripts, styles, workers and data only from the program itself (`'self'`), no external addresses.
- Messages from the page are accepted only from the virtual host. Each request is validated (types, sizes, file extensions); unknown requests are rejected.
- Release builds disable developer tools, the default context menu and browser shortcuts. Background browser networking (component updates, pings) is switched off.

## Files

| Input | Protection |
|---|---|
| `.istif` plan files | Must be valid JSON, at most 50 MB; vehicles, items and results are validated before use. |
| Excel / CSV import | At most 20 MB; read locally with the bundled SheetJS; rows are validated and previewed before they are added. |
| Library import (JSON) | Validated; invalid products and vehicles are dropped. The user chooses to add or replace. |
| Settings, library, recent plans, draft | Written atomically (temporary file, then move) in `%APPDATA%\Istif\`. A damaged file falls back to defaults. |
| Vehicle catalogue | Ships with the program (`web/veri/arac-katalogu.json`); records without positive internal sizes are ignored. |

## Process launches

The program starts only: `explorer.exe` to show a saved file or the data folder, the default browser for allowed links (the GitHub and LinkedIn pages in About and the source URLs listed in the vehicle catalogue, exact match only), and the downloaded installer or the update script during an update.

## Reporting

Please report security problems privately through [Security → Report a vulnerability](https://github.com/ceceys/istif/security/advisories/new) instead of a public issue. For other bugs, open an [issue](https://github.com/ceceys/istif/issues/new/choose).
