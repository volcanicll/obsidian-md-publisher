import { createQrSvg, isPreviewUrlUsable } from '../../lib/wechat/draft-qr'

export type PreviewTab = 'article' | 'card' | 'qr'

export interface PhonePreviewModel {
  title: string
  author: string
  digest: string
  /** 封面展示地址：vault 资源路径、object URL 或 data URL */
  coverSrc: string | null
  /** 封面缺失时显示的错误文案 */
  coverMissingText: string | null
  /** 文章页顶部是否展示封面 */
  showCoverInBody: boolean
  /** 是否展示「阅读原文」 */
  hasSourceUrl: boolean
  /** 已保存草稿的预览链接；有值时「手机预览」标签才可用 */
  previewUrl?: string | null
}

/**
 * 发布弹窗左侧的真机预览。
 *
 * 文章正文只在初始化时挂载一次，后续标题、作者、摘要、封面都只改
 * 文本与图片地址，不重新解析 HTML，避免逐字输入时闪烁与掉滚动位置。
 */
export class PhonePreview {
  private articleTitle: HTMLElement
  private articleAuthor: HTMLElement
  private articleDate: HTMLElement
  private articleCover: HTMLElement
  private articleCoverImg: HTMLImageElement
  private articleCoverMissing: HTMLElement
  private articleBody: HTMLElement
  private articleFoot: HTMLElement
  private cardTitle: HTMLElement
  private cardThumb: HTMLElement
  private cardThumbImg: HTMLImageElement
  private cardDigest: HTMLElement
  private articlePanel: HTMLElement
  private cardPanel: HTMLElement
  private qrPanel: HTMLElement
  private qrHolder: HTMLElement
  private qrHint: HTMLElement
  private qrUrlEl: HTMLElement
  /** 当前二维码对应的链接，避免每次表单变更都重画 */
  private renderedQrUrl: string | null = null
  private articleChrome: HTMLElement[] = []
  private tabs: HTMLButtonElement[] = []
  private currentTab: PreviewTab = 'article'

