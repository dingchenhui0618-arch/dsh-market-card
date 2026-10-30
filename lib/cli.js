// CLI half of dsh-market-card. scripts/build.mjs copies this to lib/cli.js and
// bin/market-card.mjs imports that built file, so the npm package never needs
// src/ at runtime.

import { CardError } from './card.js'
import { DEFAULT_SCALE, generateCard, summarize } from './generate.js'

const USAGE = `dsh-market-card — README + docs/*.png → a self-contained HTML card and a real PNG

Usage
  dsh-market-card [repo] [options]

Options
  -o, --out <dir>       output directory (default: <repo>/dist)
      --config <file>   overrides file (default: <repo>/market-card.json)
      --no-png          write HTML, card.md and card.json only
      --scale <n>       PNG device scale factor, 1-3 (default: ${DEFAULT_SCALE})
      --browser <exe>   Chromium-family browser for the PNG step
      --strict          refuse to write when a required field is missing (exit 2)
      --json            machine-readable summary on stdout
      --now <iso>       fixed generation timestamp, for reproducible output
  -h, --help            show this help

Required fields
  title.zh, title.en, tagline.zh, tagline.en, install, at least one screenshot,
  capabilities.zh/en and limitations.zh/en.

Outputs
  card.html   one self-contained file (data-URI screenshots, no network)
  card.png    rendered by the installed Chrome/Edge/Chromium (headless)
  card.md     ready-to-paste PR/market snippet that references card.png
  card.json   the model plus every missing field and source line
`

function takeValue(argv, index, flag) {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new CardError('bad-arg', flag + ' needs a value')
  return value
}

export function parseArgs(argv) {
  const options = {
    repo: '.',
    outDir: undefined,
    configPath: undefined,
    png: true,
    scale: DEFAULT_SCALE,
    browser: undefined,
    strict: false,
    json: false,
    help: false,
    now: undefined,
  }
  const positional = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') {
      positional.push(...argv.slice(i + 1))
      break
    }
    if (arg === '--out' || arg === '-o') {
      options.outDir = takeValue(argv, i, arg)
      i += 1
    } else if (arg === '--config') {
      options.configPath = takeValue(argv, i, arg)
      i += 1
    } else if (arg === '--scale') {
      const raw = takeValue(argv, i, arg)
      options.scale = Number(raw)
      i += 1
    } else if (arg === '--browser') {
      options.browser = takeValue(argv, i, arg)
      i += 1
    } else if (arg === '--now') {
      options.now = takeValue(argv, i, arg)
      i += 1
    } else if (arg === '--no-png') {
      options.png = false
    } else if (arg === '--png') {
      options.png = true
    } else if (arg === '--strict') {
      options.strict = true
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg.startsWith('-')) {
      throw new CardError('bad-arg', 'unknown option: ' + arg)
    } else {
      positional.push(arg)
    }
  }
  if (positional.length > 1) throw new CardError('bad-arg', 'expected one repository path, got: ' + positional.join(' '))
  if (positional.length === 1) options.repo = positional[0]
  if (!Number.isInteger(options.scale) || options.scale < 1 || options.scale > 3) {
    throw new CardError('bad-arg', '--scale must be an integer between 1 and 3')
  }
  return options
}

function formatHuman(result) {
  const lines = []
  const model = result.model
  const title = [model.copy.title.zh, model.copy.title.en].filter(Boolean).join(' / ')
  lines.push('dsh-market-card · ' + title)
  lines.push('  repo    ' + model.repo.dir)
  lines.push('  out     ' + result.files.outDir)
  lines.push('  html    ' + result.files.html)
  lines.push('  md      ' + result.files.markdown)
  lines.push('  json    ' + result.files.json)
  if (result.png.ok) {
    lines.push('  png     ' + result.png.width + '×' + result.png.height + '  (' + Math.round(result.png.bytes / 1024) + ' KiB, ' + result.png.ms + ' ms)')
  } else if (result.png.code === 'skipped') {
    lines.push('  png     skipped (--no-png)')
  } else {
    lines.push('  png     FAILED [' + result.png.code + '] ' + result.png.message)
  }
  if (model.missing.length === 0) {
    lines.push('  fields  complete')
  } else {
    lines.push('  fields  missing ' + model.missing.length + ': ' + model.missing.map((field) => field.key).join(', '))
  }
  if (model.warnings.length > 0) {
    lines.push('  warn    ' + model.warnings.map((warning) => warning.code + ':' + (warning.path || '?')).join(', '))
  }
  return lines.join('\n') + '\n'
}

export async function main(argv, io = {}) {
  const stdout = io.stdout || process.stdout
  const stderr = io.stderr || process.stderr
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    stderr.write('error: ' + (error instanceof CardError ? error.code + ': ' : '') + error.message + '\n')
    return 1
  }
  if (options.help) {
    stdout.write(USAGE)
    return 0
  }
  try {
    const result = await generateCard(options)
    if (options.json) stdout.write(JSON.stringify(summarize(result), null, 2) + '\n')
    else stdout.write(formatHuman(result))
    if (options.png && !result.png.ok) {
      stderr.write('\nPNG failed [' + result.png.code + '] ' + result.png.message + '\n')
      if (result.png.code === 'browser-missing') {
        stderr.write('HTML, card.md and card.json were written; install Chrome/Edge or pass --browser <exe> for the PNG.\n')
        return 3
      }
      return 1
    }
    return 0
  } catch (error) {
    if (error instanceof CardError) {
      stderr.write('error: ' + error.code + ': ' + error.message + '\n')
      if (error.code === 'missing-fields' && error.detail && Array.isArray(error.detail.missing)) {
        for (const field of error.detail.missing) stderr.write('  missing: ' + field.key + ' (' + field.zh + ' / ' + field.en + ')\n')
        stderr.write('Add market-card.json or fix the README, then run again. Nothing was written.\n')
        return 2
      }
      return 1
    }
    stderr.write('error: ' + String((error && error.stack) || error) + '\n')
    return 1
  }
}
