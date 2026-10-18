/**
 * 把公众号草稿拉回 vault：正文 HTML → Markdown，图片下载到附件目录，
 * 元信息写进 frontmatter，并登记笔记 ↔ 草稿的关联。
 *
 * 拉取后的笔记与「发布」走同一条渲染管线，因此可以继续在 Obsidian 里
 * 编辑，再用发布弹窗覆盖更新这篇草稿。
 */

import { App, TFile, normalizePath, requestUrl } from 'obsidian'
import type { WeChatDraftNewsItem } from './types'
import { htmlToMarkdown } from '../markdown/html-to-markdown'
import { detectImageType, isWeChatCdnImage } from '../image-processor'
import { writeDraftFrontmatter, type DraftFrontmatter } from './draft-frontmatter'
import type { DraftLink } from './draft-links'

export interface ImportDraftOptions {
  /** 新笔记保存的文件夹（vault 相对路径），空字符串表示 vault 根目录 */
  noteFolder?: string
  /** 已存在的笔记：提供时覆盖该文件而不是新建 */
  targetFile?: TFile | null
  /** 下载进度回调 */
  onProgress?: (message: string) => void
}

export interface ImportDraftResult {
  notePath: string
  /** 成功下载并改写为本地链接的图片数 */
  downloadedImages: number
  /** 下载失败的图片地址，正文里保留原始 URL */
  failedImages: string[]
  /** 是否新建了笔记（false 表示覆盖已有笔记） */
  created: boolean
  /** 下载到 vault 的封面路径（相对笔记），没有封面时为 undefined */
  coverPath?: string
  /** 封面来源指纹，供发布时复用封面素材 */
  coverKey?: string
}

/** 微信图片 CDN 域名：草稿正文里的图片都指向这里 */
export function isWeChatCdnUrl(url: string): boolean {
  return isWeChatCdnImage(url)
}

/** 图片 MIME → 文件扩展名 */
export function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/svg+xml':
      return 'svg'
    case 'image/bmp':
      return 'bmp'
    case 'image/avif':
      return 'avif'
    default:
      return 'png'
  }
}

/**
 * 从 URL 里取一个可读的文件名。
 * 微信 CDN 的路径末段通常是无意义的数字（`/0`），这种情况返回空串，
 * 由调用方改用序号命名。
 */
export function imageBaseName(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    if (!name || /^\d+$/.test(name)) return ''
    const withoutExt = name.replace(/\.[a-z0-9]+$/i, '')
    return withoutExt.replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '')
  } catch {
    return ''
  }
}

/** 草稿标题 → 安全的笔记文件名（不含扩展名） */
export function noteNameForTitle(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // 去掉首尾的点与空格：Obsidian 不允许文件名以点开头
  const trimmed = cleaned.replace(/^[.\s]+|[.\s]+$/g, '')
  if (!trimmed) return '公众号草稿'
  // 文件名过长在部分系统上会失败，按码点截断
  return Array.from(trimmed).slice(0, 80).join('')
}

/** 拼接 vault 路径并规范化 */
export function joinVaultPath(folder: string, name: string): string {
  const dir = folder.trim().replace(/^\/+|\/+$/g, '')
  return normalizePath(dir ? `${dir}/${name}` : name)
}

/**
 * 从 notePath 所在目录到 targetPath 的相对路径。
 * 同一目录直接返回文件名，Markdown 里更短也更好读。
 */
export function relativeVaultPath(notePath: string, targetPath: string): string {
  const noteDir = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : ''
  if (!noteDir) return targetPath
  const from = noteDir.split('/').filter(Boolean)
  const to = targetPath.split('/').filter(Boolean)

  let common = 0
  while (common < from.length && common < to.length && from[common] === to[common]) {
    common++
  }

  const up = Array(from.length - common).fill('..')
  const down = to.slice(common)
  return [...up, ...down].join('/') || targetPath
}

/**
 * 在 vault 中找可用的新路径：同名文件已存在时追加 ` 2`、` 3`…
 */
export function availablePath(app: App, folder: string, baseName: string, ext: string): string {
  let attempt = 1
  for (;;) {
    const suffix = attempt === 1 ? '' : ` ${attempt}`
    const path = joinVaultPath(folder, `${baseName}${suffix}.${ext}`)
    if (!app.vault.getAbstractFileByPath(path)) return path
    attempt++
  }
}

/**
 * 确保文件夹存在。
 *
 * Obsidian 的 createFolder 不会自动创建父目录，`a/b/c` 在 `a` 不存在时
 * 会直接失败，因此逐级向下创建。已存在的层级跳过。
 */
async function ensureFolder(app: App, folder: string): Promise<void> {
  const normalized = normalizePath(folder.trim())
  if (!normalized || normalized === '/') return

  const segments = normalized.split('/').filter(Boolean)
  let current = ''
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment
    if (app.vault.getAbstractFileByPath(current)) continue
    await app.vault.createFolder(current)
  }
}

