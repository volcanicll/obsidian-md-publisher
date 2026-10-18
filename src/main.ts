import { Plugin, TFile, WorkspaceLeaf } from 'obsidian'
import { BmMdSettingsTab } from './settings/SettingsTab'
import { PreviewView, VIEW_TYPE_PREVIEW } from './views/PreviewView'
import { DraftsModal } from './views/DraftsModal'
import { WeChatApi } from './lib/wechat/wechat-api'
import {
  normalizeDraftLinks,
  removeDraftLinkByMediaId,
  renameDraftLink,
  type DraftLink,
  type DraftLinkMap
} from './lib/wechat/draft-links'
import {
  clearDraftFrontmatter,
  readDraftFrontmatter
} from './lib/wechat/draft-frontmatter'
import { loadCustomThemes } from './lib/custom-themes'
import { getAllMarkdownStyles, type MarkdownStyle } from './themes/markdown-style'

interface BmMdSettings {
  markdownStyle: string
  codeTheme: string
  customCss: string
  // 预览与校验
  scrollSync: boolean
  customThemeFolder: string
  sensitiveWords: string
  /** 是否把单个 $...$ 解析为行内公式（默认关闭，避免金额与 Shell 变量被改写） */
  inlineDollarMath: boolean
  // 导出图片（宽度跟随预览面板实际宽度，不再是设置项）
  exportImageScale: number
  exportImageFolder: string
  // WeChat Official Account settings
  wechatAppId: string
  wechatAppSecret: string
  wechatAccessToken: string
  wechatTokenExpireTime: number
  // 手动 token 模式（绕过 IP 白名单）：只使用手动粘贴的 access_token
  useManualToken: boolean
  manualAccessToken: string
  manualTokenExpireTime: number
  // 发布默认值
  defaultOpenComment: boolean
  defaultFansOnlyComment: boolean
  /** 文章页顶部是否展示封面，映射到 show_cover_pic */
  showCoverInBody: boolean
  /** 笔记路径 → 已发布草稿，用于「覆盖更新已有草稿」 */
  draftLinks: DraftLinkMap
  /** 从草稿箱拉取笔记时保存到的文件夹；留空为 vault 根目录 */
  draftImportFolder: string
}

const DEFAULT_SETTINGS: BmMdSettings = {
  markdownStyle: 'mist',
  codeTheme: 'github',
  customCss: '',
  // 预览与校验
  scrollSync: true,
  customThemeFolder: '',
  sensitiveWords: '',
  inlineDollarMath: false,
  // 导出图片默认值：2x 缩放，与笔记同目录；宽度跟随预览面板实际宽度
  exportImageScale: 2,
  exportImageFolder: '',
  // WeChat defaults
  wechatAppId: '',
  wechatAppSecret: '',
  wechatAccessToken: '',
  wechatTokenExpireTime: 0,
  // 手动 token 默认关闭
  useManualToken: false,
  manualAccessToken: '',
  manualTokenExpireTime: 0,
  defaultOpenComment: false,
  defaultFansOnlyComment: false,
  showCoverInBody: true,
  draftLinks: {},
  draftImportFolder: '',
}

export default class BmMdPlugin extends Plugin {
  settings: BmMdSettings = DEFAULT_SETTINGS
  /** vault 导入的自定义主题缓存，随插件加载与设置变更刷新 */
  customThemes: MarkdownStyle[] = []

