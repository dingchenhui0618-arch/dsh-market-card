import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { main, parseArgs } from '../src/cli.js'
import { cleanup } from './helpers.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const DEMO = join(ROOT, 'test', 'fixtures', 'demo')
const PARTIAL = join(ROOT, 'test', 'fixtures', 'partial')
const NOW = '2026-10-30T05:00:00.000Z'

function capture() {
  const out = []
  const err = []
  return {
    io: {
      stdout: { write: (chunk) => out.push(String(chunk)) },
      stderr: { write: (chunk) => err.push(String(chunk)) },
    },
    stdout: () => out.join(''),
    stderr: () => err.join(''),
  }
}

function tempOut(t) {
  const dir = mkdtempSync(join(tmpdir(), 'market-card-cli-'))
  cleanup(t, dir)
  return dir
}

test('arg parsing accepts the documented flags and rejects junk', () => {
  const options = parseArgs(['repo', '--out', 'x', '--scale', '1', '--no-png', '--strict', '--json', '--now', NOW])
  assert.equal(options.repo, 'repo')
  assert.equal(options.outDir, 'x')
  assert.equal(options.scale, 1)
  assert.equal(options.png, false)
  assert.equal(options.strict, true)
  assert.equal(options.json, true)
  assert.throws(() => parseArgs(['--scale', '9']), /--scale/)
  assert.throws(() => parseArgs(['--nope']), /unknown option/)
  assert.throws(() => parseArgs(['a', 'b']), /one repository/)
  assert.throws(() => parseArgs(['--out']), /needs a value/)
})

test('--help prints usage and exits 0', async () => {
  const captured = capture()
  assert.equal(await main(['--help'], captured.io), 0)
  assert.match(captured.stdout(), /Usage/)
  assert.match(captured.stdout(), /--strict/)
  assert.equal(captured.stderr(), '')
})

test('a full run writes HTML, Markdown and JSON without touching the browser', async (t) => {
  const out = tempOut(t)
  const captured = capture()
  const code = await main([DEMO, '--out', out, '--no-png', '--now', NOW], captured.io)
  assert.equal(code, 0)
  for (const name of ['card.html', 'card.json', 'card.md']) {
    assert.ok(existsSync(join(out, name)), name + ' exists')
  }
  assert.ok(!existsSync(join(out, 'card.png')))
  assert.match(captured.stdout(), /示例插件 \/ demo-plugin/)
  assert.match(captured.stdout(), /png     skipped/)
  assert.match(captured.stdout(), /fields  complete/)
})

test('--json emits a machine-readable summary', async (t) => {
  const out = tempOut(t)
  const captured = capture()
  assert.equal(await main([DEMO, '--out', out, '--no-png', '--json', '--now', NOW], captured.io), 0)
  const summary = JSON.parse(captured.stdout())
  assert.equal(summary.ok, true)
  assert.equal(summary.repo.name, 'demo-plugin')
  assert.equal(summary.png.code, 'skipped')
  assert.equal(summary.missing.length, 0)
  assert.deepEqual(summary.copy.counts.capabilities, { zh: 2, en: 2 })
})

test('--strict refuses an incomplete card and writes nothing', async (t) => {
  const out = tempOut(t)
  const captured = capture()
  const code = await main([PARTIAL, '--out', out, '--no-png', '--strict'], captured.io)
  assert.equal(code, 2)
  assert.match(captured.stderr(), /missing-fields/)
  assert.match(captured.stderr(), /limitations\.zh/)
  assert.ok(!existsSync(join(out, 'card.html')))
})

test('a missing repository exits 1 with a stable error code', async (t) => {
  const out = tempOut(t)
  const captured = capture()
  const code = await main([join(ROOT, 'does-not-exist'), '--out', out, '--no-png'], captured.io)
  assert.equal(code, 1)
  assert.match(captured.stderr(), /repo-missing/)
})

test('the real bin entrypoint imports the built lib and exits 0', (t) => {
  const out = tempOut(t)
  const result = spawnSync(process.execPath, [join(ROOT, 'bin', 'market-card.mjs'), DEMO, '--out', out, '--no-png', '--now', NOW], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /dsh-market-card/)
  assert.ok(existsSync(join(out, 'card.html')))
  const html = readFileSync(join(out, 'card.html'), 'utf8')
  assert.match(html, /示例插件/)
})
