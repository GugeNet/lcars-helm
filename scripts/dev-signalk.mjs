#!/usr/bin/env node
/**
 * Start Signal K against the local development config.
 *
 * The config directory is passed through `SIGNALK_NODE_CONFIG_DIR` rather than
 * the `--configdir` flag: the flag is silently ignored in some versions and the
 * server falls back to empty settings, which looks exactly like a server that
 * started fine but has no data connections. Setting it here also keeps the
 * command identical on Windows and on the Pi.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const configDir = join(repoRoot, '.signalk-dev')
const settings = join(configDir, 'settings.json')

if (!existsSync(settings)) {
  console.error(`no settings at ${settings}; run "npm run setup:signalk" first`)
  process.exit(1)
}

const server = join(repoRoot, 'node_modules', 'signalk-server', 'bin', 'signalk-server')

const child = spawn(process.execPath, [server], {
  stdio: 'inherit',
  env: { ...process.env, SIGNALK_NODE_CONFIG_DIR: configDir }
})

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0))
})
