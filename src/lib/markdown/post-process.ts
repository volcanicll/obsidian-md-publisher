/**
 * 渲染后的 HTML 后处理：把公众号不支持的标签与属性换成语义等价的写法。
 *
 * 处理时机在 sanitize 之后、juice 内联之前（与 callouts 一致），
 * 产物全部使用内联样式，不依赖 class。
 */

/** 任务列表复选框字符：勾选状态用对勾，未勾选用空心方框 */
const CHECKED_MARK = '✓'
const UNCHECKED_MARK = '□'

const CHECKBOX_RE = /<input[^>]*type="checkbox"[^>]*>/gi

/**
 * 任务列表复选框 → 文本符号。
 *
 * GFM 任务列表渲染为 `<input type="checkbox" disabled>`，公众号编辑器会
 * 过滤 `<input>`，结果是 `- [x]` 与 `- [ ]` 在文章里看不出区别。
 * 换成 ✓ / □ 并区分明暗（勾选加深、未勾选留灰），勾选状态才可靠地
 * 传递到公众号。颜色用中性灰阶，不随主题变化，避免与任何一套配色冲突。
 */
export function transformTaskLists(html: string): string {
  return html.replace(CHECKBOX_RE, (tag) => {
    const checked = /\bchecked\b/i.test(tag)
    const color = checked ? '#3f4a54' : '#a8b2bb'
    return (
      `<span style="display:inline-block;width:1.1em;margin-right:0.4em;` +
      `color:${color};font-weight:700;text-align:center;">${checked ? CHECKED_MARK : UNCHECKED_MARK}</span>`
    )
  })
}

/** 正文里的脚注角标引用：`<a ... data-footnote-ref ...>1</a>` */
const FOOTNOTE_REF_RE = /<a\b[^>]*data-footnote-ref[^>]*>([\s\S]*?)<\/a>/gi

/** 脚注区末尾的回跳链接：`<a ... data-footnote-backref ...>↩</a>` */
const FOOTNOTE_BACKREF_RE =
  /[\t ]*<a\b[^>]*data-footnote-backref[^>]*>[\s\S]*?<\/a>/gi

/**
 * 清洗脚注结构。
 *
 * remark-rehype 会给脚注生成 `href="#user-content-fn-1"` 的页内锚点与
 * `↩` 回跳链接。公众号不支持页内跳转，链接点不动，`↩` 还会作为乱码
 * 字符出现在脚注末尾。这里去掉回跳链接、把角标引用展开成纯文字，
 * 脚注内容本身仍然完整可读。
 */
export function cleanFootnotes(html: string): string {
  if (!/data-footnote-ref|data-footnote-backref/.test(html)) {
    return html
  }

  return html
    // 角标引用：保留数字，去掉无法跳转的锚点
    .replace(FOOTNOTE_REF_RE, (_m, text: string) => text)
    // 回跳链接连同前面的空格整个移除，正文末尾不留多余空白
    .replace(FOOTNOTE_BACKREF_RE, '')
}

/**
 * `<mark>` → `<span>`。
 *
 * 公众号编辑器会过滤 `<mark>`（连同里层文字一起丢失），高亮内容就
 * 直接不见了。juice 已把主题的高亮样式内联进 style 属性，换成
 * `<span>` 后外观不变、内容安全保留。
 * 只处理标签本身，属性原样带过去。
 */
export function replaceMarkTags(html: string): string {
  return html
    .replace(/<mark(\s[^>]*)?>/gi, (_m, attrs?: string) => `<span${attrs ?? ''}>`)
    .replace(/<\/mark>/gi, '</span>')
}

