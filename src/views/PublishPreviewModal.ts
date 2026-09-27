import { Modal, App, setIcon, arrayBufferToBase64 } from 'obsidian'
import type BmMdPlugin from '../main'
import { charLength, WECHAT_LIMITS } from '../lib/wechat/config'
import {
  extractLinks,
  checkLinks,
  scanSensitiveWords,
  stripHtmlTags,
  type LinkCheckResult,
  type SensitiveHit
} from '../lib/wechat/validation'
import {
  normalizeImagePath,
  findVaultImageFile,
  resolveLocalImageSrcs,
  generateDefaultCover
} from '../lib/image-processor'

export interface PublishPreviewForm {
  title: string
  author: string
  digest: string
  coverPath: string
  contentSourceUrl: string
}

export interface PublishPreviewOptions {
  plugin: BmMdPlugin
  form: PublishPreviewForm
  /** 渲染后的文章 HTML（本地图片路径尚未解析） */
  html: string
}

/**
 * 公众号实际渲染效果模拟预览 + 发布前校验。
 *
 * 预览侧按公众号文章页的结构（标题 / 作者 / 头图 / 正文）在手机框内
 * 呈现；校验侧提供字段长度、链接有效性与敏感词三类检查，
 * 结果只提示不拦截，是否发布由用户决定。
 */
export class PublishPreviewModal extends Modal {
  private plugin: BmMdPlugin
  private form: PublishPreviewForm
  private html: string

  private checkRunning = false

  constructor(app: App, options: PublishPreviewOptions) {
    super(app)
    this.plugin = options.plugin
    this.form = options.form
    this.html = options.html
  }

  onOpen(): void {
    this.modalEl.addClass('bm-md-wide-modal')
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('bm-md-previewmodal')

    contentEl.createEl('h2', { text: '公众号效果预览与校验', cls: 'bm-md-modal-title' })

    const layout = contentEl.createDiv({ cls: 'bm-md-previewmodal-layout' })

    // ---- 左侧：手机框模拟 ----
    void this.renderPhoneMock(layout.createDiv({ cls: 'bm-md-phone-pane' }))

    // ---- 右侧：发布前校验 ----
    this.renderChecks(layout.createDiv({ cls: 'bm-md-checks-pane' }))
  }

  /** 解析封面展示源：指定路径 → 正文首图 → 标题卡片兜底 */
  private async resolveCoverSrc(): Promise<string | null> {
    const activeFilePath = this.app.workspace.getActiveFile()?.path ?? null

    const explicit = this.form.coverPath.trim()
    if (explicit) {
      const normalized = normalizeImagePath(explicit, activeFilePath) ?? explicit
      const file = findVaultImageFile(this.app, normalized)
      if (file) {
        return this.app.vault.getResourcePath(file)
      }
      return null
    }

    const html = resolveLocalImageSrcs(this.html, this.app, activeFilePath)
    const first = html.match(/<img[^>]+src=["']([^"']+)["']/i)
    if (first && first[1]) {
      // data:（Mermaid 产物）也计入首图，与发布时 results[0] 的口径一致
      return first[1]
    }

    try {
      const cover = await generateDefaultCover(this.form.title.trim() || '未命名文章')
      const base64 = arrayBufferToBase64(cover.data)
      return `data:${cover.contentType};base64,${base64}`
    } catch (err) {
      console.warn('封面预览生成失败:', err)
      return null
    }
  }