  constructor(parent: HTMLElement) {
    const root = parent.createDiv({ cls: 'bm-md-pm-preview' })

    const tabBar = root.createDiv({ cls: 'bm-md-pm-tabs', attr: { role: 'tablist' } })
    for (const [id, label] of [
      ['article', '文章页'],
      ['card', '分享卡片'],
      ['qr', '手机预览']
    ] as const) {
      const tab = tabBar.createEl('button', {
        cls: 'bm-md-pm-tab',
        text: label,
        attr: { type: 'button', role: 'tab' }
      })
      tab.addEventListener('click', () => this.setTab(id))
      this.tabs.push(tab)
    }
    tabBar.createSpan({ cls: 'bm-md-pm-tabs-note', text: '375 px' })

    const phone = root.createDiv({ cls: 'bm-md-pm-phone' })
    const status = phone.createDiv({ cls: 'bm-md-pm-status' })
    status.createSpan({ text: '9:41' })
    const signals = status.createSpan({ cls: 'bm-md-pm-signals' })
    signals.createEl('i')
    signals.createEl('i')
    signals.createEl('i')

    // 微信文章页的顶栏：返回箭头 + 公众号名 + 更多
    const nav = phone.createDiv({ cls: 'bm-md-pm-nav' })
    nav.createSpan({ cls: 'bm-md-pm-nav-back', text: '‹' })
    nav.createSpan({ cls: 'bm-md-pm-nav-title', text: '公众号' })
    nav.createSpan({ cls: 'bm-md-pm-nav-more', text: '···' })

    const scroll = phone.createDiv({ cls: 'bm-md-pm-scroll' })

    this.articlePanel = scroll.createDiv({ cls: 'bm-md-pm-panel' })
    const head = this.articlePanel.createDiv({ cls: 'bm-md-pm-art-head' })
    this.articleTitle = head.createEl('h1', { cls: 'bm-md-pm-art-title' })
    const meta = head.createDiv({ cls: 'bm-md-pm-art-meta' })
    this.articleAuthor = meta.createSpan({ cls: 'bm-md-pm-art-author' })
    this.articleDate = meta.createSpan({ cls: 'bm-md-pm-art-date' })

    this.articleCover = this.articlePanel.createDiv({ cls: 'bm-md-pm-art-cover' })
    this.articleCoverImg = this.articleCover.createEl('img', { attr: { alt: '' } })
    this.articleCoverMissing = this.articleCover.createDiv({ cls: 'bm-md-pm-art-cover-missing' })

    this.articleBody = this.articlePanel.createDiv({ cls: 'bm-md-pm-art-body' })
    this.articleFoot = this.articlePanel.createDiv({ cls: 'bm-md-pm-art-foot' })

    // 微信文章页底部的固定操作条（点赞 / 在看 / 留言），纯装饰
    const actions = phone.createDiv({ cls: 'bm-md-pm-art-actions' })
    for (const label of ['赞', '在看', '留言']) {
      actions.createSpan({ cls: 'bm-md-pm-art-action', text: label })
    }
    this.articleChrome = [nav, actions]

    this.cardPanel = scroll.createDiv({ cls: 'bm-md-pm-panel is-card is-hidden' })
    const stage = this.cardPanel.createDiv({ cls: 'bm-md-pm-card-stage' })
    stage.createDiv({ cls: 'bm-md-pm-card-label', text: '发送给朋友时' })
    const bubble = stage.createDiv({ cls: 'bm-md-pm-card-bubble' })
    const main = bubble.createDiv({ cls: 'bm-md-pm-card-main' })
    this.cardTitle = main.createDiv({ cls: 'bm-md-pm-card-title' })
    main.createDiv({ cls: 'bm-md-pm-card-account', text: '公众号' })
    this.cardThumb = bubble.createDiv({ cls: 'bm-md-pm-card-thumb' })
    this.cardThumbImg = this.cardThumb.createEl('img', { attr: { alt: '' } })
    const note = stage.createDiv({ cls: 'bm-md-pm-card-note' })
    note.createSpan({ text: '摘要 ' })
    this.cardDigest = note.createSpan({ cls: 'bm-md-pm-card-digest-text' })

    // 手机预览：草稿保存后用二维码把文章搬到真机上查看
    this.qrPanel = scroll.createDiv({ cls: 'bm-md-pm-panel is-qr is-hidden' })
    this.qrHolder = this.qrPanel.createDiv({ cls: 'bm-md-pm-qr-holder' })
    this.qrHint = this.qrPanel.createDiv({ cls: 'bm-md-pm-qr-hint' })
    this.qrUrlEl = this.qrPanel.createDiv({ cls: 'bm-md-pm-qr-url' })

    this.setTab('article')
  }

  /** 挂载渲染好的正文；只在打开弹窗或重新渲染时调用一次 */
  setBodyHtml(html: string): void {
    if (!html) {
      this.articleBody.empty()
      return
    }
    const doc = new DOMParser().parseFromString(html, 'text/html')
    this.articleBody.replaceChildren(...Array.from(doc.body.childNodes))
    this.articlePanel.scrollTop = 0
  }

  setTab(tab: PreviewTab): void {
    this.currentTab = tab
    this.tabs.forEach((btn, index) => {
      const id: PreviewTab = index === 0 ? 'article' : index === 1 ? 'card' : 'qr'
      const active = id === tab
      btn.toggleClass('is-active', active)
      btn.setAttribute('aria-selected', String(active))
    })
    this.articlePanel.toggleClass('is-hidden', tab !== 'article')
    this.cardPanel.toggleClass('is-hidden', tab !== 'card')
    this.qrPanel.toggleClass('is-hidden', tab !== 'qr')
    // 顶栏与底部操作条属于文章页，其它标签下要一起收起
    for (const el of this.articleChrome) el.toggleClass('is-hidden', tab !== 'article')
  }

  getTab(): PreviewTab {
    return this.currentTab
  }

