# Markdown Publisher

<p align="center">
  <img src="https://img.shields.io/badge/Obsidian-1.7.2%2B-purple?style=for-the-badge&logo=obsidian" alt="Obsidian 1.7.2+">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/github/v/release/volcanicll/obsidian-md-publisher?style=for-the-badge&color=green" alt="Version">
</p>

> **在 Obsidian 写好笔记，一键排成公众号文章，直接存进草稿箱。**

<p align="center">
  <img width="100%" src="docs/assets/hero-obsidian.png" alt="在 Obsidian 中左边写 Markdown，右边实时预览公众号排版">
</p>

<p align="center"><em>左边照常写 Markdown，右边就是发出去的公众号文章——同一份 HTML，不是近似效果。</em></p>

排版、配色、图片上传、封面生成、草稿管理，插件全部接管。你要做的只剩两件事：在笔记里把字写完，在手机上点群发。

<p align="center">
  <a href="https://volcanicll.github.io/obsidian-md-publisher/">🌍 在线体验</a> ·
  <a href="./docs/USAGE.md">📖 完整使用说明</a> ·
  <a href="#-安装">⬇️ 安装</a> ·
  <a href="https://github.com/volcanicll/obsidian-md-publisher/issues">💬 反馈问题</a>
</p>

## 🖼 界面一览

<table>
  <tr>
    <td width="50%" valign="top">
      <img width="100%" src="docs/assets/publish-modal.png" alt="发布弹窗：左侧手机预览，右侧填写标题摘要">
      <p align="center"><sub><b>发布弹窗</b>：左边 375px 手机预览，右边直接填标题、摘要、封面，改字即时更新</sub></p>
    </td>
    <td width="50%" valign="top">
      <img width="100%" src="docs/assets/theme-menu.png" alt="主题菜单：11 套排版主题与自定义入口">
      <p align="center"><sub><b>主题菜单</b>：11 套排版主题随时切换，代码高亮随主题自动匹配</sub></p>
    </td>
  </tr>
</table>

## ✨ 三步，从笔记到推文

1. **写**：在 Obsidian 里正常写 Markdown，图片直接 `![[图片.png]]` 引用。
2. **选**：打开预览面板，挑一套排版主题；所见即所得，滚动同步。
3. **发**：点「发布」→「保存到草稿」，文章带着全部样式与图片进入公众号草稿箱。

> 不想配 API 也可以：点「复制」粘贴到公众号后台编辑器，排版与图片原样保留。

## 🎨 十一套排版主题，一套设计语言

不是「换汤不换药」的配色套餐，而是不同的版式语言：四个经典家族各两套，另有三个单套新方向。同一篇笔记换主题，等于换一本刊物的编辑审美。

<p align="center">
  <img width="100%" src="docs/assets/theme-trio.png" alt="同一篇笔记在晨雾、学报、终端三套主题下的效果对比">
</p>

<p align="center"><sub>同一篇《手冲咖啡入门指南》：晨雾 Mist（生活科普）· 学报 Journal（深度长文）· 终端 Terminal（技术教程）</sub></p>

| 家族 | 主题 | 适合 |
|------|------|------|
| 柔和轻氧 | **晨雾 Mist**（默认）· 蜜桃 Peach | 生活、科普、职场、成长 |
| 学院学术 | **学报 Journal** · 笔记 Notes | 长文、深度阅读、学习笔记 |
| 杂志风尚 | **封面 Cover** · 别册 Booklet | 人物、品牌、文化、散文 |
| 素纸墨蓝 | **信笺 Letter** · 拓本 Rubbing | 书信散文、慢读；资料整理、严肃长文 |
| 终端极客 | **终端 Terminal** | 开发教程、工具评测、AI 与编程 |
| 商务数据 | **账本 Ledger** | 行业分析、财经解读、商业评论 |
| 节庆活力 | **橙意 Festive** | 盘点清单、活动召集、节日运营 |

