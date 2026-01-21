import { ItemView, WorkspaceLeaf, MarkdownView, Menu, TFile, Notice } from 'obsidian'
import type BmMdPlugin from '../main'
import { render, Platform } from '../lib/markdown/render'
import { markdownStyles } from '../themes/markdown-style'
import { codeThemes } from '../themes/code-theme'
import { PublishModal } from './PublishModal'

export const VIEW_TYPE_PREVIEW = 'obsidian-md-publisher'

const PLATFORMS: { id: Platform; name: string }[] = [
  { id: 'wechat', name: '公众号' },
  // { id: 'zhihu', name: '知乎' },
  // { id: 'toutiao', name: '头条' },
  { id: 'xiaohongshu', name: '小红书' },
]

export class PreviewView extends ItemView {
  plugin: BmMdPlugin
  currentPlatform: Platform = 'wechat'
  currentMarkdownStyle: string = 'ayu-light'
  currentCodeTheme: string = 'github'
  previewContainer: HTMLElement | null = null
  tabsContainer: HTMLElement | null = null
  styleSelector: HTMLElement | null = null
  codeThemeSelector: HTMLElement | null = null
  publishBtnEl: HTMLElement | null = null
  settingsRowEl: HTMLElement | null = null
  
  // Cache markdown content and rendered HTML per platform
  private lastMarkdownContent: string | null = null
  private lastActiveFile: TFile | null = null
  private renderedHtmlCache: Map<Platform, string> = new Map()

  constructor(leaf: WorkspaceLeaf, plugin: BmMdPlugin) {
    super(leaf)
    this.plugin = plugin
    this.currentPlatform = (plugin.settings.defaultPlatform as Platform) || 'wechat'
    this.currentMarkdownStyle = plugin.settings.markdownStyle || 'ayu-light'
    this.currentCodeTheme = plugin.settings.codeTheme || 'github'
  }

  getViewType(): string {
    return VIEW_TYPE_PREVIEW
  }

  getDisplayText(): string {
    return ' 排版预览'
  }

  getIcon(): string {
    return 'file-text'
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1]
    container.empty()
    container.addClass('bm-md-container')

    // Toolbar
    const toolbar = container.createDiv({ cls: 'bm-md-toolbar' })

    // Platform tabs
    this.tabsContainer = toolbar.createDiv({ cls: 'bm-md-tabs' })
    this.renderTabs()
    
    // Button group
    const buttonGroup = toolbar.createDiv({ cls: 'bm-md-button-group' })

    // Copy button
    const copyBtn = buttonGroup.createDiv({ cls: 'bm-md-copy-btn' })
    copyBtn.createSpan({ cls: 'bm-md-copy-icon', text: '📋' })
    copyBtn.createSpan({ text: '复制' })
    copyBtn.addEventListener('click', () => {
      void this.copyToClipboard()
    })

    // Publish button (hidden for xiaohongshu)
    this.publishBtnEl = buttonGroup.createDiv({ cls: 'bm-md-publish-btn' })
    this.publishBtnEl.createSpan({ cls: 'bm-md-publish-icon', text: '📤' })
    this.publishBtnEl.createSpan({ text: '发布' })
    this.publishBtnEl.addEventListener('click', () => {
      void this.openPublishModal()
    })

    // Settings row (hidden for xiaohongshu)
    this.settingsRowEl = container.createDiv({ cls: 'bm-md-settings' })
    this.renderSelectors(this.settingsRowEl)

    // Update UI visibility based on current platform
    this.updatePlatformUI()

    // Preview container
    this.previewContainer = container.createDiv({ cls: 'bm-md-preview' })

