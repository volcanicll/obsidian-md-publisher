import githubCss from 'highlight.js/styles/github.css'
import githubDarkCss from 'highlight.js/styles/github-dark.css'
import monokaiCss from 'highlight.js/styles/monokai.css'
import draculaCss from './dracula.css'
import nordCss from 'highlight.js/styles/nord.css'
import atomOneDarkCss from 'highlight.js/styles/atom-one-dark.css'
import atomOneLightCss from 'highlight.js/styles/atom-one-light.css'
import vsCss from 'highlight.js/styles/vs.css'
import vs2015Css from 'highlight.js/styles/vs2015.css'
import xcodeCss from 'highlight.js/styles/xcode.css'
import kimbieLightCss from 'highlight.js/styles/kimbie-light.css'
import kimbieDarkCss from 'highlight.js/styles/kimbie-dark.css'

export interface CodeTheme {
  id: string
  name: string
  css: string
}

// 官方 highlight.js 主题样式（v11）。
// 经 esbuild `.css` text loader 打包为字符串，由 render() 内联进文章 HTML。
export const codeThemes: CodeTheme[] = [
  { id: 'github', name: 'GitHub', css: githubCss },
  { id: 'github-dark', name: 'GitHub Dark', css: githubDarkCss },
  { id: 'monokai', name: 'Monokai', css: monokaiCss },
  // highlight.js v11 移除了 dracula，这里使用 vendored 的官方 v10 主题
  { id: 'dracula', name: 'Dracula', css: draculaCss },
  { id: 'nord', name: 'Nord', css: nordCss },
  // One Dark/Light 与 Atom One 均为同一套官方主题，保留两个 id 以兼容已保存的设置
  { id: 'one-dark', name: 'One Dark', css: atomOneDarkCss },
  { id: 'one-light', name: 'One Light', css: atomOneLightCss },
  { id: 'atom-one-dark', name: 'Atom One Dark', css: atomOneDarkCss },
  { id: 'atom-one-light', name: 'Atom One Light', css: atomOneLightCss },
  { id: 'vs', name: 'Visual Studio', css: vsCss },
  { id: 'vs2015', name: 'VS 2015 Dark', css: vs2015Css },
  { id: 'xcode', name: 'Xcode', css: xcodeCss },
  { id: 'kimbie-light', name: 'Kimbie Light', css: kimbieLightCss },
  { id: 'kimbie-dark', name: 'Kimbie Dark', css: kimbieDarkCss },
]

export function getCodeThemeCss(themeId: string): string {
  const theme = codeThemes.find(t => t.id === themeId)
  return theme?.css || codeThemes[0].css
}