/** 下载图片字节；失败返回 null */
async function downloadImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const response = await requestUrl({ url, method: 'GET' })
    return response.arrayBuffer ?? null
  } catch {
    return null
  }
}

/**
 * 下载草稿正文里的图片到 vault，返回 src → 本地路径的映射。
 *
 * 只处理 http(s) 图片：data URL 直接写进 Markdown 会让笔记体积爆炸，
 * 但草稿里一般不会出现。下载失败的图片保留原地址，正文仍然完整可读。
 */
async function downloadDraftImages(
  app: App,
  html: string,
  notePath: string,
  onProgress?: (message: string) => void
): Promise<{ mapping: Map<string, string>; failed: string[] }> {
  const urls = [...new Set(extractImageUrls(html))]
  const mapping = new Map<string, string>()
  const failed: string[] = []

  let index = 0
  for (const url of urls) {
    index++
    onProgress?.(`正在下载图片 ${index}/${urls.length}…`)
    const data = await downloadImage(url)
    if (!data) {
      failed.push(url)
      continue
    }

    const mime = detectImageType(data)
    const ext = extensionForMime(mime)
    const base = imageBaseName(url) || `wechat-image-${String(index).padStart(2, '0')}`

    // 交给 Obsidian 决定附件位置：尊重用户的「附件默认位置」设置，
    // 自动去重并创建目录
    let targetPath: string
    try {
      targetPath = await app.fileManager.getAvailablePathForAttachment(
        `${base}.${ext}`,
        notePath
      )
    } catch {
      targetPath = availablePath(app, noteFolderOf(notePath), base, ext)
    }

    try {
      const parent = targetPath.includes('/')
        ? targetPath.slice(0, targetPath.lastIndexOf('/'))
        : ''
      if (parent) await ensureFolder(app, parent)
      await app.vault.createBinary(targetPath, data)
      mapping.set(url, relativeVaultPath(notePath, targetPath))
    } catch {
      failed.push(url)
    }
  }

  return { mapping, failed }
}

function noteFolderOf(notePath: string): string {
  return notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : ''
}

/**
 * 提取 HTML 中所有 http(s) 图片地址。
 *
 * 公众号草稿的图片是懒加载写法，真实地址在 `data-src` 上（`src` 为空或
 * 占位图），两种写法都要收，否则正文图片会一张都下载不到。
 *
 * 属性值里的 HTML 实体必须解码：草稿源码写的是 `&amp;`，而 HTML 解析器
 * 交给转换器的是 `&`。两边地址不一致时，下载到的图片无法按 URL 回填到
 * 正文，笔记里就会留下一堆远程地址。
 */
export function extractImageUrls(html: string): string[] {
  const urls: string[] = []
  const regex = /<img\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    const tag = match[0]
    const candidates = [
      tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1],
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]
    ]
    const found = candidates.find(
      (value): value is string => !!value && /^https?:\/\//i.test(value)
    )
    if (found) urls.push(decodeHtmlEntities(found))
  }
  return urls
}

/** 解码图片地址中的 HTML 实体（`&amp;` 最常见） */
function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * 正文开头补一级标题。
 *
 * 公众号把标题存在文章字段里，正文通常不含 H1；补上之后笔记的标题
 * 与草稿标题一致，`extractTitleFromMarkdown` 也能直接复用。
 */
export function ensureLeadingTitle(markdown: string, title: string): string {
  return applyLeadingTitle(markdown, title).markdown
}

/**
 * 补一级标题，并报告正文原本是否自带 H1。
 *
 * 返回值里的 `titleInBody` 会写进 frontmatter：正文自带的 H1 是文章内容
 * （公众号标题存在独立字段里），重新发布时应继续用草稿标题；由我们补的
 * H1 才代表标题本身，用户改它就等于改标题。
 */
