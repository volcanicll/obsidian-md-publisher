import { App, PluginSettingTab, Setting, Notice } from 'obsidian'
import type BmMdPlugin from '../main'
import { markdownStyles } from '../themes/markdown-style'
import { codeThemes } from '../themes/code-theme'
import { WeChatApi } from '../lib/wechat/wechat-api'

export class BmMdSettingsTab extends PluginSettingTab {
  plugin: BmMdPlugin

  constructor(app: App, plugin: BmMdPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this

    containerEl.empty()

    new Setting(containerEl)
      .setName('排版助手设置')
      .setHeading()

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
          // .addOption('zhihu', '知乎')
          // .addOption('toutiao', '头条')
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
        text.inputEl.classList.add('bm-md-custom-css-textarea')
        text
          .setPlaceholder('#bm-md h1 { color: red; }')
          .setValue(this.plugin.settings.customCss)
          .onChange(async (value) => {
            this.plugin.settings.customCss = value
            await this.plugin.saveSettings()
          })
      })

    // WeChat Official Account Settings Section
    new Setting(containerEl)
      .setName('微信公众号设置')
      .setHeading()

    new Setting(containerEl)
      .setName('App ID')
      .setDesc('WeChat Official Account App ID from the platform - Development - Basic configuration')
      .addText(text => {
        text.inputEl.classList.add('bm-md-appid-input')
        text
          .setPlaceholder('wx1234567890abcdef')
          .setValue(this.plugin.settings.wechatAppId)
          .onChange(async (value) => {
            this.plugin.settings.wechatAppId = value.trim()
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('App Secret')
      .setDesc('WeChat Official Account App Secret, please keep it safe')
      .addText(text => {
        text.inputEl.type = 'password'
        text.inputEl.classList.add('bm-md-appsecret-input')
        text
          .setPlaceholder('Enter App Secret')
          .setValue(this.plugin.settings.wechatAppSecret)
          .onChange(async (value) => {
            this.plugin.settings.wechatAppSecret = value.trim()
            await this.plugin.saveSettings()
          })
      })

    // Test Connection Button
    const testConnectionSetting = new Setting(containerEl)
      .setName('Test connection')
      .setDesc('Test WeChat API connection status')

    const statusEl = testConnectionSetting.descEl.createSpan({ cls: 'bm-md-connection-status' })

    testConnectionSetting.addButton(button => {
      button
        .setButtonText('Test')
        .onClick(async () => {
          if (!this.plugin.settings.wechatAppId || !this.plugin.settings.wechatAppSecret) {
            new Notice('Please fill in App ID and App Secret first')
            return
          }

          button.setButtonText('Testing...')
          button.setDisabled(true)
          statusEl.setText('')

          const api = new WeChatApi({
            appId: this.plugin.settings.wechatAppId,
            appSecret: this.plugin.settings.wechatAppSecret
          }, {
            onTokenRefresh: async (token, expireTime) => {
              this.plugin.settings.wechatAccessToken = token
              this.plugin.settings.wechatTokenExpireTime = expireTime
              await this.plugin.saveSettings()
            }
          })

          const result = await api.testConnection()

          button.setButtonText('测试')
          button.setDisabled(false)

          if (result.success) {
            statusEl.setText(' ✅ ' + result.message)
            statusEl.classList.add('bm-md-status-success')
            statusEl.classList.remove('bm-md-status-error')
            new Notice('✅ ' + result.message)
          } else {
            statusEl.setText(' ❌ ' + result.message)
            statusEl.classList.add('bm-md-status-error')
            statusEl.classList.remove('bm-md-status-success')
            new Notice('❌ ' + result.message)
          }
        })
    })
  }
}

