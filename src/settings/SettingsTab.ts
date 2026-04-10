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
      .setName('Appearance')
      .setHeading()

    // Markdown Style Selection
    new Setting(containerEl)
      .setName('Markdown style')
      .setDesc('Select default Markdown styling theme')
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
      .setName('Code highlight theme')
      .setDesc('Select code block syntax highlighting theme')
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
      .setName('Default platform')
      .setDesc('Select default publishing platform')
      .addDropdown(dropdown => {
        dropdown
          .addOption('wechat', 'WeChat')
          // .addOption('zhihu', 'Zhihu')
          // .addOption('toutiao', 'Toutiao')
          .addOption('xiaohongshu', 'Xiaohongshu')
          .setValue(this.plugin.settings.defaultPlatform)
          .onChange(async (value) => {
            this.plugin.settings.defaultPlatform = value
            await this.plugin.saveSettings()
          })
      })

    // Custom CSS
    new Setting(containerEl)
      .setName('Custom CSS')
      .setDesc('Add custom CSS styles, applied after theme styles')
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

    // WeChat Settings Section
    new Setting(containerEl)
      .setName('WeChat configuration')
      .setHeading()

    new Setting(containerEl)
      .setName('App ID')
      .setDesc('WeChat app ID from WeChat platform - development - basic configuration')
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
      .setName('App secret')
      .setDesc('WeChat app secret, please keep it safe')
      .addText(text => {
        text.inputEl.type = 'password'
        text.inputEl.classList.add('bm-md-appsecret-input')
        text
          .setPlaceholder('Enter app secret')
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
            new Notice('Please fill in app ID and app secret first')
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

          button.setButtonText('Test')
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