  private async renderPhoneMock(pane: HTMLElement): Promise<void> {
    const phone = pane.createDiv({ cls: 'bm-md-phone' })
    phone.createDiv({ cls: 'bm-md-phone-bar', text: '公众号文章预览 · 375px' })

    const activeFilePath = this.app.workspace.getActiveFile()?.path ?? null
    const articleHtml = resolveLocalImageSrcs(this.html, this.app, activeFilePath)

    const header = phone.createDiv({ cls: 'bm-md-article-header' })
    header.createEl('h1', { text: this.form.title || '未命名文章', cls: 'bm-md-article-title' })
    const meta = [this.form.author.trim(), new Date().toLocaleDateString('zh-CN')]
      .filter(Boolean)
      .join(' · ')
    header.createDiv({ cls: 'bm-md-article-meta', text: meta || '公众号文章' })

    // 分享卡片才展示摘要：预览里以灰字摘要条呈现，便于确认截断效果
    if (this.form.digest.trim()) {
      header.createDiv({
        cls: 'bm-md-article-digest',
        text: `摘要：${this.form.digest}`
      })
    }

    const coverSrc = await this.resolveCoverSrc()
    if (coverSrc) {
      header.createEl('img', { cls: 'bm-md-article-cover' }).src = coverSrc
    } else if (this.form.coverPath.trim()) {
      header.createDiv({
        cls: 'bm-md-article-cover-missing',
        text: `未找到封面图：${this.form.coverPath}`
      })
    }

    const body = phone.createDiv({ cls: 'bm-md-article-body' })
    const doc = new DOMParser().parseFromString(articleHtml, 'text/html')
    body.replaceChildren(...Array.from(doc.body.childNodes))
  }

  // ---- 校验面板 -----------------------------------------------------------

  private renderChecks(pane: HTMLElement): void {
    pane.createEl('h3', { text: '发布前校验', cls: 'bm-md-checks-title' })

    // 字段长度：随表单快照即时计算
    const lengthBox = pane.createDiv({ cls: 'bm-md-check-group' })
    lengthBox.createDiv({ cls: 'bm-md-check-group-title', text: '字段长度' })
    const lengthList = lengthBox.createDiv({ cls: 'bm-md-check-list' })
    const fields: Array<[string, string, number]> = [
      ['标题', this.form.title, WECHAT_LIMITS.title],
      ['作者', this.form.author, WECHAT_LIMITS.author],
      ['摘要', this.form.digest, WECHAT_LIMITS.digest]
    ]
    for (const [name, value, limit] of fields) {
      const len = charLength(value)
      const over = len > limit
      const row = lengthList.createDiv({ cls: 'bm-md-check-row' })
      const icon = row.createSpan({ cls: 'bm-md-check-icon' })
      setIcon(icon, over ? 'x' : 'check')
      icon.classList.add(over ? 'is-error' : 'is-ok')
      row.createSpan({
        text: `${name} ${len} / ${limit}${over ? '，超出限制' : ''}`,
        cls: over ? 'bm-md-check-text is-error' : 'bm-md-check-text'
      })
    }
    if (!this.form.title.trim()) {
      lengthList.createDiv({ cls: 'bm-md-check-row is-error-text', text: '标题不能为空' })
    }

    // 链接有效性
    const linkBox = pane.createDiv({ cls: 'bm-md-check-group' })
    linkBox.createDiv({ cls: 'bm-md-check-group-title', text: '链接有效性' })
    const linkList = linkBox.createDiv({ cls: 'bm-md-check-list' })
    linkList.createDiv({
      cls: 'bm-md-check-hint',
      text: '检查正文中全部外链是否可访问（HEAD 优先，超时 8 秒）。'
    })
    const linkBtnRow = linkBox.createDiv({ cls: 'bm-md-check-actions' })
    const linkBtn = linkBtnRow.createEl('button', { text: '检查链接', cls: 'bm-md-btn' })
    linkBtn.addEventListener('click', () => {
      void this.runLinkCheck(linkList, linkBtn)
    })

    // 敏感词
    const wordBox = pane.createDiv({ cls: 'bm-md-check-group' })
    wordBox.createDiv({ cls: 'bm-md-check-group-title', text: '敏感词' })
    const wordList = wordBox.createDiv({ cls: 'bm-md-check-list' })
    wordList.createDiv({
      cls: 'bm-md-check-hint',
      text: '基于内置启发式词表（极限用语 / 医疗夸大 / 收益承诺 / 诱导互动）扫描标题、摘要与正文。'
    })
    const wordBtnRow = wordBox.createDiv({ cls: 'bm-md-check-actions' })
    const wordBtn = wordBtnRow.createEl('button', { text: '检测敏感词', cls: 'bm-md-btn' })
    wordBtn.addEventListener('click', () => {
      void this.runSensitiveScan(wordList, wordBtn)
    })

    pane.createDiv({
      cls: 'bm-md-check-footer',
      text: '校验结果仅作提示，不阻止发布；图片失败仍会按「失败即中止」策略取消发布。'
    })
  }

