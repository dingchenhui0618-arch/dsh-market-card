import { strict as assert } from 'node:assert'
import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  browserCandidates,
  findBrowser,
  readPngSize,
  renderPng,
} from '../src/browser.js'
import { cleanup, fakePng } from './helpers.mjs'

function fakeSpawn(handler) {
  const calls = []
  const spawn = (file, args, options) => {
    const call = { file, args, options }
    calls.push(call)
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    process.nextTick(() => {
      const response = handler(call) || {}
      if (response.stdout !== undefined) child.stdout.emit('data', Buffer.from(response.stdout))
      if (response.stderr !== undefined) child.stderr.emit('data', Buffer.from(response.stderr))
      child.emit('close', response.code === undefined ? 0 : response.code)
    })
    return child
  }
  return { calls, spawn }
}

function shotPath(args) {
  const arg = args.find((value) => value.startsWith('--screenshot='))
  return arg === undefined ? null : arg.slice('--screenshot='.length)
}

test('readPngSize reads IHDR and rejects non-PNG bytes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'market-card-png-'))
  cleanup(t, dir)
  const file = join(dir, 'a.png')
  writeFileSync(file, fakePng(1200, 630))
  assert.deepEqual(readPngSize(file), { width: 1200, height: 630, bytes: fakePng(1200, 630).length })
  assert.equal(readPngSize(Buffer.from('nope')), null)
})

test('browser discovery prefers the override, then PATH, then known locations', () => {
  const env = {
    DSH_MARKET_CARD_BROWSER: 'D:\\custom\\chrome.exe',
    PATH: 'C:\\one;C:\\two',
    ProgramFiles: 'C:\\Program Files',
  }
  const candidates = browserCandidates({ env, platform: 'win32' })
  assert.equal(candidates[0], 'D:\\custom\\chrome.exe')
  assert.ok(candidates.includes('C:\\one\\chrome.exe'))
  assert.ok(candidates.some((value) => value.includes('Edge')))
  assert.equal(findBrowser({ exe: 'D:\\custom\\chrome.exe', env, platform: 'win32', exists: (file) => file === 'D:\\custom\\chrome.exe' }), 'D:\\custom\\chrome.exe')
  assert.equal(findBrowser({ env: {}, platform: 'win32', exists: () => false }), null)
})

test('renderPng measures the page, then captures a PNG at that height', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'market-card-render-'))
  cleanup(t, dir)
  const htmlPath = join(dir, 'card.html')
  const outPng = join(dir, 'card.png')
  writeFileSync(htmlPath, '<html data-card-height="0"></html>')
  const spawned = fakeSpawn((call) => {
    if (call.args.includes('--dump-dom')) return { stdout: '<html data-card-height="1234"><body>x</body></html>', code: 0 }
    writeFileSync(shotPath(call.args), fakePng(1200, 1234))
    return { code: 0 }
  })
  const result = await renderPng({
    htmlPath,
    outPng,
    width: 1200,
    scale: 1,
    browser: 'C:\\fake\\chrome.exe',
    spawn: spawned.spawn,
  })
  assert.equal(result.ok, true)
  assert.equal(result.cssHeight, 1234)
  assert.equal(result.width, 1200)
  assert.equal(result.height, 1234)
  assert.equal(spawned.calls.length, 2)
  const screenshotArgs = spawned.calls[1].args
  assert.ok(screenshotArgs.includes('--window-size=1200,1234'))
  assert.ok(screenshotArgs.includes('--force-device-scale-factor=1'))
  assert.ok(screenshotArgs.some((value) => value.startsWith('--screenshot=')))
  assert.ok(screenshotArgs.some((value) => value.startsWith('--user-data-dir=')))
  assert.ok(screenshotArgs.some((value) => value.startsWith('file:///')))
})

test('scale 2 doubles the device pixel size', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'market-card-render-'))
  cleanup(t, dir)
  const htmlPath = join(dir, 'card.html')
  const outPng = join(dir, 'card.png')
  writeFileSync(htmlPath, '<html></html>')
  const spawned = fakeSpawn((call) => {
    if (call.args.includes('--dump-dom')) return { stdout: '<html data-card-height="900"></html>' }
    writeFileSync(shotPath(call.args), fakePng(2400, 1800))
  })
  const result = await renderPng({ htmlPath, outPng, scale: 2, browser: 'x', spawn: spawned.spawn })
  assert.equal(result.ok, true)
  assert.equal(result.width, 2400)
  assert.equal(result.height, 1800)
  assert.ok(spawned.calls[1].args.includes('--force-device-scale-factor=2'))
})

test('a page without the height marker fails the measure pass, not the screenshot', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'market-card-render-'))
  cleanup(t, dir)
  const htmlPath = join(dir, 'card.html')
  writeFileSync(htmlPath, '<html></html>')
  const spawned = fakeSpawn(() => ({ stdout: '<html></html>' }))
  const result = await renderPng({ htmlPath, outPng: join(dir, 'card.png'), browser: 'x', spawn: spawned.spawn })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'measure-failed')
  assert.equal(spawned.calls.length, 1)
  assert.equal(spawned.calls[0].args[0], '--headless=new')
})

test('missing browser, missing HTML and bad scale are reported, not thrown', async () => {
  const missingBrowser = await renderPng({ htmlPath: 'x.html', outPng: 'x.png', env: {}, platform: 'win32' })
  assert.equal(missingBrowser.code, 'browser-missing')
  const dir = mkdtempSync(join(tmpdir(), 'market-card-render-'))
  const missingHtml = await renderPng({ htmlPath: join(dir, 'nope.html'), outPng: join(dir, 'x.png'), browser: 'x' })
  assert.equal(missingHtml.code, 'html-missing')
  writeFileSync(join(dir, 'card.html'), '<html></html>')
  const badScale = await renderPng({ htmlPath: join(dir, 'card.html'), outPng: join(dir, 'x.png'), browser: 'x', scale: 9 })
  assert.equal(badScale.code, 'bad-scale')
})

test('a browser that exits 0 without writing a PNG is a failure', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'market-card-render-'))
  cleanup(t, dir)
  const htmlPath = join(dir, 'card.html')
  writeFileSync(htmlPath, '<html></html>')
  const spawned = fakeSpawn((call) => {
    if (call.args.includes('--dump-dom')) return { stdout: '<html data-card-height="800"></html>' }
    return { code: 0 }
  })
  const result = await renderPng({ htmlPath, outPng: join(dir, 'card.png'), browser: 'x', spawn: spawned.spawn })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'screenshot-missing')
})

test('a non-zero measure exit carries the stderr tail', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'market-card-render-'))
  cleanup(t, dir)
  const htmlPath = join(dir, 'card.html')
  writeFileSync(htmlPath, '<html></html>')
  const spawned = fakeSpawn(() => ({ code: 1, stderr: 'chrome exploded' }))
  const result = await renderPng({ htmlPath, outPng: join(dir, 'card.png'), browser: 'x', spawn: spawned.spawn })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'measure-failed')
  assert.match(result.stderr, /chrome exploded/)
})
