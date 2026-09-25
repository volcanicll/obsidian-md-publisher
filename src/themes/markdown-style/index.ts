export interface MarkdownStyle {
  id: string
  name: string
  css: string
}

// UI/UX Pro Max: Mobile-First Responsive Base Styles
// Optimized for readability with optimal line counts, touch targets, and visual hierarchy
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

/* Typography Scale (Golden Ratio-ish) */
#bm-md h1 { font-size: 1.8em; margin-top: 1.5em; margin-bottom: 0.8em; line-height: 1.2; }
#bm-md h2 { font-size: 1.5em; margin-top: 1.4em; margin-bottom: 0.6em; line-height: 1.3; }
#bm-md h3 { font-size: 1.25em; margin-top: 1.2em; margin-bottom: 0.5em; line-height: 1.4; }

/* Responsive Media */
#bm-md img, #bm-md video {
  max-width: 100%;
  height: auto;
  border-radius: 8px; /* Polished UI */
  margin: 1.5em auto;
  display: block;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
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

/* Blockquote Aesthetics */
#bm-md blockquote {
  margin: 1.5em 0;
  border-radius: 0 4px 4px 0;
}

/* Base Form Elements (Checkboxes etc) */
#bm-md input[type="checkbox"] {
  margin-right: 0.5em;
  transform: scale(1.1); /* Touch friendly */
}
`

const markdownStylesCore: MarkdownStyle[] = [
  {
    id: 'ayu-light',
    name: 'Ayu Light',
    css: COMMON_STYLE + `
#bm-md { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.8; color: #5c6166; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #ff9940; font-weight: 600; }
#bm-md h1 { border-bottom: 2px solid #ff9940; padding-bottom: 8px; }
#bm-md a { color: #399ee6; text-decoration: none; }
#bm-md blockquote { border-left: 4px solid #ff9940; background: #fafafa; padding: 12px 16px; }
#bm-md code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; }
#bm-md pre { background: #fafafa; padding: 16px; }
    `
  },
  {
    id: 'apple',
    name: 'Apple',
    css: COMMON_STYLE + `
#bm-md { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; line-height: 1.6; color: #1d1d1f; letter-spacing: -0.01em; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #1d1d1f; font-weight: 700; letter-spacing: -0.015em; }
#bm-md a { color: #0066cc; text-decoration: none; }
#bm-md blockquote { border-left: 4px solid #d2d2d7; padding-left: 16px; color: #86868b; font-style: italic; }
#bm-md code { font-family: "SF Mono", Menlo, monospace; font-size: 0.9em; background: #f5f5f7; padding: 2px 6px; border-radius: 4px; color: #1d1d1f; }
#bm-md pre { background: #f5f5f7; padding: 16px; border-radius: 8px; overflow-x: auto; color: #1d1d1f; font-family: "SF Mono", Menlo, monospace; line-height: 1.4; }
#bm-md ul, #bm-md ol { padding-left: 1.5em; }
#bm-md li { margin-bottom: 0.3em; }
    `
  },
  {
    id: 'bauhaus',
    name: 'Bauhaus',
    css: COMMON_STYLE + `
#bm-md { font-family: Futura, "Trebuchet MS", sans-serif; line-height: 1.7; color: #1a1a1a; }
#bm-md h1 { color: #e63946; font-weight: 900; }
#bm-md h2 { color: #1d3557; background: #f1faee; padding: 8px 16px; border-radius: 4px; }
#bm-md h3 { color: #457b9d; }
#bm-md a { color: #e63946; font-weight: 600; text-decoration: none; }
#bm-md blockquote { border-left: 8px solid #e63946; background: #f1faee; padding: 12px 16px; }
#bm-md code { background: #a8dadc; padding: 2px 6px; border-radius: 0; }
#bm-md pre { background: #1d3557; color: #f1faee; padding: 16px; }
    `
  },
  {
    id: 'lawning',
    name: 'Lawning',
    css: COMMON_STYLE + `
#bm-md { font-family: "Georgia", serif; line-height: 1.8; color: #435046; background: #fdfcf8; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #2d4536; font-family: -apple-system, sans-serif; font-weight: 600; }
#bm-md h1 { border-bottom: 3px solid #abc4b3; padding-bottom: 10px; display: inline-block; padding-right: 20px; }
#bm-md h2 { color: #4a6c56; }
#bm-md a { color: #5c8d70; text-decoration: none; border-bottom: 1px solid #abc4b3; }
#bm-md blockquote { border-left: 4px solid #abc4b3; background: #f3f6f4; padding: 16px 20px; font-style: italic; color: #586b5d; border-radius: 8px; }
#bm-md code { background: #e8ede9; color: #2d4536; padding: 2px 6px; border-radius: 4px; font-family: "Menlo", monospace; font-size: 0.9em; }
#bm-md pre { background: #2d4536; color: #e8ede9; padding: 16px; border-radius: 8px; }
#bm-md ul li::marker { color: #abc4b3; }
    `
  },
  {
    id: 'novel',
    name: 'Novel',
    css: COMMON_STYLE + `
