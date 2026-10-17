import { Modal, App, Notice, setIcon } from 'obsidian'
import type BmMdPlugin from '../main'
import type { WeChatApi } from '../lib/wechat/wechat-api'
import { extractTitleFromMarkdown, extractDigestFromMarkdown } from '../lib/wechat/wechat-api'
import type { WeChatArticle } from '../lib/wechat/types'
import { isWeChatError } from '../lib/wechat/types'
import { isWeChatConfigured, credentialFailureHint, validateWeChatArticleFields } from '../lib/wechat/config'
import {
  classifyUpdateFailure,
  weChatErrorCode
} from '../lib/wechat/draft-links'
import {
  canSubmit,
  computeFieldState,
  coverKeyForSource,
  coverSourceHint,
  coverSourceLabel,
  fieldsChip,
  primaryActionLabel,
  summarizeChecks,
  targetStatus,
  type CheckChipStates,
  type CoverSource,
  type PublishFormState
} from '../lib/wechat/publish-form'
import {
  arrayBufferToDataUrl,
  compressImage,
  generateDefaultCover,
  processImages,
  readImageFromVault,
  resolveVaultImageFile,
  resolveLocalImageSrcs,
  DEFAULT_IMAGE_OPTIONS,
  type ImageProcessResult,
  type ProgressCallback
} from '../lib/image-processor'
import { DraftPickerModal } from './DraftPickerModal'
import { PhonePreview } from './publish/phone-preview'
import { VaultImagePickerModal, readLocalCoverFile } from './publish/cover-picker'
import { collectIssues, emptyReport, runChecks, type CheckReport } from './publish/publish-checks'

export interface PublishModalContent {
  html: string
}

/** 封面素材的解析结果；reused 表示直接沿用了上次发布的媒体素材 */
interface ResolvedCover {
  thumbMediaId: string
  /** 封面来源指纹，下次发布相同来源时据此复用素材 */
  coverKey: string
  reused: boolean
}

export interface PublishModalOptions {
  markdown: string
  html: string
  plugin: BmMdPlugin
  /**
   * 发布时重新获取最新渲染结果：弹窗打开期间笔记可能继续被编辑，
   * 不提供时退回打开弹窗时的快照。
   */
  loadContent?: () => Promise<PublishModalContent | null>
  /** 正文所属笔记路径；缺省时取弹窗打开瞬间的活动文件 */
  notePath?: string | null
}

/**
 * 发布到微信公众号草稿箱。
 *
 * 左侧是真机预览，右侧是发布信息表单：改标题、换封面、开关评论都会
 * 即时反映在左侧。发布前检查收进页脚，结果只提示不拦截。
 */
export class PublishModal extends Modal {
  private html: string
  private plugin: BmMdPlugin
  private loadContent?: () => Promise<PublishModalContent | null>
  private notePath: string | null
  private form: PublishFormState
  private isPublishing = false

  private preview: PhonePreview | null = null
  private submitBtn: HTMLButtonElement | null = null
  private cancelBtn: HTMLButtonElement | null = null
  private checkBtn: HTMLButtonElement | null = null
  private chipsEl: HTMLElement | null = null
  private reportEl: HTMLElement | null = null
  private progressEl: HTMLElement | null = null
  private coverThumbImg: HTMLImageElement | null = null
  private coverBadgeEl: HTMLElement | null = null
  private coverHintEl: HTMLElement | null = null
  private coverMenuEl: HTMLElement | null = null
  private fileInput: HTMLInputElement | null = null
  private targetEl: HTMLElement | null = null
  private counters: Record<'title' | 'author' | 'digest', HTMLElement | null> = {
    title: null,
    author: null,
    digest: null
  }
  private refreshModeRow: (() => void) | null = null

  private checkReport: CheckReport = emptyReport()
  private checkRunning = false

  /** 正文首图：发布时作为 auto 封面，也用于封面来源指纹 */
  private firstBodyImagePath: string | null = null
  private firstBodyImagePreview: string | null = null
  /** 标题卡片封面的 data URL 与生成时使用的标题 */
  private coverPreviewUrl: string | null = null
  private generatedTitle: string | null = null
  private coverBuilding = false
  private coverTimer: number | null = null

