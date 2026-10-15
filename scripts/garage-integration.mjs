import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const environment = {
	...process.env,
	S3_ENDPOINT: 'http://127.0.0.1:3900',
	S3_BUCKET: 'minemories-integration',
	S3_REGION: 'garage',
	S3_ACCESS_KEY: 'GK0123456789abcdef0123456789abcdef',
	S3_SECRET_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
	GARAGE_TEST_CONTAINER: 'minemories-integration-garage-1',
	RUN_GARAGE_INTEGRATION: '1',
	RUN_GARAGE_HTTP_INTEGRATION: '1',
}

function run(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd: root, env: environment, stdio: 'inherit' })
		child.once('error', reject)
		child.once('exit', code => {
			if (code === 0) resolve()
			else reject(new Error(`${command} exited with code ${code}`))
		})
	})
}

async function waitForGarage(attempts = 60) {
	try {
		const response = await fetch(environment.S3_ENDPOINT, { signal: AbortSignal.timeout(1000) })
		await response.body?.cancel()
		// An anonymous S3 request may be forbidden; a server error still means Garage is starting.
		if (response.status < 500) return
	} catch {
		// A new fixture can refuse connections until its initialization has finished.
	}
	if (attempts === 1) throw new Error('The disposable Garage fixture did not become ready')
	await new Promise(resolve => setTimeout(resolve, 500))
	return waitForGarage(attempts - 1)
}

try {
	await run('docker', ['compose', '-p', 'minemories-integration', 'up', '-d', 'garage'])
	await waitForGarage()
	const bun = process.env.MINEMORIES_TEST_BUN ?? 'bun'
	await run(bun, ['test', 'apps/api/src/session-rpc.test.ts'])
	await run(bun, ['test', 'apps/api/src/timelapse-http.test.ts'])
	await run(bun, ['test', 'apps/api/src/storage-garage.test.ts'])
} finally {
	// Only this disposable fixture project is removed; development Garage/MinIO volumes are untouched.
	await run('docker', ['compose', '-p', 'minemories-integration', 'down', '--volumes'])
}
