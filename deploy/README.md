# Deployment

Everything needed to turn a Raspberry Pi into the nav station display, and to
keep it up to date afterwards without anyone touching it.

## The access token (optional — the repo is public)

`GugeNet/lcars-helm` is a public repository, so the Pi needs no token at all to
read releases; `provision.sh` works with no `--github-token` flag. A token is
still supported, and worth having for either of two reasons: a much higher
GitHub API rate limit, or in case the repository is ever made private again.

If you do set one, use a **fine-grained personal access token** at
<https://github.com/settings/personal-access-tokens> with:

- **Repository access** — only `GugeNet/lcars-helm`
- **Permissions** — `Contents: Read-only`

Give it to `provision.sh` once and it is stored in `/etc/lcars-helm.env`, owned
by root and readable only by root, which systemd reads before dropping to the
normal user. It never appears in the unit file or in shell history.

**A stale token is worse than no token.** GitHub rejects an expired or revoked
one outright — it does not fall back to anonymous access just because the
resource is public. A Pi with a bad token in `/etc/lcars-helm.env` will fail
every ten minutes with a clear `401` in the journal, even though the exact same
request with no `Authorization` header at all would have succeeded. If you are
not actively relying on a token, the simplest fix is to remove the file:

```bash
sudo rm -f /etc/lcars-helm.env
sudo systemctl start lcars-update.service
```

If you'd rather rotate it than drop it, fine-grained tokens expire, and the
updater stops with a loud error in the journal rather than failing quietly:

```bash
sudo install -m 600 -o root -g root /dev/null /etc/lcars-helm.env
echo 'LCARS_GITHUB_TOKEN=github_pat_...' | sudo tee /etc/lcars-helm.env >/dev/null
sudo systemctl start lcars-update.service
```

Set a calendar reminder for a week before the expiry date if you go this route.

## Provisioning a Pi

Both the boat Pi and the spare on the bench are set up the same way; only the
host names differ.

```bash
git clone https://github.com/GugeNet/lcars-helm.git
cd lcars-helm
deploy/provision.sh
```

On the boat that is usually the whole command. Both devices advertise themselves
over mDNS, and the defaults use those names rather than addresses:

| Device            | Default host  | Why                                                     |
| ----------------- | ------------- | ------------------------------------------------------- |
| Yacht Devices YDWG | `ydwg.local`  | Set on the gateway's own settings page; confirm it there |
| Victron GX        | `venus.local` | A GX announces this **whatever system name is set on it** |

A name follows the device when DHCP moves it, which an address does not — the
commonest way to end up with a display that comes up perfectly and shows nothing.
Pass `--ydwg-host` / `--cerbo-host` only if you have changed the names or want to
use addresses.

Provisioning checks both endpoints before it finishes and tells you which of the
three things went wrong — the name did not resolve, it resolved but nothing
answered, or all is well — so a mistake surfaces there rather than as a blank
screen an hour later.

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
- It does **not** treat an authentication failure as a network failure — a bad
  token fails loudly instead of quietly, naming the cause, whether or not one is
  actually needed. (The repo is public now, but the check stays: a Pi with a
  stale token configured would otherwise fail every ten minutes without saying
  why, which is exactly what happened before this was written.)
- Release assets are fetched through the API asset URL with an `octet-stream`
  Accept header, which works whether or not a token is set. The
  `browser_download_url` in the release JSON only works for a public repository
  and only without a token, so the API URL is used unconditionally rather than
  depending on which case currently applies.
- It refuses to install a release with no `SHA256SUMS`, or one whose checksum does
  not match. An interrupted download is far more likely than a malicious one, and
  both are handled the same way.
- After restarting Signal K it waits for the display to actually serve. If it does
  not come back within ninety seconds, the previous version is reinstalled from a
  local copy and the server restarted again — no network needed, which matters
  when the network may be what broke.
- The installed version is only recorded once the new one has been seen working,
  so a failed update is retried rather than assumed done. But the recorded
  version is not trusted blindly either: if it matches the latest release yet the
  display is not actually responding, that is treated as a reason to reinstall,
  not a reason to stop looking. The two can drift apart — confirmed on a Pi that
  had `v0.1.0` recorded as installed while `/lcars-helm/` had been serving a 404
  for days, because an unrelated `npm install` in the same directory had pruned
  the package (installed with `--no-save`, so nothing else considered it a
  dependency worth keeping) and nothing had ever rechecked.

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