#bm-md { font-family: "Merriweather", "Georgia", serif; line-height: 2; color: #2c2c2c; background: #f9f7f1; letter-spacing: 0.01em; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #1a1a1a; font-family: "Playfair Display", serif; font-weight: 700; text-align: center; }
#bm-md h1 { letter-spacing: 0.05em; margin-top: 1em; }
#bm-md h2 { margin-top: 2em; margin-bottom: 1em; font-style: italic; font-weight: 400; }
#bm-md p { margin-bottom: 1.5em; text-indent: 2em; text-align: justify; }
#bm-md a { color: #8b4513; text-decoration: underline; text-underline-offset: 4px; }
#bm-md blockquote { border-left: none; padding: 20px 40px; font-style: italic; color: #555; background: transparent; position: relative; text-align: center; }
#bm-md blockquote::before { content: "\u201c"; font-size: 3em; color: #dcdcdc; position: absolute; top: 0; left: 10px; font-family: serif; }
#bm-md code { background: transparent; font-style: italic; color: #555; font-family: inherit; }
#bm-md pre { background: #efebe4; padding: 20px; border: 1px solid #dcdcdc; border-radius: 2px; font-size: 0.9em; line-height: 1.5; font-family: "Courier New", monospace; text-indent: 0; text-align: left; }
#bm-md ul, #bm-md ol { margin-left: 2em; margin-bottom: 1.5em; }
#bm-md li { margin-bottom: 0.5em; }
    `
  },
]

// ---- Designer series -------------------------------------------------------
// 六套有明确立场的排版主题，针对公众号移动端阅读场景设计：
// 仅内联样式可用（juice 处理）、系统字体栈、无 hover / 无外部资源。

const SANS_CN =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
const SERIF_CN =
  'Georgia, "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif'

export const designerMarkdownStyles: MarkdownStyle[] = [
  {
    id: 'ink-wash',
    name: '墨韵 Ink',
    css: COMMON_STYLE + `
#bm-md { font-family: ${SERIF_CN}; font-size: 15px; line-height: 2.05; letter-spacing: 0.4px; color: #2b2b2b; background: #fcfbf7; padding: 24px 22px; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #1a1a1a; font-weight: 600; }
#bm-md h1 { font-size: 1.55em; text-align: center; letter-spacing: 2px; margin-top: 1.2em; }
#bm-md h2 { font-size: 1.22em; text-align: center; letter-spacing: 1px; margin-top: 2em; }
#bm-md h2::before { content: "「"; color: #b03a2e; margin-right: 4px; }
#bm-md h2::after { content: "」"; color: #b03a2e; margin-left: 4px; }
#bm-md h3 { font-size: 1.05em; border-left: 3px solid #b03a2e; padding-left: 10px; }
#bm-md a { color: #b03a2e; text-decoration: none; border-bottom: 1px solid #dcb5ae; }
#bm-md strong { color: #8c2f24; font-weight: 600; }
#bm-md blockquote { border-left: 3px solid #b03a2e; background: #f5f0e6; padding: 14px 18px; color: #5a5248; font-style: normal; }
#bm-md code { font-family: Menlo, Consolas, monospace; font-size: 0.86em; background: #efe9db; color: #8c3b2e; padding: 2px 6px; border-radius: 3px; }
#bm-md pre { background: #2b2926; padding: 16px; border-radius: 4px; }
#bm-md pre code { background: transparent; color: #e8e2d5; padding: 0; }
#bm-md img { border-radius: 2px; border: 1px solid #e5dfd0; box-shadow: none; }
#bm-md hr { border: none; border-top: 1px solid #d8d2c2; width: 42%; margin: 2.4em auto; }
#bm-md table th { background: #f5f0e6; color: #1a1a1a; }
#bm-md table th, #bm-md table td { border: 1px solid #e0d9c8; padding: 8px 12px; }
    `,
  },
  {
    id: 'tech-note',
    name: '科技蓝 Tech',
    css: COMMON_STYLE + `
