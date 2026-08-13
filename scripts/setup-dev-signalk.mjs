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
const deployDir = join(repoRoot, 'deploy', 'signalk')
const configDir = join(repoRoot, '.signalk-dev')

const ydwgHost = process.env.LCARS_YDWG_HOST ?? '127.0.0.1'
const ydwgPort = process.env.LCARS_YDWG_PORT ?? '1457'
const cerboHost = process.env.LCARS_CERBO_HOST ?? '127.0.0.1'
const cerboPort = process.env.LCARS_CERBO_PORT ?? '1883'

const substitutions = {
  __YDWG_HOST__: ydwgHost,
  __YDWG_PORT__: ydwgPort,
  __CERBO_HOST__: cerboHost,
  __CERBO_PORT__: cerboPort
}

function render(templatePath, outputPath) {
  if (existsSync(outputPath) && !process.argv.includes('--force')) {
    console.log(`${outputPath} already exists; pass --force to overwrite.`)
    return
  }

  let text = readFileSync(templatePath, 'utf8')
  for (const [token, value] of Object.entries(substitutions)) {
    text = text.split(token).join(value)
  }

  // Fail loudly rather than handing the server a file it will reject at startup.
  JSON.parse(text)

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, text)
  console.log(`wrote ${outputPath}`)
}

render(join(deployDir, 'settings.template.json'), join(configDir, 'settings.json'))
render(
  join(deployDir, 'plugin-config-data', 'venus.json'),
  join(configDir, 'plugin-config-data', 'venus.json')
)

console.log(`YDWG at ${ydwgHost}:${ydwgPort}, Cerbo at ${cerboHost}:${cerboPort}`)
