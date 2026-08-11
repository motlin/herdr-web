#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPAT="$ROOT/vendor/herdr-compat"
SOURCE_CHECKOUT=""
REVIEWED_TAG=""
CONFIRMED_PROTOCOL_REVIEW=false
CONFIRMED_SCHEMA_REVIEW=false
CONFIRMED_HEADLESS_ATTACH_REVIEW=false
CONFIRMED_VERSION_FLOOR_REVIEW=false
CONFIRMED_PROTOCOL_NUMBER_REVIEW=false

usage() {
  cat <<'EOF'
Usage: scripts/refresh-vendor.sh --source /path/to/herdr --tag vX.Y.Z \
  --confirm-protocol-review --confirm-schema-review \
  --confirm-headless-attach-review --confirm-version-floor-review \
  --confirm-protocol-number-review

Refresh the allow-listed Herdr compatibility sources from an explicitly
reviewed, clean checkout. The command leaves changes uncommitted for review and
does not update config/upstream-baselines.json.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      SOURCE_CHECKOUT="$2"
      shift 2
      ;;
    --tag)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      REVIEWED_TAG="$2"
      shift 2
      ;;
    --confirm-protocol-review)
      CONFIRMED_PROTOCOL_REVIEW=true
      shift
      ;;
    --confirm-schema-review)
      CONFIRMED_SCHEMA_REVIEW=true
      shift
      ;;
    --confirm-headless-attach-review)
      CONFIRMED_HEADLESS_ATTACH_REVIEW=true
      shift
      ;;
    --confirm-version-floor-review)
      CONFIRMED_VERSION_FLOOR_REVIEW=true
      shift
      ;;
    --confirm-protocol-number-review)
      CONFIRMED_PROTOCOL_NUMBER_REVIEW=true
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$SOURCE_CHECKOUT" || -z "$REVIEWED_TAG" ]]; then
  usage >&2
  exit 2
fi

missing_reviews=()
[[ "$CONFIRMED_PROTOCOL_REVIEW" == true ]] || missing_reviews+=("protocol")
[[ "$CONFIRMED_SCHEMA_REVIEW" == true ]] || missing_reviews+=("schema")
[[ "$CONFIRMED_HEADLESS_ATTACH_REVIEW" == true ]] || missing_reviews+=("headless attach")
[[ "$CONFIRMED_VERSION_FLOOR_REVIEW" == true ]] || missing_reviews+=("version floor")
[[ "$CONFIRMED_PROTOCOL_NUMBER_REVIEW" == true ]] || missing_reviews+=("protocol number")
if [[ ${#missing_reviews[@]} -gt 0 ]]; then
  printf 'Missing required review confirmation: %s\n' "${missing_reviews[@]}" >&2
  exit 2
fi

if [[ -n "$(git -C "$ROOT" status --short --untracked-files=all)" ]]; then
  echo "Herdr compatibility refresh requires a clean herdr-web working tree" >&2
  git -C "$ROOT" status --short --untracked-files=all >&2
  exit 1
fi

SOURCE_CHECKOUT="$(git -C "$SOURCE_CHECKOUT" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$SOURCE_CHECKOUT" || ! -d "$SOURCE_CHECKOUT/src" ]]; then
  echo "--source must identify a Herdr checkout root containing src/" >&2
  exit 1
fi

if [[ -n "$(git -C "$SOURCE_CHECKOUT" status --short --untracked-files=all)" ]]; then
  echo "Herdr checkout must be clean, including untracked files" >&2
  git -C "$SOURCE_CHECKOUT" status --short --untracked-files=all >&2
  exit 1
fi

SOURCE_COMMIT="$(
  git -C "$SOURCE_CHECKOUT" rev-parse --verify "refs/tags/$REVIEWED_TAG^{}" 2>/dev/null || true
)"
if [[ -z "$SOURCE_COMMIT" ]]; then
  echo "Herdr checkout does not contain reviewed tag $REVIEWED_TAG" >&2
  exit 1
fi

if [[ "$(git -C "$SOURCE_CHECKOUT" rev-parse HEAD)" != "$SOURCE_COMMIT" ]]; then
  echo "Herdr checkout HEAD must be the commit referenced by $REVIEWED_TAG" >&2
  exit 1
fi

{
  IFS= read -r BASELINE_TAG
  IFS= read -r BASELINE_COMMIT
  IFS= read -r BASELINE_MINIMUM_VERSION
  IFS= read -r BASELINE_PROTOCOL
} < <("$ROOT/scripts/check-upstream-baselines.mjs" --herdr-values)

if ! git -C "$SOURCE_CHECKOUT" cat-file -e "$BASELINE_COMMIT^{commit}" 2>/dev/null; then
  echo "Herdr checkout must contain baseline commit $BASELINE_COMMIT for adaptation merges" >&2
  exit 1
fi

if ! git -C "$SOURCE_CHECKOUT" merge-base --is-ancestor "$BASELINE_COMMIT" "$SOURCE_COMMIT"; then
  echo "Reviewed tag $REVIEWED_TAG must descend from baseline $BASELINE_TAG" >&2
  exit 1
fi

required_review_sources=(
  "src/protocol/wire.rs"
  "src/api/schema.rs"
  "src/api/schema"
  "src/server/headless.rs"
)
for source_path in "${required_review_sources[@]}"; do
  if [[ ! -e "$SOURCE_CHECKOUT/$source_path" ]]; then
    echo "Reviewed Herdr checkout is missing $source_path" >&2
    exit 1
  fi
done

