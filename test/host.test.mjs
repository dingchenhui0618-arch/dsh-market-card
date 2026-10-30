import { strict as assert } from 'node:assert'
import { EventEmitter } from 'node:events'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../src/host.js'
import { cleanup, fakePng, makeRepo } from './helpers.mjs'

function stubRenderPng() {
  return async function render({ outPng, scale = 1 }) {
    writeFileSync(outPng, fakePng(1200 * scale, 1234 * scale))
    return {
      ok: true,
      path: outPng,
      cssWidth: 1200,
      cssHeight: 1234,
      width: 1200 * scale,
      height: 1234 * scale,
      bytes: fakePng(1200 * scale, 1234 * scale).length,
      scale,
      browser: 'stub',
      ms: 1,
    }
  }
}

function setup(t, options = {}) {
  const dir = options.repo || makeRepo()
  cleanup(t, dir)
  const routes = []
  const disposers = []
  const webServer = {
    register(route) {
      if (options.registerThrows === true) throw new Error('webServer is unavailable')
      routes.push(route)
      return function () {
        const index = routes.indexOf(route)
        if (index >= 0) routes.splice(index, 1)
      }
    },
  }
  const ctx = {
    webServer,
    effect(fn) {
      const dispose = fn()
      disposers.push(typeof dispose === 'function' ? dispose : function () {})
      return dispose
    },
    get() {
      return undefined
    },
  }
  apply(ctx, {
    repoRoot: dir,
    renderPng: options.renderPng || stubRenderPng(),
    findBrowser: options.findBrowser || (() => 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'),
    scale: 1,
    ...options.config,
  })
  return {
    dir,
    routes,
    dispose() {
      const pending = disposers.splice(0)
      for (const dispose of pending) dispose()
    },
  }
}

function call(routes, method, url, body) {
  return new Promise((resolvePromise, reject) => {
    const route = routes[0]
    assert.ok(route, 'route is registered')
    const req = new EventEmitter()
    req.method = method
    req.url = url
    req.destroy = function () {}
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = String(value)
      },
      end(chunk) {
        const body = chunk === undefined ? Buffer.alloc(0) : Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
        resolvePromise({ status: this.statusCode, headers: this.headers, body })
      },
    }
    Promise.resolve(route.handler(req, res)).catch(reject)
    process.nextTick(() => {
      if (body !== undefined) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))
      req.emit('end')
    })
  })
}

function json(response) {
  return JSON.parse(response.body.toString('utf8'))
}

test('GET /state reports the repository, browser and artifact URLs before any run', async (t) => {
  const host = setup(t)
  const response = await call(host.routes, 'GET', '/dsh-market-card/state')
  assert.equal(response.status, 200)
  const state = json(response)
  assert.equal(state.ok, true)
  assert.equal(state.repo, host.dir)
  assert.equal(state.browser.found, true)
  assert.equal(state.browser.name, 'chrome.exe')
  assert.equal(state.exists.html, false)
  assert.equal(state.artifacts.png, '/dsh-market-card/card.png')
  assert.equal(state.generating, false)
})

