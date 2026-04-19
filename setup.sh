#!/usr/bin/env bash
# One-shot bootstrap for a fresh machine.
#
# What it does:
#   1. Checks for Bun 1.3+ (installs via curl if missing and --install-bun given)
#   2. Runs `bun install` to populate node_modules from bun.lock
#   3. Symlinks bin/claude to ~/.local/bin/claude2 (if that dir is on PATH)
#
# Usage:
#   ./setup.sh                 # standard setup, skip bun install if absent
#   ./setup.sh --install-bun   # also auto-install Bun via its official script
#   ./setup.sh --no-symlink    # skip the ~/.local/bin/claude2 symlink
set -euo pipefail

HERE="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_BUN=0
SYMLINK=1
for arg in "$@"; do
  case "$arg" in
    --install-bun) INSTALL_BUN=1 ;;
    --no-symlink)  SYMLINK=0 ;;
    -h|--help)
      sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# --- 1. Bun ---------------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
  if [ "$INSTALL_BUN" = 1 ]; then
    echo ">> installing Bun via https://bun.sh/install ..."
    curl -fsSL https://bun.sh/install | bash
    # shellcheck disable=SC1090
    export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
    export PATH="$BUN_INSTALL/bin:$PATH"
  else
    cat >&2 <<EOF
Bun is not installed. Either:
  - install it yourself:  curl -fsSL https://bun.sh/install | bash
  - or re-run:            ./setup.sh --install-bun
EOF
    exit 1
  fi
fi

BUN_VERSION="$(bun --version)"
echo ">> bun $BUN_VERSION detected"
# Require >= 1.3
major=${BUN_VERSION%%.*}; rest=${BUN_VERSION#*.}; minor=${rest%%.*}
if [ "$major" -lt 1 ] || { [ "$major" -eq 1 ] && [ "$minor" -lt 3 ]; }; then
  echo "!! Bun 1.3+ required (got $BUN_VERSION). Upgrade with: bun upgrade" >&2
  exit 1
fi

# --- 2. Dependencies ------------------------------------------------------
cd "$HERE"
if [ ! -d node_modules ] || [ bun.lock -nt node_modules ]; then
  echo ">> running: bun install"
  bun install
else
  echo ">> node_modules up to date, skipping bun install"
fi

# --- 3. Symlink to ~/.local/bin/claude2 -----------------------------------
if [ "$SYMLINK" = 1 ]; then
  mkdir -p "$HOME/.local/bin"
  ln -sfn "$HERE/bin/claude" "$HOME/.local/bin/claude2"
  echo ">> symlinked: ~/.local/bin/claude2 -> $HERE/bin/claude"
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) echo "!! \$HOME/.local/bin is not on your PATH. Add this to ~/.zshrc or ~/.bashrc:"
       echo "     export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
  esac
fi

cat <<EOF

Done. Try it:
  claude2 --version
  claude2 -p "hello"
  claude2                     # interactive REPL
EOF