  constructor(app: App, options: PublishModalOptions) {
    super(app)
    this.html = options.html
    this.plugin = options.plugin
    this.loadContent = options.loadContent
    this.notePath = options.notePath ?? app.workspace.getActiveFile()?.path ?? null

    const draftLink = this.plugin.getDraftLink(this.notePath)
    this.form = {
      title: extractTitleFromMarkdown(options.markdown),
      author: '',
      digest: extractDigestFromMarkdown(options.markdown),
      contentSourceUrl: '',
      needOpenComment: this.plugin.settings.defaultOpenComment,
      onlyFansCanComment: this.plugin.settings.defaultFansOnlyComment,
      showCoverInBody: this.plugin.settings.showCoverInBody,
      cover: { kind: 'auto' },
      publishMode: draftLink ? 'update' : 'new',
      draftLink
    }
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('bm-md-pm-modal')
    this.modalEl.addClass('bm-md-pm-modal-root')

    this.renderHeader(contentEl)

    // 凭证缺失不再拦住整个弹窗：用户仍可填写、预览、跑发布前检查，
    // 只在点「保存到草稿」时校验并提示去哪里补配置
    if (!isWeChatConfigured(this.plugin.settings)) {
      const banner = contentEl.createDiv({ cls: 'bm-md-pm-cred-banner' })
      setIcon(banner.createSpan({ cls: 'bm-md-pm-cred-icon' }), 'alert-triangle')
      banner.createSpan({
        text: '尚未配置公众号凭证（AppID / AppSecret 或手动 token）。现在可以填写并预览，点「保存到草稿」时会提示补全配置。'
      })
    }

    const body = contentEl.createDiv({ cls: 'bm-md-pm-body' })
    const previewCol = body.createDiv({ cls: 'bm-md-pm-preview-col' })
    this.preview = new PhonePreview(previewCol)
    this.mountBody()

    const formCol = body.createDiv({ cls: 'bm-md-pm-form' })
    this.renderBasicFields(formCol)
    this.renderCoverSection(formCol)
    this.renderSourceUrl(formCol)
    this.renderInteractions(formCol)
    this.renderPublishMode(formCol)

    this.reportEl = contentEl.createDiv({ cls: 'bm-md-pm-report is-hidden' })
    this.renderFooter(contentEl)
    this.refreshAll()
  }

  // ---- 头部 ---------------------------------------------------------------

  private renderHeader(contentEl: HTMLElement): void {
    const head = contentEl.createDiv({ cls: 'bm-md-pm-head' })
    const text = head.createDiv({ cls: 'bm-md-pm-head-text' })
    text.createDiv({ cls: 'bm-md-pm-title', text: '发布到公众号' })
    text.createDiv({ cls: 'bm-md-pm-subtitle', text: this.notePath ?? '未命名笔记' })

    const close = head.createEl('button', {
      cls: 'bm-md-pm-icon-btn',
      attr: { type: 'button', 'aria-label': '关闭' }
    })
    setIcon(close, 'x')
    close.addEventListener('click', () => this.close())
  }

  // ---- 左栏：预览 ---------------------------------------------------------

  /** 挂载正文并解析本地图片；只在打开时执行一次 */
  private mountBody(): void {
    if (!this.preview) return

    const firstSrc = this.html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? null
    if (firstSrc) {
      if (/^(data:|https?:)/i.test(firstSrc)) {
        this.firstBodyImagePath = firstSrc
        this.firstBodyImagePreview = firstSrc
      } else {
        const file = resolveVaultImageFile(this.app, firstSrc, this.notePath)
        this.firstBodyImagePath = file?.path ?? firstSrc
        this.firstBodyImagePreview = file ? this.app.vault.getResourcePath(file) : firstSrc
      }
    }

    this.preview.setBodyHtml(resolveLocalImageSrcs(this.html, this.app, this.notePath))
  }

  // ---- 右栏：基本信息 -----------------------------------------------------

