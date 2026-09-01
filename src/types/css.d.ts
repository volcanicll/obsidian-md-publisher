// CSS 通过 esbuild `.css` text loader 打包为字符串。
// 让 TypeScript 将 `*.css` 导入识别为 string。
declare module '*.css' {
  const css: string
  export default css
}
