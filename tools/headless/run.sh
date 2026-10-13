#!/usr/bin/env bash
# Runs the extension in a GNOME Shell without a screen, with its own
# settings, and lets a script drive it and take screenshots.
#
#   tools/headless/run.sh <script> [seconds]
#
# <script> is a file in tools/headless/scripts, without ".js". Screenshots
# and the log go to $EMBER_OUT (default: a folder in the system's temp).
# No Ember service runs in there; the script hands the menu its states.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
export EMBER_OUT="${EMBER_OUT:-${TMPDIR:-/tmp}/ember-headless}"
ENV="$EMBER_OUT/env"
EXTENSIONS="$ENV/data/gnome-shell/extensions"

mkdir -p "$EXTENSIONS" "$ENV/config" "$ENV/cache" "$EMBER_OUT/shots"
ln -sfn "$REPO/extension" "$EXTENSIONS/ember@thomashaiden"
ln -sfn "$HERE/driver" "$EXTENSIONS/ember-driver@test"
# Tally shares file and class names with Ember; loading it first shows
# whether the two can live in one shell. Set EMBER_WITH_TALLY to its folder.
EXTRA=""
if [ -n "${EMBER_WITH_TALLY:-}" ]; then
    ln -sfn "$EMBER_WITH_TALLY" "$EXTENSIONS/tally@thomashaiden"
    EXTRA='"tally@thomashaiden", '
fi
export EXTRA
# The scratch data folder has no fonts of its own.
ln -sfn "${XDG_DATA_HOME:-$HOME/.local/share}/fonts" "$ENV/data/fonts"

export EMBER_SCRIPT="$HERE/scripts/$1.js"
export EMBER_SECONDS="${2:-60}"
export XDG_CONFIG_HOME="$ENV/config" XDG_CACHE_HOME="$ENV/cache" XDG_DATA_HOME="$ENV/data"
export G_MESSAGES_DEBUG=Gjs-Console
unset WAYLAND_DISPLAY DISPLAY

exec dbus-run-session -- bash -c '
gsettings set org.gnome.shell enabled-extensions "[$EXTRA\"ember@thomashaiden\", \"ember-driver@test\"]"
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell welcome-dialog-last-shown-version "99"
gsettings set org.gnome.desktop.interface color-scheme prefer-dark
gsettings set org.gnome.desktop.interface enable-hot-corners false
gsettings set org.gnome.desktop.background picture-options none
gsettings set org.gnome.desktop.background color-shading-type solid
gsettings set org.gnome.desktop.background primary-color "#1d2433"
timeout "$EMBER_SECONDS" gnome-shell --headless --virtual-monitor 1280x900 --wayland-display ember-test --no-x11 2>&1'
