/**
 * 生成主题设计稿预览页（docs/theme-preview.html）。
 * 用真实渲染管线（render + juice 内联）产出每套主题的公众号效果，
 * 保证设计稿与实际发布内容一致。运行：bun run scripts/theme-preview.ts
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '../src/lib/markdown/render'
import { markdownStyles } from '../src/themes/markdown-style'

const sample = `# 手冲咖啡入门指南

一篇写给完全新手的小指南。目标是让你在 **十分钟** 内冲出第一杯不难喝的咖啡，理解 \`水温、研磨度、粉水比\` 三个变量的关系。

> 咖啡的风味，90% 发生在萃取之前：豆子、研磨和水温决定了上限，手法只是逼近它。

## 三个核心变量

变量之间互相牵动，调整一个，往往需要重新校准另外两个：

- **研磨度**：越细萃取越快，越容易过萃发苦
- **水温**：浅烘用 92–94°C，深烘降到 88–90°C
- **粉水比**：入门建议从 \`1:15\` 开始，即 15g 粉配 225g 水

### 建议的入门参数

| 参数 | 建议值 | 备注 |
| --- | --- | --- |
| 粉水比 | 1:15 | 可在 1:14–1:16 间微调 |
| 水温 | 90°C | 浅烘偏高，深烘偏低 |
| 总时长 | 2 分 30 秒 | 过长说明研磨过细 |

## 一个可复制的流程

1. 润湿滤纸，倒掉洗水，预热分享壶
2. 倒入咖啡粉，中央挖一个小坑
3. 注入 45g 水闷蒸 30 秒
4. 分三段绕圈注水至 225g

\`\`\`ts
const ratio = 15 / 225 // 1:15
const pour = (bloom: number) => bloom + 180
\`\`\`

---

如果你想系统学习，可以看看 [SCA 冲煮手册](https://sca.coffee)。祝第一杯顺利。
`

interface ThemeNote {
  id: string
  positioning: string
  signature: string[]
  fit: string
}

const notes: Record<string, ThemeNote> = {
  mist: {
    id: 'mist',
    positioning: '晨雾轻氧 · 通用首选',
    signature: [
      '雾蓝灰正文配雾白底，默认主题，耐看不挑内容',
      'h2 居中 + 雾蓝渐变短线，层级靠留白而不是色块',
      '引用、代码块、图片统一 12-14px 大圆角，透气柔和',
    ],
    fit: '生活方式、科普、职场、成长类账号，日常通用',
  },
  peach: {
    id: 'peach',
    positioning: '蜜桃暖调 · 陪伴感',
    signature: [
      '杏白底 + 暖褐正文，降低冷屏幕的疏离感',
      'h2 做成珊瑚色胶囊章，是全篇唯一的重色块',
      '引用为奶油气泡卡，圆角收边，情绪柔软',
    ],
    fit: '情感、亲子、美食、晚安陪伴类账号',
  },
  journal: {
    id: 'journal',
    positioning: '学报规训 · 深度长文',
    signature: [
      '黑体标题 + 宋体正文两端对齐，首行 2em 缩进',
      '三线表是版式签名：上下粗线、无竖线、无底色',
      '藏青只出现在 § 序标、引用侧栏与链接上',
    ],
    fit: '知识长文、学术科普、深度分析类账号',
  },
  notes: {
    id: 'notes',
    positioning: '课堂笔记 · 手帐感',
    signature: [
      '纸黄底色 + 虚线分隔，全程手帐质感',
      'strong 一律荧光笔划线，扫读时重点先跳出来',
      'h3 带 ✎ 记号，引用是虚线便签卡',
    ],
    fit: '学习方法、读书笔记、效率工具类账号',
  },
  cover: {
    id: 'cover',
    positioning: '封面故事 · 刊物感',
    signature: [
      'h1 上下双线（粗+细）报头式处理，衬线大标题',
      'h2 红方块序标 + 黑色底线，红只给链接与序标',
      '引用为上下细线 pull-quote，去底色、无圆角',
    ],
    fit: '人物专访、品牌叙事、深度非虚构类账号',
  },
  booklet: {
    id: 'booklet',
    positioning: '别册书卷 · 纸质文艺',
    signature: [
      '米白纸底 + 焦糖点缀，衬线正文 2.05 行高',
      'h1 居中带焦糖短线，h2 菱形序标 + 点线下划',
      '引用为细线框签条，整体像一本手边小册子',
    ],
    fit: '读书、文化、散文、慢生活类账号',
  },
  letter: {
    id: 'letter',
    positioning: '信笺手书 · 疏朗慢读',
    signature: [
      '暖米纸底 + 衬线正文 2.1 行高，全家族最疏朗的一套',
      '墨蓝只给标题、链接与强调，其余全是暖墨灰',
      '引用只靠缩进与橄榄灰墨色区分，表格是发丝三线表',
    ],
    fit: '书信、散文、随笔、慢读类账号',
  },
  rubbing: {
    id: 'rubbing',
    positioning: '拓本墨影 · 素面严肃',
    signature: [
      '无底色素面排版，暖墨正文 + 墨蓝单色点缀',
      'h2 墨蓝方块序标，分隔线是一短段浓墨',
      '表格上下浓线、中间发丝线，像一页碑帖资料',
    ],
    fit: '长文资料、严肃科普、文档整理类账号',
  },
}

const pageCss = `
* { box-sizing: border-box; }
body { margin: 0; background: #f2f0ec; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; color: #2b2b2b; }
.page-header { max-width: 1240px; margin: 0 auto; padding: 56px 32px 8px; }
.page-header h1 { font-size: 26px; margin: 0 0 10px; letter-spacing: 1px; }
.page-header p { margin: 0; color: #6b6b6b; line-height: 1.8; max-width: 640px; }
.grid { max-width: 1240px; margin: 0 auto; padding: 32px 32px 80px; display: flex; flex-wrap: wrap; gap: 40px; }
.card { width: 375px; flex: none; }
.card-head { margin-bottom: 14px; }
.card-head .name { font-size: 17px; font-weight: 700; letter-spacing: 0.5px; }
.card-head .pos { display: inline-block; margin-left: 10px; font-size: 12px; color: #8a8378; border: 1px solid #d8d2c4; border-radius: 999px; padding: 2px 10px; vertical-align: 2px; }
.card-head .fit { margin-top: 6px; font-size: 13px; color: #6b6b6b; }
.phone { width: 375px; background: #ffffff; border: 1px solid #dcd7cd; border-radius: 28px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
.phone-bar { height: 40px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #9a938a; background: #faf9f6; border-bottom: 1px solid #efede8; letter-spacing: 1px; }
.notes { margin-top: 14px; padding: 0 4px; }
.notes li { font-size: 12.5px; color: #6b6b6b; line-height: 1.7; margin-bottom: 4px; }
`

async function main() {
  const sections: string[] = []
  for (const theme of markdownStyles) {
    const note = notes[theme.id]
    if (!note) continue
    const html = await render({
      markdown: sample,
      markdownStyle: theme.id,
      codeTheme: 'github',
    })
    sections.push(`
      <div class="card" id="${theme.id}">
        <div class="card-head">
          <span class="name">${note.positioning.split(' · ')[0]}</span>
          <span class="pos">${theme.name}</span>
          <div class="fit">适合：${note.fit}</div>
        </div>
        <div class="phone">
          <div class="phone-bar">公众号预览 · 375px</div>
          ${html}
        </div>
        <ul class="notes">${note.signature.map(s => `<li>${s}</li>`).join('')}</ul>
      </div>`)
  }

  const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>公众号排版主题设计稿 · 纸上编辑部</title>
<style>${pageCss}</style>
</head>
<body>
<header class="page-header">
  <h1>公众号排版主题 · 纸上编辑部 Paper Press</h1>
  <p>6 套排版主题，统一设计语言「纸上编辑部」：柔和轻氧、学院学术、杂志风尚三个家族，各两套。家族之间换的是版式语言（网格、字体、记号），同族两套只换材质与密度。所有卡片均由插件真实渲染管线生成（juice 全内联），所见即发布效果。约束：微信内移动端阅读、仅内联样式、系统字体、无 hover 与外部资源。</p>
</header>
<main class="grid">${sections.join('\n')}</main>
</body>
</html>`

  const out = resolve(process.cwd(), 'docs', 'theme-preview.html')
  writeFileSync(out, page)
  console.log(`written: ${out}`)
}

main()
