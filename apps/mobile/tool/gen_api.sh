#!/usr/bin/env bash
# Generates a Dart client for the Good People API from its OpenAPI spec into
# lib/api/generated/.
#
# Pure Dart, no Java: swagger_parser writes retrofit clients and
# json_serializable models, then build_runner writes their .g.dart parts.
# Both run inside tool/api_codegen/, a separate package, so none of the
# generator dependencies end up in the app's pubspec.
#
# Phase 0: the app does NOT import lib/api/generated/. The folder is
# gitignored and excluded from `flutter analyze`. Adopting it later means
# adding `retrofit` and `json_annotation` to the app's dependencies and
# removing those two exclusions.
#
# Usage (from apps/mobile):
#   tool/gen_api.sh                  # $API_BASE_URL/docs-json, else apps/api/openapi.json
#   tool/gen_api.sh path/to/spec.json
#   tool/gen_api.sh https://staging.example.com/docs-json
#
# Needs `dart` (the one bundled with Flutter is fine; override with DART=...)
# and `curl` for URLs.
set -euo pipefail

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEGEN_DIR="$MOBILE_DIR/tool/api_codegen"
OUT_DIR="$MOBILE_DIR/lib/api/generated"
DEFAULT_URL="${API_BASE_URL:-http://localhost:4000}/docs-json"
DEFAULT_FILE="$MOBILE_DIR/../api/openapi.json"
DART="${DART:-dart}"
SPEC="$CODEGEN_DIR/openapi.json"

# Remove the copied spec and intermediate output, on success or failure.
trap 'rm -rf "$SPEC" "$CODEGEN_DIR/lib"' EXIT

command -v "$DART" >/dev/null || {
  echo "error: '$DART' not found. Install Flutter or set DART=/path/to/dart." >&2
  exit 1
}

fetch() {
  echo "Downloading spec from $1"
  curl --fail --silent --show-error --max-time 15 "$1" --output "$SPEC"
}

source="${1:-}"
if [[ -z "$source" ]]; then
  if curl --fail --silent --max-time 5 "$DEFAULT_URL" --output "$SPEC"; then
    echo "Using spec from $DEFAULT_URL"
  elif [[ -f "$DEFAULT_FILE" ]]; then
    echo "API not reachable at $DEFAULT_URL; using $DEFAULT_FILE"
    cp "$DEFAULT_FILE" "$SPEC"
  else
    echo "error: no spec. Start the API (serves $DEFAULT_URL), create" >&2
    echo "       apps/api/openapi.json, or pass a file or URL." >&2
    exit 1
  fi
elif [[ "$source" =~ ^https?:// ]]; then
  fetch "$source"
else
  [[ -f "$source" ]] || { echo "error: $source does not exist" >&2; exit 1; }
  echo "Using spec from $source"
  cp "$source" "$SPEC"
fi

cd "$CODEGEN_DIR"
rm -rf lib
"$DART" pub get
"$DART" run swagger_parser --file swagger_parser.yaml

# swagger_parser reports a bad spec but still exits 0, so check its output.
if [[ -z "$(find lib/generated -name '*.dart' 2>/dev/null)" ]]; then
  echo "error: swagger_parser generated no files; see its output above." >&2
  exit 1
fi

"$DART" run build_runner build

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cp -R lib/generated/. "$OUT_DIR/"

echo "Generated $(find "$OUT_DIR" -name '*.dart' | wc -l | tr -d ' ') files in lib/api/generated/"
