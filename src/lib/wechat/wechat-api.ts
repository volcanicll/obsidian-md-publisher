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

const WECHAT_API_BASE = 'https://api.weixin.qq.com/cgi-bin'

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

    const url = `${WECHAT_API_BASE}/media/uploadimg?access_token=${encodeURIComponent(token)}`

    // Create form data with the image
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2)

    const header = `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    const footer = `\r\n--${boundary}--\r\n`
    
    const headerBytes = new TextEncoder().encode(header)
    const footerBytes = new TextEncoder().encode(footer)
    const imageBytes = new Uint8Array(imageBlob)
    
    const body = new Uint8Array(headerBytes.length + imageBytes.length + footerBytes.length)
    body.set(headerBytes, 0)
    body.set(imageBytes, headerBytes.length)
    body.set(footerBytes, headerBytes.length + imageBytes.length)

    const params: RequestUrlParam = {
      url,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: body.buffer
    }

    const response = await requestUrl(params)
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
 * Uses the first H1 heading or returns a default title
 */
export function extractTitleFromMarkdown(markdown: string): string {
  // Try to find first H1
  const h1Match = markdown.match(/^#\s+(.+)$/m)
  if (h1Match) {
    return h1Match[1].trim()
  }
  
  // Try to find title in YAML frontmatter
  const yamlMatch = markdown.match(/^---\n[\s\S]*?title:\s*["']?([^"'\n]+)["']?[\s\S]*?---/m)
  if (yamlMatch) {
    return yamlMatch[1].trim()
  }

  return '未命名文章'
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
      // Truncate to 120 chars max
      return trimmed.length > 120 ? trimmed.substring(0, 117) + '...' : trimmed
    }
  }
  
  return ''
}
