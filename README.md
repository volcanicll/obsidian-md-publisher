# Markdown Publisher - Obsidian 多平台发布插件

<p align="center">
  <img src="https://img.shields.io/badge/Obsidian-1.0%2B-purple?style=for-the-badge&logo=obsidian" alt="Obsidian Version">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/version-1.0.0-green?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/bun-%E2%9A%A1-orange?style=for-the-badge" alt="Bun">
</p>

**Markdown Publisher** 是一款为 Obsidian 用户打造的多平台内容分发利器。它能将你的 Obsidian 笔记一键转换成适配各大内容平台的精美排版，并自动完成 CSS 内联处理。

## ✨ 功能特性

- 📱 **多平台适配**：针对不同平台（如微信公众号）进行深度优化。
- 🎨 **丰富排版方案**：内置 **17 种** 经过精心设计的 Markdown 样式。
  - _包含：Ayu Light, Professional, GreenSimple, Terminal, Retro, Bauhaus, Blueprint, Botanical, Maximalism, Neo-Brutalism, Newsprint, Organic, Playful Geometric, Sketch, Apple, Midnight, Lawning, Novel_
- 🌈 **极致代码高亮**：提供 **14 种** 主流代码主题。
  - _支持：GitHub (Light/Dark), Monokai, Dracula, Nord, One Dark/Light, Atom One Dark/Light, VS/VS2015, Xcode, Kimbie (Light/Dark)_
- 📋 **智能一键复制**：点击复制即可完成 CSS 内联转换，无需任何额外插件。
- ⚡ **毫秒级实时预览**：边写边看，即刻感知排版效果。
- 🔢 **公式与扩展支持**：完整支持 KaTeX 数学公式及 GFM (GitHub Flavored Markdown)。
- 🛠️ **自定义扩展**：支持自定义 CSS，打造属于你的专属风格。

## 📦 安装

### 方式一：从 Release 下载（推荐）

1. 访问 [Releases](https://github.com/volcanic/obsidian-md-publisher/releases) 页面。
2. 下载最新版本的 `main.js`, `manifest.json`, `styles.css`。
3. 在你的 Obsidian 库（Vault）中找到 `.obsidian/plugins/` 目录。
4. 新建文件夹 `md-publisher`，并将上述三个文件放入其中。
5. 在 Obsidian **设置 → 第三方插件** 中关闭“安全模式”，并开启 **Markdown Publisher**。

### 方式二：命令行构建（开发者）

```bash
# 1. 克隆项目
git clone https://github.com/volcanic/obsidian-md-publisher.git
cd obsidian-md-publisher

# 2. 安装依赖（推荐使用 Bun）
bun install

# 3. 生产模式构建
bun run build
```

## 🚀 使用技巧

1. **进入排版视图**：
   - 点击左侧边栏的 **📄** 图标；
   - 或使用快捷键 `Cmd/Ctrl + P` 呼出命令面板，搜索并执行 `打开排版预览`。
2. **选择样式**：在右侧面板的下拉菜单中即时切换主题和代码风格。
3. **内容发布**：选择对应平台（如微信公众号），点击 **"复制"** 按钮，直接在平台编辑器中粘贴。

## 🏗️ 插件架构

```text
src/
├── main.ts             # 插件核心逻辑与生命周期
├── lib/markdown        # 基于 unified/remark/rehype 的渲染系统
├── themes/             # 排版资源库
│   ├── markdown-style  # 17+ 笔记排版样式
│   └── code-theme      # 14+ 代码块高亮主题
├── views/              # 预览面板交互视图
└── settings/           # 插件配置页面
```

## 📝 平台支持进度

| 平台           | 状态      | 说明                             |
| :------------- | :-------- | :------------------------------- |
| **微信公众号** | ✅ 已支持 | 优化了图片、列表及公式的内联表现 |
| **知乎**       | ❌ 开发中 | 待优化编辑器兼容性               |
| **今日头条**   | ❌ 开发中 | 格式适配中                       |
| **小红书**     | ❌ 规划中 | 针对移动端展示进行调研           |

## 🛠️ 技术栈

- **运行时**: [Bun](https://bun.sh/)
- **构建工具**: [esbuild](https://esbuild.github.io/)
- **渲染引擎**: [unified](https://unifiedjs.com/) (remark + rehype)
- **内联处理**: [juice](https://github.com/Automattic/juice)
- **数学公式**: [KaTeX](https://katex.org/)
- **代码高亮**: [highlight.js](https://highlightjs.org/)

## 🤝 参与贡献

如果你有更好的排版方案或发现了 Bug，欢迎提交 [Issue](https://github.com/volcanic/obsidian-md-publisher/issues) 或 Pull Request。

## 📄 开源协议

本项目采用 [MIT](LICENSE) 协议。
