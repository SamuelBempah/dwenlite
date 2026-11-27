#!/bin/sh
# Dwenlite helper for Mac and Linux.
#   curl -fsSL https://www.dwenlite.space/install.sh | sh -s -- ABCD-EFGH
# (the code comes from Dwenlite Home > Add a computer; leave it off and you will be asked for it)
# Installs for the current user only: no admin rights. It starts when you log in and keeps itself up to date.
set -eu

SITE="${DWENLITE_SITE:-https://www.dwenlite.space}"
HOME_DIR="${DWENLITE_HOME:-$HOME/.dwenlite}"
CODE="${1:-}"
say() { printf '%s\n' "$*"; }
die() { printf '\nSomething went wrong: %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "Dwenlite needs Node.js (version 22 or newer), and it is not installed.
  Mac:   brew install node        (or get it from https://nodejs.org)
  Linux: install 'nodejs' with your package manager, or use https://nodejs.org
Then run this command again."
NODE_BIN="$(command -v node)"
MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
[ "$MAJOR" -ge 18 ] 2>/dev/null || die "Node.js $MAJOR is too old. Please install version 22 or newer from https://nodejs.org"
[ "$MAJOR" -ge 22 ] 2>/dev/null || say "Note: Node.js $MAJOR works, but version 22 or newer is needed for the private browser features."

say "Getting the latest Dwenlite helper..."
mkdir -p "$HOME_DIR/agent"
if command -v curl >/dev/null 2>&1; then curl -fsSL --max-time 60 "$SITE/dwenlite-agent.mjs" -o "$HOME_DIR/agent/dwenlite-agent.mjs.new" || die "could not download the helper from $SITE"
else wget -q -T 60 -O "$HOME_DIR/agent/dwenlite-agent.mjs.new" "$SITE/dwenlite-agent.mjs" || die "could not download the helper from $SITE"; fi
grep -q "export const VERSION" "$HOME_DIR/agent/dwenlite-agent.mjs.new" || die "the download did not look right"
mv "$HOME_DIR/agent/dwenlite-agent.mjs.new" "$HOME_DIR/agent/dwenlite-agent.mjs"

if [ -z "$CODE" ]; then
  if [ -r /dev/tty ]; then printf 'Type the code from Dwenlite Home (Add a computer): ' >/dev/tty; read -r CODE </dev/tty; else die "no code given. Run: sh install.sh ABCD-EFGH"; fi
fi
say "Connecting this computer..."
"$NODE_BIN" "$HOME_DIR/agent/dwenlite-agent.mjs" pair "$CODE" || die "the code was not accepted. Make a new one in Dwenlite Home and try again."

# a small runner that restarts the helper if it ever stops (but not when you removed this computer in Dwenlite Home)
cat > "$HOME_DIR/run.sh" <<RUN
#!/bin/sh
D="$HOME_DIR"
LOCK="\$D/.running"
if [ -f "\$LOCK" ] && kill -0 "\$(cat "\$LOCK" 2>/dev/null)" 2>/dev/null; then exit 0; fi
echo \$\$ > "\$LOCK"
trap 'rm -f "\$LOCK"' EXIT
while true; do
  [ -f "\$D/helper.log" ] && [ "\$(wc -c < "\$D/helper.log")" -gt 2097152 ] && rm -f "\$D/helper.log"
  "$NODE_BIN" "\$D/agent/dwenlite-agent.mjs" run >> "\$D/helper.log" 2>&1
  code=\$?
  [ "\$code" -eq 2 ] && break
  if [ "\$code" -eq 1 ]; then sleep 60; else sleep 5; fi
done
RUN
chmod +x "$HOME_DIR/run.sh"

UNAME="$(uname -s)"
if [ "${DWENLITE_NO_SERVICE:-}" = "1" ]; then
  say "Installed (start-up setup skipped)."
elif [ "$UNAME" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/space.dwenlite.helper.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>space.dwenlite.helper</string>
<key>ProgramArguments</key><array><string>/bin/sh</string><string>$HOME_DIR/run.sh</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ProcessType</key><string>Background</string>
</dict></plist>
PL
  launchctl bootout "gui/$(id -u)/space.dwenlite.helper" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || launchctl load -w "$PLIST" >/dev/null 2>&1 || say "Could not start it automatically. Log out and in again, or run: sh $HOME_DIR/run.sh &"
else
  if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
    UNIT_DIR="$HOME/.config/systemd/user"; mkdir -p "$UNIT_DIR"
    cat > "$UNIT_DIR/dwenlite.service" <<UNIT
[Unit]
Description=Dwenlite helper
[Service]
ExecStart=/bin/sh $HOME_DIR/run.sh
Restart=always
RestartSec=5
[Install]
WantedBy=default.target
UNIT
    systemctl --user daemon-reload && systemctl --user enable --now dwenlite.service >/dev/null 2>&1 || say "Could not start it automatically. Run: sh $HOME_DIR/run.sh &"
  else
    mkdir -p "$HOME/.config/autostart"
    cat > "$HOME/.config/autostart/dwenlite.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Dwenlite helper
Exec=/bin/sh $HOME_DIR/run.sh
X-GNOME-Autostart-enabled=true
DESK
    nohup /bin/sh "$HOME_DIR/run.sh" >/dev/null 2>&1 &
  fi
fi

cat > "$HOME_DIR/uninstall.sh" <<UN
#!/bin/sh
launchctl bootout "gui/\$(id -u)/space.dwenlite.helper" >/dev/null 2>&1 || true
rm -f "\$HOME/Library/LaunchAgents/space.dwenlite.helper.plist"
systemctl --user disable --now dwenlite.service >/dev/null 2>&1 || true
rm -f "\$HOME/.config/systemd/user/dwenlite.service" "\$HOME/.config/autostart/dwenlite.desktop"
[ -f "$HOME_DIR/.running" ] && kill "\$(cat "$HOME_DIR/.running")" >/dev/null 2>&1 || true
rm -rf "$HOME_DIR" "\$HOME/Library/Application Support/Dwenlite" "\${XDG_CONFIG_HOME:-\$HOME/.config}/dwenlite"
echo "Dwenlite helper removed. You can also remove this computer in Dwenlite Home."
UN
chmod +x "$HOME_DIR/uninstall.sh"

say ""
say "Done. This computer is connected to Dwenlite Home and will start by itself when you log in."
say "To remove it later: sh $HOME_DIR/uninstall.sh"
