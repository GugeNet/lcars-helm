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
# The repository is private, so a GitHub token is required. Provide it as
# LCARS_GITHUB_TOKEN, normally through /etc/lcars-helm.env — see deploy/README.md.
#
set -euo pipefail

REPO="${LCARS_REPO:-GugeNet/lcars-helm}"
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

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

auth=()
if [[ -n "${LCARS_GITHUB_TOKEN:-}" ]]; then
  auth=(-H "Authorization: Bearer ${LCARS_GITHUB_TOKEN}")
fi

# ------------------------------------------------------------ what is new ---

api="https://api.github.com/repos/${REPO}/releases/latest"

# Capture the status code rather than relying on curl's exit code alone. On a
# private repository an expired or missing token comes back as 404 — GitHub
# does not admit the repository exists — and that must not be mistaken for
# "no release yet", or the boat would quietly stop updating for good.
status="$(curl -sSL --max-time 30 -w '%{http_code}' -o "$work/release.json" \
  "${auth[@]}" -H 'Accept: application/vnd.github+json' "$api" 2>/dev/null || echo 000)"

case "$status" in
  200) ;;
  000)
    log "GitHub unreachable; will try again on the next tick"
    exit 0
    ;;
  401 | 403)
    fail "GitHub rejected the credentials (HTTP $status). The access token is missing, expired, or lacks Contents:Read on ${REPO}."
    ;;
  404)
    if [[ ${#auth[@]} -eq 0 ]]; then
      fail "GitHub returned 404 for ${REPO} and no token was supplied. A private repository needs LCARS_GITHUB_TOKEN — see /etc/lcars-helm.env."
    fi
    fail "GitHub returned 404 for ${REPO}. Either the repository name is wrong or the token has lost access to it."
    ;;
  5*)
    log "GitHub returned HTTP $status; will try again on the next tick"
    exit 0
    ;;
  *)
    fail "unexpected response from GitHub (HTTP $status)"
    ;;
esac

tag="$(jq -r '.tag_name // empty' <"$work/release.json")"
[[ -n "$tag" ]] || { log "no published release yet"; exit 0; }

installed=""
[[ -f "$VERSION_FILE" ]] && installed="$(cat "$VERSION_FILE")"

if [[ "$tag" == "$installed" ]]; then
  # The recorded version is only trustworthy if the thing it claims to have
  # installed is actually there. It can drift: an unrelated `npm install` in
  # the same directory can silently prune a package that was installed with
  # --no-save (as this one is, deliberately, so it never enters package.json),
  # and the version file has no way to notice on its own. Confirmed exactly
  # this happening — a Pi that recorded v0.1.0 as installed while the display
  # had been serving a 404 for it for days, because nothing ever rechecked.
  if curl -fsS --max-time 5 -o /dev/null "$HEALTH_URL" 2>/dev/null; then
    log "already on $tag"
    exit 0
  fi
  log "recorded as $tag but $HEALTH_URL is not responding — reinstalling to recover"
fi

log "installed=${installed:-none} available=$tag"

# Assets on a private repository must be fetched through the API URL with an
# octet-stream Accept header. The browser_download_url is a web-session URL and
# a token will not open it.
tarball_url="$(jq -r --arg name "$PACKAGE_NAME" \
  '.assets[] | select(.name | startswith($name) and endswith(".tgz")) | .url' \
  <"$work/release.json" | head -n1)"
tarball_name="$(jq -r --arg name "$PACKAGE_NAME" \
  '.assets[] | select(.name | startswith($name) and endswith(".tgz")) | .name' \
  <"$work/release.json" | head -n1)"
sums_url="$(jq -r '.assets[] | select(.name == "SHA256SUMS") | .url' \
  <"$work/release.json" | head -n1)"

[[ -n "$tarball_url" ]] || fail "release $tag has no webapp tarball attached"
# A release without checksums is a packaging mistake. Installing an unverified
# archive onto the boat is not the way to find out.
[[ -n "$sums_url" ]] || fail "release $tag has no SHA256SUMS — refusing to install"

# ---------------------------------------------------------------- fetch -----

fetch_asset() {
  local url="$1" dest="$2"
  curl -fsSL --max-time 300 "${auth[@]}" \
    -H 'Accept: application/octet-stream' -o "$dest" "$url"
}

tarball="$work/$tarball_name"
log "downloading $tarball_name"
fetch_asset "$tarball_url" "$tarball" || fail "download failed"
fetch_asset "$sums_url" "$work/SHA256SUMS" || fail "could not fetch checksums"

# Compare the hashes directly rather than piping a grepped line into
# `sha256sum --check`. That pipeline depends on the separator the file was
# written with — GNU sha256sum uses two spaces in text mode but `*` in binary
# mode — and a separator mismatch makes the check find nothing to verify, which
# is far too quiet a way to skip verifying a download. This also distinguishes
# "no entry for this file" from "the entry does not match".
expected="$(awk -v want="$tarball_name" \
  '{ name = $2; sub(/^\*/, "", name); if (name == want) { print $1; exit } }' \
  "$work/SHA256SUMS")"
actual="$(sha256sum "$tarball" | awk '{ print $1 }')"

[[ -n "$expected" ]] || fail "SHA256SUMS in release $tag has no entry for ${tarball_name}"
[[ "$expected" == "$actual" ]] \
  || fail "checksum mismatch for ${tarball_name} (expected ${expected}, got ${actual}) — refusing to install"
log "checksum verified"

# --------------------------------------------------------------- install ----

# Keep the archive we are replacing so a bad release can be undone without
# needing the network, which may be exactly what is broken.
previous_archive=""
if [[ -n "$installed" ]]; then
  previous_archive="$(ls -1t "$ARCHIVE_DIR"/*.tgz 2>/dev/null | head -n1 || true)"
fi

install_tarball() {
  ( cd "$SK_DIR" && npm install --no-audit --no-fund --no-save "$1" ) >/dev/null
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
deadline=$((SECONDS + HEALTH_TIMEOUT))
healthy="no"
while ((SECONDS < deadline)); do
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
