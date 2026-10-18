import githubDarkCss from 'highlight.js/styles/github-dark.css'
import monokaiCss from 'highlight.js/styles/monokai.css'
import draculaCss from './dracula.css'
import nordCss from 'highlight.js/styles/nord.css'
import atomOneDarkCss from 'highlight.js/styles/atom-one-dark.css'
import vs2015Css from 'highlight.js/styles/vs2015.css'
import kimbieDarkCss from 'highlight.js/styles/kimbie-dark.css'

export interface CodeTheme {
  id: string
  name: string
  css: string
}

/**
 * 代码高亮主题。
 *
 * 只收录深色配色：排版主题的代码块底色统一是深色（#111111–#453732），
 * 浅色高亮主题放在深底上关键字对比度只有 1.0–3.4:1，代码会看不清。
 * 早期版本收录过 github / one-light / vs / xcode 等浅色主题，
 * 加载旧配置时由 resolveCodeThemeId 兜底到当前主题的配套配色。
 */
export const codeThemes: CodeTheme[] = [
  // highlight.js v11 移除了 dracula，这里使用 vendored 的官方 v10 主题
  { id: 'dracula', name: 'Dracula', css: draculaCss },
  { id: 'github-dark', name: 'GitHub Dark', css: githubDarkCss },
  { id: 'nord', name: 'Nord', css: nordCss },
  { id: 'monokai', name: 'Monokai', css: monokaiCss },
  // One Dark 与 Atom One Dark 是同一套官方主题，保留两个 id 以兼容已保存的设置
  { id: 'one-dark', name: 'One Dark', css: atomOneDarkCss },
  { id: 'atom-one-dark', name: 'Atom One Dark', css: atomOneDarkCss },
  { id: 'vs2015', name: 'VS 2015 Dark', css: vs2015Css },
  { id: 'kimbie-dark', name: 'Kimbie Dark', css: kimbieDarkCss },
]

/** 全部排版主题的默认代码配色：在 11 套深色代码块上均达到 4.5:1 以上 */
export const DEFAULT_CODE_THEME = 'dracula'

/** 已被移除的浅色代码主题 → 兜底配色 */
const RETIRED_LIGHT_THEMES = new Set([
  'github',
  'one-light',
  'atom-one-light',
  'vs',
  'xcode',
  'kimbie-light',
])

export function isKnownCodeTheme(id: string | undefined | null): boolean {
  return Boolean(id) && codeThemes.some((t) => t.id === id)
}

/**
 * 把可能是旧值 / 空值的代码主题 id 解析成当前可用的 id。
 *
 * 旧版本允许选择浅色高亮，这些 id 在深色代码块上不可读，已移除；
 * 读到它们时回退到 fallback（通常是该排版主题的配套配色）。
 */
export function resolveCodeThemeId(
  id: string | undefined | null,
  fallback: string = DEFAULT_CODE_THEME
): string {
  if (id && !RETIRED_LIGHT_THEMES.has(id) && isKnownCodeTheme(id)) return id
  if (isKnownCodeTheme(fallback)) return fallback
  return DEFAULT_CODE_THEME
}

export function getCodeThemeCss(themeId: string): string {
  const theme = codeThemes.find(t => t.id === themeId)
  return theme?.css || codeThemes.find(t => t.id === DEFAULT_CODE_THEME)!.css
}
