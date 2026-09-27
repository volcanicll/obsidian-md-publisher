import { Modal, App, Setting, Notice } from 'obsidian'
import type BmMdPlugin from '../main'
import type { WeChatApi } from '../lib/wechat/wechat-api'
import { extractTitleFromMarkdown, extractDigestFromMarkdown } from '../lib/wechat/wechat-api'
import {
  isWeChatConfigured,
  validateWeChatArticleFields,
  charLength,
  WECHAT_LIMITS
} from '../lib/wechat/config'
import { PublishPreviewModal } from './PublishPreviewModal'
import {
  compressImage,
  generateDefaultCover,
  normalizeImagePath,
  processImages,
  readImageFromVault,
  DEFAULT_IMAGE_OPTIONS,
  type ImageProcessResult,
  type ProgressCallback
} from '../lib/image-processor'

export interface PublishModalContent {
  html: string
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
}

/**
 * 发布到微信公众号草稿箱的确认弹窗。
 */
export class PublishModal extends Modal {
  private html: string
  private plugin: BmMdPlugin
  private loadContent?: () => Promise<PublishModalContent | null>
  private title: string
  private digest: string
  private author: string
  private coverPath: string
  private contentSourceUrl: string
  private needOpenComment: boolean
  private onlyFansCanComment: boolean
  private isPublishing: boolean = false
  private progressEl: HTMLElement | null = null
  private previewBtn: HTMLButtonElement | null = null

  constructor(app: App, options: PublishModalOptions) {
    super(app)
    this.html = options.html
    this.plugin = options.plugin
    this.loadContent = options.loadContent

    // Extract defaults from markdown
    this.title = extractTitleFromMarkdown(options.markdown)
    this.digest = extractDigestFromMarkdown(options.markdown)
    this.author = ''
    this.coverPath = ''
    this.contentSourceUrl = ''
    this.needOpenComment = this.plugin.settings.defaultOpenComment
    this.onlyFansCanComment = this.plugin.settings.defaultFansOnlyComment
  }

