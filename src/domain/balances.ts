import { splitEqually, splitExactly } from './split'
import {
  type BalanceError,
  type Cents,
  type Expense,
  type Person,
  type PersonId,
  type Result,
  err,
  ok,
  unsafeCents,
} from './types'

/**
 * Derives every person's net balance from the complete people and expense
 * lists — never stored, always recomputed (DECISIONS.md §5). People with no
 * expenses still appear, at zero. Every addition/subtraction is checked for
 * safe-integer overflow before being committed; an unsafe running balance is
 * never branded as Cents or returned.
 */
export function calculateBalances(
  people: readonly Person[],
  expenses: readonly Expense[],
): Result<ReadonlyMap<PersonId, Cents>, BalanceError> {
  const balances = new Map<PersonId, number>()
  for (const person of people) {
    balances.set(person.id, 0)
  }
  const peopleIds = new Set(people.map((p) => p.id))
  const groupOrder = people.map((p) => p.id)

  function applyDelta(personId: PersonId, delta: number): BalanceError | undefined {
    const current = balances.get(personId) ?? 0
    const next = current + delta
    if (!Number.isSafeInteger(next)) {
      return { code: 'balance-overflow', message: 'A balance would exceed the safe integer range.', personId }
    }
    balances.set(personId, next)
    return undefined
  }

  for (const expense of expenses) {
    if (!peopleIds.has(expense.payerId)) {
      return err({ code: 'unknown-payer', message: 'Expense payer is not a known person.', expenseId: expense.id })
    }

    let shares: ReadonlyArray<{ readonly personId: PersonId; readonly amountCents: Cents }>

    if (expense.split.kind === 'equal') {
      for (const personId of expense.split.participantIds) {
        if (!peopleIds.has(personId)) {
          return err({
            code: 'unknown-participant',
            message: 'A participant is not a known person.',
            expenseId: expense.id,
            personId,
          })
        }
      }
      const result = splitEqually({
        totalCents: expense.totalCents,
        groupOrder,
        participantIds: expense.split.participantIds,
      })
      if (!result.ok) {
        return err({ code: 'invalid-split', message: result.error.message, expenseId: expense.id })
      }
      shares = result.value.shares
    } else {
      for (const share of expense.split.shares) {
        if (!peopleIds.has(share.personId)) {
          return err({
            code: 'unknown-participant',
            message: 'A participant is not a known person.',
            expenseId: expense.id,
            personId: share.personId,
          })
        }
      }
      const participantIds = expense.split.shares.map((s) => s.personId)
      const amountsCents = new Map(expense.split.shares.map((s) => [s.personId, s.amountCents] as const))
      const result = splitExactly({ totalCents: expense.totalCents, participantIds, amountsCents })
      if (!result.ok) {
        return err({ code: 'invalid-split', message: result.error.message, expenseId: expense.id })
      }
      shares = result.value.shares
    }

    const creditError = applyDelta(expense.payerId, expense.totalCents)
    if (creditError) return err(creditError)

    for (const share of shares) {
      const debitError = applyDelta(share.personId, -share.amountCents)
      if (debitError) return err(debitError)
    }
  }

  const safeBalances = new Map<PersonId, Cents>()
  for (const [personId, value] of balances) {
    safeBalances.set(personId, unsafeCents(value))
  }
  return ok(safeBalances)
}
