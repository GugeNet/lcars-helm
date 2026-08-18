# Boat power-loss shutdown monitor

Replacement for `scripts/carsetup.sh` / `/etc/switch.sh`. That script used the
sysfs GPIO interface, which this Pi's trixie image doesn't expose for this
hardware, and registered itself via `/etc/rc.local`, which doesn't exist on
this image either. `scripts/carsetup.sh` is kept as-is for the record of the
original wiring and logic; this is the working replacement, same wiring,
same behaviour, same timing.

Only relevant on a Pi actually wired to the detector circuit (GPIO23 in from
the "OUT" lead, GPIO24 out to the "IN" lead) -- i.e. the boat's Pi, not the
dev Pi.

## Install

Run on the boat Pi itself, as the normal user (it uses `sudo` where needed):

```bash
sudo cp lcars-shutdown-monitor.sh /usr/local/bin/lcars-shutdown-monitor
sudo chmod +x /usr/local/bin/lcars-shutdown-monitor
sudo cp lcars-shutdown-monitor.service /etc/systemd/system/lcars-shutdown-monitor.service
```

If a temporary stopgap is already holding GPIO24 (e.g. a `systemd-run
--unit=lcars-alive-signal ...` transient unit from testing), stop it first so
it doesn't fight the real service for the same line:

```bash
systemctl status lcars-alive-signal --no-pager 2>/dev/null && sudo systemctl stop lcars-alive-signal
```

Then enable and start the real service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lcars-shutdown-monitor.service
```

## Verify

```bash
systemctl status lcars-shutdown-monitor --no-pager -l
pinctrl 2>&1 | grep -E '^\s*(23|24)\b'   # 24 should read as driven high (op, dh)
journalctl -t lcars-shutdown-monitor -n 20 --no-pager
```

With the detector actually powered, GPIO23 should read low (power present)
and the Pi should stay up. Nothing here should be tested by physically
pulling boat power unless you're ready for the Pi to actually shut down.