  private setCheckButtonsDisabled(disabled: boolean): void {
    this.contentEl.querySelectorAll('.bm-md-check-actions button').forEach((btn) => {
      ;(btn as HTMLButtonElement).disabled = disabled
    })
  }

  private async runLinkCheck(list: HTMLElement, btn: HTMLButtonElement): Promise<void> {
    if (this.checkRunning) return
    this.checkRunning = true
    this.setCheckButtonsDisabled(true)
    btn.setText('检查中…')
    list.empty()

    const urls = extractLinks(this.html)
    if (urls.length === 0) {
      list.createDiv({ cls: 'bm-md-check-hint', text: '正文没有需要检查的外链。' })
      this.checkRunning = false
      this.setCheckButtonsDisabled(false)
      btn.setText('检查链接')
      return
    }

    list.createDiv({ cls: 'bm-md-check-hint', text: `正在检查 ${urls.length} 条链接…` })
    const results = await checkLinks(urls)
    list.empty()

    let failed = 0
    for (const result of results as LinkCheckResult[]) {
      if (!result.ok) failed++
      const row = list.createDiv({ cls: 'bm-md-check-row' })
      const icon = row.createSpan({ cls: 'bm-md-check-icon' })
      setIcon(icon, result.ok ? 'check' : 'x')
      icon.classList.add(result.ok ? 'is-ok' : 'is-error')
      const text = result.ok
        ? `${result.url}${result.status ? `（${result.status}）` : ''}`
        : `${result.url}${result.status ? `（HTTP ${result.status}）` : ''}${result.error ? `：${result.error}` : ''}`
      row.createSpan({ text, cls: result.ok ? 'bm-md-check-text' : 'bm-md-check-text is-error' })
    }

    if (failed > 0) {
      list.createDiv({
        cls: 'bm-md-check-summary is-error',
        text: `${failed} / ${results.length} 条链接无法访问，发布前建议核对。`
      })
    } else {
      list.createDiv({
        cls: 'bm-md-check-summary is-ok',
        text: `全部 ${results.length} 条链接可访问。`
      })
    }

    this.checkRunning = false
    this.setCheckButtonsDisabled(false)
    btn.setText('检查链接')
  }

  private async runSensitiveScan(list: HTMLElement, btn: HTMLButtonElement): Promise<void> {
    if (this.checkRunning) return
    this.checkRunning = true
    this.setCheckButtonsDisabled(true)
    btn.setText('检测中…')
    list.empty()

    const extraWords = this.plugin.settings.sensitiveWords
      .split(/[,，\n]/)
      .map((word) => word.trim())
      .filter(Boolean)

    const text = stripHtmlTags(this.html) + ' ' + this.form.title + ' ' + this.form.digest
    // 检测在下一个事件循环执行，让「检测中…」有机会先渲染
    const hits: SensitiveHit[] = await new Promise((resolve) =>
      window.setTimeout(() => resolve(scanSensitiveWords(text, extraWords)), 30)
    )

    list.empty()
    if (hits.length === 0) {
      list.createDiv({ cls: 'bm-md-check-hint', text: '未命中任何词表条目。' })
    } else {
      for (const hit of hits) {
        const row = list.createDiv({ cls: 'bm-md-check-row' })
        const icon = row.createSpan({ cls: 'bm-md-check-icon' })
        setIcon(icon, 'alert-triangle')
        icon.classList.add('is-warn')
        row.createSpan({
          text: `「${hit.word}」×${hit.count}（${hit.category}）`,
          cls: 'bm-md-check-text is-warn'
        })
        row.createSpan({ text: hit.context, cls: 'bm-md-check-context' })
      }
      list.createDiv({
        cls: 'bm-md-check-summary is-warn',
        text: `命中 ${hits.length} 个词条，请人工确认是否需要修改。`
      })
    }

    this.checkRunning = false
    this.setCheckButtonsDisabled(false)
    btn.setText('检测敏感词')
  }

  onClose(): void {
    this.contentEl.empty()
  }
}
