// Client half of dsh-market-card: the 市场卡片 tab in the conversation view.
//
// Must stay CommonJS — the build wraps this in window.__ModuleLoader__.load()
// and React is supplied by the harness.

const React = require('react')
const h = React.createElement
const CSS = require('./client-css.cjs')

const API = '/dsh-market-card'

// One module-level snapshot shared by every mounted view; the host half is the
// single source of truth and this side only renders what it returns.
let snap = { data: null, error: '', at: 0 }
const listeners = new Set()
let timer = null

function emit() {
  Array.from(listeners).forEach(function (fn) {
    try {
      fn(snap)
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[dsh-market-card] listener failed', error)
    }
  })
}

function load() {
  return fetch(API + '/state', { headers: { accept: 'application/json' } })
    .then(function (res) { return res.json() })
    .then(function (data) {
      snap = { data: data, error: '', at: Date.now() }
      emit()
      return data
    })
    .catch(function (error) {
      snap = { data: snap.data, error: String((error && error.message) || error), at: Date.now() }
      emit()
      return null
    })
}

function generate(body) {
  return fetch(API + '/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  }).then(function (res) {
    return res.json().catch(function () { return {} }).then(function (json) {
      if (res.ok && json && json.ok === true) {
        snap = { data: json, error: '', at: Date.now() }
        emit()
        return { ok: true }
      }
      const message = json && json.error && json.error.message ? json.error.message : 'HTTP ' + res.status
      snap = { data: snap.data, error: message, at: Date.now() }
      emit()
      return { ok: false, error: message }
    })
  }).catch(function (error) {
    const message = String((error && error.message) || error)
    snap = { data: snap.data, error: message, at: Date.now() }
    emit()
    return { ok: false, error: message }
  })
}

function subscribe(fn) {
  listeners.add(fn)
  if (timer === null) {
    load()
    // The panel has no server push; a slow poll keeps two open tabs coherent.
    timer = setInterval(load, 5000)
  }
  fn(snap)
  return function () {
    listeners.delete(fn)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

function copyText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text)
  }
  return Promise.reject(new Error('clipboard unavailable'))
}

function Row(props) {
  return h('div', { className: 'mc-row' },
    h('span', null, props.label),
    h('span', { className: props.tone || '' }, props.value),
  )
}

function Card(props) {
  return h('div', { className: 'mc-card' }, props.title ? h('h4', null, props.title) : null, props.children)
}

