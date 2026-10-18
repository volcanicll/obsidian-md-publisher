import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkFrontmatter from 'remark-frontmatter'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeExternalLinks from 'rehype-external-links'
import rehypeStringify from 'rehype-stringify'
import juice from 'juice'
import katexCss from 'katex/dist/katex.min.css'
import { getMarkdownStyleCss, getPairedCodeTheme, type MarkdownStyle } from '../../themes/markdown-style'
import {
  DEFAULT_CODE_THEME,
  getCodeThemeCss,
  resolveCodeThemeId,
} from '../../themes/code-theme'
import { transformCallouts } from './callouts'
import { renderMermaidBlocks } from './mermaid'
import { isImagePath } from './embeds'
import { cleanFootnotes, preserveCodeBlocks, replaceMarkTags, stabilizeLists, transformTaskLists, wrapWideTables } from './post-process'

export interface RenderOptions {
  markdown: string
  markdownStyle?: string
  codeTheme?: string
  customCss?: string
  openLinksInNewWindow?: boolean
  /** vault 导入的自定义主题，用于解析 file: 前缀的主题 id */
  customThemes?: MarkdownStyle[]
  /**
   * 是否把单个 `$...$` 解析为行内公式。
   * 默认关闭：`$10 到 $20`、`$HOME`、`A=$1` 这类金额与 Shell 变量远比行内公式常见，
   * 而单个美元符号的公式语法会把它们当公式重排，改写正文。
   * 块级 `$$...$$` 不受此开关影响，始终可用。
   */
  inlineDollarMath?: boolean
}

/**
 * 将 Obsidian wiki 语法转换为标准 Markdown：
 *
 * - 图片嵌入 `![[path.png]]` / `![[path.png|300]]` → `![](path.png)`，
 *   供后续图片处理管线识别；尺寸后缀被丢弃，尺寸交给主题 CSS 统一控制。
 * - 笔记嵌入 `![[笔记名]]` → 纯文本（发布侧不支持笔记嵌入时兜底；
 *   正常流程已由 resolveNoteEmbeds 先行替换，这里只处理漏网情况）。
 * - 行内链接 `[[笔记]]` / `[[笔记|别名]]` / `[[笔记#标题]]` → 可读文本。
 *   公众号不支持 vault 内部跳转，保留方括号只会让正文出现 `[[…]]` 源码。
 *
 * 代码块与行内代码中的 wiki 语法保持原样，不做转换。
 */
