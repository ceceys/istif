# Contributing to İstif

Bug reports, ideas, translations and pull requests are welcome. You can write in English or Turkish.

## Reporting a bug

Open an [issue](https://github.com/ceceys/istif/issues/new/choose) and include:

- the İstif version (About screen),
- your Windows version (`winver`),
- the vehicle and the load that cause the problem (sizes, weights, rules), if you can share them,
- the last lines of `%LOCALAPPDATA%\Istif\gunluk.txt`.

Please do not attach plans or screenshots that contain confidential customer data.

Security problems should be reported privately through [Security → Report a vulnerability](https://github.com/ceceys/istif/security/advisories/new), not in a public issue.

## Translations

The interface has room for 12 languages: tr, en, de, fr, es, it, pt, ru, ar, zh, ja, ko. Turkish (the source) and English are complete. A language without its own files falls back to English, and a missing key falls back to English, then Turkish.

All files are flat key-value lists. Keep the keys, translate only the text:

| What | File |
|---|---|
| Interface | `Istif/web/js/dil/<code>.js` (copy `en.js`) |
| Windows shell (dialogs, title bar) | `Istif/Resources/Strings.<code>.json` (copy `Strings.en.json`) |
| Release notes in the update window | `Istif/Resources/Notes.<code>.md` (copy `Notes.en.md`) |
| Installer | `Istif/setup/diller/<code>.isl` (copy `en.isl`, save as UTF-8 with BOM) |

Notes:

- Placeholders such as `{ad}` or `{n}` are filled in at runtime; keep them.
- Plural forms: add `key#one`, `key#few`, `key#many`… next to `key` when your language needs them (CLDR categories, chosen with `Intl.PluralRules`). See the `#one` keys in `en.js`.
- Lists separated by `|` are words accepted in Excel files.
- A new interface language is picked up automatically: the language list is in `Istif/web/js/dil.js` (`DILLER`) and `Istif/Metinler.cs`; the installer adds a language when its `.isl` file exists.
- For Arabic, the layout switches to right-to-left when `ar.js` exists.

## Building

Requires Windows, the .NET 8 SDK and Node.js (for the engine tests).

```
dotnet build Istif/Istif.csproj -c Release
node testler/motor.test.mjs
```

The interface also runs in a browser without the Windows shell; see the README. The installer needs [Inno Setup 6](https://jrsoftware.org/isinfo.php); `Istif/setup/yayinla.ps1` builds all release files.

## Pull requests

- Keep each pull request to one topic.
- Follow the existing code style and avoid new compiler or analyzer warnings. Code comments are in Turkish; English is fine in new code.
- The placement engine (`Istif/web/js/motor/`) has its own tests in `testler/`; run them after any engine change.
- Add new interface texts to both `tr.js` and `en.js`.
- Describe what you changed and how you tested it.
- Leave the version number and `CHANGELOG.md` as they are; they are updated when a release is made.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
