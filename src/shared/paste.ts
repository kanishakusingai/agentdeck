/** Bracketed paste keeps a multi-line message together in agent TUIs. */
export const asPastedMessage = (text: string): string => (text.includes('\n') ? `\u001b[200~${text}\u001b[201~` : text)
