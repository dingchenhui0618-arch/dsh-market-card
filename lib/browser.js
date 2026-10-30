// PNG rendering without a single npm dependency.
//
// A card is a static HTML file, so the only reliable way to turn it into a
// real PNG is the Chromium-family browser that is already installed on the
// machine. Headless Chrome can both serialise the measured DOM (--dump-dom)
// and take a viewport screenshot (--screenshot), which is exactly the two
// passes this module needs: measure the exact page height, then capture at
// that height. No Puppeteer, no Playwright, no bundled browser.

import { spawn as nodeSpawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_HEIGHT = 16000
const MAX_SCALE = 3

function platformPaths(platform, env) {
  const out = []
  if (platform === 'win32') {
    // Joining with the host separator would mix `\` and `/` when this code runs
    // on Linux/macOS, so build Windows paths by hand.
    const win = (...parts) => parts.join('\\')
    for (const root of [env['ProgramFiles'], env['ProgramFiles(x86)'], env.LOCALAPPDATA]) {
      if (!root) continue
      out.push(win(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))
      out.push(win(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
      out.push(win(root, 'Chromium', 'Application', 'chrome.exe'))
    }
  } else if (platform === 'darwin') {
    out.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    out.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')
    out.push('/Applications/Chromium.app/Contents/MacOS/Chromium')
  } else {
    out.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge')
  }
  return out
}

const PATH_NAMES = {
  win32: ['chrome.exe', 'msedge.exe', 'chromium.exe'],
  darwin: ['Google Chrome', 'Chromium', 'Microsoft Edge'],
  linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'],
}

/** Ordered candidates: explicit override, then PATH, then well-known install locations. */
export function browserCandidates({ env = process.env, platform = process.platform } = {}) {
  const out = []
  const add = (file) => {
    if (typeof file === 'string' && file.length > 0 && !out.includes(file)) out.push(file)
  }
  add(env.DSH_MARKET_CARD_BROWSER)
  const pathValue = env.PATH || env.Path || ''
  const names = PATH_NAMES[platform] || PATH_NAMES.linux
  // Split PATH the way the TARGET platform does, not the way the host does:
  // the function is testable for win32 while running on Linux CI.
  const isWindows = platform === 'win32'
  const separator = isWindows ? ';' : ':'
  const joiner = isWindows ? '\\' : '/'
  for (const dir of pathValue.split(separator)) {
    const base = dir.replace(/[\\/]+$/, '')
    if (base.length === 0) continue
    for (const name of names) add(base + joiner + name)
  }
  for (const file of platformPaths(platform, env)) add(file)
  return out
}

export function findBrowser({ exe, env = process.env, platform = process.platform, exists = existsSync } = {}) {
  if (typeof exe === 'string' && exe.length > 0) return exists(exe) ? exe : null
  for (const candidate of browserCandidates({ env, platform })) {
    if (exists(candidate)) return candidate
  }
  return null
}

export function readPngSize(input) {
  const buffer = Buffer.isBuffer(input) ? input : readFileSync(input)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length }
}

function run(exe, args, options) {
  const spawnImpl = options.spawn
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    let timer
    const finish = (code, error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut, error })
    }
    let child
    try {
      child = spawnImpl(exe, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({ code: -1, stdout: '', stderr: '', timedOut: false, error: error.message })
      return
    }
    timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill()
      } catch (error) {
        // The process may already be gone.
      }
    }, options.timeoutMs || 60000)
    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
        if (stdout.length > 32 * 1024 * 1024) {
          try {
            child.kill()
          } catch (error) {
            // ignore
          }
        }
      })
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
        if (stderr.length > 200000) stderr = stderr.slice(-200000)
      })
    }
    child.on('error', (error) => finish(-1, error.message))
    child.on('close', (code) => finish(code === null ? -1 : code))
  })
}

function fail(code, message, extra) {
  return { ok: false, code, message, ...extra }
}

