import { Modal, App, Notice, Setting, TFile } from 'obsidian'
import type BmMdPlugin from '../main'
import type { WeChatDraftListItem, WeChatDraftNewsItem } from '../lib/wechat/types'
import { isWeChatConfigured } from '../lib/wechat/config'
import {
  draftLinkForImport,
  importDraftToVault,
  noteNameForTitle
} from '../lib/wechat/draft-import'
import { FolderPickerModal } from './publish/folder-picker'

const PAGE_SIZE = 20

/**
 * 删除草稿的确认弹窗（Obsidian 原生样式，替代 window.confirm）。
 */
class ConfirmDeleteModal extends Modal {
  private title: string
  private onConfirm: () => void

  constructor(app: App, title: string, onConfirm: () => void) {
    super(app)
    this.title = title
    this.onConfirm = onConfirm
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('p', {
      text: `确定删除草稿「${this.title}」吗？此操作不可撤销。`,
      cls: 'bm-md-warning',
    })
    new Setting(contentEl).addButton((button) => {
      button
        .setButtonText('删除')
        .setWarning()
        .onClick(() => {
          this.close()
          this.onConfirm()
        })
    })
    new Setting(contentEl).addButton((button) => {
      button.setButtonText('取消').onClick(() => this.close())
    })
  }

  onClose(): void {
    this.contentEl.empty()
  }
}

/**
 * 重新拉取前的确认：覆盖笔记会丢掉本地未发布的改动。
 */
class ConfirmOverwriteModal extends Modal {
  private notePath: string
  private onConfirm: () => void

  constructor(app: App, notePath: string, onConfirm: () => void) {
    super(app)
    this.notePath = notePath
    this.onConfirm = onConfirm
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('p', {
      text: `笔记「${this.notePath}」已经存在，重新拉取会用草稿内容覆盖它，本地尚未发布的改动会丢失。`,
      cls: 'bm-md-warning',
    })
    new Setting(contentEl).addButton((button) => {
      button
        .setButtonText('覆盖笔记')
        .setWarning()
        .onClick(() => {
          this.close()
          this.onConfirm()
        })
    })
    new Setting(contentEl).addButton((button) => {
      button.setButtonText('取消').onClick(() => this.close())
    })
  }

  onClose(): void {
    this.contentEl.empty()
  }
}

/**
 * 管理公众号草稿箱：列出草稿（分页）、拉取到笔记、删除草稿。
 */
export class DraftsModal extends Modal {
  private plugin: BmMdPlugin
  private contentElRef: HTMLElement | null = null
  private statusEl: HTMLElement | null = null
  private isLoading = false
  private currentPage = 0
  private totalCount: number | null = null
  /** 正在拉取的草稿 media_id，避免重复点击 */
  private pullingId: string | null = null
  /** 当前列表里的操作按钮，用于切换忙碌态 */
  private actionButtons: HTMLButtonElement[] = []

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

    contentEl.createEl('p', {
      text: '「拉取到笔记」会把草稿正文还原成 Markdown 存进 vault，图片一并下载；之后可在 Obsidian 里继续编辑，再用发布弹窗覆盖更新这篇草稿。',
      cls: 'bm-md-info bm-md-drafts-hint',
    })
    this.statusEl = contentEl.createDiv({ cls: 'bm-md-drafts-status is-hidden' })

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
    this.actionButtons = []

    if (items.length === 0) {
      this.contentElRef.createEl('p', {
        text: '草稿箱是空的，去发布一篇试试。',
        cls: 'bm-md-info',
      })
    }

    for (const item of items) {
      const newsItems = item.content?.news_item ?? []
      const title = newsItems[0]?.title || '未命名草稿'
      const time = new Date(item.update_time * 1000).toLocaleString('zh-CN')

      const row = this.contentElRef.createDiv({ cls: 'bm-md-draft-row' })
      const info = row.createDiv({ cls: 'bm-md-draft-info' })
      info.createDiv({ cls: 'bm-md-draft-title', text: title })
      const metaParts = [`更新于 ${time}`]
      // 标出这篇草稿由哪篇笔记发布而来，便于理解覆盖更新会改动哪篇文章
      const linkedNote = this.plugin.findNotePathByDraftId(item.media_id)
      if (linkedNote) metaParts.push(`关联笔记：${linkedNote}`)
      if (newsItems.length > 1) {
        // 多图文草稿：首篇做标题，其余标题在元信息行中列出
        metaParts.push(
          `共 ${newsItems.length} 篇图文`,
          newsItems.slice(1).map((n) => n.title || '未命名').join(' / ')
        )
      }
      info.createDiv({ cls: 'bm-md-draft-meta', text: metaParts.join(' · ') })

      const actions = row.createDiv({ cls: 'bm-md-draft-actions' })

      const pull = actions.createEl('button', {
        text: linkedNote ? '重新拉取' : '拉取到笔记',
        cls: 'bm-md-btn bm-md-btn-primary bm-md-draft-action',
      })
      pull.disabled = this.pullingId !== null
      pull.addEventListener('click', () => {
        void this.pullDraft(item, title, linkedNote)
      })

      const del = actions.createEl('button', {
        text: '删除',
        cls: 'bm-md-btn bm-md-btn-danger bm-md-draft-action',
      })
      del.disabled = this.pullingId !== null
      del.addEventListener('click', () => {
        void this.confirmAndDelete(item.media_id, title)
      })

      this.actionButtons.push(pull, del)
    }

