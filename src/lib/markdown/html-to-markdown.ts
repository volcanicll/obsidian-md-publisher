/**
 * 公众号草稿 HTML → Markdown 还原。
 *
 * 草稿里存的 HTML 是插件渲染管线的产物：内联样式、`<section>` 包裹、
 * 代码块里用 `<br>` / `&nbsp;` 固化的空白。直接塞给通用转换器会得到
 * 一堆无意义的 `<section>` 和铺满 `&nbsp;` 的代码块，因此这里针对本插件
 * 自己的输出做定向还原，只保留用户能继续编辑的语义结构。
 *
 * 还原是「尽力而为」的：主题样式无法还原成 Markdown（公众号正文本来
 * 就只认内联样式），但标题层级、列表、表格、代码、公式、图片、链接、
 * callout 卡片都会回到可直接编辑的源码形态。
 */

import { fromHtml } from 'hast-util-from-html'
import type { Element, ElementContent, Nodes } from 'hast'
import { calloutTypeByCard } from './callouts'

export interface HtmlToMarkdownOptions {
  /**
   * 图片地址改写。返回字符串时替换 src（用于把微信 CDN 图片换成
   * 本地 vault 路径），返回 null 时保留原地址。
   */
  rewriteImageSrc?: (src: string) => string | null
}

interface InlineContext {
  inLink: boolean
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/** 行内标签：不打断段落 */
const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn',
  'em', 'font', 'i', 'ins', 'kbd', 'label', 'mark', 'q', 's', 'samp',
  'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'u', 'var',
  'wbr', 'br', 'img'
])

/** 解析 style 属性为小写属性名的映射 */
function parseStyle(el: Element): Record<string, string> {
  const raw = typeof el.properties?.style === 'string' ? el.properties.style : ''
  const map: Record<string, string> = {}
  for (const declaration of raw.split(';')) {
    const index = declaration.indexOf(':')
    if (index === -1) continue
    const key = declaration.slice(0, index).trim().toLowerCase()
    const value = declaration.slice(index + 1).trim()
    if (key) map[key] = value
  }
  return map
}

function tagName(el: Element): string {
  return el.tagName.toLowerCase()
}

function classList(el: Element): string[] {
  const className = el.properties?.className
  if (Array.isArray(className)) return className.map(String)
  if (typeof className === 'string') return className.split(/\s+/).filter(Boolean)
  return []
}

function textOf(node: Nodes): string {
  if (node.type === 'text') return node.value
  if (node.type === 'element' || node.type === 'root') {
    return node.children.map(textOf).join('')
  }
  return ''
}

/** 去掉仅由空白组成的子节点，用于判断结构 */
function meaningfulChildren(el: Element): ElementContent[] {
  return el.children.filter((child) => !(child.type === 'text' && child.value.trim() === ''))
}

function singleElementChild(el: Element): Element | null {
  const children = meaningfulChildren(el)
  if (children.length !== 1) return null
  return children[0].type === 'element' ? children[0] : null
}

function isHidden(el: Element): boolean {
  if (el.properties?.hidden) return true
  const style = parseStyle(el)
  return style['display'] === 'none'
}

/**
 * 行内文本转义。
 *
 * 只处理会破坏行内结构的字符（反斜杠、星号、反引号、方括号）。
 * 行首的列表 / 标题 / 引用标记**不转义**：这些文本已经处在标题、
 * 列表项或段落内容里，加反斜杠只会让 `1. 什么是…` 变成 `1\. 什么是…`
 * 出现在笔记里。真正需要防的是「段落文字恰好以 `1.` 开头」这种
 * 被误认成列表的情况，那由块级渲染单独处理。
 */
