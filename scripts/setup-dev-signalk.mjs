#!/usr/bin/env node
/**
 * Render the Signal K settings template into a local, git-ignored config
 * directory pointing at the simulator on this machine. The server writes its
 * own runtime state (plugin config, base deltas) into the same directory, so it
 * is deliberately kept out of the repository — only the template is tracked.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const templatePath = join(repoRoot, 'deploy', 'signalk', 'settings.template.json')
const configDir = join(repoRoot, '.signalk-dev')
const settingsPath = join(configDir, 'settings.json')

const ydwgHost = process.env.LCARS_YDWG_HOST ?? '127.0.0.1'
const ydwgPort = process.env.LCARS_YDWG_PORT ?? '1457'

if (existsSync(settingsPath) && !process.argv.includes('--force')) {
  console.log(`${settingsPath} already exists; pass --force to overwrite.`)
  process.exit(0)
}

const rendered = readFileSync(templatePath, 'utf8')
  .replace('__YDWG_HOST__', ydwgHost)
  .replace('__YDWG_PORT__', ydwgPort)

// Fail loudly rather than handing the server a file it will reject at startup.
JSON.parse(rendered)

mkdirSync(configDir, { recursive: true })
writeFileSync(settingsPath, rendered)
console.log(`wrote ${settingsPath} (YDWG at ${ydwgHost}:${ydwgPort})`)
