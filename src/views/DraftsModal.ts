import { Modal, App, Notice } from 'obsidian'
import type BmMdPlugin from '../main'
import { WeChatApi } from '../lib/wechat/wechat-api'
import type { WeChatDraftListItem } from '../lib/wechat/types'

/**
 * 管理公众号草稿箱：列出草稿、删除草稿。
 */
export class DraftsModal extends Modal {
  private plugin: BmMdPlugin
  private contentElRef: HTMLElement | null = null
  private isLoading = false

  constructor(app: App, plugin: BmMdPlugin) {
    super(app)
    this.plugin = plugin
  }

  private get api(): WeChatApi {
    const s = this.plugin.settings
    return new WeChatApi(
      {
        appId: s.wechatAppId,
        appSecret: s.wechatAppSecret,
        accessToken: s.useManualToken ? s.manualAccessToken : s.wechatAccessToken,
        tokenExpireTime: s.useManualToken ? s.manualTokenExpireTime : s.wechatTokenExpireTime,
        manualMode: s.useManualToken,
      },
      {
        onTokenRefresh: async (token, expireTime) => {
          this.plugin.settings.wechatAccessToken = token
          this.plugin.settings.wechatTokenExpireTime = expireTime
          await this.plugin.saveSettings()
        }
      }
    )
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('bm-md-drafts-modal')
    contentEl.createEl('h2', { text: '公众号草稿', cls: 'bm-md-modal-title' })
    this.contentElRef = contentEl.createDiv({ cls: 'bm-md-drafts-content' })

    // 未配置公众号时给出提示
    if (!this.plugin.settings.wechatAppId || !this.plugin.settings.wechatAppSecret) {
      contentEl.createEl('p', {
        text: '尚未配置微信公众号。请先在 设置 → Markdown Publisher 中填写 AppID 与 AppSecret。',
        cls: 'bm-md-warning',
      })
      renderCloseButton(contentEl, '关闭', () => this.close())
      return
    }

    this.renderLoading()
    void this.loadDrafts()
  }

  private renderLoading(): void {
    if (!this.contentElRef) return
    this.contentElRef.empty()
    const p = this.contentElRef.createEl('p', {
      text: '正在获取草稿列表…',
      cls: 'bm-md-info',
    })
    p.classList.add('bm-md-progress-text')
  }

  private async loadDrafts(): Promise<void> {
    if (this.isLoading) return
    this.isLoading = true
    this.renderLoading()

    try {
      const data = await this.api.listDrafts(0, 20)
      this.renderList(data.item || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.renderError(message)
    } finally {
      this.isLoading = false
    }
  }

  private renderList(items: WeChatDraftListItem[]): void {
    if (!this.contentElRef) return

    this.contentElRef.empty()

    if (items.length === 0) {
      this.contentElRef.createEl('p', {
        text: '草稿箱是空的，去发布一篇试试。',
        cls: 'bm-md-info',
      })
    }

    for (const item of items) {
      const newsItem = item.content?.news_item?.[0]
      const title = newsItem?.title || '未命名草稿'
      const time = new Date(item.update_time * 1000).toLocaleString('zh-CN')

      const row = this.contentElRef.createDiv({ cls: 'bm-md-draft-row' })
      const info = row.createDiv({ cls: 'bm-md-draft-info' })
      info.createDiv({ cls: 'bm-md-draft-title', text: title })
      info.createDiv({ cls: 'bm-md-draft-meta', text: `更新于 ${time}` })

      const del = row.createDiv({ cls: 'bm-md-draft-delete', text: '删除' })
      del.addEventListener('click', () => {
        void this.confirmAndDelete(item.media_id, title)
      })
    }
  }

  private renderError(message: string): void {
    if (!this.contentElRef) return
    this.contentElRef.empty()
    this.contentElRef.createEl('p', {
      text: `获取草稿失败：${message}`,
      cls: 'bm-md-warning',
    })
  }

  private async confirmAndDelete(mediaId: string, title: string): Promise<void> {
    const confirmed = window.confirm(`确定删除草稿「${title}」吗？此操作不可撤销。`)
    if (!confirmed) return

    try {
      await this.api.deleteDraft(mediaId)
      new Notice(`已删除草稿「${title}」`)
      // 重新加载列表
      this.isLoading = false
      void this.loadDrafts()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      new Notice(`删除失败：${message}`)
    }
  }

  onClose(): void {
    const { contentEl } = this
    contentEl.empty()
  }
}

/** 渲染一个居右的关闭按钮 */
function renderCloseButton(
  contentEl: HTMLElement,
  label: string,
  onClick: () => void
): void {
  const container = contentEl.createDiv({ cls: 'bm-md-button-container' })
  const btn = container.createEl('button', { text: label, cls: 'bm-md-cancel-btn' })
  btn.addEventListener('click', onClick)
}
