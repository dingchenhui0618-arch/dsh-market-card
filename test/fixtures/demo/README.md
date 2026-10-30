# demo-plugin

[![CI](https://example.invalid/badge.svg)](https://example.invalid)

给 DSH 的**示例插件**：把一份清单变成一张可以直接贴出去的卡片。

A demo plugin that turns one manifest into a card you can paste somewhere.

## 能力 / Capabilities

- 从 README 提取标题与一句话
- Extract the install command from a fenced block
- 用 docs/*.png 拼出截图墙
- Render a bilingual card as HTML and PNG

## 限制 / Limitations

- 不做机器翻译，缺的英文要写进 market-card.json
- No machine translation: missing English copy must be declared
- 只有装了 Chromium 系浏览器才能出 PNG
- PNG output needs an installed Chromium-family browser

## 安装 / Install

```sh
dsh plugin --profile web add demo-plugin
```

## 开发

```sh
node --test
```
