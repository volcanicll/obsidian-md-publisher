# Markdown Publisher

<p align="center">
  <img src="https://img.shields.io/badge/Obsidian-1.0%2B-purple?style=for-the-badge&logo=obsidian" alt="Obsidian Version">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/version-1.1.5-green?style=for-the-badge" alt="Version">
</p>

> **一键发布 Markdown 到微信公众号**

一款专注于微信公众号排版的 Obsidian 插件：将 Markdown 笔记转换为适合公众号的精美排版，自动内联 CSS、自动上传本地图片，直接存入公众号草稿箱。

<p align="center">
  <a href="https://volcanicll.github.io/obsidian-md-publisher/">🌍 在线落地页</a> ·
  <a href="./docs/USAGE.md">📖 完整使用说明</a> ·
  <a href="https://github.com/volcanicll/obsidian-md-publisher/releases">⬇️ 下载安装</a> ·
  <a href="https://github.com/volcanicll/obsidian-md-publisher/issues">💬 反馈问题</a>
</p>

## ✨ 核心功能

### 🎨 排版主题
精心设计的 18 种排版主题，适配各种内容风格：
- **极简风**: Ayu Light、Professional、GreenSimple
- **开发者**: Terminal、Apple、Midnight
- **创意风**: Bauhaus、Neo-Brutalism、Maximalism、Playful Geometric
- **经典风**: Retro、Newsprint、Novel、Lawning
- **自然风**: Botanical、Organic、Blueprint、Sketch

### 🌈 代码高亮主题
14 款官方 [highlight.js](https://highlightjs.org/) 主题：GitHub (明/暗)、Monokai、Dracula、Nord、One Dark/Light、Atom One Dark/Light、VS/VS2015、Xcode、Kimbie (明/暗)。

### 📤 公众号发布
- **API 直接发布**：一键将文章存入公众号草稿箱
- **自动图片上传**：本地图片自动压缩、上传到微信 CDN；GIF 保留动画，SVG / WebP 自动转换为受支持格式，PNG 透明通道不丢失
- **Obsidian 嵌入语法**：支持 `![[图片.png]]` 与 `![[图片.png|300]]` 的排版与上传
- **草稿管理**：在预览面板分页查看、删除草稿箱内容
- **发布选项**：标题、作者、摘要、原文链接，以及「开启评论」「仅粉丝可评论」；发布前自动校验微信字段长度限制
- **KaTeX & GFM**：完整支持数学公式和 GitHub 风格 Markdown（表格、任务列表、脚注等）

### 🔑 灵活的认证方式
- **自动模式**：使用 AppID/AppSecret 自动获取 token（需将本机 IP 加入公众号白名单）
- **手动 token 模式**：绕过 IP 白名单限制，粘贴 access_token 即可使用（有效期约 2 小时）

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

### 开发者构建

```bash
git clone https://github.com/volcanicll/obsidian-md-publisher.git
cd obsidian-md-publisher
bun install      # 或 npm install
bun run build    # 或 npm run build
```

## 🚀 快速开始

1. **打开预览**: 点击侧边栏 📄 图标或运行 `打开排版预览` 命令
2. **选择样式**: 在预览面板顶部选择排版主题与代码高亮主题
3. **复制或发布**:
   - 点击 **复制** 复制公众号 HTML 格式（含内联样式），可粘贴到公众号编辑器
   - 点击 **发布** 直接存入公众号草稿箱（需先配置）
   - 点击 **草稿** 管理公众号草稿箱

## ⚙️ 微信公众号配置

### 自动模式

1. 从 [微信公众平台](https://mp.weixin.qq.com/) 获取 **AppID** 和 **AppSecret**
2. 在 **设置 → Markdown Publisher → 微信公众号** 中填入凭证
3. 将本机 IP 加入 [微信 IP 白名单](https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Getting_Started_Guide.html)
4. 点击 **测试连接** 验证配置

> ⚠️ **注意**：Obsidian 会将 AppSecret 明文保存在本机配置中。若担心泄露，建议使用下方的手动 token 模式。

### 手动 token 模式（推荐用于 IP 频繁变化）

1. 从公众号后台 / 开发工具获取一个 `access_token`
2. 在 **设置 → 微信公众号** 中开启 **使用手动 token**
3. 粘贴 access_token（有效期约 2 小时，过期后重新粘贴即可）

这种方式不需要配置 IP 白名单，特别适合家庭宽带、VPN、移动网络等 IP 经常变化的场景。

## 🏗️ 项目结构

```
docs/
├── index.html                 # 项目落地页（GitHub Pages 部署）
└── USAGE.md                   # 完整使用说明
src/
├── main.ts                    # 插件生命周期与注册
├── lib/
│   ├── markdown/render.ts     # Unified/remark/rehype 渲染管线（含 KaTeX CSS 内联）
│   ├── wechat/                # 微信 API、认证与草稿管理
│   └── image-processor.ts     # 本地图片提取、压缩、SVG 转换与上传
├── themes/
│   ├── markdown-style/        # 18 种排版主题
│   └── code-theme/            # 14 种官方 highlight.js 主题
├── views/
│   ├── PreviewView.ts         # 实时预览面板
│   ├── PublishModal.ts        # 发布界面
│   └── DraftsModal.ts         # 草稿箱管理
└── settings/
    └── SettingsTab.ts         # 插件设置 UI
tests/                         # vitest 单元测试
```

## 🛠️ 技术栈

- **运行时 / 构建**: [Bun](https://bun.sh/) + [esbuild](https://esbuild.github.io/)
- **Markdown**: [unified](https://unifiedjs.com/) + [remark](https://github.com/remarkjs/remark) + [rehype](https://github.com/rehypejs/rehype)
- **样式处理**: [juice](https://github.com/Automattic/juice)（CSS 内联）
- **数学公式**: [KaTeX](https://katex.org/)
- **代码高亮**: [highlight.js](https://highlightjs.org/)
- **测试**: [vitest](https://vitest.dev/)

## 🤝 贡献

欢迎贡献！无论是新主题、Bug 修复还是文档改进，都非常欢迎。

### 本地开发

```bash
git clone https://github.com/volcanicll/obsidian-md-publisher.git
cd obsidian-md-publisher
bun install
bun run dev      # 开发模式（watch）
bun run build    # 生产构建
bun run check    # lint + 类型检查 + 单元测试
```

### 贡献流程

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feat/your-feature`）
3. 提交更改，确保 `bun run check` 与 `bun run build` 通过
4. 提交 Pull Request，描述清楚改动与动机

### 🔧 维护与自动化

本项目已建立自动化维护流程，降低重复性维护成本：

- **CI 流水线**：[`.github/workflows/ci.yml`](.github/workflows/ci.yml) 在 push / PR 时自动执行 lint、类型检查、单元测试与构建
- **发布流水线**：[`.github/workflows/release.yml`](.github/workflows/release.yml) 在 tag 推送时校验版本一致性、运行完整检查后自动构建并发布 Release
- **版本管理**：通过 [`.agent/skills/obsidian-version-manager`](.agent/skills/obsidian-version-manager) 自动同步 `package.json`、`manifest.json`、`versions.json` 的版本号
- **AI 辅助维护**：借助 AI Agent 协助代码审查、PR 评审与发布检查清单，提升维护效率

如果你在使用中遇到问题，欢迎在 [Issues](https://github.com/volcanicll/obsidian-md-publisher/issues) 提出。

## 📄 开源协议

[MIT](LICENSE)
