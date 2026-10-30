// Host half of dsh-market-card.
//
// One prefix route, `/dsh-market-card`, serves the panel's state API, runs a
// generation on demand, and returns the generated artifacts. The panel is the
// disposable half: if the route cannot be registered the plugin stays loaded
// without it instead of aborting the whole client graph.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { CardError, TOOL_NAME, TOOL_VERSION } from './card.js'
import { findBrowser, renderPng } from './browser.js'
import { generateCard, summarize } from './generate.js'

export const name = 'dsh-market-card'
export const inject = ['webServer']

const MAX_BODY = 256 * 1024

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(body))
}

function sendText(res, status, text) {
  res.statusCode = status
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(text)
}

function readBody(req) {
  return new Promise((resolvePromise) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > MAX_BODY) req.destroy()
    })
    req.on('end', () => {
      if (raw.length === 0) return resolvePromise({})
      try {
        const parsed = JSON.parse(raw)
        resolvePromise(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {})
      } catch (error) {
        resolvePromise({})
      }
    })
    req.on('error', () => resolvePromise({}))
  })
}

function methodFromUrl(url) {
  const path = String(url || '').split('?')[0]
  const rest = path.replace(/^\/dsh-market-card\/?/, '')
  return rest.length > 0 ? rest : 'state'
}

function inside(parent, child) {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function browserInfo(settings) {
  const explicit = typeof settings.browserPath === 'string' ? settings.browserPath : undefined
  const pick = typeof settings.findBrowser === 'function' ? settings.findBrowser : findBrowser
  let found = null
  try {
    found = pick({ exe: explicit })
  } catch (error) {
    found = null
  }
  if (typeof found !== 'string' || found.length === 0) return { found: false, path: null, name: null }
  // The configured browser may be a Windows path even when the host runs on
  // Linux (tests do exactly that), so split on both separators.
  const name = found.split(/[\\/]/).filter((part) => part.length > 0).pop() || null
  return { found: true, path: found, name: name }
}

function contentType(file) {
  if (file.endsWith('.png')) return 'image/png'
  if (file.endsWith('.html')) return 'text/html; charset=utf-8'
  if (file.endsWith('.json')) return 'application/json; charset=utf-8'
  if (file.endsWith('.md')) return 'text/markdown; charset=utf-8'
  return 'application/octet-stream'
}

function sendFile(res, file) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    sendText(res, 404, 'not generated yet')
    return
  }
  try {
    const body = readFileSync(file)
    res.statusCode = 200
    res.setHeader('content-type', contentType(file))
    res.setHeader('cache-control', 'no-store')
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader('content-length', body.length)
    res.end(body)
  } catch (error) {
    sendText(res, 500, 'cannot read artifact: ' + String((error && error.message) || error))
  }
}

