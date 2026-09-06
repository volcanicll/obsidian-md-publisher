import { Modal, App, Notice } from 'obsidian'
import type BmMdPlugin from '../main'
import type { WeChatDraftListItem } from '../lib/wechat/types'
import { isWeChatConfigured } from '../lib/wechat/config'

const PAGE_SIZE = 20

/**
 * 管理公众号草稿箱：列出草稿（分页）、删除草稿。
 */
export class DraftsModal extends Modal {
  private plugin: BmMdPlugin
  private contentElRef: HTMLElement | null = null
  private isLoading = false
  private currentPage = 0
  private totalCount: number | null = null

  constructor(app: App, plugin: BmMdPlugin) {
    super(app)
    this.plugin = plugin
  }

  private get api() {
    return this.plugin.createWeChatApi()
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('bm-md-drafts-modal')
    contentEl.createEl('h2', { text: '公众号草稿', cls: 'bm-md-modal-title' })
    this.contentElRef = contentEl.createDiv({ cls: 'bm-md-drafts-content' })

    // 未配置公众号时给出提示（含手动 token 模式）
    if (!isWeChatConfigured(this.plugin.settings)) {
      contentEl.createEl('p', {
        text: '尚未配置微信公众号。请先在 设置 → Markdown Publisher 中填写 AppID 与 AppSecret，或启用手动 token 模式。',
        cls: 'bm-md-warning',
      })
      renderCloseButton(contentEl, '关闭', () => this.close())
      return
    }

    void this.loadDrafts(0)
  }

  private renderLoading(): void {
    if (!this.contentElRef) return
    this.contentElRef.empty()
    this.contentElRef.createEl('p', {
      text: '正在获取草稿列表…',
      cls: 'bm-md-info bm-md-progress-text',
    })
  }

  private async loadDrafts(page: number): Promise<void> {
    if (this.isLoading) return
    this.isLoading = true
    this.currentPage = page
    this.renderLoading()

    try {
      const data = await this.api.listDrafts(page * PAGE_SIZE, PAGE_SIZE)
      this.totalCount = data.total_count
      this.renderList(data.item || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.renderError(message)
    } finally {
      this.isLoading = false
    }
  }

  private get totalPages(): number {
    if (this.totalCount === null) return 1
    return Math.max(1, Math.ceil(this.totalCount / PAGE_SIZE))
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

    this.renderPagination()
  }

  /** 分页控制：上一页 / 页码 / 下一页 */
  private renderPagination(): void {
    if (!this.contentElRef || this.totalPages <= 1) return

    const pagination = this.contentElRef.createDiv({ cls: 'bm-md-drafts-pagination' })

    const prevBtn = pagination.createEl('button', {
      text: '上一页',
      cls: 'bm-md-cancel-btn',
    })
    prevBtn.disabled = this.currentPage <= 0
    prevBtn.addEventListener('click', () => {
      void this.loadDrafts(this.currentPage - 1)
    })

    pagination.createSpan({
      text: `第 ${this.currentPage + 1} / ${this.totalPages} 页`,
      cls: 'bm-md-drafts-page-info',
    })

    const nextBtn = pagination.createEl('button', {
      text: '下一页',
      cls: 'bm-md-cancel-btn',
    })
    nextBtn.disabled = this.currentPage >= this.totalPages - 1
    nextBtn.addEventListener('click', () => {
      void this.loadDrafts(this.currentPage + 1)
    })
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
      // 当前页删除后为空时回退一页
      let page = this.currentPage
      if (this.totalCount !== null && page > 0) {
        const remainingOnPage = this.totalCount - page * PAGE_SIZE
        if (remainingOnPage <= 1) page -= 1
      }
      void this.loadDrafts(page)
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
