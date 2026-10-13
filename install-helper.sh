#!/usr/bin/env bash
# Installs Ember's root helper: switches the processor's turbo off and asks
# it to favour saving while the lid is closed. Run it with sudo; Ember works
# without it, only without these two savings.
#
#   sudo ./install-helper.sh            install
#   sudo ./install-helper.sh --remove   remove
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER=/usr/local/libexec/ember-helper
POLICY=/usr/share/polkit-1/actions/io.github.tomsliikee.ember.policy

[ "$(id -u)" -eq 0 ] || { echo "Run this with sudo." >&2; exit 1; }

if [ "${1:-}" = "--remove" ]; then
    [ -x "$HELPER" ] && "$HELPER" restore
    rm -f "$HELPER" "$POLICY"
    echo "Removed the helper."
    exit 0
fi

# Owned by root and writable by nobody else: the service may run it, not change it.
install -D -o root -g root -m 755 "$REPO/helper/ember-helper" "$HELPER"
install -D -o root -g root -m 644 "$REPO/helper/io.github.tomsliikee.ember.policy" "$POLICY"
command -v restorecon >/dev/null && restorecon "$HELPER" "$POLICY" || true
echo "Installed $HELPER"
