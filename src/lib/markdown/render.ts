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
import { getMarkdownStyleCss } from '../../themes/markdown-style'
import { getCodeThemeCss } from '../../themes/code-theme'

export type Platform = 'wechat' | 'zhihu' | 'toutiao' | 'xiaohongshu' | 'html'

export interface RenderOptions {
  markdown: string
  markdownStyle?: string
  codeTheme?: string
  customCss?: string
  enableFootnoteLinks?: boolean
  openLinksInNewWindow?: boolean
  platform?: Platform
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

interface ProcessorOptions {
  enableFootnoteLinks?: boolean
  openLinksInNewWindow?: boolean
  platform?: Platform
}

function createProcessor(options: ProcessorOptions) {
  const { openLinksInNewWindow = true } = options

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
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

export async function render(options: RenderOptions): Promise<string> {
  const {
    markdown,
    markdownStyle = 'ayu-light',
    codeTheme = 'github',
    customCss = '',
    enableFootnoteLinks = true,
    openLinksInNewWindow = true,
    platform = 'html',
  } = options

  const processor = createProcessor({ enableFootnoteLinks, openLinksInNewWindow, platform })
  const html = (await processor.process(markdown)).toString()

  const wrapped = `<section id="bm-md">${html}</section>`

  // Combine all CSS: markdown style + code theme + custom CSS
  const markdownStyleCss = getMarkdownStyleCss(markdownStyle)
  const codeThemeCss = getCodeThemeCss(codeTheme)
  const combinedCss = [markdownStyleCss, codeThemeCss, customCss].filter(Boolean).join('\n')

  if (!combinedCss) {
    return wrapped
  }

  try {
    return juice.inlineContent(wrapped, combinedCss, {
      inlinePseudoElements: true,
      preserveImportant: true,
    })
  } catch (error) {
    console.error('Juice inline error:', error)
    return wrapped
  }
}