function escapeMarkdownText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/([*`[\]])/g, '\\$1')
}

/**
 * 段落首行以列表 / 引用标记开头时转义，避免整段被解析成列表。
 * 标题、列表项内部不使用这个函数。
 */
function escapeBlockLeading(text: string): string {
  return text
    .replace(/^(\s*)([-+])(\s)/, '$1\\$2$3')
    .replace(/^(\s*)(\d+)([.)])(\s)/, '$1$2\\$3$4')
    .replace(/^(\s*)(#{1,6})(\s)/, '$1\\$2$3')
    .replace(/^(\s*)>/, '$1\\>')
}

function escapeLinkText(text: string): string {
  return text.replace(/([\\[\]])/g, '\\$1')
}

function escapeLinkUrl(url: string): string {
  // 空格与括号会截断 Markdown 链接目标
  return url.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')
}

/**
 * 多行文本 → 行内 Markdown。
 *
 * HTML 段落里的换行来自源码软换行，保留成 Markdown 软换行（Obsidian 里
 * 仍显示为换行）；行首行尾的排版空白去掉。`<br>` 生成的硬换行（行尾两个
 * 空格）在 cleanupMarkdown 中保留。
 */
/**
 * 文本节点 → 行内 Markdown。
 *
 * 按 HTML 的空白折叠规则把含换行的空白串压成一个空格（源码软换行在
 * Markdown 里同样是软换行）；段首段尾的空白由段落渲染统一 trim。
 */
function inlineText(text: string): string {
  return escapeMarkdownText(text.replace(/\u00a0/g, ' ').replace(/\s*\n\s*/g, ' '))
}

/** 去掉行内 Markdown 标记，用于生成链接文字 */
function stripInlineMarkup(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

function isInlineNode(node: ElementContent): boolean {
  if (node.type === 'text') return true
  if (node.type === 'comment') return true
  if (node.type !== 'element') return false
  // 块级公式必须独占一段
  if (node.properties?.['data-bm-math'] === 'block') return false
  const tag = tagName(node)
  // 单独出现的图片按块级处理：公众号正文里图片几乎都是独立一行，
  // 若当行内节点，`<section><img></section>` 这种结构会整块丢失
  if (tag === 'img') return false
  return INLINE_TAGS.has(tag)
}

// ---- 行内渲染 -----------------------------------------------------------

function renderInlineNodes(nodes: ElementContent[], ctx: InlineContext): string {
  return nodes.map((node) => renderInline(node, ctx)).join('')
}

function renderInline(node: ElementContent, ctx: InlineContext): string {
  if (node.type === 'text') return inlineText(node.value)
  if (node.type !== 'element') return ''

  // 公式在 replaceMath 里被换成带标记的 span，先于普通标签处理
  const mathKind = node.properties?.['data-bm-math']
  if (mathKind === 'block') return `$$\n${textOf(node).trim()}\n$$`
  if (mathKind === 'inline') return `$${textOf(node).trim()}$`

  const tag = tagName(node)
  const inner = (): string => renderInlineNodes(node.children, ctx)

  switch (tag) {
    case 'strong':
    case 'b': {
      const text = inner()
      return text.trim() ? `**${text}**` : text
    }
    case 'em':
    case 'i': {
      const text = inner()
      return text.trim() ? `*${text}*` : text
    }
    case 'del':
    case 's':
    case 'strike': {
      const text = inner()
      return text.trim() ? `~~${text}~~` : text
    }
    case 'code': {
      const text = textOf(node)
      if (!text) return ''
      if (text.includes('`')) {
        const longest = Math.max(...(text.match(/`+/g) ?? []).map((run) => run.length))
        const fence = '`'.repeat(longest + 1)
        return `${fence} ${text} ${fence}`
      }
      return `\`${text}\``
    }
    case 'mark': {
      const text = inner()
      return text.trim() ? `==${text}==` : text
    }
    case 'span': {
      // 主题把 ==高亮== 渲染成带背景色的 span（<mark> 会被公众号过滤），
      // 背景色 + 内边距是它区别于普通文字 span 的特征
      const style = parseStyle(node)
      const background = (style['background-color'] || style['background'] || '').toLowerCase()
      if (
        background &&
        !/^(transparent|inherit|none|currentcolor)$/.test(background) &&
        (style['padding'] || style['border-radius'])
      ) {
        const text = inner()
        return text.trim() ? `==${text}==` : text
      }
      return inner()
    }
    case 'br':
      return '  \n'
    case 'img':
      return renderImage(node)
    case 'a': {
      const href = typeof node.properties?.href === 'string' ? node.properties.href : ''
      const text = inner()
      // 链接不能嵌套；内层链接退化为纯文本
      if (!href || ctx.inLink) return text
      const label = escapeLinkText(stripInlineMarkup(text).trim()) || escapeLinkText(href)
      return `[${label}](${escapeLinkUrl(href)})`
    }
    default: {
      return inner()
    }
  }
}

/**
 * 取图片真实地址。
 *
 * 公众号草稿里的图片普遍是懒加载写法：`src` 为空或占位图，真实地址在
 * `data-src` 上。只读 `src` 会让整篇正文的图片凭空消失。
 *
 * hast 会把 `data-*` 属性转成驼峰（`dataSrc`），两种键名都要认。
 */
export function imageSrcOf(el: Element): string {
  const props = el.properties ?? {}
  const dataSrc =
    typeof props['data-src'] === 'string'
      ? props['data-src'].trim()
      : typeof props.dataSrc === 'string'
        ? props.dataSrc.trim()
        : ''
  if (dataSrc) return dataSrc
  const src = typeof props.src === 'string' ? props.src.trim() : ''
  // 微信的占位图（1x1 透明 gif / svg）不能当正文图片
  if (/^data:image\/(?:gif|svg)/i.test(src)) return ''
  return src
}

function renderImage(el: Element): string {
  const src = imageSrcOf(el)
  if (!src) return ''
  const alt = typeof el.properties?.alt === 'string' ? el.properties.alt : ''
  return `![${escapeLinkText(alt)}](${escapeLinkUrl(src)})`
}

// ---- 代码块 -------------------------------------------------------------

/** 代码块里被固化成 `<br>` 与 `&nbsp;` 的空白还原成真实换行与空格 */
function restorePreformatted(el: Element): string {
  let out = ''
  const walk = (node: Nodes): void => {
    if (node.type === 'text') {
      out += node.value.replace(/\u00a0/g, ' ')
      return
    }
    if (node.type !== 'element') return
    if (tagName(node) === 'br') {
      out += '\n'
      return
    }
    for (const child of node.children) walk(child)
  }
  walk(el)
  // 代码块末尾的换行由围栏自己补
  return out.replace(/\n$/, '')
}

function codeLanguage(code: Element | null): string {
  if (!code) return ''
  for (const cls of classList(code)) {
    const match = cls.match(/^(?:language|lang)-(.+)$/)
    if (match) return match[1]
  }
  return ''
}

/** 围栏长度：内容里出现的反引号串必须比围栏短 */
function fenceFor(content: string): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length))
  return '`'.repeat(Math.max(3, longest + 1))
}