function MarketCardView() {
  const [state, setState] = React.useState(snap)
  const [repo, setRepo] = React.useState(null)
  const [outDir, setOutDir] = React.useState(null)
  const [png, setPng] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [localError, setLocalError] = React.useState('')
  const [copied, setCopied] = React.useState(false)

  React.useEffect(function () { return subscribe(setState) }, [])

  const data = state.data
  const summary = (data && data.summary) || null
  const missing = (summary && summary.missing) || []
  const warnings = (summary && summary.warnings) || []
  const files = (data && data.files) || {}
  const exists = (data && data.exists) || {}
  const browser = (data && data.browser) || { found: false, name: null }
  const repoValue = repo !== null ? repo : (data ? data.repo : '')
  const outValue = outDir !== null ? outDir : ''
  const install = summary && summary.copy && summary.copy.install ? summary.copy.install.lines.join('\n') : ''
  const error = localError || (data && data.error) || state.error
  const pngFailed = summary && summary.png && summary.png.ok === false && summary.png.code !== 'skipped'
  const stamp = state.at ? new Date(state.at).toLocaleTimeString() : '—'
  const title = summary && summary.copy && summary.copy.title ? (summary.copy.title.zh || summary.copy.title.en) : ''

  function runGenerate() {
    setBusy(true)
    setLocalError('')
    const payload = { repo: repoValue, png: png }
    if (outValue.trim().length > 0) payload.outDir = outValue.trim()
    generate(payload).then(function (result) {
      setBusy(false)
      if (!result.ok) setLocalError(result.error || '生成失败')
      else {
        setRepo(null)
        setOutDir(outDir === null ? null : outValue)
      }
    })
  }

  function doCopy() {
    if (!install) return
    copyText(install).then(function () {
      setCopied(true)
      setTimeout(function () { setCopied(false) }, 1200)
    }).catch(function (error) {
      setLocalError('复制失败：' + String((error && error.message) || error))
    })
  }

  const previewUrl = API + '/card.png?t=' + state.at
  const htmlUrl = API + '/card.html?t=' + state.at
  const preview = exists.png
    ? h('img', { src: previewUrl, alt: title ? title + ' 市场卡片' : '市场卡片预览' })
    : exists.html
      ? h('iframe', { src: htmlUrl, title: '市场卡片 HTML 预览' })
      : h('div', { className: 'mc-empty' },
          h('div', { className: 'mc-big' }, '/ / /'),
          h('p', null, '还没有生成。填好仓库路径，点「生成卡片」。'),
          h('p', null, '卡片由 README.md、package.json 与 docs/*.png 生成，不会替你补写事实。'),
        )

  return h('div', { className: 'mc-root' },
    h('header', { className: 'mc-head' },
      h('div', null,
        h('div', { className: 'mc-kicker' }, 'MARKET CARD'),
        h('div', { className: 'mc-title' }, '市场卡片'),
        h('div', { className: 'mc-sub' }, '把仓库现状变成一张可直接贴进插件市场上架 PR 的卡片：中英双语标题、安装命令、截图墙、能力与限制。'),
      ),
      h('div', { className: 'mc-grow' }),
      h('div', { className: 'mc-actions' },
        h('button', { className: 'mc-btn', type: 'button', onClick: function () { load() } }, '刷新'),
        h('button', { className: 'mc-btn primary', type: 'button', disabled: busy, onClick: runGenerate },
          busy ? h('span', { className: 'mc-spin' }) : null,
          busy ? '生成中' : '生成卡片',
        ),
      ),
    ),
    h('div', { className: 'mc-form' },
      h('label', { className: 'mc-field' },
        h('span', null, '仓库路径'),
        h('input', {
          className: 'mc-input',
          value: repoValue,
          spellCheck: false,
          placeholder: 'D:\\Projects\\your-plugin',
          onChange: function (event) { setRepo(event.target.value) },
        }),
      ),
      h('label', { className: 'mc-field' },
        h('span', null, '输出目录（默认 <repo>/dist）'),
        h('input', {
          className: 'mc-input',
          value: outValue,
          spellCheck: false,
          placeholder: 'dist',
          onChange: function (event) { setOutDir(event.target.value) },
        }),
      ),
      h('label', { className: 'mc-check' },
        h('input', { type: 'checkbox', checked: png, onChange: function (event) { setPng(event.target.checked) } }),
        '生成 PNG',
      ),
    ),
    error ? h('div', { className: 'mc-alert' }, h('b', null, '错误：'), error) : null,
    pngFailed ? h('div', { className: 'mc-alert' },
      h('b', null, 'PNG 失败：'), summary.png.message,
      h('div', { style: { marginTop: '4px', opacity: 0.75 } }, 'HTML 已写好，可以先用 HTML 卡片。'),
    ) : null,
    h('div', { className: 'mc-main' },
      h('div', { className: 'mc-preview' },
        h('div', { className: 'mc-bar' },
          h('b', null, exists.png ? 'card.png' : exists.html ? 'card.html' : '未生成'),
          summary && summary.png && summary.png.ok
            ? h('span', null, summary.png.width + '×' + summary.png.height + ' · ' + Math.round(summary.png.bytes / 1024) + ' KiB')
            : null,
          h('span', { className: 'mc-grow' }),
          exists.html ? h('a', { className: 'mc-link', href: htmlUrl, target: '_blank', rel: 'noreferrer' }, '打开 HTML ↗') : null,
          exists.png ? h('a', { className: 'mc-link', href: previewUrl, download: 'card.png' }, '下载 PNG ↓') : null,
        ),
        h('div', { className: 'mc-canvas' }, preview),
      ),
      h('aside', { className: 'mc-side' },
        h(Card, { title: '状态' },
          h(Row, { label: '浏览器', value: browser.found ? browser.name : '未找到', tone: browser.found ? 'mc-ok' : 'mc-bad' }),
          h(Row, { label: '上次生成', value: summary && summary.source ? summary.source.generatedAt.replace('T', ' ').slice(0, 19) : '—' }),
          h(Row, { label: '缺失字段', value: summary ? String(missing.length) : '—', tone: summary && missing.length ? 'mc-bad' : summary ? 'mc-ok' : '' }),
          h(Row, { label: '警告', value: summary ? String(warnings.length) : '—', tone: summary && warnings.length ? 'mc-bad' : '' }),
          h(Row, { label: '面板刷新', value: stamp }),
        ),
        h(Card, { title: '待补字段 / Missing' },
          !summary
            ? h('div', { className: 'mc-row' }, '生成一次后显示。')
            : missing.length === 0
              ? h('div', { className: 'mc-row mc-ok' }, '没有，卡片可以发布。')
              : h('div', { className: 'mc-chips' }, missing.map(function (field) {
                  return h('span', { key: field.key, className: 'mc-chip' }, field.key)
                })),
        ),
        install ? h(Card, { title: '安装命令' },
          h('div', { className: 'mc-code' }, install),
          h('button', { className: 'mc-btn small', type: 'button', style: { marginTop: '8px' }, onClick: doCopy }, copied ? '已复制' : '复制'),
        ) : null,
        h(Card, { title: '产物' },
          h('div', { className: 'mc-list' },
            h('div', null, 'html ', h('span', null, files.html ? files.html.split(/[\\/]/).pop() : '—')),
            h('div', null, 'png  ', h('span', null, files.png ? files.png.split(/[\\/]/).pop() : '—')),
            h('div', null, 'md   ', h('span', null, files.markdown ? files.markdown.split(/[\\/]/).pop() : '—')),
            h('div', null, 'json ', h('span', null, files.json ? files.json.split(/[\\/]/).pop() : '—')),
          ),
          data && data.outDir ? h('div', { style: { marginTop: '8px', fontSize: '11px', opacity: 0.65, wordBreak: 'break-all' } }, data.outDir) : null,
        ),
        warnings.length > 0 ? h(Card, { title: '警告' },
          h('div', { className: 'mc-list' }, warnings.slice(0, 5).map(function (warning, index) {
            return h('div', { key: String(index) }, warning.code, h('span', null, ' ' + (warning.path || '')))
          })),
        ) : null,
      ),
    ),
    h('footer', { className: 'mc-foot' },
      h('span', null, '文案只来自 README / market-card.json；工具不翻译、不补写。'),
      h('span', { className: 'mc-grow' }),
      h('a', { className: 'mc-link', href: 'https://github.com/dingchenhui0618-arch/dsh-market-card', target: '_blank', rel: 'noreferrer' }, 'GitHub ↗'),
    ),
  )
}

function apply(ctx) {
  // dsh resolves plugin dependencies at runtime and can unload a plugin in the
  // middle of a session, so every registration below has its own teardown.
  ctx.effect(function () {
    return function () {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
      listeners.clear()
      snap = { data: null, error: '', at: 0 }
    }
  })

  ctx.effect(function () {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-market-card'
    style.textContent = CSS
    document.head.appendChild(style)
    return function () { style.remove() }
  })

  ctx.slots.inject('conversation.view', function () {
    let disposeView
    try {
      disposeView = ctx.slots.register(
        { name: 'conversation.view', id: 'market-card', order: 34, label: '市场卡片' },
        MarketCardView,
      )
    } catch (error) {
      disposeView = undefined
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[dsh-market-card] could not register the 市场卡片 view; the CLI still works', error)
      }
    }
    return typeof disposeView === 'function' ? disposeView : function () {}
  })
}

module.exports = {
  name: 'dsh-market-card',
  inject: ['slots'],
  apply: apply,
}
