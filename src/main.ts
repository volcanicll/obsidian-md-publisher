import { Plugin, WorkspaceLeaf } from 'obsidian'
import { BmMdSettingsTab } from './settings/SettingsTab'
import { PreviewView, VIEW_TYPE_PREVIEW } from './views/PreviewView'
import { DraftsModal } from './views/DraftsModal'
import { WeChatApi } from './lib/wechat/wechat-api'

interface BmMdSettings {
  markdownStyle: string
  codeTheme: string
  customCss: string
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
  markdownStyle: 'ayu-light',
  codeTheme: 'github',
  customCss: '',
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

  async onload() {
    await this.loadSettings()

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

    // Add settings tab
    this.addSettingTab(new BmMdSettingsTab(this.app, this))

    console.debug('插件已加载')
  }

  onunload() {
    console.debug('插件已卸载')
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
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