function renderPre(el: Element): string {
  const code = singleElementChild(el)
  const language = code && tagName(code) === 'code' ? codeLanguage(code) : ''
  const content = restorePreformatted(el)
  const fence = fenceFor(content)
  return `${fence}${language}\n${content}\n${fence}`
}

// ---- 列表 ---------------------------------------------------------------

function renderList(el: Element, ctx: InlineContext): string {
  const ordered = tagName(el) === 'ol'
  const start = Number(el.properties?.start ?? 1)
  const items: string[] = []
  let index = 0

  for (const child of el.children) {
    if (child.type !== 'element' || tagName(child) !== 'li') continue
    index++
    const marker = ordered ? `${start + index - 1}.` : '-'
    items.push(`${marker} ${renderListItem(child, ctx, marker.length + 1)}`)
  }
  return items.join('\n')
}

/**
 * 列表项内容。任务列表的 ✓ / □ 符号还原成 `[x]` / `[ ]`；
 * 项内嵌套列表另起行并按内容列缩进，其余块与首行合并。
 */
function renderListItem(li: Element, ctx: InlineContext, indentWidth: number): string {
  const blocks: string[] = []
  let first = true
  const children = stripListBullet(li.children)

  const push = (block: string): void => {
    const trimmed = block.trim()
    if (!trimmed) return
    if (first) {
      blocks.push(trimmed)
      first = false
      return
    }
    const indent = ' '.repeat(indentWidth)
    blocks.push(
      trimmed
        .split('\n')
        .map((line) => (line ? indent + line : line))
        .join('\n')
    )
  }

  /** 连续的 `**标题**：说明` 这类行内片段必须拼回同一行 */
  let inlineRun: ElementContent[] = []
  const flushInline = (): void => {
    if (inlineRun.length === 0) return
    push(renderInlineNodes(inlineRun, ctx))
    inlineRun = []
  }

  for (const child of children) {
    if (child.type === 'text') {
      inlineRun.push(child)
      continue
    }
    if (child.type !== 'element') continue
    const tag = tagName(child)

    if (tag === 'ul' || tag === 'ol') {
      flushInline()
      push(renderList(child, ctx))
      continue
    }
    if (tag === 'pre') {
      // 列表项里的代码块：必须按块级渲染，否则多行代码会被压成一行
      flushInline()
      push(renderPre(child))
      continue
    }
    if (tag === 'table') {
      flushInline()
      push(renderTable(child))
      continue
    }
    if (tag === 'blockquote') {
      flushInline()
      push(renderBlockquote(child, ctx))
      continue
    }
    if (tag === 'p') {
      // 段落是块级边界：结束当前行内片段，段落自身另起一块
      flushInline()
      push(renderInlineNodes(stripListBullet(child.children), ctx))
      continue
    }
    inlineRun.push(child)
  }
  flushInline()

  let body = blocks.join('\n')
  const task = taskState(li)
  if (task !== null) {
    body = body.replace(/^[✓□]\s*/, '')
    return `[${task ? 'x' : ' '}] ${body}`
  }
  return body
}

