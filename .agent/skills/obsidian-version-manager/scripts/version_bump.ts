/**
 * Obsidian Version Bumper Logic
 * Extracted as a reusable skill script.
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'

// Since the skill is invoked from the project root, CWD is the project root.
const rootDir = process.cwd()

interface PackageJson {
  version: string
  [key: string]: unknown
}

interface ManifestJson {
  version: string
  minAppVersion: string
  [key: string]: unknown
}

interface VersionsJson {
  [version: string]: string
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
}

function bumpVersion(version: string, type: 'patch' | 'minor' | 'major'): string {
  const parts = version.split('.').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version format: ${version}`)
  }

  switch (type) {
    case 'major':
      parts[0]++
      parts[1] = 0
      parts[2] = 0
      break
    case 'minor':
      parts[1]++
      parts[2] = 0
      break
    case 'patch':
      parts[2]++
      break
  }

  return parts.join('.')
}

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise(resolve =>
    rl.question(query, ans => {
      rl.close()
      resolve(ans)
    })
  )
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  let bumpType = args[0] as 'patch' | 'minor' | 'major'

  if (!bumpType) {
    console.log('\n🔵 Obsidian Version Manager - Interactive Mode')
    console.log('1. patch (x.x.1) - Bug fixes')
    console.log('2. minor (x.1.0) - New features')
    console.log('3. major (1.0.0) - Breaking changes')
    console.log('0. cancel')
    
    const answer = await askQuestion('\nEnter type (patch/minor/major) or number [patch]: ')
    const input = answer.toLowerCase().trim()
    
    if (input === '0' || input === 'cancel') {
      console.log('Cancelled.')
      process.exit(0)
    }

    if (input === '1') bumpType = 'patch'
    else if (input === '2') bumpType = 'minor'
    else if (input === '3') bumpType = 'major'
    else bumpType = (input || 'patch') as any
  }

  if (!['patch', 'minor', 'major'].includes(bumpType)) {
    console.error('Invalid type. Must be patch, minor, or major.')
    process.exit(1)
  }

  try {
    const packageJsonPath = path.join(rootDir, 'package.json')
    const manifestJsonPath = path.join(rootDir, 'manifest.json')
    const versionsJsonPath = path.join(rootDir, 'versions.json')

    const packageJson = readJson<PackageJson>(packageJsonPath)
    const manifestJson = readJson<ManifestJson>(manifestJsonPath)
    const versionsJson = readJson<VersionsJson>(versionsJsonPath)

    const currentVersion = packageJson.version
    const newVersion = bumpVersion(currentVersion, bumpType)

    console.log(`\n📦 Version bump: ${currentVersion} → ${newVersion}\n`)

    // Update package.json
    packageJson.version = newVersion
    writeJson(packageJsonPath, packageJson)
    console.log(`✅ Updated package.json`)

    // Update manifest.json
    manifestJson.version = newVersion
    writeJson(manifestJsonPath, manifestJson)
    console.log(`✅ Updated manifest.json`)

    // Update versions.json
    versionsJson[newVersion] = manifestJson.minAppVersion
    writeJson(versionsJsonPath, versionsJson)
    console.log(`✅ Updated versions.json`)

    // Git Automation
    console.log(`\n🛠️  Executing Git commands...`)
    
    try {
      const { execSync } = require('child_process')
      
      // Stage files
      execSync(`git add package.json manifest.json versions.json`, { stdio: 'inherit' })
      console.log(`✅ Staged changed files`)

      // Commit
      const commitMsg = `chore: release v${newVersion}`
      execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' })
      console.log(`✅ Committed: ${commitMsg}`)

      // Tag
      execSync(`git tag v${newVersion}`, { stdio: 'inherit' })
      console.log(`✅ Created tag: v${newVersion}`)

      // Push confirmation
      const pushConfirm = await askQuestion('\n🚀 Push to origin branch and tags? (y/n) [y]: ')
      if (pushConfirm.toLowerCase().trim() !== 'n') {
        const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
        console.log(`📡 Pushing to origin ${branch}...`)
        execSync(`git push origin ${branch}`, { stdio: 'inherit' })
        execSync(`git push origin v${newVersion}`, { stdio: 'inherit' })
        console.log(`✅ Successfully pushed branch and tag!`)
      } else {
        console.log(`⌛ Push skipped. You can push manually using:`)
        console.log(`   git push origin $(git rev-parse --abbrev-ref HEAD) && git push origin v${newVersion}`)
      }

      console.log(`\n🎉 Version update and release process completed for ${newVersion}!\n`)
      
    } catch (gitError: any) {
      console.warn(`\n⚠️  Git automation failed, but files were updated.`)
      console.warn(`   Reason: ${gitError.message}`)
      console.log(`\nNext steps (Manual):`)
      console.log(`  1. git add . && git commit -m "chore: release v${newVersion}"`)
      console.log(`  2. git tag v${newVersion}`)
      console.log(`  3. git push origin main && git push origin v${newVersion}`)
    }
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`)
    process.exit(1)
  }
}

main().catch(console.error)
