import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// MINEMORIES_MOD_DIR selects another Gradle root (a port to another Minecraft version), relative to the repository.
const modDir = resolve(root, process.env.MINEMORIES_MOD_DIR ?? 'mod/minemories')
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
