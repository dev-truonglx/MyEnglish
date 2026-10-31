#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Building Chrome Extension..."
npm run build:extension

RELEASE_DIR="$ROOT_DIR/release_dist"
mkdir -p "$RELEASE_DIR"
ZIP_FILE="$RELEASE_DIR/myenglish-chrome-extension.zip"

echo "Creating package: $ZIP_FILE..."
rm -f "$ZIP_FILE"
(cd "$ROOT_DIR/dist-extension" && zip -r "$ZIP_FILE" .)

echo "Extension package ready!"
echo "Zip: $ZIP_FILE"
echo "Unpacked directory: $ROOT_DIR/dist-extension"
ls -lh "$ZIP_FILE"
