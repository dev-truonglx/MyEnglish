#!/usr/bin/env bash
#
# Encrypt the two signing keys to secrets/*.enc as a local, portable backup.
# The whole secrets/ folder is gitignored — these encrypted files are NOT
# meant to be committed to git (even encrypted, they were once accidentally
# pushed to the public repo and had to be purged from history). Copy the
# .enc files to a password manager or private cloud storage instead.
#
#   ~/.tauri/myenglish-updater.key     → secrets/myenglish-updater.key.enc
#   ~/.tauri/myenglish-updater.key.pub → secrets/myenglish-updater.key.pub.enc
#   ~/.tauri/myenglish-codesign.p12    → secrets/myenglish-codesign.p12.enc (if present)
#
# You are prompted for ONE passphrase (AES-256, PBKDF2). Store it in a password
# manager — it is the ONLY thing protecting these keys.
# Restore with scripts/restore-keys.sh.
#
# ⚠️  The updater key is the auto-update trust root: whoever can decrypt it can
#     push a malicious update to ALL users. Use a STRONG passphrase.
set -euo pipefail
cd "$(dirname "$0")/.."

OPENSSL=/usr/bin/openssl   # LibreSSL on macOS; supports -pbkdf2
TAURI_DIR="$HOME/.tauri"
SRC_UPDATER="$TAURI_DIR/myenglish-updater.key"
SRC_UPDATER_PUB="$TAURI_DIR/myenglish-updater.key.pub"
SRC_CODESIGN="$TAURI_DIR/myenglish-codesign.p12"

[ -f "$SRC_UPDATER" ] || { echo "ERROR: missing $SRC_UPDATER"; exit 1; }
mkdir -p secrets

read -rs -p "Passphrase (won't echo): " PASS; echo
read -rs -p "Confirm passphrase:      " PASS2; echo
[ -n "$PASS" ]         || { echo "ERROR: empty passphrase"; exit 1; }
[ "$PASS" = "$PASS2" ] || { echo "ERROR: passphrases do not match"; exit 1; }

# Encrypt, then immediately decrypt-and-compare to catch a bad write/typo before
# you rely on the backup. Passphrase is fed via stdin (never argv/env).
encrypt_verify() { # $1 src, $2 out
  local src="$1" out="$2" tmp
  printf '%s\n' "$PASS" | "$OPENSSL" enc -aes-256-cbc -pbkdf2 -salt -pass stdin -in "$src" -out "$out"
  tmp="$(mktemp)"
  printf '%s\n' "$PASS" | "$OPENSSL" enc -d -aes-256-cbc -pbkdf2 -pass stdin -in "$out" -out "$tmp"
  cmp -s "$src" "$tmp" || { rm -f "$tmp" "$out"; echo "ERROR: verify failed for $src"; exit 1; }
  rm -f "$tmp"
  echo "  ✓ $out"
}

echo "Encrypting…"
encrypt_verify "$SRC_UPDATER" "secrets/myenglish-updater.key.enc"

if [ -f "$SRC_UPDATER_PUB" ]; then
  encrypt_verify "$SRC_UPDATER_PUB" "secrets/myenglish-updater.key.pub.enc"
fi

if [ -f "$SRC_CODESIGN" ]; then
  encrypt_verify "$SRC_CODESIGN" "secrets/myenglish-codesign.p12.enc"
else
  echo "  ℹ $SRC_CODESIGN not found (skipping codesign backup)"
fi

echo
echo "Done. secrets/*.enc written locally — this folder is gitignored, do NOT"
echo "commit it. Copy the .enc files to a password manager or private cloud"
echo "storage for safekeeping."
echo "Keep the passphrase in a password manager — without it the backups are useless."
