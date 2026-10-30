/* dsh-market-card client bundle — generated from src/client.cjs */
window.__ModuleLoader__.load({
  id: "dsh-market-card",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
// Client half of dsh-market-card: the 市场卡片 tab in the conversation view.
//
// Must stay CommonJS — the build wraps this in window.__ModuleLoader__.load()
// and React is supplied by the harness.

const React = require('react')
const h = React.createElement
const CSS = ".mc-root{display:flex;flex-direction:column;gap:14px;padding:18px 20px 22px;height:100%;max-height:calc(100vh - 96px);min-height:0;overflow:auto;color:var(--dsw-alias-label-primary,inherit);font-size:13px;line-height:1.5}.mc-head{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap}.mc-kicker{font:600 10px/1.4 ui-monospace,Consolas,monospace;letter-spacing:.18em;color:var(--dsw-alias-brand-primary,#0f5c4a)}.mc-title{font-size:17px;font-weight:650;margin-top:5px;letter-spacing:.01em}.mc-sub{font-size:12px;color:var(--dsw-alias-label-secondary,rgba(0,0,0,.55));margin-top:3px;max-width:620px}.mc-grow{flex:1}.mc-actions{display:flex;gap:8px;align-items:center;padding-top:2px}.mc-btn{font:inherit;font-size:12px;padding:5px 12px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.16));background:transparent;color:inherit;cursor:pointer;white-space:nowrap}.mc-btn:hover{background:color-mix(in srgb,currentColor 7%,transparent)}.mc-btn:disabled{opacity:.45;cursor:default}.mc-btn.primary{background:#0f5c4a;border-color:transparent;color:#f4f1ea;font-weight:600}.mc-btn.primary:hover{background:#0d4e3f}.mc-btn.primary:disabled{background:#0f5c4a}.mc-btn.small{font-size:11px;padding:3px 9px;border-radius:6px}.mc-form{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) auto;gap:10px;align-items:end;padding:12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;background:color-mix(in srgb,currentColor 3%,transparent)}.mc-field{display:flex;flex-direction:column;gap:5px;min-width:0}.mc-field span{font:600 10px/1.2 ui-monospace,Consolas,monospace;letter-spacing:.08em;color:var(--dsw-alias-label-secondary,rgba(0,0,0,.5))}.mc-input{width:100%;min-width:0;font:inherit;font-size:12px;padding:7px 9px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.16));background:var(--dsw-alias-bg-base,transparent);color:inherit}.mc-input:focus{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#0f5c4a) 45%,transparent);outline-offset:1px;border-color:transparent}.mc-check{display:flex;align-items:center;gap:7px;font-size:12px;padding:7px 2px;white-space:nowrap;cursor:pointer}.mc-check input{accent-color:var(--dsw-alias-brand-primary,#0f5c4a)}.mc-alert{border:1px solid color-mix(in srgb,#dc2626 50%,transparent);background:color-mix(in srgb,#dc2626 8%,transparent);border-radius:8px;padding:9px 11px;font-size:12px}.mc-alert b{font-weight:600}.mc-main{display:grid;grid-template-columns:minmax(0,1fr) 292px;gap:14px;min-height:0;flex:1}.mc-preview{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;overflow:hidden;background:color-mix(in srgb,currentColor 4%,transparent)}.mc-bar{display:flex;align-items:center;gap:10px;padding:8px 11px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));font:500 11px/1.4 ui-monospace,Consolas,monospace;color:var(--dsw-alias-label-secondary,rgba(0,0,0,.55));background:var(--dsw-alias-bg-layer-1,transparent)}.mc-bar b{color:var(--dsw-alias-label-primary,inherit);font-weight:600}.mc-bar .mc-grow{flex:1}.mc-link{color:var(--dsw-alias-brand-primary,#0f5c4a);text-decoration:none;font-weight:600;white-space:nowrap}.mc-link:hover{text-decoration:underline}.mc-canvas{flex:none;height:clamp(300px,46vh,560px);min-height:0;display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto}.mc-canvas img{max-width:100%;max-height:100%;width:auto;height:auto;display:block;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.18)}.mc-canvas iframe{width:100%;height:100%;min-height:420px;border:0;border-radius:8px;background:#f4f1ea}.mc-empty{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;color:var(--dsw-alias-label-secondary,rgba(0,0,0,.55));padding:28px}.mc-empty .mc-big{font-size:22px;opacity:.35;letter-spacing:.2em}.mc-empty p{margin:0;font-size:12px;max-width:360px}.mc-side{display:flex;flex-direction:column;gap:10px;min-width:0}.mc-card{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;padding:10px 12px}.mc-card h4{margin:0 0 8px;font:600 10px/1.4 ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,rgba(0,0,0,.5))}.mc-row{display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:3px 0}.mc-row span:first-child{color:var(--dsw-alias-label-secondary,rgba(0,0,0,.55))}.mc-row span:last-child{font-variant-numeric:tabular-nums;text-align:right;word-break:break-all}.mc-chips{display:flex;flex-wrap:wrap;gap:5px}.mc-chip{font:500 10px/1.4 ui-monospace,Consolas,monospace;padding:3px 7px;border-radius:999px;background:color-mix(in srgb,#d97706 14%,transparent);border:1px solid color-mix(in srgb,#d97706 32%,transparent);color:color-mix(in srgb,#d97706 80%,currentColor)}.mc-ok{color:var(--dsw-alias-state-success-primary,#16a34a)}.mc-bad{color:var(--dsw-alias-state-error-primary,#dc2626)}.mc-code{font:500 11px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;background:color-mix(in srgb,currentColor 6%,transparent);border-radius:6px;padding:7px 8px}.mc-list{display:flex;flex-direction:column;gap:5px;font:500 11px/1.5 ui-monospace,Consolas,monospace;word-break:break-all}.mc-list span{color:var(--dsw-alias-label-secondary,rgba(0,0,0,.55))}.mc-foot{display:flex;gap:10px;align-items:center;font-size:11px;color:var(--dsw-alias-label-secondary,rgba(0,0,0,.5));flex-wrap:wrap}.mc-foot .mc-grow{flex:1}.mc-spin{display:inline-block;width:10px;height:10px;border:1.5px solid currentColor;border-right-color:transparent;border-radius:50%;animation:mc-spin .8s linear infinite;vertical-align:-1px;margin-right:6px}@keyframes mc-spin{to{transform:rotate(360deg)}}@media (max-width:980px){.mc-main{grid-template-columns:minmax(0,1fr)}.mc-form{grid-template-columns:minmax(0,1fr)}}"

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
    return module.exports;
  },
});
