export interface MarkdownStyle {
  id: string
  name: string
  css: string
}

// 共享基础：移动端优先的宽度、行宽与滚动容器，各主题只负责「气质层」
const COMMON_STYLE = `
#bm-md {
  font-size: 14px;
  line-height: 1.75;
  box-sizing: border-box;
  min-width: 200px;
  max-width: 100%; /* Mobile default */
  margin: 0 auto;
  padding: 16px 20px;
  overflow-wrap: break-word;
  word-wrap: break-word;
  word-break: break-word;
  text-align: left;
}

/* Tablet & Desktop Optimization */
@media (min-width: 768px) {
  #bm-md {
    max-width: 800px; /* Optimal reading width ~65-75 chars */
    padding: 32px 40px;
  }
}

/* Typography Scale */
#bm-md h1 { font-size: 1.8em; margin-top: 1.5em; margin-bottom: 0.8em; line-height: 1.2; }
#bm-md h2 { font-size: 1.5em; margin-top: 1.4em; margin-bottom: 0.6em; line-height: 1.3; }
#bm-md h3 { font-size: 1.25em; margin-top: 1.2em; margin-bottom: 0.5em; line-height: 1.4; }

/* Responsive Media */
#bm-md img, #bm-md video {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 1.5em auto;
  display: block;
}

/* Scrollable Code Blocks */
#bm-md pre {
  overflow-x: auto;
  white-space: pre;
  border-radius: 8px;
  margin: 1.5em 0;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
}

/* Responsive Tables */
#bm-md table {
  display: block;
  overflow-x: auto;
  width: 100%;
  border-collapse: collapse;
  margin: 1.5em 0;
  -webkit-overflow-scrolling: touch;
}

/* Base Form Elements (Checkboxes etc) */
#bm-md input[type="checkbox"] {
  margin-right: 0.5em;
  transform: scale(1.1);
}
`

// ---- 纸上编辑部 Paper Press ------------------------------------------------
// 三家族 × 两套的统一排版体系，针对公众号移动端阅读场景设计：
// 仅内联样式可用（juice 处理）、系统字体栈、无 hover / 无外部资源。
// 家族之间换的是版式语言（网格、字体、记号），同族两套只换材质与密度。

const SANS_CN =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
const SERIF_CN =
  'Georgia, "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif'
const MONO = 'Menlo, Consolas, "Courier New", monospace'

