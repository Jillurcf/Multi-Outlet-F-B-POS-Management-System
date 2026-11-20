import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const [pkg, bin, ...args] = process.argv.slice(2)
const require = createRequire(path.join(process.cwd(), 'package.json'))
const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`))
const entry = path.join(pkgDir, bin)
const result = spawnSync(process.execPath, [entry, ...args], { stdio: 'inherit' })

if (result.error) throw result.error
process.exit(result.status ?? 1)
