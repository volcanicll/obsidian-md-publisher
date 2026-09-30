import { Plugin, WorkspaceLeaf, Notice } from 'obsidian'
import { BmMdSettingsTab } from './settings/SettingsTab'
import { PreviewView, VIEW_TYPE_PREVIEW } from './views/PreviewView'
import { DraftsModal } from './views/DraftsModal'
import { WeChatApi } from './lib/wechat/wechat-api'
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
}

const DEFAULT_SETTINGS: BmMdSettings = {
  markdownStyle: 'mist',
  codeTheme: 'github',
  customCss: '',
  // 预览与校验
  scrollSync: true,
  customThemeFolder: '',
  sensitiveWords: '',
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

    // 复制 / 发布此前只能点工具栏按钮，补上命令面板入口以便绑定快捷键
    this.addCommand({
      id: 'copy-preview-html',
      name: '复制公众号排版 HTML',
      callback: () => {
        void this.withPreviewView((view) => void view.copyToClipboard())
      }
    })

    this.addCommand({
      id: 'publish-to-wechat',
      name: '发布到公众号草稿',
      callback: () => {
        void this.withPreviewView((view) => void view.openPublishModal())
      }
    })

    // Add settings tab
    this.addSettingTab(new BmMdSettingsTab(this.app, this))

    console.debug('插件已加载')
  }

  onunload() {
    console.debug('插件已卸载')
  }

  async loadSettings() {
    const saved = (await this.loadData()) as Partial<BmMdSettings> | null
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {})
  }

  async saveSettings() {
    await this.saveData(this.settings)
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

  /** 设置变更后刷新所有打开的预览面板，避免预览停留在旧主题 / 旧自定义 CSS */
  refreshPreviewViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PREVIEW)) {
      const view = leaf.view
      if (view instanceof PreviewView) view.refreshFromSettings()
    }
  }

  /** 在预览面板上执行操作；面板未打开时先打开，让命令面板能触达复制与发布 */
  private async withPreviewView(action: (view: PreviewView) => void): Promise<void> {
    await this.activateView()
    const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_PREVIEW)[0]?.view
    if (view instanceof PreviewView) {
      action(view)
    } else {
      new Notice('无法打开排版预览面板')
    }
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
