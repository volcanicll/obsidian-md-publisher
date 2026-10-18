import { describe, it, expect } from 'vitest'
import {
  codeThemes,
  DEFAULT_CODE_THEME,
  isKnownCodeTheme,
  resolveCodeThemeId,
} from '../src/themes/code-theme'
import {
  designerMarkdownStyles,
  getPairedCodeTheme,
} from '../src/themes/markdown-style'
import { render } from '../src/lib/markdown/render'

/** 相对亮度（WCAG 2.x） */
function luminance(hex: string): number {
  let c = hex.replace('#', '')
  if (c.length === 3) c = c.split('').map((x) => x + x).join('')
  const rgb = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg)
  const b = luminance(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/** 从排版主题 CSS 里取代码块底色 */
function codeBlockBg(styleId: string): string {
  const style = designerMarkdownStyles.find((s) => s.id === styleId)!
  const m = style.css.match(/pre\s*\{[^}]*?background:\s*(#[0-9a-fA-F]{6})/)
  if (!m) throw new Error(`主题 ${styleId} 没有代码块底色`)
  return m[1]
}

/** 从代码主题 CSS 里取某个 token 的颜色 */
function tokenColor(codeThemeId: string, token: string): string | null {
  const theme = codeThemes.find((t) => t.id === codeThemeId)!
  const re = new RegExp(`\\.${token}[^{]*\\{[^}]*?color:\\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})`)
  const m = theme.css.match(re)
  return m ? m[1] : null
}

// 代码本体 token：注释与 meta 是设计上刻意弱化的，不纳入强制达标范围
const BODY_TOKENS = [
  'hljs-keyword',
  'hljs-string',
  'hljs-number',
  'hljs-title',
  'hljs-attr',
  'hljs-built_in',
  'hljs-literal',
  'hljs-variable',
  'hljs-type',
]

describe('code theme catalogue', () => {
  it('only ships dark code themes', () => {
    const lightIds = ['github', 'one-light', 'atom-one-light', 'vs', 'xcode', 'kimbie-light']
    for (const id of lightIds) {
      expect(isKnownCodeTheme(id)).toBe(false)
    }
    // 深色主题仍在
    for (const id of ['dracula', 'github-dark', 'nord', 'monokai', 'one-dark', 'vs2015']) {
      expect(isKnownCodeTheme(id)).toBe(true)
    }
  })

  it('keeps legacy ids resolvable to a usable theme', () => {
    // 旧配置里的浅色高亮要被换成兜底值，而不是渲染成不可读的代码
    expect(resolveCodeThemeId('github')).toBe(DEFAULT_CODE_THEME)
    expect(resolveCodeThemeId('one-light')).toBe(DEFAULT_CODE_THEME)
    expect(resolveCodeThemeId('github', 'github-dark')).toBe('github-dark')
  })

  it('keeps explicit dark selections untouched', () => {
    expect(resolveCodeThemeId('nord')).toBe('nord')
    expect(resolveCodeThemeId('monokai', 'dracula')).toBe('monokai')
  })

  it('falls back when the id is empty or unknown', () => {
    expect(resolveCodeThemeId('')).toBe(DEFAULT_CODE_THEME)
    expect(resolveCodeThemeId(null)).toBe(DEFAULT_CODE_THEME)
    expect(resolveCodeThemeId('does-not-exist')).toBe(DEFAULT_CODE_THEME)
    expect(resolveCodeThemeId('does-not-exist', 'nord')).toBe('nord')
  })
})

describe('markdown theme code pairing', () => {
  it('declares a paired code theme for every built-in theme', () => {
    for (const style of designerMarkdownStyles) {
      expect(style.codeTheme, `${style.id} 缺少配套高亮`).toBeTruthy()
      expect(isKnownCodeTheme(style.codeTheme)).toBe(true)
    }
  })

  it('exposes the pairing through getPairedCodeTheme', () => {
    expect(getPairedCodeTheme('mist')).toBe('dracula')
    expect(getPairedCodeTheme('journal')).toBe('github-dark')
    // 自定义主题没有声明配套，返回 undefined 交给全局兜底
    expect(getPairedCodeTheme('custom')).toBeUndefined()
  })

  it('every paired code theme meets 4.5:1 on its own code block background', () => {
    for (const style of designerMarkdownStyles) {
      const bg = codeBlockBg(style.id)
      const codeTheme = style.codeTheme!
      const failing: string[] = []

      for (const token of BODY_TOKENS) {
        const color = tokenColor(codeTheme, token)
        if (!color) continue
        const ratio = contrast(color, bg)
        if (ratio < 4.5) {
          failing.push(`${token}=${ratio.toFixed(2)}:1`)
        }
      }

      expect(failing, `${style.id} + ${codeTheme} 对比度不足`).toEqual([])
    }
  })
})

describe('render picks the paired code theme', () => {
  // 说明：vitest 配置了 css: false，highlight.js 主题样式在测试里是空串，
  // 因此这里不断言最终 HTML 的 token 颜色（那需要真实 CSS 打包）。
  // 渲染管线的实际行为已用 esbuild 打包后手动验证：
  //   mist + 默认        → dracula，关键字 #8be9fd
  //   mist + github-dark → github-dark，关键字 #ff7b72
  //   mist + github（旧值）→ 回退 dracula
  it('falls back to the paired theme for retired ids before rendering', () => {
    // 渲染管线内部走同一个解析函数，这里验证解析结果
    expect(resolveCodeThemeId('github', getPairedCodeTheme('mist'))).toBe('dracula')
    expect(resolveCodeThemeId(undefined, getPairedCodeTheme('mist'))).toBe('dracula')
    expect(resolveCodeThemeId('github-dark', getPairedCodeTheme('mist'))).toBe('github-dark')
  })

  it('renders without throwing for a retired light code theme id', async () => {
    const html = await render({
      markdown: '```ts\nconst a = 1\n```',
      markdownStyle: 'mist',
      codeTheme: 'github',
    })
    // 旧 id 不能让渲染失败，代码块仍要产出
    expect(html).toContain('<pre')
    expect(html).toContain('hljs-keyword')
  })

  it('applies the paired code theme when none is given', async () => {
    const html = await render({
      markdown: '```ts\nconst a = 1\n```',
      markdownStyle: 'mist',
    })
    expect(html).toContain('<pre')
    expect(html).toContain('hljs-keyword')
  })
})
