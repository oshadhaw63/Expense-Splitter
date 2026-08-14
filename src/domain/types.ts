// Framework-independent domain types. See AGENTS.md §2: no React, DOM, or
// storage imports are allowed anywhere under src/domain/.

// ---- Identity ----

export type PersonId = string & { readonly __brand: 'PersonId' }

/** Wraps a raw string as a PersonId. Does not validate uniqueness or shape. */
export function asPersonId(raw: string): PersonId {
  return raw as PersonId
}

// ---- Money ----

/** A safe-integer number of cents. 1 LKR = 100 cents (DECISIONS.md §7). */
export type Cents = number & { readonly __brand: 'Cents' }

/**
 * Brands a number as Cents without validation. Reserved for values whose
 * safety has already been established (e.g. by parseMoney, or by arithmetic
 * derived from already-safe Cents). Do not use on unvalidated user input.
 */
export function unsafeCents(value: number): Cents {
  return value as Cents
}

export type MoneyParseErrorCode =
  | 'empty'
  | 'invalid-characters'
  | 'malformed-decimal'
  | 'malformed-grouping'
  | 'too-many-decimals'
  | 'negative'
  | 'unsafe-range'

export interface MoneyParseError {
  readonly code: MoneyParseErrorCode
  readonly message: string
}

// ---- Result ----

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

// ---- Equal split ----

export interface EqualSplitInput {
  readonly totalCents: Cents
  /**
   * The full group, in stable creation order — canonical for remainder
   * allocation (DECISIONS.md §9). Not the caller's selection order.
   */
  readonly groupOrder: readonly PersonId[]
  /** Which of groupOrder participate in this split. Order does not affect the result. */
  readonly participantIds: readonly PersonId[]
}

export interface EqualSplitShare {
  readonly personId: PersonId
  readonly amountCents: Cents
}

export interface EqualSplitOutput {
  readonly totalCents: Cents
  readonly shares: readonly EqualSplitShare[]
}

export type EqualSplitError =
  | { readonly code: 'empty-participants'; readonly message: string }
  | { readonly code: 'duplicate-participants'; readonly message: string; readonly personId: PersonId }
  | { readonly code: 'duplicate-group-order'; readonly message: string; readonly personId: PersonId }
  | { readonly code: 'unknown-participant'; readonly message: string; readonly personId: PersonId }
  | { readonly code: 'non-positive-total'; readonly message: string }

// ---- Exact-amount split ----

export interface ExactSplitInput {
  readonly totalCents: Cents
  readonly participantIds: readonly PersonId[]
  readonly amountsCents: ReadonlyMap<PersonId, Cents>
}

export interface ExactSplitShare {
  readonly personId: PersonId
  readonly amountCents: Cents
}

export interface ExactSplitOutput {
  readonly totalCents: Cents
  readonly shares: readonly ExactSplitShare[]
}

export type ExactSplitError =
  | { readonly code: 'empty-participants'; readonly message: string }
  | { readonly code: 'duplicate-participants'; readonly message: string; readonly personId: PersonId }
  | { readonly code: 'non-positive-total'; readonly message: string }
  | { readonly code: 'missing-share'; readonly message: string; readonly personId: PersonId }
  | { readonly code: 'unexpected-share'; readonly message: string; readonly personId: PersonId }
  | { readonly code: 'invalid-share-amount'; readonly message: string; readonly personId: PersonId }
  | { readonly code: 'share-sum-overflow'; readonly message: string; readonly personId: PersonId }
  | { readonly code: 'no-positive-share'; readonly message: string }
  | {
      readonly code: 'sum-mismatch'
      readonly message: string
      readonly direction: 'short' | 'over'
      readonly diffCents: Cents
    }
