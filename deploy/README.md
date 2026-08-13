# Deployment

Everything needed to turn a Raspberry Pi into the nav station display, and to
keep it up to date afterwards without anyone touching it.

## Provisioning a Pi

Both the boat Pi and the spare on the bench are set up the same way; only the
host names differ.

```bash
git clone https://github.com/OWNER/lcars-helm.git
cd lcars-helm
deploy/provision.sh --ydwg-host 192.168.1.50 --cerbo-host 192.168.1.51 --repo OWNER/lcars-helm
```

On the bench, point it at the machine running the simulator instead:

```bash
deploy/provision.sh --ydwg-host 192.168.1.80 --cerbo-host 192.168.1.80
```

The script installs Node, Signal K and its plugins, writes the Signal K
configuration, installs the services, and sets up the Chromium kiosk. It is safe
to run again — existing configuration is left alone, so anything changed through
the Signal K admin UI survives.

Add `--no-kiosk` for a Pi with no display attached.

| Unit                  | What it does                                        |
| --------------------- | --------------------------------------------------- |
| `signalk.service`     | The Signal K server, which also serves the display   |
| `lcars-update.timer`  | Checks GitHub for a new release every ten minutes    |
| `lcars-kiosk`         | Chromium full screen, started with the desktop       |

## Releases

The Pi installs whatever the newest GitHub release offers, so a release is the
act of deploying to the boat.

```bash
npm version patch --workspace lcars-helm
git commit -am "Release v0.1.1"
git tag v0.1.1
git push && git push --tags
```

The tag triggers `.github/workflows/release.yml`, which typechecks, tests and
builds before packing the webapp and attaching it — with a `SHA256SUMS` file —
to the release. A build that fails never becomes a release, so the boat never
sees it.

The tag must match the version in `webapp/package.json`; the workflow refuses to
publish otherwise.

## What the updater will and will not do

`lcars-update.sh` runs unattended on a boat, so it is deliberately timid:

- It exits quietly when GitHub cannot be reached. A 4G link that drops mid-passage
  is normal, not an error.
- It refuses to install a release with no `SHA256SUMS`, or one whose checksum does
  not match. An interrupted download is far more likely than a malicious one, and
  both are handled the same way.
- After restarting Signal K it waits for the display to actually serve. If it does
  not come back within ninety seconds, the previous version is reinstalled from a
  local copy and the server restarted again — no network needed, which matters
  when the network may be what broke.
- The installed version is only recorded once the new one has been seen working,
  so a failed update is retried rather than assumed done.

To watch it:

```bash
journalctl -u lcars-update -f
```

To force a check now:

```bash
sudo systemctl start lcars-update.service
```

To pin the boat to a version, stop the timer:

```bash
sudo systemctl disable --now lcars-update.timer
```

## Manual rollback

The two most recent releases are kept in `~/.lcars-helm/releases`:

```bash
cd ~/.signalk
npm install --no-save ~/.lcars-helm/releases/lcars-helm-0.1.0.tgz
sudo systemctl restart signalk
```