export function applyLeadingTitle(
  markdown: string,
  title: string
): { markdown: string; titleInBody: boolean } {
  const trimmed = markdown.trim()
  if (!title.trim()) return { markdown: trimmed, titleInBody: false }

  if (trimmed.startsWith('# ')) {
    // 正文自带 H1：不再插入。标题是否与草稿标题一致，决定它算内容还是标题
    const heading = trimmed.match(/^#[ \t]+([^\n]*)/)?.[1]?.trim() ?? ''
    return { markdown: trimmed, titleInBody: heading !== title.trim() }
  }
  return { markdown: `# ${title.trim()}\n\n${trimmed}`, titleInBody: false }
}

/** 从草稿的 news_item 里取可用于 frontmatter 的元数据 */
export function draftMetaForFrontmatter(
  item: WeChatDraftNewsItem,
  mediaId: string,
  extra: {
    coverPath?: string
    coverKey?: string
    titleInBody?: boolean
    pulledAt?: number
  } = {}
): DraftFrontmatter {
  return {
    media_id: mediaId,
    ...(item.title ? { title: item.title } : {}),
    ...(item.author ? { author: item.author } : {}),
    ...(item.digest ? { digest: item.digest } : {}),
    ...(item.content_source_url ? { content_source_url: item.content_source_url } : {}),
    ...(item.thumb_media_id ? { thumb_media_id: item.thumb_media_id } : {}),
    ...(extra.coverKey ? { cover_key: extra.coverKey } : {}),
    ...(extra.coverPath ? { cover: extra.coverPath } : {}),
    ...(typeof extra.titleInBody === 'boolean' ? { title_in_body: extra.titleInBody } : {}),
    pulled_at: extra.pulledAt ?? Date.now()
  }
}

/**
 * 下载封面图到 vault（`thumb_url`），返回相对笔记的路径。
 * 封面下载失败不影响正文拉取，返回 null。
 */
async function downloadCover(
  app: App,
  item: WeChatDraftNewsItem,
  notePath: string
): Promise<string | null> {
  const url = item.thumb_url
  if (!url || !/^https?:\/\//i.test(url)) return null

  const data = await downloadImage(url)
  if (!data) return null

  const ext = extensionForMime(detectImageType(data))
  const base = `wechat-cover-${(item.title || 'draft').slice(0, 20).replace(/[^\w\u4e00-\u9fa5-]+/g, '-')}`

  let targetPath: string
  try {
    targetPath = await app.fileManager.getAvailablePathForAttachment(
      `${base}.${ext}`,
      notePath
    )
  } catch {
    targetPath = availablePath(app, noteFolderOf(notePath), base, ext)
  }

  try {
    const parent = targetPath.includes('/')
      ? targetPath.slice(0, targetPath.lastIndexOf('/'))
      : ''
    if (parent) await ensureFolder(app, parent)
    await app.vault.createBinary(targetPath, data)
    return relativeVaultPath(notePath, targetPath)
  } catch {
    return null
  }
}

/**
 * 拉取一篇草稿到 vault。
 *
 * 1. 决定笔记路径（覆盖已有笔记或按标题新建）
 * 2. 下载正文图片与封面
 * 3. HTML → Markdown，图片地址改成本地相对路径
 * 4. 写入 frontmatter（草稿 media_id 等），后续发布默认覆盖这篇草稿
 */
export async function importDraftToVault(
  app: App,
  mediaId: string,
  item: WeChatDraftNewsItem,
  options: ImportDraftOptions = {}
): Promise<ImportDraftResult> {
  const noteFolder = options.noteFolder?.trim() ?? ''
  const existing = options.targetFile ?? null

  const notePath = existing
    ? existing.path
    : availablePath(app, noteFolder, noteNameForTitle(item.title || '公众号草稿'), 'md')

  if (!existing) {
    await ensureFolder(app, noteFolder)
  }

  options.onProgress?.('正在下载正文图片…')
  const { mapping, failed } = await downloadDraftImages(
    app,
    item.content || '',
    notePath,
    options.onProgress
  )

  options.onProgress?.('正在还原正文…')
  const body = htmlToMarkdown(item.content || '', {
    rewriteImageSrc: (src) => mapping.get(src) ?? null
  })
  const titled = applyLeadingTitle(body, item.title || '')

  let coverPath: string | null = null
  if (item.thumb_url) {
    options.onProgress?.('正在下载封面…')
    coverPath = await downloadCover(app, item, notePath)
  }

  const frontmatter = draftMetaForFrontmatter(item, mediaId, {
    coverPath: coverPath ?? undefined,
    coverKey: coverPath ? `file:${coverPath}` : undefined,
    titleInBody: titled.titleInBody
  })
  const markdown = writeDraftFrontmatter(titled.markdown, frontmatter)

  if (existing) {
    await app.vault.modify(existing, markdown)
  } else {
    await app.vault.create(notePath, markdown)
  }

  return {
    notePath,
    downloadedImages: mapping.size,
    failedImages: failed,
    created: !existing,
    coverPath: coverPath ?? undefined,
    coverKey: coverPath ? `file:${coverPath}` : undefined
  }
}

/** 构造用于发布弹窗默认值的草稿关联 */
export function draftLinkForImport(
  mediaId: string,
  item: WeChatDraftNewsItem,
  extra: { coverKey?: string; thumbMediaId?: string } = {}
): DraftLink {
  return {
    mediaId,
    title: item.title || '',
    updatedAt: Date.now(),
    ...(item.thumb_media_id || extra.thumbMediaId
      ? { thumbMediaId: item.thumb_media_id ?? extra.thumbMediaId }
      : {}),
    ...(extra.coverKey ? { coverKey: extra.coverKey } : {})
  }
}
