import { describe, expect, it } from 'vitest'
import { addPerson } from './person'
import { addExpense } from './expense'
import { calculateBalances } from './balances'
import { settleExact } from './settle'
import { asExpenseId, asPersonId, unsafeCents } from './types'
import type { Cents, Expense, Person, PersonId } from './types'

describe("the brief's complete scenario", () => {
  it('produces the exact documented balances and a 3-transaction settlement (PROJECT_SPEC.md §5.1)', () => {
    let people: readonly Person[] = []
    const add = (id: string, name: string) => {
      const result = addPerson(people, asPersonId(id), name)
      expect(result.ok).toBe(true)
      if (result.ok) people = result.value
    }
    add('alice', 'Alice')
    add('bob', 'Bob')
    add('carol', 'Carol')
    add('dave', 'Dave')

    const alice = asPersonId('alice')
    const bob = asPersonId('bob')
    const carol = asPersonId('carol')
    const dave = asPersonId('dave')

    let expenses: readonly Expense[] = []

    const add1 = addExpense(people, expenses, asExpenseId('e1'), {
      description: 'Dinner',
      payerId: alice,
      totalCents: unsafeCents(1_200_000),
      split: { kind: 'equal', participantIds: [alice, bob, carol, dave] },
    })
    expect(add1.ok).toBe(true)
    if (add1.ok) expenses = add1.value

    const add2 = addExpense(people, expenses, asExpenseId('e2'), {
      description: 'Hotel',
      payerId: carol,
      totalCents: unsafeCents(1_000_000),
      split: {
        kind: 'exact',
        shares: [
          { personId: alice, amountCents: unsafeCents(333_333) },
          { personId: bob, amountCents: unsafeCents(333_333) },
          { personId: dave, amountCents: unsafeCents(333_334) },
        ],
      },
    })
    expect(add2.ok).toBe(true)
    if (add2.ok) expenses = add2.value

    const add3 = addExpense(people, expenses, asExpenseId('e3'), {
      description: 'Gas',
      payerId: dave,
      totalCents: unsafeCents(600_000),
      split: { kind: 'equal', participantIds: [dave, bob] },
    })
    expect(add3.ok).toBe(true)
    if (add3.ok) expenses = add3.value

    const balancesResult = calculateBalances(people, expenses)
    expect(balancesResult.ok).toBe(true)
    if (!balancesResult.ok) return
    const balances = balancesResult.value

    expect(balances.get(alice)).toBe(566_667)
    expect(balances.get(bob)).toBe(-933_333)
    expect(balances.get(carol)).toBe(700_000)
    expect(balances.get(dave)).toBe(-333_334)

    const sum = [...balances.values()].reduce((total, v) => total + v, 0)
    expect(sum).toBe(0)

    const groupOrder = people.map((p) => p.id)
    const settleResult = settleExact(balances, groupOrder)
    expect(settleResult.ok).toBe(true)
    if (!settleResult.ok) return

    expect(settleResult.value.length).toBe(3)

    const finalBalances = new Map<PersonId, number>(balances)
    for (const transfer of settleResult.value) {
      expect(transfer.amountCents).toBeGreaterThan(0)
      expect(transfer.fromPersonId).not.toBe(transfer.toPersonId)
      // Applying a transfer moves a debtor's balance toward zero (up) and a
      // creditor's balance toward zero (down) — the debtor no longer owes
      // what they just paid; the creditor is no longer owed what they just received.
      finalBalances.set(transfer.fromPersonId, (finalBalances.get(transfer.fromPersonId) ?? 0) + transfer.amountCents)
      finalBalances.set(transfer.toPersonId, (finalBalances.get(transfer.toPersonId) ?? 0) - transfer.amountCents)
    }
    for (const value of finalBalances.values()) {
      expect(value).toBe(0)
    }
  })
})

describe('the documented five-person greedy counterexample (DECISIONS.md §11)', () => {
  it('settles in exactly 3 transactions, not the 4 that greedy alone would produce', () => {
    const alice = asPersonId('alice')
    const bob = asPersonId('bob')
    const carol = asPersonId('carol')
    const dave = asPersonId('dave')
    const erin = asPersonId('erin')
    const groupOrder = [alice, bob, carol, dave, erin]

    const balances = new Map<PersonId, Cents>([
      [alice, unsafeCents(-40_000)],
      [bob, unsafeCents(-30_000)],
      [carol, unsafeCents(20_000)],
      [dave, unsafeCents(20_000)],
      [erin, unsafeCents(30_000)],
    ])

    const result = settleExact(balances, groupOrder)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.length).toBe(3)

    const finalBalances = new Map<PersonId, number>(balances)
    for (const transfer of result.value) {
      expect(transfer.amountCents).toBeGreaterThan(0)
      expect(transfer.fromPersonId).not.toBe(transfer.toPersonId)
      // Applying a transfer moves a debtor's balance toward zero (up) and a
      // creditor's balance toward zero (down) — the debtor no longer owes
      // what they just paid; the creditor is no longer owed what they just received.
      finalBalances.set(transfer.fromPersonId, (finalBalances.get(transfer.fromPersonId) ?? 0) + transfer.amountCents)
      finalBalances.set(transfer.toPersonId, (finalBalances.get(transfer.toPersonId) ?? 0) - transfer.amountCents)
    }
    for (const value of finalBalances.values()) {
      expect(value).toBe(0)
    }
  })
})