/**
 * Render a generated card HTML file to a PNG.
 *
 * Returns a result object instead of throwing: a card without a browser is
 * still a usable HTML card, so the caller decides whether that is fatal.
 */
export async function renderPng({
  htmlPath,
  outPng,
  width = 1200,
  scale = 1,
  browser,
  timeoutMs = 60000,
  spawn = nodeSpawn,
  env = process.env,
  platform = process.platform,
} = {}) {
  const started = Date.now()
  const exe = browser || findBrowser({ env, platform })
  if (!exe) {
    return fail('browser-missing', 'no Chromium-family browser found; pass --browser <exe> or set DSH_MARKET_CARD_BROWSER')
  }
  if (typeof htmlPath !== 'string' || !existsSync(htmlPath)) {
    return fail('html-missing', 'card HTML not found: ' + String(htmlPath))
  }
  if (!Number.isInteger(width) || width < 480 || width > 2400) {
    return fail('bad-width', 'width must be an integer between 480 and 2400')
  }
  if (!Number.isInteger(scale) || scale < 1 || scale > MAX_SCALE) {
    return fail('bad-scale', 'scale must be an integer between 1 and ' + MAX_SCALE)
  }

  const tmp = mkdtempSync(join(tmpdir(), 'dsh-market-card-'))
  const profile = join(tmp, 'profile')
  mkdirSync(profile, { recursive: true })
  const url = pathToFileURL(htmlPath).href
  const baseArgs = [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--user-data-dir=' + profile,
    '--virtual-time-budget=4000',
  ]

  try {
    const measured = await run(exe, [...baseArgs, '--dump-dom', url], { spawn, timeoutMs })
    if (measured.error !== undefined) {
      return fail('browser-failed', 'browser could not start: ' + measured.error, { stderr: measured.stderr.slice(-1200) })
    }
    if (measured.code !== 0) {
      return fail('measure-failed', 'browser exited with code ' + measured.code + ' while measuring the card', {
        stderr: measured.stderr.slice(-1200),
      })
    }
    const match = /data-card-height="(\d+)"/.exec(measured.stdout)
    if (match === null) {
      return fail('measure-failed', 'the card did not report data-card-height; is this a dsh-market-card HTML file?', {
        stderr: measured.stderr.slice(-1200),
      })
    }
    const height = Number(match[1])
    if (!Number.isFinite(height) || height < 200) {
      return fail('measure-failed', 'measured card height is implausible: ' + match[1])
    }
    if (height > MAX_HEIGHT) {
      return fail('card-too-tall', 'card is ' + height + 'px tall (limit ' + MAX_HEIGHT + '); trim bullets or screenshots', {
        cssHeight: height,
      })
    }

    const shot = await run(
      exe,
      [...baseArgs, '--force-device-scale-factor=' + String(scale), '--window-size=' + width + ',' + height, '--screenshot=' + outPng, url],
      { spawn, timeoutMs },
    )
    if (shot.error !== undefined) {
      return fail('browser-failed', 'browser could not start: ' + shot.error, { stderr: shot.stderr.slice(-1200) })
    }
    if (shot.code !== 0) {
      return fail('screenshot-failed', 'browser exited with code ' + shot.code + ' while taking the screenshot', {
        stderr: shot.stderr.slice(-1200),
      })
    }
    const size = existsSync(outPng) ? readPngSize(outPng) : null
    if (size === null) {
      return fail('screenshot-missing', 'browser reported success but wrote no valid PNG to ' + outPng, {
        stderr: shot.stderr.slice(-1200),
      })
    }
    return {
      ok: true,
      path: outPng,
      cssWidth: width,
      cssHeight: height,
      width: size.width,
      height: size.height,
      bytes: size.bytes,
      scale,
      browser: exe,
      ms: Date.now() - started,
    }
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 })
    } catch (error) {
      // A leftover temp profile is harmless; never turn it into a card failure.
    }
  }
}
