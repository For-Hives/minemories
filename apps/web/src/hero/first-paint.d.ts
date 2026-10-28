/** Sets <html> up for the film before the first paint; returns the function that restores it (class, style and data-* attributes). */
export function prepareRoot(root: HTMLElement, location: { hash: string; search: string }): () => void
