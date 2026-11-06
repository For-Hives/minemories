const inlineValue = /=(.*)/s

// Minimal argument parser shared by the commands: `--flag`, `--key value`, `--key=value` and positionals.
/** `valued` lists the options that take a value; every other `--x` is a boolean flag. */
export function parseArgs(args, valued = []) {
	const positionals = []
	const flags = {}
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]
		if (!arg.startsWith('--')) {
			positionals.push(arg)
			continue
		}
		const [name, inline] = arg.slice(2).split(inlineValue)
		if (valued.includes(name)) flags[name] = inline ?? args[++i]
		else flags[name] = true
	}
	return { positionals, flags }
}
