import { ItemView, WorkspaceLeaf, MarkdownView, Menu, TFile, Notice } from 'obsidian'
import type BmMdPlugin from '../main'
import { render } from '../lib/markdown/render'
import {
  extractLocalImagePaths,
  normalizeImagePath,
  replaceImageSrc,
  findVaultImageFile
} from '../lib/image-processor'
import { markdownStyles } from '../themes/markdown-style'
import { codeThemes } from '../themes/code-theme'
import { PublishModal } from './PublishModal'
import { DraftsModal } from './DraftsModal'

export const VIEW_TYPE_PREVIEW = 'obsidian-md-publisher'

export class PreviewView extends ItemView {
  plugin: BmMdPlugin
  currentMarkdownStyle: string = 'ayu-light'
  currentCodeTheme: string = 'github'
  previewContainer: HTMLElement | null = null
  styleSelector: HTMLElement | null = null
  codeThemeSelector: HTMLElement | null = null

  // Cache markdown content and rendered HTML
  private lastMarkdownContent: string | null = null
  private lastActiveFile: TFile | null = null
  private renderedHtmlCache: string | null = null

  constructor(leaf: WorkspaceLeaf, plugin: BmMdPlugin) {
    super(leaf)
    this.plugin = plugin
    this.currentMarkdownStyle = plugin.settings.markdownStyle || 'ayu-light'
    this.currentCodeTheme = plugin.settings.codeTheme || 'github'
  }

  getViewType(): string {
    return VIEW_TYPE_PREVIEW
  }

  getDisplayText(): string {
    return '排版预览'
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

    // Button group (left side)
    const buttonGroup = toolbar.createDiv({ cls: 'bm-md-button-group' })

    // 草稿管理
    const draftsBtn = buttonGroup.createDiv({ cls: 'bm-md-secondary-btn' })
    draftsBtn.createSpan({ cls: 'bm-md-copy-icon', text: '📚' })
    draftsBtn.createSpan({ text: '草稿' })
    draftsBtn.addEventListener('click', () => {
      new DraftsModal(this.app, this.plugin).open()
    })

    // 复制
    const copyBtn = buttonGroup.createDiv({ cls: 'bm-md-copy-btn' })
    copyBtn.createSpan({ cls: 'bm-md-copy-icon', text: '📋' })
    copyBtn.createSpan({ text: '复制' })
    copyBtn.addEventListener('click', () => {
      void this.copyToClipboard()
    })

    // 发布
    const publishBtn = buttonGroup.createDiv({ cls: 'bm-md-publish-btn' })
    publishBtn.createSpan({ cls: 'bm-md-publish-icon', text: '📤' })
    publishBtn.createSpan({ text: '发布' })
    publishBtn.addEventListener('click', () => {
      void this.openPublishModal()
    })

    // Theme selectors
    const settingsRow = container.createDiv({ cls: 'bm-md-settings' })
    this.renderSelectors(settingsRow)

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
    this.renderedHtmlCache = null
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
    const html = await this.getRenderedHtml()
    if (!html) {
      new Notice('暂无内容可复制')
      return
    }

    try {
      const htmlBlob = new Blob([html], { type: 'text/html' })
      const textBlob = new Blob([html], { type: 'text/plain' })
      const item = new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob,
      })
      await navigator.clipboard.write([item])
      new Notice('已复制公众号 HTML 格式')
    } catch (err) {
      console.error('复制失败:', err)
      new Notice('复制失败：' + String(err))
    }
  }

  async getRenderedHtml(): Promise<string | null> {
    // Check cache first
    if (this.renderedHtmlCache) return this.renderedHtmlCache

    const markdown = this.getCurrentMarkdown()
    if (!markdown) return null

    try {
      const html = await render({
        markdown,
        markdownStyle: this.currentMarkdownStyle,
        codeTheme: this.currentCodeTheme,
        customCss: this.plugin.settings.customCss,
      })
      this.renderedHtmlCache = html
      return html
    } catch (err) {
      console.error('渲染失败:', err)
      return null
    }
  }

  private debounceTimer: number | null = null

  debounceUpdatePreview(): void {
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer)
    this.debounceTimer = window.setTimeout(() => {
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

  /**
   * 将 HTML 中的本地图片 src 重写为 Obsidian 资源 URL（app://…），
   * 让预览面板能直接显示 vault 内图片；发布时仍按原路径读取上传。
   */
  private resolveLocalImages(html: string): string {
    const activeFile = this.app.workspace.getActiveFile()
    const activeFilePath = activeFile?.path ?? null
    let resolved = html
    for (const src of extractLocalImagePaths(html)) {
      const normalized = normalizeImagePath(src, activeFilePath)
      if (!normalized) continue
      const file = findVaultImageFile(this.app, normalized)
      if (file) {
        resolved = replaceImageSrc(resolved, src, this.app.vault.getResourcePath(file))
      }
    }
    return resolved
  }

  async updatePreview(): Promise<void> {
    if (!this.previewContainer) return

    const html = await this.getRenderedHtml()

    this.previewContainer.empty()

    if (!html) {
      const emptyDiv = this.previewContainer.createDiv({ cls: 'bm-md-empty' })
      emptyDiv.createEl('p', { text: '打开一篇 Markdown 笔记以预览公众号排版' })
      return
    }

    // 用 <template> 解析已消毒的 HTML，避免直接操作文档 DOM
    const template = document.createElement('template')
    template.innerHTML = this.resolveLocalImages(html)
    this.previewContainer.appendChild(template.content)
  }

  async openPublishModal(): Promise<void> {
    const markdown = this.getCurrentMarkdown()
    if (!markdown) {
      new Notice('没有可发布的内容，请先打开一篇 Markdown 笔记')
      return
    }

    const html = await this.getRenderedHtml()
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
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer)
    return Promise.resolve()
  }
}
