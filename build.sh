#!/usr/bin/env bash
# Bundles the plugin and produces a Slackware-compatible .txz for Unraid.
set -euo pipefail

PLUGIN="docker.filter"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLG="$ROOT/$PLUGIN.plg"

PLG_VERSION="$(sed -n 's/.*<!ENTITY version *"\([^"]*\)".*/\1/p' "$PLG" | head -n1)"
if [ -z "$PLG_VERSION" ]; then
  echo "error: could not find <!ENTITY version \"...\"> in $PLG" >&2
  exit 1
fi

if [ "${1:-}" != "" ]; then
  VERSION="$1"
  if [ "$VERSION" != "$PLG_VERSION" ]; then
    echo "error: requested version '$VERSION' does not match $PLUGIN.plg version '$PLG_VERSION'" >&2
    echo "       update docker.filter.plg's <!ENTITY version> or build without an argument to use it." >&2
    exit 1
  fi
else
  VERSION="$PLG_VERSION"
fi

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
