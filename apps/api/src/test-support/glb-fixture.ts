export function minimalGlb(binary?: Buffer): Buffer {
	const json = Buffer.from('{"asset":{"version":"2.0"}}')
	const jsonLength = Math.ceil(json.length / 4) * 4
	const binLength = binary ? Math.ceil(binary.length / 4) * 4 : 0
	const total = 20 + jsonLength + (binary ? 8 + binLength : 0)
	const glb = Buffer.alloc(total, 0x20)
	glb.write('glTF', 0, 'ascii')
	glb.writeUInt32LE(2, 4)
	glb.writeUInt32LE(total, 8)
	glb.writeUInt32LE(jsonLength, 12)
	glb.writeUInt32LE(0x4e4f534a, 16)
	json.copy(glb, 20)
	if (binary) {
		const offset = 20 + jsonLength
		glb.writeUInt32LE(binLength, offset)
		glb.writeUInt32LE(0x004e4942, offset + 4)
		binary.copy(glb, offset + 8)
	}
	return glb
}