<p align="center">
  <img width="100%" src="docs/assets/theme-showcase.png" alt="十一套排版主题全览">
</p>

<p align="center"><sub>十一套主题全览（均由插件真实渲染管线生成，所见即发布效果）</sub></p>

所有主题都针对公众号移动端阅读设计：只用内联样式、系统字体栈、无 hover、无外部资源。代码高亮跟随排版主题自动匹配（Dracula、GitHub Dark 等深色配色），写技术文章同样得体；也可以放入 `.css` 文件定义自己的主题，或用「自定义 Custom」从零搭建。

## 📤 发布链路，交给它

- **直接存入草稿箱**：填好标题、作者、摘要，一键送达草稿箱，手机上预览后群发。
- **边填边看的一体化发布弹窗**：左侧 375px 手机预览（文章页 / 分享卡片 / 手机预览三个标签），右侧直接填表；封面在弹窗里换（正文首图 / vault 选图 / 上传本地文件 / 按标题生成），检查结果在同窗口底部抽屉里展开。草稿保存后「手机预览」会生成二维码，微信扫一扫即可在真机上看这篇草稿。
- **重复发布不堆草稿**：同一篇笔记再次发布会默认覆盖上次生成的草稿（`draft/update`），也可随时改为新建或另选一篇草稿覆盖；封面没改就复用已上传的素材，不重复上传。
- **草稿也能拉回笔记**：草稿管理里点「拉取到笔记」，正文会还原成可编辑的 Markdown 存进 vault（标题层级、列表、表格、代码、公式、callout 都在），图片一并下载；作者、摘要、原文链接与草稿 id 写进 frontmatter，改完再发布就是覆盖更新那一篇。
- **发布前预览与校验**：手机框模拟公众号文章页实际效果；支持链接有效性检查、敏感词检测（内置词表 + 自定义词条）、字段长度核查，结果仅提示不拦截。
- **内容格式兼容**：Mermaid 图表自动转 PNG 并上传；Callout 提示框转为公众号卡片样式（支持折叠写法）；`![[笔记名]]` 与 `![[笔记名#标题]]` 嵌入转为引用块。
- **封面自动处理**：自动用正文首图作封面；全文无图时可指定封面图，或按文章标题自动生成标题卡片封面。「正文顶部显示封面」决定文章页顶部是否重复展示封面。
- **图片全自动**：本地图片自动压缩上传，外链图片自动转存；GIF 保留动画，WebP / BMP / SVG 自动转 PNG，PNG 转 JPEG 时自动铺白底，不出现黑底。
- **失败即中止**：任一图片上传失败就取消发布并明确提示，绝不产出残留本地路径的裂图草稿。
- **草稿箱管理**：在插件内分页查看、删除草稿箱内容，并标出每篇草稿来自哪篇笔记；也能把任意草稿拉回 Obsidian 继续编辑。
- **也可以只复制**：不想配置 API？点「复制」，到公众号后台粘贴，排版与图片原样保留（图片自动内联，不会出现裂图）。
- **导出为图片**：一键把排版结果截成 PNG 长图（宽度跟随预览面板实际宽度，上限 1080px；缩放 1x–3x），自动保存到 vault。适合发到不支持富文本的平台（小红书、微博、朋友圈）或存档留底；本地与外链图片会先内联，长文超出画布上限时自动降级缩放并提示。
- **完整 Markdown 能力**：GFM 表格、任务列表、脚注、删除线，KaTeX 块级公式，代码块高亮，Obsidian `![[图片.png]]` 嵌入语法与 `==高亮==`；双链 `[[笔记]]` 按可读文本输出。任务列表勾选状态与脚注在公众号里都能正常显示，金额与 Shell 变量（`$10`、`$HOME`）也不会被误当作公式改写。
- **预览即所得**：编辑器与预览面板双向滚动同步，长文定位不迷路；重渲染时保持阅读位置。
- **主题随心定制**：「自定义 Custom」入口配合自定义 CSS 从零搭建排版；也可在 vault 主题文件夹中放入 `.css` 文件直接作为主题使用。

