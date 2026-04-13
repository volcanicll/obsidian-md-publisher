# Markdown Publisher

<p align="center">
  <img src="https://img.shields.io/badge/Obsidian-1.0%2B-purple?style=for-the-badge&logo=obsidian" alt="Obsidian Version">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/version-1.1.4-green?style=for-the-badge" alt="Version">
</p>

> **一键发布 Markdown 到微信公众号、知乎、头条、小红书**

一款强大的 Obsidian 插件，将你的 Markdown 笔记转换为适合各平台的精美内容，支持自动 CSS 内联处理和直接发布。

## ✨ 核心功能

### 🎨 18 种排版主题
精心设计的主题，适配各种内容风格：
- **极简风**: Ayu Light、Professional、GreenSimple
- **开发者**: Terminal、Apple、Midnight  
- **创意风**: Bauhaus、Neo-Brutalism、Maximalism、Playful Geometric
- **经典风**: Retro、Newsprint、Novel、Lawning
- **自然风**: Botanical、Organic、Blueprint、Sketch

### 🌈 14 种代码高亮主题
GitHub (明/暗)、Monokai、Dracula、Nord、One Dark/Light、Atom One Dark/Light、VS/VS2015、Xcode、Kimbie (明/暗)

### 📱 多平台支持
| 平台 | 状态 | 功能 |
|------|------|------|
| **微信公众号** | ✅ 完整支持 | API 直接发布、自动图片上传、草稿管理 |
| **小红书** | ✅ 支持 | 原始 Markdown 复制格式 |
| **知乎** | 🚧 开发中 | 编辑器兼容性优化 |
| **头条** | 🚧 开发中 | 格式适配 |

### 🚀 强大能力
- **实时预览**: 边写边看格式化效果
- **CSS 内联处理**: 自动转换样式以兼容平台
- **图片处理**: 发布时自动上传本地图片到微信公众号 CDN
- **自定义 CSS**: 扩展和个性化任何主题
- **KaTeX & GFM**: 完整支持数学公式和 GitHub 风格 Markdown

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
bun install
bun run build
```

## 🚀 快速开始

1. **打开预览**: 点击侧边栏 📄 图标或运行 `打开排版预览` 命令
2. **选择样式**: 从下拉菜单选择主题和代码高亮
3. **复制或发布**:
   - 点击 **复制** 获取格式化后的 HTML（可用于任何平台）
   - 点击 **发布** 直接发送到微信公众号草稿（需配置）

## ⚙️ 微信公众号发布设置

1. 从 [微信公众平台](https://mp.weixin.qq.com/) 获取 **AppID** 和 **AppSecret**
2. 在 **设置 → Markdown Publisher → 微信公众号配置** 中填入凭证
3. 点击 **测试连接** 验证配置
4. 将服务器 IP 添加到 [微信 IP 白名单](https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Getting_Started_Guide.html)

现在你可以直接发布文章到微信草稿，图片会自动上传！

## 🏗️ 项目结构

```
src/
├── main.ts                    # 插件生命周期与注册
├── lib/
│   ├── markdown/              # Unified/remark/rehype 渲染管线
│   ├── wechat/                # 微信 API 与认证
│   └── image-processor.ts     # 本地图片提取与上传
├── themes/
│   ├── markdown-style/        # 18 种内容主题
│   └── code-theme/            # 14 种代码主题
├── views/
│   ├── PreviewView.ts         # 实时预览面板
│   └── PublishModal.ts        # 发布界面
└── settings/
    └── SettingsTab.ts         # 插件设置 UI
```

## 🛠️ 技术栈

- **运行时**: [Bun](https://bun.sh/)
- **构建**: [esbuild](https://esbuild.github.io/)
- **Markdown**: [unified](https://unifiedjs.com/) + [remark](https://github.com/remarkjs/remark) + [rehype](https://github.com/rehypejs/rehype)
- **样式处理**: [juice](https://github.com/Automattic/juice) (CSS 内联)
- **数学公式**: [KaTeX](https://katex.org/)
- **代码高亮**: [highlight.js](https://highlightjs.org/)

## 🤝 贡献

欢迎贡献！欢迎提交 issue 或 pull request。

## 📄 开源协议

[MIT](LICENSE)
