#!/usr/bin/env bash
#
# Provision a Raspberry Pi as an lcars-helm nav station display.
#
# Run once per Pi. It is safe to run again: every step checks before it acts, so
# re-running upgrades an existing installation rather than duplicating it.
#
#   curl -fsSL https://raw.githubusercontent.com/OWNER/lcars-helm/master/deploy/provision.sh | bash -s -- --ydwg-host 192.168.1.50
#
# or, from a clone:
#
#   sudo -u "$USER" deploy/provision.sh --ydwg-host ydwg.local --cerbo-host cerbo.local
#
set -euo pipefail

REPO="${LCARS_REPO:-OWNER/lcars-helm}"
YDWG_HOST="ydwg.local"
YDWG_PORT="1457"
CERBO_HOST="cerbo.local"
CERBO_PORT="1883"
NODE_MAJOR="22"
SKIP_KIOSK="no"

usage() {
  cat <<'EOF'
Provision a Raspberry Pi for lcars-helm.

  --ydwg-host <host>   Yacht Devices gateway (default ydwg.local)
  --ydwg-port <port>   Gateway RAW TCP port (default 1457)
  --cerbo-host <host>  Victron Cerbo GX (default cerbo.local)
  --cerbo-port <port>  Cerbo MQTT port (default 1883)
  --repo <owner/name>  GitHub repository to pull releases from
  --no-kiosk           Install the server only, no display
  -h, --help           This message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ydwg-host) YDWG_HOST="$2"; shift 2 ;;
    --ydwg-port) YDWG_PORT="$2"; shift 2 ;;
    --cerbo-host) CERBO_HOST="$2"; shift 2 ;;
    --cerbo-port) CERBO_PORT="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --no-kiosk) SKIP_KIOSK="yes"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run this as the normal user (it will call sudo when it needs to)." >&2
  exit 1
fi

USER_NAME="$(id -un)"
HOME_DIR="$HOME"
SK_DIR="$HOME_DIR/.signalk"
LCARS_DIR="$HOME_DIR/.lcars-helm"

log() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

# --------------------------------------------------------------- packages ---

log "Installing system packages"
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  ca-certificates curl git jq chromium unclutter

# --------------------------------------------------------------- node.js ----

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 20 ]]; then
  log "Installing Node.js ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node.js $(node -v) already present"
fi

# ------------------------------------------------------------- signal k -----

if ! command -v signalk-server >/dev/null 2>&1; then
  log "Installing Signal K server"
  sudo npm install -g --unsafe-perm signalk-server
else
  log "Signal K server already installed"
fi

mkdir -p "$SK_DIR/plugin-config-data" "$LCARS_DIR"

# Signal K needs a package.json in its config directory to track plugin installs.
if [[ ! -f "$SK_DIR/package.json" ]]; then
  cat >"$SK_DIR/package.json" <<'EOF'
{
  "name": "signalk-server-config",
  "version": "0.0.1",
  "description": "Tracks plugin and webapp installs.",
  "license": "Apache-2.0"
}
EOF
fi

log "Installing Signal K plugins"
(
  cd "$SK_DIR"
  npm install --no-audit --no-fund \
    signalk-venus-plugin \
    @signalk/signalk-derived-data
)

# ------------------------------------------------------- signal k config ----

CONF_SRC="$(dirname "$(readlink -f "$0")")"

render() {
  # Substitute the per-boat values into a template. Only written if absent, so
  # that settings changed through the Signal K admin UI are never clobbered.
  local src="$1" dest="$2"
  if [[ -f "$dest" ]]; then
    echo "    keeping existing $dest"
    return
  fi
  sed -e "s|__YDWG_HOST__|${YDWG_HOST}|g" \
      -e "s|__YDWG_PORT__|${YDWG_PORT}|g" \
      -e "s|__CERBO_HOST__|${CERBO_HOST}|g" \
      -e "s|__CERBO_PORT__|${CERBO_PORT}|g" \
      "$src" >"$dest"
  echo "    wrote $dest"
}

