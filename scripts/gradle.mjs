import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const modDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'mod', 'minemories')
const windows = process.platform === 'win32'
const result = spawnSync(windows ? 'gradlew.bat' : './gradlew', process.argv.slice(2), {
	cwd: modDir,
	stdio: 'inherit',
	shell: windows,
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
