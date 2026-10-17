import {
  checkLinks,
  scanSensitiveWords,
  stripHtmlTags,
  type LinkCheckResult,
  type SensitiveHit
} from '../../lib/wechat/validation'

export interface CheckReport {
  links: LinkCheckResult[] | null
  words: SensitiveHit[] | null
  /** 最近一次执行的完成时间；null 表示尚未检查 */
  ranAt: number | null
}

export function emptyReport(): CheckReport {
  return { links: null, words: null, ranAt: null }
}

export interface CheckInput {
  html: string
  title: string
  digest: string
  contentSourceUrl: string
  extraWords: string[]
}

/**
 * 发布前检查：链接有效性与敏感词。
 *
 * 两类检查互相独立，分别回调，先完成的先更新界面，
 * 不需要等另一项结束。结果只作提示，不拦截发布。
 */
export async function runChecks(
  input: CheckInput,
  onPartial: (report: CheckReport) => void
): Promise<CheckReport> {
  const report = emptyReport()
  const publish = () => onPartial({ ...report })

  const linksTask = (async () => {
    const urls = new Set(extractHrefs(input.html))
    const source = input.contentSourceUrl.trim()
    if (/^https?:\/\//i.test(source)) urls.add(source)
    report.links = urls.size === 0 ? [] : await checkLinks([...urls])
    publish()
  })()

  const wordsTask = (async () => {
    const text = [
      stripHtmlTags(input.html),
      input.title,
      input.digest
    ]
      .filter(Boolean)
      .join(' ')
    // 检测放到下一个事件循环，让「检查中…」有机会先渲染
    report.words = await new Promise<SensitiveHit[]>((resolve) => {
      window.setTimeout(() => resolve(scanSensitiveWords(text, input.extraWords)), 30)
    })
    publish()
  })()

  await Promise.all([linksTask, wordsTask])
  report.ranAt = Date.now()
  publish()
  return report
}

/** 提取正文中的 http(s) 链接，与旧版检查口径保持一致 */
export function extractHrefs(html: string): string[] {
  const urls = new Set<string>()
  const hrefRe = /<a[^>]+href=["'](https?:\/\/[^"']+)["']/gi
  let match: RegExpExecArray | null
  while ((match = hrefRe.exec(html)) !== null) {
    urls.add(match[1])
  }
  return [...urls]
}

/** 只保留未通过项，供结果抽屉展示 */
export interface CheckIssue {
  kind: 'link' | 'word'
  label: string
  detail: string
}

export function collectIssues(report: CheckReport): CheckIssue[] {
  const issues: CheckIssue[] = []
  for (const link of report.links ?? []) {
    if (link.ok) continue
    const status = link.status ? `（HTTP ${link.status}）` : ''
    const error = link.error ? `：${link.error}` : ''
    issues.push({ kind: 'link', label: '链接', detail: `${link.url}${status}${error}` })
  }
  for (const hit of report.words ?? []) {
    issues.push({
      kind: 'word',
      label: '敏感词',
      detail: `「${hit.word}」×${hit.count}（${hit.category}）· ${hit.context}`
    })
  }
  return issues
}
