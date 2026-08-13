#!/usr/bin/env node
import readline from 'node:readline'
import { parseSimulatorArgs, USAGE } from './config.js'
import { SimulatorRunner } from './runner.js'
import { describeScenarios, isSituationId } from './scenarios/index.js'

function timestamp(): string {
  return new Date().toISOString().slice(11, 19)
}

async function main(): Promise<void> {
  const { config, showHelp, listScenarios, errors } = parseSimulatorArgs(process.argv.slice(2))

  if (showHelp) {
    process.stdout.write(USAGE)
    return
  }

  if (listScenarios) {
    for (const scenario of describeScenarios()) {
      process.stdout.write(`${scenario.id.padEnd(10)} ${scenario.name} — ${scenario.description}\n`)
    }
    return
  }

  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`error: ${error}\n`)
    process.stderr.write(USAGE)
    process.exitCode = 1
    return
  }

  const runner = new SimulatorRunner(config, {
    onLog: (message) => process.stdout.write(`${timestamp()}  ${message}\n`),
    onStatus: (line) => process.stdout.write(`${timestamp()}  ${line}\n`)
  })

  await runner.start()

  // Typing a scenario name switches situations without restarting, which is the
  // quickest way to check that the front end follows a change of mode.
  const input = readline.createInterface({ input: process.stdin, terminal: false })
  input.on('line', (line) => {
    const command = line.trim().toLowerCase()
    if (command === '') return
    if (command === 'q' || command === 'quit' || command === 'exit') {
      void shutdown()
      return
    }
    if (command === 'list') {
      for (const scenario of describeScenarios()) {
        process.stdout.write(`${scenario.id.padEnd(10)} ${scenario.name}\n`)
      }
      return
    }
    if (isSituationId(command)) {
      runner.switchScenario(command)
      return
    }
    process.stdout.write(`unknown command "${command}" — try one of: list, q, or a scenario name\n`)
  })

  let shuttingDown = false
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    process.stdout.write('\nshutting down\n')
    input.close()
    await runner.stop()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

main().catch((error: unknown) => {
  process.stderr.write(`fatal: ${error instanceof Error ? error.stack : String(error)}\n`)
  process.exit(1)
})
