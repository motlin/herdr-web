#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPAT="$ROOT/vendor/herdr-compat"
SOURCE_CHECKOUT="${HERDR_SRC:-}"
REVIEWED_TAG_OVERRIDE=""

usage() {
  cat <<'EOF'
Usage: scripts/check-vendor.sh [--source /path/to/herdr [--tag vX.Y.Z]]

Without arguments, validate the repository-owned compatibility baseline. Use
--source to compare against a clean Herdr checkout. When --tag is supplied, the
checkout must be at that tag instead of the repository-owned baseline tag.
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
      REVIEWED_TAG_OVERRIDE="$2"
      shift 2
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

if [[ -n "$REVIEWED_TAG_OVERRIDE" && -z "$SOURCE_CHECKOUT" ]]; then
  echo "--tag requires --source" >&2
  exit 2
fi

{
  IFS= read -r EXPECTED_HERDR_TAG
  IFS= read -r EXPECTED_HERDR_COMMIT
  IFS= read -r MINIMUM_HERDR_VERSION
  IFS= read -r EXPECTED_HERDR_PROTOCOL
} < <("$ROOT/scripts/check-upstream-baselines.mjs" --herdr-values)

if [[ -n "$REVIEWED_TAG_OVERRIDE" ]]; then
  EXPECTED_HERDR_TAG="$REVIEWED_TAG_OVERRIDE"
  EXPECTED_HERDR_COMMIT="$(
    git -C "$SOURCE_CHECKOUT" rev-parse --verify "refs/tags/$EXPECTED_HERDR_TAG^{}" 2>/dev/null || true
  )"
  if [[ -z "$EXPECTED_HERDR_COMMIT" ]]; then
    echo "Herdr checkout does not contain tag $EXPECTED_HERDR_TAG" >&2
    exit 1
  fi
fi

if ! command -v rg >/dev/null; then
  echo "ripgrep (rg) is required for vendor checks" >&2
  exit 1
fi

required=(
  "$COMPAT/Cargo.toml"
  "$COMPAT/src/lib.rs"
  "$COMPAT/src/api/client.rs"
  "$COMPAT/src/api/status.rs"
  "$COMPAT/src/api/schema.rs"
  "$COMPAT/src/api/schema"
  "$COMPAT/src/api/schema/agents.rs"
  "$COMPAT/src/api/schema/common.rs"
  "$COMPAT/src/api/schema/events.rs"
  "$COMPAT/src/api/schema/integrations.rs"
  "$COMPAT/src/api/schema/panes.rs"
  "$COMPAT/src/api/schema/plugins.rs"
  "$COMPAT/src/api/schema/response.rs"
  "$COMPAT/src/api/schema/server.rs"
  "$COMPAT/src/api/schema/session.rs"
  "$COMPAT/src/api/schema/tabs.rs"
  "$COMPAT/src/api/schema/tests.rs"
  "$COMPAT/src/api/schema/workspaces.rs"
  "$COMPAT/src/api/schema/worktrees.rs"
  "$COMPAT/src/ipc.rs"
  "$COMPAT/src/input.rs"
  "$COMPAT/src/logging.rs"
  "$COMPAT/src/popup_size.rs"
  "$COMPAT/src/protocol.rs"
  "$COMPAT/src/protocol/wire.rs"
  "$COMPAT/src/raw_input.rs"
  "$COMPAT/src/server/socket_paths.rs"
)

for path in "${required[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "missing Herdr compatibility vendor file: $path" >&2
    exit 1
  fi
done

if [[ -d "$ROOT/vendor/herdr" ]]; then
  echo "full vendor/herdr snapshot is not allowed; keep only vendor/herdr-compat" >&2
  exit 1
fi

if rg -n '#\[path[[:space:]]*=' "$ROOT/bridge" "$COMPAT" >/dev/null; then
  echo "build-time Rust #[path] imports are not allowed in bridge or vendor/herdr-compat" >&2
  rg -n '#\[path[[:space:]]*=' "$ROOT/bridge" "$COMPAT" >&2
  exit 1
fi

if rg -n '\bcustom_status\b' "$COMPAT" >/dev/null; then
  echo "obsolete custom_status fields are not allowed in the Herdr $MINIMUM_HERDR_VERSION compatibility copy" >&2
  rg -n '\bcustom_status\b' "$COMPAT" >&2
  exit 1
fi

unexpected_path_deps="$(
  rg -n '(^|[[:space:]{,])path[[:space:]]*=' "$ROOT/bridge/Cargo.toml" "$COMPAT/Cargo.toml" \
    | grep -Ev 'path[[:space:]]*=[[:space:]]*"src/(main|lib)\.rs"' \
    | grep -Ev 'path[[:space:]]*=[[:space:]]*"\.\./vendor/herdr-compat"' \
    || true
)"
if [[ -n "$unexpected_path_deps" ]]; then
  echo "unexpected Cargo path dependency; only ../vendor/herdr-compat is allowed" >&2
  echo "$unexpected_path_deps" >&2
  exit 1