    // Listen for file changes
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.refreshMarkdownCache()
        this.clearRenderedCache()
        void this.updatePreview()
      })
    )

    this.registerEvent(
      this.app.workspace.on('editor-change', () => {
        this.refreshMarkdownCache()
        this.clearRenderedCache()
        this.debounceUpdatePreview()
      })
    )

    // Initial render
    this.refreshMarkdownCache()
    await this.updatePreview()
  }

  refreshMarkdownCache(): void {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (activeView && activeView.file) {
      this.lastActiveFile = activeView.file
      this.lastMarkdownContent = activeView.editor.getValue()
    }
  }

  clearRenderedCache(): void {
    this.renderedHtmlCache.clear()
  }

  renderTabs(): void {
    if (!this.tabsContainer) return
    this.tabsContainer.empty()

    PLATFORMS.forEach(platform => {
      const tab = this.tabsContainer!.createDiv({
        cls: `bm-md-tab ${platform.id === this.currentPlatform ? 'active' : ''}`,
        text: platform.name
      })
      tab.addEventListener('click', () => {
        this.currentPlatform = platform.id
        this.clearRenderedCache()
        this.renderTabs()
        this.updatePlatformUI()
        void this.updatePreview()
      })
    })
  }

  /**
   * Update UI visibility based on current platform
   * Xiaohongshu: hide publish button and theme selectors, use fixed style
   */
  updatePlatformUI(): void {
    const isXiaohongshu = this.currentPlatform === 'xiaohongshu'
    
    // Hide/show publish button
    if (this.publishBtnEl) {
      this.publishBtnEl.style.display = isXiaohongshu ? 'none' : ''
    }
    
    // Hide/show settings row (theme selectors)
    if (this.settingsRowEl) {
      this.settingsRowEl.style.display = isXiaohongshu ? 'none' : ''
    }
    
    // For xiaohongshu, always use the xiaohongshu theme
    if (isXiaohongshu) {
      this.currentMarkdownStyle = 'xiaohongshu'
      this.currentCodeTheme = 'github' // Simple code theme
    }
  }

  renderSelectors(container: HTMLElement): void {
    // Markdown Style Selector
    const styleGroup = container.createDiv({ cls: 'bm-md-selector-group' })
    styleGroup.createSpan({ text: '主题:', cls: 'bm-md-selector-label' })
    
    this.styleSelector = styleGroup.createDiv({ cls: 'bm-md-selector' })
    this.updateStyleSelector()
    this.styleSelector.addEventListener('click', (e) => this.showStyleMenu(e))

    // Code Theme Selector
    const codeGroup = container.createDiv({ cls: 'bm-md-selector-group' })
    codeGroup.createSpan({ text: '代码:', cls: 'bm-md-selector-label' })
    
    this.codeThemeSelector = codeGroup.createDiv({ cls: 'bm-md-selector' })
    this.updateCodeThemeSelector()
    this.codeThemeSelector.addEventListener('click', (e) => this.showCodeThemeMenu(e))
  }

  updateStyleSelector(): void {
    if (!this.styleSelector) return
    const style = markdownStyles.find(s => s.id === this.currentMarkdownStyle)
    this.styleSelector.setText(style?.name || this.currentMarkdownStyle)
  }

  updateCodeThemeSelector(): void {
    if (!this.codeThemeSelector) return
    const theme = codeThemes.find(t => t.id === this.currentCodeTheme)
    this.codeThemeSelector.setText(theme?.name || this.currentCodeTheme)
  }

  showStyleMenu(e: MouseEvent): void {
    const menu = new Menu()
    markdownStyles.forEach(style => {
      menu.addItem(item => {
        item.setTitle(style.name)
          .setChecked(style.id === this.currentMarkdownStyle)
          .onClick(async () => {
            this.currentMarkdownStyle = style.id
            this.plugin.settings.markdownStyle = style.id
            await this.plugin.saveSettings()
            this.updateStyleSelector()
            this.clearRenderedCache()
            void this.updatePreview()
          })
      })
    })
    menu.showAtMouseEvent(e)
  }

  showCodeThemeMenu(e: MouseEvent): void {
    const menu = new Menu()
    codeThemes.forEach(theme => {
      menu.addItem(item => {
        item.setTitle(theme.name)
          .setChecked(theme.id === this.currentCodeTheme)
          .onClick(async () => {
            this.currentCodeTheme = theme.id
            this.plugin.settings.codeTheme = theme.id
            await this.plugin.saveSettings()
            this.updateCodeThemeSelector()
            this.clearRenderedCache()
            void this.updatePreview()
          })
      })
    })
    menu.showAtMouseEvent(e)
  }

  async copyToClipboard(): Promise<void> {
    const html = await this.getRenderedHtml(this.currentPlatform)
    if (!html) {
      new Notice('没有可复制的内容')
      return
    }

    try {
      // Copy as both HTML and plain text fallback
      const htmlBlob = new Blob([html], { type: 'text/html' })
      const textBlob = new Blob([html], { type: 'text/plain' })
      const item = new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob,
      })
      await navigator.clipboard.write([item])
      new Notice(`✅ 已复制 ${PLATFORMS.find(p => p.id === this.currentPlatform)?.name} 格式`)
    } catch (err) {
      console.error('复制失败:', err)
      new Notice('复制失败: ' + String(err))
    }
  }

  async getRenderedHtml(platform: Platform): Promise<string | null> {
    // Check cache first
    const cached = this.renderedHtmlCache.get(platform)
    if (cached) return cached

    const markdown = this.getCurrentMarkdown()
    if (!markdown) return null

    try {
      const html = await render({
        markdown,
        markdownStyle: this.currentMarkdownStyle,
        codeTheme: this.currentCodeTheme,
        customCss: this.plugin.settings.customCss,
        platform,
      })
      this.renderedHtmlCache.set(platform, html)
      return html
    } catch (err) {
      console.error('渲染失败:', err)
      return null
    }
  }

  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  debounceUpdatePreview(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      void this.updatePreview()
    }, 300)
  }

  getCurrentMarkdown(): string | null {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (activeView?.editor) {
      const content = activeView.editor.getValue()
      this.lastMarkdownContent = content
      this.lastActiveFile = activeView.file
      return content
    }
    return this.lastMarkdownContent
  }

  async updatePreview(): Promise<void> {
    if (!this.previewContainer) return

    const html = await this.getRenderedHtml(this.currentPlatform)
    
    this.previewContainer.empty()
    
    if (!html) {
      const emptyDiv = this.previewContainer.createDiv({ cls: 'bm-md-empty' })
      emptyDiv.createEl('p', { text: '📝 打开 Markdown 文件开始预览' })
      return
    }

    // Use ContextualFragment to avoid direct innerHTML usage
    const fragment = document.createRange().createContextualFragment(html)
    this.previewContainer.appendChild(fragment)
  }

  async openPublishModal(): Promise<void> {
    const markdown = this.getCurrentMarkdown()
    if (!markdown) {
      new Notice('没有可发布的内容，请先打开 Markdown 文件')
      return
    }

    const html = await this.getRenderedHtml(this.currentPlatform)
    if (!html) {
      new Notice('内容渲染失败，无法发布')
      return
    }

    const modal = new PublishModal(this.app, {
      markdown,
      html,
      plugin: this.plugin
    })
    modal.open()
  }

  onClose(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    return Promise.resolve()
  }
}
