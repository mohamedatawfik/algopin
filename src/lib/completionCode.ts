/**
 * MTurk completion-code helpers.
 *
 * The completion code is the token the participant pastes into the MTurk
 * HIT page to prove they finished Phase 1. It is generated once on the
 * client (in `CompletionView`), POSTed to /api/participant/finalize so we
 * can cross-reference the paste against the study database, and displayed
 * verbatim to the participant.
 *
 * Format: `Algopin-mta-XXXXXX`, where `XXXXXX` is a 6-character random
 * suffix drawn uniformly from `A-Z` and `0-9`. `COMPLETION_CODE_REGEX`
 * is the authoritative shape check reused by the frontend and the API
 * validator.
 */

export const COMPLETION_CODE_PREFIX = 'Algopin-mta-'
export const COMPLETION_CODE_SUFFIX_LENGTH = 6
export const COMPLETION_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export const COMPLETION_CODE_REGEX = /^Algopin-mta-[A-Z0-9]{6}$/

function pickRandomChar(alphabet: string): string {
  // Prefer the Web Crypto RNG when available so codes generated in
  // parallel across many browsers don't share a seed. Fall back to
  // Math.random() only in non-browser environments (SSR, tests) where
  // crypto is missing.
  const cryptoObj =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const buf = new Uint32Array(1)
    cryptoObj.getRandomValues(buf)
    return alphabet[buf[0] % alphabet.length]
  }
  return alphabet[Math.floor(Math.random() * alphabet.length)]
}

/**
 * Generate a fresh MTurk completion code in the canonical
 * `Algopin-mta-XXXXXX` format. Each call returns an independent random
 * value.
 */
export function generateCompletionCode(): string {
  let suffix = ''
  for (let i = 0; i < COMPLETION_CODE_SUFFIX_LENGTH; i += 1) {
    suffix += pickRandomChar(COMPLETION_CODE_ALPHABET)
  }
  return `${COMPLETION_CODE_PREFIX}${suffix}`
}

export function isValidCompletionCode(value: unknown): value is string {
  return typeof value === 'string' && COMPLETION_CODE_REGEX.test(value)
}
