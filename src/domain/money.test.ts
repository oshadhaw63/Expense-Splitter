import { describe, expect, it } from 'vitest'
import { formatMoney, parseMoney } from './money'
import type { Cents } from './types'

function expectParsed(raw: string, expectedCents: number) {
  const result = parseMoney(raw)
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.value).toBe(expectedCents)
  }
}

function expectRejected(raw: string, code: string) {
  const result = parseMoney(raw)
  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.error.code).toBe(code)
  }
}

describe('parseMoney — valid input', () => {
  it('parses a plain two-decimal amount', () => expectParsed('1234.56', 123_456))
  it('parses a thousands-grouped amount', () => expectParsed('1,234.50', 123_450))
  it('parses an "Rs." prefixed amount with one decimal', () => expectParsed('Rs. 1234.5', 123_450))
  it('parses a single-cent amount', () => expectParsed('0.01', 1))
  it('parses a whole-rupee amount with no decimal point', () => expectParsed('100', 10_000))
  it('parses zero (zero-rejection is expense-level, not money-level)', () => expectParsed('0', 0))
  it('tolerates surrounding whitespace', () => expectParsed('  42.00  ', 4_200))
})

describe('parseMoney — invalid input', () => {
  it('rejects empty input', () => expectRejected('', 'empty'))
  it('rejects whitespace-only input', () => expectRejected('   ', 'empty'))
  it('rejects letters', () => expectRejected('abc', 'invalid-characters'))
  it('rejects negative amounts', () => expectRejected('-5', 'negative'))
  it('rejects a negative amount after an Rs. prefix', () => expectRejected('Rs. -5', 'negative'))
  it('rejects more than two decimal places (the Math.round(x*100) trap)', () => expectRejected('1.005', 'too-many-decimals'))
  it('rejects a doubled decimal point', () => expectRejected('1.2.3', 'malformed-decimal'))
  it('rejects a trailing decimal point with no digits', () => expectRejected('12.', 'malformed-decimal'))
  it('never returns NaN or Infinity', () => {
    for (const raw of ['', 'abc', '-5', '1.2.3', '1.005', 'Infinity', 'NaN']) {
      const result = parseMoney(raw)
      if (result.ok) {
        expect(Number.isFinite(result.value)).toBe(true)
        expect(Number.isNaN(result.value)).toBe(false)
      }
    }
  })
})

describe('parseMoney — safe-integer boundaries (PROJECT_SPEC.md A12)', () => {
  it('accepts exactly the maximum representable amount', () => expectParsed('90000000000000.00', 9_000_000_000_000_000))
  it('rejects one cent over the maximum', () => expectRejected('90000000000000.01', 'unsafe-range'))
  it('rejects a value with far too many digits', () => expectRejected('999999999999999999', 'unsafe-range'))
})

describe('parseMoney — comma grouping (Codex review finding 5)', () => {
  it('accepts ungrouped digits', () => expectParsed('1234.56', 123_456))
  it('accepts conventional thousands grouping', () => expectParsed('1,234.56', 123_456))
  it('accepts multi-group thousands grouping', () => expectParsed('12,345,678.90', 1_234_567_890))
  it('accepts a single 1-3 digit group before the first comma', () => expectParsed('1,234', 123_400))
  it('accepts grouping with no decimal part at all', () => expectParsed('12,345', 1_234_500))

  it('rejects groups that are not exactly three digits', () => expectRejected('1,2,3', 'malformed-grouping'))
  it('rejects a leading comma', () => expectRejected(',1', 'malformed-grouping'))
  it('rejects a trailing comma', () => expectRejected('1,', 'malformed-grouping'))
  it('rejects a two-digit group', () => expectRejected('12,34', 'malformed-grouping'))
  it('rejects South-Asian lakh-style grouping', () => expectRejected('1,23,456', 'malformed-grouping'))
  it('rejects a comma appearing after the decimal point', () => expectRejected('1.2,3', 'malformed-grouping'))

  it('still rejects too many decimal places once grouping is valid', () =>
    expectRejected('1,234.567', 'too-many-decimals'))
  it('still rejects a negative grouped amount as negative, not malformed-grouping', () =>
    expectRejected('-1,234.56', 'negative'))
})

describe('formatMoney', () => {
  it('formats a positive amount with thousands grouping', () => {
    expect(formatMoney(123_456 as Cents)).toBe('Rs. 1,234.56')
  })
  it('formats zero', () => {
    expect(formatMoney(0 as Cents)).toBe('Rs. 0.00')
  })
  it('formats a sub-rupee amount', () => {
    expect(formatMoney(1 as Cents)).toBe('Rs. 0.01')
  })
  it('formats a negative amount (for later balance use)', () => {
    expect(formatMoney(-123_456 as Cents)).toBe('−Rs. 1,234.56')
  })
  it('does not mutate the value it formats', () => {
    const value = 123_456 as Cents
    formatMoney(value)
    expect(value).toBe(123_456)
  })

  it('formats the maximum supported safe value with correct grouping', () => {
    expect(formatMoney(9_000_000_000_000_000 as Cents)).toBe('Rs. 90,000,000,000,000.00')
  })
})

describe('parseMoney/formatMoney — round trip (Codex review finding 6)', () => {
  const sampleCents = [
    0, 1, 99, 100, 101, 12_345, 123_456, 1_000_000, 9_999_999, -1, -100, -123_456, 9_000_000_000_000_000,
    -9_000_000_000_000_000,
  ]

  it.each(sampleCents)('parse(format(%i)) === %i', (value) => {
    const formatted = formatMoney(value as Cents)
    const reparsed = parseMoney(formatted.replace('−', '-'))
    if (value < 0) {
      // parseMoney rejects negative input by design (money-level parsing is
      // for user-entered amounts, which are never negative); round-trip is
      // only meaningful for the non-negative amounts a form would accept.
      expect(!reparsed.ok && reparsed.error.code).toBe('negative')
      return
    }
    expect(reparsed.ok).toBe(true)
    if (reparsed.ok) {
      expect(reparsed.value).toBe(value)
    }
  })
})
