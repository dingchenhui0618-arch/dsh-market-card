import { strict as assert } from 'node:assert'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  CardError,
  MAX_BULLETS,
  buildModel,
  cleanRepoUrl,
  parseMarkdown,
  renderHtml,
  renderMarkdown,
  stripInline,
  validate,
} from '../src/card.js'
import { imageMeta } from '../src/image.js'
import { cleanup, fakeJpeg, fakePng, makeRepo } from './helpers.mjs'

const NOW = '2026-01-02T03:04:05.000Z'

function model(dir, extra = {}) {
  return buildModel(dir, { now: NOW, commit: 'abc1234', ...extra })
}

test('a complete repository produces a complete bilingual model', (t) => {
  const dir = makeRepo()
  cleanup(t, dir)
  const card = model(dir)
  assert.equal(card.copy.title.zh, '示例插件')
  assert.equal(card.copy.title.en, 'demo-plugin')
  assert.match(card.copy.tagline.zh, /把一份清单变成一张/)
  assert.match(card.copy.tagline.en, /turns one manifest into a card/)
  assert.deepEqual(card.copy.install.lines, ['dsh plugin --profile web add demo-plugin'])
  assert.deepEqual(card.copy.capabilities.zh, ['从 README 提取标题与一句话', '用 docs/*.png 拼出截图墙'])
  assert.deepEqual(card.copy.capabilities.en, ['Extract the install command from a fenced block', 'Render a bilingual card as HTML and PNG'])
  assert.equal(card.copy.limitations.zh.length, 2)
  assert.equal(card.copy.limitations.en.length, 2)
  assert.deepEqual(card.screenshots.map((shot) => shot.file), ['docs/shot.png'])
  assert.equal(card.repo.version, '1.2.3')
  assert.equal(card.repo.license, 'MIT')
  assert.equal(card.repo.dsh, '>=0.2.1-rc.2 <0.3.0')
  assert.equal(card.repo.url, 'https://github.com/example/demo-plugin')
  assert.equal(card.source.commit, 'abc1234')
  assert.deepEqual(card.missing, [])
  assert.equal(card.counts.screenshots, 1)
})

test('the Chinese title comes from the first bold phrase in the intro', (t) => {
  const dir = makeRepo()
  cleanup(t, dir)
  writeFileSync(join(dir, 'README.md'), '# demo-plugin\n\n[![b](x.svg)](y)\n\n给 DSH 的**真正的标题**：还有后半句。\n')
  const card = model(dir)
  assert.equal(card.copy.title.zh, '真正的标题')
  assert.equal(card.copy.tagline.zh, '给 DSH 的真正的标题：还有后半句。')
})

test('a capability/limitation section is split by language and capped', (t) => {
  const dir = makeRepo()
  cleanup(t, dir)
  const bullets = []
  for (let i = 0; i < 8; i += 1) bullets.push(`- 中文条目 ${i}`)
  for (let i = 0; i < 8; i += 1) bullets.push(`- English item ${i}`)
  writeFileSync(join(dir, 'README.md'), '# demo\n\n一句话。\n\n## 能力\n\n' + bullets.join('\n') + '\n\n## 限制\n\n' + bullets.join('\n') + '\n')
  const card = model(dir)
  assert.equal(card.copy.capabilities.zh.length, MAX_BULLETS)
  assert.equal(card.copy.capabilities.en.length, MAX_BULLETS)
  assert.equal(card.copy.limitations.zh.length, MAX_BULLETS)
  assert.equal(card.copy.limitations.en.length, MAX_BULLETS)
  assert.equal(card.copy.capabilities.zh[0], '中文条目 0')
})