/**
 * 去掉列表项开头的项目符号。
 *
 * 主题为了让公众号端稳定显示，把 `list-style` 关掉后手工插入
 * `<span>• </span>` 作为圆点；还原成 Markdown 时这个符号必须丢掉，
 * 否则每项都会变成 `- • 第一项`。
 */
function stripListBullet(children: ElementContent[]): ElementContent[] {
  const result = [...children]
  // 跳过开头纯空白的文本节点
  let index = 0
  while (index < result.length) {
    const node = result[index]
    if (node.type === 'text' && node.value.trim() === '') {
      index++
      continue
    }
    break
  }
  const node = result[index]
  if (!node || node.type !== 'element' || tagName(node) !== 'span') return result
  if (!/^\s*[•·◦▪▫‣⁃]\s*$/.test(textOf(node))) return result
  result.splice(index, 1)
  // 圆点后紧跟的空格文本也一并去掉
  const next = result[index]
  if (next && next.type === 'text') {
    result[index] = { type: 'text', value: next.value.replace(/^\s+/, '') }
  }
  return result
}

/**
 * 任务列表勾选状态。渲染管线把 `<input type="checkbox">` 换成
 * ✓ / □ 文本符号，这里读第一个符号；不是任务项返回 null。
 */
function taskState(li: Element): boolean | null {
  const text = textOf(li).trimStart()
  if (text.startsWith('✓')) return true
  if (text.startsWith('□')) return false
  return null
}

// ---- 表格 ---------------------------------------------------------------

/**
 * 表格单元格内容。
 *
 * 单元格里可能有加粗、行内代码、链接甚至图片：直接取纯文本会把格式和
 * 图片一起丢掉。这里按行内规则渲染后压成单行——GFM 表格不允许换行。
 */