refresh_directory="$(mktemp -d "$ROOT/.git/herdr-vendor-refresh.XXXXXX")"
cleanup() {
  case "$refresh_directory" in
    "$ROOT"/.git/herdr-vendor-refresh.*)
      rm -rf -- "$refresh_directory"
      ;;
  esac
}
trap cleanup EXIT

STAGED_SOURCE="$refresh_directory/src"
mkdir -p "$STAGED_SOURCE"
cp -R "$COMPAT/src/." "$STAGED_SOURCE/"

exact_mappings=(
  "src/api/schema.rs|api/schema.rs"
  "src/protocol/wire.rs|protocol/wire.rs"
)

adapted_mappings=(
  "src/api/client.rs|api/client.rs"
  "src/api/status.rs|api/status.rs"
  "src/api/schema/tabs.rs|api/schema/tabs.rs"
  "src/api/schema/tests.rs|api/schema/tests.rs"
  "src/api/schema/workspaces.rs|api/schema/workspaces.rs"
  "src/input/model.rs|input.rs"
  "src/raw_input.rs|raw_input.rs"
  "src/ipc.rs|ipc.rs"
  "src/logging.rs|logging.rs"
  "src/popup_size.rs|popup_size.rs"
  "src/server/socket_paths.rs|server/socket_paths.rs"
)

for mapping in "${exact_mappings[@]}"; do
  upstream_path="${mapping%%|*}"
  compatibility_path="${mapping#*|}"
  if [[ ! -f "$SOURCE_CHECKOUT/$upstream_path" ]]; then
    echo "Reviewed Herdr checkout is missing allow-listed file $upstream_path" >&2
    exit 1
  fi
  cp "$SOURCE_CHECKOUT/$upstream_path" "$STAGED_SOURCE/$compatibility_path"
done

adapted_schema_file() {
  case "$1" in
    tabs.rs|tests.rs|workspaces.rs) return 0 ;;
    *) return 1 ;;
  esac
}

for staged_schema_path in "$STAGED_SOURCE/api/schema/"*.rs; do
  schema_file="$(basename "$staged_schema_path")"
  if ! adapted_schema_file "$schema_file" && [[ ! -f "$SOURCE_CHECKOUT/src/api/schema/$schema_file" ]]; then
    rm -- "$staged_schema_path"
  fi
done

while IFS= read -r -d '' upstream_schema_path; do
  schema_file="$(basename "$upstream_schema_path")"
  if ! adapted_schema_file "$schema_file"; then
    cp "$upstream_schema_path" "$STAGED_SOURCE/api/schema/$schema_file"
  fi
done < <(find "$SOURCE_CHECKOUT/src/api/schema" -maxdepth 1 -type f -name '*.rs' -print0)

mapping_number=0
for mapping in "${adapted_mappings[@]}"; do
  upstream_path="${mapping%%|*}"
  compatibility_path="${mapping#*|}"
  incoming_path="$SOURCE_CHECKOUT/$upstream_path"
  local_path="$COMPAT/src/$compatibility_path"
  base_path="$refresh_directory/base-$mapping_number.rs"
  merged_path="$refresh_directory/merged-$mapping_number.rs"

  if [[ ! -f "$incoming_path" || ! -f "$local_path" ]]; then
    echo "Cannot reconcile allow-listed adaptation $upstream_path -> $compatibility_path" >&2
    exit 1
  fi
  if ! git -C "$SOURCE_CHECKOUT" show "$BASELINE_COMMIT:$upstream_path" > "$base_path"; then
    echo "Baseline commit is missing adapted source $upstream_path" >&2
    exit 1
  fi
  if ! git merge-file --stdout "$local_path" "$base_path" "$incoming_path" > "$merged_path"; then
    echo "Local adaptation conflicts with $REVIEWED_TAG: $compatibility_path" >&2
    sed -n '1,120p' "$merged_path" >&2
    echo "No compatibility files were changed" >&2
    exit 1
  fi
  cp "$merged_path" "$STAGED_SOURCE/$compatibility_path"
  mapping_number=$((mapping_number + 1))
done

for compatibility_schema_path in "$COMPAT/src/api/schema/"*.rs; do
  schema_file="$(basename "$compatibility_schema_path")"
  if [[ ! -f "$STAGED_SOURCE/api/schema/$schema_file" ]]; then
    rm -- "$compatibility_schema_path"
  fi
done
cp "$STAGED_SOURCE/api/schema/"*.rs "$COMPAT/src/api/schema/"

for mapping in "${exact_mappings[@]}" "${adapted_mappings[@]}"; do
  compatibility_path="${mapping#*|}"
  case "$compatibility_path" in
    api/schema/*.rs) continue ;;
  esac
  cp "$STAGED_SOURCE/$compatibility_path" "$COMPAT/src/$compatibility_path"
done

"$ROOT/scripts/check-vendor.sh" --source "$SOURCE_CHECKOUT" --tag "$REVIEWED_TAG"

echo
echo "Herdr compatibility refresh prepared from $REVIEWED_TAG at $SOURCE_COMMIT"
echo "Confirmed reviews: protocol, schema, headless attach, version floor, protocol number"
echo "Previous runtime floor/protocol: $BASELINE_MINIMUM_VERSION / $BASELINE_PROTOCOL"
echo "config/upstream-baselines.json was not changed"
if git -C "$ROOT" diff --quiet -- vendor/herdr-compat; then
  echo "The reviewed tag produces no compatibility source changes"
else
  echo "Review the uncommitted compatibility diff before updating the baseline:"
  git -C "$ROOT" diff --stat -- vendor/herdr-compat
fi
