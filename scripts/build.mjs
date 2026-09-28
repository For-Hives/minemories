import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modDir = resolve(root, 'minemories');
const windows = process.platform === 'win32';
const mode = process.argv[2] ?? 'all';

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: windows,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (mode !== 'mod') {
  run('bun', ['run', 'check:front']);
  run('bun', ['run', '--filter', '@minemories/web', 'bundle']);
}
run(windows ? 'gradlew.bat' : './gradlew', ['build'], modDir);