  /** 给输入控件挂实时长度计数；超限时计数变红，编辑期即可发现，不必等到发布 */
  private attachLengthCounter(
    setting: Setting,
    limit: number,
    getValue: () => string
  ): void {
    const counter = setting.controlEl.createSpan({ cls: 'bm-md-field-count' })
    const update = () => {
      const len = charLength(getValue())
      counter.setText(`${len} / ${limit}`)
      counter.classList.toggle('bm-md-count-over', len > limit)
    }
    update()
    setting.controlEl.addEventListener('change', update)
    // input 事件覆盖逐字输入，change 覆盖粘贴与程序赋值
    setting.controlEl.addEventListener('input', update)
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('bm-md-publish-modal')

    // Title
    contentEl.createEl('h2', { text: '发布到微信公众号草稿', cls: 'bm-md-modal-title' })

    // Check if WeChat is configured
    if (!isWeChatConfigured(this.plugin.settings)) {
      contentEl.createEl('p', {
        text: '尚未配置微信公众号。请先在 设置 → Markdown Publisher 中填写 AppID 与 AppSecret，或启用手动 token 模式。',
        cls: 'bm-md-warning'
      })

      new Setting(contentEl).addButton((button) => {
        button.setButtonText('关闭').onClick(() => this.close())
      })
      return
    }

    // Article Title
    const titleSetting = new Setting(contentEl)
      .setName('文章标题')
      .setDesc(`将显示在公众号文章顶部，最多 ${WECHAT_LIMITS.title} 字`)
      .addText((text) => {
        text.inputEl.classList.add('bm-md-title-input')
        text
          .setPlaceholder('请输入文章标题')
          .setValue(this.title)
          .onChange((value) => {
            this.title = value
          })
      })
    this.attachLengthCounter(titleSetting, WECHAT_LIMITS.title, () => this.title)

    // Article Author
    const authorSetting = new Setting(contentEl)
      .setName('作者')
      .setDesc(`可选，显示在标题下方，最多 ${WECHAT_LIMITS.author} 字`)
      .addText((text) => {
        text
          .setPlaceholder('作者名')
          .setValue(this.author)
          .onChange((value) => {
            this.author = value
          })
      })
    this.attachLengthCounter(authorSetting, WECHAT_LIMITS.author, () => this.author)

    // Article Digest
    const digestSetting = new Setting(contentEl)
      .setName('摘要')
      .setDesc(`可选，显示在分享卡片中，最多 ${WECHAT_LIMITS.digest} 字`)
      .addTextArea((text) => {
        text.inputEl.classList.add('bm-md-digest-textarea')
        text
          .setPlaceholder('已自动从正文开头提取')
          .setValue(this.digest)
          .onChange((value) => {
            this.digest = value
          })
      })
    this.attachLengthCounter(digestSetting, WECHAT_LIMITS.digest, () => this.digest)

    // Cover image
    new Setting(contentEl)
      .setName('封面图路径')
      .setDesc(
        '可选，vault 内图片路径。微信公众号要求草稿必须带封面：留空时自动用正文第一张图片，全文无图则按标题生成默认封面。'
      )
      .addText((text) => {
        text
          .setPlaceholder('assets/cover.png')
          .setValue(this.coverPath)
          .onChange((value) => {
            this.coverPath = value
          })
      })

    // Original Article URL
    new Setting(contentEl)
      .setName('原文链接')
      .setDesc('可选，「阅读原文」按钮跳转地址')
      .addText((text) => {
        text
          .setPlaceholder('原文链接')
          .setValue(this.contentSourceUrl)
          .onChange((value) => {
            this.contentSourceUrl = value
          })
      })

    // Comment toggles
    new Setting(contentEl)
      .setName('开启评论')
      .setDesc('允许读者在文章下留言')
      .addToggle((toggle) => {
        toggle.setValue(this.needOpenComment).onChange((value) => {
          this.needOpenComment = value
          // 关闭评论时取消「仅粉丝可评论」
          if (!value) {
            this.onlyFansCanComment = false
          }
        })
      })

    new Setting(contentEl)
      .setName('仅粉丝可评论')
      .setDesc('开启评论后，仅关注者可以留言')
      .addToggle((toggle) => {
        toggle.setValue(this.onlyFansCanComment).onChange((value) => {
          this.onlyFansCanComment = value
        })
      })

    // Info text
    contentEl.createEl('p', {
      text: '文章将保存到公众号草稿箱，本地图片会自动上传。',
      cls: 'bm-md-info'
    })

    // Progress container (hidden initially)
    this.progressEl = contentEl.createDiv({ cls: 'bm-md-progress-container bm-md-hidden' })

    // Action buttons
    const buttonContainer = contentEl.createDiv({ cls: 'bm-md-button-container' })

    const previewBtn = buttonContainer.createEl('button', {
      text: '预览效果',
      cls: 'bm-md-btn bm-md-preview-btn'
    })
    previewBtn.addEventListener('click', () => {
      new PublishPreviewModal(this.app, {
        plugin: this.plugin,
        form: {
          title: this.title,
          author: this.author,
          digest: this.digest,
          coverPath: this.coverPath,
          contentSourceUrl: this.contentSourceUrl
        },
        html: this.html
      }).open()
    })

    const cancelBtn = buttonContainer.createEl('button', {
      text: '取消',
      cls: 'bm-md-btn bm-md-cancel-btn'
    })
    cancelBtn.addEventListener('click', () => this.close())

    const publishBtn = buttonContainer.createEl('button', {
      text: '保存到草稿',
      cls: 'bm-md-btn bm-md-btn-primary bm-md-publish-btn'
    })
    publishBtn.addEventListener('click', () => {
      void this.publish()
    })

    // 设置面板按钮状态时把预览按钮一并禁用
    this.previewBtn = previewBtn
  }

  private updateProgress(message: string): void {
    if (this.progressEl) {
      this.progressEl.removeClass('bm-md-hidden')
      this.progressEl.empty()
      this.progressEl.createEl('p', { text: message, cls: 'bm-md-progress-text' })
    }
  }

