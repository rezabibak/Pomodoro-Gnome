#!/usr/bin/env bash
set -euo pipefail

UUID="pomodoro-sky@rezabibak.github.io"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "Installing $UUID to $DEST_DIR"
mkdir -p "$DEST_DIR"
cp -r "$SRC_DIR"/extension.js "$SRC_DIR"/prefs.js "$SRC_DIR"/metadata.json "$SRC_DIR"/stylesheet.css "$SRC_DIR"/schemas "$DEST_DIR/"

glib-compile-schemas "$DEST_DIR/schemas"

echo
echo "Installed. Now either:"
echo "  1) Log out and back in, then run: gnome-extensions enable $UUID"
echo "  2) Or, if the extension was already installed before, just run: gnome-extensions enable $UUID"
