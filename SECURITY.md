# 安全模型 / Security model

This document describes what **dsh-market-card** reads, what it exposes and what it
deliberately does not do. It was read from `src/host.js`, `src/card.js`, `src/image.js`,
`src/browser.js` and `src/generate.js`.
**If this document and the code disagree, the code is right and this document is a bug.**

> 一句话：这是一个**只读本地文件、只写输出目录**的排版工具。它读仓库的 README、
> package.json 与截图，起一个无头浏览器截图，然后把结果写到你指定的目录。它不联网
> （浏览器渲染的是 `file://` 页面）、不执行仓库里的代码、不上传任何内容。

## 信任边界

- **CLI**：以当前用户身份运行，读你给的仓库路径，写 `--out` 指定的目录。
- **插件**：跑在 DSH 宿主进程里，注册一条 `/dsh-market-card` 前缀路由。路由**不鉴权**，
  只依赖 DSH web server 自身的访问控制（默认仅本机）。能访问该端口的人可以：
  - `GET /state`：看到当前仓库路径、输出目录、上次生成摘要和产物绝对路径；
  - `POST /generate`：让插件读**任意一个含 README.md 的目录**并生成卡片；
  - `GET /card.html|card.png|card.json|card.md`：取回最近一次生成的产物。
  路由不提供「读取任意文件」接口：只按固定文件名返回最近一次的输出。
- 请求体上限 256 KiB（`MAX_BODY`），超过即断开连接。
- 输出目录必须落在被读取的仓库内；`outDir` 传 `..` 会被 400 拒绝。

## 读什么

- `<repo>/README.md`（或 `readme.md`）、`<repo>/package.json`、`<repo>/market-card.json`
- README 引用的本地图片与 `<repo>/docs/**/*.png|jpg|jpeg|webp`
- 仅此而已：不读 `~/.dsh`、不读凭据、不读环境变量里的密钥、不读仓库里的其他文件。

## 写什么

- `<out>/card.html`、`card.png`、`card.json`、`card.md`（默认 `<repo>/dist`）
- 无头浏览器的临时 profile 目录，用完在 `finally` 里删除
- 不修改被读取的文件，不写 git，不写任何全局配置。

## 网络与执行

- **不发起网络请求**：卡片 HTML 不引用远程资源，图片以 data URI 内嵌；浏览器打开的是
  `file://` 页面。
- **不执行仓库里的代码**：不跑 `npm install`、不跑仓库脚本；`package.json` 只被当作 JSON 读。
- **会启动本机浏览器进程**：`chrome` / `msedge` 以 `--headless=new` 运行，使用一次性
  `--user-data-dir`，只加载本次生成的 HTML。
- 无遥测、无统计上报、不写日志文件。

## 不可信输入

- **README / market-card.json 的文案**：进入 HTML 前先剥掉 Markdown 标记并做 HTML 转义；
  `renderHtml` 不保留任何原始 HTML 标签。
- **图片文件**：只按魔数解析尺寸（PNG IHDR / JPEG SOF / WebP VP8X），不交给图片库解码；
  读不出尺寸就跳过并记一条 warning。
- **浏览器输出**：截图后重新读 PNG 的 IHDR，尺寸与请求不符即报 `screenshot-failed`，不会把
  一张裁坏的图当作成功交付。
- **HTTP 调用方**：见上，路由无 token / CSRF；它只能触发「读一个有 README 的目录并排版」，
  不能写仓库外的路径，也不能读取任意文件。

## 已知限制（设计取舍，不是待办）

1. **不是沙箱**：以你的用户权限运行，能读你给它的目录；不要拿它去渲染不受信任的仓库路径。
2. **启发式提取**：标题、安装命令、能力/限制都是模式匹配。提取错就覆盖 `market-card.json`，
   工具不会「理解」README。
3. **浏览器是外部依赖**：找不到 Chrome/Edge 时 PNG 不可用；HTML 仍然写出，这不算安全缺陷。
4. **卡片里的链接**：`package.json` 的 repository 会被显示为纯文本 URL；HTML 本身不加载它。
5. **面板与路由共享本机权限**：能打开 DSH Web GUI 的人就能操作这条路由，与 DSH 本身的
   信任模型一致。

## 报告漏洞

用 GitHub 的私密渠道：
<https://github.com/dingchenhui0618-arch/dsh-market-card/security/advisories/new>

个人项目，**不承诺响应时限**；会读、会修，修完写进 `CHANGELOG.md`。请不要把仍在生效的
问题先发到公开 issue。

## 支持范围

只维护最新一版（`0.1.x`）。
