import { type Cents, type MoneyParseError, type Result, err, ok, unsafeCents } from './types'

// Rs. 90,000,000,000,000 (PROJECT_SPEC.md A12) — comfortably inside
// Number.MAX_SAFE_INTEGER (9,007,199,254,740,991), so every digit string at
// or below this length converts to a Cents value with no precision loss.
const MAX_CENTS = 9_000_000_000_000_000
const MAX_CENTS_DIGITS = String(MAX_CENTS)

const PREFIX_PATTERN = /^(rs\.?|lkr)\s*/i
const SHAPE_PATTERN = /^(\d+)(?:\.(\d+))?$/
// Standard (Western) thousands grouping: 1-3 leading digits, then any
// number of exactly-3-digit groups. Deliberately rejects South-Asian
// lakh/crore grouping (e.g. "1,23,456") — the brief's LKR examples use
// standard grouping ("1,234.50"), and mixed conventions can't both be
// accepted without silently guessing which one the user meant.
const GROUPING_PATTERN = /^\d{1,3}(,\d{3})*$/

/**
 * Parses a user-typed LKR amount into Cents using only string and integer
 * operations — no parseFloat, no float multiplication, no Math.round(x*100)
 * (DECISIONS.md §7). Rejects negative input; zero is accepted here and left
 * to expense-level validation to reject (see split.ts, which requires a
 * positive total).
 */
export function parseMoney(raw: string): Result<Cents, MoneyParseError> {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return err({ code: 'empty', message: 'Enter an amount.' })
  }

  const withoutPrefix = trimmed.replace(PREFIX_PATTERN, '').trim()
  if (withoutPrefix.startsWith('-')) {
    return err({ code: 'negative', message: 'Amount cannot be negative.' })
  }

  // Validate thousands grouping before commas are removed — once they're
  // stripped, "1,2,3" and "123" are indistinguishable.
  const dotIndex = withoutPrefix.indexOf('.')
  const integerPortion = dotIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, dotIndex)
  const fractionPortion = dotIndex === -1 ? '' : withoutPrefix.slice(dotIndex)

  if (fractionPortion.includes(',')) {
    return err({
      code: 'malformed-grouping',
      message: 'Thousands separators are not allowed after the decimal point.',
    })
  }

  if (integerPortion.includes(',') && !GROUPING_PATTERN.test(integerPortion)) {
    return err({
      code: 'malformed-grouping',
      message: 'Amount has incorrectly grouped thousands separators.',
    })
  }

  const withoutSeparators = integerPortion.replace(/,/g, '') + fractionPortion
  if (withoutSeparators.length === 0) {
    return err({ code: 'empty', message: 'Enter an amount.' })
  }

  if (/[^0-9.]/.test(withoutSeparators)) {
    return err({
      code: 'invalid-characters',
      message: 'Amount may only contain digits, a decimal point, and thousands separators.',
    })
  }

  const match = SHAPE_PATTERN.exec(withoutSeparators)
  if (!match) {
    return err({ code: 'malformed-decimal', message: 'Amount is not a valid decimal number.' })
  }

  const integerDigits = match[1] as string
  const fractionDigits = match[2] ?? ''

  if (fractionDigits.length > 2) {
    return err({ code: 'too-many-decimals', message: 'Amount may have at most two decimal places.' })
  }

  const centsDigits = (integerDigits + fractionDigits.padEnd(2, '0')).replace(/^0+(?=\d)/, '')

  const tooLong = centsDigits.length > MAX_CENTS_DIGITS.length
  const tooLarge = centsDigits.length === MAX_CENTS_DIGITS.length && centsDigits > MAX_CENTS_DIGITS
  if (tooLong || tooLarge) {
    return err({ code: 'unsafe-range', message: 'Amount is too large to represent exactly.' })
  }

  return ok(unsafeCents(Number(centsDigits)))
}

/**
 * Formats Cents (positive, zero, or negative) as an LKR string. Never
 * mutates or reinterprets the stored value — purely a display transform.
 */
export function formatMoney(cents: Cents): string {
  const negative = cents < 0
  const absolute = Math.abs(cents)
  const rupees = Math.floor(absolute / 100)
  const fraction = String(absolute % 100).padStart(2, '0')
  const groupedRupees = String(rupees).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = negative ? '−' : ''
  return `${sign}Rs. ${groupedRupees}.${fraction}`
}
