#!/usr/bin/env bash
# Builds dist/PageGlass-<version>.zip with everything a user needs to install.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(sed -n 's/.*PageGlass \([0-9][0-9.]*\) .*/\1/p' src/pageglass.js | head -1)
[ -n "$version" ] || { echo "Version not found in src/pageglass.js" >&2; exit 1; }
name="PageGlass-$version"
rm -rf "dist/$name" "dist/$name.zip"
mkdir -p "dist/$name/src"
cp pageglass.py README.md LICENSE CHANGELOG.md "dist/$name/"
cp src/pageglass.js "dist/$name/src/"
(cd dist && zip -qr "$name.zip" "$name")
rm -rf "dist/$name"
echo "dist/$name.zip"
