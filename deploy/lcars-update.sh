#!/usr/bin/env bash
#
# Install the latest lcars-helm release, if there is a newer one.
#
# Run by lcars-update.timer every ten minutes. The boat is usually online over
# 4G and usually unattended, so this errs heavily towards leaving a working
# display alone: nothing is installed unless it has been downloaded whole and
# its checksum matches, and anything that fails to serve afterwards is rolled
# back to the version that was running before.
#
set -euo pipefail

REPO="${LCARS_REPO:-OWNER/lcars-helm}"
SK_DIR="${LCARS_SIGNALK_DIR:-$HOME/.signalk}"
STATE_DIR="${LCARS_STATE_DIR:-$HOME/.lcars-helm}"
HEALTH_URL="${LCARS_HEALTH_URL:-http://localhost:3000/lcars-helm/}"
HEALTH_TIMEOUT="${LCARS_HEALTH_TIMEOUT:-90}"
PACKAGE_NAME="lcars-helm"

VERSION_FILE="$STATE_DIR/installed-version"
ARCHIVE_DIR="$STATE_DIR/releases"

log() { printf '%s lcars-update: %s\n' "$(date -Is)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

mkdir -p "$STATE_DIR" "$ARCHIVE_DIR"

# ------------------------------------------------------------ what is new ---

api="https://api.github.com/repos/${REPO}/releases/latest"
auth=()
[[ -n "${LCARS_GITHUB_TOKEN:-}" ]] && auth=(-H "Authorization: Bearer ${LCARS_GITHUB_TOKEN}")

release_json="$(curl -fsSL --max-time 30 "${auth[@]}" \
  -H 'Accept: application/vnd.github+json' "$api" 2>/dev/null)" || {
  log "could not reach GitHub; will try again on the next tick"
  exit 0
}

tag="$(jq -r '.tag_name // empty' <<<"$release_json")"
[[ -n "$tag" ]] || { log "no published release yet"; exit 0; }

installed=""
[[ -f "$VERSION_FILE" ]] && installed="$(cat "$VERSION_FILE")"

if [[ "$tag" == "$installed" ]]; then
  log "already on $tag"
  exit 0
fi

log "installed=${installed:-none} available=$tag"

tarball_url="$(jq -r --arg name "$PACKAGE_NAME" \
  '.assets[] | select(.name | startswith($name) and endswith(".tgz")) | .browser_download_url' \
  <<<"$release_json" | head -n1)"
sums_url="$(jq -r '.assets[] | select(.name == "SHA256SUMS") | .browser_download_url' \
  <<<"$release_json" | head -n1)"

[[ -n "$tarball_url" ]] || fail "release $tag has no webapp tarball attached"

# ---------------------------------------------------------------- fetch -----

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

tarball="$work/$(basename "$tarball_url")"
log "downloading $(basename "$tarball_url")"
curl -fsSL --max-time 300 "${auth[@]}" -o "$tarball" "$tarball_url" \
  || fail "download failed"

if [[ -n "$sums_url" ]]; then
  curl -fsSL --max-time 60 "${auth[@]}" -o "$work/SHA256SUMS" "$sums_url" \
    || fail "could not fetch checksums"
  ( cd "$work" && grep " $(basename "$tarball")\$" SHA256SUMS | sha256sum --check --status ) \
    || fail "checksum mismatch for $(basename "$tarball") — refusing to install"
  log "checksum verified"
else
  # A release without checksums is a packaging mistake. Installing an unverified
  # binary onto the boat is not the way to find out.
  fail "release $tag has no SHA256SUMS — refusing to install"
fi

# --------------------------------------------------------------- install ----

# Keep the tarball we are replacing so a bad release can be undone without
# needing the network, which may be exactly what is broken.
previous_archive=""
if [[ -n "$installed" ]]; then
  previous_archive="$(ls -1 "$ARCHIVE_DIR"/*.tgz 2>/dev/null | tail -n1 || true)"
fi

install_tarball() {
  local archive="$1"
  ( cd "$SK_DIR" && npm install --no-audit --no-fund --no-save "$archive" ) >/dev/null
}

log "installing $tag"
install_tarball "$tarball" || fail "npm install failed; leaving the running version in place"

cp "$tarball" "$ARCHIVE_DIR/"
# Two is enough: the one running and the one to fall back to.
ls -1t "$ARCHIVE_DIR"/*.tgz 2>/dev/null | tail -n +3 | xargs -r rm -f

log "restarting Signal K"
sudo systemctl restart signalk.service || fail "could not restart Signal K"

# ---------------------------------------------------------------- verify ----

log "waiting for the display to come back"
deadline=$(( SECONDS + HEALTH_TIMEOUT ))
healthy="no"
while (( SECONDS < deadline )); do
  if curl -fsS --max-time 5 -o /dev/null "$HEALTH_URL" 2>/dev/null; then
    healthy="yes"
    break
  fi
  sleep 3
done

if [[ "$healthy" == "yes" ]]; then
  echo "$tag" >"$VERSION_FILE"
  log "now running $tag"
  exit 0
fi

log "ERROR: $tag did not serve within ${HEALTH_TIMEOUT}s"

if [[ -n "$previous_archive" && -f "$previous_archive" ]]; then
  log "rolling back to $(basename "$previous_archive")"
  if install_tarball "$previous_archive"; then
    sudo systemctl restart signalk.service || true
    log "rolled back; leaving installed version as ${installed}"
    exit 1
  fi
  log "ERROR: rollback failed as well"
fi

fail "no working version to fall back to — the display needs attention"
