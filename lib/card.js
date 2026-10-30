// Core of dsh-market-card: turn a repository's own files into a card model,
// then render that model as one self-contained HTML document, a Markdown
// snippet for a marketplace PR, and a machine-readable report.
//
// The rule this file exists to enforce: every piece of copy on the card comes
// from a file in the repository or from an explicit market-card.json override.
// Nothing is generated, translated or embellished here. A field the repository
// does not declare is reported as missing, and (with --strict) stops the build.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'
import { imageMeta, isImagePath, mimeForPath } from './image.js'

export const TOOL_NAME = 'dsh-market-card'
export const TOOL_VERSION = '0.1.0'
export const CARD_WIDTH = 1200
export const MAX_SCREENSHOTS = 4
export const MAX_BULLETS = 4

export const REQUIRED_FIELDS = [
  { key: 'title.zh', zh: '中文标题', en: 'Chinese title' },
  { key: 'title.en', zh: '英文标题', en: 'English title' },
  { key: 'tagline.zh', zh: '中文一句话', en: 'Chinese tagline' },
  { key: 'tagline.en', zh: '英文一句话', en: 'English tagline' },
  { key: 'install', zh: '安装命令', en: 'install command' },
  { key: 'screenshots', zh: '至少一张截图', en: 'at least one screenshot' },
  { key: 'capabilities.zh', zh: '中文能力条目', en: 'Chinese capabilities' },
  { key: 'capabilities.en', zh: '英文能力条目', en: 'English capabilities' },
  { key: 'limitations.zh', zh: '中文限制条目', en: 'Chinese limitations' },
  { key: 'limitations.en', zh: '英文限制条目', en: 'English limitations' },
]

const CAPABILITY_HEADING = /(能力|特性|功能|亮点|features?|capabilities|what it does|highlights)/i
const LIMITATION_HEADING = /(限制|局限|边界|不做|不适用|注意|limitations?|not for|what it (?:does not|doesn't) do|scope|caveats?)/i
const INSTALL_HINT = /\bdsh\s+plugin\b|\bnpm\s+(?:i|install)\b|\bpnpm\s+(?:add|i)\b|\bnpx\s+|\byarn\s+add\b/
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/

export class CardError extends Error {
  constructor(code, message, detail) {
    super(message)
    this.name = 'CardError'
    this.code = code
    if (detail !== undefined) this.detail = detail
  }
}

export function hasCjk(text) {
  return CJK.test(String(text))
}

export function toPosix(file) {
  return String(file).split('\\').join('/')
}

/** Strip the inline Markdown the card layout cannot render. */
export function stripInline(text) {
  return String(text)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1$2')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\\([\\`*_{}\[\]()#+\-.!])/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(text, max) {
  const value = String(text || '').trim()
  if (value.length <= max) return value
  return value.slice(0, Math.max(0, max - 1)).trimEnd() + '…'
}

// ---------------------------------------------------------------------------
// Markdown parsing (headings, paragraphs, bullet lists, fenced code, images)
// ---------------------------------------------------------------------------

export function parseMarkdown(text) {
  const lines = String(text).split(/\r?\n/)
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*$/.test(line)) {
      i += 1
      continue
    }
    let match = /^(#{1,6})\s+(.*)$/.exec(line)
    if (match) {
      blocks.push({ kind: 'heading', level: match[1].length, text: match[2].trim(), line: i + 1 })
      i += 1
      continue
    }
    if (/^\s*(```|~~~)/.test(line)) {
      const fence = line.trim().slice(0, 3)
      const body = []
      const start = i + 2
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith(fence)) {
        body.push(lines[i])
        i += 1
      }
      i += 1
      blocks.push({ kind: 'code', text: body.join('\n'), line: start })
      continue
    }
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
      const items = []
      const start = i + 1
      while (i < lines.length) {
        const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(lines[i])
        if (!item) break
        items.push({ text: item[1].trim(), line: i + 1 })
        i += 1
      }
      blocks.push({ kind: 'list', items, line: start })
      continue
    }
    if (/^\s*\|/.test(line)) {
      while (i < lines.length && /^\s*\|/.test(lines[i])) i += 1
      continue
    }
    if (/^\s*>/.test(line)) {
      const body = []
      const start = i + 1
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push({ kind: 'quote', text: body.join('\n').trim(), line: start })
      continue
    }
    const start = i + 1
    const parts = [line.trim()]
    i += 1
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,6}\s|```|~~~|\s*(?:[-*+]|\d+[.)])\s+|>|\s*\|)/.test(lines[i])
    ) {
      parts.push(lines[i].trim())
      i += 1
    }
    blocks.push({ kind: 'paragraph', text: parts.join(' '), line: start })
  }
  return blocks
}

