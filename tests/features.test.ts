import { describe, it, expect, afterEach } from 'vitest'
import { render } from '../src/lib/markdown/render'
import {
  resolveNoteEmbeds,
  sliceByHeadings,
  toQuoteBlock,
  toMissingEmbedBlock,
  isImagePath
} from '../src/lib/markdown/embeds'
import {
  extractLinks,
  scanSensitiveWords,
  stripHtmlTags,
  checkLinks,
  BUILTIN_SENSITIVE_WORDS
} from '../src/lib/wechat/validation'
import { extractDataUrlImages, decodeDataUrl } from '../src/lib/image-processor'
import { parseThemeName, customThemeId } from '../src/lib/custom-themes'
import { getAllMarkdownStyles, getMarkdownStyleCss } from '../src/themes/markdown-style'
import { setRequestUrlMock } from './obsidian-stub'

// validation.ts 等模块按 Obsidian 渲染进程约定使用 window.setTimeout；
// node 测试环境补上全局 window 指向，使行为一致
;(globalThis as Record<string, unknown>).window = globalThis

describe('callout conversion', () => {
  it('converts a callout blockquote into an inline-styled card', async () => {
    const md = '> [!note] 注意事项\n> 这是提示内容\n\n普通段落'
    const html = await render({ markdown: md })
    expect(html).not.toContain('<blockquote')
    expect(html).toContain('注意事项')
    expect(html).toContain('这是提示内容')
    expect(html).toContain('border-left:4px solid')
    expect(html).toContain('style=')
    expect(html).toContain('普通段落')
  })

  it('uses the type label as title when no title given', async () => {
    const md = '> [!warning]\n> 小心'
    const html = await render({ markdown: md })
    expect(html).toContain('警告')
    expect(html).toContain('小心')
  })

  it('resolves aliases to the main type', async () => {
    const md = '> [!caution] 别名\n> 内容'
    const html = await render({ markdown: md })
    // caution 归并到 warning 的配色，标题仍是用户文案
    expect(html).toContain('border-left:4px solid #d07815')
    expect(html).toContain('别名')
  })

  it('renders collapsed callouts as title-only cards', async () => {
    const md = '> [!tip]- 折叠内容\n> 正文不应出现'
    const html = await render({ markdown: md })
    expect(html).toContain('折叠内容')
    expect(html).not.toContain('正文不应出现')
  })

  it('supports fold marker inside the brackets', async () => {
    const md = '> [!tip-] 括号内折叠\n> 正文不应出现'
    const html = await render({ markdown: md })
    expect(html).toContain('括号内折叠')
    expect(html).not.toContain('正文不应出现')
  })

  it('is case-insensitive like Obsidian', async () => {
    const md = '> [!NOTE] 大写类型\n> 内容不应丢失'
    const html = await render({ markdown: md })
    expect(html).not.toContain('<blockquote')
    expect(html).toContain('border-left:4px solid')
    expect(html).toContain('大写类型')
    expect(html).toContain('内容不应丢失')
  })

  it('leaves normal blockquotes untouched', async () => {
    const md = '> 普通引用\n\n> [!info] 卡片'
    const html = await render({ markdown: md })
    expect(html).toContain('<blockquote')
    expect(html).toContain('普通引用')
    // info 配色应用到卡片
    expect(html).toContain('border-left:4px solid #3f8ec4')
  })
})

describe('mermaid fallback', () => {
  it('keeps mermaid blocks as code in non-DOM environments', async () => {
    const md = '```mermaid\nflowchart TD\n  A --> B\n```'
    const html = await render({ markdown: md })
    expect(html).toContain('language-mermaid')
    expect(html).not.toContain('<img')
  })
})

describe('note embeds', () => {
  it('detects image paths vs note paths', () => {
    expect(isImagePath('assets/photo.png')).toBe(true)
    expect(isImagePath('photo.PNG')).toBe(true)
    expect(isImagePath('我的笔记')).toBe(false)
    expect(isImagePath('笔记#标题')).toBe(false)
  })

  it('slices content by heading path', () => {
    const content = [
      '# A',
      'a body',
      '## A1',
      'a1 body',
      '### A1x',
      'deep',
      '## A2',
      'a2 body',
      '# B'
    ].join('\n')
    expect(sliceByHeadings(content, ['A1'])).toBe('## A1\na1 body\n### A1x\ndeep')
    expect(sliceByHeadings(content, ['A'])).toContain('# A')
    expect(sliceByHeadings(content, ['不存在'])).toBeNull()
    expect(sliceByHeadings(content, [])).toBe(content)
  })

  it('ignores # lines inside fenced code blocks', () => {
    const content = [
      '# Setup',
      '## Real',
      'real body',
      '```bash',
      '# Setup',
      'echo inside fence',
      '```',
      '## Next'
    ].join('\n')
    // 代码块内的 "# Setup" 不是标题：切片必须从真正的 "# Setup" 开始，
    // 并延伸到下一个同级（H1）标题或文末 —— "## Next" 是 H2，属于其章节
    const sliced = sliceByHeadings(content, ['Setup'])
    expect(sliced).toBe(content)
    expect(sliceByHeadings(content, ['Real'])).toBe('## Real\nreal body\n```bash\n# Setup\necho inside fence\n```')
  })

  it('resolves note embeds into quote blocks', async () => {
    const md = '正文开始\n\n![[读书笔记]]\n\n![[读书笔记#要点]]\n\n![[photo.png]]'
    const resolver = async (target: string) => {
      if (target === '读书笔记') {
        return { content: '# 读书笔记\n\n这是嵌入的内容' }
      }
      if (target === '读书笔记#要点') {
        return { content: '## 要点\n- 第一条' }
      }
      return null
    }
    const out = await resolveNoteEmbeds(md, resolver)
    expect(out).toContain('【嵌入笔记】读书笔记')
    expect(out).toContain('> 这是嵌入的内容')
    expect(out).toContain('## 要点')
    // 图片嵌入应原样保留给图片管线
    expect(out).toContain('![[photo.png]]')
  })

  it('inserts a placeholder for unresolved notes', async () => {
    const out = await resolveNoteEmbeds('![[不存在的笔记]]', async () => null)
    expect(out).toContain('未在 vault 中找到该笔记')
  })

  it('leaves embeds inside code fences untouched', async () => {
    const md = '```\n![[读书笔记]]\n```'
    const out = await resolveNoteEmbeds(md, async () => ({ content: 'x' }))
    expect(out).toContain('![[读书笔记]]')
  })

  it('formats quote blocks and placeholders', () => {
    const quote = toQuoteBlock('笔记', '第一行\n\n第二行')
    expect(quote.split('\n').every((l) => l.startsWith('>') || l === '')).toBe(true)
    expect(toMissingEmbedBlock('X')).toContain('未在 vault 中找到该笔记')
  })
})

