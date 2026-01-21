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

// Error codes mapping
export const WECHAT_ERROR_CODES: Record<number, string> = {
  [-1]: '系统繁忙，请稍后重试',
  [0]: '请求成功',
  [40001]: 'access_token 无效或已过期',
  [40002]: '不合法的凭证类型',
  [40013]: '不合法的 AppID',
  [40014]: '不合法的 access_token',
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