  async onload() {
    await this.loadSettings()
    await this.refreshCustomThemes()

    // Register the preview view
    try {
      this.registerView(VIEW_TYPE_PREVIEW, (leaf) => new PreviewView(leaf, this))
    } catch (e) {
      const error = e as Error
      // Ignore if view is already registered
      // This often happens during hot reload or if previous unload failed
      if (error.message && error.message.includes('already registered')) {
        console.debug('View already registered, skipping registration.')
      } else {
        throw error
      }
    }

    // Add ribbon icon to open preview
    this.addRibbonIcon('file-text', '打开排版预览', () => {
      void this.activateView()
    })

    // Add command to open preview
    this.addCommand({
      id: 'open-preview',
      name: '打开排版预览',
      callback: () => {
        void this.activateView()
      }
    })

    // Add command to manage WeChat drafts
    this.addCommand({
      id: 'open-drafts',
      name: '管理公众号草稿',
      callback: () => {
        new DraftsModal(this.app, this).open()
      }
    })

    // Add command to export the preview as an image
    this.addCommand({
      id: 'export-image',
      name: '导出为图片',
      callback: () => {
        void this.exportPreviewImage()
      }
    })

    // Add settings tab
    this.addSettingTab(new BmMdSettingsTab(this.app, this))

    // 笔记重命名/移动后迁移草稿关联，否则再次发布会被当成新笔记而重复建草稿
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        const next = renameDraftLink(this.settings.draftLinks, oldPath, file.path)
        if (next === this.settings.draftLinks) return
        this.settings.draftLinks = next
        void this.saveSettings()
      })
    )

    console.debug('插件已加载')
  }

  onunload() {
    console.debug('插件已卸载')
  }

  async loadSettings() {
    const saved = (await this.loadData()) as Partial<BmMdSettings> | null
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {})
    // 持久化数据可能被手工编辑过，结构不完整的关联记录直接丢弃
    this.settings.draftLinks = normalizeDraftLinks(this.settings.draftLinks)
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }

  /** 读取某篇笔记关联的草稿；没有则返回 null */
  getDraftLink(notePath: string | null): DraftLink | null {
    if (!notePath) return null
    return this.settings.draftLinks[notePath] ?? null
  }

  /** 记录/更新笔记与草稿的关联并持久化 */
  async setDraftLink(notePath: string, link: DraftLink): Promise<void> {
    this.settings.draftLinks = { ...this.settings.draftLinks, [notePath]: link }
    await this.saveSettings()
  }

  /**
   * 清除指向某篇草稿的所有关联（草稿被删除后调用）。
   *
   * 除了插件设置里的关联表，还要清掉笔记 frontmatter 里的 `wechat` 段：
   * 那里同样存着 media_id，留着会让下次发布继续去覆盖一篇已删除的草稿。
   */
  async clearDraftLinksByMediaId(mediaId: string): Promise<void> {
    const affected = Object.entries(this.settings.draftLinks)
      .filter(([, link]) => link.mediaId === mediaId)
      .map(([path]) => path)

    const next = removeDraftLinkByMediaId(this.settings.draftLinks, mediaId)
    if (next !== this.settings.draftLinks) {
      this.settings.draftLinks = next
      await this.saveSettings()
    }

    for (const path of affected) {
      await this.clearNoteDraftFrontmatter(path, mediaId)
    }
  }

  /** 清掉某篇笔记 frontmatter 里指向指定草稿的元数据 */
  private async clearNoteDraftFrontmatter(
    notePath: string,
    mediaId: string
  ): Promise<void> {
    // 单元测试里插件可能没有 app 实例
    if (!this.app?.vault) return
    const file = this.app.vault.getAbstractFileByPath(notePath)
    if (!(file instanceof TFile)) return

    try {
      await this.app.vault.process(file, (content) => {
        const saved = readDraftFrontmatter(content)
        // 笔记后来改指向别的草稿时不动它
        if (saved?.media_id !== mediaId) return content
        return clearDraftFrontmatter(content)
      })
    } catch (error) {
      console.warn('清理笔记 frontmatter 失败:', error)
    }
  }

  /** 反查某篇草稿关联的笔记路径 */
  findNotePathByDraftId(mediaId: string): string | null {
    for (const [path, link] of Object.entries(this.settings.draftLinks)) {
      if (link.mediaId === mediaId) return path
    }
    return null
  }

  /** 重新扫描自定义主题文件夹，并刷新缓存的列表 */
  async refreshCustomThemes(): Promise<void> {
    try {
      this.customThemes = await loadCustomThemes(this.app, this.settings.customThemeFolder)
    } catch (err) {
      console.warn('自定义主题扫描失败:', err)
      this.customThemes = []
    }
  }

  /** 全量主题列表：内置 + vault 导入 + 「自定义」入口 */
  getMarkdownStyleList(): MarkdownStyle[] {
    return getAllMarkdownStyles(this.customThemes)
  }

  /**
   * 按当前设置构造微信 API 客户端。
   * 自动模式下 token 刷新后回写并持久化；手动模式下 token 永不自动刷新。
   */
  createWeChatApi(): WeChatApi {
    const s = this.settings
    return new WeChatApi(
      {
        appId: s.wechatAppId,
        appSecret: s.wechatAppSecret,
        accessToken: s.useManualToken ? s.manualAccessToken : s.wechatAccessToken,
        tokenExpireTime: s.useManualToken ? s.manualTokenExpireTime : s.wechatTokenExpireTime,
        manualMode: s.useManualToken
      },
      {
        onTokenRefresh: async (token, expireTime) => {
          if (s.useManualToken) return
          s.wechatAccessToken = token
          s.wechatTokenExpireTime = expireTime
          await this.saveSettings()
        }
      }
    )
  }

  /** 打开（或复用）排版预览视图，并导出当前笔记为图片 */
  async exportPreviewImage(): Promise<void> {
    await this.activateView()
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PREVIEW)[0]
    if (leaf && leaf.view instanceof PreviewView) {
      await leaf.view.exportImage()
    }
  }

  async activateView() {
    const { workspace } = this.app

    let leaf: WorkspaceLeaf | null = null
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_PREVIEW)

    if (leaves.length > 0) {
      // View already exists, reveal it
      leaf = leaves[0]
    } else {
      // Create new view in right sidebar
      leaf = workspace.getRightLeaf(false)
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_PREVIEW, active: true })
      }
    }

    if (leaf) {
      await workspace.revealLeaf(leaf)
    }
  }
}
