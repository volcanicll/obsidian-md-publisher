import {
  ItemView,
  WorkspaceLeaf,
  MarkdownView,
  TFile,
  Notice,
  setIcon,
  setTooltip,
} from 'obsidian'
import type BmMdPlugin from '../main'
import { render } from '../lib/markdown/render'
import { resolveNoteEmbeds, sliceByHeadings, type NoteResolver } from '../lib/markdown/embeds'
import {
  inlineImagesAsDataUrls,
  resolveLocalImageSrcs
} from '../lib/image-processor'
import { stripHtmlTags } from '../lib/wechat/validation'
import { exportNoteImage, resolveExportWidth } from '../lib/export-image'
import { resolveCodeThemeId, DEFAULT_CODE_THEME } from '../themes/code-theme'
import { getPairedCodeTheme } from '../themes/markdown-style'
import { PublishModal } from './PublishModal'
import { DraftsModal } from './DraftsModal'
import { ThemePicker } from './publish/theme-picker'

export const VIEW_TYPE_PREVIEW = 'obsidian-md-publisher'

export class PreviewView extends ItemView {
  plugin: BmMdPlugin
  currentMarkdownStyle: string = 'mist'
  currentCodeTheme: string = DEFAULT_CODE_THEME
  previewContainer: HTMLElement | null = null
  private themePicker: ThemePicker | null = null

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
    this.currentCodeTheme = resolveCodeThemeId(
      plugin.settings.codeTheme,
      getPairedCodeTheme(this.currentMarkdownStyle, plugin.customThemes)
    )
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

    // 顶部控制条：主题贴左，操作居中，发布靠右，全部收进一行
    const toolbar = container.createDiv({ cls: 'bm-md-toolbar' })

    // 主题选择：代码高亮跟随主题，主题是唯一的外观决策
    this.themePicker = new ThemePicker(toolbar, {
      markdownStyle: this.currentMarkdownStyle,
      styles: this.plugin.getMarkdownStyleList(),
      onChange: (styleId) => this.applyMarkdownStyle(styleId),
    })

    const buttonGroup = toolbar.createDiv({ cls: 'bm-md-button-group' })

    // 草稿管理
    const draftsBtn = buttonGroup.createEl('button', { cls: 'bm-md-btn bm-md-btn-quiet' })
    setIcon(draftsBtn, 'inbox')
    draftsBtn.createSpan({ text: '草稿', cls: 'bm-md-btn-label' })
    setTooltip(draftsBtn, '管理公众号草稿')
    draftsBtn.addEventListener('click', () => {
      new DraftsModal(this.app, this.plugin).open()
    })

    // 复制
    const copyBtn = buttonGroup.createEl('button', { cls: 'bm-md-btn bm-md-btn-quiet' })
    setIcon(copyBtn, 'copy')
    copyBtn.createSpan({ text: '复制', cls: 'bm-md-btn-label' })
    setTooltip(copyBtn, '复制公众号格式')
    copyBtn.addEventListener('click', () => {
      void this.copyToClipboard()
    })

    // 导出图片
    const exportBtn = buttonGroup.createEl('button', { cls: 'bm-md-btn bm-md-btn-quiet' })
    setIcon(exportBtn, 'image')
    exportBtn.createSpan({ text: '导出图片', cls: 'bm-md-btn-label' })
    setTooltip(exportBtn, '导出为图片')
    exportBtn.addEventListener('click', () => {
      void this.exportImage()
    })

    // 发布：整条工具栏唯一的实心按钮
    const publishBtn = toolbar.createEl('button', { cls: 'bm-md-btn bm-md-btn-primary' })
    setIcon(publishBtn, 'send')
    publishBtn.createSpan({ text: '发布' })
    publishBtn.addEventListener('click', () => {
      void this.openPublishModal()
    })

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

  /** 切换排版主题：代码高亮跟随该主题的配套配色 */
  private applyMarkdownStyle(styleId: string): void {
    this.applyThemeState({
      markdownStyle: styleId,
      codeTheme: resolveCodeThemeId(
        getPairedCodeTheme(styleId, this.plugin.customThemes),
        this.currentCodeTheme
      ),
    })
  }

