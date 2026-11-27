# Dwenlite for Windows (installer)

`build.sh` produces `public/Dwenlite-Setup.exe` (served at https://www.dwenlite.space/Dwenlite-Setup.exe).

- Needs `nsis` (`apt install nsis`) and Python with Pillow. Run `./installer/build.sh` after changing anything in this folder.
- The installer needs no administrator rights. It puts a private copy of Node.js, the helper (`dwenlite-agent.mjs`) and these scripts in `%LOCALAPPDATA%\Dwenlite`, pairs the computer with the short code from Dwenlite Home, and adds a Startup shortcut.
- `run.ps1` keeps the helper running and restarts it; the helper updates itself from the website.
- `tray.ps1` is the icon near the clock (status, open Home, Ctrl+Alt+D to ask something).
- The installer is not code-signed, so Windows SmartScreen shows "Windows protected your PC" the first time. A code-signing certificate removes that.