function sectionsOf(blocks) {
  const sections = []
  for (let i = 0; i < blocks.length; i += 1) {
    const heading = blocks[i]
    if (heading.kind !== 'heading') continue
    const content = []
    for (let j = i + 1; j < blocks.length; j += 1) {
      const next = blocks[j]
      if (next.kind === 'heading' && next.level <= heading.level) break
      if (next.kind !== 'heading') content.push(next)
    }
    sections.push({ heading: heading.text, level: heading.level, line: heading.line, blocks: content })
  }
  return sections
}

function afterFirstHeading(blocks) {
  const index = blocks.findIndex((block) => block.kind === 'heading' && block.level === 1)
  if (index < 0) return []
  const out = []
  for (let i = index + 1; i < blocks.length; i += 1) {
    if (blocks[i].kind === 'heading') break
    out.push(blocks[i])
  }
  return out
}

function cleanRun(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\$|>|PS>)\s*/, '').trim())
    .filter((line) => line.length > 0 && !/^#/.test(line) && !/^\/\//.test(line))
}

function installFrom(blocks) {
  let best = null
  for (const block of blocks) {
    if (block.kind !== 'code') continue
    const lines = cleanRun(block.text)
    const scored = lines.filter((line) => INSTALL_HINT.test(line))
    if (scored.length === 0) continue
    const score = /dsh\s+plugin/.test(scored[0]) ? 3 : 2
    if (best === null || score > best.score) best = { lines: scored.slice(0, 2), score, line: block.line }
  }
  return best
}

function bulletsFrom(sections, matcher) {
  const seen = new Set()
  const out = []
  for (const section of sections) {
    if (!matcher.test(section.heading)) continue
    for (const block of section.blocks) {
      if (block.kind !== 'list') continue
      for (const item of block.items) {
        const text = stripInline(item.text)
        if (text.length < 3 || seen.has(text)) continue
        seen.add(text)
        out.push({ text, line: item.line, heading: stripInline(section.heading) })
      }
    }
  }
  return out
}

function splitByLanguage(items) {
  const zh = []
  const en = []
  for (const item of items) {
    if (hasCjk(item.text)) zh.push(item)
    else en.push(item)
  }
  return { zh, en }
}

// ---------------------------------------------------------------------------
// Repository inputs
// ---------------------------------------------------------------------------

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function findReadme(repo) {
  const entries = readdirSync(repo)
  const hit = entries.find((name) => /^readme\.md$/i.test(name))
  return hit === undefined ? null : join(repo, hit)
}

function gitOutput(repo, args) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      windowsHide: true,
    }).trim()
  } catch (error) {
    return null
  }
}

export function cleanRepoUrl(raw) {
  if (raw === undefined || raw === null) return null
  let value = String(raw).trim()
  value = value.replace(/^git\+/, '')
  value = value.replace(/^git:\/\/github\.com\//, 'https://github.com/')
  value = value.replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
  value = value.replace(/^git@github\.com:/, 'https://github.com/')
  value = value.replace(/\.git$/, '')
  return /^https?:\/\/[^\s]+$/i.test(value) ? value : null
}

function loadConfig(repo, configPath) {
  const explicit = typeof configPath === 'string' && configPath.length > 0
  const file = explicit ? resolve(configPath) : join(repo, 'market-card.json')
  if (!existsSync(file)) {
    if (explicit) throw new CardError('config-missing', 'market-card config not found: ' + file)
    return { data: {}, file: null }
  }
  let data
  try {
    data = readJson(file)
  } catch (error) {
    throw new CardError('config-invalid', 'market-card config is not valid JSON: ' + file, error.message)
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new CardError('config-invalid', 'market-card config must be a JSON object: ' + file)
  }
  return { data, file }
}

function pickCopy(block, key) {
  if (block === undefined || block === null || typeof block !== 'object') return undefined
  const value = block[key]
  if (typeof value !== 'string') return undefined
  const text = stripInline(value).trim()
  return text.length > 0 ? text : undefined
}

function bulletList(value) {
  if (!Array.isArray(value)) return null
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => stripInline(item))
    .filter((item) => item.length > 0)
}

function normalizeCaption(value) {
  if (typeof value === 'string' && value.trim().length > 0) {
    const text = stripInline(value)
    return { zh: text, en: text }
  }
  if (value !== null && typeof value === 'object') {
    const zh = pickCopy(value, 'zh')
    const en = pickCopy(value, 'en')
    if (zh !== undefined || en !== undefined) return { zh: zh ?? null, en: en ?? null }
  }
  return null
}

