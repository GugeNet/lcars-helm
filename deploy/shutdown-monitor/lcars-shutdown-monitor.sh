#!/bin/bash
#
# Watches the boat's power-loss detector circuit and shuts the Pi down
# cleanly when main power is lost, holding an "alive" signal high the whole
# time so the detector knows not to cut power out from under a running Pi.
#
# Replaces scripts/carsetup.sh's /etc/switch.sh, which used the sysfs GPIO
# interface (/sys/class/gpio) removed for this hardware on the trixie image:
# exporting via /sys/class/gpio/export produces no gpio23/gpio24 directory at
# all. This uses the chip/line interface (libgpiod) that replaced it, and is
# installed as a systemd service instead of an /etc/rc.local entry, which
# doesn't exist on this image either.
#
# Same wiring, same state machine, same timing as the original: GPIO23 in,
# reads the "OUT" lead from the detector; GPIO24 out, held high as the
# "I am running" signal the detector needs before it will leave the Pi
# powered.
set -u

CHIP=gpiochip0
POWER_LOST_LINE=23
ALIVE_LINE=24

# Minutes to wait once power loss is first seen before actually shutting
# down. 0 means "shut down almost immediately" -- the original's setting.
DELAY_MINUTES=0
DELAY_SECONDS=$(( DELAY_MINUTES * 60 ))

log() { logger -t lcars-shutdown-monitor "$1"; }

# Held for as long as this process runs. If it ever exits -- clean or
# crashed -- the line is released, which is the detector's cue that the Pi
# is no longer running and it's safe to cut power for real. That coupling
# is stronger than the original had: a crashed script under the old sysfs
# approach left gpio24's value sitting wherever it was last written, with
# nothing tying it to whether the monitor loop was still alive.
gpioset --chip "$CHIP" --consumer lcars-alive-signal "${ALIVE_LINE}=1" &
ALIVE_PID=$!
trap 'kill "$ALIVE_PID" 2>/dev/null' EXIT

log "started: watching GPIO${POWER_LOST_LINE}, alive signal on GPIO${ALIVE_LINE}"

armed=0
armed_at=0
last_seen_high=0

while true; do
  # Pull-down bias is new versus the original, which read with whatever the
  # default happened to be. If nothing is actively driving this line --
  # during the detector's own power-up, or if it's ever disconnected -- this
  # reads a defined "power present" (safe) rather than an undefined floating
  # value, so a dead/unplugged sensor doesn't itself trigger a shutdown. With
  # the detector actually powered and driving the line, a real drive
  # overrides a weak pull-down either way, so this doesn't change behaviour
  # in the normal case.
  reading="$(gpioget --chip "$CHIP" --bias=pull-down "$POWER_LOST_LINE" 2>/dev/null)"
  if [[ "$reading" == *active* ]]; then
    power=1
  else
    power=0
  fi

  now=$(cut -d. -f1 /proc/uptime)

  if [[ $power -eq 1 && $armed -eq 0 ]]; then
    armed=1
    armed_at=$now
    log "power loss detected"
  fi

  if [[ $power -eq 1 && $armed -eq 1 ]]; then
    last_seen_high=$now
  fi

  if [[ $armed -eq 1 && $power -eq 1 && $(( now - armed_at )) -gt $DELAY_SECONDS ]]; then
    log "shutting down"
    poweroff
    exit 0
  fi

  if [[ $armed -eq 1 && $(( now - last_seen_high )) -gt 20 ]]; then
    armed=0
    log "power restored, stood down"
  fi

  sleep 1
done
