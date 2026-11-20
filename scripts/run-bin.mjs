// import { spawnSync } from 'node:child_process'
// import { createRequire } from 'node:module'
// import path from 'node:path'

// const [pkg, bin, ...args] = process.argv.slice(2)
// const require = createRequire(path.join(process.cwd(), 'package.json'))
// const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`))
// const entry = path.join(pkgDir, bin)
// const result = spawnSync(process.execPath, [entry, ...args], { stdio: 'inherit' })

// if (result.error) throw result.error
// process.exit(result.status ?? 1)



import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const [pkg, bin, ...args] = process.argv.slice(2)

if (!pkg || !bin) {
  console.error(
    'Usage: node run-bin.mjs <package> <binary-path> [args...]'
  )
  process.exit(1)
}

// Find package directly through node_modules directories.
// This avoids Node.js package exports resolution.
function findPackageDirectory(packageName) {
  let currentDir = process.cwd()

  while (true) {
    const candidate = path.join(
      currentDir,
      'node_modules',
      packageName
    )

    const packageJsonPath = path.join(
      candidate,
      'package.json'
    )

    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(
        readFileSync(packageJsonPath, 'utf8')
      )

      if (packageJson.name === packageName) {
        return candidate
      }
    }

    const parentDir = path.dirname(currentDir)

    if (parentDir === currentDir) {
      break
    }

    currentDir = parentDir
  }

  return null
}

const pkgDir = findPackageDirectory(pkg)

if (!pkgDir) {
  console.error(`Package not found: ${pkg}`)
  console.error('Searched node_modules directories from:', process.cwd())
  process.exit(1)
}

const entry = path.resolve(pkgDir, bin)

if (!entry.startsWith(path.resolve(pkgDir) + path.sep) ||
    !existsSync(entry)) {
  console.error(`Package entry not found: ${entry}`)
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [entry, ...args],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  }
)

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
