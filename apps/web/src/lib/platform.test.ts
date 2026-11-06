import { expect, test } from 'vitest'
import { detectSystem, isSystem, systemFromText } from './platform'

test('names the system a platform or user-agent string describes', () => {
	expect(systemFromText('Win32')).toBe('windows')
	expect(systemFromText('Windows')).toBe('windows')
	expect(systemFromText('MacIntel')).toBe('mac')
	expect(systemFromText('macOS')).toBe('mac')
	expect(systemFromText('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('mac')
	expect(systemFromText('Darwin')).toBe('mac')
	expect(systemFromText('Linux x86_64')).toBe('linux')
	expect(systemFromText('Mozilla/5.0 (X11; CrOS x86_64)')).toBe('linux')
	expect(systemFromText('Mozilla/5.0 (Linux; Android 14)')).toBe('linux')
	expect(systemFromText('Plan 9')).toBeNull()
	expect(systemFromText('')).toBeNull()
	expect(systemFromText(undefined)).toBeNull()
})

test('the client hint wins over the legacy platform, which wins over the user agent', () => {
	expect(detectSystem({ userAgentData: { platform: 'macOS' }, platform: 'Win32', userAgent: 'X11; Linux' })).toBe('mac')
	expect(detectSystem({ userAgentData: { platform: 'Unknown' }, platform: 'Linux x86_64', userAgent: 'Windows' })).toBe(
		'linux'
	)
	expect(detectSystem({ userAgentData: {}, platform: '', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' })).toBe(
		'mac'
	)
	expect(detectSystem({ platform: 'Win32' })).toBe('windows')
})

test('falls back to Windows when nothing is recognised', () => {
	expect(detectSystem({})).toBe('windows')
	expect(detectSystem({ userAgentData: { platform: 'Plan 9' }, platform: '', userAgent: 'curl/8' })).toBe('windows')
})

test('only the three systems are valid choices', () => {
	expect(['windows', 'mac', 'linux'].every(isSystem)).toBe(true)
	expect(isSystem('beos')).toBe(false)
	expect(isSystem(undefined)).toBe(false)
})