  update(model: PhonePreviewModel): void {
    const title = model.title.trim() || '未命名文章'
    const today = new Date().toLocaleDateString('zh-CN')
    const author = model.author.trim()

    this.articleTitle.setText(title)
    // 作者名在微信里是蓝色可点，没有作者时退化为「公众号」
    this.articleAuthor.setText(author || '公众号')
    this.articleDate.setText(today)
    this.cardTitle.setText(title)

    if (model.digest.trim()) {
      this.cardDigest.setText(model.digest.trim())
      this.cardDigest.removeClass('is-placeholder')
    } else {
      this.cardDigest.setText('未填写摘要，公众号会自动截取正文开头')
      this.cardDigest.addClass('is-placeholder')
    }

    this.articleFoot.toggleClass('is-hidden', !model.hasSourceUrl)

    // 封面：有图显示图片，指定了但找不到时给出错误文案
    if (model.coverSrc) {
      if (this.articleCoverImg.src !== model.coverSrc) {
        this.articleCoverImg.src = model.coverSrc
      }
      if (this.cardThumbImg.src !== model.coverSrc) {
        this.cardThumbImg.src = model.coverSrc
      }
      this.articleCover.removeClass('is-error')
      this.cardThumb.removeClass('is-error')
    } else {
      this.articleCoverImg.removeAttribute('src')
      this.cardThumbImg.removeAttribute('src')
      this.articleCover.toggleClass('is-error', Boolean(model.coverMissingText))
      this.cardThumb.toggleClass('is-error', Boolean(model.coverMissingText))
    }
    this.articleCoverImg.toggleClass('is-hidden', !model.coverSrc)
    this.cardThumbImg.toggleClass('is-hidden', !model.coverSrc)
    this.articleCoverMissing.setText(model.coverMissingText ?? '')
    this.articleCoverMissing.toggleClass('is-hidden', !model.coverMissingText)

    // 关闭「正文顶部显示封面」只影响文章页，分享卡片仍需缩略图
    this.articleCover.toggleClass('is-hidden', !model.showCoverInBody)

    this.updateQr(model.previewUrl ?? null)
  }

  /**
   * 手机预览标签的内容。
   *
   * 二维码指向草稿在微信端的真实文章页（带临时凭证），扫码即可在手机上
   * 看到最终效果。草稿还没保存时没有链接，这里给出说明而不是空白。
   */
  private updateQr(url: string | null): void {
    const usable = isPreviewUrlUsable(url)

    // 只有拿到可用链接时才允许切到手机预览标签
    const qrTab = this.tabs[2]
    if (qrTab) {
      qrTab.toggleClass('is-disabled', !usable)
      qrTab.setAttribute('aria-disabled', String(!usable))
    }
    if (!usable && this.currentTab === 'qr') {
      // 草稿被覆盖更新后链接会短暂失效，自动退回文章页
      this.setTab('article')
    }

    // 二维码只在链接变化时重画：update() 会随每次按键触发，
    // 而二维码是纯确定性输出，重复生成没有意义
    if (this.renderedQrUrl === url) return
    this.renderedQrUrl = url

    this.qrHolder.empty()
    this.qrUrlEl.empty()

    if (!usable) {
      this.qrHint.setText('先保存到草稿，再用手机扫码查看真机效果。')
      return
    }

    // 用 DOMParser 而不是 innerHTML，避免把 SVG 字符串直接当 HTML 注入
    const doc = new DOMParser().parseFromString(createQrSvg(url!), 'image/svg+xml')
    const svg = doc.documentElement
    if (svg && svg.nodeName.toLowerCase() === 'svg') {
      this.qrHolder.appendChild(svg)
    }
    this.qrHint.setText('用微信扫一扫，在手机上打开这篇草稿')

    const link = this.qrUrlEl.createEl('a', {
      text: '在浏览器中打开',
      href: url!,
      attr: { target: '_blank', rel: 'noreferrer noopener' }
    })
    link.addEventListener('click', (event) => {
      // Obsidian 内点击外链交给系统浏览器，避免主窗口被导航走
      event.preventDefault()
      window.open(url!, '_blank')
    })
  }
}
