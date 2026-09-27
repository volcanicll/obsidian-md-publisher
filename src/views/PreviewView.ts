import { ItemView, WorkspaceLeaf, MarkdownView, Menu, TFile, Notice, setIcon } from 'obsidian'
import type BmMdPlugin from '../main'
import { render } from '../lib/markdown/render'
import { resolveNoteEmbeds, sliceByHeadings, type NoteResolver } from '../lib/markdown/embeds'
import {
  resolveLocalImageSrcs
} from '../lib/image-processor'
import { codeThemes } from '../themes/code-theme'
import { PublishModal } from './PublishModal'
import { DraftsModal } from './DraftsModal'

export const VIEW_TYPE_PREVIEW = 'obsidian-md-publisher'

export class PreviewView extends ItemView {
  plugin: BmMdPlugin
  currentMarkdownStyle: string = 'mist'
  currentCodeTheme: string = 'github'
  previewContainer: HTMLElement | null = null
  styleSelector: HTMLElement | null = null
  codeThemeSelector: HTMLElement | null = null

  // Cache markdown content and rendered HTML
  private lastMarkdownContent: string | null = null
  private lastActiveFile: TFile | null = null
  private renderedHtmlCache: string | null = null
  // 渲染代际：内容或笔记在渲染期间变化时，过期结果不写入缓存
  private renderGeneration = 0
  private rendering: Promise<string | null> | null = null

  // 双向滚动同步：滚动锁防止两个方向的滚动事件互相触发死循环
  private syncLock: 'none' | 'editor' | 'preview' = 'none'
  private syncLockTimer: number | null = null
  private boundEditorScroller: HTMLElement | null = null

  constructor(leaf: WorkspaceLeaf, plugin: BmMdPlugin) {
    super(leaf)
    this.plugin = plugin
    this.currentMarkdownStyle = plugin.settings.markdownStyle || 'mist'
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
    const draftsBtn = buttonGroup.createEl('button', { cls: 'bm-md-btn' })
    setIcon(draftsBtn, 'inbox')
    draftsBtn.createSpan({ text: '草稿' })
    draftsBtn.addEventListener('click', () => {
      new DraftsModal(this.app, this.plugin).open()
    })

    // 复制
    const copyBtn = buttonGroup.createEl('button', { cls: 'bm-md-btn' })
    setIcon(copyBtn, 'copy')
    copyBtn.createSpan({ text: '复制' })
    copyBtn.addEventListener('click', () => {
      void this.copyToClipboard()
    })

    // 发布
    const publishBtn = buttonGroup.createEl('button', { cls: 'bm-md-btn bm-md-btn-primary' })
    setIcon(publishBtn, 'send')
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
        this.bindEditorScroller()
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

    // 预览区滚动 → 编辑器
    this.registerDomEvent(this.previewContainer, 'scroll', () => this.onPreviewScroll())

    this.bindEditorScroller()

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
    this.renderGeneration++
  }

  // ---- 双向滚动同步 -------------------------------------------------------

  private acquireSyncLock(kind: 'editor' | 'preview'): void {
    this.syncLock = kind
    if (this.syncLockTimer) window.clearTimeout(this.syncLockTimer)
    this.syncLockTimer = window.setTimeout(() => {
      this.syncLock = 'none'
    }, 120)
  }

