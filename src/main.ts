import { Plugin, WorkspaceLeaf } from 'obsidian'
import { BmMdSettingsTab } from './settings/SettingsTab'
import { PreviewView, VIEW_TYPE_PREVIEW } from './views/PreviewView'

interface BmMdSettings {
  markdownStyle: string
  codeTheme: string
  customCss: string
  defaultPlatform: string
}

const DEFAULT_SETTINGS: BmMdSettings = {
  markdownStyle: 'ayu-light',
  codeTheme: 'github',
  customCss: '',
  defaultPlatform: 'wechat'
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
    this.addRibbonIcon('file-text', '打开  排版预览', () => {
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

    // Add settings tab
    this.addSettingTab(new BmMdSettingsTab(this.app, this))

    console.debug(' 插件已加载')
  }

  onunload() {
    console.debug(' 插件已卸载')
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
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
