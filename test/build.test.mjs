import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { TOOL_VERSION } from '../src/card.js'

const ROOT = join(import.meta.dirname, '..')
const read = (file) => readFileSync(join(ROOT, file), 'utf8')

test('lib/ is the built copy of src/ (run node scripts/build.mjs after editing src)', () => {
  for (const [source, built] of [
    ['src/host.js', 'lib/index.js'],
    ['src/card.js', 'lib/card.js'],
    ['src/image.js', 'lib/image.js'],
    ['src/browser.js', 'lib/browser.js'],
    ['src/generate.js', 'lib/generate.js'],
    ['src/cli.js', 'lib/cli.js'],
  ]) {
    assert.ok(existsSync(join(ROOT, built)), built + ' is missing — run node scripts/build.mjs')
    assert.equal(read(built), read(source), built + ' is stale — run node scripts/build.mjs')
  }
})

test('the host build exports the plugin contract', async () => {
  const host = await import('../lib/index.js')
  assert.equal(host.name, 'dsh-market-card')
  assert.equal(typeof host.apply, 'function')
  assert.deepEqual(host.inject, ['webServer'])
})

test('the client bundle compiles, registers the tab and inlines the stylesheet', () => {
  const bundle = read('lib/client.js')
  assert.ok(!bundle.includes("require('./client-css.cjs')"), 'CSS require must be inlined')
  assert.match(bundle, /window\.__ModuleLoader__\.load\(\{/)
  assert.match(bundle, /id: "dsh-market-card"/)
  assert.match(bundle, /conversation\.view/)
  assert.match(bundle, /label: '市场卡片'/)
  assert.match(bundle, /\.mc-root\{/)
  assert.doesNotThrow(() => new Function(bundle))
})

test('package.json declares the bundle, client half and no runtime dependencies', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.name, 'dsh-market-card')
  assert.equal(pkg.version, TOOL_VERSION)
  assert.equal(Object.keys(pkg.dependencies || {}).length, 0)
  assert.equal(Object.keys(pkg.devDependencies || {}).length, 0)
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.ok(existsSync(join(ROOT, pkg.dsh.bundle.patch)))
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(Array.isArray(pkg.dsh.client.inject) && pkg.dsh.client.inject.length > 0)
  assert.match(pkg.description, /市场卡片/)
})

test('the bin shim points at the built CLI, not at src/', () => {
  const shim = read('bin/market-card.mjs')
  assert.match(shim, /from '\.\.\/lib\/cli\.js'/)
  assert.match(shim, /^#!\/usr\/bin\/env node/)
})