test('POST /generate writes all four artifacts and serves them back', async (t) => {
  const host = setup(t)
  const generated = await call(host.routes, 'POST', '/dsh-market-card/generate', { repo: host.dir })
  assert.equal(generated.status, 200)
  const payload = json(generated)
  assert.equal(payload.ok, true)
  assert.equal(payload.result.missing.length, 0)
  assert.equal(payload.result.png.ok, true)
  assert.equal(payload.result.png.width, 1200)

  for (const name of ['card.html', 'card.png', 'card.json', 'card.md']) {
    assert.ok(existsSync(join(host.dir, 'dist', name)), name + ' was written')
  }
  const html = readFileSync(join(host.dir, 'dist', 'card.html'), 'utf8')
  assert.match(html, /示例插件/)
  assert.match(html, /data:image\/png;base64,/)

  const png = await call(host.routes, 'GET', '/dsh-market-card/card.png')
  assert.equal(png.status, 200)
  assert.equal(png.headers['content-type'], 'image/png')
  assert.equal(png.body.subarray(1, 4).toString('ascii'), 'PNG')

  const page = await call(host.routes, 'GET', '/dsh-market-card/card.html')
  assert.equal(page.status, 200)
  assert.match(page.headers['content-type'], /text\/html/)
  assert.match(page.body.toString('utf8'), /<!doctype html>/)

  const report = await call(host.routes, 'GET', '/dsh-market-card/card.json')
  assert.equal(json(report).repo.name, 'demo-plugin')

  const markdown = await call(host.routes, 'GET', '/dsh-market-card/card.md')
  assert.match(markdown.body.toString('utf8'), /!\[示例插件/)
})

test('a repository without README.md is refused with 400', async (t) => {
  const dir = makeRepo()
  cleanup(t, dir)
  rmSync(join(dir, 'README.md'))
  const host = setup(t, { repo: dir })
  const empty = await call(host.routes, 'POST', '/dsh-market-card/generate', { repo: dir })
  assert.equal(empty.status, 400)
  assert.equal(json(empty).error.code, 'readme-missing')
  const bad = await call(host.routes, 'POST', '/dsh-market-card/generate', { repo: join(dir, 'package.json') })
  assert.equal(bad.status, 400)
  assert.equal(json(bad).error.code, 'bad-repo')
})

test('an output directory outside the repository is refused', async (t) => {
  const host = setup(t)
  const response = await call(host.routes, 'POST', '/dsh-market-card/generate', { repo: host.dir, outDir: '../elsewhere' })
  assert.equal(response.status, 400)
  assert.equal(json(response).error.code, 'bad-out-dir')
})

test('an incomplete repository still renders, but the result says it is a draft', async (t) => {
  const dir = makeRepo('partial')
  const host = setup(t, { repo: dir, config: { repoRoot: dir } })
  const response = await call(host.routes, 'POST', '/dsh-market-card/generate', { repo: dir })
  assert.equal(response.status, 200)
  const payload = json(response)
  assert.ok(payload.result.missing.length > 0)
  const html = readFileSync(join(dir, 'dist', 'card.html'), 'utf8')
  assert.match(html, /Draft · 待补字段/)
})

test('a PNG failure keeps the HTML result and reports the reason', async (t) => {
  const host = setup(t, {
    renderPng: async () => ({ ok: false, code: 'browser-missing', message: 'no browser' }),
  })
  const response = await call(host.routes, 'POST', '/dsh-market-card/generate', { repo: host.dir })
  assert.equal(response.status, 200)
  const payload = json(response)
  assert.equal(payload.result.png.ok, false)
  assert.equal(payload.result.png.code, 'browser-missing')
  assert.ok(existsSync(join(host.dir, 'dist', 'card.html')))
})

test('unknown methods and verbs get 404/405', async (t) => {
  const host = setup(t)
  assert.equal((await call(host.routes, 'GET', '/dsh-market-card/nope')).status, 404)
  assert.equal((await call(host.routes, 'PUT', '/dsh-market-card/state')).status, 405)
})

test('artifacts are 404 until something has been generated', async (t) => {
  const host = setup(t)
  const response = await call(host.routes, 'GET', '/dsh-market-card/card.png')
  assert.equal(response.status, 404)
})

test('unloading disposes the route, and a missing webServer is tolerated', async (t) => {
  const host = setup(t)
  assert.equal(host.routes.length, 1)
  host.dispose()
  assert.equal(host.routes.length, 0)
  const blind = setup(t, { registerThrows: true })
  assert.equal(blind.routes.length, 0)
})

test('a second generate while one is running returns 409', async (t) => {
  let release
  let entered
  const started = new Promise((resolve) => { entered = resolve })
  const gate = new Promise((resolve) => { release = resolve })
  const host = setup(t, {
    renderPng: async ({ outPng }) => {
      entered()
      await gate
      writeFileSync(outPng, fakePng(1200, 100))
      return { ok: true, width: 1200, height: 100, bytes: 45, cssHeight: 100, scale: 1, browser: 'stub', ms: 1 }
    },
  })
  const first = call(host.routes, 'POST', '/dsh-market-card/generate', { repo: host.dir })
  await started
  const second = await call(host.routes, 'POST', '/dsh-market-card/generate', { repo: host.dir })
  assert.equal(second.status, 409)
  assert.equal(json(second).error.code, 'busy')
  release()
  assert.equal((await first).status, 200)
})
