import { Modal, App, Setting, Notice } from 'obsidian'
import type BmMdPlugin from '../main'
import { extractTitleFromMarkdown, extractDigestFromMarkdown } from '../lib/wechat/wechat-api'
import {
  isWeChatConfigured,
  validateWeChatArticleFields,
  WECHAT_LIMITS
} from '../lib/wechat/config'
import { processImages, DEFAULT_IMAGE_OPTIONS, type ProgressCallback } from '../lib/image-processor'

export interface PublishModalOptions {
  markdown: string
  html: string
  plugin: BmMdPlugin
}

/**
 * 发布到微信公众号草稿箱的确认弹窗。
 */
export class PublishModal extends Modal {
  private markdown: string
  private html: string
  private plugin: BmMdPlugin
  private title: string
  private digest: string
  private author: string
  private contentSourceUrl: string
  private needOpenComment: boolean
  private onlyFansCanComment: boolean
  private isPublishing: boolean = false
  private progressEl: HTMLElement | null = null

  constructor(app: App, options: PublishModalOptions) {
    super(app)
    this.markdown = options.markdown
    this.html = options.html
    this.plugin = options.plugin

    // Extract defaults from markdown
    this.title = extractTitleFromMarkdown(this.markdown)
    this.digest = extractDigestFromMarkdown(this.markdown)
    this.author = ''
    this.contentSourceUrl = ''
    this.needOpenComment = this.plugin.settings.defaultOpenComment
    this.onlyFansCanComment = this.plugin.settings.defaultFansOnlyComment
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
    new Setting(contentEl)
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

    // Article Author
    new Setting(contentEl)
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

    // Article Digest
    new Setting(contentEl)
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

    const cancelBtn = buttonContainer.createEl('button', {
      text: '取消',
      cls: 'bm-md-cancel-btn'
    })
    cancelBtn.addEventListener('click', () => this.close())

    const publishBtn = buttonContainer.createEl('button', {
      text: '保存到草稿',
      cls: 'mod-cta bm-md-publish-btn'
    })
    publishBtn.addEventListener('click', () => {
      void this.publish()
    })
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

      // Process local images: extract, compress, upload to WeChat
      const onProgress: ProgressCallback = (current, total, filename) => {
        this.updateProgress(`正在上传图片 ${current}/${total}：${filename}`)
      }

      this.updateProgress('正在扫描本地图片…')

      const {
        html: processedHtml,
        results,
        errors
      } = await processImages(
        this.html,
        this.app,
        api,
        activeFilePath,
        DEFAULT_IMAGE_OPTIONS,
        onProgress
      )

      // Report image processing results
      if (results.length > 0) {
        new Notice(`已上传 ${results.length} 张图片`)
      }
      if (errors.length > 0) {
        console.warn('图片处理警告:', errors)
        new Notice(`${errors.length} 张图片处理失败，已跳过`, 5000)
      }

      // Create draft with processed HTML
      this.updateProgress('正在创建草稿…')

      const mediaId = await api.addDraft({
        title: this.title.trim(),
        content: processedHtml,
        author: this.author.trim() || undefined,
        digest: this.digest.trim() || undefined,
        content_source_url: this.contentSourceUrl.trim() || undefined,
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