#bm-md { font-family: ${SANS_CN}; font-size: 15px; line-height: 1.9; letter-spacing: 0.3px; color: #333333; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #111827; font-weight: 600; }
#bm-md h1 { font-size: 1.5em; }
#bm-md h2 { font-size: 1.2em; background: #f5f8ff; border-left: 4px solid #2563eb; border-radius: 0 4px 4px 0; padding: 8px 14px; margin-top: 1.8em; }
#bm-md h3 { font-size: 1.05em; color: #1d4ed8; }
#bm-md a { color: #2563eb; text-decoration: none; border-bottom: 1px solid #bfdbfe; }
#bm-md strong { color: #111827; }
#bm-md blockquote { border-left: 3px solid #93c5fd; background: #f8fafc; padding: 14px 16px; color: #475569; font-style: normal; border-radius: 0 4px 4px 0; }
#bm-md code { font-family: Menlo, Consolas, monospace; font-size: 0.86em; background: #eef2ff; color: #1d4ed8; padding: 2px 6px; border-radius: 4px; }
#bm-md pre { background: #0f172a; padding: 16px; border-radius: 8px; }
#bm-md pre code { background: transparent; color: #e2e8f0; padding: 0; }
#bm-md img { border-radius: 6px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); }
#bm-md hr { border: none; border-top: 1px solid #e5e7eb; margin: 2.2em 0; }
#bm-md table th { background: #f5f8ff; color: #1e293b; }
#bm-md table th, #bm-md table td { border: 1px solid #e5e7eb; padding: 8px 12px; }
#bm-md table tr:nth-child(even) td { background: #fafbfd; }
    `,
  },
  {
    id: 'celadon',
    name: '青瓷 Celadon',
    css: COMMON_STYLE + `
#bm-md { font-family: ${SANS_CN}; font-size: 15px; line-height: 1.85; letter-spacing: 0.3px; color: #3d4b47; background: #fbfdfc; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #134e4a; font-weight: 600; }
#bm-md h1 { font-size: 1.45em; text-align: center; }
#bm-md h2 { font-size: 1.2em; text-align: center; margin-top: 2em; }
#bm-md h2::after { content: ""; display: block; width: 36px; height: 3px; background: #14b8a6; border-radius: 2px; margin: 8px auto 0; }
#bm-md h3 { font-size: 1.05em; }
#bm-md h3::before { content: ""; display: inline-block; width: 7px; height: 7px; background: #14b8a6; border-radius: 50%; margin-right: 8px; vertical-align: 2px; }
#bm-md a { color: #0d9488; text-decoration: none; }
#bm-md strong { color: #0f766e; font-weight: 600; }
#bm-md blockquote { border: none; background: #ecfdf5; padding: 16px 18px; color: #365551; font-style: normal; border-radius: 12px; }
#bm-md code { font-family: Menlo, Consolas, monospace; font-size: 0.86em; background: #e6f5f1; color: #0f766e; padding: 2px 7px; border-radius: 6px; }
#bm-md pre { background: #134e4a; padding: 16px; border-radius: 12px; }
#bm-md pre code { background: transparent; color: #ccfbf1; padding: 0; }
#bm-md img { border-radius: 12px; box-shadow: none; }
#bm-md hr { border: none; border-top: 1px solid #cce8e2; margin: 2.2em auto; width: 60%; }
#bm-md table th { background: #ecfdf5; color: #134e4a; }
#bm-md table th, #bm-md table td { border: 1px solid #d5ece5; padding: 8px 12px; }
    `,
  },
  {
    id: 'editorial',
    name: '志刊 Editorial',
    css: COMMON_STYLE + `
