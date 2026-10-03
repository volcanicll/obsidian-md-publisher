import { App, PluginSettingTab, Setting, Notice } from 'obsidian'
import type BmMdPlugin from '../main'
import { codeThemes } from '../themes/code-theme'
import { isWeChatConfigured } from '../lib/wechat/config'
import { defaultCustomThemeFolder } from '../lib/custom-themes'

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

    // Markdown Style Selection（含 vault 导入的自定义主题与「自定义」入口）
    new Setting(containerEl)
      .setName('排版主题')
      .setDesc('选择默认的 Markdown 排版样式；自定义主题文件夹中的主题会一并列出')
      .addDropdown(dropdown => {
        this.plugin.getMarkdownStyleList().forEach(style => {
          dropdown.addOption(style.id, style.name)
        })
        dropdown
          .setValue(this.plugin.settings.markdownStyle)
          .onChange(async (value) => {
            this.plugin.settings.markdownStyle = value
            await this.plugin.saveSettings()
          })
      })

    // Custom theme folder
    const themeFolder = defaultCustomThemeFolder(this.app.vault.configDir)
    new Setting(containerEl)
      .setName('自定义主题文件夹')
      .setDesc(
        `vault 内的文件夹路径，其中每个 .css 文件都是一套主题（自动叠加通用基础样式）。` +
        `留空使用默认目录 ${themeFolder}。` +
        `文件首行用 name 注释（例如「name: 我的企业风」）可指定主题名，否则用文件名。`
      )
      .addText(text => {
        text
          .setPlaceholder(themeFolder)
          .setValue(this.plugin.settings.customThemeFolder)
          .onChange(async (value) => {
            this.plugin.settings.customThemeFolder = value.trim()
            await this.plugin.saveSettings()
          })
      })
      .addButton(button => {
        button
          .setButtonText('重新扫描')
          .onClick(async () => {
            await this.plugin.refreshCustomThemes()
            new Notice(`已加载 ${this.plugin.customThemes.length} 套自定义主题`)
            this.display()
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
      .setDesc(
        '附加样式，会覆盖主题中的同名规则；配合「自定义 Custom」主题可从零搭建排版'
      )
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

    // 预览行为
    new Setting(containerEl)
      .setName('预览')
      .setHeading()

    new Setting(containerEl)
      .setName('双向滚动同步')
      .setDesc('在编辑器与预览面板之间按比例同步滚动位置，方便长文定位')
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.scrollSync)
          .onChange(async (value) => {
            this.plugin.settings.scrollSync = value
            await this.plugin.saveSettings()
          })
      })

    // 导出图片
    new Setting(containerEl)
      .setName('导出图片')
      .setHeading()

    new Setting(containerEl)
      .setName('导出图片宽度')
      .setDesc('导出长图的版面宽度；375 对应手机屏幕宽度，750 / 1080 更清晰')
      .addDropdown(dropdown => {
        dropdown.addOption('375', '375 px')
        dropdown.addOption('750', '750 px')
        dropdown.addOption('1080', '1080 px')
        dropdown
          .setValue(String(this.plugin.settings.exportImageWidth))
          .onChange(async (value) => {
            this.plugin.settings.exportImageWidth = Number(value)
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('导出图片缩放')
      .setDesc('像素密度倍数，越高越清晰、文件也越大；内容过长时会自动降级以避免超出画布上限')
      .addDropdown(dropdown => {
        dropdown.addOption('1', '1x')
        dropdown.addOption('2', '2x')
        dropdown.addOption('3', '3x')
        dropdown
          .setValue(String(this.plugin.settings.exportImageScale))
          .onChange(async (value) => {
            this.plugin.settings.exportImageScale = Number(value)
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('导出图片文件夹')
      .setDesc(
        '导出 PNG 的保存位置；留空保存到当前笔记所在文件夹，' +
        '填写则为 vault 内相对路径（不存在时自动创建）'
      )
      .addText(text => {
        text
          .setPlaceholder('留空与笔记同目录')
          .setValue(this.plugin.settings.exportImageFolder)
          .onChange(async (value) => {
            this.plugin.settings.exportImageFolder = value.trim()
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

    // 敏感词自定义词表
    new Setting(containerEl)
      .setName('敏感词补充词表')
      .setDesc(
        '发布前校验时额外扫描的词条，用逗号或换行分隔；内置词表覆盖极限用语、医疗夸大、收益承诺与诱导互动'
      )
      .addTextArea(text => {
        text.inputEl.classList.add('bm-md-sensitive-words-textarea')
        text
          .setPlaceholder('词条一, 词条二\n词条三')
          .setValue(this.plugin.settings.sensitiveWords)
          .onChange(async (value) => {
            this.plugin.settings.sensitiveWords = value
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
          button.buttonEl.disabled = true
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
            button.buttonEl.disabled = false
          }
        })
    })
  }
}