export const designerMarkdownStyles: MarkdownStyle[] = [
  // -- 柔和轻氧 Soft --------------------------------------------------------
  {
    id: 'mist',
    name: '晨雾 Mist',
    css: COMMON_STYLE + `
#bm-md { font-family: ${SANS_CN}; font-size: 15px; line-height: 2.0; letter-spacing: 0.3px; color: #4a5a68; background: #fbfcfd; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #2c3e4e; font-weight: 600; }
#bm-md h1 { font-size: 1.45em; text-align: center; margin-top: 1.4em; }
#bm-md h2 { font-size: 1.15em; text-align: center; margin-top: 2.1em; }
#bm-md h2::after { content: ""; display: block; width: 36px; height: 3px; border-radius: 2px; margin: 10px auto 0; background: linear-gradient(90deg, #9db9cd, #5b87a8); }
#bm-md h3 { font-size: 1.02em; color: #3f6485; }
#bm-md a { color: #3f6485; text-decoration: none; border-bottom: 1px solid #c3d4e0; }
#bm-md strong { color: #2c3e4e; font-weight: 600; }
#bm-md blockquote { border: none; background: #f0f5f9; padding: 16px 20px; color: #5a6b78; font-style: normal; border-radius: 14px; }
#bm-md blockquote p { margin: 0; }
#bm-md code { font-family: ${MONO}; font-size: 0.86em; background: #e8eff5; color: #3f6485; padding: 2px 7px; border-radius: 6px; }
#bm-md pre { background: #2e3f4e; padding: 16px; border-radius: 12px; }
#bm-md pre code { background: transparent; color: #dce7ef; padding: 0; }
#bm-md img { border-radius: 14px; }
#bm-md hr { border: none; border-top: 1px solid #dfe6ec; width: 50%; margin: 2.3em auto; }
#bm-md table th { background: #f0f5f9; color: #2c3e4e; }
#bm-md table th, #bm-md table td { border: 1px solid #e3eaf0; padding: 8px 12px; }
#bm-md ul li::marker, #bm-md ol li::marker { color: #5b87a8; }
    `,
  },
  {
    id: 'peach',
    name: '蜜桃 Peach',
    css: COMMON_STYLE + `
#bm-md { font-family: ${SANS_CN}; font-size: 15px; line-height: 1.95; letter-spacing: 0.3px; color: #4d4340; background: #fff9f6; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #3d322e; font-weight: 600; }
#bm-md h1 { font-size: 1.45em; text-align: center; }
#bm-md h2 { font-size: 1.02em; display: table; margin-top: 2.1em; background: #fce8e2; color: #b04a38; border-radius: 999px; padding: 7px 18px; }
#bm-md h3 { font-size: 1.02em; color: #c2543f; }
#bm-md h3::before { content: ""; display: inline-block; width: 7px; height: 7px; background: #f0a08c; border-radius: 50%; margin-right: 9px; vertical-align: 2px; }
#bm-md a { color: #c2543f; text-decoration: none; border-bottom: 1px solid #f2cabb; }
#bm-md strong { color: #b04a38; font-weight: 600; }
#bm-md blockquote { border-left: 4px solid #f2b8a8; background: #fdf0ec; padding: 15px 19px; color: #6d5c55; font-style: normal; border-radius: 0 14px 14px 0; }
#bm-md blockquote p { margin: 0; }
#bm-md code { font-family: ${MONO}; font-size: 0.86em; background: #fae7e0; color: #b04a38; padding: 2px 7px; border-radius: 6px; }
#bm-md pre { background: #453732; padding: 16px; border-radius: 14px; }
#bm-md pre code { background: transparent; color: #f6e8e1; padding: 0; }
#bm-md img { border-radius: 14px; }
#bm-md hr { border: none; border-top: 1px solid #f5ddd4; width: 55%; margin: 2.3em auto; }
#bm-md table th { background: #fdf0ec; color: #3d322e; }
#bm-md table th, #bm-md table td { border: 1px solid #f3e2da; padding: 8px 12px; }
    `,
  },

  // -- 学院学术 Academic ----------------------------------------------------
  {
    id: 'journal',
    name: '学报 Journal',
    css: COMMON_STYLE + `
#bm-md { font-family: ${SERIF_CN}; font-size: 15px; line-height: 2.0; letter-spacing: 0.3px; color: #222222; }
#bm-md h1, #bm-md h2, #bm-md h3 { font-family: ${SANS_CN}; color: #111111; }
#bm-md h1 { font-size: 1.45em; text-align: center; letter-spacing: 1px; }
#bm-md h2 { font-size: 1.15em; letter-spacing: 0.5px; border-bottom: 1px solid #c9c9c9; padding-bottom: 7px; margin-top: 2.2em; }
#bm-md h2::before { content: "§ "; color: #1e3a5f; margin-right: 2px; }
#bm-md h3 { font-size: 1em; color: #1e3a5f; }
#bm-md p { text-align: justify; text-indent: 2em; margin-bottom: 1.1em; }
#bm-md blockquote p, #bm-md li p, #bm-md td p { text-indent: 0; }
#bm-md a { color: #1e3a5f; text-decoration: underline; text-underline-offset: 3px; }
#bm-md strong { font-weight: 700; }
#bm-md blockquote { border-left: 3px solid #1e3a5f; background: #f6f8fb; padding: 13px 18px; color: #444444; font-style: normal; border-radius: 0 3px 3px 0; }
#bm-md code { font-family: ${MONO}; font-size: 0.85em; background: #eef1f6; color: #1e3a5f; padding: 2px 6px; border-radius: 3px; }
#bm-md pre { background: #1c2733; padding: 16px; border-radius: 4px; }
#bm-md pre code { background: transparent; color: #dfe6ee; padding: 0; }
#bm-md img { border-radius: 2px; }
#bm-md hr { border: none; border-top: 1px solid #cccccc; margin: 2.4em auto; width: 60%; }
#bm-md table th { border-top: 2px solid #111111; border-bottom: 1px solid #111111; background: transparent; color: #111111; }
#bm-md table td { border: none; }
#bm-md table tr:last-child td { border-bottom: 2px solid #111111; }
#bm-md table th, #bm-md table td { padding: 7px 12px; text-align: left; }
    `,
  },
  {
    id: 'notes',
    name: '笔记 Notes',
    css: COMMON_STYLE + `
#bm-md { font-family: ${SANS_CN}; font-size: 15px; line-height: 1.9; letter-spacing: 0.2px; color: #2f3a4c; background: #fdfcf6; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #222b3a; font-weight: 700; }
#bm-md h1 { font-size: 1.4em; }
#bm-md h2 { font-size: 1.15em; border-bottom: 2px dashed #aebadb; padding-bottom: 6px; margin-top: 2.1em; }
#bm-md h3 { font-size: 1.02em; color: #3b5bdb; }
#bm-md h3::before { content: "✎ "; color: #748ffc; }
#bm-md a { color: #3b5bdb; text-decoration: none; border-bottom: 1px dashed #91a7ff; }
#bm-md strong { font-weight: 700; background: linear-gradient(transparent 62%, #ffec99 0); }
#bm-md blockquote { border: 1px dashed #aebadb; background: #f4f6fd; padding: 14px 18px; color: #4a5568; font-style: normal; border-radius: 8px; }
#bm-md blockquote p { margin: 0; }
#bm-md code { font-family: ${MONO}; font-size: 0.85em; background: #edf1fb; color: #3b5bdb; padding: 2px 6px; border-radius: 4px; }
#bm-md pre { background: #242b3d; padding: 16px; border-radius: 8px; }
#bm-md pre code { background: transparent; color: #dde4f5; padding: 0; }
#bm-md img { border-radius: 8px; }
#bm-md hr { border: none; border-top: 2px dashed #c9d1e8; margin: 2.3em 0; }
#bm-md table th { background: #f4f6fd; color: #222b3a; }
#bm-md table th, #bm-md table td { border: 1px solid #dfe3f0; padding: 8px 12px; }
    `,
  },

  // -- 杂志风尚 Fashion -----------------------------------------------------
  {
    id: 'cover',
    name: '封面 Cover',
    css: COMMON_STYLE + `
#bm-md { font-family: ${SANS_CN}; font-size: 15px; line-height: 1.9; color: #262626; }
#bm-md h1, #bm-md h2, #bm-md h3 { font-family: ${SERIF_CN}; color: #111111; }
#bm-md h1 { font-size: 1.6em; border-top: 3px solid #111111; border-bottom: 1px solid #111111; padding: 16px 0 13px; letter-spacing: 1px; line-height: 1.4; }
#bm-md h2 { font-size: 1.18em; letter-spacing: 0.5px; border-bottom: 1px solid #111111; padding-bottom: 7px; margin-top: 2.2em; }
#bm-md h2::before { content: ""; display: inline-block; width: 10px; height: 10px; background: #c8102e; margin-right: 10px; }
#bm-md h3 { font-size: 1.02em; letter-spacing: 2px; }
#bm-md h3::before { content: "— "; color: #c8102e; }
#bm-md a { color: #c8102e; text-decoration: none; border-bottom: 1px solid #c8102e; }
#bm-md strong { color: #111111; font-weight: 700; }
#bm-md blockquote { border-top: 1px solid #111111; border-bottom: 1px solid #111111; border-left: none; background: transparent; padding: 15px 4px; color: #111111; font-size: 1.03em; font-weight: 500; font-style: normal; border-radius: 0; }
#bm-md blockquote p { margin: 0; }
#bm-md code { font-family: ${MONO}; font-size: 0.85em; background: #f2f2f2; color: #111111; padding: 2px 6px; border-radius: 0; }
#bm-md pre { background: #111111; padding: 16px; border-radius: 0; }
#bm-md pre code { background: transparent; color: #f5f5f5; padding: 0; }
#bm-md img { border-radius: 0; }
#bm-md hr { border: none; border-top: 2px solid #111111; margin: 2.4em 0; }
#bm-md table th { border-bottom: 2px solid #111111; background: transparent; color: #111111; }
#bm-md table th, #bm-md table td { border: none; border-bottom: 1px solid #dddddd; padding: 8px 12px; }
    `,
  },
  {
    id: 'booklet',
    name: '别册 Booklet',
    css: COMMON_STYLE + `
#bm-md { font-family: ${SERIF_CN}; font-size: 15px; line-height: 2.05; letter-spacing: 0.4px; color: #40342a; background: #faf6ef; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #2e241b; font-weight: 600; }
#bm-md h1 { font-size: 1.5em; text-align: center; letter-spacing: 1.5px; margin-top: 1.3em; }
#bm-md h1::after { content: ""; display: block; width: 44px; height: 2px; background: #9c5b23; margin: 13px auto 0; }
#bm-md h2 { font-size: 1.15em; border-bottom: 1px dotted #c8b08e; padding-bottom: 7px; margin-top: 2.1em; }
#bm-md h2::before { content: "◆ "; color: #9c5b23; font-size: 0.7em; vertical-align: 2px; }
#bm-md h3 { font-size: 1.02em; color: #7c4a1e; }
#bm-md a { color: #8a5220; text-decoration: none; border-bottom: 1px solid #dcc9a8; }
#bm-md strong { color: #6e3f16; font-weight: 600; }
#bm-md blockquote { border: 1px solid #e6dcc8; background: #f5efe3; padding: 14px 18px; color: #5c4f3f; font-style: normal; border-radius: 2px; }
#bm-md blockquote p { margin: 0; }
#bm-md code { font-family: ${MONO}; font-size: 0.85em; background: #f0e8da; color: #7c4a1e; padding: 2px 6px; border-radius: 3px; }
#bm-md pre { background: #33291f; padding: 16px; border-radius: 4px; }
#bm-md pre code { background: transparent; color: #ece2cf; padding: 0; }
#bm-md img { border-radius: 3px; }
#bm-md hr { border: none; border-top: 1px solid #ddd2ba; width: 40%; margin: 2.4em auto; }
#bm-md table th { background: #f5efe3; color: #2e241b; }
#bm-md table th, #bm-md table td { border: 1px solid #e6dcc8; padding: 8px 12px; }
#bm-md ul li::marker, #bm-md ol li::marker { color: #9c5b23; }
    `,
  },
]

// 完整主题列表，供设置面板与渲染查找使用
export const markdownStyles: MarkdownStyle[] = [...designerMarkdownStyles]

export function getMarkdownStyleCss(styleId: string): string {
  const style = markdownStyles.find(s => s.id === styleId)
  return style?.css || markdownStyles[0].css
}