  private setButtonsEnabled(enabled: boolean): void {
    const publishBtn = this.contentEl.querySelector('.bm-md-publish-btn') as HTMLButtonElement
    const cancelBtn = this.contentEl.querySelector('.bm-md-cancel-btn') as HTMLButtonElement
    if (publishBtn) {
      publishBtn.disabled = !enabled
    }
    if (cancelBtn) {
      cancelBtn.disabled = !enabled
    }
    if (this.previewBtn) {
      this.previewBtn.disabled = !enabled
    }
  }

  /**
   * 确定封面并以永久素材形式上传，返回 thumb_media_id。
   * 优先级：用户指定的 vault 图片 → 正文第一张已上传图片 → 按标题生成的默认封面。
   */
  private async resolveCoverMediaId(
    api: WeChatApi,
    results: ImageProcessResult[],
    activeFilePath: string | null
  ): Promise<string> {
    const explicit = this.coverPath.trim()
    if (explicit) {
      const normalized = normalizeImagePath(explicit, activeFilePath) ?? explicit
      const data = await readImageFromVault(this.app, normalized)
      if (!data) {
        throw new Error(`未找到封面图：${explicit}`)
      }
      const compressed = await compressImage(data)
      return api.uploadCoverImage(
        compressed.data,
        normalized.split('/').pop() || 'cover',
        compressed.contentType
      )
    }

    if (results.length > 0) {
      // 正文图片已通过 uploadimg 转存，但该接口不返回 media_id，
      // 需要把首图字节再以永久素材形式上传一次作为封面
      const first = results[0]
      return api.uploadCoverImage(first.data, first.filename, first.contentType)
    }

    const cover = await generateDefaultCover(this.title.trim())
    return api.uploadCoverImage(cover.data, 'cover.jpg', cover.contentType)
  }

  async publish(): Promise<void> {
    if (this.isPublishing) return

    // 微信接口对标题/作者/摘要有长度限制，超限时给出明确提示而不是让接口报错
    const validationError = validateWeChatArticleFields({
      title: this.title,
      author: this.author,
      digest: this.digest
    })
    if (validationError) {
      new Notice(validationError)
      return
    }

    this.isPublishing = true
    this.setButtonsEnabled(false)
    this.updateProgress('初始化…')

    try {
      const api = this.plugin.createWeChatApi()

      // Get active file path for resolving relative image paths
      const activeFile = this.app.workspace.getActiveFile()
      const activeFilePath = activeFile?.path ?? null

      // 弹窗打开期间笔记可能继续被编辑，发布时重新获取最新渲染结果
      this.updateProgress('正在渲染最新内容…')
      const content = this.loadContent ? await this.loadContent() : null
      const htmlToPublish = content?.html ?? this.html

      // Process local & remote images: extract, compress, upload to WeChat
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
      this.updateProgress('正在上传封面…')
      const thumbMediaId = await this.resolveCoverMediaId(api, results, activeFilePath)

      // Create draft with processed HTML
      this.updateProgress('正在创建草稿…')

      const mediaId = await api.addDraft({
        title: this.title.trim(),
        content: processedHtml,
        author: this.author.trim() || undefined,
        digest: this.digest.trim() || undefined,
        content_source_url: this.contentSourceUrl.trim() || undefined,
        thumb_media_id: thumbMediaId,
        show_cover_pic: 0,
        need_open_comment: this.needOpenComment ? 1 : 0,
        only_fans_can_comment: this.onlyFansCanComment ? 1 : 0
      })

      new Notice('草稿保存成功')
      this.close()

      // Log the media_id for reference
      console.debug('草稿已创建，media_id:', mediaId, '上传图片数:', results.length)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      new Notice('发布失败：' + message)

      // Reset UI
      if (this.progressEl) {
        this.progressEl.addClass('bm-md-hidden')
      }
      this.setButtonsEnabled(true)
    } finally {
      this.isPublishing = false
    }
  }

  onClose(): void {
    const { contentEl } = this
    contentEl.empty()
  }
}
