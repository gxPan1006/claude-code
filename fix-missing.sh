#!/usr/bin/env bash
# Iteratively probe the real module graph. On each missing-module error,
# create a minimal stub at the expected path and retry. Run from the repo root.
set -u
cd "$(dirname "$0")"

PROBES=(
  "import('./src/components/App.tsx')"
  "import('./src/screens/REPL.tsx')"
  "import('./src/interactiveHelpers.tsx')"
  "import('./src/replLauncher.tsx')"
)

make_stub() {
  local path="$1"
  local dir
  dir="$(dirname "$path")"
  mkdir -p "$dir"
  case "$path" in
    *.tsx)
      cat > "$path" <<'STUB_EOF'
import React from 'react';
const Stub: any = () => null;
export default Stub;
export const __stub__: any = true;
STUB_EOF
      ;;
    *.ts)
      cat > "$path" <<'STUB_EOF'
// Stub — missing from this source snapshot.
const stub: any = new Proxy({}, { get: () => undefined });
export default stub;
export const __stub__ = true;
STUB_EOF
      ;;
    *.md|*.txt)
      echo "" > "$path"
      ;;
    *.json)
      echo "{}" > "$path"
      ;;
    *)
      cat > "$path" <<'STUB_EOF'
// Stub
export default {};
STUB_EOF
      ;;
  esac
  echo "  + stubbed $path"
}

probe_one() {
  local expr="$1"
  for attempt in $(seq 1 200); do
    local out
    out=$(bun -e "$expr.then(() => console.log('OK')).catch(e => { console.error('FAIL:' + e.message); process.exit(3); })" 2>&1)
    if echo "$out" | grep -q '^OK$'; then
      echo "  probe ok: $expr"
      return 0
    fi
    # Extract "Cannot find module '<path>' from '<importer>'"
    local mod importer
    mod=$(echo "$out" | sed -nE "s/.*Cannot find module '([^']+)' from '([^']+)'.*/\\1/p" | head -1)
    importer=$(echo "$out" | sed -nE "s/.*Cannot find module '([^']+)' from '([^']+)'.*/\\2/p" | head -1)
    if [ -z "$mod" ] || [ -z "$importer" ]; then
      echo "  unrecoverable:"
      echo "$out" | head -5
      return 1
    fi
    # Resolve absolute path
    local base="$(dirname "$importer")"
    local abs
    abs=$(cd "$base" 2>/dev/null && realpath -q "$mod" 2>/dev/null || echo "$base/$mod")
    # Try several extensions the TS ESM convention expects
    if [[ "$abs" == *.js ]]; then
      make_stub "${abs%.js}.ts"
    elif [[ "$abs" == *.jsx ]]; then
      make_stub "${abs%.jsx}.tsx"
    else
      make_stub "$abs"
    fi
  done
  echo "  gave up after 200 attempts"
  return 1
}

for expr in "${PROBES[@]}"; do
  echo "probing: $expr"
  probe_one "$expr" || exit 1
done
echo "all probes OK"