  /**
   * 复制到剪贴板：HTML 走 text/html 通道，纯文本走 text/plain 通道。
   *
   * 图片先内联为 data URL——vault 相对路径与 app:// 地址粘到公众号编辑器
   * 后无法解析，会变成裂图。内联后图片随 HTML 一起进入剪贴板。
   * text/plain 用剥离标签的纯文本，避免粘贴到纯文本编辑器时出现 HTML 源码。
   */
  async copyToClipboard(): Promise<void> {
    const html = await this.getRenderedHtml()
    if (!html) {
      new Notice('暂无内容可复制')
      return
    }

    const activeFilePath = this.getSourceNotePath()

    try {
      const { html: inlined, inlined: count, warnings } =
        await inlineImagesAsDataUrls(html, this.app, activeFilePath)

      const item = new ClipboardItem({
        'text/html': new Blob([inlined], { type: 'text/html' }),
        'text/plain': new Blob([stripHtmlTags(inlined)], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])

      if (warnings.length > 0) {
        new Notice(
          `已复制，但有 ${warnings.length} 张图片未能内联，粘贴后可能缺图` +
            `（${warnings[0]}）`
        )
      } else if (count > 0) {
        new Notice(`已复制公众号 HTML 格式（含 ${count} 张图片）`)
      } else {
        new Notice('已复制公众号 HTML 格式')
      }
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
    const sourcePath = this.getSourceNotePath() ?? ''
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
            inlineDollarMath: this.plugin.settings.inlineDollarMath,
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
   * 正文所属笔记路径。
   *
   * 不能用 `workspace.getActiveFile()`：预览面板获得焦点（点主题菜单、点预览区）
   * 后活动文件为空，相对图片路径会退化成 vault 根路径而全部裂图。
   * 因此优先取预览镜像的笔记，再回退当前打开的 Markdown 视图。
   */
  private getSourceNotePath(): string | null {
    const bound = this.findBoundMarkdownView()
    return bound?.file?.path ?? this.lastActiveFile?.path ?? null
  }

  /**
   * 将 HTML 中的本地图片 src 重写为 Obsidian 资源 URL（app://…），
   * 让预览面板能直接显示 vault 内图片；发布时仍按原路径读取上传。
   */
  private resolveLocalImages(html: string): string {
    return resolveLocalImageSrcs(html, this.app, this.getSourceNotePath())
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

  /**
   * 量取预览版面的实际宽度：#bm-md 与预览容器内容盒同宽（max-width:100% 居中），
   * 其边盒宽度即容器的实际内容宽度——不能直接用容器 clientWidth（会多出左右
   * padding 共 32px）。#bm-md 自带的水平 padding 由渲染内联样式提供，离屏导出
   * 容器里会原样复现，因此这里量边盒、不扣自身 padding。
   *
   * 视图尚未布局、被折叠（宽度为 0）或找不到 #bm-md 时返回 null，
   * 由 resolveExportWidth 回退常量宽度。
   */
  private measurePreviewWidth(): number | null {
    const container = this.previewContainer
    if (!container?.isConnected) return null
    const el = container.querySelector<HTMLElement>('#bm-md')
    if (!el) return null
    const width = el.getBoundingClientRect().width
    return Number.isFinite(width) && width > 0 ? width : null
  }

  /**
   * 导出为图片：取原始渲染 HTML（未做 app:// 改写），由导出管线把本地/外链
   * 图片统一内联成 data URL 后截图，避免 html2canvas 无法加载 app:// 协议。
   * 版面宽度取预览实测值（上限 1080px），预览有多宽导出就有多宽。
   */
  async exportImage(): Promise<void> {
    const html = await this.getRenderedHtml()
    if (!html) {
      new Notice('暂无内容可导出，请先打开一篇 Markdown 笔记')
      return
    }

    const noteFile = this.findBoundMarkdownView()?.file ?? this.lastActiveFile
    const settings = this.plugin.settings
    const resolvedWidth = resolveExportWidth(this.measurePreviewWidth())
    new Notice('正在生成图片…')
    try {
      const result = await exportNoteImage({
        app: this.app,
        html,
        activeFilePath: noteFile?.path ?? null,
        noteName: noteFile?.basename ?? 'export',
        width: resolvedWidth.width,
        widthSource: resolvedWidth.source,
        scale: settings.exportImageScale,
        folder: settings.exportImageFolder,
      })
      for (const warning of result.warnings) {
        console.warn('导出图片内联警告:', warning)
      }
      if (result.widthSource === 'fallback') {
        console.warn('导出图片：未能读取预览宽度，已按回退宽度导出')
        new Notice(`未能读取预览宽度，已按 ${result.width}px 导出`)
      }
      if (result.downgraded) {
        new Notice(`内容较长，已自动降低缩放至 ${result.scale}x 以避免超出画布上限`)
      }
      if (result.warnings.length > 0) {
        new Notice(`有 ${result.warnings.length} 张图片未能内联，对应位置可能空白`)
      }
      new Notice(`图片已保存到 ${result.path}`)
    } catch (err) {
      console.error('导出图片失败:', err)
      const message = err instanceof Error ? err.message : String(err)
      new Notice('导出图片失败：' + message)
    }
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
      notePath: this.getSourceNotePath(),
      // 发布时重新渲染：弹窗打开期间笔记可能继续被编辑。
      // 编辑会清空渲染缓存，未变更时直接复用缓存，无额外开销。
      loadContent: async () => {
        if (!this.getCurrentMarkdown()) return null
        const freshHtml = await this.getRenderedHtml()
        return freshHtml ? { html: freshHtml } : null
      },
      // 弹窗内换主题：写回设置并同步侧栏，保证预览、侧栏与发布内容一致
      renderWithTheme: async (theme) => {
        this.applyThemeState(theme)
        return this.getRenderedHtml()
      }
    })
    modal.open()
  }

  /**
   * 应用主题并让侧栏跟上：设置、选择条文案、渲染缓存、预览视图
   * 一起更新，避免关掉发布弹窗后侧栏还停在旧主题。
   */
  private applyThemeState(theme: { markdownStyle: string; codeTheme: string }): void {
    this.currentMarkdownStyle = theme.markdownStyle
    this.currentCodeTheme = theme.codeTheme
    this.plugin.settings.markdownStyle = theme.markdownStyle
    this.plugin.settings.codeTheme = theme.codeTheme
    void this.plugin.saveSettings()

    this.themePicker?.setState(this.currentMarkdownStyle)

    this.clearRenderedCache()
    void this.updatePreview()
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
