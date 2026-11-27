#!/usr/bin/env bash
# Builds public/Dwenlite-Setup.exe. Needs: nsis (apt install nsis) and Python with Pillow.
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
from PIL import Image
im = Image.open('../public/pwa-512x512.png').convert('RGBA')
im.save('dwenlite.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
PY
makensis -V2 dwenlite.nsi
mv -f Dwenlite-Setup.exe ../public/Dwenlite-Setup.exe
ls -l ../public/Dwenlite-Setup.exe
