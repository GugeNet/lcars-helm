# lcars-helm

An LCARS-styled instrument display for a sailboat, running on a Raspberry Pi at the
nav station, fed by [Signal K](https://signalk.org/). It comes with a protocol-level
boat simulator so the whole stack can be developed and tested on a Windows desktop
or a spare Pi without being anywhere near the water.

```
Boat:  N2K instruments ──> YDWG-02N ──RAW/TCP──┐
       Victron equipment ─> Cerbo GX ──MQTT────┤
                                               ├──> Signal K server ──> LCARS webapp
Dev:   simulator (fake YDWG + fake Cerbo) ─────┘         (on the Pi)     (Chromium kiosk)
```

The simulator impersonates the real hardware rather than injecting data into Signal K
directly, so the Signal K configuration on the bench is the same one that runs on the
boat — only the host names differ.

## Layout

| Path         | What it is                                                         |
| ------------ | ------------------------------------------------------------------ |
| `webapp/`    | The LCARS front end. React + Vite, packaged as a Signal K webapp.   |
| `simulator/` | Boat physics plus YDWG-02 and Cerbo GX emulators.                   |
| `deploy/`    | Raspberry Pi provisioning, kiosk setup, auto-updater, SK templates. |
| `scripts/`   | Development helpers.                                                |
| `cloud/`     | ASP.NET Core Azure app: log ingestion API, analytics dashboard, and marina/anchorage data, backed by Azure Storage. See [cloud/README.md](cloud/README.md). |

## Getting started

Requires Node 20 or newer.

```bash
npm install
```

Then, in three terminals:

```bash
npm run dev:sim
```

```bash
npm run dev:signalk
```

```bash
npm run dev:web
```

`dev:signalk` renders the templates in `deploy/signalk/` into a local, git-ignored
`.signalk-dev/` directory pointing at the simulator on `127.0.0.1`, then starts the
server. Signal K's own admin UI is at <http://localhost:3000>, and its data browser is
the quickest way to confirm the simulator is being decoded.

The Victron side needs the plugin installed once into that config directory:

```bash
npm --prefix .signalk-dev install signalk-venus-plugin
```

Then open <http://localhost:5173>. The Vite dev server proxies `/signalk` through to
the server on port 3000, so the app behaves exactly as it does on the boat while
still hot-reloading.

To see what the boat actually gets — the packed release served by Signal K itself —
build and install it, then open <http://localhost:3000/lcars-helm/>:

```bash
npm run build && npm pack --workspace lcars-helm --pack-destination dist && npm --prefix .signalk-dev install --no-save ../dist/lcars-helm-0.1.0.tgz
```

### The simulator

```bash
npm run sim -- --scenario anchored --speed 10
```

It impersonates both pieces of hardware at once. It serves Yacht Devices RAW frames
over both TCP and UDP exactly as a YDWG-02 does. Signal K on the boat connects over
**UDP** — confirmed against Cinderella's real gateway, whose RAW service is UDP-only;
its TCP port carries NMEA 0183 (a different, older protocol), not RAW. TCP RAW is
still served too, for a gateway configured differently. The simulator also runs an
MQTT broker publishing the Venus topic tree, so `signalk-venus-plugin` talks to it as
though it were the Cerbo GX — portal-id discovery, keepalives and all.

| Option            | Meaning                                                |
| ----------------- | ------------------------------------------------------ |
| `--scenario <id>` | `cruising`, `motoring`, `racing`, `anchored`, `marina` |
| `--tcp-port`      | YDWG RAW TCP port (default 1457, 0 disables)           |
| `--udp-port`      | YDWG RAW UDP port (default 1457, 0 disables) — this is what the real boat uses |
| `--mqtt-port`     | Emulated Cerbo GX MQTT port (default 1883, 0 disables) |
| `--speed`         | Simulated seconds per real second                      |
| `--rate`          | Simulation ticks per second (default 10)               |
| `--list`          | Describe the available scenarios                       |

While it runs, typing a scenario name and pressing Enter switches to it, which is the
fastest way to check that the front end follows a change of situation.

Each scenario scripts events worth watching: the cruising boat tacks up to its mark, the
anchored one sees the wind veer and build before the anchor starts dragging, and the
marina one loses shore power partway through the evening.

## The five situations

The front end has a dashboard for each of the situations the boat is actually used in:

1. **Cruising under sail** — comfort and time of arrival
2. **Motoring on passage** — comfort and distance to run
3. **Racing** — VMG to the next mark
4. **At anchor** — drag, wind shifts, and power endurance
5. **In the marina** — safety and comfort alongside

The app suggests a situation from the sensor data and asks for a single tap to confirm;
it never switches by itself, and the situation can always be set by hand.

## On the boat

`deploy/` provisions a Raspberry Pi end to end — Signal K, its plugins, the Chromium
kiosk and an updater that installs new releases from GitHub by itself:

```bash
deploy/provision.sh --ydwg-host 192.168.1.50 --cerbo-host 192.168.1.51 --github-token github_pat_...
```

The repository is private, so the Pi needs a read-only token to fetch releases.

Tagging a version publishes a release, and the boat picks it up within ten minutes.
The updater verifies checksums before installing and rolls back to the previous
version if the display does not come back — see [deploy/README.md](deploy/README.md).

The spare Pi is provisioned with the same script, pointed at whichever machine is
running the simulator, so the bench setup differs from the boat only in host names.

## Tests

```bash
npm test
```

The simulator's tests encode every PGN it transmits and decode it again with the same
canboat parser Signal K uses, which is what keeps the emulated bus honest. The rest
cover the parts where being wrong would matter at sea: the situation-detection rules,
which alert wins the banner, cross-track error, and the anchor-swing model.

## Licence

MIT