  private renderBasicFields(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: 'bm-md-pm-section' })
    const head = section.createDiv({ cls: 'bm-md-pm-section-head' })
    head.createSpan({ cls: 'bm-md-pm-section-title', text: '基本信息' })
    head.createSpan({ cls: 'bm-md-pm-section-hint', text: '标题 64 / 作者 8 / 摘要 120' })

    this.renderTextField(section, {
      key: 'title',
      label: '标题',
      required: true,
      value: this.form.title,
      onChange: (value) => {
        this.form.title = value
      }
    })

    this.renderTextField(section, {
      key: 'author',
      label: '作者',
      value: this.form.author,
      onChange: (value) => {
        this.form.author = value
      }
    })

    this.renderTextField(section, {
      key: 'digest',
      label: '摘要',
      multiline: true,
      value: this.form.digest,
      onChange: (value) => {
        this.form.digest = value
      }
    })
  }

  private renderTextField(
    parent: HTMLElement,
    options: {
      key: 'title' | 'author' | 'digest'
      label: string
      required?: boolean
      multiline?: boolean
      value: string
      onChange: (value: string) => void
    }
  ): void {
    const field = parent.createDiv({ cls: 'bm-md-pm-field' })
    const label = field.createEl('label', { cls: 'bm-md-pm-label' })
    label.createSpan({ text: options.label })
    if (options.required) {
      label.createEl('em', { cls: 'bm-md-pm-required', text: '必填' })
    }

    const wrap = field.createDiv({ cls: 'bm-md-pm-input-wrap' })
    const input = options.multiline
      ? wrap.createEl('textarea', {
          cls: 'bm-md-pm-input bm-md-pm-textarea',
          attr: { rows: '2' }
        })
      : wrap.createEl('input', {
          cls: 'bm-md-pm-input',
          attr: { type: 'text', autocomplete: 'off' }
        })
    input.value = options.value
    label.htmlFor = input.id = `bm-md-pm-${options.key}`

    const counter = wrap.createSpan({ cls: 'bm-md-pm-count' })
    if (options.multiline) counter.addClass('is-bottom')
    this.counters[options.key] = counter

    input.addEventListener('input', () => {
      options.onChange(input.value)
      this.refreshAll()
    })
  }

  // ---- 右栏：封面 ---------------------------------------------------------

  private renderCoverSection(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: 'bm-md-pm-section' })
    const head = section.createDiv({ cls: 'bm-md-pm-section-head' })
    head.createSpan({ cls: 'bm-md-pm-section-title', text: '封面' })
    head.createSpan({ cls: 'bm-md-pm-section-hint', text: '草稿必须有封面' })

    const row = section.createDiv({ cls: 'bm-md-pm-cover-row' })

    const thumb = row.createDiv({ cls: 'bm-md-pm-cover-thumb' })
    this.coverThumbImg = thumb.createEl('img', { attr: { alt: '' } })
    this.coverBadgeEl = thumb.createDiv({ cls: 'bm-md-pm-cover-badge' })

    const side = row.createDiv({ cls: 'bm-md-pm-cover-side' })
    const changeBtn = side.createEl('button', {
      cls: 'bm-md-pm-btn bm-md-pm-btn-quiet',
      text: '更换封面',
      attr: { type: 'button' }
    })

    this.coverMenuEl = side.createDiv({ cls: 'bm-md-pm-menu is-hidden', attr: { role: 'menu' } })

    for (const item of [
      { id: 'auto', label: '使用正文首图' },
      { id: 'vault', label: '从 vault 选择…' },
      { id: 'upload', label: '上传本地图片…' },
      { id: 'generated', label: '按标题生成卡片' }
    ] as const) {
      const btn = this.coverMenuEl.createEl('button', {
        cls: 'bm-md-pm-menu-item',
        text: item.label,
        attr: { type: 'button', role: 'menuitem' }
      })
      btn.addEventListener('click', () => this.selectCoverSource(item.id))
    }

    this.fileInput = side.createEl('input', {
      cls: 'is-hidden',
      attr: { type: 'file', accept: 'image/*' }
    })
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput?.files?.[0]
      if (this.fileInput) this.fileInput.value = ''
      if (file) void this.applyLocalCover(file)
    })

    changeBtn.addEventListener('click', (event) => {
      event.stopPropagation()
      if (!this.coverMenuEl) return
      if (this.coverMenuEl.hasClass('is-hidden')) {
        this.coverMenuEl.removeClass('is-hidden')
      } else {
        this.coverMenuEl.addClass('is-hidden')
      }
    })
    // 点击弹窗其他位置收起菜单
    this.contentEl.addEventListener('click', (event) => {
      if (!this.coverMenuEl || this.coverMenuEl.hasClass('is-hidden')) return
      const target = event.target as Node
      if (this.coverMenuEl.contains(target) || changeBtn.contains(target)) return
      this.coverMenuEl.addClass('is-hidden')
    })

    this.coverHintEl = side.createEl('p', { cls: 'bm-md-pm-hint' })

    const coverInline = section.createDiv({ cls: 'bm-md-pm-toggle-row' })
    const coverInlineLabel = coverInline.createEl('label', {
      cls: 'bm-md-pm-toggle-label',
      text: '正文顶部显示封面'
    })
    const coverInlineSwitch = coverInline.createEl('label', { cls: 'bm-md-pm-switch' })
    const coverInlineInput = coverInlineSwitch.createEl('input', {
      attr: { type: 'checkbox' }
    })
    coverInlineInput.checked = this.form.showCoverInBody
    coverInlineSwitch.createSpan({})
    coverInlineLabel.htmlFor = coverInlineInput.id = 'bm-md-pm-cover-inline'
    coverInlineInput.addEventListener('change', () => {
      this.form.showCoverInBody = coverInlineInput.checked
      this.refreshPreview()
    })
  }

  private selectCoverSource(kind: CoverSource['kind']): void {
    this.coverMenuEl?.addClass('is-hidden')
    if (kind === 'vault') {
      new VaultImagePickerModal(this.app, (file) => {
        this.setCover({ kind: 'vault', path: file.path })
      }).open()
      return
    }
    if (kind === 'upload') {
      this.fileInput?.click()
      return
    }
    this.setCover(kind === 'auto' ? { kind: 'auto' } : { kind: 'generated' })
  }

  private async applyLocalCover(file: File): Promise<void> {
    try {
      const local = await readLocalCoverFile(file)
      this.setCover({ kind: 'upload', file: local })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      new Notice(`读取图片失败：${message}`)
    }
  }

  private setCover(cover: CoverSource): void {
    this.releaseLocalCover(this.form.cover)
    this.form.cover = cover
    this.coverPreviewUrl = null
    this.generatedTitle = null
    this.refreshAll()
  }

  /** 本次发布临时选择的本地图片，关闭弹窗或换图时释放预览地址 */
  private releaseLocalCover(cover: CoverSource): void {
    if (cover.kind === 'upload') {
      URL.revokeObjectURL(cover.file.previewUrl)
    }
  }

  // ---- 右栏：原文链接 -----------------------------------------------------

  private renderSourceUrl(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: 'bm-md-pm-section is-compact' })
    const field = section.createDiv({ cls: 'bm-md-pm-field' })
    const label = field.createEl('label', { cls: 'bm-md-pm-label', text: '原文链接' })
    const input = field.createEl('input', {
      cls: 'bm-md-pm-input',
      attr: { type: 'url', placeholder: 'https://example.com/post', autocomplete: 'off' }
    })
    label.htmlFor = input.id = 'bm-md-pm-source-url'
    input.value = this.form.contentSourceUrl
    input.addEventListener('input', () => {
      this.form.contentSourceUrl = input.value
      this.refreshPreview()
    })
  }

  // ---- 右栏：互动 ---------------------------------------------------------

  private renderInteractions(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: 'bm-md-pm-section' })
    const head = section.createDiv({ cls: 'bm-md-pm-section-head' })
    head.createSpan({ cls: 'bm-md-pm-section-title', text: '互动' })

    const commentRow = section.createDiv({ cls: 'bm-md-pm-toggle-row' })
    const commentLabel = commentRow.createEl('label', {
      cls: 'bm-md-pm-toggle-label',
      text: '开启评论'
    })
    const commentSwitch = commentRow.createEl('label', { cls: 'bm-md-pm-switch' })
    const commentInput = commentSwitch.createEl('input', { attr: { type: 'checkbox' } })
    commentSwitch.createSpan({})
    commentLabel.htmlFor = commentInput.id = 'bm-md-pm-comments'
    commentInput.checked = this.form.needOpenComment

    const fansRow = section.createDiv({ cls: 'bm-md-pm-toggle-row' })
    const fansLabel = fansRow.createEl('label', {
      cls: 'bm-md-pm-toggle-label',
      text: '仅粉丝可评论'
    })
    const fansSwitch = fansRow.createEl('label', { cls: 'bm-md-pm-switch' })
    const fansInput = fansSwitch.createEl('input', { attr: { type: 'checkbox' } })
    fansSwitch.createSpan({})
    fansLabel.htmlFor = fansInput.id = 'bm-md-pm-fans'
    fansInput.checked = this.form.onlyFansCanComment

    // 关闭评论时「仅粉丝可评论」没有意义
    const refreshFans = () => {
      fansInput.disabled = !commentInput.checked
      fansRow.toggleClass('is-disabled', !commentInput.checked)
    }
    refreshFans()

    commentInput.addEventListener('change', () => {
      this.form.needOpenComment = commentInput.checked
      if (!commentInput.checked) {
        this.form.onlyFansCanComment = false
        fansInput.checked = false
      }
      refreshFans()
    })
    fansInput.addEventListener('change', () => {
      this.form.onlyFansCanComment = fansInput.checked
    })
  }

  // ---- 右栏：发布方式 -----------------------------------------------------

  private renderPublishMode(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: 'bm-md-pm-section' })
    const head = section.createDiv({ cls: 'bm-md-pm-section-head' })
    head.createSpan({ cls: 'bm-md-pm-section-title', text: '发布方式' })

    const row = section.createDiv({ cls: 'bm-md-pm-mode-row' })
    const select = row.createEl('select', { cls: 'bm-md-pm-input bm-md-pm-select' })
    select.createEl('option', { value: 'update', text: '覆盖更新已有草稿' })
    select.createEl('option', { value: 'new', text: '新建草稿' })
    select.value = this.form.publishMode

    const pickBtn = row.createEl('button', {
      cls: 'bm-md-pm-btn bm-md-pm-btn-quiet',
      text: '选择草稿…',
      attr: { type: 'button' }
    })

    select.addEventListener('change', () => {
      this.form.publishMode = select.value === 'update' ? 'update' : 'new'
      // 切到覆盖但还没有目标时，先让用户挑一篇
      if (this.form.publishMode === 'update' && !this.form.draftLink) {
        this.openDraftPicker()
      }
      this.refreshAll()
    })
    pickBtn.addEventListener('click', () => this.openDraftPicker())

    this.targetEl = section.createEl('p', { cls: 'bm-md-pm-target' })

    const refreshPickVisibility = () => {
      pickBtn.toggleClass('is-hidden', this.form.publishMode !== 'update')
    }
    refreshPickVisibility()
    this.refreshModeRow = () => {
      select.value = this.form.publishMode
      refreshPickVisibility()
    }
  }

  private openDraftPicker(): void {
    new DraftPickerModal(
      this.app,
      this.plugin,
      (draft) => {
        this.form.draftLink = {
          mediaId: draft.mediaId,
          title: draft.title,
          // batchget 返回秒级时间戳，本地关联统一存毫秒
          updatedAt: draft.updateTime * 1000
        }
        this.form.publishMode = 'update'
        this.refreshAll()
      },
      () => {
        // 用户放弃选择：退回新建，避免停在「覆盖但无目标」的不可发布状态
        if (this.form.publishMode === 'update' && !this.form.draftLink) {
          this.form.publishMode = 'new'
          this.refreshAll()
        }
      }
    ).open()
  }

  // ---- 页脚 ---------------------------------------------------------------

  private renderFooter(contentEl: HTMLElement): void {
    const foot = contentEl.createDiv({ cls: 'bm-md-pm-foot' })
    const checkWrap = foot.createDiv({ cls: 'bm-md-pm-check-wrap' })

    this.checkBtn = checkWrap.createEl('button', {
      cls: 'bm-md-pm-btn bm-md-pm-btn-ghost',
      text: '发布前检查',
      attr: { type: 'button' }
    })
    this.checkBtn.addEventListener('click', () => {
      void this.runChecks()
    })

    this.chipsEl = checkWrap.createDiv({ cls: 'bm-md-pm-chips' })
    this.progressEl = foot.createDiv({ cls: 'bm-md-pm-progress is-hidden' })

    const actions = foot.createDiv({ cls: 'bm-md-pm-actions' })
    this.cancelBtn = actions.createEl('button', {
      cls: 'bm-md-pm-btn',
      text: '取消',
      attr: { type: 'button' }
    })
    this.cancelBtn.addEventListener('click', () => this.close())

    this.submitBtn = actions.createEl('button', {
      cls: 'bm-md-pm-btn bm-md-pm-btn-primary',
      text: primaryActionLabel(this.form.publishMode),
      attr: { type: 'button' }
    })
    this.submitBtn.addEventListener('click', () => {
      void this.publish()
    })
  }

  private renderChips(states: CheckChipStates): void {
    if (!this.chipsEl) return
    this.chipsEl.empty()
    const fields = fieldsChip(computeFieldState(this.form))
    this.renderChip(fields.label, fields.tone)
    this.renderChip(states.links.label, states.links.tone)
    this.renderChip(states.words.label, states.words.tone)
  }

  private renderChip(label: string, tone: string): void {
    if (!this.chipsEl) return
    const chip = this.chipsEl.createSpan({ cls: 'bm-md-pm-chip', text: label })
    if (tone !== 'idle') chip.addClass(`is-${tone}`)
  }

  // ---- 状态刷新 -----------------------------------------------------------

  private refreshAll(): void {
    const fields = computeFieldState(this.form)

    for (const key of ['title', 'author', 'digest'] as const) {
      const counter = this.counters[key]
      if (!counter) continue
      const field = fields[key]
      counter.setText(`${field.length} / ${field.limit}`)
      counter.toggleClass('is-over', field.over)
    }

    this.renderChips(summarizeChecks(this.checkReport.links, this.checkReport.words))
    this.refreshModeRow?.()

    if (this.targetEl) {
      const status = targetStatus(this.form)
      this.targetEl.setText(status.text)
      this.targetEl.toggleClass('is-missing', status.missing)
    }

    if (this.submitBtn) {
      this.submitBtn.setText(primaryActionLabel(this.form.publishMode))
      this.submitBtn.disabled = this.isPublishing || !canSubmit(this.form, fields)
    }

    this.refreshPreview()
  }

  private refreshPreview(): void {
    if (!this.preview) return

    this.maybeBuildGeneratedCover()
    const { src, missing } = this.coverView()

    this.preview.update({
      title: this.form.title,
      author: this.form.author,
      digest: this.form.digest,
      coverSrc: src,
      coverMissingText: missing,
      showCoverInBody: this.form.showCoverInBody,
      hasSourceUrl: Boolean(this.form.contentSourceUrl.trim())
    })

    this.refreshCoverMeta(src)
  }

  /** 当前封面在预览里应该显示什么：地址与缺失提示 */
  private coverView(): { src: string | null; missing: string | null } {
    const source = this.form.cover

    if (source.kind === 'upload') {
      return { src: source.file.previewUrl, missing: null }
    }

    if (source.kind === 'vault') {
      const file = resolveVaultImageFile(this.app, source.path, this.notePath)
      return file
        ? { src: this.app.vault.getResourcePath(file), missing: null }
        : { src: null, missing: `未找到封面图：${source.path}` }
    }

    if (source.kind === 'auto' && this.firstBodyImagePreview) {
      return { src: this.firstBodyImagePreview, missing: null }
    }

    // generated，或 auto 但全文没有图片
    return {
      src: this.coverPreviewUrl,
      missing: this.coverPreviewUrl
        ? null
        : this.coverBuilding
          ? '正在生成标题卡片…'
          : '全文没有图片，发布时将按标题生成封面'
    }
  }

  /** 封面缩略图、来源角标与说明 */
  private refreshCoverMeta(src: string | null): void {
    if (!this.coverThumbImg || !this.coverBadgeEl || !this.coverHintEl) return

    const source = this.form.cover
    if (src) {
      if (this.coverThumbImg.getAttribute('src') !== src) {
        this.coverThumbImg.src = src
      }
      this.coverThumbImg.removeClass('is-hidden')
    } else {
      this.coverThumbImg.removeAttribute('src')
      this.coverThumbImg.addClass('is-hidden')
    }
    this.coverBadgeEl.setText(coverSourceLabel(source, this.firstBodyImagePath))
    this.coverHintEl.setText(coverSourceHint(source))
  }

  /** 标题卡片依赖 canvas 生成，输入时防抖，避免每敲一个字都重算 */
  private maybeBuildGeneratedCover(): void {
    const usesGenerated =
      this.form.cover.kind === 'generated' ||
      (this.form.cover.kind === 'auto' && !this.firstBodyImagePath)

    if (!usesGenerated) {
      this.coverPreviewUrl = null
      return
    }
    if (this.generatedTitle === this.form.title.trim()) return

    if (this.coverTimer !== null) window.clearTimeout(this.coverTimer)
    this.coverTimer = window.setTimeout(() => {
      this.coverTimer = null
      void this.buildGeneratedCover()
    }, 250)
  }

  private async buildGeneratedCover(): Promise<void> {
    if (this.coverBuilding) return
    // 生成期间标题可能继续变化；用请求时的标题判断结果是否仍然有效
    const requested = this.form.title.trim()

    this.coverBuilding = true
    try {
      const cover = await generateDefaultCover(requested || '未命名文章')
      if (this.form.title.trim() !== requested) return
      this.coverPreviewUrl = arrayBufferToDataUrl(cover.data, cover.contentType)
      this.generatedTitle = requested
      this.refreshPreview()
    } catch (error) {
      console.warn('封面预览生成失败:', error)
      this.generatedTitle = requested
    } finally {
      this.coverBuilding = false
    }
  }

  // ---- 发布前检查 ---------------------------------------------------------

  private async runChecks(): Promise<void> {
    if (this.checkRunning || !this.checkBtn) return
    this.checkRunning = true
    this.checkBtn.disabled = true
    this.checkBtn.setText('检查中…')

    try {
      const extraWords = this.plugin.settings.sensitiveWords
        .split(/[,，\n]/)
        .map((word) => word.trim())
        .filter(Boolean)

      this.checkReport = await runChecks(
        {
          html: this.html,
          title: this.form.title,
          digest: this.form.digest,
          contentSourceUrl: this.form.contentSourceUrl,
          extraWords
        },
        (partial) => {
          this.checkReport = partial
          this.renderChips(summarizeChecks(partial.links, partial.words))
        }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      new Notice(`检查失败：${message}`)
    } finally {
      this.checkRunning = false
      this.checkBtn.disabled = false
      this.checkBtn.setText('发布前检查')
      this.renderChecksReport()
    }
  }

  private renderChecksReport(): void {
    if (!this.reportEl) return
    const issues = collectIssues(this.checkReport)
    this.reportEl.empty()

    if (issues.length === 0) {
      this.reportEl.addClass('is-hidden')
      return
    }

    this.reportEl.removeClass('is-hidden')
    const head = this.reportEl.createDiv({ cls: 'bm-md-pm-report-head' })
    head.createSpan({ cls: 'bm-md-pm-report-title', text: '检查结果' })
    const close = head.createEl('button', {
      cls: 'bm-md-pm-report-close',
      text: '收起',
      attr: { type: 'button' }
    })
    close.addEventListener('click', () => this.reportEl?.addClass('is-hidden'))

    const list = this.reportEl.createDiv({ cls: 'bm-md-pm-report-list' })
    for (const issue of issues) {
      const row = list.createDiv({ cls: `bm-md-pm-report-row is-${issue.kind}` })
      row.createSpan({ cls: 'bm-md-pm-report-mark', text: issue.label })
      row.createSpan({ cls: 'bm-md-pm-report-text', text: issue.detail })
    }
    this.reportEl.createEl('p', {
      cls: 'bm-md-pm-report-foot',
      text: '检查只做提示，不阻止发布；图片上传失败仍会中止发布。'
    })
  }

  // ---- 封面解析与发布 -----------------------------------------------------

  /**
   * 确定封面并以永久素材形式上传，返回 thumb_media_id。
   *
   * `reuse` 提供上次发布时同一来源的素材 id 时直接沿用：覆盖更新
   * 通常只改正文，重复上传封面既慢又白占永久素材配额。
   */
  private async resolveCover(
    api: WeChatApi,
    results: ImageProcessResult[],
    reuse?: { coverKey?: string; thumbMediaId?: string }
  ): Promise<ResolvedCover> {
    const source = this.form.cover
    const coverKey = coverKeyForSource(source, results[0]?.originalPath ?? null, this.form.title)

    if (reuse?.thumbMediaId && reuse.coverKey === coverKey) {
      return { thumbMediaId: reuse.thumbMediaId, coverKey, reused: true }
    }

    if (source.kind === 'vault') {
      const explicit = source.path.trim()
      const file = resolveVaultImageFile(this.app, explicit, this.notePath)
      const data = file ? await readImageFromVault(this.app, file.path) : null
      if (!file || !data) {
        throw new Error(`未找到封面图：${explicit}`)
      }
      const compressed = await compressImage(data)
      return {
        thumbMediaId: await api.uploadCoverImage(
          compressed.data,
          file.name || 'cover',
          compressed.contentType
        ),
        coverKey,
        reused: false
      }
    }

    if (source.kind === 'upload') {
      const compressed = await compressImage(source.file.data)
      return {
        thumbMediaId: await api.uploadCoverImage(
          compressed.data,
          source.file.name || 'cover',
          compressed.contentType
        ),
        coverKey,
        reused: false
      }
    }

    // auto：正文图片已通过 uploadimg 转存，但该接口不返回 media_id，
    // 需要把首图字节再以永久素材形式上传一次作为封面
    if (source.kind === 'auto' && results.length > 0) {
      const first = results[0]
      return {
        thumbMediaId: await api.uploadCoverImage(first.data, first.filename, first.contentType),
        coverKey,
        reused: false
      }
    }

    const cover = await generateDefaultCover(this.form.title.trim() || '未命名文章')
    return {
      thumbMediaId: await api.uploadCoverImage(cover.data, 'cover.jpg', cover.contentType),
      coverKey,
      reused: false
    }
  }

  /** 组装微信文章对象；两种发布方式共用同一份字段来源 */
  private buildArticle(html: string, thumbMediaId: string): WeChatArticle {
    return {
      title: this.form.title.trim(),
      content: html,
      author: this.form.author.trim() || undefined,
      digest: this.form.digest.trim() || undefined,
      content_source_url: this.form.contentSourceUrl.trim() || undefined,
      thumb_media_id: thumbMediaId,
      show_cover_pic: this.form.showCoverInBody ? 1 : 0,
      need_open_comment: this.form.needOpenComment ? 1 : 0,
      only_fans_can_comment: this.form.onlyFansCanComment ? 1 : 0
    }
  }

  async publish(): Promise<void> {
    if (this.isPublishing) return

    const fields = computeFieldState(this.form)
    // 微信接口对标题/作者/摘要有长度限制，超限时给出明确提示而不是让接口报错
    const validationError = validateWeChatArticleFields({
      title: this.form.title,
      author: this.form.author,
      digest: this.form.digest
    })
    if (validationError) {
      new Notice(validationError)
      return
    }
    if (!canSubmit(this.form, fields)) {
      new Notice('请先选择要覆盖的草稿，或切换为新建草稿')
      return
    }
    // 凭证在发第一张图之前先验一次：否则要等图片全部上传完，
    // 才在草稿接口上收到「不合法的 AppSecret」，既慢又难定位
    if (!isWeChatConfigured(this.plugin.settings)) {
      new Notice('请先在设置中填写公众号 AppID 与 AppSecret，或启用手动 token 模式')
      return
    }

    this.isPublishing = true
    this.setButtonsEnabled(false)

    // 在任何 await 之前锁定本次发布方式：发布期间用户仍可能操作弹窗，
    // 中途切换会变成「以为在覆盖，实际新建了一篇」
    const updating = this.form.publishMode === 'update' && this.form.draftLink !== null
    const target = this.form.draftLink

    try {
      const api = this.plugin.createWeChatApi()
      const activeFilePath = this.notePath

      // 先把凭证换成 access_token：配置写错、IP 未加白名单、手动 token 过期
      // 都会在这一步暴露，不必等到图片上传完才在草稿接口上失败
      this.updateProgress('正在校验公众号凭证…')
      await this.verifyCredentials(api)

      // 弹窗打开期间笔记可能继续被编辑，发布时重新获取最新渲染结果
      this.updateProgress('正在渲染最新内容…')
      const content = this.loadContent ? await this.loadContent() : null
      const htmlToPublish = content?.html ?? this.html

      const onProgress: ProgressCallback = (current, total, filename) => {
        this.updateProgress(`正在处理图片 ${current}/${total}：${filename}`)
      }

      this.updateProgress('正在扫描图片…')
      const {
        html: processedHtml,
        results,
        errors
      } = await processImages(
        htmlToPublish,
        this.app,
        api,
        activeFilePath,
        DEFAULT_IMAGE_OPTIONS,
        onProgress
      )

      // 任一图片失败即取消发布：残留本地路径/外链的草稿在微信端会裂图或被拒
      if (errors.length > 0) {
        console.warn('图片处理失败，发布已取消:', errors)
        throw new Error(`${errors.length} 张图片处理失败，已取消发布（${errors[0]}）`)
      }
      if (results.length > 0) {
        new Notice(`已上传 ${results.length} 张图片`)
      }

      // 微信 news 草稿必须有封面（thumb_media_id）
      this.updateProgress(updating ? '正在检查封面…' : '正在上传封面…')
      let cover = await this.resolveCover(
        api,
        results,
        updating && target
          ? { coverKey: target.coverKey, thumbMediaId: target.thumbMediaId }
          : undefined
      )
      if (cover.reused) {
        this.updateProgress('封面未变化，沿用上次素材…')
      }

      let mediaId: string
      if (updating && target) {
        this.updateProgress('正在覆盖更新草稿…')
        try {
          await api.updateDraft(target.mediaId, this.buildArticle(processedHtml, cover.thumbMediaId))
          mediaId = target.mediaId
          new Notice('已覆盖更新草稿')
        } catch (error) {
          const action = classifyUpdateFailure(weChatErrorCode(error) ?? 0)

          if (action === 'retryWithoutCover') {
            // 缓存的上游封面素材已失效：清掉缓存重新上传后再试一次
            console.warn('封面素材失效，重新上传后重试覆盖:', error)
            this.updateProgress('封面素材已失效，正在重新上传…')
            cover = await this.resolveCover(api, results)
            await api.updateDraft(
              target.mediaId,
              this.buildArticle(processedHtml, cover.thumbMediaId)
            )
            mediaId = target.mediaId
            new Notice('已覆盖更新草稿')
          } else if (action === 'recreated') {
            // 目标草稿已不存在：用户的意图是让草稿是最新的，直接新建一篇
            console.warn('原草稿不可用，改为新建:', error)
            this.updateProgress('原草稿已不可用，正在新建草稿…')
            mediaId = await api.addDraft(this.buildArticle(processedHtml, cover.thumbMediaId))
            new Notice('原草稿已不存在，已新建一篇草稿')
          } else if (isWeChatError(error, 45064)) {
            throw new Error(
              '该草稿对应的文章已经群发，无法再修改。请在草稿管理里改用新建草稿。'
            )
          } else {
            throw error
          }
        }
      } else {
        this.updateProgress('正在创建草稿…')
        mediaId = await api.addDraft(this.buildArticle(processedHtml, cover.thumbMediaId))
        new Notice('草稿保存成功')
      }

      // 记录关联：下次发布同一篇笔记时默认覆盖这篇草稿
      if (this.notePath) {
        await this.plugin.setDraftLink(this.notePath, {
          mediaId,
          title: this.form.title.trim(),
          updatedAt: Date.now(),
          thumbMediaId: cover.thumbMediaId,
          coverKey: cover.coverKey
        })
      }

      this.close()
      console.debug('草稿已保存，media_id:', mediaId, '上传图片数:', results.length)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      new Notice('发布失败：' + message)
      this.setButtonsEnabled(true)
    } finally {
      this.isPublishing = false
      this.refreshAll()
      this.updateProgress(null)
    }
  }

  /**
   * 发布前校验公众号凭证。
   *
   * 自动模式会真正换一次 access_token（不读本地缓存），这样 AppID /
   * AppSecret 填错、IP 不在白名单都能在上传图片之前暴露；手动模式只
   * 检查 token 是否还在有效期内。凭证类错误码附上该去哪里修改的说明，
   * 其余错误原样抛出。
   */
  private async verifyCredentials(api: WeChatApi): Promise<void> {
    try {
      await api.verifyCredentials()
    } catch (error) {
      const hint = credentialFailureHint(weChatErrorCode(error))
      if (hint) {
        throw new Error(hint)
      }
      throw error
    }
  }

  private setButtonsEnabled(enabled: boolean): void {
    if (this.cancelBtn) this.cancelBtn.disabled = !enabled
    if (this.submitBtn) {
      this.submitBtn.disabled = !enabled
      this.submitBtn.setText(enabled ? primaryActionLabel(this.form.publishMode) : '发布中…')
    }
    if (this.checkBtn) this.checkBtn.disabled = !enabled
  }

  /** 进度文案显示在页脚；传 null 收起 */
  private updateProgress(message: string | null): void {
    if (!this.progressEl) return
    if (message === null) {
      this.progressEl.setText('')
      this.progressEl.addClass('is-hidden')
      return
    }
    this.progressEl.setText(message)
    this.progressEl.removeClass('is-hidden')
  }

  onClose(): void {
    if (this.coverTimer !== null) {
      window.clearTimeout(this.coverTimer)
      this.coverTimer = null
    }
    this.releaseLocalCover(this.form.cover)
    this.coverPreviewUrl = null
    this.contentEl.empty()
  }
}