/**
 * 让列表经得起公众号后台的保存逻辑。
 *
 * 两个独立的改写，都在真实草稿回读里验证过：
 *
 * 1. 去掉列表标签之间的空白。渲染器输出 `<ol>\n<li>…</li>\n</ol>`，浏览器
 *    里没问题，但公众号保存草稿时会把空白文本节点也当成一个条目，给每个
 *    真实条目前后插进 `<li><section><span leaf=""><br></span></section></li>`，
 *    正文于是冒出一串空编号，真实条目被挤到偶数位（2、4、6…）。
 * 2. 把 `<li>` 里的裸文本包进 `<span>`。编辑器会把列表项里没被行内标签
 *    包住的文字塞进块级 `<section>`，块级元素另起一行，条目的加粗小标题
 *    就和后面的说明断成两行。
 *
 * 只处理 `ul` / `ol` / `li` 边界，正文中英文之间的空格不受影响。
 */
export function stabilizeLists(html: string): string {
  const compacted = html
    .replace(/\s+(<li\b)/gi, '$1')
    .replace(/\s+(<\/li>)/gi, '$1')
    .replace(/\s+(<\/?(?:ul|ol)\b)/gi, '$1')

  return wrapListText(compacted)
}

/**
 * 包住列表项裸文本的 span 必须带内联样式。
 *
 * 无属性的 `<span>` 会被公众号编辑器当作无意义包装整个剥掉，文字重新变成
 * 直接挂在 `<li>` 下的裸文本，随后又被塞进块级 `<section>`——条目的加粗
 * 小标题与后面的说明就断成两行。真实草稿回读里，带 style 的 span（列表
 * 圆点 `color: currentColor; font-weight: 700`）全部保留，无属性的 span
 * 一个不剩，因此这里用两条声明做「防剥离」标记：
 *
 * - `color: currentColor` 已被真实回读证明能存活，且不改变继承来的颜色；
 * - `display: inline` 明确保持行内，万一前者被清洗掉仍能兜住排版。
 */
export const LIST_TEXT_SPAN_STYLE = 'display: inline; color: currentColor'

/**
 * 把直接挂在 `<li>` 下的裸文本包进 `<span>`，已处于行内标签内的文字不再处理。
 *
 * 编辑器只对「直接挂在 li / section 下的文字」做块级包装，行内标签里的
 * 文字本来就不受影响；重复嵌套反而可能改变 strong / code 的排版。
 * 用标签栈判断当前位置，嵌套列表里的文字仍归各自的内层 li。
 */
function wrapListText(html: string): string {
  const stack: string[] = []
  return html.replace(/(<[^>]+>)|([^<]+)/g, (match, tag?: string, text?: string) => {
    if (tag !== undefined) {
      if (tag.startsWith('</')) {
        const name = tag.slice(2).replace(/[\s>].*$/, '').toLowerCase()
        const index = stack.lastIndexOf(name)
        // 找到就回退到该层之前，未闭合的残留标签一并清掉
        if (index >= 0) stack.length = index
        return tag
      }
      if (!/\/>$/.test(tag) && !VOID_TAGS.test(tag)) {
        stack.push(tag.slice(1).replace(/[\s/>].*$/, '').toLowerCase())
      }
      return tag
    }
    // 纯空白保持原样，避免把条目首尾的换行变成可见空格
    if (text && text.trim() && stack[stack.length - 1] === 'li') {
      return `<span style="${LIST_TEXT_SPAN_STYLE}">${text}</span>`
    }
    return match
  })
}

const VOID_TAGS = /^<(?:br|img|hr|input|source)\b/i

const PRE_RE = /<pre\b[^>]*>[\s\S]*?<\/pre>/gi
const CODE_IN_PRE_RE = /(<code\b[^>]*>)([\s\S]*?)(<\/code>)/gi

/**
 * 让代码块在公众号文章页保持原样。
 *
 * 草稿接口会原样保存 `<pre>` 里的换行与缩进，但文章页渲染时 `white-space:
 * pre` 并不生效——所有换行被折叠成普通空格，整段代码按容器宽度重新折行，
 * 缩进也随之错位。ASCII 架构图因此彻底散架（10 行被拼成一段）。
 *
 * 既然不能依赖 CSS，就把空白固化成结构：换行写成 `<br>`、行首缩进写成
 * `&nbsp;`。`<br>` 在任何样式下都会断行，`&nbsp;` 也不会被折叠，代码块
 * 于是与预览逐字符对齐。
 *
 * 只处理 `<pre><code>` 里的文本，不动行内 `<code>`：后者本来就该随正文
 * 折行。代码高亮生成的 `<span>` 标签原样保留。
 */
