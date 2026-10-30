// One code path for the CLI and the plugin: build the model, write the three
// text artifacts, then (optionally) render the PNG.

import { existsSync, rmSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { CardError, buildModel, renderHtml, renderMarkdown } from './card.js'
import { renderPng as defaultRenderPng } from './browser.js'

export const DEFAULT_SCALE = 2

export async function generateCard(options = {}) {
  const repoDir = resolve(options.repo || '.')
  const outDir = resolve(options.outDir || join(repoDir, 'dist'))
  if (!existsSync(repoDir)) throw new CardError('repo-missing', 'repository directory not found: ' + repoDir)
  const png = options.png !== false
  const scale = options.scale === undefined ? DEFAULT_SCALE : options.scale

  const htmlPath = join(outDir, 'card.html')
  const pngPath = join(outDir, 'card.png')
  const jsonPath = join(outDir, 'card.json')
  const markdownPath = join(outDir, 'card.md')

  const model = buildModel(repoDir, {
    configPath: options.configPath,
    now: options.now,
    commit: options.commit,
    excludeScreenshots: [pngPath, ...(options.excludeScreenshots || [])],
  })

  if (options.strict === true && model.missing.length > 0) {
    throw new CardError(
      'missing-fields',
      'card is incomplete: ' + model.missing.map((field) => field.key).join(', '),
      { missing: model.missing },
    )
  }

  await mkdir(outDir, { recursive: true })
  const html = renderHtml(model)
  await writeFile(htmlPath, html, 'utf8')
  await writeFile(jsonPath, JSON.stringify(model, null, 2) + '\n', 'utf8')
  await writeFile(markdownPath, renderMarkdown(model, { imageName: 'card.png' }), 'utf8')

  let pngResult
  if (!png) {
    pngResult = { ok: false, code: 'skipped', message: 'PNG output disabled (--no-png)' }
  } else {
    // Never leave a stale PNG next to a freshly rendered HTML file.
    try {
      rmSync(pngPath, { force: true })
    } catch (error) {
      // A locked file will fail the render below with a clearer message.
    }
    const renderPng = typeof options.renderPng === 'function' ? options.renderPng : defaultRenderPng
    pngResult = await renderPng({
      htmlPath,
      outPng: pngPath,
      width: 1200,
      scale,
      browser: options.browser,
      timeoutMs: options.timeoutMs,
      env: options.env,
      platform: options.platform,
      spawn: options.spawn,
    })
  }

  return {
    model,
    files: {
      outDir,
      html: htmlPath,
      png: png ? pngPath : null,
      json: jsonPath,
      markdown: markdownPath,
    },
    png: pngResult,
    missing: model.missing,
  }
}

/** A compact, JSON-safe summary for --json, the host route and the panel. */
export function summarize(result) {
  return {
    ok: true,
    repo: {
      name: result.model.repo.name,
      url: result.model.repo.url,
      version: result.model.repo.version,
      license: result.model.repo.license,
    },
    outDir: result.files.outDir,
    files: result.files,
    png: result.png,
    missing: result.missing,
    warnings: result.model.warnings,
    copy: {
      title: result.model.copy.title,
      tagline: result.model.copy.tagline,
      install: result.model.copy.install,
      counts: result.model.counts,
    },
    source: result.model.source,
  }
}