log "Writing Signal K configuration"
render "$CONF_SRC/signalk/settings.template.json" "$SK_DIR/settings.json"
render "$CONF_SRC/signalk/plugin-config-data/venus.json" "$SK_DIR/plugin-config-data/venus.json"

# --------------------------------------------------------------- services ---

log "Installing services"

sudo tee /etc/systemd/system/signalk.service >/dev/null <<EOF
[Unit]
Description=Signal K server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER_NAME}
Environment=SIGNALK_NODE_CONFIG_DIR=${SK_DIR}
ExecStart=$(command -v signalk-server)
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo install -m 755 "$CONF_SRC/lcars-update.sh" /usr/local/bin/lcars-update

# The updater runs as this user but has to bounce the server after installing.
# Scoped to exactly that one command rather than a blanket rule.
sudo tee /etc/sudoers.d/lcars-helm >/dev/null <<EOF
${USER_NAME} ALL=(root) NOPASSWD: /usr/bin/systemctl restart signalk.service, /bin/systemctl restart signalk.service
EOF
sudo chmod 0440 /etc/sudoers.d/lcars-helm
sudo visudo -cf /etc/sudoers.d/lcars-helm >/dev/null

sudo tee /etc/systemd/system/lcars-update.service >/dev/null <<EOF
[Unit]
Description=Check for and install lcars-helm releases
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=${USER_NAME}
Environment=LCARS_REPO=${REPO}
Environment=LCARS_SIGNALK_DIR=${SK_DIR}
Environment=LCARS_STATE_DIR=${LCARS_DIR}
ExecStart=/usr/local/bin/lcars-update
EOF

sudo tee /etc/systemd/system/lcars-update.timer >/dev/null <<'EOF'
[Unit]
Description=Check for lcars-helm releases regularly

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
# The boat's 4G link is shared; spread the checks out so several devices
# waking together do not all hit the network at once.
RandomizedDelaySec=90
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now signalk.service
sudo systemctl enable --now lcars-update.timer

# ----------------------------------------------------------------- kiosk ----

if [[ "$SKIP_KIOSK" == "no" ]]; then
  log "Configuring the kiosk display"
  sudo install -m 755 "$CONF_SRC/kiosk/lcars-kiosk.sh" /usr/local/bin/lcars-kiosk

  # Raspberry Pi OS trixie uses the labwc Wayland compositor, which starts
  # anything it finds in this autostart directory when the session begins.
  mkdir -p "$HOME_DIR/.config/labwc"
  install -m 644 "$CONF_SRC/kiosk/labwc-autostart" "$HOME_DIR/.config/labwc/autostart"

  # Keep the panel awake: this display exists to be looked at.
  if command -v raspi-config >/dev/null 2>&1; then
    sudo raspi-config nonint do_blanking 1 || true
    echo "    screen blanking disabled"
  fi
  echo "    kiosk will start with the desktop session"
fi

# ---------------------------------------------------------------- install ---

log "Installing the current release"
LCARS_REPO="$REPO" LCARS_SIGNALK_DIR="$SK_DIR" LCARS_STATE_DIR="$LCARS_DIR" \
  /usr/local/bin/lcars-update || echo "    no release installed yet; the timer will retry"

cat <<EOF

$(log "Done")
  Signal K:    http://$(hostname -I | awk '{print $1}'):3000
  Display:     http://localhost:3000/lcars-helm
  Gateway:     ${YDWG_HOST}:${YDWG_PORT}
  Cerbo:       ${CERBO_HOST}:${CERBO_PORT}
  Releases:    ${REPO}

  systemctl status signalk lcars-update.timer
  journalctl -u lcars-update -f

EOF

if [[ "$SKIP_KIOSK" == "no" ]]; then
  echo "  Reboot to start the kiosk display."
fi
