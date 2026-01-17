import { App, PluginSettingTab, Setting } from 'obsidian'
import type BmMdPlugin from '../main'
import { markdownStyles } from '../themes/markdown-style'
import { codeThemes } from '../themes/code-theme'

export class BmMdSettingsTab extends PluginSettingTab {
  plugin: BmMdPlugin

  constructor(app: App, plugin: BmMdPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this

    containerEl.empty()

    containerEl.createEl('h2', { text: ' 排版助手设置' })

    // Markdown Style Selection
    new Setting(containerEl)
      .setName('Markdown 样式')
      .setDesc('选择默认的 Markdown 排版样式')
      .addDropdown(dropdown => {
        markdownStyles.forEach(style => {
          dropdown.addOption(style.id, style.name)
        })
        dropdown
          .setValue(this.plugin.settings.markdownStyle)
          .onChange(async (value) => {
            this.plugin.settings.markdownStyle = value
            await this.plugin.saveSettings()
          })
      })

    // Code Theme Selection
    new Setting(containerEl)
      .setName('代码高亮主题')
      .setDesc('选择代码块的高亮主题')
      .addDropdown(dropdown => {
        codeThemes.forEach(theme => {
          dropdown.addOption(theme.id, theme.name)
        })
        dropdown
          .setValue(this.plugin.settings.codeTheme)
          .onChange(async (value) => {
            this.plugin.settings.codeTheme = value
            await this.plugin.saveSettings()
          })
      })

    // Default Platform Selection
    new Setting(containerEl)
      .setName('默认平台')
      .setDesc('选择默认的发布平台')
      .addDropdown(dropdown => {
        dropdown
          .addOption('wechat', '微信公众号')
          .addOption('zhihu', '知乎')
          .addOption('toutiao', '头条')
          .addOption('xiaohongshu', '小红书')
          .setValue(this.plugin.settings.defaultPlatform)
          .onChange(async (value) => {
            this.plugin.settings.defaultPlatform = value
            await this.plugin.saveSettings()
          })
      })

    // Custom CSS
    new Setting(containerEl)
      .setName('自定义 CSS')
      .setDesc('添加自定义 CSS 样式，在主题样式之后应用')
      .addTextArea(text => {
        text.inputEl.style.width = '100%'
        text.inputEl.style.height = '150px'
        text.inputEl.style.fontFamily = 'monospace'
        text
          .setPlaceholder('#bm-md h1 { color: red; }')
          .setValue(this.plugin.settings.customCss)
          .onChange(async (value) => {
            this.plugin.settings.customCss = value
            await this.plugin.saveSettings()
          })
      })
  }
}
