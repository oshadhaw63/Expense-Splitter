import { splitEqually, splitExactly } from './split'
import {
  type Expense,
  type ExpenseError,
  type ExpenseId,
  type ExpenseInput,
  type Person,
  type Result,
  err,
  ok,
} from './types'

function validateExpenseInput(people: readonly Person[], input: ExpenseInput): ExpenseError | undefined {
  const peopleIds = new Set(people.map((p) => p.id))

  if (!peopleIds.has(input.payerId)) {
    return { code: 'unknown-payer', message: 'The payer is not a known person.' }
  }

  if (input.split.kind === 'equal') {
    for (const personId of input.split.participantIds) {
      if (!peopleIds.has(personId)) {
        return { code: 'unknown-participant', message: 'A participant is not a known person.', personId }
      }
    }

    const groupOrder = people.map((p) => p.id)
    const result = splitEqually({
      totalCents: input.totalCents,
      groupOrder,
      participantIds: input.split.participantIds,
    })
    if (!result.ok) {
      return { code: 'invalid-equal-split', message: result.error.message, splitError: result.error }
    }
    return undefined
  }

  const participantIds = input.split.shares.map((s) => s.personId)
  for (const personId of participantIds) {
    if (!peopleIds.has(personId)) {
      return { code: 'unknown-participant', message: 'A participant is not a known person.', personId }
    }
  }

  const amountsCents = new Map(input.split.shares.map((s) => [s.personId, s.amountCents] as const))
  const result = splitExactly({ totalCents: input.totalCents, participantIds, amountsCents })
  if (!result.ok) {
    return { code: 'invalid-exact-split', message: result.error.message, splitError: result.error }
  }
  return undefined
}

/** Adds a new expense. Validates the payer, participants, and split before accepting it. */
export function addExpense(
  people: readonly Person[],
  expenses: readonly Expense[],
  id: ExpenseId,
  input: ExpenseInput,
): Result<readonly Expense[], ExpenseError> {
  if (expenses.some((e) => e.id === id)) {
    return err({ code: 'duplicate-expense-id', message: 'That expense id is already in use.' })
  }

  const validationError = validateExpenseInput(people, input)
  if (validationError) {
    return err(validationError)
  }

  return ok([...expenses, { id, ...input }])
}

/** Replaces an existing expense's fields, preserving its id and list position. */
export function editExpense(
  people: readonly Person[],
  expenses: readonly Expense[],
  id: ExpenseId,
  input: ExpenseInput,
): Result<readonly Expense[], ExpenseError> {
  const index = expenses.findIndex((e) => e.id === id)
  if (index === -1) {
    return err({ code: 'expense-not-found', message: 'That expense no longer exists.' })
  }

  const validationError = validateExpenseInput(people, input)
  if (validationError) {
    return err(validationError)
  }

  const next = expenses.slice()
  next[index] = { id, ...input }
  return ok(next)
}

/** Removes an expense by id. */
export function deleteExpense(expenses: readonly Expense[], id: ExpenseId): Result<readonly Expense[], ExpenseError> {
  if (!expenses.some((e) => e.id === id)) {
    return err({ code: 'expense-not-found', message: 'That expense no longer exists.' })
  }
  return ok(expenses.filter((e) => e.id !== id))
}
