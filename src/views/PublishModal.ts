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
    contentEl.createEl('h2', { text: 'Publish to WeChat', cls: 'bm-md-modal-title' })

    // Check if WeChat is configured
    if (!this.plugin.settings.wechatAppId || !this.plugin.settings.wechatAppSecret) {
      contentEl.createEl('p', {
        text: '⚠️ Please configure WeChat app ID and app secret in settings first',
        cls: 'bm-md-warning'
      })

      new Setting(contentEl)
        .addButton(button => {
          button
            .setButtonText('Close')
            .onClick(() => this.close())
        })
      return
    }

    // Article Title
    new Setting(contentEl)
      .setName('Article title')
      .setDesc('Title will be displayed at the top of the WeChat article')
      .addText(text => {
        text.inputEl.classList.add('bm-md-title-input')
        text
          .setPlaceholder('Enter article title')
          .setValue(this.title)
          .onChange(value => {
            this.title = value
          })
      })

    // Article Author
    new Setting(contentEl)
      .setName('Author')
      .setDesc('Optional, displayed below the title')
      .addText(text => {
        text
          .setPlaceholder('Author name')
          .setValue(this.author)
          .onChange(value => {
            this.author = value
          })
      })

    // Article Digest
    new Setting(contentEl)
      .setName('Article digest')
      .setDesc('Optional, displayed in share card, max 120 characters')
      .addTextArea(text => {
        text.inputEl.classList.add('bm-md-digest-textarea')
        text
          .setPlaceholder('Auto-extracted from article beginning')
          .setValue(this.digest)
          .onChange(value => {
            this.digest = value
          })
      })

    // Original Article URL
    new Setting(contentEl)
      .setName('Original article URL')
      .setDesc('Optional, link for "Read original" button')
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
      text: '📝 Article will be saved to WeChat drafts, please preview and confirm on the WeChat platform before publishing',
      cls: 'bm-md-info'
    })

    // Action buttons
    const buttonContainer = contentEl.createDiv({ cls: 'bm-md-button-container' })

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'bm-md-cancel-btn' })
    cancelBtn.addEventListener('click', () => this.close())

    const publishBtn = buttonContainer.createEl('button', { text: 'Save to drafts', cls: 'mod-cta bm-md-publish-btn' })
    publishBtn.addEventListener('click', () => {
      void this.publish()
    })
  }

  async publish(): Promise<void> {
    if (this.isPublishing) return

    if (!this.title.trim()) {
      new Notice('Please enter article title')
      return
    }

    this.isPublishing = true
    const publishBtn = this.contentEl.querySelector('.bm-md-publish-btn') as HTMLButtonElement
    if (publishBtn) {
      publishBtn.setText('Publishing...')
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

      new Notice('✅ Article saved to drafts!')
      this.close()

      // Log the media_id for reference
      console.debug('Draft created with media_id:', mediaId)

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      new Notice('❌ Publishing failed: ' + message)

      if (publishBtn) {
        publishBtn.setText('Save to drafts')
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
