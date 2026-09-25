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
  'ink-wash': {
    id: 'ink-wash',
    positioning: '书卷文人 · 新中式',
    signature: [
      '宋体正文 + 2.05 行高，宣纸底色 #fcfbf7',
      'h2 以朱砂「」括起，h3 用朱砂侧栏，全篇唯一强调色',
      '引用为米色签条，代码块是墨色底',
    ],
    fit: '读书、文化、散文、国风类账号',
  },
  'tech-note': {
    id: 'tech-note',
    positioning: '科技信息 · 深度长文',
    signature: [
      'h2 蓝色侧栏 + 浅蓝底色块，扫读时锚点极清晰',
      '行内代码蓝紫底蓝字，代码块深板岩底',
      '表格斑马纹，信息密度友好',
    ],
    fit: '技术、产品、AI、行业分析类账号',
  },
  celadon: {
    id: 'celadon',
    positioning: '青瓷清新 · 卡片化',
    signature: [
      'h2 居中 + 青瓷下划短线，h3 带圆点标记',
      '引用、代码块、图片全部 12px 大圆角卡片',
      '青绿色系贯穿，整体透气柔和',
    ],
    fit: '生活方式、科普、职场、成长类账号',
  },
  editorial: {
    id: 'editorial',
    positioning: '编辑部杂志 · 黑白高对比',
    signature: [
      'h1 上下双线（粗+细）报头式处理',
      'h2 黑色下划线 + 朱红方块序标，红色仅用于链接与序标',
      '引用为上下细线的 pull-quote，去底色、无圆角',
    ],
    fit: '人物专访、品牌叙事、深度非虚构类账号',
  },
  ember: {
    id: 'ember',
    positioning: '暖橘情绪 · 陪伴感',
    signature: [
      '奶油底 #fffaf4 + 暖褐正文，降低冷感',
      'h2 橘色圆点引导，h3 直接用橘色',
      '引用为奶油卡片配杏色侧栏，圆角收边',
    ],
    fit: '情感、亲子、美食、晚安陪伴类账号',
  },
  'mono-prose': {
    id: 'mono-prose',
    positioning: '极简文字 · 排版退后',
    signature: [
      '零装饰：无底色、无圆角、无阴影，层级只靠字重与留白',
      '链接纯黑下划线，引用只是 2px 黑色侧线',
      '表格只保留水平细线',
    ],
    fit: '随笔、产品札记、克制型个人账号',
  },
  'ayu-light': {
    id: 'ayu-light',
    positioning: '暖橘轻快 · 默认主题',
    signature: ['渲染默认值，橘色标题配下划线', '整体轻快、无侵入'],
    fit: '通用日常更新',
  },
  apple: {
    id: 'apple',
    positioning: '苹果官网 · 克制干净',
    signature: ['SF 字体栈 + 紧字距，灰阶引用', '公众号主流审美的安全牌'],
    fit: '产品介绍、通用科技内容',
  },
  bauhaus: {
    id: 'bauhaus',
    positioning: '包豪斯 · 色块创意',
    signature: ['红蓝撞色标题，色块 h2', '深蓝代码块与整体色系呼应'],
    fit: '设计、创意、活动通知',
  },
  lawning: {
    id: 'lawning',
    positioning: '草坪 · 衬线绿意',
    signature: ['Georgia 衬线正文 + 无衬线标题', '奶油底色与鼠尾草绿点缀'],
    fit: '自然、园艺、慢生活',
  },
  novel: {
    id: 'novel',
    positioning: '小说 · 文学连载',
    signature: ['正文 2em 首行缩进两端对齐', '居中衬线标题，引用为大引号浮标'],
    fit: '小说、散文、长篇连载',
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
<title>公众号排版主题设计稿 · Designer Series</title>
<style>${pageCss}</style>
</head>
<body>
<header class="page-header">
  <h1>公众号排版主题 · Designer Series</h1>
  <p>11 套精选排版方案（5 套经典保留 + 6 套设计师系列），已删除不可用与重复的 13 套旧主题，覆盖六个不同维度而非六个强调色。所有卡片均由插件真实渲染管线生成（juice 全内联），所见即发布效果。约束：微信内移动端阅读、仅内联样式、系统字体、无 hover 与外部资源。</p>
</header>
<main class="grid">${sections.join('\n')}</main>
</body>
</html>`

  const out = resolve(process.cwd(), 'docs', 'theme-preview.html')
  writeFileSync(out, page)
  console.log(`written: ${out}`)
}

main()
