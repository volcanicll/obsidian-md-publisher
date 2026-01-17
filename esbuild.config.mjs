import esbuild from 'esbuild'
import process from 'process'
import builtins from 'builtin-modules'
import fs from 'fs'
import path from 'path'

const prod = process.argv[2] === 'production'
const outdir = 'dist'

// Ensure dist directory exists
if (!fs.existsSync(outdir)) {
  fs.mkdirSync(outdir, { recursive: true })
}

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtins,
  ],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: path.join(outdir, 'main.js'),
})

// Copy manifest.json and styles.css to dist
function copyFiles() {
  const filesToCopy = ['manifest.json', 'styles.css']
  for (const file of filesToCopy) {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(outdir, file))
      console.log(`Copied ${file} to ${outdir}/`)
    }
  }
}

if (prod) {
  await context.rebuild()
  copyFiles()
  console.log(`\n✅ Build complete! Output files in ${outdir}/`)
  process.exit(0)
} else {
  await context.watch()
  copyFiles()
  console.log(`\n👀 Watching for changes... Output in ${outdir}/`)
}

