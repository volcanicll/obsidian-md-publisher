import { Modal, App, Setting, Notice } from 'obsidian'
import type BmMdPlugin from '../main'
import { WeChatApi, extractTitleFromMarkdown, extractDigestFromMarkdown } from '../lib/wechat/wechat-api'

export interface PublishModalOptions {
  markdown: string
  html: string
  plugin: BmMdPlugin
}

/**
 * Modal for confirming and publishing article to WeChat Official Account
 */
export class PublishModal extends Modal {
  private markdown: string
  private html: string
  private plugin: BmMdPlugin
  private title: string
  private digest: string
  private author: string
  private contentSourceUrl: string
  private isPublishing: boolean = false

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
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('bm-md-publish-modal')

    // Title
    contentEl.createEl('h2', { text: '发布到微信公众号', cls: 'bm-md-modal-title' })

    // Check if WeChat is configured
    if (!this.plugin.settings.wechatAppId || !this.plugin.settings.wechatAppSecret) {
      contentEl.createEl('p', { 
        text: '⚠️ 请先在设置中配置微信公众号的 AppID 和 AppSecret',
        cls: 'bm-md-warning'
      })
      
      new Setting(contentEl)
        .addButton(button => {
          button
            .setButtonText('关闭')
            .onClick(() => this.close())
        })
      return
    }

    // Article Title
    new Setting(contentEl)
      .setName('文章标题')
      .setDesc('标题会显示在公众号文章顶部')
      .addText(text => {
        text.inputEl.classList.add('bm-md-title-input')
        text
          .setPlaceholder('请输入文章标题')
          .setValue(this.title)
          .onChange(value => {
            this.title = value
          })
      })

    // Article Author
    new Setting(contentEl)
      .setName('作者')
      .setDesc('可选，显示在标题下方')
      .addText(text => {
        text
          .setPlaceholder('作者名称')
          .setValue(this.author)
          .onChange(value => {
            this.author = value
          })
      })

    // Article Digest
    new Setting(contentEl)
      .setName('文章摘要')
      .setDesc('可选，显示在转发卡片中，最多120字')
      .addTextArea(text => {
        text.inputEl.classList.add('bm-md-digest-textarea')
        text
          .setPlaceholder('自动提取自文章开头')
          .setValue(this.digest)
          .onChange(value => {
            this.digest = value
          })
      })

    // Original Article URL
    new Setting(contentEl)
      .setName('原文链接')
      .setDesc('可选，点击"阅读原文"跳转的链接')
      .addText(text => {
        text
          .setPlaceholder('https://...')
          .setValue(this.contentSourceUrl)
          .onChange(value => {
            this.contentSourceUrl = value
          })
      })

    // Info text
    contentEl.createEl('p', { 
      text: '📝 文章将保存到公众号草稿箱，请登录微信公众平台预览确认后再发布',
      cls: 'bm-md-info'
    })

    // Action buttons
    const buttonContainer = contentEl.createDiv({ cls: 'bm-md-button-container' })
    
    const cancelBtn = buttonContainer.createEl('button', { text: '取消', cls: 'bm-md-cancel-btn' })
    cancelBtn.addEventListener('click', () => this.close())

    const publishBtn = buttonContainer.createEl('button', { text: '保存到草稿箱', cls: 'mod-cta bm-md-publish-btn' })
    publishBtn.addEventListener('click', () => {
      void this.publish()
    })
  }

  async publish(): Promise<void> {
    if (this.isPublishing) return
    
    if (!this.title.trim()) {
      new Notice('请输入文章标题')
      return
    }

    this.isPublishing = true
    const publishBtn = this.contentEl.querySelector('.bm-md-publish-btn') as HTMLButtonElement
    if (publishBtn) {
      publishBtn.setText('发布中...')
      publishBtn.disabled = true
    }

    try {
      const api = new WeChatApi({
        appId: this.plugin.settings.wechatAppId,
        appSecret: this.plugin.settings.wechatAppSecret,
        accessToken: this.plugin.settings.wechatAccessToken,
        tokenExpireTime: this.plugin.settings.wechatTokenExpireTime
      }, {
        onTokenRefresh: async (token, expireTime) => {
          this.plugin.settings.wechatAccessToken = token
          this.plugin.settings.wechatTokenExpireTime = expireTime
          await this.plugin.saveSettings()
        }
      })

      const mediaId = await api.addDraft({
        title: this.title.trim(),
        content: this.html,
        author: this.author.trim() || undefined,
        digest: this.digest.trim() || undefined,
        content_source_url: this.contentSourceUrl.trim() || undefined,
        show_cover_pic: 0,
        need_open_comment: 0,
        only_fans_can_comment: 0
      })

      new Notice('✅ 文章已保存到草稿箱！')
      this.close()
      
      // Log the media_id for reference
      console.debug('Draft created with media_id:', mediaId)
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      new Notice('❌ 发布失败: ' + message)
      
      if (publishBtn) {
        publishBtn.setText('保存到草稿箱')
        publishBtn.disabled = false
      }
    } finally {
      this.isPublishing = false
    }
  }

  onClose(): void {
    const { contentEl } = this
    contentEl.empty()
  }
}