export function apply(ctx, config) {
  const settings = config && typeof config === 'object' ? config : {}
  const state = {
    repo: typeof settings.repoRoot === 'string' && settings.repoRoot.length > 0 ? resolve(settings.repoRoot) : process.cwd(),
    outDir: typeof settings.outDir === 'string' && settings.outDir.length > 0 ? resolve(settings.outDir) : null,
    last: null,
    error: null,
    generating: false,
    generations: 0,
  }

  function artifactUrl(name) {
    return '/dsh-market-card/' + name
  }

  function statePayload() {
    const outDir = state.last !== null ? state.last.outDir : state.outDir || join(state.repo, 'dist')
    const files = state.last !== null ? state.last.files : {
      outDir,
      html: join(outDir, 'card.html'),
      png: join(outDir, 'card.png'),
      json: join(outDir, 'card.json'),
      markdown: join(outDir, 'card.md'),
    }
    return {
      ok: true,
      tool: { name: TOOL_NAME, version: TOOL_VERSION },
      repo: state.repo,
      outDir,
      generating: state.generating,
      generations: state.generations,
      error: state.error,
      browser: browserInfo(settings),
      defaults: {
        repoRoot: typeof settings.repoRoot === 'string' ? settings.repoRoot : null,
        scale: typeof settings.scale === 'number' ? settings.scale : 2,
      },
      artifacts: {
        html: artifactUrl('card.html'),
        png: artifactUrl('card.png'),
        json: artifactUrl('card.json'),
        markdown: artifactUrl('card.md'),
      },
      files,
      exists: {
        html: typeof files.html === 'string' && existsSync(files.html),
        png: typeof files.png === 'string' && existsSync(files.png),
        json: typeof files.json === 'string' && existsSync(files.json),
        markdown: typeof files.markdown === 'string' && existsSync(files.markdown),
      },
      summary: state.last,
    }
  }

  function failureStatus(code) {
    if (code === 'missing-fields') return 422
    if (['repo-missing', 'readme-missing', 'config-missing', 'config-invalid', 'bad-out-dir', 'bad-repo'].includes(code)) return 400
    return 500
  }

  async function generate(body) {
    if (state.generating) {
      return { status: 409, body: { ok: false, error: { code: 'busy', message: 'a generation is already running' } } }
    }
    const repoInput = typeof body.repo === 'string' && body.repo.trim().length > 0 ? body.repo.trim() : state.repo
    const repo = resolve(repoInput)
    if (!existsSync(repo) || !statSync(repo).isDirectory()) {
      return { status: 400, body: { ok: false, error: { code: 'bad-repo', message: 'not a directory: ' + repo } } }
    }
    if (!existsSync(join(repo, 'README.md')) && !existsSync(join(repo, 'readme.md'))) {
      return { status: 400, body: { ok: false, error: { code: 'readme-missing', message: 'README.md not found in ' + repo } } }
    }
    let outDir
    if (typeof body.outDir === 'string' && body.outDir.trim().length > 0) {
      outDir = resolve(repo, body.outDir.trim())
      if (!inside(repo, outDir)) {
        return { status: 400, body: { ok: false, error: { code: 'bad-out-dir', message: 'output directory must stay inside the repository' } } }
      }
    } else if (state.outDir !== null) {
      outDir = state.outDir
    } else {
      outDir = join(repo, 'dist')
    }

    state.generating = true
    state.error = null
    try {
      const result = await generateCard({
        repo,
        outDir,
        configPath: typeof body.configPath === 'string' && body.configPath.length > 0 ? body.configPath : undefined,
        png: body.png !== false,
        scale: typeof settings.scale === 'number' ? settings.scale : 2,
        browser: typeof settings.browserPath === 'string' ? settings.browserPath : undefined,
        renderPng: typeof settings.renderPng === 'function' ? settings.renderPng : renderPng,
        env: settings.env,
        platform: settings.platform,
      })
      state.last = summarize(result)
      state.last.outDir = outDir
      state.repo = repo
      state.outDir = outDir
      state.generations += 1
      return { status: 200, body: { ok: true, ...statePayload(), result: state.last } }
    } catch (error) {
      const code = error instanceof CardError ? error.code : 'generate-failed'
      const message = String((error && error.message) || error)
      state.error = { code, message, at: new Date().toISOString() }
      return {
        status: failureStatus(code),
        body: {
          ok: false,
          error: { code, message },
          missing: error instanceof CardError && error.detail ? error.detail.missing : undefined,
        },
      }
    } finally {
      state.generating = false
    }
  }

  ctx.effect(function () {
    let disposeRoute
    try {
      disposeRoute = ctx.webServer.register({
        kind: 'prefix',
        path: '/dsh-market-card',
        handler: async function (req, res) {
          try {
            const method = methodFromUrl(req.url)
            if (req.method === 'GET' || req.method === 'HEAD') {
              if (method === 'state' || method === '') {
                sendJson(res, 200, statePayload())
                return
              }
              if (method === 'card.html' || method === 'card.png' || method === 'card.json' || method === 'card.md') {
                const outDir = state.last !== null ? state.last.outDir : state.outDir
                if (typeof outDir !== 'string') {
                  sendText(res, 404, 'generate a card first')
                  return
                }
                sendFile(res, join(outDir, method))
                return
              }
              sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown method: ' + method } })
              return
            }
            if (req.method !== 'POST') {
              sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'use GET or POST' } })
              return
            }
            const body = await readBody(req)
            if (method === 'generate') {
              const result = await generate(body)
              sendJson(res, result.status, result.body)
              return
            }
            sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown method: ' + method } })
          } catch (error) {
            sendJson(res, 500, { ok: false, error: { code: 'internal', message: String((error && error.message) || error) } })
          }
        },
      })
    } catch (error) {
      disposeRoute = undefined
    }
    return function () {
      if (typeof disposeRoute === 'function') disposeRoute()
    }
  })
}
