export interface CodeTheme {
  id: string
  name: string
  css: string
}

// Bundled code highlight CSS (simplified highlight.js compatible styles)
export const codeThemes: CodeTheme[] = [
  {
    id: 'github',
    name: 'GitHub',
    css: `
.hljs { color: #24292e; background: #f6f8fa; }
.hljs-keyword, .hljs-selector-tag { color: #d73a49; }
.hljs-string, .hljs-attr { color: #032f62; }
.hljs-comment { color: #6a737d; font-style: italic; }
.hljs-function, .hljs-title { color: #6f42c1; }
.hljs-number { color: #005cc5; }
.hljs-built_in { color: #e36209; }
    `
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    css: `
.hljs { color: #e6edf3; background: #161b22; }
.hljs-keyword, .hljs-selector-tag { color: #ff7b72; }
.hljs-string, .hljs-attr { color: #a5d6ff; }
.hljs-comment { color: #8b949e; font-style: italic; }
.hljs-function, .hljs-title { color: #d2a8ff; }
.hljs-number { color: #79c0ff; }
.hljs-built_in { color: #ffa657; }
    `
  },
  {
    id: 'monokai',
    name: 'Monokai',
    css: `
.hljs { color: #f8f8f2; background: #272822; }
.hljs-keyword, .hljs-selector-tag { color: #f92672; }
.hljs-string, .hljs-attr { color: #e6db74; }
.hljs-comment { color: #75715e; font-style: italic; }
.hljs-function, .hljs-title { color: #a6e22e; }
.hljs-number { color: #ae81ff; }
.hljs-built_in { color: #66d9ef; }
    `
  },
  {
    id: 'dracula',
    name: 'Dracula',
    css: `
.hljs { color: #f8f8f2; background: #282a36; }
.hljs-keyword, .hljs-selector-tag { color: #ff79c6; }
.hljs-string, .hljs-attr { color: #f1fa8c; }
.hljs-comment { color: #6272a4; font-style: italic; }
.hljs-function, .hljs-title { color: #50fa7b; }
.hljs-number { color: #bd93f9; }
.hljs-built_in { color: #8be9fd; }
    `
  },
  {
    id: 'nord',
    name: 'Nord',
    css: `
.hljs { color: #d8dee9; background: #2e3440; }
.hljs-keyword, .hljs-selector-tag { color: #81a1c1; }
.hljs-string, .hljs-attr { color: #a3be8c; }
.hljs-comment { color: #616e88; font-style: italic; }
.hljs-function, .hljs-title { color: #88c0d0; }
.hljs-number { color: #b48ead; }
.hljs-built_in { color: #ebcb8b; }
    `
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    css: `
.hljs { color: #abb2bf; background: #282c34; }
.hljs-keyword, .hljs-selector-tag { color: #c678dd; }
.hljs-string, .hljs-attr { color: #98c379; }
.hljs-comment { color: #5c6370; font-style: italic; }
.hljs-function, .hljs-title { color: #61afef; }
.hljs-number { color: #d19a66; }
.hljs-built_in { color: #e5c07b; }
    `
  },
  {
    id: 'one-light',
    name: 'One Light',
    css: `
.hljs { color: #383a42; background: #fafafa; }
.hljs-keyword, .hljs-selector-tag { color: #a626a4; }
.hljs-string, .hljs-attr { color: #50a14f; }
.hljs-comment { color: #a0a1a7; font-style: italic; }
.hljs-function, .hljs-title { color: #4078f2; }
.hljs-number { color: #986801; }
.hljs-built_in { color: #c18401; }
    `
  },
  {
    id: 'atom-one-dark',
    name: 'Atom One Dark',
    css: `
.hljs { color: #abb2bf; background: #282c34; }
.hljs-keyword, .hljs-selector-tag { color: #c678dd; }
.hljs-string, .hljs-attr { color: #98c379; }
.hljs-comment { color: #5c6370; font-style: italic; }
.hljs-function, .hljs-title { color: #61afef; }
.hljs-number { color: #d19a66; }
.hljs-built_in { color: #e06c75; }
    `
  },
  {
    id: 'atom-one-light',
    name: 'Atom One Light',
    css: `
.hljs { color: #383a42; background: #fafafa; }
.hljs-keyword, .hljs-selector-tag { color: #a626a4; }
.hljs-string, .hljs-attr { color: #50a14f; }
.hljs-comment { color: #a0a1a7; font-style: italic; }
.hljs-function, .hljs-title { color: #4078f2; }
.hljs-number { color: #986801; }
.hljs-built_in { color: #e45649; }
    `
  },
  {
    id: 'vs',
    name: 'Visual Studio',
    css: `
.hljs { color: #000; background: #fff; }
.hljs-keyword, .hljs-selector-tag { color: #00f; }
.hljs-string, .hljs-attr { color: #a31515; }
.hljs-comment { color: #008000; font-style: italic; }
.hljs-function, .hljs-title { color: #795e26; }
.hljs-number { color: #098658; }
.hljs-built_in { color: #267f99; }
    `
  },
  {
    id: 'vs2015',
    name: 'VS 2015 Dark',
    css: `
.hljs { color: #dcdcdc; background: #1e1e1e; }
.hljs-keyword, .hljs-selector-tag { color: #569cd6; }
.hljs-string, .hljs-attr { color: #d69d85; }
.hljs-comment { color: #57a64a; font-style: italic; }
.hljs-function, .hljs-title { color: #dcdcaa; }
.hljs-number { color: #b5cea8; }
.hljs-built_in { color: #4ec9b0; }
    `
  },
  {
    id: 'xcode',
    name: 'Xcode',
    css: `
.hljs { color: #000; background: #fff; }
.hljs-keyword, .hljs-selector-tag { color: #aa0d91; }
.hljs-string, .hljs-attr { color: #c41a16; }
.hljs-comment { color: #007400; font-style: italic; }
.hljs-function, .hljs-title { color: #1c00cf; }
.hljs-number { color: #1c00cf; }
.hljs-built_in { color: #5c2699; }
    `
  },
  {
    id: 'kimbie-light',
    name: 'Kimbie Light',
    css: `
.hljs { color: #84613d; background: #fbebd4; }
.hljs-keyword, .hljs-selector-tag { color: #98676a; }
.hljs-string, .hljs-attr { color: #889b4a; }
.hljs-comment { color: #a57a4c; font-style: italic; }
.hljs-function, .hljs-title { color: #dc3958; }
.hljs-number { color: #f79a32; }
.hljs-built_in { color: #98676a; }
    `
  },
  {
    id: 'kimbie-dark',
    name: 'Kimbie Dark',
    css: `
.hljs { color: #d3af86; background: #221a0f; }
.hljs-keyword, .hljs-selector-tag { color: #98676a; }
.hljs-string, .hljs-attr { color: #889b4a; }
.hljs-comment { color: #a57a4c; font-style: italic; }
.hljs-function, .hljs-title { color: #dc3958; }
.hljs-number { color: #f79a32; }
.hljs-built_in { color: #98676a; }
    `
  },
]

export function getCodeThemeCss(themeId: string): string {
  const theme = codeThemes.find(t => t.id === themeId)
  return theme?.css || codeThemes[0].css
}
