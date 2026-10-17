import { App, Modal, setIcon, type TFile } from 'obsidian'
import { detectImageType } from '../../lib/image-processor'
import type { LocalCoverFile } from '../../lib/wechat/publish-form'

/**
 * 从 vault 里挑一张图片作为封面。
 *
 * 用轻量的列表而不是 Obsidian 的 FuzzySuggestModal：封面图通常集中在
 * 附件目录，按路径排序比全库模糊搜索更好找，也不会把笔记混进结果。
 */
export class VaultImagePickerModal extends Modal {
  private images: TFile[]
  private onPick: (file: TFile) => void
  private query = ''
  private listEl: HTMLElement | null = null

  constructor(app: App, onPick: (file: TFile) => void) {
    super(app)
    this.onPick = onPick
    this.images = app.vault
      .getFiles()
      .filter((file) => isImageFile(file))
      .sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('bm-md-vault-picker')

    contentEl.createEl('h2', { text: '选择封面图', cls: 'bm-md-modal-title' })

    const searchWrap = contentEl.createDiv({ cls: 'bm-md-picker-search' })
    const searchIcon = searchWrap.createSpan({ cls: 'bm-md-picker-search-icon' })
    setIcon(searchIcon, 'search')
    const input = searchWrap.createEl('input', {
      cls: 'bm-md-picker-input',
      attr: { type: 'text', placeholder: '按文件名或路径搜索' }
    })
    input.addEventListener('input', () => {
      this.query = input.value.trim().toLowerCase()
      this.renderList()
    })

    this.listEl = contentEl.createDiv({ cls: 'bm-md-picker-list' })
    this.renderList()
    input.focus()
  }

  private renderList(): void {
    if (!this.listEl) return
    this.listEl.empty()

    const matched = this.query
      ? this.images.filter((file) => file.path.toLowerCase().includes(this.query))
      : this.images

    if (this.images.length === 0) {
      this.listEl.createEl('p', { cls: 'bm-md-info', text: 'vault 里没有找到图片。' })
      return
    }
    if (matched.length === 0) {
      this.listEl.createEl('p', { cls: 'bm-md-info', text: `没有匹配「${this.query}」的图片。` })
      return
    }

    // 最多渲染 200 条，避免大 vault 里一次插入上千个缩略图
    for (const file of matched.slice(0, 200)) {
      const row = this.listEl.createDiv({ cls: 'bm-md-picker-row' })
      const thumb = row.createDiv({ cls: 'bm-md-picker-thumb' })
      const url = this.app.vault.getResourcePath(file)
      thumb.createEl('img', { attr: { src: url, alt: '' } })
      const info = row.createDiv({ cls: 'bm-md-picker-info' })
      info.createDiv({ cls: 'bm-md-picker-name', text: file.name })
      info.createDiv({ cls: 'bm-md-picker-path', text: file.path })
      row.addEventListener('click', () => {
        this.close()
        this.onPick(file)
      })
    }

    if (matched.length > 200) {
      this.listEl.createEl('p', {
        cls: 'bm-md-picker-more',
        text: `仅显示前 200 项，共 ${matched.length} 张图片，请用搜索缩小范围。`
      })
    }
  }

  onClose(): void {
    this.contentEl.empty()
  }
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']

export function isImageFile(file: TFile): boolean {
  return IMAGE_EXTENSIONS.includes(file.extension.toLowerCase())
}

/**
 * 读取本机图片为内存对象。
 * 只用于本次发布，不写入 vault；预览地址在关闭弹窗时释放。
 */
export async function readLocalCoverFile(file: File): Promise<LocalCoverFile> {
  const data = await file.arrayBuffer()
  const contentType = detectImageType(data)
  return {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    data,
    contentType,
    previewUrl: URL.createObjectURL(file)
  }
}
