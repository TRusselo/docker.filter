#!/usr/bin/env bash
# Bundles the plugin and produces a Slackware-compatible .txz for Unraid.
set -euo pipefail

PLUGIN="docker.filter"
VERSION="${1:-$(date +%Y.%m.%d)}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE="$ROOT/source"
DEST="$STAGE/usr/local/emhttp/plugins/$PLUGIN"
OUT="$ROOT/packages/$PLUGIN-$VERSION-x86_64-1.txz"

mkdir -p "$DEST/javascript" "$DEST/styles" "$ROOT/packages"

npx esbuild "$ROOT/src/main.js" \
  --bundle --format=iife --target=es2020 --legal-comments=none \
  --outfile="$DEST/javascript/docker-filter.js"

cp "$ROOT/src/docker-filter.css" "$DEST/styles/docker-filter.css"

rm -f "$ROOT/packages/$PLUGIN"-*.txz
tar -C "$STAGE" --owner=0 --group=0 --numeric-owner -cJf "$OUT" usr

echo "built: $OUT"
echo "sha256: $(sha256sum "$OUT" | cut -d' ' -f1)"
