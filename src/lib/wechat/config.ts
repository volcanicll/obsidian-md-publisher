/**
 * 微信公众号配置判断与发布字段限制。
 * 采用结构化类型，便于在弹窗、设置页与单元测试中独立复用。
 */

export interface WeChatConfigLike {
  useManualToken: boolean
  manualAccessToken: string
  wechatAppId: string
  wechatAppSecret: string
}

/**
 * 是否已具备可用的公众号凭证：
 * 手动模式需要 access_token；自动模式需要 AppID 与 AppSecret。
 */
export function isWeChatConfigured(s: WeChatConfigLike): boolean {
  if (s.useManualToken) {
    return !!s.manualAccessToken.trim()
  }
  return !!(s.wechatAppId.trim() && s.wechatAppSecret.trim())
}

/** 微信草稿接口对各字段的长度限制（按 Unicode 码点计） */
export const WECHAT_LIMITS = {
  title: 64,
  digest: 120,
  author: 8,
} as const

/** 按码点计算字符数（emoji、代理对算 1 个字符） */
export function charLength(text: string): number {
  return Array.from(text).length
}

/**
 * 凭证类错误码对应的排查建议；不是凭证问题时返回 null。
 *
 * 发布前校验凭证能提前暴露这些问题，但错误码本身只说「不合法」，
 * 用户往往不知道去哪里改，所以这里给出去向明确的提示。
 */
export function credentialFailureHint(errcode: number | null): string | null {
  switch (errcode) {
    case 40013:
      return 'AppID 无效，请到 设置 → Markdown Publisher 检查是否填错或填反'
    case 40125:
      return 'AppSecret 无效，请到 设置 → Markdown Publisher 重新复制填写'
    case 43104:
      return 'AppID 与 AppSecret 不匹配，请核对两者是否来自同一个公众号'
    case 40164:
      return '本机 IP 不在公众号白名单中，请到公众平台添加，或改用「手动 token」模式'
    case 40001:
    case 40014:
    case 42001:
      return 'access_token 无效或已过期，请在设置中重新粘贴 access_token'
    default:
      return null
  }
}

/**
 * 校验发布字段，返回第一条错误信息；全部通过时返回 null。
 */
export function validateWeChatArticleFields(fields: {
  title: string
  digest?: string
  author?: string
}): string | null {
  const title = fields.title.trim()
  if (!title) {
    return '请输入文章标题'
  }
  if (charLength(title) > WECHAT_LIMITS.title) {
    return `标题不能超过 ${WECHAT_LIMITS.title} 个字（当前 ${charLength(title)} 个字）`
  }
  if (fields.author && charLength(fields.author) > WECHAT_LIMITS.author) {
    return `作者不能超过 ${WECHAT_LIMITS.author} 个字（当前 ${charLength(fields.author)} 个字）`
  }
  if (fields.digest && charLength(fields.digest) > WECHAT_LIMITS.digest) {
    return `摘要不能超过 ${WECHAT_LIMITS.digest} 个字（当前 ${charLength(fields.digest)} 个字）`
  }
  return null
}
