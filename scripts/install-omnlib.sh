#!/usr/bin/env bash
# Installs the omnlib command so it works from ANY directory.
#   ./scripts/install-omnlib.sh
# Picks ~/.local/bin (default), or /usr/local/bin if the former is unavailable.
set -euo pipefail

SELF="$(readlink -f "${BASH_SOURCE[0]}")"
PROJECT_DIR="$(cd "$(dirname "$SELF")/.." && pwd)"
SRC="$PROJECT_DIR/scripts/omnlib"
NAME="omnlib"

chmod +x "$SRC"

# pick the first writable bin dir
TARGET=""
for d in "${OMSBIN:-}" "$HOME/.local/bin" /usr/local/bin; do
  [[ -z "$d" ]] && continue
  mkdir -p "$d" 2>/dev/null || true
  if [[ -w "$d" ]]; then TARGET="$d"; break; fi
done
if [[ -z "$TARGET" ]]; then
  echo "No writable bin directory found. Create one and re-run:"
  echo "  mkdir -p ~/.local/bin && $0"
  exit 1
fi

if ln -sf "$SRC" "$TARGET/$NAME" 2>/dev/null; then
  echo "ok installed '$NAME' -> $TARGET/$NAME (symlink)"
else
  cp "$SRC" "$TARGET/$NAME" && chmod +x "$TARGET/$NAME"
  echo "ok installed '$NAME' -> $TARGET/$NAME (copy)"
fi

case ":$PATH:" in
  *":$TARGET:"*) ;;
  *)
    echo
    echo "warning: $TARGET is not on your PATH yet. Add it (then it works anywhere):"
    echo "  echo 'export PATH=\"$TARGET:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
    ;;
esac
echo
echo "Done. From any folder, run:"
echo "  omnlib            -> dev server at http://localhost:3000"
echo "  omnlib start      -> production server"
echo "  omnlib help       -> all commands"