test('market-card.json overrides README copy and screenshots in order', (t) => {
  const dir = makeRepo()
  cleanup(t, dir)
  writeFileSync(
    join(dir, 'market-card.json'),
    JSON.stringify({
      title: { zh: '覆盖标题', en: 'Override Title' },
      tagline: { zh: '覆盖一句话', en: 'An override tagline' },
      install: 'dsh plugin --profile web add demo-plugin',
      category: 'docs',
      screenshots: [{ path: 'docs/shot.png', caption: { zh: '面板截图', en: 'Panel shot' } }],
      capabilities: { zh: ['甲'], en: ['A'] },
      limitations: { zh: ['乙'], en: ['B'] },
    }),
  )
  const card = model(dir)
  assert.equal(card.copy.title.zh, '覆盖标题')
  assert.equal(card.copy.title.en, 'Override Title')
  assert.equal(card.copy.tagline.en, 'An override tagline')
  assert.deepEqual(card.copy.capabilities, { zh: ['甲'], en: ['A'] })
  assert.deepEqual(card.copy.limitations, { zh: ['乙'], en: ['B'] })
  assert.equal(card.repo.category, 'docs')
  assert.deepEqual(card.screenshots[0].caption, { zh: '面板截图', en: 'Panel shot' })
  assert.equal(card.sources.capabilities.zh, 'market-card.json')
  assert.equal(card.sources.limitations.en, 'market-card.json')
  assert.deepEqual(card.missing, [])
})

test('README images are discovered before docs/ images, and duplicates collapse', (t) => {
  const dir = makeRepo()
  cleanup(t, dir)
  copyFileSync(join(dir, 'docs', 'shot.png'), join(dir, 'hero.png'))
  writeFileSync(
    join(dir, 'README.md'),
    '# demo\n\n一句话。\n\n![首图](hero.png)\n\n![同一张](docs/shot.png)\n\n## 能力\n\n- 甲\n\n## 限制\n\n- 乙\n',
  )
  const card = model(dir)
  assert.deepEqual(card.screenshots.map((shot) => shot.file), ['hero.png', 'docs/shot.png'])
  assert.equal(card.screenshots[0].alt, '首图')
  assert.equal(card.screenshots[1].alt, '同一张')
})

test('the output PNG is never included in its own screenshot wall', (t) => {
  const dir = makeRepo()
  cleanup(t, dir)
  const shot = join(dir, 'docs', 'shot.png')
  writeFileSync(join(dir, 'README.md'), '# demo\n\n一句话。\n\n## 能力\n\n- 甲\n\n## 限制\n\n- 乙\n')
  const card = model(dir, { excludeScreenshots: [shot] })
  assert.equal(card.screenshots.length, 0)
})

test('images smaller than a real screenshot are skipped with a warning', (t) => {
  const dir = makeRepo()
  cleanup(t, dir)
  mkdirSync(join(dir, 'docs', 'nested'), { recursive: true })
  writeFileSync(join(dir, 'docs', 'icon.png'), fakePng(64, 64))
  const card = model(dir)
  assert.deepEqual(card.screenshots.map((shot) => shot.file), ['docs/shot.png'])
  assert.ok(card.warnings.some((warning) => warning.code === 'screenshot-too-small'))
})

test('an incomplete repository reports every missing field instead of inventing copy', (t) => {
  const dir = makeRepo('partial')
  cleanup(t, dir)
  const card = model(dir)
  const keys = card.missing.map((field) => field.key)
  assert.ok(keys.includes('title.zh'))
  assert.ok(keys.includes('capabilities.zh'))
  assert.ok(keys.includes('capabilities.en'))
  assert.ok(keys.includes('limitations.zh'))
  assert.ok(keys.includes('limitations.en'))
  assert.ok(!keys.includes('install'), 'the install block is present')
  assert.equal(card.copy.capabilities.zh.length, 0)
  assert.equal(validate(card).length, card.missing.length)
})

test('README.md is required, and a broken config is an explicit error', (t) => {
  const dir = makeRepo('partial')
  cleanup(t, dir)
  rmSync(join(dir, 'README.md'))
  writeFileSync(join(dir, 'readme.md'), '# lower\n')
  assert.equal(model(dir).source.readme, 'readme.md')
  rmSync(join(dir, 'readme.md'))
  assert.throws(() => model(dir), (error) => error instanceof CardError && error.code === 'readme-missing')
  writeFileSync(join(dir, 'README.md'), '# upper\n')
  writeFileSync(join(dir, 'market-card.json'), '{ not json')
  assert.throws(() => model(dir), (error) => error instanceof CardError && error.code === 'config-invalid')
  assert.throws(() => buildModel(join(dir, 'nope'), { now: NOW }), (error) => error.code === 'repo-missing')
})

