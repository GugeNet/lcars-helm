# Deployment

Everything needed to turn a Raspberry Pi into the nav station display, and to
keep it up to date afterwards without anyone touching it.

## The access token

The repository is private, so the Pi needs a token to read releases. Create a
**fine-grained personal access token** at
<https://github.com/settings/personal-access-tokens> with:

- **Repository access** — only `GugeNet/lcars-helm`
- **Permissions** — `Contents: Read-only`

That is the whole scope needed: read the release list and download its assets.
Nothing that token can do would let anyone change the repository.

Give it to `provision.sh` once and it is stored in `/etc/lcars-helm.env`, owned
by root and readable only by root, which systemd reads before dropping to the
normal user. It never appears in the unit file or in shell history.

Fine-grained tokens expire. When one does, the updater stops with a loud error
in the journal rather than failing quietly — but the boat will not update until
it is replaced:

```bash
sudo install -m 600 -o root -g root /dev/null /etc/lcars-helm.env
echo 'LCARS_GITHUB_TOKEN=github_pat_...' | sudo tee /etc/lcars-helm.env >/dev/null
sudo systemctl start lcars-update.service
```

Set a calendar reminder for a week before the expiry date, or use a token with
no expiry if the Pi is the only thing holding it.

## Provisioning a Pi

Both the boat Pi and the spare on the bench are set up the same way; only the
host names differ.

Cloning a private repository on the Pi needs credentials too — the simplest is a
one-off HTTPS clone using the same token:

```bash
git clone https://github_pat_...@github.com/GugeNet/lcars-helm.git
cd lcars-helm
deploy/provision.sh --github-token github_pat_...
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
deploy/provision.sh --ydwg-host 192.168.1.80 --cerbo-host 192.168.1.80 --github-token github_pat_...
```

Re-running later without `--github-token` keeps the token already installed.

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
- It does **not** treat an authentication failure as a network failure. On a
  private repository GitHub answers an unauthenticated request with `404`, which
  would otherwise read as "no release yet" and silently stop updates for good.
  A missing, expired or revoked token fails loudly instead, naming the cause.
- Release assets are fetched through the API asset URL with an `octet-stream`
  Accept header. The `browser_download_url` in the release JSON is a web-session
  URL and a token will not open it on a private repository.
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
