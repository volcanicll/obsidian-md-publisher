import { App, Modal, TFolder, setIcon } from 'obsidian'

/**
 * 选择草稿拉取的目标文件夹。
 *
 * 列出 vault 内全部文件夹供挑选，也可以直接输入一个尚不存在的路径
 * 新建。默认选中上次使用的目录（或设置里的默认目录），让重复拉取
 * 少点一次。
 */
export class FolderPickerModal extends Modal {
  private folders: string[]
  private current: string
  private onPick: (folder: string) => void
  private query = ''
  private listEl: HTMLElement | null = null
  private selected: string

  constructor(
    app: App,
    options: {
      /** 默认选中的文件夹（空字符串表示 vault 根目录） */
      current?: string
      onPick: (folder: string) => void
    }
  ) {
    super(app)
    this.onPick = options.onPick
    this.current = options.current?.trim() ?? ''
    this.selected = this.current

    this.folders = app.vault
      .getAllFolders(false)
      .map((folder) => folder.path)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('bm-md-folder-picker')

    contentEl.createEl('h2', { text: '拉取到文件夹', cls: 'bm-md-modal-title' })
    contentEl.createEl('p', {
      cls: 'bm-md-info bm-md-folder-picker-hint',
      text: '选择笔记保存到哪个文件夹；也可以直接输入新路径，不存在时会自动创建。',
    })

    const searchWrap = contentEl.createDiv({ cls: 'bm-md-picker-search' })
    const searchIcon = searchWrap.createSpan({ cls: 'bm-md-picker-search-icon' })
    setIcon(searchIcon, 'search')
    const input = searchWrap.createEl('input', {
      cls: 'bm-md-picker-input',
      attr: { type: 'text', placeholder: '搜索文件夹，或输入新路径后回车' },
    })
    input.value = this.current
    input.addEventListener('input', () => {
      this.query = input.value.trim()
      this.selected = this.query
      this.renderList()
    })
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        this.confirm(this.query)
      }
    })

    this.listEl = contentEl.createDiv({ cls: 'bm-md-picker-list' })
    this.renderList()

    const foot = contentEl.createDiv({ cls: 'bm-md-folder-picker-foot' })
    const cancel = foot.createEl('button', {
      cls: 'bm-md-btn',
      text: '取消',
      attr: { type: 'button' },
    })
    cancel.addEventListener('click', () => this.close())
    const ok = foot.createEl('button', {
      cls: 'bm-md-btn bm-md-btn-primary',
      text: '拉取到这里',
      attr: { type: 'button' },
    })
    ok.addEventListener('click', () => this.confirm(this.selected))

    input.focus()
    input.select()
  }

  private renderList(): void {
    if (!this.listEl) return
    this.listEl.empty()

    const query = this.query.toLowerCase()
    // 根目录始终排在第一位，方便「不放进任何子目录」
    const options = ['', ...this.folders]
    const matched = query
      ? options.filter((path) => path.toLowerCase().includes(query))
      : options

    if (matched.length === 0) {
      this.listEl.createEl('p', {
        cls: 'bm-md-info',
        text: `没有匹配「${this.query}」的文件夹。按回车会用这个路径新建。`,
      })
      return
    }

    for (const path of matched.slice(0, 300)) {
      const row = this.listEl.createDiv({ cls: 'bm-md-picker-row' })
      if (path === this.selected) row.addClass('is-selected')

      const icon = row.createDiv({ cls: 'bm-md-picker-folder-icon' })
      setIcon(icon, path ? 'folder' : 'vault')

      const info = row.createDiv({ cls: 'bm-md-picker-info' })
      info.createDiv({
        cls: 'bm-md-picker-name',
        text: path ? path.split('/').pop() ?? path : 'vault 根目录',
      })
      info.createDiv({
        cls: 'bm-md-picker-path',
        text: path || '/',
      })

      row.addEventListener('click', () => {
        this.selected = path
        this.renderList()
      })
      row.addEventListener('dblclick', () => this.confirm(path))
    }
  }

  private confirm(folder: string): void {
    this.close()
    this.onPick(folder.trim().replace(/^\/+|\/+$/g, ''))
  }

  onClose(): void {
    this.contentEl.empty()
  }
}

/** vault 内已存在的文件夹路径，供测试与调用方复用 */
export function listVaultFolders(app: App): string[] {
  return app.vault
    .getAllFolders(false)
    .map((folder: TFolder) => folder.path)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
}
