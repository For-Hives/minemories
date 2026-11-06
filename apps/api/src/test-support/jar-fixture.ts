import { createHash } from 'node:crypto'

/** Archive ZIP minimale (entrées stockées, sans compression) : assez pour le contrôle du répertoire central. */
export function makeJar(names: string[] = ['dev/minemories/Mod.class', 'fabric.mod.json'], padding = 0): Buffer {
	const locals: Buffer[] = []
	const centrals: Buffer[] = []
	let offset = 0
	for (const name of names) {
		const nameBytes = Buffer.from(name)
		const body = Buffer.from(`content of ${name}`)
		const local = Buffer.alloc(30)
		local.writeUInt32LE(0x04034b50, 0)
		local.writeUInt16LE(20, 4)
		local.writeUInt32LE(body.length, 18)
		local.writeUInt32LE(body.length, 22)
		local.writeUInt16LE(nameBytes.length, 26)
		const central = Buffer.alloc(46)
		central.writeUInt32LE(0x02014b50, 0)
		central.writeUInt16LE(20, 4)
		central.writeUInt16LE(20, 6)
		central.writeUInt32LE(body.length, 20)
		central.writeUInt32LE(body.length, 24)
		central.writeUInt16LE(nameBytes.length, 28)
		central.writeUInt32LE(offset, 42)
		locals.push(local, nameBytes, body)
		centrals.push(central, nameBytes)
		offset += local.length + nameBytes.length + body.length
	}
	const directory = Buffer.concat(centrals)
	const end = Buffer.alloc(22)
	end.writeUInt32LE(0x06054b50, 0)
	end.writeUInt16LE(names.length, 8)
	end.writeUInt16LE(names.length, 10)
	end.writeUInt32LE(directory.length, 12)
	end.writeUInt32LE(offset + padding, 16)
	return Buffer.concat([...locals, Buffer.alloc(padding, 0x61), directory, end])
}

export const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
