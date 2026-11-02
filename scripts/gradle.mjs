import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const modDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'mod', 'minemories')
const windows = process.platform === 'win32'
// CI runners are single-use: a daemon or a stored configuration only adds overhead there.
const ciFlags = process.env.CI ? ['-Dorg.gradle.daemon=false', '--no-configuration-cache'] : []
const result = spawnSync(windows ? 'gradlew.bat' : './gradlew', [...ciFlags, ...process.argv.slice(2)], {
	cwd: modDir,
	stdio: 'inherit',
	shell: windows,
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