    this.renderPagination()
  }

  /**
   * 切换拉取进行中的按钮状态。
   *
   * 拉取期间重绘列表会丢掉状态提示，所以这里直接改已有按钮的 disabled，
   * 避免用户重复点击同一条或其它草稿。
   */
  private setActionsBusy(busy: boolean): void {
    for (const button of this.actionButtons) {
      if (!button.isConnected) continue
      button.disabled = busy
    }
  }

  /** 分页控制：上一页 / 页码 / 下一页 */
  private renderPagination(): void {
    if (!this.contentElRef || this.totalPages <= 1) return

    const pagination = this.contentElRef.createDiv({ cls: 'bm-md-drafts-pagination' })

    const prevBtn = pagination.createEl('button', {
      text: '上一页',
      cls: 'bm-md-btn bm-md-page-btn',
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
      cls: 'bm-md-btn bm-md-page-btn',
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

  /** 更新顶部状态行；传 null 收起 */
  private setStatus(message: string | null): void {
    if (!this.statusEl) return
    if (message === null) {
      this.statusEl.setText('')
      this.statusEl.addClass('is-hidden')
      return
    }
    this.statusEl.setText(message)
    this.statusEl.removeClass('is-hidden')
  }

  /**
   * 拉取草稿到笔记。
   *
   * 新建笔记时先让用户选目标文件夹；已有关联笔记时直接覆盖那一篇
   * （保留路径与用户改过的文件名），并提示将要覆盖的位置。
   */
  private async pullDraft(
    item: WeChatDraftListItem,
    title: string,
    linkedNote: string | null
  ): Promise<void> {
    if (this.pullingId) return
    const targetFile = this.resolveLinkedFile(linkedNote)

    // 覆盖已有笔记会丢掉本地未发布的改动，先让用户确认
    if (targetFile) {
      new ConfirmOverwriteModal(this.app, targetFile.path, () => {
        void this.runPull(item, title, targetFile)
      }).open()
      return
    }

    // 新建笔记：先让用户挑保存位置（可新建目录），再拉取
    new FolderPickerModal(this.app, {
      current: this.plugin.settings.draftImportFolder,
      onPick: (folder) => {
        void this.rememberFolder(folder)
        void this.runPull(item, title, null, folder)
      },
    }).open()
  }

  /** 记住本次选择的目录，下次拉取默认选中 */
  private async rememberFolder(folder: string): Promise<void> {
    if (this.plugin.settings.draftImportFolder === folder) return
    this.plugin.settings.draftImportFolder = folder
    await this.plugin.saveSettings()
  }

  private async runPull(
    item: WeChatDraftListItem,
    title: string,
    targetFile: TFile | null,
    noteFolder?: string
  ): Promise<void> {
    if (this.pullingId) return
    this.pullingId = item.media_id
    this.setActionsBusy(true)
    this.setStatus(`正在拉取「${title}」…`)

    try {
      const data = await this.api.getDraft(item.media_id)
      const newsItem: WeChatDraftNewsItem | undefined = data.news_item?.[0]
      if (!newsItem) {
        throw new Error('草稿内容为空')
      }
      if ((data.news_item?.length ?? 0) > 1) {
        // 只拉第一篇：正文之外的图文在笔记里没有对应结构
        new Notice('该草稿包含多篇图文，只拉取第一篇')
      }

      const result = await importDraftToVault(this.app, item.media_id, newsItem, {
        noteFolder: noteFolder ?? this.plugin.settings.draftImportFolder,
        targetFile,
        onProgress: (message) => this.setStatus(message)
      })

      // 登记关联：发布弹窗据此默认「覆盖更新已有草稿」，
      // 并复用草稿原本的封面素材，不必重新上传
      await this.plugin.setDraftLink(
        result.notePath,
        draftLinkForImport(item.media_id, newsItem, {
          coverKey: result.coverKey,
          thumbMediaId: newsItem.thumb_media_id
        })
      )

      const notes: string[] = [
        result.created
          ? `已拉取到笔记 ${result.notePath}`
          : `已更新笔记 ${result.notePath}`
      ]
      if (result.downloadedImages > 0) notes.push(`${result.downloadedImages} 张图片已下载`)
      if (result.failedImages.length > 0) notes.push(`${result.failedImages.length} 张图片下载失败`)
      new Notice(notes.join('，'))

      // 打开笔记，用户可以直接继续编辑
      const file = this.app.vault.getAbstractFileByPath(result.notePath)
      if (file instanceof TFile) {
        const leaf = this.app.workspace.getLeaf('tab')
        await leaf.openFile(file)
      }
      this.pullingId = null
      this.close()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.setStatus(`拉取失败：${message}`)
      new Notice(`拉取失败：${message}`)
      this.pullingId = null
      this.setActionsBusy(false)
      // 失败后刷新列表，恢复按钮可用状态
      void this.loadDrafts(this.currentPage)
    }
  }

  /** 关联笔记仍存在时返回文件，否则按新建处理 */
  private resolveLinkedFile(notePath: string | null): TFile | null {
    if (!notePath) return null
    const file = this.app.vault.getAbstractFileByPath(notePath)
    return file instanceof TFile ? file : null
  }

  private async confirmAndDelete(mediaId: string, title: string): Promise<void> {
    new ConfirmDeleteModal(this.app, title, () => {
      void this.deleteDraft(mediaId, title)
    }).open()
  }

  private async deleteDraft(mediaId: string, title: string): Promise<void> {
    try {
      await this.api.deleteDraft(mediaId)
      // 草稿没了，本地关联也要清掉，否则下次发布会去更新一篇不存在的草稿
      await this.plugin.clearDraftLinksByMediaId(mediaId)
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

export { noteNameForTitle }
