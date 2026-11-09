// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../App'

vi.mock('../auth-client', () => ({
	authClient: { useSession: () => ({ data: null, isPending: false, refetch: async () => undefined }) },
}))

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	localStorage.clear()
	window.history.replaceState(null, '', '/')
})

test('the language suggestion comes after the skip link and the site header in the Tab order', async () => {
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
	vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US', 'en'])
	window.history.replaceState(null, '', '/faq')
	const { container } = render(<App />)
	const card = await screen.findByRole('region', { name: 'Language suggestion' }, { timeout: 10000 })
	const accept = within(card).getByRole('button', { name: 'Switch to English' })
	const skip = container.querySelector('.mm-skip')
	const header = screen.getByRole('banner')
	expect(skip).toBeTruthy()
	expect(skip?.compareDocumentPosition(accept) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
	expect(header.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
	const focusable = [...container.querySelectorAll<HTMLElement>('a[href], button')]
	expect(focusable[0]).toBe(skip)
})