test('renderHtml is self-contained and carries both languages', (t) => {
  const dir = makeRepo()
  cleanup(t, dir)
  const html = renderHtml(model(dir))
  assert.match(html, /示例插件/)
  assert.match(html, /demo-plugin/)
  assert.match(html, /dsh plugin --profile web add demo-plugin/)
  assert.match(html, /data:image\/png;base64,/)
  assert.match(html, /data-card-height/)
  assert.match(html, /不做机器翻译/)
  assert.ok(!/src="https?:/i.test(html), 'no remote script/image src')
  assert.ok(!/href="https?:/i.test(html), 'no remote links that would need the network')
  assert.ok(!/<link\b/i.test(html))
  assert.ok(!/url\(\s*https?:/i.test(html))
  assert.ok(!html.includes('Draft · 待补字段'))
})

test('an incomplete card is stamped DRAFT and lists what is missing', (t) => {
  const dir = makeRepo('partial')
  cleanup(t, dir)
  const html = renderHtml(model(dir))
  assert.match(html, /Draft · 待补字段/)
  assert.match(html, /待补 \/ missing:/)
  assert.match(html, /中文能力条目/)
})

test('copy is escaped, so a repository cannot inject markup into the card', (t) => {
  const dir = makeRepo()
  cleanup(t, dir)
  writeFileSync(
    join(dir, 'market-card.json'),
    JSON.stringify({ title: { zh: '标题 " <x>', en: 'Title <script>alert(1)</script> & <' } }),
  )
  const html = renderHtml(model(dir))
  assert.match(html, /标题 &quot;/)
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('Title alert(1) &amp; &lt;'))
})

test('renderMarkdown is a ready-to-paste PR block', (t) => {
  const dir = makeRepo()
  cleanup(t, dir)
  const md = renderMarkdown(model(dir), { imageName: 'card.png' })
  assert.match(md, /!\[示例插件 · demo-plugin\]\(card\.png\)/)
  assert.match(md, /```sh\ndsh plugin --profile web add demo-plugin\n```/)
  assert.match(md, /\*\*能力 \/ Capabilities\*\*/)
  assert.match(md, /\*\*限制 \/ Limitations\*\*/)
  assert.match(md, /https:\/\/github\.com\/example\/demo-plugin/)
})

test('the same inputs and timestamp render byte-identical HTML', (t) => {
  const dir = makeRepo()
  cleanup(t, dir)
  const a = renderHtml(model(dir))
  const b = renderHtml(model(dir))
  assert.equal(a, b)
})

test('inline Markdown is flattened without swallowing its text', () => {
  assert.equal(stripInline('**粗体** 和 `代码` 与 [链接](https://x)'), '粗体 和 代码 与 链接')
  assert.equal(stripInline('![图](x.png) 后面'), '图 后面')
  assert.equal(stripInline('&amp; &lt;tag&gt;'), '& <tag>')
})

test('the parser keeps line numbers for provenance', () => {
  const blocks = parseMarkdown('# t\n\n## 能力\n\n- 甲\n- 乙\n')
  const list = blocks.find((block) => block.kind === 'list')
  assert.deepEqual(list.items.map((item) => item.line), [5, 6])
})

test('repository URLs are normalised, and non-HTTP remotes are refused', () => {
  assert.equal(cleanRepoUrl('git+https://github.com/a/b.git'), 'https://github.com/a/b')
  assert.equal(cleanRepoUrl('git@github.com:a/b.git'), 'https://github.com/a/b')
  assert.equal(cleanRepoUrl('ssh://git@github.com/a/b.git'), 'https://github.com/a/b')
  assert.equal(cleanRepoUrl('file:///D:/x'), null)
  assert.equal(cleanRepoUrl(undefined), null)
})

test('image metadata covers PNG and JPEG buffers', () => {
  assert.deepEqual(imageMeta(fakePng(1200, 630)), { mime: 'image/png', width: 1200, height: 630 })
  assert.deepEqual(imageMeta(fakeJpeg(640, 360)), { mime: 'image/jpeg', width: 640, height: 360 })
  assert.equal(imageMeta(Buffer.from('not an image at all')), null)
})
