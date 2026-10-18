/**
 * WeChat Official Account API type definitions
 */

// Access Token Response
export interface WeChatAccessTokenResponse {
  access_token?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

// Upload Image Response
export interface WeChatUploadImageResponse {
  url?: string
  errcode?: number
  errmsg?: string
}

// Draft Add Response
export interface WeChatDraftAddResponse {
  media_id?: string
  errcode?: number
  errmsg?: string
}

// Article structure for draft/add API
export interface WeChatArticle {
  /** Article title, max 64 chars */
  title: string
  /** Article content in HTML format */
  content: string
  /** Author name, max 8 chars */
  author?: string
  /** Article digest/summary, max 120 chars */
  digest?: string
  /** Source URL for "Read Original" link */
  content_source_url?: string
  /** Cover image media_id (permanent media) */
  thumb_media_id?: string
  /** Whether to show cover in article (0: no, 1: yes) */
  show_cover_pic?: 0 | 1
  /** Whether to open comments (0: no, 1: yes) */
  need_open_comment?: 0 | 1
  /** Whether only fans can comment (0: all, 1: fans only) */
  only_fans_can_comment?: 0 | 1
}

// Draft add request body
export interface WeChatDraftAddRequest {
  articles: WeChatArticle[]
}

// Draft update request body（注意 articles 是单个对象，与 draft/add 的数组不同）
export interface WeChatDraftUpdateRequest {
  media_id: string
  /** 要替换的图文序号，单图文草稿固定为 0 */
  index: number
  articles: WeChatArticle
}

// draft/update response
export interface WeChatDraftUpdateResponse {
  errcode?: number
  errmsg?: string
}

// Draft list item returned by draft/batchget
export interface WeChatDraftListItem {
  media_id: string
  update_time: number
  content: {
    news_item: Array<{
      title: string
      digest?: string
      author?: string
      /** 封面永久素材 media_id，覆盖更新时可直接复用 */
      thumb_media_id?: string
    }>
  }
}

// 单篇图文的完整内容，由 draft/get 返回
export interface WeChatDraftNewsItem {
  title: string
  author?: string
  digest?: string
  /** 正文 HTML（含公众号编辑器写入的内联样式） */
  content: string
  content_source_url?: string
  /** 封面永久素材 media_id */
  thumb_media_id?: string
  /** 封面图 CDN 地址，可下载后作为本地封面 */
  thumb_url?: string
  show_cover_pic?: number
  need_open_comment?: number
  only_fans_can_comment?: number
  /** 草稿预览链接（草稿未群发时通常为空） */
  url?: string
}

// draft/get response
export interface WeChatDraftGetResponse {
  news_item?: WeChatDraftNewsItem[]
  create_time?: number
  update_time?: number
  errcode?: number
  errmsg?: string
}

// draft/batchget response
export interface WeChatDraftListResponse {
  total_count: number
  item_count: number
  item?: WeChatDraftListItem[]
  errcode?: number
  errmsg?: string
}

// draft/delete response
export interface WeChatDraftDeleteResponse {
  errcode?: number
  errmsg?: string
}

// Error codes mapping
export const WECHAT_ERROR_CODES: Record<number, string> = {
  [-1]: '系统繁忙，请稍后重试',
  [0]: '请求成功',
  [40001]: 'access_token 无效或已过期',
  [40002]: '不合法的凭证类型',
  [40013]: '不合法的 AppID',
  [40014]: '不合法的 access_token',
  [40007]: '不合法的媒体文件 ID（封面须用永久素材 media_id，正文图片接口返回的 URL 不能当封面）',
  [40125]: '不合法的 AppSecret',
  [40164]: '调用接口的IP地址不在白名单中',
  [41001]: '缺少 access_token 参数',
  [41002]: '缺少 appid 参数',
  [41004]: '缺少 secret 参数',
  [42001]: 'access_token 已过期',
  [42007]: '用户修改了微信密码，需要重新获取 access_token',
  [43104]: 'appid 与 secret 不匹配',
  [45009]: '接口调用超过限制',
  [45064]: '已经群发过的文章不能发布',
  [45166]: '内容长度超过限制',
  [48001]: 'api 功能未授权',
  [50001]: '用户未授权该 api',
  [50002]: '用户受限，可能是违规后接口被封禁',
  [50007]: '账号已冻结',
  [61024]: '该链接无法发送给公众号用户',
  [87010]: '该草稿不存在',
  [87011]: '该草稿无权限操作',
  [87013]: '该图片素材不存在',
  [87015]: '没有足够的次数可用于群发',
  [87016]: '内容违规'
}

export function getWeChatErrorMessage(errcode: number): string {
  return WECHAT_ERROR_CODES[errcode] || `未知错误 (${errcode})`
}

/**
 * 微信接口错误。保留 errcode 以便调用方按错误类型分支处理
 * （例如草稿已被删除时改为新建、封面素材失效时重新上传）。
 */
export class WeChatApiError extends Error {
  readonly code: number

  constructor(code: number) {
    super(getWeChatErrorMessage(code))
    this.name = 'WeChatApiError'
    this.code = code
  }
}

/** 判断错误是否为指定的微信 errcode 之一 */
export function isWeChatError(error: unknown, ...codes: number[]): boolean {
  return error instanceof WeChatApiError && codes.includes(error.code)
}
