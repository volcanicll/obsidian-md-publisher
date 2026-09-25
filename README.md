# Markdown Publisher

<p align="center">
  <img src="https://img.shields.io/badge/Obsidian-1.0%2B-purple?style=for-the-badge&logo=obsidian" alt="Obsidian Version">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/version-1.2.2-green?style=for-the-badge" alt="Version">
</p>

> **一键发布 Markdown 到微信公众号**

在 Obsidian 里写好笔记，一键变成排版精美的公众号文章：样式自动处理好，图片自动上传到微信，直接存入草稿箱，不需要再手动调整格式。

<p align="center">
  <a href="https://volcanicll.github.io/obsidian-md-publisher/">🌍 在线落地页</a> ·
  <a href="./docs/USAGE.md">📖 完整使用说明</a> ·
  <a href="https://github.com/volcanicll/obsidian-md-publisher/releases">⬇️ 下载安装</a> ·
  <a href="https://github.com/volcanicll/obsidian-md-publisher/issues">💬 反馈问题</a>
</p>

## ✨ 它能做什么

### 🎨 精心设计的排版主题
内置 11 种排版主题，覆盖常见的公众号内容风格，选定后整篇文章的标题、引用、表格、代码都会呈现统一的设计感：
- **经典风**: Ayu Light、Apple、Bauhaus、Lawning、Novel
- **设计师系列**: 墨韵 Ink（新中式书卷）、科技蓝 Tech（深度长文）、青瓷 Celadon（清新卡片）、志刊 Editorial（黑白杂志）、暖橘 Ember（温暖情绪）、极简 Mono（纯文字排版），整体效果见 [主题设计稿](docs/theme-preview.html)

另有 14 款代码高亮主题（GitHub、Monokai、Dracula、Nord 等），写技术文章时同样得体。

### 📤 一键发布到公众号
- **直接存入草稿箱**：填好标题、作者、摘要，一键送达公众号草稿箱，打开手机即可预览发表
- **复制粘贴也可以**：不想配置 API？点击复制，到公众号后台粘贴，排版原样保留
- **图片全自动**：文中的本地图片自动压缩并上传到微信 CDN，动图保留动画，格式不兼容时自动转换，不用手动处理任何一张图
- **草稿箱管理**：在插件里就能分页查看、删除草稿箱内容
- **数学公式与表格**：支持 LaTeX 公式、表格、任务列表、脚注等完整 Markdown 能力

### 🔑 简单灵活的授权
- **自动模式**：填入公众号的 AppID / AppSecret 即可长期使用
- **手动 token 模式**：不想配 IP 白名单，或家庭宽带 IP 经常变化？粘贴一个临时 token 就能用

## 📦 安装

### 社区插件商店（审核中）
本插件正在提交到 Obsidian 社区插件商店，敬请期待。

### 手动安装

1. 从 [Releases](https://github.com/volcanicll/obsidian-md-publisher/releases) 下载最新版本
2. 将 `main.js`、`manifest.json`、`styles.css` 复制到：
   ```
   .obsidian/plugins/md-publisher/
   ```
3. 在 **设置 → 社区插件** 中启用

## 🚀 快速开始

1. **打开预览**：点击侧边栏 📄 图标，或运行 `打开排版预览` 命令
2. **挑一个主题**：在预览面板顶部切换排版主题与代码高亮，实时看到效果
3. **复制或发布**：
   - 点 **复制**，到公众号编辑器粘贴即可
   - 点 **发布**，直接存入公众号草稿箱（需先完成下方配置）
   - 点 **草稿**，管理公众号草稿箱

## ⚙️ 微信公众号配置

### 自动模式

1. 从 [微信公众平台](https://mp.weixin.qq.com/) 获取 **AppID** 和 **AppSecret**
2. 在 **设置 → Markdown Publisher → 微信公众号** 中填入凭证
3. 将本机 IP 加入 [微信 IP 白名单](https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Getting_Started_Guide.html)
4. 点击 **测试连接** 验证配置

> ⚠️ **注意**：Obsidian 会将 AppSecret 明文保存在本机配置中。若担心泄露，建议使用下方的手动 token 模式。

### 手动 token 模式（IP 经常变化时推荐）

1. 从公众号后台 / 开发工具获取一个 `access_token`
2. 在 **设置 → 微信公众号** 中开启 **使用手动 token**
3. 粘贴 access_token（有效期约 2 小时，过期后重新粘贴即可）

这种方式不需要配置 IP 白名单，特别适合家庭宽带、VPN、移动网络等 IP 经常变化的场景。

## 🤝 反馈与贡献

遇到问题或有新主题的想法，欢迎在 [Issues](https://github.com/volcanicll/obsidian-md-publisher/issues) 提出；代码贡献请参考仓库内的开发文档。

## 📦 第三方组件

插件打包了以下开源项目的产物，在此致谢（许可均为 MIT 或兼容许可）：

- [highlight.js](https://highlightjs.org/) — 代码高亮引擎与官方主题样式
- [Dracula 主题](https://github.com/dracula/highlight.js) — 高亮主题（vendored 自 highlight.js v10 官方样式）
- [KaTeX](https://katex.org/) — 数学公式排版与内联样式
- [juice](https://github.com/Automattic/juice) — CSS 内联处理

## 📄 开源协议

[MIT](LICENSE)
