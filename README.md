# Markdown Publisher - Obsidian 多平台发布插件

<p align="center">
  <img src="https://img.shields.io/badge/Obsidian-1.0%2B-purple" alt="Obsidian Version">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/version-1.0.0-green" alt="Version">
  <img src="https://img.shields.io/badge/bun-%E2%9A%A1-orange" alt="Bun">
</p>

一键将 Obsidian 笔记发布到各大平台，告别繁琐的排版工作。

## ✨ 功能特性

- 📱 **多平台支持** - 微信公众号、知乎、头条、小红书一键适配
- 🎨 **14 种排版样式** - 从专业商务到复古怀旧，总有一款适合你
- 🌈 **14 种代码主题** - 支持浅色/深色多种代码高亮风格
- 📋 **一键复制** - 自动内联 CSS，粘贴到平台即用
- ⚡ **实时预览** - 编辑时自动更新预览效果
- 🔢 **LaTeX 公式** - 支持数学公式渲染（基于 KaTeX）
- 🔗 **GFM 支持** - 完整支持 GitHub Flavored Markdown

## 📦 安装

### 从 Release 下载（推荐）

1. 前往 [Releases](https://github.com/volcanic/obsidian-md-publisher/releases) 页面
2. 下载最新版本的 `main.js`, `manifest.json`, `styles.css`
3. 在 Obsidian vault 中创建 `.obsidian/plugins/md-publisher/` 目录
4. 将下载的文件放入该目录
5. 重启 Obsidian 并在 **设置 → 第三方插件** 中启用插件

### 从源码构建

```bash
# 克隆项目
git clone https://github.com/volcanic/obsidian-md-publisher.git
cd obsidian-md-publisher

# 安装依赖
bun install

# 开发模式
bun run dev

# 生产构建
bun run build
```

## 🚀 使用方法

1. 打开任意 Markdown 文件
2. 点击左侧边栏的 📄 图标，或使用 `Ctrl/Cmd + P` 搜索 **"打开排版预览"**
3. 选择目标平台、排版样式和代码主题
4. 点击 **"复制"** 按钮，粘贴到目标平台即可

## 🏗️ 项目结构

```
obsidian-md-publisher/
├── src/                    # 源代码
│   ├── main.ts             # 插件入口
│   ├── lib/                # 工具库
│   ├── settings/           # 设置页面
│   ├── themes/             # 主题文件
│   └── views/              # 视图组件
├── scripts/                # 构建脚本
│   └── version.ts          # 版本管理
├── .agent/                 # AI 开发规则
│   └── rules/              # 版本控制规范
├── .github/                # GitHub 配置
│   └── workflows/          # CI/CD 工作流
├── dist/                   # 构建输出
├── manifest.json           # Obsidian 插件清单
└── package.json            # 项目配置
```

## 🛠️ 开发

### 环境要求

- [Bun](https://bun.sh/) >= 1.0.0

### 开发命令

```bash
bun install          # 安装依赖
bun run dev          # 开发模式（监听变化）
bun run build        # 生产构建
bun run version patch # 更新补丁版本
```

### 技术栈

| 模块     | 技术                      |
| -------- | ------------------------- |
| 运行时   | Bun                       |
| 框架     | Obsidian Plugin API       |
| 语言     | TypeScript                |
| 构建     | esbuild                   |
| Markdown | unified + remark + rehype |
| 代码高亮 | highlight.js              |
| 数学公式 | KaTeX                     |

## 📝 支持的平台

| 平台       | 状态 |
| ---------- | ---- |
| 微信公众号 | ✅   |
| 知乎       | ✅   |
| 今日头条   | ✅   |
| 小红书     | ✅   |

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT](LICENSE)
