#!/usr/bin/env bash
# Installs Ember for the current user: the service, the hooks that tell it
# when Claude Code works, and the GNOME Shell extension. Run it again after
# moving the repository; updating is a plain "git pull" and a restart of the
# service.
#
#   ./install.sh            install
#   ./install.sh --remove   remove everything it installed
set -euo pipefail

UUID="ember@thomashaiden"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
# The unit file and the hooks name this path, so it does not follow XDG_DATA_HOME.
HOME_LINK="$HOME/.local/share/ember"
TARGET="$DATA/gnome-shell/extensions/$UUID"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
FONT_DIR="$DATA/fonts"
FONT="$REPO/toms-expressive-design/fonts/GoogleSansFlex.woff2"
SETTINGS="$HOME/.claude/settings.json"
HOOK='"$HOME/.local/share/ember/hook/ember-hook"'
EVENTS='["UserPromptSubmit","PreToolUse","PostToolUse","Notification","Stop","SessionEnd"]'

link() {
    if [ -e "$2" ] && [ ! -L "$2" ]; then
        echo "$2 exists and is not a link. Move it away first." >&2
        exit 1
    fi
    mkdir -p "$(dirname "$2")"
    ln -sfn "$1" "$2"
    echo "Linked $2"
}

if [ "${1:-}" = "--remove" ]; then
    systemctl --user disable --now ember.service 2>/dev/null || true
    rm -f "$UNIT_DIR/ember.service"
    systemctl --user daemon-reload
    [ -L "$TARGET" ] && rm "$TARGET"
    [ -L "$HOME_LINK" ] && rm "$HOME_LINK"
    if [ -f "$SETTINGS" ] && grep -q "ember-hook" "$SETTINGS"; then
        cp "$SETTINGS" "$SETTINGS.before-ember-removal"
        tmp="$(mktemp)"
        # Only Ember's own entries go; an event left without any is dropped.
        jq '.hooks |= (with_entries(.value |= map(select(any(.hooks[]?; .command | contains("ember-hook")) | not)))
                       | with_entries(select(.value | length > 0)))
            | if .hooks == {} then del(.hooks) else . end' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
        echo "Removed the hooks; the previous settings are in $SETTINGS.before-ember-removal"
    fi
    echo "Removed. The root helper, if installed, goes with: sudo ./install-helper.sh --remove"
    exit 0
fi

command -v gjs >/dev/null || { echo "gjs is missing; it ships with GNOME Shell." >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is missing; install it first." >&2; exit 1; }

shell="$(gnome-shell --version 2>/dev/null | grep -oE '[0-9]+' | head -n 1 || true)"
if [ "$shell" != "50" ]; then
    echo "This is GNOME Shell ${shell:-of an unknown version}; the extension names version 50 only and may not load." >&2
fi

link "$REPO" "$HOME_LINK"
link "$REPO/extension" "$TARGET"

if ! fc-list : family | grep -q "Google Sans Flex"; then
    mkdir -p "$FONT_DIR"
    cp "$FONT" "$FONT_DIR/"
    fc-cache -f "$FONT_DIR"
    echo "Installed Google Sans Flex to $FONT_DIR"
fi

# Claude Code runs these hooks in the terminal and in the desktop app's Code
# sessions alike; they are how Ember knows that a session works. The file
# is only extended, and only after asking.
if ! grep -qs "ember-hook" "$SETTINGS"; then
    read -r -p "Add Ember's hooks to $SETTINGS? [y/N] " answer || answer=""
    if [[ "$answer" == [yY]* ]]; then
        # Claude Code that has never been configured has no settings yet.
        if [ -f "$SETTINGS" ]; then
            cp "$SETTINGS" "$SETTINGS.before-ember"
            echo "The previous settings are in $SETTINGS.before-ember"
        else
            mkdir -p "$(dirname "$SETTINGS")"
            echo '{}' > "$SETTINGS"
        fi
        tmp="$(mktemp)"
        jq --arg command "$HOOK" --argjson events "$EVENTS" '
            reduce $events[] as $event (.;
                .hooks[$event] = ((.hooks[$event] // []) + [{hooks: [{type: "command", command: $command}]}]))
        ' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
        echo "Hooks added."
    else
        echo "Without the hooks Auto sees no session; only Now keeps the machine awake."
    fi
fi

mkdir -p "$UNIT_DIR"
cp "$REPO/systemd/ember.service" "$UNIT_DIR/ember.service"
systemctl --user daemon-reload
systemctl --user enable --now ember.service
echo "Started the Ember service."

# Written to the setting directly: the running shell only learns about a new
# extension at the next login, and "gnome-extensions enable" fails until then.
enabled="$(gsettings get org.gnome.shell enabled-extensions)"
if [[ "$enabled" != *"'$UUID'"* ]]; then
    if [[ "$enabled" == "@as []" || "$enabled" == "[]" ]]; then
        gsettings set org.gnome.shell enabled-extensions "['$UUID']"
    else
        gsettings set org.gnome.shell enabled-extensions "${enabled%]}, '$UUID']"
    fi
fi
echo "Enabled. Log out and back in to see Ember in the top bar."
echo "For turbo off while the lid is closed, also run: sudo ./install-helper.sh"