export function convertWikiEmbeds(markdown: string): string {
  const lines = markdown.split('\n')
  let inFence = false
  let fenceMarker = ''
  let fenceLength = 0

  const converted = lines.map((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!inFence) {
        inFence = true
        fenceMarker = marker
        fenceLength = fenceMatch[1].length
      } else if (marker === fenceMarker && fenceMatch[1].length >= fenceLength) {
        inFence = false
      }
      return line
    }
    if (inFence) return line

    // 保护行内代码片段
    return line
      .split(/(`[^`]*`)/)
      .map((part) =>
        part.length > 1 && part.startsWith('`') && part.endsWith('`')
          ? part
          : part
              .replace(
                /!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g,
                (_m, path: string, alias?: string) => {
                  // 非图片的笔记嵌入漏到这里时降级为文字，别名优先；
                  // 不能当成图片渲染（会产生指向笔记文件的裂图）
                  if (!isImagePath(path)) return wikiLinkText(path, alias)
                  // 链接目标中的空格必须编码，否则 CommonMark 不会将其解析为图片
                  return `![](${path.trim().replace(/ /g, '%20')})`
                }
              )
              .replace(
                /\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g,
                (_m, target: string, alias?: string) => wikiLinkText(target, alias)
              )
      )
      .join('')
  })
  return converted.join('\n')
}

/**
 * wiki 链接的展示文本：优先别名；`笔记#标题` 显示为「笔记 > 标题」。
 * `.md` 后缀与目标里的多余空白一并去掉。
 */
function wikiLinkText(target: string, alias?: string): string {
  const raw = (alias ?? target).trim()
  if (!raw) return ''
  const [note, ...headings] = raw.split('#')
  const parts = [note.replace(/\.md$/i, '').trim(), ...headings.map((h) => h.trim())].filter(
    Boolean
  )
  return parts.join(' > ')
}

/**
 * Obsidian 高亮语法 `==文本==` → `<mark>`。
 * 公众号正文没有 `==` 语法，原样输出会让高亮标记直接出现在文章里。
 * 代码块与行内代码内的 `==` 保持原样（如 shell 比较运算）；
 * `a == b` 这类两侧带空格的比较写法也不收——Obsidian 自身不会高亮它。
 */
export function convertHighlights(markdown: string): string {
  const lines = markdown.split('\n')
  let inFence = false
  let fenceMarker = ''
  let fenceLength = 0

  const converted = lines.map((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!inFence) {
        inFence = true
        fenceMarker = marker
        fenceLength = fenceMatch[1].length
      } else if (marker === fenceMarker && fenceMatch[1].length >= fenceLength) {
        inFence = false
      }
      return line
    }
    if (inFence) return line

    return line
      .split(/(`[^`]*`)/)
      .map((part) =>
        part.length > 1 && part.startsWith('`') && part.endsWith('`')
          ? part
          : part.replace(
              /(^|[^=])==([^=\s](?:[^=\n]*?[^=\s])?)==(?!=)/g,
              (_m, lead: string, text: string) => `${lead}<mark>${text}</mark>`
            )
      )
      .join('')
  })
  return converted.join('\n')
}

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...(defaultSchema.protocols || {}),
    href: ['http', 'https', 'mailto', 'tel'],
  },
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'svg',
    'path',
    'figcaption',
    'section',
    'mark',
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a || []), 'target', 'rel'],
    div: [...(defaultSchema.attributes?.div || []), 'className'],
    section: [...(defaultSchema.attributes?.section || []), 'className'],
    p: [...(defaultSchema.attributes?.p || []), 'className'],
    svg: ['className', 'viewBox', 'version', 'width', 'height', 'ariaHidden'],
    path: ['d'],
  },
}

function createProcessor(options: {
  openLinksInNewWindow?: boolean
  inlineDollarMath?: boolean
}) {
  const { openLinksInNewWindow = true, inlineDollarMath = false } = options

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    // singleDollarTextMath: false 让 `$10 到 $20`、`A=$1 B=$2` 保持普通文本；
    // 块级 $$...$$ 与行内 $$...$$ 仍按公式解析
    .use(remarkMath, { singleDollarTextMath: inlineDollarMath })
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkRehype, {
      allowDangerousHtml: true,
      footnoteLabel: '脚注',
      footnoteBackLabel: '返回正文',
      footnoteLabelTagName: 'h4',
    })

  if (openLinksInNewWindow) {
    processor.use(rehypeExternalLinks, {
      target: '_blank',
      rel: ['noreferrer', 'noopener'],
    })
  }

  processor
    .use(rehypeRaw)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeKatex)
    .use(rehypeHighlight)
    .use(rehypeStringify, { allowDangerousHtml: true })

  return processor
}

/**
 * KaTeX 公式样式。@font-face 规则（指向 KaTeX 字体文件）在
 * 公众号文章中无法内联加载，且发布目标平台不提供这些字体，
 * 因此先移除，公式会用回退字体栈渲染。
 */
const katexStyle = katexCss.replace(/@font-face\s*\{[^}]*\}/g, '')

export async function render(options: RenderOptions): Promise<string> {
  const {
    markdown,
    markdownStyle = 'mist',
    customCss = '',
    openLinksInNewWindow = true,
    customThemes = [],
    inlineDollarMath = false,
  } = options
  // 未显式指定代码主题时跟随排版主题的配套配色，避免深色代码块配浅色高亮
  const codeTheme = resolveCodeThemeId(
    options.codeTheme,
    getPairedCodeTheme(markdownStyle, customThemes) ?? DEFAULT_CODE_THEME
  )

  const processor = createProcessor({ openLinksInNewWindow, inlineDollarMath })
  let html = (
    await processor.process(convertHighlights(convertWikiEmbeds(markdown)))
  ).toString()

  // Mermaid 图表转位图（依赖 DOM；失败时保留代码块）
  html = await renderMermaidBlocks(html)
  // Obsidian Callout 转公众号卡片（内联样式，需在 sanitize 后、juice 前注入）
  html = transformCallouts(html)
  // 任务列表复选框改为文本符号（公众号会过滤 <input>）
  html = transformTaskLists(html)
  // 移除无法跳转的脚注锚点与回跳链接
  html = cleanFootnotes(html)
  // 列数多的表格包进横向滚动容器（需在 juice 前注入容器，样式随主题内联）
  html = wrapWideTables(html)
  // 代码块里的换行与缩进固化成 <br> / &nbsp;：文章页不认 white-space: pre
  html = preserveCodeBlocks(html)

  const wrapped = `<section id="bm-md">${html}</section>`

  // Combine all CSS: KaTeX + markdown style + code theme + custom CSS
  const markdownStyleCss = getMarkdownStyleCss(markdownStyle, customThemes)
  const codeThemeCss = getCodeThemeCss(codeTheme)
  const combinedCss = [katexStyle, markdownStyleCss, codeThemeCss, customCss]
    .filter(Boolean)
    .join('\n')

  if (!combinedCss) {
    return stabilizeLists(replaceMarkTags(wrapped))
  }

  try {
    const inlined = juice.inlineContent(wrapped, combinedCss, {
      inlinePseudoElements: true,
      preserveImportant: true,
    })
    // 高亮样式已随主题内联，最后把 <mark> 换成公众号保留的 <span>，
    // 并整理列表，避免公众号保存草稿时插入空条目、把条目文字拆行
    return stabilizeLists(replaceMarkTags(inlined))
  } catch (error) {
    console.error('Juice inline error:', error)
    return stabilizeLists(replaceMarkTags(wrapped))
  }
}
