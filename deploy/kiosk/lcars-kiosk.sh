#!/usr/bin/env bash
#
# Run the LCARS display full screen on the nav station touch panel.
#
# Started by the desktop session. It waits for Signal K to be serving the app
# before showing anything — a Chromium error page is a poor thing to greet the
# crew with — and restarts the browser if it ever exits, because a blank screen
# at the chart table is worse than almost any other failure here.
#
set -uo pipefail

URL="${LCARS_URL:-http://localhost:3000/lcars-helm/}"
# Our own Chromium profile, separate from any desktop browsing. Without this,
# launching Chromium while another instance is running makes the new process
# hand the URL to the existing one and exit immediately — which the restart
# loop below reads as a crash, so it launches again, and the display fills up
# with blank tabs instead of showing anything.
PROFILE_DIR="${LCARS_CHROMIUM_PROFILE:-$HOME/.lcars-helm/chromium}"
RESTART_DELAY=5
MAX_RESTART_DELAY=60

log() { printf '%s lcars-kiosk: %s\n' "$(date -Is)" "$*"; }

CHROMIUM="$(command -v chromium || command -v chromium-browser || true)"
if [[ -z "$CHROMIUM" ]]; then
  log "no chromium binary found; install chromium or re-provision with --no-kiosk"
  exit 1
fi

mkdir -p "$PROFILE_DIR"

if [[ -z "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ]]; then
  log "warning: neither WAYLAND_DISPLAY nor DISPLAY is set; is this running inside the desktop session?"
fi

# Chromium keeps a "profile was not closed cleanly" flag that produces a restore
# bubble over the display after a power cut — which is how a boat is normally
# switched off. Clearing it each start keeps the screen clean.
PREFS="$PROFILE_DIR/Default/Preferences"
if [[ -f "$PREFS" ]]; then
  sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' \
    "$PREFS" 2>/dev/null || true
fi

log "waiting for $URL"
until curl -fsS --max-time 3 -o /dev/null "$URL" 2>/dev/null; do
  sleep 3
done
log "display is up; starting Chromium"

# Hide the pointer: this is a touch screen and there is no mouse aboard. X11
# only, so under Wayland it simply does nothing.
if command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 0.5 -root >/dev/null 2>&1 &
fi

# The guard below is belt and braces; the dedicated profile above is what
# actually prevents the tab storm. If pgrep is missing we simply go without it,
# which at worst restores the old relaunch behaviour — now bounded by backoff.
HAVE_PGREP="no"
command -v pgrep >/dev/null 2>&1 && HAVE_PGREP="yes"
[[ "$HAVE_PGREP" == "no" ]] && log "note: pgrep not available; relying on the dedicated profile alone"

delay="$RESTART_DELAY"
while true; do
  # If our instance is already alive, leave it alone. This is what stops a
  # fast-exiting launch from multiplying into a screenful of tabs.
  if [[ "$HAVE_PGREP" == "yes" ]] && pgrep -f -- "--user-data-dir=$PROFILE_DIR" >/dev/null 2>&1; then
    sleep "$RESTART_DELAY"
    continue
  fi

  started_at="$SECONDS"

  # The URL is positional. Passing it as --app= as well as --kiosk makes
  # Chromium open an app window that fights with kiosk mode and comes up blank.
  "$CHROMIUM" \
    --kiosk \
    --user-data-dir="$PROFILE_DIR" \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=Translate,TranslateUI \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    --check-for-update-interval=31536000 \
    --password-store=basic \
    --no-first-run \
    --ozone-platform-hint=auto \
    `# The anchor alarm has to be able to make a noise without anyone
     # having tapped the screen first.` \
    --autoplay-policy=no-user-gesture-required \
    "$URL" \
    >>"${LCARS_CHROMIUM_LOG:-/tmp/lcars-chromium.log}" 2>&1

  ran_for=$((SECONDS - started_at))

  # A browser that dies within seconds is failing to start, not crashing under
  # use. Back off so the journal and the screen are not flooded while whatever
  # is wrong gets fixed.
  if ((ran_for < 10)); then
    delay=$((delay * 2))
    ((delay > MAX_RESTART_DELAY)) && delay="$MAX_RESTART_DELAY"
    log "Chromium exited after ${ran_for}s — see /tmp/lcars-chromium.log; retrying in ${delay}s"
  else
    delay="$RESTART_DELAY"
    log "Chromium exited after ${ran_for}s; restarting in ${delay}s"
  fi

  sleep "$delay"
done