describe('link validation', () => {
  afterEach(() => {
    setRequestUrlMock(null)
  })

  it('extracts unique http links from html', () => {
    const html =
      '<a href="https://a.com">1</a><a href="https://a.com">2</a>' +
      '<a href="mailto:x@y.com">m</a><a href="/relative">r</a>'
    expect(extractLinks(html)).toEqual(['https://a.com'])
  })

  it('strips html tags', () => {
    expect(stripHtmlTags('<p>你好</p><b>世界</b>')).toContain('你好')
    expect(stripHtmlTags('<p>你好</p><b>世界</b>')).not.toContain('<')
  })

  it('checks links with HEAD and reports failures', async () => {
    setRequestUrlMock(async (param) => {
      if (param.url === 'https://ok.com') {
        return { json: '', status: 200 } as never
      }
      throw new Error('DNS failure')
    })
    const results = await checkLinks(['https://ok.com', 'https://bad.com'], 50, 2)
    expect(results).toHaveLength(2)
    const ok = results.find((r) => r.url === 'https://ok.com')
    const bad = results.find((r) => r.url === 'https://bad.com')
    expect(ok?.ok).toBe(true)
    expect(bad?.ok).toBe(false)
  })
})

describe('sensitive words', () => {
  it('detects builtin words with context', () => {
    const hits = scanSensitiveWords('这款产品全网最低价，稳赚不赔')
    const words = hits.map((h) => h.word)
    expect(words).toContain('全网最低')
    expect(words).toContain('稳赚')
    const lowest = hits.find((h) => h.word === '全网最低')
    expect(lowest?.count).toBe(1)
    expect(lowest?.context.length).toBeGreaterThan(0)
  })

  it('includes user extra words', () => {
    const hits = scanSensitiveWords('完全自定义的词', ['自定义的词'])
    expect(hits.some((h) => h.word === '自定义的词' && h.category === '自定义')).toBe(true)
  })

  it('returns empty for clean text and keeps builtin table intact', () => {
    expect(scanSensitiveWords('今天天气不错')).toHaveLength(0)
    expect(BUILTIN_SENSITIVE_WORDS.length).toBeGreaterThanOrEqual(3)
  })
})

describe('data url images', () => {
  const PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  it('extracts data url image sources', () => {
    const html = `<img src="data:image/png;base64,${PNG_BASE64}"><img src="app://x/a.png">`
    const urls = extractDataUrlImages(html)
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('data:image/png;base64,')
  })

  it('decodes base64 payloads to array buffers', () => {
      const buf = decodeDataUrl(`data:image/png;base64,${PNG_BASE64}`)
      expect(buf).not.toBeNull()
      expect(new Uint8Array(buf!)[0]).toBe(0x89)
    expect(decodeDataUrl('data:text/html;base64,xxx')).toBeNull()
    expect(decodeDataUrl('data:image/png;base64,!!!')).toBeNull()
  })
})

describe('custom themes', () => {
  it('parses the name comment from css', () => {
    expect(parseThemeName('/* name: 我的企业风 */\n#bm-md {}')).toBe('我的企业风')
    expect(parseThemeName('#bm-md {}')).toBeNull()
  })

  it('builds stable ids from vault paths', () => {
    expect(customThemeId('themes/a.css')).toBe('file:themes/a.css')
  })

  it('appends custom entries to the style list', () => {
    const list = getAllMarkdownStyles([
      { id: 'file:x.css', name: 'X', css: '#bm-md {}' }
    ])
    expect(list.at(-1)?.id).toBe('custom')
    expect(list.some((s) => s.id === 'file:x.css')).toBe(true)
    expect(getMarkdownStyleCss('custom')).toContain('#bm-md')
    expect(getMarkdownStyleCss('file:x.css', [{ id: 'file:x.css', name: 'X', css: '#bm-md { color: red }' }])).toContain('color: red')
  })
})