fi

if [[ -n "$SOURCE_CHECKOUT" ]]; then
  if [[ ! -d "$SOURCE_CHECKOUT/src" ]]; then
    echo "Herdr source must point at a checkout containing src/" >&2
    exit 1
  fi

  upstream_commit="$(git -C "$SOURCE_CHECKOUT" rev-parse HEAD 2>/dev/null || true)"
  if [[ "$upstream_commit" != "$EXPECTED_HERDR_COMMIT" ]]; then
    echo "Herdr source must be a $EXPECTED_HERDR_TAG checkout at $EXPECTED_HERDR_COMMIT" >&2
    echo "found: ${upstream_commit:-not a git checkout}" >&2
    exit 1
  fi

  if [[ -n "$(git -C "$SOURCE_CHECKOUT" status --short)" ]]; then
    echo "Herdr source must be a clean $EXPECTED_HERDR_TAG checkout" >&2
    git -C "$SOURCE_CHECKOUT" status --short >&2
    exit 1
  fi

  compare_exact() {
    local upstream_rel="$1"
    local compat_rel="$2"
    if ! diff -q "$SOURCE_CHECKOUT/$upstream_rel" "$COMPAT/$compat_rel" >/dev/null; then
      echo "Herdr compatibility copy drifted from source: $compat_rel" >&2
      diff -u "$SOURCE_CHECKOUT/$upstream_rel" "$COMPAT/$compat_rel" | sed -n '1,120p' >&2
      exit 1
    fi
  }

  compare_wire_body() {
    local wire_file
    for wire_file in "$SOURCE_CHECKOUT/src/protocol/wire.rs" "$COMPAT/src/protocol/wire.rs"; do
      if ! grep -q '^use std::collections::HashMap;' "$wire_file"; then
        echo "wire.rs anchor line missing in $wire_file; update compare_wire_body" >&2
        exit 1
      fi
    done
    if ! diff -q \
      <(awk 'seen || /^use std::collections::HashMap;/{seen=1} seen {print}' "$SOURCE_CHECKOUT/src/protocol/wire.rs") \
      <(awk 'seen || /^use std::collections::HashMap;/{seen=1} seen {print}' "$COMPAT/src/protocol/wire.rs") \
      >/dev/null; then
      echo "Herdr protocol wire copy drifted from HERDR_SRC" >&2
      diff -u \
        <(awk 'seen || /^use std::collections::HashMap;/{seen=1} seen {print}' "$SOURCE_CHECKOUT/src/protocol/wire.rs") \
        <(awk 'seen || /^use std::collections::HashMap;/{seen=1} seen {print}' "$COMPAT/src/protocol/wire.rs") \
        | sed -n '1,120p' >&2
      exit 1
    fi
  }

  compare_popup_size() {
    normalize_popup_size_visibility() {
      awk '
        $0 == "pub(crate) enum PopupSize {" || $0 == "pub enum PopupSize {" {
          print "pub enum PopupSize {"
          next
        }
        { print }
      ' "$1"
    }

    if ! diff -q \
      <(normalize_popup_size_visibility "$SOURCE_CHECKOUT/src/popup_size.rs") \
      <(normalize_popup_size_visibility "$COMPAT/src/popup_size.rs") \
      >/dev/null; then
      echo "Herdr popup_size copy drifted from HERDR_SRC beyond the intentional PopupSize visibility adaptation" >&2
      diff -u \
        <(normalize_popup_size_visibility "$SOURCE_CHECKOUT/src/popup_size.rs") \
        <(normalize_popup_size_visibility "$COMPAT/src/popup_size.rs") \
        | sed -n '1,120p' >&2
      exit 1
    fi
  }

  compare_exact "src/api/schema.rs" "src/api/schema.rs"
  while IFS= read -r -d '' upstream_schema_file; do
    file_name="$(basename "$upstream_schema_file")"
    case "$file_name" in
      tests.rs|tabs.rs|workspaces.rs)
        continue
        ;;
    esac
    compare_exact "src/api/schema/$file_name" "src/api/schema/$file_name"
  done < <(find "$SOURCE_CHECKOUT/src/api/schema" -maxdepth 1 -type f -name '*.rs' -print0)
  compare_popup_size
  compare_wire_body

  echo "Herdr $EXPECTED_HERDR_TAG/protocol $EXPECTED_HERDR_PROTOCOL compatibility vendor layout and HERDR_SRC drift checks passed"
else
  echo "Herdr $EXPECTED_HERDR_TAG/protocol $EXPECTED_HERDR_PROTOCOL compatibility vendor layout looks clean"
  echo "Set HERDR_SRC=/path/to/clean/herdr-$EXPECTED_HERDR_TAG to compare exact upstream schema/wire copies"
fi