## 🔑 授权不折腾

- **自动模式**：填入公众号 AppID / AppSecret 即可长期使用（需配置 IP 白名单）。
- **手动 token 模式**：不想配白名单，或家庭宽带 IP 经常变化？粘贴一个临时 token 就能用。

## 📦 安装

### 社区插件市场（推荐）

插件已上架 Obsidian 社区插件市场：

1. 打开 **设置 → 第三方插件 → 浏览**
2. 搜索 **Markdown Publisher**
3. 安装并启用

### 手动安装

1. 从 [Releases](https://github.com/volcanicll/obsidian-md-publisher/releases) 下载最新版本
2. 将 `main.js`、`manifest.json`、`styles.css` 复制到：
   ```
   .obsidian/plugins/md-publisher/
   ```
3. 在 **设置 → 第三方插件** 中启用

## 🚀 快速开始

1. **打开预览**：点击侧边栏 📄 图标，或运行命令 `打开排版预览`
2. **挑一个主题**：在预览面板顶部切换排版主题，代码高亮会自动跟随，实时看到效果
3. **复制或发布**：
   - 点 **复制**，到公众号编辑器粘贴即可
   - 点 **发布**，直接存入公众号草稿箱（需先完成下方配置）
   - 点 **草稿**，管理公众号草稿箱，或把草稿拉回笔记继续编辑

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

这种方式不需要配置 IP 白名单，特别适合家庭宽带、VPN、移动网络等 IP 经常变化的场景。更多细节见 [完整使用说明](./docs/USAGE.md)。

## ❓ 常见问题

- **测试连接失败？** 检查 AppID / AppSecret、IP 白名单（自动模式），或 token 是否过期（手动模式）。
- **报错「IP 不在白名单」？** 换网络后本机 IP 会变。可改用手动 token 模式绕过。
- **为什么没有移动端？** 插件依赖桌面端能力，仅支持 Obsidian 桌面版。
- **发布的样式错乱？** 公众号编辑器会过滤部分标签，先在预览面板确认效果，必要时用「自定义 CSS」调整。

## English

**Markdown Publisher** is an Obsidian plugin that turns your notes into WeChat Official Account-ready articles and saves them straight to your draft box.

- **Eleven designer themes** ("Paper Press" set), plus 14 official highlight.js code themes, custom themes from a vault folder, and a fully custom option
- **Fully inlined CSS**, so pasted or published HTML keeps its styling in the WeChat editor
- **Automatic image handling**: local images are compressed and uploaded to the WeChat CDN, external images are re-hosted, GIF animations are preserved, and SVG/WebP are converted
- **Mermaid diagrams** render to crisp PNG images and upload automatically; **Obsidian Callouts** become styled cards; **note embeds** (`![[note]]`, `![[note#heading]]`) are inlined as quote blocks
- **Pre-publish preview & checks**: a phone-frame mock of the actual WeChat article, link validity checking, heuristic sensitive-word detection, and live field-length counters
- **Bidirectional scroll sync** between the editor and the preview pane
- **Automatic covers**: uses your chosen cover, the article's first image, or a generated title card
- **Overwrite instead of duplicates**: re-publishing a note updates the draft it created last time (`draft/update`); you can still choose to create a new draft or pick another draft to overwrite
- **Fails safely**: if any image fails to upload, publishing is cancelled instead of leaving a broken draft
- **KaTeX math**, GFM tables, task lists, footnotes, and Obsidian `![[image.png]]` embeds

Install it from the Obsidian community plugins browser (search for "Markdown Publisher") or download the latest release. To publish, configure your WeChat Official Account with an AppID/AppSecret pair (requires an IP allowlist) or paste a temporary access token if your IP changes often.

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