#bm-md { font-family: ${SERIF_CN}; font-size: 15px; line-height: 1.95; color: #111111; letter-spacing: 0.3px; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #111111; font-weight: 700; }
#bm-md h1 { font-size: 1.6em; border-top: 3px solid #111111; border-bottom: 1px solid #111111; padding: 14px 0 12px; letter-spacing: 1px; line-height: 1.4; }
#bm-md h2 { font-size: 1.15em; letter-spacing: 2px; border-bottom: 2px solid #111111; padding-bottom: 8px; margin-top: 2.2em; }
#bm-md h2::before { content: ""; display: inline-block; width: 9px; height: 9px; background: #d4301e; margin-right: 10px; }
#bm-md h3 { font-size: 1em; letter-spacing: 1.5px; }
#bm-md a { color: #d4301e; text-decoration: none; border-bottom: 1px solid #d4301e; }
#bm-md strong { font-weight: 700; }
#bm-md blockquote { border-top: 1px solid #111111; border-bottom: 1px solid #111111; border-left: none; background: transparent; padding: 16px 4px; color: #333333; font-size: 1.04em; font-weight: 500; font-style: normal; border-radius: 0; }
#bm-md code { font-family: Menlo, Consolas, monospace; font-size: 0.85em; background: #f2f2f2; color: #111111; padding: 2px 6px; border-radius: 0; }
#bm-md pre { background: #111111; padding: 16px; border-radius: 0; }
#bm-md pre code { background: transparent; color: #f5f5f5; padding: 0; }
#bm-md img { border-radius: 0; box-shadow: none; }
#bm-md hr { border: none; border-top: 1px solid #111111; margin: 2.4em 0; }
#bm-md table th { border-bottom: 2px solid #111111; background: transparent; }
#bm-md table th, #bm-md table td { border: none; border-bottom: 1px solid #dddddd; padding: 8px 12px; }
    `,
  },
  {
    id: 'ember',
    name: '暖橘 Ember',
    css: COMMON_STYLE + `
#bm-md { font-family: ${SANS_CN}; font-size: 15px; line-height: 1.9; letter-spacing: 0.4px; color: #4a403a; background: #fffaf4; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #3d2e24; font-weight: 600; }
#bm-md h1 { font-size: 1.45em; text-align: center; }
#bm-md h2 { font-size: 1.2em; margin-top: 2em; }
#bm-md h2::before { content: ""; display: inline-block; width: 8px; height: 8px; background: #e8833a; border-radius: 50%; margin-right: 10px; vertical-align: 2px; }
#bm-md h3 { font-size: 1.05em; color: #b45309; }
#bm-md a { color: #d97b29; text-decoration: none; border-bottom: 1px solid #f3d0ab; }
#bm-md strong { color: #c2571b; font-weight: 600; }
#bm-md blockquote { border-left: 4px solid #f3c98b; background: #fdf3e3; padding: 16px 18px; color: #6b5544; font-style: normal; border-radius: 0 10px 10px 0; }
#bm-md code { font-family: Menlo, Consolas, monospace; font-size: 0.86em; background: #fdeedc; color: #b45309; padding: 2px 6px; border-radius: 4px; }
#bm-md pre { background: #3b2f2a; padding: 16px; border-radius: 10px; }
#bm-md pre code { background: transparent; color: #f5e9d9; padding: 0; }
#bm-md img { border-radius: 10px; box-shadow: none; }
#bm-md hr { border: none; border-top: 1px solid #f0dcc4; width: 55%; margin: 2.2em auto; }
#bm-md table th { background: #fdf3e3; color: #3d2e24; }
#bm-md table th, #bm-md table td { border: 1px solid #f0e2cf; padding: 8px 12px; }
    `,
  },
  {
    id: 'mono-prose',
    name: '极简 Mono',
    css: COMMON_STYLE + `
#bm-md { font-family: ${SANS_CN}; font-size: 15px; line-height: 1.9; color: #000000; letter-spacing: 0.2px; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #000000; font-weight: 700; }
#bm-md h1 { font-size: 1.35em; margin-top: 1.6em; }
#bm-md h2 { font-size: 1.15em; margin-top: 2.2em; }
#bm-md h3 { font-size: 1em; }
#bm-md a { color: #000000; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
#bm-md strong { font-weight: 700; }
#bm-md blockquote { border-left: 2px solid #000000; background: transparent; padding: 2px 0 2px 16px; color: #555555; font-style: normal; border-radius: 0; }
#bm-md code { font-family: Menlo, Consolas, monospace; font-size: 0.85em; background: #f2f2f2; color: #000000; padding: 2px 5px; border-radius: 2px; }
#bm-md pre { background: #f7f7f7; padding: 16px; border: 1px solid #e5e5e5; border-radius: 4px; }
#bm-md pre code { background: transparent; color: #000000; padding: 0; }
#bm-md img { border-radius: 0; box-shadow: none; }
#bm-md hr { border: none; border-top: 1px solid #e5e5e5; margin: 2.2em 0; }
#bm-md table th, #bm-md table td { border: none; border-bottom: 1px solid #e5e5e5; padding: 8px 4px; }
    `,
  },
]

// 完整主题列表：内置主题 + 设计师系列，供设置面板与渲染查找使用
export const markdownStyles: MarkdownStyle[] = [...markdownStylesCore, ...designerMarkdownStyles]

export function getMarkdownStyleCss(styleId: string): string {
  const style = markdownStyles.find(s => s.id === styleId)
  return style?.css || markdownStyles[0].css
}
