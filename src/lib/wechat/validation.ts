/**
 * 发布前校验：链接有效性与敏感词检测。
 *
 * 两者都是「提示不拦截」：结果只作为发布前的参考清单，
 * 是否继续由用户决定（与图片失败即中止的硬约束不同）。
 */

import { requestUrl } from 'obsidian'

// ---- 链接有效性检查 -------------------------------------------------------

export interface LinkCheckResult {
  url: string
  ok: boolean
  status?: number
  error?: string
}

/** 提取 HTML 中所有需要检查的 http(s) 链接（<a href> 与「阅读原文」等） */
export function extractLinks(html: string): string[] {
  const urls = new Set<string>()
  const hrefRe = /<a[^>]+href=["'](https?:\/\/[^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = hrefRe.exec(html)) !== null) {
    urls.add(m[1])
  }
  return [...urls]
}

/** 单个请求的超时包装；requestUrl 本身不支持超时参数 */
async function checkOne(url: string, timeoutMs: number): Promise<LinkCheckResult> {
  // 先 HEAD，多数站点支持；4xx/5xx 或方法不支持时退回 GET 重试一次
  for (const method of ['HEAD', 'GET'] as const) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const response = await Promise.race([
        requestUrl({ url, method, headers: { 'User-Agent': 'Mozilla/5.0 (LinkCheck)' } }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('请求超时')), timeoutMs)
        }),
      ])
      const status = (response as { status: number }).status
      if (status < 400) {
        return { url, ok: true, status }
      }
      // HEAD 被拒（403/405 等）时用 GET 重试，GET 仍失败才算失败
      if (method === 'GET') {
        return { url, ok: false, status }
      }
    } catch (err) {
      if (method === 'GET') {
        const message = err instanceof Error ? err.message : String(err)
        return { url, ok: false, error: message }
      }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  return { url, ok: false, error: '未知错误' }
}

/** 并发检查一批链接；无链接时返回空数组 */
export async function checkLinks(
  urls: string[],
  timeoutMs = 8000,
  concurrency = 4
): Promise<LinkCheckResult[]> {
  const results: LinkCheckResult[] = []
  let cursor = 0

  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++]
      results.push(await checkOne(url, timeoutMs))
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => worker())
  )
  return results
}

// ---- 敏感词检测 -----------------------------------------------------------

export interface SensitiveWordCategory {
  name: string
  words: string[]
}

/**
 * 内置启发式词表（可按需增删，检测结果仅供参考）：
 * - 极限用语：广告法限制的绝对化表述
 * - 医疗夸大：疗效承诺类
 * - 收益承诺：金融诱导类
 * - 诱导互动：诱导转发/加群/领取类
 */
export const BUILTIN_SENSITIVE_WORDS: SensitiveWordCategory[] = [
  {
    name: '极限用语（广告法）',
    words: [
      '最好', '最强', '最优', '最佳', '最大', '最低价', '最便宜', '史上最',
      '全网最低', '第一品牌', '销量第一', '顶级', '极品', '绝对', '100%有效',
      '国家级', '世界级', '宇宙级', '独家', '首创', '绝无仅有', '万能', '完美',
    ],
  },
  {
    name: '医疗夸大',
    words: [
      '根治', '治愈率', '包治百病', '药到病除', '彻底摆脱', '无副作用',
      '立竿见影', '无效退款',
    ],
  },
  {
    name: '收益承诺',
    words: [
      '稳赚', '包赚', '保本保息', '躺赚', '翻倍收益', '零风险', '无风险',
      '暴富', '日赚',
    ],
  },
  {
    name: '诱导互动',
    words: [
      '转发朋友圈', '转发分享', '关注公众号', '加微信', '扫码关注',
      '私信我', '点击领取', '限时免费', '速抢', '秒杀', '先到先得',
    ],
  },
]

export interface SensitiveHit {
  word: string
  category: string
  count: number
  /** 命中位置的上下文片段，便于定位 */
  context: string
}

/** 去除 HTML 标签与多余空白，得到纯文本供扫描 */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findContext(text: string, index: number, radius = 18): string {
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + radius)
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '')
}

/**
 * 扫描文本中的敏感词。extraWords 为用户在设置中补充的词条，
 * 归入「自定义」类别。
 */
export function scanSensitiveWords(text: string, extraWords: string[] = []): SensitiveHit[] {
  const hits: SensitiveHit[] = []
  const categories: SensitiveWordCategory[] = [
    ...BUILTIN_SENSITIVE_WORDS,
    ...(extraWords.filter(Boolean).length ? [{ name: '自定义', words: extraWords }] : []),
  ]

  for (const category of categories) {
    for (const word of category.words) {
      const re = new RegExp(escapeRegExp(word), 'gi')
      let match: RegExpExecArray | null
      let count = 0
      let firstIndex = -1
      while ((match = re.exec(text)) !== null) {
        count++
        if (firstIndex === -1) firstIndex = match.index
        if (match.index === re.lastIndex) re.lastIndex++ // 防御零宽匹配
      }
      if (count > 0) {
        hits.push({
          word,
          category: category.name,
          count,
          context: findContext(text, firstIndex),
        })
      }
    }
  }
  return hits
}
