# Changelog

## 0.1.0 — 2026-10-30

首个版本。

- 从 `README.md` 提取中英标题、一句话、安装命令、能力、限制与截图
- `market-card.json` 覆盖文案、截图顺序与图注，并记录每个字段的来源
- 自包含 HTML（图片以 data URI 内嵌）、2x PNG、`card.md`、`card.json`
- 无头 Chrome / Edge 两遍渲染：先测量页面高度，再按该高度截图并回读 PNG 头部校验
- `--strict` 在必需字段缺失时退出码 2；不加 strict 时盖 `DRAFT` 章并列出待补字段
- `--json` 输出机器可读摘要；浏览器缺失时退出码 3，但 HTML 仍然写好
- DSH 插件面板「市场卡片」：生成、预览、打开 HTML、下载 PNG、复制安装命令
- 48 个测试，覆盖提取、卡片渲染、两遍截图（假 spawn）、host 路由、CLI 与构建产物
