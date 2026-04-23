# NO. 1 Money Exchange (Rate board + Trade screen)

This repository is a static web front end for an in-store FX rate board, trade calculator, and transaction log. A small local server in this repo (`web/serve_me2.exe` or `web/serve_me2.py`) serves the files and exposes a few HTTP APIs (for example writing `data/rates.json`).

## Requirements

- A modern browser (Chrome, Edge, etc.).
- To **persist rates to `data/rates.json`** or **sync trades to the server**, open the app via the launcher so the URL is **`http://127.0.0.1:8765`**. Opening `index.html` directly from disk often cannot write files.
- Optional: Python 3 (for `tools/build_boot.py` and PyInstaller packaging of `serve_me2.exe`).
- Optional: Inno Setup (to compile `MoneyExchange2.iss` into an installer).

## Quick start

1. Open the `web` folder.
2. Double-click **`启动程序.bat`**: starts the local server and opens the **rate board** (`index.html`).
3. For **trade / log / CSV export**, double-click **`打开交易界面.bat`** (`trade.html`).

If saving fails, confirm the address bar shows `127.0.0.1` and avoid running **multiple** `serve_me2` processes on the same port. In Task Manager, end extra `serve_me2.exe` instances, then start only one.

## Project layout (important files)

| Path | Purpose |
|------|---------|
| `web/index.html` | Rate board |
| `web/trade.html` | Trade calculator, log, CSV export |
| `web/data/rates.json` | Runtime rates and shop metadata (phone, brand, etc.); prefer saving through the UI |
| `web/js/boot-data.js` | Generated boot data from `tools/build_boot.py` (avoid hand-editing unless you know the impact) |
| `web/js/app.js` | Board logic |
| `web/js/trade.js` | Trade page and export logic |
| `web/serve_me2.py` / `web/serve_me2.exe` | Local HTTP server (static files + APIs) |
| `MoneyExchange2.iss` | Inno Setup script (default install dir `D:\NO1MoneyExchange`) |

## Shop phone and default copy

- On the trade page under **Rates**, you can edit the **shop phone**. **Save global table** writes `phone` in `data/rates.json`; receipts and the rest of the UI read the current data.
- For seed data, branding, and i18n strings, edit `web/tools/build_boot.py` and regenerate (below).

## Regenerate `boot-data.js` and `rates.json`

From the `web` directory:

```bat
python tools\build_boot.py
```

This refreshes `web/data/rates.json`, `web/js/boot-data.js`, and `web/USAGE.txt`.

## Rebuild `serve_me2.exe`

From the `web` directory:

```bat
tools\打包生成serve_me2_exe.bat
```

Requires Python and PyInstaller on the build machine; see the script for details.

## Windows installer

- Open `MoneyExchange2.iss` in Inno Setup and compile.
- **Default install directory**: `D:\NO1MoneyExchange`. If drive `D:\` does not exist, `InitializeWizard` in `[Code]` falls back to a per-user folder under `%LocalAppData%` (see the script).
- Inno Setup versions differ; if a `[Setup]` directive is rejected, follow the documentation for your installed version.

## Development tips

- After changing CSS/JS, use a **hard refresh** (`Ctrl+F5`) to avoid cached assets.
- A second copy of the tree may exist under `Uninstall\web\`. If changes do not appear, confirm which `web` root the browser is loading.

---

For feature work (CSV columns, fullscreen layout, installer paths, etc.), continue iterating in this repository.