function cellText(el: Element): string {
  const inline = renderInlineNodes(el.children, { inLink: false })
  return inline
    .replace(/\u00a0/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    // 单元格内的换行标记（`<br>` 产生的行尾空格）压成空格
    .replace(/\s{2,}/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
}

function renderTable(el: Element): string {
  const rows: string[][] = []

  const walkRows = (node: Element): void => {
    for (const child of node.children) {
      if (child.type !== 'element') continue
      const tag = tagName(child)
      if (tag === 'tr') {
        const cells: string[] = []
        for (const cell of child.children) {
          if (cell.type !== 'element') continue
          const cellTag = tagName(cell)
          if (cellTag !== 'td' && cellTag !== 'th') continue
          cells.push(cellText(cell))
        }
        if (cells.length > 0) rows.push(cells)
      } else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
        walkRows(child)
      }
    }
  }
  walkRows(el)

  if (rows.length === 0) return ''

  const columns = Math.max(...rows.map((row) => row.length))
  const normalized = rows.map((row) => [...row, ...Array(columns - row.length).fill('')])
  const header = normalized[0]
  const body = normalized.slice(1)

  const line = (cells: string[]): string => `| ${cells.join(' | ')} |`
  const divider = `| ${header.map(() => '---').join(' | ')} |`
  return [line(header), divider, ...body.map(line)].join('\n')
}

// ---- 引用与 callout -----------------------------------------------------

/** 逐行加 `> ` 前缀；空行输出裸 `>`，保持引用块连续 */
function quoteLines(text: string): string {
  return text
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n')
}

function renderBlockquote(el: Element, ctx: InlineContext): string {
  const body = renderBlocks(el.children, ctx).trim()
  return body ? quoteLines(body) : ''
}

/**
 * callout 卡片 → `> [!type] 标题` + 正文。
 * 卡片由 buildCalloutCard 生成：section 带左侧竖线、背景色与圆角，
 * 首个 p 是带颜色的标题。颜色对不上时按普通容器处理。
 */
function renderCalloutCard(el: Element, ctx: InlineContext): string | null {
  const style = parseStyle(el)
  const border = style['border-left'] || style['border-left-color'] || ''
  const borderColor = border.includes('solid') ? border.split(/\s+/).pop() ?? '' : border
  const type = calloutTypeByCard(borderColor, style['background'] || '')
  if (!type) return null

  const children = meaningfulChildren(el)
  if (children.length === 0) return null

  let title = ''
  let start = 0
  const first = children[0]
  if (first.type === 'element' && tagName(first) === 'p') {
    title = renderInlineNodes(first.children, ctx).trim()
    start = 1
  }

  const body = renderBlocks(children.slice(start), ctx).trim()
  const header = `> [!${type}]${title ? ` ${title}` : ''}`
  return body ? `${header}\n${quoteLines(body)}` : header
}

// ---- 块级渲染 -----------------------------------------------------------

/** 渲染任意子节点序列：连续行内节点合成一个段落 */
function renderBlocks(nodes: ElementContent[], ctx: InlineContext): string {
  const blocks: string[] = []
  let inlineRun: ElementContent[] = []

  const flush = (): void => {
    if (inlineRun.length === 0) return
    const text = renderInlineNodes(inlineRun, ctx).trim()
    inlineRun = []
    if (text) blocks.push(text)
  }

  for (const node of nodes) {
    if (isInlineNode(node)) {
      // 纯空白只在行内片段之间有连接意义，片段为空时自然被丢掉
      inlineRun.push(node)
      continue
    }
    flush()
    const block = renderBlockElement(node as Element, ctx)
    if (block) blocks.push(block)
  }
  flush()

  return blocks.join('\n\n')
}

function renderBlockElement(el: Element, ctx: InlineContext): string {
  if (isHidden(el)) return ''

  const tag = tagName(el)

  if (el.properties?.['data-bm-math'] === 'block') {
    const tex = textOf(el).trim()
    return tex ? `$$\n${tex}\n$$` : ''
  }

  if (HEADING_TAGS.has(tag)) {
    const text = renderInlineNodes(el.children, ctx).trim()
    return text ? `${'#'.repeat(Number(tag[1]))} ${text}` : ''
  }

  if (tag === 'p') return escapeBlockLeading(renderInlineNodes(el.children, ctx).trim())
  if (tag === 'pre') return renderPre(el)
  if (tag === 'ul' || tag === 'ol') return renderList(el, ctx)
  if (tag === 'table') return renderTable(el)
  if (tag === 'blockquote') return renderBlockquote(el, ctx)
  if (tag === 'hr') return '---'
  if (tag === 'br') return ''
  if (tag === 'img') return renderImage(el)

  if (tag === 'section' || tag === 'div') {
    const card = renderCalloutCard(el, ctx)
    if (card) return card
    return renderBlocks(el.children, ctx)
  }

  // 其余容器（figure / details / dl / 未知自定义标签）继续向下拆
  return renderBlocks(el.children, ctx)
}

// ---- 公式还原 -----------------------------------------------------------

function findFirstElement(el: Element, predicate: (el: Element) => boolean): Element | null {
  for (const child of el.children) {
    if (child.type !== 'element') continue
    if (predicate(child)) return child
    const nested = findFirstElement(child, predicate)
    if (nested) return nested
  }
  return null
}

/** 在 KaTeX 结构里找 TeX 原文（mathml 的 annotation 节点） */
function findTexAnnotation(el: Element): string | null {
  const annotation = findFirstElement(el, (child) => tagName(child) === 'annotation')
  return annotation ? textOf(annotation).trim() : null
}

/**
 * 把 KaTeX 生成的公式结构换成带标记的文本节点。
 *
 * 公式在 Markdown 源码里是 `$…$` / `$$…$$`，但草稿里是一大坨带样式的
 * span。先整块替换成 `data-bm-math` 元素，行内/块级渲染时再输出源码。
 * 没有 annotation 的 MathML 兜底内容整块丢弃，避免正文混入公式排版文本。
 */
function replaceMath(nodes: ElementContent[]): ElementContent[] {
  const out: ElementContent[] = []
  for (const node of nodes) {
    if (node.type !== 'element') {
      out.push(node)
      continue
    }
    const classes = classList(node)
    if (classes.includes('katex') || classes.includes('katex-display')) {
      const tex = findTexAnnotation(node)
      if (tex) {
        const display = classes.includes('katex-display')
        out.push({
          type: 'element',
          tagName: 'span',
          properties: { 'data-bm-math': display ? 'block' : 'inline' },
          children: [{ type: 'text', value: tex }]
        })
        continue
      }
    }
    if (classes.includes('katex-mathml') || classes.includes('katex-html')) {
      continue
    }
    out.push({ ...node, children: replaceMath(node.children) })
  }
  return out
}

/**
 * 图片 src 改写：把微信 CDN 地址换成下载后的 vault 路径。
 *
 * 改写结果统一写回 `src` 并清掉 `data-src`：草稿里的懒加载写法到笔记里
 * 没有意义，保留两份地址还会让后续处理拿错来源。
 */
function rewriteImages(
  nodes: ElementContent[],
  rewrite?: HtmlToMarkdownOptions['rewriteImageSrc']
): void {
  if (!rewrite) return
  for (const node of nodes) {
    if (node.type !== 'element') continue
    if (tagName(node) === 'img') {
      const src = imageSrcOf(node)
      if (src) {
        const next = rewrite(src)
        if (next) {
          const props = node.properties ?? {}
          // hast 里 data-src 被转成 dataSrc，两种写法都要清掉
          const { 'data-src': _dropped, dataSrc: _dropped2, ...rest } = props
          node.properties = { ...rest, src: next }
        }
      }
    }
    rewriteImages(node.children, rewrite)
  }
}

// ---- 收尾清理 -----------------------------------------------------------

/**
 * 收尾清理：
 * - 连续空行压成一个
 * - 行尾空白去掉（围栏代码块内部保留）
 */
export function cleanupMarkdown(markdown: string): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  let fence: string | null = null

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      if (fence === null) {
        fence = fenceMatch[1]
      } else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null
      }
      out.push(line)
      continue
    }
    out.push(fence !== null ? line : line.replace(/[ \t]+$/, ''))
  }

  const compacted: string[] = []
  for (const line of out) {
    if (line === '' && compacted[compacted.length - 1] === '') continue
    compacted.push(line)
  }

  return compacted.join('\n').trim()
}

/**
 * 还原入口。
 *
 * @param html 草稿正文 HTML
 * @param options 图片地址改写等选项
 */
export function htmlToMarkdown(html: string, options: HtmlToMarkdownOptions = {}): string {
  if (!html.trim()) return ''

  const root = fromHtml(html, { fragment: true })

  // 公式先还原成带标记的文本，后续按普通文本处理
  const prepared = replaceMath(root.children.filter(isElementContent))
  rewriteImages(prepared, options.rewriteImageSrc)

  return cleanupMarkdown(renderBlocks(prepared, { inLink: false }))
}

/** doctype 等在正文里没有意义，过滤后统一成 ElementContent */
function isElementContent(node: ElementContent | { type: string }): node is ElementContent {
  return node.type === 'text' || node.type === 'comment' || node.type === 'element'
}
