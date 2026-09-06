import { App, PluginSettingTab, Setting, Notice } from 'obsidian'
import type BmMdPlugin from '../main'
import { markdownStyles } from '../themes/markdown-style'
import { codeThemes } from '../themes/code-theme'
import { isWeChatConfigured } from '../lib/wechat/config'

const MANUAL_TOKEN_TTL_MS = 2 * 60 * 60 * 1000 // 微信 access_token 有效期约 2 小时

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
      .setName('排版')
      .setHeading()

    // Markdown Style Selection
    new Setting(containerEl)
      .setName('排版主题')
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
      .setDesc('选择代码块的语法高亮样式')
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

    // Custom CSS
    new Setting(containerEl)
      .setName('自定义 CSS')
      .setDesc('附加样式，会覆盖主题中的同名规则')
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

    // 发布默认值
    new Setting(containerEl)
      .setName('发布默认值')
      .setHeading()

    new Setting(containerEl)
      .setName('默认开启评论')
      .setDesc('发布弹窗中「开启评论」的默认状态')
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.defaultOpenComment)
          .onChange(async (value) => {
            this.plugin.settings.defaultOpenComment = value
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('默认仅粉丝可评论')
      .setDesc('发布弹窗中「仅粉丝可评论」的默认状态')
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.defaultFansOnlyComment)
          .onChange(async (value) => {
            this.plugin.settings.defaultFansOnlyComment = value
            await this.plugin.saveSettings()
          })
      })

    // WeChat Settings Section
    new Setting(containerEl)
      .setName('微信公众号')
      .setHeading()

    this.renderWeChatSettings(containerEl)
  }

  private renderWeChatSettings(containerEl: HTMLElement): void {
    // 认证方式：手动 token 模式可绕过 IP 白名单限制
    new Setting(containerEl)
      .setName('使用手动 token')
      .setDesc(
        '开启后不再调用微信接口自动刷新 token，而是使用你粘贴的 access_token（有效期约 2 小时）。' +
        '适合网络 IP 频繁变化、无法在公众号后台设置 IP 白名单的场景。'
      )
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.useManualToken)
          .onChange(async (value) => {
            this.plugin.settings.useManualToken = value
            await this.plugin.saveSettings()
            this.display()
          })
      })

    if (this.plugin.settings.useManualToken) {
      // 手动 token
      new Setting(containerEl)
        .setName('access_token')
        .setDesc(
          '从公众号后台 / 开发工具获取并粘贴。粘贴后按 2 小时有效期计算，过期后在此重新粘贴即可。'
        )
        .addText(text => {
          text.inputEl.type = 'password'
          text.inputEl.classList.add('bm-md-appsecret-input')
          text
            .setPlaceholder('粘贴 access_token')
            .setValue(this.plugin.settings.manualAccessToken)
            .onChange(async (value) => {
              this.plugin.settings.manualAccessToken = value.trim()
              // 重置有效期：从粘贴时刻起算约 2 小时
              this.plugin.settings.manualTokenExpireTime = Date.now() + MANUAL_TOKEN_TTL_MS
              await this.plugin.saveSettings()
            })
        })
    } else {
      // 自动模式
      new Setting(containerEl)
        .setName('AppID')
        .setDesc('公众号 AppID，位于 公众平台 → 设置与开发 → 基本配置')
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
        .setName('AppSecret')
        .setDesc(
          '公众号 AppSecret，请务必保密。注意：Obsidian 将其明文保存在本机配置中，' +
          '若担心泄露风险，建议改用「手动 token」模式。'
        )
        .addText(text => {
          text.inputEl.type = 'password'
          text.inputEl.classList.add('bm-md-appsecret-input')
          text
            .setPlaceholder('请输入 AppSecret')
            .setValue(this.plugin.settings.wechatAppSecret)
            .onChange(async (value) => {
              this.plugin.settings.wechatAppSecret = value.trim()
              await this.plugin.saveSettings()
            })
        })

      new Setting(containerEl)
        .setName('IP 白名单')
        .setDesc(
          '自动模式需要把本机当前 IP 加入公众号的 IP 白名单（公众平台 → 基本配置）。' +
          'IP 变化后会失效，此时可改用「手动 token」模式。'
        )
    }

    // 测试连接
    const testSetting = new Setting(containerEl)
      .setName('测试连接')
      .setDesc('验证公众号凭证与接口可用性')

    const statusEl = testSetting.descEl.createSpan({ cls: 'bm-md-connection-status' })

    testSetting.addButton(button => {
      button
        .setButtonText('测试')
        .onClick(async () => {
          if (!isWeChatConfigured(this.plugin.settings)) {
            new Notice('请先填写公众号凭证或手动 token')
            return
          }

          button.setButtonText('测试中…')
          button.setDisabled(true)
          statusEl.setText('')
          statusEl.removeClass('bm-md-status-success', 'bm-md-status-error')

          const api = this.plugin.createWeChatApi()

          try {
            // 拉取一条草稿即可验证 token 与接口连通性
            const data = await api.listDrafts(0, 1)
            statusEl.setText(`连接成功！草稿箱共 ${data.total_count} 条草稿`)
            statusEl.classList.add('bm-md-status-success')
            new Notice('连接成功')
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            statusEl.setText(message)
            statusEl.classList.add('bm-md-status-error')
            new Notice('连接失败：' + message)
          } finally {
            button.setButtonText('测试')
            button.setDisabled(false)
          }
        })
    })
  }
}
