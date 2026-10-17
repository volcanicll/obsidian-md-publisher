import { Modal, App, Notice } from 'obsidian'
import type BmMdPlugin from '../main'
import type { WeChatDraftListItem } from '../lib/wechat/types'

const PAGE_SIZE = 20

export interface DraftPick {
  mediaId: string
  title: string
  updateTime: number
}

/**
 * 选择一篇已有草稿作为覆盖目标。
 *
 * 适用于没有本地关联的草稿（例如在公众号后台或旧版本里创建的文章），
 * 也为「不小心换了笔记文件名」提供手动重新绑定的入口。
 */
export class DraftPickerModal extends Modal {
  private plugin: BmMdPlugin
  private onPick: (draft: DraftPick) => void
  private onCancel: () => void
  private listEl: HTMLElement | null = null
  private isLoading = false
  private currentPage = 0
  private totalCount: number | null = null

  constructor(
    app: App,
    plugin: BmMdPlugin,
    onPick: (draft: DraftPick) => void,
    onCancel: () => void = () => {}
  ) {
    super(app)
    this.plugin = plugin
    this.onPick = onPick
    this.onCancel = onCancel
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('bm-md-drafts-modal')
    contentEl.createEl('h2', { text: '选择要覆盖的草稿', cls: 'bm-md-modal-title' })
    this.listEl = contentEl.createDiv({ cls: 'bm-md-drafts-content' })
    void this.loadPage(0)
  }

  private async loadPage(page: number): Promise<void> {
    if (this.isLoading || !this.listEl) return
    this.isLoading = true
    this.currentPage = page
    this.listEl.empty()
    this.listEl.createEl('p', {
      text: '正在获取草稿列表…',
      cls: 'bm-md-info bm-md-progress-text',
    })

    try {
      const data = await this.plugin.createWeChatApi().listDrafts(page * PAGE_SIZE, PAGE_SIZE)
      this.totalCount = data.total_count
      this.renderItems(data.item || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.listEl.empty()
      this.listEl.createEl('p', { text: `获取草稿失败：${message}`, cls: 'bm-md-warning' })
    } finally {
      this.isLoading = false
    }
  }

  private renderItems(items: WeChatDraftListItem[]): void {
    if (!this.listEl) return
    this.listEl.empty()

    if (items.length === 0) {
      this.listEl.createEl('p', { text: '草稿箱是空的，没有可覆盖的草稿。', cls: 'bm-md-info' })
      return
    }

    for (const item of items) {
      const news = item.content?.news_item ?? []
      const title = news[0]?.title || '未命名草稿'
      const time = new Date(item.update_time * 1000).toLocaleString('zh-CN')

      const row = this.listEl.createDiv({ cls: 'bm-md-draft-row' })
      const info = row.createDiv({ cls: 'bm-md-draft-info' })
      info.createDiv({ cls: 'bm-md-draft-title', text: title })
      const meta = [`更新于 ${time}`]
      if (news.length > 1) meta.push(`共 ${news.length} 篇图文`)
      info.createDiv({ cls: 'bm-md-draft-meta', text: meta.join(' · ') })

      const pick = row.createEl('button', {
        text: '覆盖这篇',
        cls: 'bm-md-btn bm-md-btn-primary bm-md-draft-delete',
      })
      pick.addEventListener('click', () => {
        if (news.length > 1) {
          // draft/update 只替换指定序号的图文，多图文草稿整体覆盖会丢其余文章
          new Notice('该草稿包含多篇图文，暂不支持整体覆盖')
          return
        }
        this.picked = true
        this.close()
        this.onPick({ mediaId: item.media_id, title, updateTime: item.update_time })
      })
    }

    this.renderPagination()
  }

  private get totalPages(): number {
    if (this.totalCount === null) return 1
    return Math.max(1, Math.ceil(this.totalCount / PAGE_SIZE))
  }

  private renderPagination(): void {
    if (!this.listEl || this.totalPages <= 1) return

    const pagination = this.listEl.createDiv({ cls: 'bm-md-drafts-pagination' })
    const prev = pagination.createEl('button', { text: '上一页', cls: 'bm-md-btn bm-md-page-btn' })
    prev.disabled = this.currentPage <= 0
    prev.addEventListener('click', () => void this.loadPage(this.currentPage - 1))

    pagination.createSpan({
      text: `第 ${this.currentPage + 1} / ${this.totalPages} 页`,
      cls: 'bm-md-drafts-page-info',
    })

    const next = pagination.createEl('button', { text: '下一页', cls: 'bm-md-btn bm-md-page-btn' })
    next.disabled = this.currentPage >= this.totalPages - 1
    next.addEventListener('click', () => void this.loadPage(this.currentPage + 1))
  }

  onClose(): void {
    this.contentEl.empty()
    // 用户没选就关掉（Esc / 点击遮罩）：让调用方把发布方式退回新建
    if (!this.picked) this.onCancel()
  }

  /** 选中标记：区分「选中后关闭」与「直接关闭」，后者需要通知调用方取消 */
  private picked = false
}
