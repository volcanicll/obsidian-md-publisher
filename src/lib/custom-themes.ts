/**
 * 从 vault 文件夹导入自定义排版主题。
 *
 * 约定：文件夹内的每个 .css 文件就是一套主题，插件自动在文件内容前
 * 拼接通用基础样式（COMMON_STYLE），所以主题文件只需要写「气质层」
 * ——正文颜色、标题记号、引用与代码块样式等，选择器一律以 #bm-md 开头。
 *
 * 主题名：文件首行 name 注释（斜杠星 name: 主题名 星斜杠）优先，否则用文件名。
 */

import { TFile, TFolder } from 'obsidian'
import type { MarkdownStyle } from '../themes/markdown-style'
import { COMMON_STYLE } from '../themes/markdown-style'

/** 配置目录内的主题文件夹路径（.obsidian 可由用户配置，运行时取 configDir） */
export function defaultCustomThemeFolder(configDir: string): string {
  return `${configDir}/plugins/md-publisher/themes`
}

/** 从 CSS 文本中解析首行 name 注释里的主题名，取不到返回 null */
export function parseThemeName(css: string): string | null {
  const m = css.match(/^\s*\/\*\s*name\s*:\s*(.+?)\s*\*\//)
  return m ? m[1] : null
}

export function customThemeId(path: string): string {
  return `file:${path}`
}

/**
 * 读取文件夹内全部 .css 主题。文件夹不存在时返回空数组。
 */
export async function loadCustomThemes(
  app: {
    vault: {
      configDir: string
      getAbstractFileByPath(path: string): unknown
      read(file: TFile): Promise<string>
    }
  },
  folder: string
): Promise<MarkdownStyle[]> {
  // 未配置或仍是历史默认值时，跟随当前配置目录
  const raw = folder.trim().replace(/\/+$/, '')
  const trimmed = raw || defaultCustomThemeFolder(app.vault.configDir)
  if (!trimmed) return []

  const dir = app.vault.getAbstractFileByPath(trimmed)
  if (!(dir instanceof TFolder)) return []

  const files = dir.children
    .filter((child): child is TFile => child instanceof TFile && child.extension.toLowerCase() === 'css')
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

  const themes: MarkdownStyle[] = []
  for (const file of files) {
    try {
      const css = await app.vault.read(file)
      const name = parseThemeName(css) || file.basename
      themes.push({
        id: customThemeId(file.path),
        name,
        css: COMMON_STYLE + '\n' + css,
      })
    } catch (err) {
      console.warn(`自定义主题读取失败：${file.path}`, err)
    }
  }
  return themes
}
