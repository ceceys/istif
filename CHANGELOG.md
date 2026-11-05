# Changelog

## 1.0.0 — 2026-11-05

First public release.

### Planning

- 3D load planning for semi-trailers, trucks, vans and containers. The engine places machines, crates, pallets and cartons in a Web Worker; the same input always gives the same result. Units inside the engine are integer millimetres and kilograms.
- Load rules per item: no stacking on top, floor only, top load limit, orientation (free / upright / fixed), delivery order for multi-stop shipments.
- Extra vehicles when the load does not fit, door allowance at the rear.
- Mixed fleet: after the main vehicle, the remaining load goes to the next vehicles in a sortable list (drag and drop or Alt + ↑/↓). Optionally the engine chooses the vehicle type that takes the rest in the fewest vehicles, then the shortest total length.
- "Centre a short load" option (`secenekler.dengele`); the interface sends it and the engine uses it when supported.
- Door opening check in the interface: items whose two smallest sizes are larger than the vehicle's door opening are flagged in the load list, the warnings panel and the PDF.
- Undo and redo for plan inputs (Ctrl+Z / Ctrl+Y, toolbar buttons). Typing in one field counts as one step.
- Automatic draft every 30 seconds while a plan has unsaved changes. It is deleted on a normal exit; after a crash the next start asks whether to restore it.

### Vehicles

- Preset types are derived from the vehicle catalogue (`Istif/web/veri/arac-katalogu.json`): standard and mega semi-trailer (13.62 m), 20' / 40' / 40' HC containers and a panel van (Ford Transit L3H2). Sizes, door openings and payloads come from the catalogue; each preset shows a "typical" or "model sheet" badge and its source link. Standard and mega semi-trailers use 24,000 kg payload.
- No default axle data. The vehicle card has an optional "Axle data" section (king pin and axle group positions); with it, axle shares are estimated.
- Catalogue records without a payload leave the payload field empty with a short warning; the engine then applies no weight limit.
- Panel vans note that the width is measured between the wheel arches.
- Advanced catalogue: an "Advanced" tab on the Vehicles screen and a catalogue window from the vehicle picker. Search, category and maker filters, internal size, door opening, payload, volume, notes and all sources. "Use this vehicle" copies the record into the plan, "Save to library" into My vehicles. The list does not depend on the number of records.
- Source links open in the default browser; the shell only opens URLs listed in the catalogue (exact match), GitHub and LinkedIn.

### 3D view

- Isometric, side, top and rear views, fit to view, step-by-step loading animation.
- Zoom in / out buttons and a zoom slider; `+` and `−` keys when the 3D area has focus.
- Double click a piece to focus on it (double click on empty space fits the vehicle); double click a row in the loading order table does the same.
- Save the current view as PNG; full screen 3D view (the window title bar is hidden while in full screen).
- Corner hint for mouse controls.
- Weight along the length: a strip below the 3D view shows load per metre, the centre of gravity, the middle of the vehicle, the door allowance and, with axle data, the king pin and axle group with their estimated shares. The same axle shares are labelled in the 3D view.
- Vehicle tabs show the vehicle type name (useful with a mixed fleet).

### Manual editing (3D)

- "Edit" switch in the 3D toolbar. Click to select, Ctrl+click to add or remove, Shift+drag to select an area, Esc to clear; the loading order table follows the 3D selection. "Select the stack too" (on by default) also selects the pieces standing on the selected one.
- Drag on the floor plane, hold Alt to change the height; on release the piece snaps to the grid (1, 5 or 10 cm), clings to nearby walls and faces and settles on the surface below. Arrow keys nudge by one grid step (Shift: ten), Page Up / Page Down move up and down; the arrows follow the camera.
- R turns 90° flat, T tips onto the side, Y tips forward; the item's orientation rule is respected (upright: only R; fixed: none), disabled buttons explain why. Several pieces turn together around their common centre.
- Push to the left, right, front or back wall and lower to the floor; "Close the gap" pushes forward. With nothing selected, the whole load moves. "Back to automatic plan" discards manual changes.
- Free space to the roof, left, right, front and door for the selection (or the whole load) as dimension lines in 3D and as a list next to the loading order; the numbers update while dragging.
- Live check by the engine after every change (and about every 60 ms while dragging): faulty pieces turn red and shake slightly, delivery-order warnings turn yellow, the reasons are listed in the interface language; summary cards, centre of gravity, axle shares and loading order are recalculated. With errors the plan can still be saved and printed; the top bar says "The plan has N errors".
- Animations: soft snap on release, sliding moves, 90° turns, pieces glide back on undo, dimension lines fade in. They follow Settings > Animations (see below).
- Every manual step is in the Ctrl+Z / Ctrl+Y history. The `.istif` file keeps the edited layout (`elleDuzenlendi`, `otomatikSonuc`); pressing Plan again asks before discarding manual changes. The PDF uses the edited layout, adds a free space table for every vehicle and lists the errors.

### Interface

- Dark, light and system theme. The title bar, splash screen and 3D scene follow the theme; light theme text meets WCAG AA contrast.
- Animations setting: On (default; animations run even when Windows animation effects are off), System (follows Windows, `prefers-reduced-motion`) or Off. It applies to CSS transitions, the 3D loading playback, manual editing, camera moves and the splash screen, and is saved in `ayarlar.json` (`animasyon`).
- Settings screen: language, theme, animations, units, default vehicle, update check (on/off, check now, release notes), open the data folder, export and import the product and vehicle library (JSON; add to or replace the current library).
- Units: metric (cm, kg, m) or imperial (in, lb, ft) for input and display, including the PDF and Excel import. The engine always works in mm and kg.
- 12-language structure (tr, en, de, fr, es, it, pt, ru, ar, zh, ja, ko). All 12 languages are translated; texts added later fall back to English until they are translated. First start follows the Windows display language. Right-to-left layout for Arabic. Numbers and dates use `Intl`. Engine warnings are shown in the interface language.
- Example load gallery: farm machinery, EUR pallets, mixed cartons, container export. EUR pallet (120 × 80) and industrial pallet (120 × 100) products in the library (height and weight are starting values to adjust).
- Release notes window (from `Istif/Resources/Notes.<lang>.md`).
- Keyboard navigation (arrow keys in the navigation rail, vehicle menu, load list, vehicle tabs and fleet list) and visible focus rings.

### Files and output

- `.istif` plan files (JSON), recent plans, drag and drop to open.
- PDF loading plan (A4 landscape): summary, warnings, load list, and per vehicle 3D images and the loading order table.
- Import from Excel (.xlsx, .xls) and CSV with column matching, length and weight units, preview of invalid rows and a downloadable template.

### Windows shell and updates

- WPF + WebView2 shell; the interface runs from a virtual host and every other request is blocked.
- In-app updates from GitHub Releases: checks at most once a day (can be turned off), shows the release notes in the app's language, downloads the installer or the portable exe, verifies it against `SHA256SUMS.txt`, installs and restarts.
- Installer (Inno Setup, per user, no admin rights) in Turkish and English; setup texts are in `Istif/setup/diller/`. Uninstalling removes the `.istif` association keys when they are empty and keeps user data.
- Debug builds only: `--pdf-dene`, `--duzenle-dene <folder>` (plays the manual editing scenario and writes screenshots and a PDF to the folder), `--dil`, `--tema`, `--animasyon acik|sistem|kapali` and `--uzak-hata-ayiklama <port>` for testing and screen recording.
