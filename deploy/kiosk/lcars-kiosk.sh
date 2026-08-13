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
RESTART_DELAY=5

log() { printf '%s lcars-kiosk: %s\n' "$(date -Is)" "$*"; }

# Chromium keeps a "profile was not closed cleanly" flag that produces a restore
# bubble over the display after a power cut — which is how a boat is normally
# switched off. Clearing it each start keeps the screen clean.
PROFILE="$HOME/.config/chromium/Default/Preferences"
if [[ -f "$PROFILE" ]]; then
  sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' \
    "$PROFILE" 2>/dev/null || true
fi

log "waiting for $URL"
until curl -fsS --max-time 3 -o /dev/null "$URL" 2>/dev/null; do
  sleep 3
done
log "display is up; starting Chromium"

# Hide the pointer: this is a touch screen and there is no mouse aboard.
command -v unclutter >/dev/null 2>&1 && unclutter -idle 0.5 -root >/dev/null 2>&1 &

CHROMIUM="$(command -v chromium || command -v chromium-browser)"

while true; do
  "$CHROMIUM" \
    --kiosk \
    --app="$URL" \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=Translate,TranslateUI \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    --check-for-update-interval=31536000 \
    --password-store=basic \
    --no-first-run \
    --fast \
    --fast-start \
    `# The anchor alarm has to be able to make a noise without anyone
     # having tapped the screen first.` \
    --autoplay-policy=no-user-gesture-required \
    >/dev/null 2>&1

  log "Chromium exited; restarting in ${RESTART_DELAY}s"
  sleep "$RESTART_DELAY"
done