export function preserveCodeBlocks(html: string): string {
  return html.replace(PRE_RE, (pre) =>
    pre.replace(CODE_IN_PRE_RE, (_m, open: string, body: string, close: string) =>
      open + hardenPreformatted(body) + close
    )
  )
}

/**
 * 把代码文本里的空白转成不可折叠的形式。
 *
 * 只改标签之外的文本：代码高亮生成的 `<span>` 必须原样保留。
 * 换行 → `<br>`；制表符按 4 空格展开（微信不会保留 tab 宽度）；其余空格
 * 全部转 `&nbsp;`，连续缩进才不会被 HTML 的空白折叠规则吃掉。
 *
 * 去掉块尾多余的一个换行——否则 `</code>` 前会多出一个 `<br>`，
 * 每个代码块底部都多出一条空行。
 */
function hardenPreformatted(body: string): string {
  const trimmed = body.replace(/\n$/, '')
  return trimmed.replace(/(<[^>]+>)|([^<]+)/g, (match, tag?: string, text?: string) => {
    if (tag !== undefined) return tag
    return text!
      .replace(/\t/g, '    ')
      .replace(/ /g, '&nbsp;')
      .replace(/\n/g, '<br>')
  })
}

/** 达到这个列数的表格在手机宽度下会被压到不可读，需要保留最小宽度 */
export const WIDE_TABLE_COLUMNS = 4
/** 宽表格每列保留的最小宽度（含单元格内边距），约合 7 个汉字 */
const WIDE_TABLE_COLUMN_WIDTH = 115

const TABLE_RE = /<table\b[^>]*>[\s\S]*?<\/table>/gi
const FIRST_ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/i
const CELL_RE = /<t[hd]\b/gi

/**
 * 表格兜底：包一层横向滚动容器，列数多的再给最小宽度。
 *
 * 手机正文区只有约 300px 宽，4 列时每列不足 80px，表头与正文会被压成
 * 一行两三个字。宽表格给一个最小宽度，由外层容器横向滚动查看；窄表格
 * 不加最小宽度，正常铺满正文宽度。容器对窄表格不产生滚动，纯粹是兜底——
 * 少数单元格（长 URL、长变量名）本身撑宽时不会顶破正文。
 *
 * 最小宽度写成内联样式而不是依赖属性选择器——公众号保存草稿时会丢掉
 * `data-*` 属性，但会保留 style。
 */
export function wrapWideTables(html: string): string {
  return html.replace(TABLE_RE, (table) => {
    const columns = countTableColumns(table)
    const styled =
      columns >= WIDE_TABLE_COLUMNS
        ? withMinWidth(table, columns * WIDE_TABLE_COLUMN_WIDTH)
        : table
    return `<section data-bm-table-scroll="1">${styled}</section>`
  })
}

/** 写入 min-width；表格已带 style 时并入，避免出现重复属性 */
function withMinWidth(table: string, minWidth: number): string {
  const declaration = `min-width: ${minWidth}px;`
  const opening = table.match(/^<table\b[^>]*>/i)?.[0]
  if (!opening) return table

  if (/\bstyle\s*=\s*"/i.test(opening)) {
    const patched = opening.replace(
      /\bstyle\s*=\s*"/i,
      (match) => `${match}${declaration} `
    )
    return patched + table.slice(opening.length)
  }
  return `<table style="${declaration}">` + table.slice(opening.length)
}

function countTableColumns(table: string): number {
  const row = table.match(FIRST_ROW_RE)
  if (!row) return 0
  return (row[1].match(CELL_RE) ?? []).length
}
