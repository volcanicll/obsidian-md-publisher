import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    // Obsidian 官方包只有类型声明，运行时无实现。
    // 在测试中将其解析到本地 stub，以便导入纯函数模块。
    alias: {
      obsidian: path.resolve(dirname, 'tests/obsidian-stub.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // CSS 文本导入（KaTeX / highlight.js 主题）在测试中被置空，
    // 实际样式由 esbuild `.css` text loader 在构建期打包。
    css: false,
  },
})
