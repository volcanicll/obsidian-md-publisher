export interface MarkdownStyle {
  id: string
  name: string
  css: string
}

// Bundled CSS for each theme (simplified versions)
export const markdownStyles: MarkdownStyle[] = [
  {
    id: 'ayu-light',
    name: 'Ayu Light',
    css: `
#bm-md { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.8; color: #5c6166; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #ff9940; font-weight: 600; }
#bm-md h1 { font-size: 1.8em; border-bottom: 2px solid #ff9940; padding-bottom: 8px; }
#bm-md h2 { font-size: 1.5em; }
#bm-md a { color: #399ee6; }
#bm-md blockquote { border-left: 4px solid #ff9940; background: #fafafa; padding: 12px 16px; margin: 16px 0; }
#bm-md code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
#bm-md pre { background: #fafafa; padding: 16px; border-radius: 6px; }
    `
  },
  {
    id: 'professional',
    name: 'Professional',
    css: `
#bm-md { font-family: Georgia, "Times New Roman", serif; line-height: 1.9; color: #333; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #1a1a1a; font-weight: 700; }
#bm-md h1 { font-size: 2em; margin-bottom: 16px; }
#bm-md h2 { font-size: 1.6em; border-bottom: 1px solid #eee; padding-bottom: 8px; }
#bm-md a { color: #0066cc; }
#bm-md blockquote { border-left: 4px solid #0066cc; background: #f9f9f9; padding: 12px 16px; font-style: italic; }
#bm-md code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: Consolas, monospace; }
#bm-md pre { background: #f4f4f4; padding: 16px; border-radius: 4px; border: 1px solid #e0e0e0; }
    `
  },
  {
    id: 'green-simple',
    name: 'GreenSimple',
    css: `
#bm-md { font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.8; color: #333; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #2e7d32; font-weight: 600; }
#bm-md h1 { font-size: 1.8em; }
#bm-md h2 { font-size: 1.5em; border-left: 4px solid #2e7d32; padding-left: 12px; }
#bm-md a { color: #43a047; }
#bm-md blockquote { border-left: 4px solid #81c784; background: #f1f8e9; padding: 12px 16px; }
#bm-md code { background: #e8f5e9; padding: 2px 6px; border-radius: 3px; color: #2e7d32; }
#bm-md pre { background: #f1f8e9; padding: 16px; border-radius: 6px; }
    `
  },
  {
    id: 'terminal',
    name: 'Terminal',
    css: `
#bm-md { font-family: "SF Mono", Monaco, Consolas, monospace; line-height: 1.7; color: #00ff00; background: #1e1e1e; padding: 20px; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #00ff00; font-weight: 600; }
#bm-md h1::before { content: "# "; }
#bm-md h2::before { content: "## "; }
#bm-md a { color: #00bcd4; }
#bm-md blockquote { border-left: 4px solid #00ff00; background: #2d2d2d; padding: 12px 16px; color: #aaa; }
#bm-md code { background: #2d2d2d; padding: 2px 6px; border-radius: 3px; color: #ff6b6b; }
#bm-md pre { background: #0d0d0d; padding: 16px; border-radius: 4px; border: 1px solid #333; }
    `
  },
  {
    id: 'retro',
    name: 'Retro',
    css: `
#bm-md { font-family: "Courier New", Courier, monospace; line-height: 1.8; color: #3d2914; background: #f4e4c1; padding: 20px; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #8b4513; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; }
#bm-md h1 { font-size: 1.6em; border-bottom: 3px double #8b4513; }
#bm-md a { color: #b22222; }
#bm-md blockquote { border-left: 4px solid #8b4513; background: #efe0c0; padding: 12px 16px; }
#bm-md code { background: #d4c4a0; padding: 2px 6px; border-radius: 0; }
#bm-md pre { background: #efe0c0; padding: 16px; border: 2px solid #8b4513; }
    `
  },
  {
    id: 'bauhaus',
    name: 'Bauhaus',
    css: `
#bm-md { font-family: Futura, "Trebuchet MS", sans-serif; line-height: 1.7; color: #1a1a1a; }
#bm-md h1 { font-size: 2.2em; color: #e63946; font-weight: 900; text-transform: uppercase; }
#bm-md h2 { font-size: 1.6em; color: #1d3557; background: #f1faee; padding: 8px 16px; }
#bm-md h3 { color: #457b9d; }
#bm-md a { color: #e63946; font-weight: 600; }
#bm-md blockquote { border-left: 8px solid #e63946; background: #f1faee; padding: 12px 16px; }
#bm-md code { background: #a8dadc; padding: 2px 6px; border-radius: 0; }
#bm-md pre { background: #1d3557; color: #f1faee; padding: 16px; }
    `
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    css: `
#bm-md { font-family: "Segoe UI", Roboto, sans-serif; line-height: 1.8; color: #fff; background: #0a4d8c; padding: 20px; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #fff; font-weight: 600; }
#bm-md h1 { font-size: 1.8em; border-bottom: 2px solid #fff; }
#bm-md a { color: #7fc8f8; }
#bm-md blockquote { border-left: 4px solid #fff; background: rgba(255,255,255,0.1); padding: 12px 16px; }
#bm-md code { background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 3px; }
#bm-md pre { background: #063a69; padding: 16px; border-radius: 4px; }
    `
  },
  {
    id: 'botanical',
    name: 'Botanical',
    css: `
#bm-md { font-family: "Palatino Linotype", Palatino, serif; line-height: 1.9; color: #3c4a3e; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #2d5a27; font-weight: 600; }
#bm-md h1 { font-size: 1.9em; }
#bm-md h2 { font-size: 1.5em; }
#bm-md a { color: #6b8e23; }
#bm-md blockquote { border-left: 4px solid #6b8e23; background: #f0f7e6; padding: 12px 16px; }
#bm-md code { background: #e8f4e0; padding: 2px 6px; border-radius: 3px; color: #2d5a27; }
#bm-md pre { background: #f0f7e6; padding: 16px; border-radius: 6px; }
    `
  },
  {
    id: 'maximalism',
    name: 'Maximalism',
    css: `
#bm-md { font-family: "Comic Sans MS", cursive, sans-serif; line-height: 1.8; color: #333; background: linear-gradient(135deg, #fff5f5, #f5f5ff, #f5fff5); padding: 20px; }
#bm-md h1 { font-size: 2em; color: #ff1493; text-shadow: 2px 2px #ffd700; }
#bm-md h2 { font-size: 1.6em; color: #00ced1; }
#bm-md h3 { color: #ff6347; }
#bm-md a { color: #ff1493; font-weight: 700; }
#bm-md blockquote { border-left: 6px solid #ff1493; background: #fffacd; padding: 12px 16px; }
#bm-md code { background: #e0ffff; padding: 2px 6px; border-radius: 8px; color: #ff6347; }
#bm-md pre { background: #fffacd; padding: 16px; border: 2px dashed #ff1493; }
    `
  },
  {
    id: 'neo-brutalism',
    name: 'Neo-Brutalism',
    css: `
#bm-md { font-family: "Arial Black", Gadget, sans-serif; line-height: 1.7; color: #000; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #000; font-weight: 900; text-transform: uppercase; }
#bm-md h1 { font-size: 2em; background: #ffde59; padding: 8px 16px; border: 3px solid #000; }
#bm-md h2 { font-size: 1.5em; border-bottom: 3px solid #000; }
#bm-md a { color: #000; background: #ffde59; font-weight: 700; }
#bm-md blockquote { border: 3px solid #000; background: #f0f0f0; padding: 12px 16px; }
#bm-md code { background: #ffde59; padding: 2px 6px; border: 2px solid #000; }
#bm-md pre { background: #f0f0f0; padding: 16px; border: 3px solid #000; }
    `
  },
  {
    id: 'newsprint',
    name: 'Newsprint',
    css: `
#bm-md { font-family: "Times New Roman", Times, serif; line-height: 1.6; color: #1a1a1a; column-count: 1; }
#bm-md h1 { font-size: 2.4em; font-weight: 900; border-bottom: 4px double #000; text-transform: uppercase; }
#bm-md h2 { font-size: 1.5em; font-weight: 700; margin-top: 24px; }
#bm-md a { color: #0056b3; text-decoration: underline; }
#bm-md blockquote { border-left: 3px solid #666; padding-left: 16px; font-style: italic; color: #444; }
#bm-md code { background: #f0f0f0; padding: 2px 4px; font-family: "Courier New", monospace; }
#bm-md pre { background: #f8f8f8; padding: 16px; border: 1px solid #ddd; }
    `
  },
  {
    id: 'organic',
    name: 'Organic',
    css: `
#bm-md { font-family: "Segoe UI", Roboto, sans-serif; line-height: 1.8; color: #4a4a4a; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #6b4423; font-weight: 600; }
#bm-md h1 { font-size: 1.8em; }
#bm-md a { color: #8fbc8f; }
#bm-md blockquote { border-left: 4px solid #deb887; background: #faf0e6; padding: 12px 16px; border-radius: 0 8px 8px 0; }
#bm-md code { background: #f5f5dc; padding: 2px 6px; border-radius: 4px; }
#bm-md pre { background: #faf0e6; padding: 16px; border-radius: 8px; }
    `
  },
  {
    id: 'playful-geometric',
    name: 'Playful Geometric',
    css: `
#bm-md { font-family: "Poppins", "Segoe UI", sans-serif; line-height: 1.8; color: #333; }
#bm-md h1 { font-size: 2em; color: #6c5ce7; font-weight: 700; }
#bm-md h2 { font-size: 1.5em; color: #00b894; padding-left: 16px; border-left: 6px solid #fd79a8; }
#bm-md h3 { color: #fdcb6e; }
#bm-md a { color: #e17055; font-weight: 600; }
#bm-md blockquote { border-left: 6px solid #6c5ce7; background: #f8f9fa; padding: 12px 16px; border-radius: 0 12px 12px 0; }
#bm-md code { background: #dfe6e9; padding: 2px 8px; border-radius: 6px; }
#bm-md pre { background: #2d3436; color: #dfe6e9; padding: 16px; border-radius: 12px; }
    `
  },
  {
    id: 'sketch',
    name: 'Sketch',
    css: `
#bm-md { font-family: "Segoe UI", sans-serif; line-height: 1.8; color: #333; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #2c3e50; font-weight: 600; }
#bm-md h1 { font-size: 1.8em; border-bottom: 2px dashed #3498db; padding-bottom: 8px; }
#bm-md h2 { font-size: 1.4em; }
#bm-md a { color: #3498db; }
#bm-md blockquote { border-left: 4px dashed #e74c3c; background: #fdf2f2; padding: 12px 16px; }
#bm-md code { background: #ecf0f1; padding: 2px 6px; border-radius: 3px; }
#bm-md pre { background: #2c3e50; color: #ecf0f1; padding: 16px; border-radius: 4px; }
    `
  },
  {
    id: 'apple',
    name: 'Apple',
    css: `
#bm-md { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; line-height: 1.6; color: #1d1d1f; letter-spacing: -0.01em; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #1d1d1f; font-weight: 700; letter-spacing: -0.015em; }
#bm-md h1 { font-size: 2.2em; margin-bottom: 0.5em; }
#bm-md h2 { font-size: 1.7em; margin-top: 1.2em; margin-bottom: 0.4em; }
#bm-md a { color: #0066cc; text-decoration: none; }
#bm-md a:hover { text-decoration: underline; }
#bm-md blockquote { border-left: 4px solid #d2d2d7; padding-left: 16px; color: #86868b; font-style: italic; }
#bm-md code { font-family: "SF Mono", Menlo, monospace; font-size: 0.9em; background: #f5f5f7; padding: 2px 6px; border-radius: 4px; color: #1d1d1f; }
#bm-md pre { background: #f5f5f7; padding: 16px; border-radius: 8px; overflow-x: auto; color: #1d1d1f; font-family: "SF Mono", Menlo, monospace; line-height: 1.4; }
#bm-md ul, #bm-md ol { padding-left: 1.5em; }
#bm-md li { margin-bottom: 0.3em; }
    `
  },
  {
    id: 'midnight',
    name: 'Midnight',
    css: `
#bm-md { font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.7; color: #94a3b8; background: #0f172a; padding: 20px; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #e2e8f0; font-weight: 700; letter-spacing: -0.025em; }
#bm-md h1 { font-size: 2.25em; margin-bottom: 0.75em; background: linear-gradient(to right, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; display: inline-block; }
#bm-md h2 { font-size: 1.5em; border-bottom: 1px solid #1e293b; padding-bottom: 0.3em; margin-top: 1.5em; }
#bm-md a { color: #38bdf8; text-decoration: none; transition: color 0.2s; }
#bm-md a:hover { color: #7dd3fc; }
#bm-md blockquote { border-left: 3px solid #38bdf8; background: #1e293b; color: #cbd5e1; padding: 12px 20px; border-radius: 0 4px 4px 0; font-style: italic; }
#bm-md code { font-family: "JetBrains Mono", Consolas, monospace; background: #1e293b; color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; border: 1px solid #334155; }
#bm-md pre { background: #020617; padding: 16px; border-radius: 8px; border: 1px solid #1e293b; overflow-x: auto; }
#bm-md hr { border-color: #334155; margin: 2em 0; }
    `
  },
  {
    id: 'lawning',
    name: 'Lawning',
    css: `
#bm-md { font-family: "Georgia", serif; line-height: 1.8; color: #435046; background: #fdfcf8; padding: 20px; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #2d4536; font-family: -apple-system, sans-serif; font-weight: 600; }
#bm-md h1 { font-size: 2em; border-bottom: 3px solid #abc4b3; padding-bottom: 10px; display: inline-block; padding-right: 20px; }
#bm-md h2 { font-size: 1.5em; color: #4a6c56; margin-top: 1.5em; }
#bm-md a { color: #5c8d70; text-decoration: none; border-bottom: 1px solid #abc4b3; transition: border-color 0.2s; }
#bm-md a:hover { border-bottom-color: #2d4536; }
#bm-md blockquote { border-left: 4px solid #abc4b3; background: #f3f6f4; padding: 16px 20px; font-style: italic; color: #586b5d; border-radius: 8px; }
#bm-md code { background: #e8ede9; color: #2d4536; padding: 2px 6px; border-radius: 4px; font-family: "Menlo", monospace; font-size: 0.9em; }
#bm-md pre { background: #2d4536; color: #e8ede9; padding: 16px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
#bm-md ul li::marker { color: #abc4b3; }
    `
  },
  {
    id: 'novel',
    name: 'Novel',
    css: `
#bm-md { font-family: "Merriweather", "Georgia", serif; line-height: 2; color: #2c2c2c; background: #f9f7f1; padding: 40px; max-width: 700px; margin: 0 auto; letter-spacing: 0.01em; }
#bm-md h1, #bm-md h2, #bm-md h3 { color: #1a1a1a; font-family: "Playfair Display", serif; font-weight: 700; text-align: center; }
#bm-md h1 { font-size: 2.4em; margin-bottom: 1.5em; letter-spacing: 0.05em; margin-top: 1em; }
#bm-md h2 { font-size: 1.6em; margin-top: 2em; margin-bottom: 1em; font-style: italic; font-weight: 400; }
#bm-md p { margin-bottom: 1.5em; text-indent: 2em; text-align: justify; }
#bm-md a { color: #8b4513; text-decoration: underline; text-underline-offset: 4px; }
#bm-md blockquote { border-left: none; padding: 20px 40px; font-style: italic; color: #555; background: transparent; position: relative; text-align: center; }
#bm-md blockquote::before { content: "“"; font-size: 3em; color: #dcdcdc; position: absolute; top: 0; left: 10px; font-family: serif; }
#bm-md code { background: transparent; font-style: italic; color: #555; font-family: inherit; }
#bm-md pre { background: #efebe4; padding: 20px; border: 1px solid #dcdcdc; border-radius: 2px; font-size: 0.9em; line-height: 1.5; font-family: "Courier New", monospace; text-indent: 0; text-align: left; }
#bm-md ul, #bm-md ol { margin-left: 2em; margin-bottom: 1.5em; }
#bm-md li { margin-bottom: 0.5em; }
    `
  },
]

export function getMarkdownStyleCss(styleId: string): string {
  const style = markdownStyles.find(s => s.id === styleId)
  return style?.css || markdownStyles[0].css
}