  /**
   * 找到预览内容当前对应的编辑器视图：优先活动视图；
   * 预览面板自身激活时（例如刚点完主题菜单）回退到预览镜像的笔记，
   * 再退而取第一个打开的笔记视图。
   */
  private findBoundMarkdownView(): MarkdownView | null {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (active?.editor) return active

    const candidates: MarkdownView[] = []
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view as MarkdownView
      if (view?.file && view.editor) candidates.push(view)
    }
    if (candidates.length === 0) return null
    const lastPath = this.lastActiveFile?.path
    if (lastPath) {
      const match = candidates.find(v => v.file!.path === lastPath)
      if (match) return match
    }
    return candidates[0]
  }

  /** 绑定编辑器的滚动容器；切换笔记时重新绑定 */
  private bindEditorScroller(): void {
    const view = this.findBoundMarkdownView()
    // 暂时找不到编辑器视图时保留现有绑定，避免菜单点击等操作把同步断开
    if (!view) return
    // CM6 编辑器的滚动容器；Editor 类型未暴露 getScrollerElement，用 DOM 查询
    const scroller = view.contentEl?.querySelector<HTMLElement>('.cm-scroller') ?? null
    if (!scroller || scroller === this.boundEditorScroller) return
    if (this.boundEditorScroller) {
      this.boundEditorScroller.removeEventListener('scroll', this.onEditorScroll)
    }
    this.boundEditorScroller = scroller
    scroller.addEventListener('scroll', this.onEditorScroll)
  }

  private syncByRatio(from: HTMLElement, to: HTMLElement, lock: 'editor' | 'preview'): void {
    const fromMax = from.scrollHeight - from.clientHeight
    if (fromMax <= 0) return
    const toMax = to.scrollHeight - to.clientHeight
    if (toMax <= 0) return
    this.acquireSyncLock(lock)
    to.scrollTop = Math.round((from.scrollTop / fromMax) * toMax)
  }

  private onEditorScroll = (): void => {
    if (!this.plugin.settings.scrollSync) return
    if (this.syncLock === 'preview') return
    if (!this.boundEditorScroller?.isConnected) this.bindEditorScroller()
    if (this.boundEditorScroller && this.previewContainer) {
      this.syncByRatio(this.boundEditorScroller, this.previewContainer, 'editor')
    }
  }

  private onPreviewScroll = (): void => {
    if (!this.plugin.settings.scrollSync) return
    if (this.syncLock === 'editor') return
    if (!this.boundEditorScroller?.isConnected) this.bindEditorScroller()
    if (this.boundEditorScroller && this.previewContainer) {
      this.syncByRatio(this.previewContainer, this.boundEditorScroller, 'preview')
    }
  }

  renderSelectors(container: HTMLElement): void {
    // Markdown Style Selector
    const styleGroup = container.createDiv({ cls: 'bm-md-selector-group' })
    styleGroup.createSpan({ text: '主题', cls: 'bm-md-selector-label' })

    this.styleSelector = styleGroup.createEl('button', { cls: 'bm-md-selector' })
    this.styleSelector.createSpan({ cls: 'bm-md-selector-value' })
    // setIcon 会清空目标元素内容，图标必须装进独立容器，避免吃掉文字
    const styleCaret = this.styleSelector.createSpan({ cls: 'bm-md-selector-caret' })
    setIcon(styleCaret, 'chevron-down')
    this.updateStyleSelector()
    this.styleSelector.addEventListener('click', (e) => this.showStyleMenu(e))

    // Code Theme Selector
    const codeGroup = container.createDiv({ cls: 'bm-md-selector-group' })
    codeGroup.createSpan({ text: '代码', cls: 'bm-md-selector-label' })

    this.codeThemeSelector = codeGroup.createEl('button', { cls: 'bm-md-selector' })
    this.codeThemeSelector.createSpan({ cls: 'bm-md-selector-value' })
    const codeCaret = this.codeThemeSelector.createSpan({ cls: 'bm-md-selector-caret' })
    setIcon(codeCaret, 'chevron-down')
    this.updateCodeThemeSelector()
    this.codeThemeSelector.addEventListener('click', (e) => this.showCodeThemeMenu(e))
  }

  updateStyleSelector(): void {
    if (!this.styleSelector) return
    const style = this.plugin
      .getMarkdownStyleList()
      .find(s => s.id === this.currentMarkdownStyle)
    const valueEl = this.styleSelector.querySelector('.bm-md-selector-value')
    if (valueEl) valueEl.textContent = style?.name || this.currentMarkdownStyle
  }

  updateCodeThemeSelector(): void {
    if (!this.codeThemeSelector) return
    const theme = codeThemes.find(t => t.id === this.currentCodeTheme)
    const valueEl = this.codeThemeSelector.querySelector('.bm-md-selector-value')
    if (valueEl) valueEl.textContent = theme?.name || this.currentCodeTheme
  }

  showStyleMenu(e: MouseEvent): void {
    const menu = new Menu()
    this.plugin.getMarkdownStyleList().forEach(style => {
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

  /**
   * 笔记嵌入解析器：![[笔记]] 与 ![[笔记#标题]] 读出内容切片。
   * 图片嵌入不进入此流程（由 convertWikiEmbeds → 图片管线处理）。
   */
  private makeNoteResolver(): NoteResolver {
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? ''
    return async (target) => {
      const hashIdx = target.indexOf('#')
      const linkpath = hashIdx === -1 ? target : target.slice(0, hashIdx)
      const headings = hashIdx === -1 ? [] : target.slice(hashIdx + 1).split('#')
      const file = this.app.metadataCache.getFirstLinkpathDest(linkpath.trim(), sourcePath)
      if (!(file instanceof TFile) || file.extension !== 'md') return null
      let content = await this.app.vault.read(file)
      if (headings.length > 0) {
        const sliced = sliceByHeadings(content, headings)
        if (sliced === null) return null
        content = sliced
      }
      return { content }
    }
  }

  async getRenderedHtml(): Promise<string | null> {
    // 渲染串行化：编辑 Mermaid 长文或快速切笔记时，旧的在途渲染完成后
    // 若代际已过期则丢弃并重渲染，避免过期 HTML 落入缓存被复制/发布
    for (;;) {
      if (this.renderedHtmlCache) return this.renderedHtmlCache

      const generation = this.renderGeneration
      if (!this.rendering) {
        const task = (async () => {
          const markdown = this.getCurrentMarkdown()
          if (!markdown) return null
          const resolvedMarkdown = await resolveNoteEmbeds(markdown, this.makeNoteResolver())
          return await render({
            markdown: resolvedMarkdown,
            markdownStyle: this.currentMarkdownStyle,
            codeTheme: this.currentCodeTheme,
            customCss: this.plugin.settings.customCss,
            customThemes: this.plugin.customThemes,
          })
        })().catch((err) => {
          console.error('渲染失败:', err)
          return null
        })
        this.rendering = task.finally(() => {
          this.rendering = null
        })
      }

      const html = await this.rendering
      if (generation !== this.renderGeneration) continue
      this.renderedHtmlCache = html
      return html
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
    const activeFilePath = this.app.workspace.getActiveFile()?.path ?? null
    return resolveLocalImageSrcs(html, this.app, activeFilePath)
  }

  async updatePreview(): Promise<void> {
    if (!this.previewContainer) return

    const html = await this.getRenderedHtml()

    // 重新渲染（含增量编辑触发）时保持阅读位置不跳顶
    const prevScrollTop = this.previewContainer.scrollTop
    this.previewContainer.empty()

    if (!html) {
      const emptyDiv = this.previewContainer.createDiv({ cls: 'bm-md-empty' })
      const emptyIcon = emptyDiv.createDiv({ cls: 'bm-md-empty-icon' })
      setIcon(emptyIcon, 'file-text')
      emptyDiv.createEl('p', { text: '打开一篇 Markdown 笔记' })
      emptyDiv.createEl('p', { text: '这里会实时预览公众号排版效果', cls: 'bm-md-empty-sub' })
      return
    }

    // DOMParser 解析已消毒的 HTML，再整体迁移节点，避免直接写 innerHTML
    const doc = new DOMParser().parseFromString(this.resolveLocalImages(html), 'text/html')
    this.previewContainer.replaceChildren(...Array.from(doc.body.childNodes))
    const maxScroll = this.previewContainer.scrollHeight - this.previewContainer.clientHeight
    this.previewContainer.scrollTop = Math.max(0, Math.min(prevScrollTop, maxScroll))
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
      plugin: this.plugin,
      // 发布时重新渲染：弹窗打开期间笔记可能继续被编辑。
      // 编辑会清空渲染缓存，未变更时直接复用缓存，无额外开销。
      loadContent: async () => {
        if (!this.getCurrentMarkdown()) return null
        const freshHtml = await this.getRenderedHtml()
        return freshHtml ? { html: freshHtml } : null
      }
    })
    modal.open()
  }

  onClose(): Promise<void> {
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer)
    if (this.syncLockTimer) window.clearTimeout(this.syncLockTimer)
    if (this.boundEditorScroller) {
      this.boundEditorScroller.removeEventListener('scroll', this.onEditorScroll)
      this.boundEditorScroller = null
    }
    return Promise.resolve()
  }
}
