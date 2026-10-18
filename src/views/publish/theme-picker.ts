import { Menu, setIcon, setTooltip } from 'obsidian'
import type { MarkdownStyle } from '../../themes/markdown-style'

export interface ThemePickerOptions {
  /** 当前选中的排版主题 id */
  markdownStyle: string
  /** 可选的排版主题列表（含自定义主题） */
  styles: MarkdownStyle[]
  onChange: (styleId: string) => void
}

/**
 * 排版主题选择器。
 *
 * 代码高亮已跟随主题自动匹配，主题成为唯一需要用户决策的外观项，
 * 因此不再单独占一行：它是一个紧凑控件，侧栏里直接并入工具栏，
 * 发布弹窗里贴在真机预览下方。
 */
export class ThemePicker {
  private readonly root: HTMLButtonElement
  private readonly styles: MarkdownStyle[]
  private readonly onChange: (styleId: string) => void
  private readonly valueEl: HTMLElement
  private styleId: string
  /** 上一次交给 setTooltip 的文案：重复设置会重置提示计时 */
  private tooltipText = ''

  constructor(parent: Element, options: ThemePickerOptions) {
    this.styles = options.styles
    this.onChange = options.onChange
    this.styleId = options.markdownStyle

    this.root = parent.createEl('button', {
      cls: 'bm-md-theme-chip',
      attr: {
        type: 'button',
        'aria-haspopup': 'menu',
        'aria-label': '排版主题',
      },
    })

    const icon = this.root.createSpan({ cls: 'bm-md-theme-chip-icon' })
    setIcon(icon, 'palette')

    this.valueEl = this.root.createSpan({ cls: 'bm-md-theme-chip-value' })
    const caret = this.root.createSpan({ cls: 'bm-md-theme-chip-caret' })
    setIcon(caret, 'chevron-down')

    this.root.addEventListener('click', (e) => this.openMenu(e))
    this.refresh()
  }

  /** 外部主题变化（例如发布弹窗切换后回写侧栏）时同步显示 */
  setState(styleId: string): void {
    this.styleId = styleId
    this.refresh()
  }

  /** 发布过程中锁住，避免正文正在上传时又被换主题 */
  setDisabled(disabled: boolean): void {
    this.root.disabled = disabled
  }

  refresh(): void {
    const style = this.styles.find((s) => s.id === this.styleId)
    const name = style?.name ?? this.styleId
    this.valueEl.textContent = name

    // 窄侧栏里主题名会被省略甚至只剩图标，完整名称靠悬停提示兜底
    const tip = `排版主题：${name}`
    if (tip !== this.tooltipText) {
      this.tooltipText = tip
      setTooltip(this.root, tip)
    }
    this.root.setAttr('aria-label', tip)
  }

  destroy(): void {
    this.root.remove()
  }

  private openMenu(e: MouseEvent): void {
    const menu = new Menu()
    this.styles.forEach((style) => {
      menu.addItem((item) => {
        item
          .setTitle(style.name)
          .setChecked(style.id === this.styleId)
          .onClick(() => {
            this.setState(style.id)
            this.onChange(style.id)
          })
      })
    })
    showMenuForTrigger(menu, e, this.root)
  }
}

/**
 * 键盘触发（Enter / 空格）时 MouseEvent 坐标是 0,0，
 * 改为贴住触发按钮下沿展开，避免菜单跑到窗口左上角。
 */
export function showMenuForTrigger(
  menu: Menu,
  e: MouseEvent,
  anchor: HTMLElement | null
): void {
  if (e.detail > 0) {
    menu.showAtMouseEvent(e)
    return
  }
  const rect = anchor?.getBoundingClientRect()
  if (!rect) {
    menu.showAtMouseEvent(e)
    return
  }
  menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 })
}