function walkImages(dir, depth) {
  if (!existsSync(dir) || depth < 0) return []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    return []
  }
  const out = []
  for (const entry of entries) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue
      out.push(...walkImages(file, depth - 1))
    } else if (entry.isFile() && isImagePath(file)) {
      out.push(file)
    }
  }
  return out.sort()
}

function collectScreenshots(repo, blocks, config, options) {
  const warnings = []
  const excluded = new Set((options.excludeScreenshots || []).map((file) => resolve(file)))
  const explicit = Array.isArray(config.screenshots) ? config.screenshots : null
  const candidates = []
  const seen = new Set()

  function add(file, caption, alt) {
    const abs = resolve(file)
    if (seen.has(abs) || excluded.has(abs)) return
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      warnings.push({ code: 'screenshot-missing', path: toPosix(relative(repo, abs)) })
      return
    }
    if (!isImagePath(abs)) {
      warnings.push({ code: 'screenshot-unsupported', path: toPosix(relative(repo, abs)) })
      return
    }
    const bytes = statSync(abs).size
    const meta = imageMeta(readFileSync(abs))
    if (meta === null) {
      warnings.push({ code: 'screenshot-unreadable', path: toPosix(relative(repo, abs)) })
      return
    }
    if (bytes < 2048 || meta.width < 240 || meta.height < 120) {
      warnings.push({ code: 'screenshot-too-small', path: toPosix(relative(repo, abs)), width: meta.width, height: meta.height })
      return
    }
    seen.add(abs)
    candidates.push({
      file: toPosix(relative(repo, abs)),
      abs,
      mime: mimeForPath(abs),
      width: meta.width,
      height: meta.height,
      bytes,
      caption,
      alt: typeof alt === 'string' && alt.trim().length > 0 ? stripInline(alt) : null,
    })
  }

  if (explicit !== null) {
    for (const entry of explicit) {
      if (typeof entry === 'string') add(resolve(repo, entry), null, null)
      else if (entry !== null && typeof entry === 'object' && typeof entry.path === 'string') {
        add(resolve(repo, entry.path), normalizeCaption(entry.caption), pickCopy(entry, 'alt') ?? null)
      }
    }
  } else {
    // Images the README already refers to, in reading order.
    for (const block of blocks) {
      if (block.kind !== 'paragraph' && block.kind !== 'quote') continue
      const pattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
      let match
      while ((match = pattern.exec(block.text)) !== null) {
        const target = match[2].replace(/^<|>$/g, '')
        if (/^(?:https?:|data:)/i.test(target)) continue
        add(resolve(repo, decodeURIComponent(target.split('#')[0])), null, match[1])
      }
    }
    // Then every image under docs/, which is the convention for plugin shots.
    for (const file of walkImages(join(repo, 'docs'), 3)) add(file, null, null)
  }

  return { list: candidates.slice(0, options.maxScreenshots || MAX_SCREENSHOTS), warnings }
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export function buildModel(repoDir, options = {}) {
  const repo = resolve(repoDir)
  if (!existsSync(repo)) throw new CardError('repo-missing', 'repository directory not found: ' + repo)
  if (!statSync(repo).isDirectory()) throw new CardError('repo-missing', 'not a directory: ' + repo)

  const readmePath = findReadme(repo)
  if (readmePath === null) throw new CardError('readme-missing', 'README.md not found in ' + repo)

  const pkgPath = join(repo, 'package.json')
  let pkg = {}
  if (existsSync(pkgPath)) {
    try {
      pkg = readJson(pkgPath)
    } catch (error) {
      throw new CardError('package-invalid', 'package.json is not valid JSON: ' + pkgPath, error.message)
    }
  }

  const readme = readFileSync(readmePath, 'utf8')
  const blocks = parseMarkdown(readme)
  const sections = sectionsOf(blocks)
  const config = loadConfig(repo, options.configPath)
  const overrides = config.data
  const warnings = []

  const h1 = blocks.find((block) => block.kind === 'heading' && block.level === 1)
  const intro = afterFirstHeading(blocks)
  // Badge rows are paragraphs too; they must not shadow the first real sentence.
  const introParagraphs = intro.filter((block) => block.kind === 'paragraph' && !/^\s*\[!\[/.test(block.text))
  const firstParagraph = introParagraphs[0]
  const boldMatch = firstParagraph === undefined ? null : /\*\*([^*]+)\*\*/.exec(firstParagraph.text)
  const boldText = boldMatch === null ? null : stripInline(boldMatch[1])

  const configTitle = overrides.title !== null && typeof overrides.title === 'object' ? overrides.title : {}
  const configTagline = overrides.tagline !== null && typeof overrides.tagline === 'object' ? overrides.tagline : {}

  const titleZh = pickCopy(configTitle, 'zh') ?? (boldText !== null && hasCjk(boldText) ? boldText : null) ?? (h1 !== undefined && hasCjk(h1.text) ? stripInline(h1.text) : null)
  const titleEn = pickCopy(configTitle, 'en') ?? (h1 !== undefined && !hasCjk(h1.text) ? stripInline(h1.text) : null) ?? (typeof pkg.name === 'string' ? pkg.name : null)

  const zhParagraph = introParagraphs.find((block) => hasCjk(block.text))
  const enParagraph = introParagraphs.find((block) => !hasCjk(block.text))
  const descriptionEn = typeof pkg.description === 'string' && pkg.description.length > 0 && !hasCjk(pkg.description) ? stripInline(pkg.description) : null

  const taglineZh = pickCopy(configTagline, 'zh') ?? (zhParagraph === undefined ? null : truncate(stripInline(zhParagraph.text), 240))
  const taglineEn = pickCopy(configTagline, 'en') ?? (enParagraph === undefined ? descriptionEn : truncate(stripInline(enParagraph.text), 300))

  const install = installFrom(blocks)
  const configInstall = typeof overrides.install === 'string' ? cleanRun(overrides.install) : []
  const installLines = configInstall.length > 0 ? configInstall.slice(0, 2) : install === null ? [] : install.lines

  const capabilityItems = bulletsFrom(sections, CAPABILITY_HEADING)
  const limitationItems = bulletsFrom(sections, LIMITATION_HEADING)
  const capabilitySplit = splitByLanguage(capabilityItems)
  const limitationSplit = splitByLanguage(limitationItems)

  const configCapabilities = overrides.capabilities !== null && typeof overrides.capabilities === 'object' ? overrides.capabilities : {}
  const configLimitations = overrides.limitations !== null && typeof overrides.limitations === 'object' ? overrides.limitations : {}

  const capabilities = {
    zh: bulletList(configCapabilities.zh) ?? capabilitySplit.zh.map((item) => item.text),
    en: bulletList(configCapabilities.en) ?? capabilitySplit.en.map((item) => item.text),
  }
  const limitations = {
    zh: bulletList(configLimitations.zh) ?? limitationSplit.zh.map((item) => item.text),
    en: bulletList(configLimitations.en) ?? limitationSplit.en.map((item) => item.text),
  }
  capabilities.zh = capabilities.zh.slice(0, MAX_BULLETS)
  capabilities.en = capabilities.en.slice(0, MAX_BULLETS)
  limitations.zh = limitations.zh.slice(0, MAX_BULLETS)
  limitations.en = limitations.en.slice(0, MAX_BULLETS)

  const sources = {
    capabilities: {
      zh: bulletList(configCapabilities.zh) === null ? 'README.md' : 'market-card.json',
      en: bulletList(configCapabilities.en) === null ? 'README.md' : 'market-card.json',
    },
    limitations: {
      zh: bulletList(configLimitations.zh) === null ? 'README.md' : 'market-card.json',
      en: bulletList(configLimitations.en) === null ? 'README.md' : 'market-card.json',
    },
    title: {
      zh: pickCopy(configTitle, 'zh') !== undefined ? 'market-card.json' : boldText !== null && hasCjk(boldText) ? 'README.md' : 'README.md',
      en: pickCopy(configTitle, 'en') !== undefined ? 'market-card.json' : h1 !== undefined && !hasCjk(h1.text) ? 'README.md' : 'package.json',
    },
    tagline: {
      zh: pickCopy(configTagline, 'zh') !== undefined ? 'market-card.json' : 'README.md',
      en: pickCopy(configTagline, 'en') !== undefined ? 'market-card.json' : enParagraph !== undefined ? 'README.md' : 'package.json',
    },
  }

  const shots = collectScreenshots(repo, blocks, overrides, {
    maxScreenshots: options.maxScreenshots,
    excludeScreenshots: options.excludeScreenshots,
  })
  warnings.push(...shots.warnings)

  const repositoryUrl =
    cleanRepoUrl(overrides.repoUrl) ??
    cleanRepoUrl(typeof pkg.repository === 'string' ? pkg.repository : pkg.repository && pkg.repository.url) ??
    cleanRepoUrl(gitOutput(repo, ['config', '--get', 'remote.origin.url']))

  const commit = options.commit !== undefined ? options.commit : gitOutput(repo, ['rev-parse', '--short', 'HEAD'])
  const now = options.now === undefined ? new Date() : new Date(options.now)
  if (Number.isNaN(now.getTime())) throw new CardError('bad-time', 'invalid timestamp: ' + String(options.now))

  const category = typeof overrides.category === 'string' && overrides.category.trim().length > 0 ? stripInline(overrides.category) : null
  const keywords = Array.isArray(pkg.keywords) ? pkg.keywords.filter((word) => typeof word === 'string').slice(0, 4) : []

  const model = {
    schema: 1,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    repo: {
      name: typeof pkg.name === 'string' && pkg.name.length > 0 ? pkg.name : basename(repo),
      dir: repo,
      url: repositoryUrl,
      version: typeof pkg.version === 'string' ? pkg.version : null,
      license: typeof pkg.license === 'string' ? pkg.license : null,
      dsh: pkg.engines && typeof pkg.engines.dsh === 'string' ? pkg.engines.dsh : null,
      node: pkg.engines && typeof pkg.engines.node === 'string' ? pkg.engines.node : null,
      keywords,
      category,
    },
    copy: {
      title: { zh: titleZh, en: titleEn },
      tagline: { zh: taglineZh, en: taglineEn },
      install: { lines: installLines, source: configInstall.length > 0 ? 'market-card.json' : install === null ? null : 'README.md' },
      capabilities,
      limitations,
    },
    screenshots: shots.list,
    source: {
      readme: toPosix(relative(repo, readmePath)),
      readmeLines: readme.split(/\r?\n/).length,
      config: config.file === null ? null : toPosix(relative(repo, resolve(config.file))),
      commit: typeof commit === 'string' && commit.length > 0 ? commit : null,
      generatedAt: now.toISOString(),
    },
    sources,
    facts: [
      { key: 'version', label: { zh: '版本', en: 'Version' }, value: typeof pkg.version === 'string' ? pkg.version : '—' },
      { key: 'license', label: { zh: '许可', en: 'License' }, value: typeof pkg.license === 'string' ? pkg.license : '—' },
      { key: 'dsh', label: { zh: 'DSH 版本', en: 'DSH range' }, value: pkg.engines && typeof pkg.engines.dsh === 'string' ? pkg.engines.dsh : '—' },
      { key: 'category', label: { zh: '分类', en: 'Category' }, value: category ?? '—' },
    ],
    counts: {
      capabilities: { zh: capabilities.zh.length, en: capabilities.en.length },
      limitations: { zh: limitations.zh.length, en: limitations.en.length },
      screenshots: shots.list.length,
    },
    warnings,
  }
  model.missing = validate(model)
  return model
}

export function validate(model) {
  const missing = []
  const has = (key, ok) => {
    if (ok) return
    const field = REQUIRED_FIELDS.find((entry) => entry.key === key)
    if (field !== undefined) missing.push(field)
  }
  has('title.zh', typeof model.copy.title.zh === 'string' && model.copy.title.zh.length > 0)
  has('title.en', typeof model.copy.title.en === 'string' && model.copy.title.en.length > 0)
  has('tagline.zh', typeof model.copy.tagline.zh === 'string' && model.copy.tagline.zh.length > 0)
  has('tagline.en', typeof model.copy.tagline.en === 'string' && model.copy.tagline.en.length > 0)
  has('install', model.copy.install.lines.length > 0)
  has('screenshots', model.screenshots.length > 0)
  has('capabilities.zh', model.copy.capabilities.zh.length > 0)
  has('capabilities.en', model.copy.capabilities.en.length > 0)
  has('limitations.zh', model.copy.limitations.zh.length > 0)
  has('limitations.en', model.copy.limitations.en.length > 0)
  return missing
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function linesOf(value) {
  return escapeHtml(value).replace(/\n/g, '<br>')
}

function bulletsHtml(items, marker) {
  if (items.length === 0) return '<div class="empty">未声明 · not declared</div>'
  return (
    '<ul>' +
    items
      .map((item) => '<li><span class="' + marker + '"></span>' + escapeHtml(typeof item === 'string' ? item : item.text) + '</li>')
      .join('') +
    '</ul>'
  )
}

function screenshotHtml(model) {
  if (model.screenshots.length === 0) {
    return '<div class="shot-empty">未提供截图 · no screenshots provided</div>'
  }
  const figures = []
  for (const shot of model.screenshots) {
    let uri
    try {
      uri = 'data:' + shot.mime + ';base64,' + readFileSync(shot.abs).toString('base64')
    } catch (error) {
      continue
    }
    const caption = shot.caption
    const zh = caption && caption.zh ? caption.zh : shot.alt
    const en = caption && caption.en ? caption.en : null
    const captionHtml =
      zh || en
        ? '<figcaption>' +
          (zh ? '<span>' + escapeHtml(zh) + '</span>' : '') +
          (en && en !== zh ? '<span class="cap-en">' + escapeHtml(en) + '</span>' : '') +
          '</figcaption>'
        : ''
    figures.push(
      '<figure class="shot">' +
        '<div class="shot-frame"><img src="' + uri + '" width="' + shot.width + '" height="' + shot.height +
        '" alt="' + escapeHtml(shot.alt || shot.file) + '"></div>' +
        captionHtml +
        '</figure>',
    )
  }
  if (figures.length === 0) return '<div class="shot-empty">截图无法读取 · screenshots could not be read</div>'
  return '<div class="shots n' + Math.min(figures.length, 4) + '">' + figures.join('') + '</div>'
}

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#f4f1ea}
body{width:1200px;color:#16140f;font-family:"Segoe UI","Microsoft YaHei","PingFang SC","Noto Sans SC",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.card{position:relative;width:1200px;padding:0 64px 40px;background:#f4f1ea;overflow:hidden}
.card::before{content:"";position:absolute;left:0;right:0;top:0;height:5px;background:#0f5c4a}
.kicker{display:flex;align-items:center;gap:10px;padding-top:34px;font:600 11px/1 ui-monospace,"Cascadia Code",Consolas,monospace;letter-spacing:.18em;text-transform:uppercase;color:#6d6659}
.kicker .mark{width:7px;height:7px;background:#0f5c4a;border-radius:1px;flex:none}
.kicker .pkg{letter-spacing:.04em;text-transform:none;color:#16140f;font-weight:600}
.kicker .spacer{flex:1}
.draft{position:absolute;right:64px;top:82px;transform:rotate(5deg);border:1.5px solid #a63d2f;color:#a63d2f;padding:7px 11px;font:700 10px/1 ui-monospace,Consolas,monospace;letter-spacing:.2em;text-transform:uppercase}
h1{margin:22px 0 0;font-size:62px;line-height:1.04;font-weight:700;letter-spacing:-.035em;max-width:980px;overflow-wrap:anywhere;text-wrap:balance}
.title-en{margin-top:12px;font:500 16px/1.3 ui-monospace,"Cascadia Code",Consolas,monospace;letter-spacing:.18em;text-transform:uppercase;color:#0f5c4a}
.tag{margin:18px 0 0;font-size:17px;line-height:1.62;color:#3c372d;max-width:1040px;overflow-wrap:anywhere;text-wrap:pretty}
.tag.en{margin-top:6px;font-size:14px;line-height:1.55;color:#6d6659}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.chip{font:500 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.03em;color:#3c372d;border:1px solid #d8d0bf;background:#faf8f2;border-radius:999px;padding:6px 10px}
.chip b{font-weight:700;color:#16140f}
.install{display:flex;align-items:stretch;margin-top:30px;border-radius:10px;overflow:hidden;background:#16140f;color:#f4f1ea}
.install .label{flex:none;display:flex;align-items:center;padding:0 18px;background:#0f5c4a;color:#eaf3ee;font:600 10px/1.4 ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase}
.install code{flex:1;display:block;padding:15px 18px;font:500 15px/1.5 ui-monospace,"Cascadia Code",Consolas,monospace;white-space:pre-wrap;word-break:break-all}
.install code .prompt{color:#7fae9a;margin-right:8px}
.missing{margin-top:12px;font:500 11px/1.7 ui-monospace,Consolas,monospace;color:#a63d2f}
.sec{margin-top:38px}
.sec-head{display:flex;align-items:baseline;gap:12px;padding-bottom:10px;border-bottom:1px solid #d8d0bf}
.sec-head h2{margin:0;font-size:13px;font-weight:700;letter-spacing:.04em}
.sec-head .en{font:500 10px/1 ui-monospace,Consolas,monospace;letter-spacing:.18em;text-transform:uppercase;color:#8a8272}
.sec-head .count{margin-left:auto;font:500 11px/1 ui-monospace,Consolas,monospace;color:#8a8272}
.shots{display:grid;gap:12px;margin-top:14px}
.shots.n1{grid-template-columns:1fr}
.shots.n2{grid-template-columns:1fr 1fr}
.shots.n3{grid-template-columns:repeat(3,minmax(0,1fr))}
.shots.n4{grid-template-columns:1fr 1fr}
.shot{margin:0;display:flex;flex-direction:column;min-width:0}
.shot-frame{background:#121417;border:1px solid #2a2d33;border-radius:10px;height:270px;display:flex;align-items:center;justify-content:center;padding:8px;overflow:hidden}
.shots.n1 .shot-frame{height:360px}
.shots.n2 .shot-frame{height:300px}
.shot img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;border-radius:4px}
.shot figcaption{margin-top:8px;font-size:12px;line-height:1.5;color:#5c564a;display:flex;flex-direction:column;gap:1px}
.shot .cap-en{color:#8a8272;font-size:11px}
.shot-empty{margin-top:14px;border:1px dashed #c9c0ad;border-radius:10px;padding:34px;text-align:center;color:#8a8272;font-size:13px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:44px;margin-top:38px}
.col h3{margin:0 0 4px;font-size:13px;font-weight:700}
.col h3 .en{font:500 10px/1 ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:#8a8272;margin-left:8px}
.col .lang-head{display:flex;align-items:center;gap:8px;margin-top:16px;font:600 10px/1 ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:#8a8272}
.col .lang-head::after{content:"";flex:1;height:1px;background:#e3dccd}
.col ul{list-style:none;margin:8px 0 0;padding:0}
.col li{position:relative;margin:7px 0;padding-left:16px;font-size:13px;line-height:1.55;color:#2b271f;overflow-wrap:anywhere;text-wrap:pretty}
.tick,.cross{position:absolute;left:0;width:7px;height:7px;border-radius:2px}
.tick{top:6px;background:#0f5c4a}
.cross{top:5px;border:1.5px solid #a63d2f;border-radius:1px}
.col .lang-head.en + ul li{color:#6d6659;font-size:12px}
.empty{margin-top:10px;font:500 11px/1.6 ui-monospace,Consolas,monospace;color:#a63d2f}
.facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;margin-top:38px;border:1px solid #d8d0bf;background:#d8d0bf;border-radius:10px;overflow:hidden}
.fact{background:#faf8f2;padding:12px 14px}
.fact .label{font:600 9px/1 ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:#8a8272}
.fact .value{margin-top:6px;font-size:13px;font-weight:600;color:#16140f;overflow-wrap:anywhere}
.foot{display:flex;align-items:flex-end;gap:18px;margin-top:42px;padding-top:16px;border-top:1px solid #d8d0bf;font:500 11px/1.6 ui-monospace,Consolas,monospace;color:#8a8272}
.foot .spacer{flex:1}
.foot .url{max-width:560px;text-align:right;color:#3c372d;overflow-wrap:anywhere}
.foot .url span{display:block;color:#8a8272}
`

export function renderHtml(model, options = {}) {
  const titleZh = model.copy.title.zh || model.copy.title.en || model.repo.name
  const titleEn = model.copy.title.en || model.repo.name
  const tagZh = model.copy.tagline.zh
  const tagEn = model.copy.tagline.en
  const installLines = model.copy.install.lines
  const missingLabels = model.missing.map((field) => field.zh + ' / ' + field.en)
  const chips = [
    model.repo.category ? '<span class="chip">' + escapeHtml(model.repo.category) + '</span>' : '',
    model.repo.license ? '<span class="chip">' + escapeHtml(model.repo.license) + '</span>' : '',
    model.repo.dsh ? '<span class="chip">DSH <b>' + escapeHtml(model.repo.dsh) + '</b></span>' : '',
    model.repo.version ? '<span class="chip">v' + escapeHtml(model.repo.version) + '</span>' : '',
  ].filter(Boolean).join('')

  const factList = model.facts.filter((fact) => typeof fact.value === 'string' && fact.value.length > 0 && fact.value !== '—')
  const factCount = Math.max(1, factList.length)
  const facts = factList
    .map(
      (fact) =>
        '<div class="fact"><div class="label">' + escapeHtml(fact.label.en) + '</div><div class="value">' +
        escapeHtml(fact.value) + '</div></div>',
    )
    .join('')

  const generated = model.source.generatedAt.slice(0, 10)
  const commit = model.source.commit ? '@' + model.source.commit : 'no git commit'
  const title = escapeHtml(titleZh + ' · ' + titleEn)

  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=1200">',
    '<meta name="generator" content="' + TOOL_NAME + ' ' + TOOL_VERSION + '">',
    '<title>' + title + '</title>',
    '<style>' + CSS + '</style>',
    '</head>',
    '<body>',
    '<article class="card">',
    '<div class="kicker"><span class="mark"></span><span>DSH plugin · market card</span><span class="spacer"></span><span class="pkg">' + escapeHtml(model.repo.name) + '</span></div>',
    model.missing.length > 0 ? '<div class="draft">Draft · 待补字段</div>' : '',
    '<h1>' + escapeHtml(titleZh) + '</h1>',
    '<div class="title-en">' + escapeHtml(titleEn) + '</div>',
    tagZh ? '<p class="tag">' + escapeHtml(tagZh) + '</p>' : '',
    tagEn ? '<p class="tag en">' + escapeHtml(tagEn) + '</p>' : '',
    chips ? '<div class="meta">' + chips + '</div>' : '',
    '<div class="install"><span class="label">Install · 安装</span><code>' +
      (installLines.length > 0
        ? installLines.map((line) => '<span class="prompt">$</span>' + escapeHtml(line)).join('\n')
        : '<span class="prompt">$</span># 未声明安装命令 · no install command declared') +
      '</code></div>',
    model.missing.length > 0 ? '<div class="missing">待补 / missing: ' + escapeHtml(missingLabels.join(' · ')) + '</div>' : '',
    '<section class="sec"><div class="sec-head"><h2>截图</h2><span class="en">Screenshots</span><span class="count">' +
      String(model.screenshots.length).padStart(2, '0') + '</span></div>' + screenshotHtml(model) + '</section>',
    '<section class="cols">',
    '<div class="col"><h3>能力<span class="en">Capabilities</span></h3>',
    '<div class="lang-head">中文</div>' + bulletsHtml(model.copy.capabilities.zh, 'tick'),
    '<div class="lang-head en">EN</div>' + bulletsHtml(model.copy.capabilities.en, 'tick'),
    '</div>',
    '<div class="col"><h3>限制<span class="en">Limitations</span></h3>',
    '<div class="lang-head">中文</div>' + bulletsHtml(model.copy.limitations.zh, 'cross'),
    '<div class="lang-head en">EN</div>' + bulletsHtml(model.copy.limitations.en, 'cross'),
    '</div>',
    '</section>',
    '<section class="facts" style="grid-template-columns:repeat(' + factCount + ',minmax(0,1fr))">' + facts + '</section>',
    '<footer class="foot">',
    '<div>源文件 README.md · ' + commit + ' · ' + generated + '</div>',
    '<div class="spacer"></div>',
    '<div class="url">' + (model.repo.url ? escapeHtml(model.repo.url) : '未声明仓库地址 · no repository URL') +
      '<span>生成器 ' + TOOL_NAME + ' v' + TOOL_VERSION + ' · 文案来自 README 与 market-card.json，不做机翻</span></div>',
    '</footer>',
    '</article>',
    '<script>',
    '(function () {',
    '  function mark() {',
    '    var height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);',
    '    document.documentElement.setAttribute("data-card-height", String(Math.ceil(height)));',
    '  }',
    '  mark();',
    '  if (document.readyState !== "complete") window.addEventListener("load", mark);',
    '  if (document.fonts && document.fonts.ready) document.fonts.ready.then(mark);',
    '})();',
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

export function renderMarkdown(model, options = {}) {
  const imageName = options.imageName || 'card.png'
  const title = [model.copy.title.zh, model.copy.title.en].filter(Boolean).join(' · ')
  const out = []
  out.push('<!-- generated by ' + TOOL_NAME + ' v' + TOOL_VERSION + ' from README.md -->')
  out.push('')
  out.push('![' + title + '](' + imageName + ')')
  out.push('')
  out.push('### ' + title)
  out.push('')
  if (model.copy.tagline.zh) out.push(model.copy.tagline.zh)
  if (model.copy.tagline.en) out.push('')
  if (model.copy.tagline.en) out.push('*' + model.copy.tagline.en + '*')
  if (model.copy.install.lines.length > 0) {
    out.push('')
    out.push('```sh')
    out.push(...model.copy.install.lines)
    out.push('```')
  }
  out.push('')
  out.push('**能力 / Capabilities**')
  out.push('')
  for (const item of model.copy.capabilities.zh) out.push('- ' + item)
  for (const item of model.copy.capabilities.en) out.push('- ' + item)
  out.push('')
  out.push('**限制 / Limitations**')
  out.push('')
  for (const item of model.copy.limitations.zh) out.push('- ' + item)
  for (const item of model.copy.limitations.en) out.push('- ' + item)
  out.push('')
  const meta = [model.repo.url, model.repo.license, model.repo.dsh ? 'DSH ' + model.repo.dsh : null].filter(Boolean)
  if (meta.length > 0) out.push(meta.join(' · '))
  if (model.missing.length > 0) {
    out.push('')
    out.push('> 草稿：还缺 ' + model.missing.map((field) => field.zh + ' / ' + field.en).join('、') + '；补齐后重新生成。')
  }
  out.push('')
  return out.join('\n')
}
