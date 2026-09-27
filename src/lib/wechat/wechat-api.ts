import { requestUrl, RequestUrlParam } from 'obsidian'
import type {
  WeChatAccessTokenResponse,
  WeChatDraftAddResponse,
  WeChatArticle,
  WeChatDraftAddRequest,
  WeChatDraftListResponse,
  WeChatDraftDeleteResponse
} from './types'
import { getWeChatErrorMessage } from './types'
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
      throw new Error(getWeChatErrorMessage(data.errcode))
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
      throw new Error(getWeChatErrorMessage(data.errcode))
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
      throw new Error(getWeChatErrorMessage(data.errcode))
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
      throw new Error(getWeChatErrorMessage(data.errcode))
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
      throw new Error(getWeChatErrorMessage(data.errcode))
    }

    return data
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
      throw new Error(getWeChatErrorMessage(data.errcode))
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
  // Try to find first H1
  const h1Match = markdown.match(/^#\s+(.+)$/m)
  if (h1Match) {
    return stripInlineMarkdown(h1Match[1])
  }

  // Try to find title in YAML frontmatter
  const yamlMatch = markdown.match(/^---\n[\s\S]*?title:\s*["']?([^"'\n]+)["']?[\s\S]*?---/m)
  if (yamlMatch) {
    return stripInlineMarkdown(yamlMatch[1])
  }

  return '未命名文章'
}

/** 去除行内 Markdown 标记，仅保留可读文本 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
}

/**
 * Extract digest/summary from markdown content
 * Uses the first paragraph or returns empty string
 */
export function extractDigestFromMarkdown(markdown: string): string {
  // Remove frontmatter
  let content = markdown.replace(/^---\n[\s\S]*?---\n?/m, '')
  
  // Remove title (first H1)
  content = content.replace(/^#\s+.+$/m, '')
  
  // Find first paragraph (non-empty, non-heading line)
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('```') && !trimmed.startsWith('- ') && !trimmed.startsWith('* ')) {
      // 按码点截断到 120 字符，避免把 emoji 代理对截成乱码
      const chars = Array.from(trimmed)
      return chars.length > 120 ? chars.slice(0, 117).join('') + '...' : trimmed
    }
  }
  
  return ''
}
