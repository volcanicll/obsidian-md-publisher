import { requestUrl, RequestUrlParam } from 'obsidian'
import type {
  WeChatAccessTokenResponse,
  WeChatDraftAddResponse,
  WeChatArticle,
  WeChatDraftAddRequest,
  WeChatDraftUpdateRequest,
  WeChatDraftUpdateResponse,
  WeChatDraftListResponse,
  WeChatDraftDeleteResponse
} from './types'
import { WeChatApiError } from './types'
import { sanitizeFilename } from '../image-processor'

const WECHAT_API_BASE = 'https://api.weixin.qq.com/cgi-bin'

interface MultipartField {
  name: string
  value: string
}

interface MultipartFilePart {
  filename: string
  contentType: string
  bytes: Uint8Array
}

/** 构造 multipart/form-data 请求体：普通字段在前，文件字段（name="media"）在后 */
function buildMultipartBody(
  boundary: string,
  fields: MultipartField[],
  file: MultipartFilePart
): ArrayBuffer {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  for (const field of fields) {
    parts.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`
      )
    )
  }
  parts.push(
    encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
    )
  )
  parts.push(file.bytes)
  parts.push(encoder.encode(`\r\n--${boundary}--\r\n`))

  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const body = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    body.set(part, offset)
    offset += part.length
  }
  return body.buffer
}

/** 每次上传生成独立 boundary，避免与请求体内容冲突 */
function createBoundary(): string {
  return '----WebKitFormBoundary' + Math.random().toString(36).substring(2)
}

export interface WeChatApiConfig {
  appId: string
  appSecret: string
  accessToken?: string
  tokenExpireTime?: number
  /** 手动 token 模式：只使用提供的 accessToken，永不自动刷新 */
  manualMode?: boolean
}

export interface WeChatApiCallbacks {
  onTokenRefresh?: (token: string, expireTime: number) => Promise<void>
}

/**
 * WeChat Official Account API wrapper
 * Handles authentication and API calls to WeChat platform
 */
export class WeChatApi {
  private appId: string
  private appSecret: string
  private accessToken: string
  private tokenExpireTime: number
  private manualMode: boolean
  private callbacks: WeChatApiCallbacks

  constructor(config: WeChatApiConfig, callbacks: WeChatApiCallbacks = {}) {
    this.appId = config.appId
    this.appSecret = config.appSecret
    this.accessToken = config.accessToken || ''
    this.tokenExpireTime = config.tokenExpireTime || 0
    this.manualMode = config.manualMode || false
    this.callbacks = callbacks
  }

  /**
   * Check if current access token is expired
   */
  private isTokenExpired(): boolean {
    if (!this.accessToken || !this.tokenExpireTime) {
      return true
    }
    // Add 5 minutes buffer before actual expiration
    return Date.now() >= this.tokenExpireTime - 5 * 60 * 1000
  }

  /**
   * Get valid access token.
   * 手动 token 模式（manualMode）下不调用微信 token 接口自动刷新，
   * 用于绕过 IP 白名单限制：用户从公众号后台获取 token 后粘贴使用。
   */
  async getAccessToken(): Promise<string> {
    if (this.manualMode) {
      if (!this.isTokenExpired()) {
        return this.accessToken
      }
      throw new Error(
        '手动 token 已过期（有效期约 2 小时）。请到设置 → 微信公众号配置中粘贴新的 access_token，或切换到自动模式。'
      )
    }

    if (!this.isTokenExpired()) {
      return this.accessToken
    }

    if (!this.appId || !this.appSecret) {
      throw new Error('请先配置公众号 AppID 和 AppSecret')
    }

    const url = `${WECHAT_API_BASE}/token?grant_type=client_credential&appid=${encodeURIComponent(this.appId)}&secret=${encodeURIComponent(this.appSecret)}`

    const params: RequestUrlParam = {
      url,
      method: 'GET'
    }

    const response = await requestUrl(params)
    const data = response.json as WeChatAccessTokenResponse

    if (data.errcode && data.errcode !== 0) {
      throw new WeChatApiError(data.errcode)
    }

    if (!data.access_token) {
      throw new Error('获取 access_token 失败：返回数据无效')
    }

    this.accessToken = data.access_token
    // expires_in is in seconds, convert to timestamp
    this.tokenExpireTime = Date.now() + (data.expires_in || 7200) * 1000

    // Notify caller to save the new token
    if (this.callbacks.onTokenRefresh) {
      await this.callbacks.onTokenRefresh(this.accessToken, this.tokenExpireTime)
    }

    return this.accessToken
  }

  /**
   * Add article to drafts
   * @param article Article content to add
   * @returns media_id of the created draft
   */
  async addDraft(article: WeChatArticle): Promise<string> {
    const token = await this.getAccessToken()
    
    const url = `${WECHAT_API_BASE}/draft/add?access_token=${encodeURIComponent(token)}`

    const requestBody: WeChatDraftAddRequest = {
      articles: [article]
    }

    const params: RequestUrlParam = {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }

    const response = await requestUrl(params)
    const data = response.json as WeChatDraftAddResponse

    if (data.errcode && data.errcode !== 0) {
      throw new WeChatApiError(data.errcode)
    }

    if (!data.media_id) {
      throw new Error('创建草稿失败：返回数据无效')
    }

    return data.media_id
  }

  /**
   * Upload image to WeChat server for use in article content
   * Note: Images in article content must be uploaded via this API
   * @param imageBlob Image data as ArrayBuffer
   * @param filename Original filename
   * @param contentType Image MIME type, defaults to image/png
   * @returns URL of the uploaded image on WeChat servers
   */
  async uploadImage(
    imageBlob: ArrayBuffer,
    filename: string,
    contentType: string = 'image/png'
  ): Promise<string> {
    const token = await this.getAccessToken()

    // 文件名中的引号、反斜杠与控制字符会破坏 multipart 请求体结构，先清洗
    const safeFilename = sanitizeFilename(filename)

    const url = `${WECHAT_API_BASE}/media/uploadimg?access_token=${encodeURIComponent(token)}`
    const boundary = createBoundary()
    const body = buildMultipartBody(boundary, [], {
      filename: safeFilename,
      contentType,
      bytes: new Uint8Array(imageBlob),
    })

    const response = await requestUrl({
      url,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    })
    const data = response.json as { url?: string; errcode?: number; errmsg?: string }

    if (data.errcode && data.errcode !== 0) {
      throw new WeChatApiError(data.errcode)
    }

    if (!data.url) {
      throw new Error('上传图片失败：返回数据无效')
    }

    return data.url
  }

  /**
   * 上传封面图到永久素材，返回可用于 thumb_media_id 的 media_id。
   * 微信 news 类型草稿必须提供封面（thumb_media_id），且必须是
   * material/add_material 返回的永久 media_id——正文图片接口
   * media/uploadimg 不返回 media_id，不能当封面用。
   */
  async uploadCoverImage(
    imageBlob: ArrayBuffer,
    filename: string,
    contentType: string = 'image/jpeg'
  ): Promise<string> {
    const token = await this.getAccessToken()

    const safeFilename = sanitizeFilename(filename)
    const url = `${WECHAT_API_BASE}/material/add_material?access_token=${encodeURIComponent(token)}`
    const boundary = createBoundary()
    const body = buildMultipartBody(
      boundary,
      [{ name: 'type', value: 'image' }],
      { filename: safeFilename, contentType, bytes: new Uint8Array(imageBlob) }
    )

    const response = await requestUrl({
      url,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    })
    const data = response.json as { media_id?: string; url?: string; errcode?: number; errmsg?: string }

    if (data.errcode && data.errcode !== 0) {
      throw new WeChatApiError(data.errcode)
    }

    if (!data.media_id) {
      throw new Error('上传封面失败：返回数据无效')
    }

    return data.media_id
  }

  /**
   * List article drafts from the WeChat draft box.
   * @param offset Page offset (starts at 0)
   * @param count Items per page (max 20)
   */
  async listDrafts(offset = 0, count = 20): Promise<WeChatDraftListResponse> {
    const token = await this.getAccessToken()

    const url = `${WECHAT_API_BASE}/draft/batchget?access_token=${encodeURIComponent(token)}`

    const params: RequestUrlParam = {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ offset, count, no_content: 0 })
    }

    const response = await requestUrl(params)
    const data = response.json as WeChatDraftListResponse

    if (data.errcode && data.errcode !== 0) {
      throw new WeChatApiError(data.errcode)
    }

    return data
  }

  /**
   * 覆盖草稿箱中的已有草稿。
   *
   * 接口是整体替换而非合并：未传入的字段会被清空，因此调用方必须
   * 提供完整文章对象。只能更新由本接口创建的草稿，且单图文草稿的
   * index 固定为 0。
   *
   * @param mediaId 目标草稿的 media_id
   * @param article 完整文章内容（含封面 thumb_media_id）
   * @param index 图文序号，单图文草稿为 0
   */
  async updateDraft(mediaId: string, article: WeChatArticle, index = 0): Promise<void> {
    const token = await this.getAccessToken()

    const url = `${WECHAT_API_BASE}/draft/update?access_token=${encodeURIComponent(token)}`

    const requestBody: WeChatDraftUpdateRequest = {
      media_id: mediaId,
      index,
      articles: article
    }

    const params: RequestUrlParam = {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }

    const response = await requestUrl(params)
    const data = response.json as WeChatDraftUpdateResponse

    if (data.errcode && data.errcode !== 0) {
      throw new WeChatApiError(data.errcode)
    }
  }

  /**
   * Delete an article draft by media_id.
   */
  async deleteDraft(mediaId: string): Promise<void> {
    const token = await this.getAccessToken()

    const url = `${WECHAT_API_BASE}/draft/delete?access_token=${encodeURIComponent(token)}`

    const params: RequestUrlParam = {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ media_id: mediaId })
    }

    const response = await requestUrl(params)
    const data = response.json as WeChatDraftDeleteResponse

    if (data.errcode && data.errcode !== 0) {
      throw new WeChatApiError(data.errcode)
    }
  }

  /**
   * Check if WeChat API is configured
   */
  isConfigured(): boolean {
    return !!(this.appId && this.appSecret)
  }
}

/**
 * Extract title from markdown content
 * Uses the first H1 heading or returns a default title.
 * H1 中的行内 Markdown 标记（加粗、链接、行内代码等）会被剥离，
 * 避免星号等符号原样出现在公众号标题里。
 */
export function extractTitleFromMarkdown(markdown: string): string {
  // Try to find first H1（跳过围栏代码块里的 # 注释行）
  const h1 = findFirstHeadingOutsideFence(markdown)
  if (h1) {
    return stripInlineMarkdown(h1)
  }

  // Try to find title in YAML frontmatter
  const yamlTitle = frontmatterValue(markdown, 'title')
  if (yamlTitle) {
    return stripInlineMarkdown(yamlTitle)
  }

  return '未命名文章'
}

/** 取 YAML frontmatter 原文（不含分隔线）；没有 frontmatter 返回 null */
function frontmatterBlock(markdown: string): string | null {
  const m = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  return m ? m[1] : null
}

/**
 * 从 frontmatter 中读取某个键的值。
 * 只在 frontmatter 块内查找：此前用跨全文的贪婪正则，正文里出现
 * `title:` 字样时会把正文内容误当成标题。
 */
function frontmatterValue(markdown: string, key: string): string | null {
  const block = frontmatterBlock(markdown)
  if (!block) return null
  const re = new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm')
  const m = block.match(re)
  if (!m) return null
  return m[1].trim().replace(/^["']|["']$/g, '')
}

/** 找到第一个一级标题（围栏代码块内的行不算） */
function findFirstHeadingOutsideFence(markdown: string): string | null {
  let inFence = false
  let fenceMarker = ''
  let fenceLength = 0
  for (const line of markdown.split('\n')) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!inFence) {
        inFence = true
        fenceMarker = marker
        fenceLength = fenceMatch[1].length
      } else if (marker === fenceMarker && fenceMatch[1].length >= fenceLength) {
        inFence = false
      }
      continue
    }
    if (inFence) continue
    const m = line.match(/^#\s+(.+)$/)
    if (m) return m[1]
  }
  return null
}

/**
 * 去除行内 Markdown 标记，仅保留可读文本。
 * 摘要与标题共用：两者都会直接出现在公众号界面，不能带语法符号。
 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_m, target: string, alt?: string) => alt ?? target)
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_m, target: string, alias?: string) => {
      const label = alias ?? target
      // [[笔记#标题]] 在 Obsidian 中显示为「笔记 > 标题」
      const [note, ...headings] = label.split('#')
      return [note, ...headings].filter(Boolean).join(' > ')
    })
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!>~=])/g, '$1')
    .trim()
}

/**
 * Extract digest/summary from markdown content.
 *
 * 取第一个「有可读文字」的段落：图片、表格、分隔线、纯 HTML 块直接跳过，
 * 引用与列表只去掉标记、保留文字，最后剥离行内语法。
 * 此前直接返回原始行，`![](cover.png)`、`1. 第一项`、`> 引用` 会原样
 * 进入公众号摘要（分享卡片可见），且加粗等语法符号不会被清理。
 */
export function extractDigestFromMarkdown(markdown: string): string {
  const content = frontmatterBlock(markdown) === null
    ? markdown
    : markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')

  const lines = content.split('\n')
  let inFence = false
  let paragraph: string[] = []

  const flush = (): string | null => {
    if (paragraph.length === 0) return null
    const text = stripInlineMarkdown(joinParagraph(paragraph))
    paragraph = []
    if (!text) return null
    // 按码点截断到 120 字符，避免把 emoji 代理对截成乱码
    const chars = Array.from(text)
    return chars.length > 120 ? chars.slice(0, 117).join('') + '...' : text
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (/^(```|~~~)/.test(trimmed)) {
      const done = flush()
      if (done) return done
      inFence = !inFence
      continue
    }
    if (inFence) continue

    if (!trimmed) {
      const done = flush()
      if (done) return done
      continue
    }

    // 标题与分隔线会结束当前段落：先结算已积累的文字，
    // 避免上一段与标题后的正文被拼成一句
    if (trimmed.startsWith('#') || /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      const done = flush()
      if (done) return done
      continue
    }

    // 表格行、纯图片、纯 HTML 块都不是摘要来源
    if (trimmed.startsWith('|')) continue
    if (/^!\[\[[^\]]*\]\]$/.test(trimmed)) continue
    if (/^!\[[^\]]*\]\([^)]*\)$/.test(trimmed)) continue
    if (/^<[^>]+>$/.test(trimmed)) continue

    // 引用与列表只去标记，文字仍然可用
    const text = trimmed
      .replace(/^>\s?/, '')
      .replace(/^([-*+]|\d+[.)])\s+/, '')
      .replace(/^\[[ xX]\]\s+/, '')
    if (text) paragraph.push(text)
  }

  return flush() ?? ''
}

/**
 * 段落内各行拼接。Markdown 软换行在 HTML 中渲染为空格，
 * 列表项之间也需要分隔，因此统一用空格连接。
 */
function joinParagraph(lines: string[]): string {
  return lines.join(' ')
}
