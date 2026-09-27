/**
 * Obsidian Callout 语法 → 公众号可渲染的卡片样式。
 *
 * 处理时机：sanitize 之后、juice 内联之前。此时 HTML 干净且尚未依赖
 * class（公众号会剥掉 class 与 <style>），卡片全部使用内联样式。
 *
 * 语法：> [!type] 标题 / [!type]- 默认折叠 / [!type]+ 默认展开。
 * 公众号正文没有折叠能力：折叠型只保留标题卡片，展开型渲染完整内容。
 */

export interface CalloutTypeStyle {
  label: string
  color: string
  bg: string
}

const CALLOUT_TYPES: Record<string, CalloutTypeStyle> = {
  note: { label: '笔记', color: '#4d6e8c', bg: '#f0f5f9' },
  abstract: { label: '摘要', color: '#2f8577', bg: '#edf7f5' },
  info: { label: '信息', color: '#3f8ec4', bg: '#eef5fb' },
  todo: { label: '待办', color: '#5b7a99', bg: '#f2f5f8' },
  tip: { label: '提示', color: '#2e9968', bg: '#eef8f2' },
  success: { label: '成功', color: '#2e9e5b', bg: '#ecf8f0' },
  question: { label: '疑问', color: '#b08a1e', bg: '#fbf5e6' },
  warning: { label: '警告', color: '#d07815', bg: '#fdf3e7' },
  failure: { label: '失败', color: '#cc4b4b', bg: '#fceeee' },
  danger: { label: '危险', color: '#c0392b', bg: '#fdeceb' },
  bug: { label: 'Bug', color: '#8e5bd0', bg: '#f4effb' },
  example: { label: '示例', color: '#7d6fae', bg: '#f2f0f9' },
  quote: { label: '引用', color: '#8a8a8a', bg: '#f5f5f5' },
}

/** Obsidian callout 别名 → 主类型 */
const CALLOUT_ALIASES: Record<string, string> = {
  summary: 'abstract',
  tldr: 'abstract',
  hint: 'tip',
  important: 'tip',
  check: 'success',
  done: 'success',
  help: 'question',
  faq: 'question',
  caution: 'warning',
  attention: 'warning',
  fail: 'failure',
  missing: 'failure',
  error: 'danger',
  cite: 'quote',
}

export function resolveCalloutType(type: string): CalloutTypeStyle | null {
  const main = CALLOUT_ALIASES[type] || type
  return CALLOUT_TYPES[main] || null
}

/**
 * callout 首段标记：[!type] 可选折叠符与标题。
 * 匹配目标形如 "[!tip]+ 三条要点"。
 * 折叠符两种写法都兼容：[!tip-]（括号内）与 [!tip]-（括号后，Obsidian 实际语法）。
 * 注意只吞行内空白：标题到行尾为止，换行后的内容属于正文。
 * 类型不限定大小写：Obsidian 官方文档使用 [!NOTE] 形式。
 */
const MARKER_RE = /^\[!([\w-]+?)([-+]?)\]([-+]?)[ \t]*/

/** 找到与 html[openTagStart..] 处 "<blockquote>" 配对的 "</blockquote>" 末尾索引，处理嵌套 */
function findBlockquoteEnd(html: string, openTagStart: number): number {
  const openRe = /<blockquote(\s[^>]*)?>/gi
  const closeRe = /<\/blockquote>/gi
  // 开标签自身已计入深度，从它的结束处继续扫描
  const tagEnd = html.indexOf('>', openTagStart)
  if (tagEnd === -1) return -1
  openRe.lastIndex = tagEnd + 1
  closeRe.lastIndex = openTagStart
  let depth = 1
  while (depth > 0) {
    const nextOpen = openRe.exec(html)
    const nextClose = closeRe.exec(html)
    if (!nextClose) return -1
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++
    } else {
      depth--
      if (depth === 0) return nextClose.index + nextClose[0].length
    }
  }
  return -1
}

interface ParsedCallout {
  typeStyle: CalloutTypeStyle
  collapsed: boolean
  title: string
  bodyHtml: string
}

/** 解析 blockquote 内部 HTML；不是 callout 返回 null */
function parseCallout(inner: string): ParsedCallout | null {
  const pMatch = inner.match(/^\s*<p[^>]*>([\s\S]*?)<\/p>/)
  if (!pMatch) return null
  const firstText = pMatch[1]
  const marker = firstText.match(MARKER_RE)
  if (!marker) return null

  const typeStyle = resolveCalloutType(marker[1].toLowerCase())
  if (!typeStyle) return null

  const collapsed = marker[2] === '-' || marker[3] === '-'
  // 标题 = 标记后同一行的文本；首段内换行后的文本与后续段落都算正文
  const afterMarker = firstText.slice(marker[0].length)
  const newlineIdx = afterMarker.indexOf('\n')
  const title = newlineIdx === -1 ? afterMarker : afterMarker.slice(0, newlineIdx)
  const firstPRest =
    !collapsed && newlineIdx !== -1 ? `<p>${afterMarker.slice(newlineIdx + 1)}</p>` : ''
  const bodyAfterFirstP = inner.slice(pMatch[0].length)
  return {
    typeStyle,
    collapsed,
    title,
    bodyHtml: collapsed ? '' : firstPRest + bodyAfterFirstP,
  }
}

function buildCalloutCard(parsed: ParsedCallout): string {
  const { typeStyle, title, bodyHtml } = parsed
  const titleText = title.trim() || typeStyle.label
  return (
    `<section style="margin:1.5em 0;padding:14px 16px;background:${typeStyle.bg};` +
    `border-left:4px solid ${typeStyle.color};border-radius:8px;font-size:14px;line-height:1.8;">` +
    `<p style="margin:0 0 8px;color:${typeStyle.color};font-weight:600;">${titleText}</p>` +
    bodyHtml +
    `</section>`
  )
}

/**
 * 将 HTML 中所有 callout 引用块转换为卡片；普通引用块原样保留。
 */
export function transformCallouts(html: string): string {
  let result = ''
  let cursor = 0

  while (cursor < html.length) {
    const openIdx = html.indexOf('<blockquote', cursor)
    if (openIdx === -1) {
      result += html.slice(cursor)
      break
    }
    const tagEnd = html.indexOf('>', openIdx)
    const closeEnd = findBlockquoteEnd(html, openIdx)
    if (tagEnd === -1 || closeEnd === -1) {
      result += html.slice(cursor)
      break
    }

    result += html.slice(cursor, openIdx)
    const inner = html.slice(tagEnd + 1, closeEnd - '</blockquote>'.length)
    const parsed = parseCallout(inner)

    if (parsed) {
      result += buildCalloutCard(parsed)
    } else {
      result += html.slice(openIdx, closeEnd)
    }
    cursor = closeEnd
  }

  return result
}
