#!/usr/bin/env bash
# Builds the deployable site into _site/ (or $OUT): copies site/ and stamps the
# version (from package.json) and the build date into the pages that carry them.
# Set REQUIRE_NOTES=1 to fail when CHANGELOG.md has no bullets for this version.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${VERSION:-$(node -p "require('./package.json').version")}"
BUILD_DATE="${BUILD_DATE:-$(date -u +%Y-%m-%d)}"
OUT="${OUT:-_site}"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.+][0-9A-Za-z.-]+)?$ ]]; then
  echo "error: VERSION '$VERSION' is not a semantic version" >&2
  exit 1
fi

rm -rf "$OUT"
cp -R site "$OUT"
for f in "$OUT/index.html" "$OUT/sitemap.xml" "$OUT/llms.txt" "$OUT/sw.js"; do
  sed -i.bak -e "s/__VERSION__/${VERSION}/g" -e "s/__BUILD_DATE__/${BUILD_DATE}/g" "$f"
  rm -f "$f.bak"
done

# Release notes for this version, baked into the page ("What's new") and
# published as version.json so open games can spot a newer release.
NOTES="$(node scripts/release-notes.js "$VERSION")"
if [ "${REQUIRE_NOTES:-}" = "1" ] && [ "$NOTES" = "[]" ]; then
  echo "error: CHANGELOG.md has no '## [$VERSION]' section with bullets (still under [Unreleased]?)" >&2
  exit 1
fi
node -e '
  const fs=require("fs"),[,out,v,d,notes]=process.argv;
  const f=out+"/index.html",ph="/*__RELEASE_NOTES__*/[]",html=fs.readFileSync(f,"utf8");
  if(!html.includes(ph)){console.error("error: release-notes placeholder missing from index.html");process.exit(1);}
  // Function replacer: no $& / $$ expansion. Escape "<" so a note can never close the <script>.
  fs.writeFileSync(f,html.replace(ph,()=>notes.replace(/</g,"\\u003c")));
  fs.writeFileSync(out+"/version.json",JSON.stringify({version:v,date:d,notes:JSON.parse(notes)},null,2)+"\n");
' "$OUT" "$VERSION" "$BUILD_DATE" "$NOTES"

if grep -rl "__VERSION__\|__BUILD_DATE__" "$OUT" >/dev/null; then
  echo "error: unreplaced placeholders left in $OUT" >&2
  exit 1
fi
echo "Built Series of Tubes ${VERSION} (${BUILD_DATE}) into ${OUT}/"
